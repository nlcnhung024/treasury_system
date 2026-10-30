from datetime import date
from decimal import Decimal
import io
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from app.core.database import get_db
from app.core.security import sanitize_excel_cell
from app.schemas.report import (
    CfoLiquidityResponse,
    WaterfallReportResponse,
    BankBreakdownItem,
    WaterfallComponentItem,
    WaterfallStepItem
)
from app.models.account import BankAccount

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/cfo/daily-liquidity", response_model=CfoLiquidityResponse)
async def get_cfo_daily_liquidity(tax_code: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    """
    Báo cáo CFO (Ông Trần Ngọc Tuấn trước 9h sáng) - Tổng tồn quỹ hợp nhất đầu ngày.
    Truy vấn trực tiếp Database View v_cfo_daily_liquidity hoặc bảng bank_accounts + cash_ledger.
    """
    acc_query = select(BankAccount).where(BankAccount.is_active == True)
    if tax_code:
        acc_query = acc_query.where(BankAccount.tax_code == tax_code)
    
    acc_res = await db.execute(acc_query)
    accounts = acc_res.scalars().all()

    total_bank = sum((a.current_balance for a in accounts), Decimal("0.00"))
    
    # Tiền mặt lấy từ cash_ledger
    cash_query = text("SELECT COALESCE((SELECT running_cash_balance FROM cash_ledger ORDER BY entry_date DESC, cash_entry_id DESC LIMIT 1), 0.00)")
    cash_res = await db.execute(cash_query)
    total_cash = cash_res.scalar_one_or_none() or Decimal("0.00")

    breakdown = [
        BankBreakdownItem(
            bank_code=a.bank_code,
            bank_name=a.bank_name,
            account_number=a.account_number,
            account_holder=a.account_holder,
            balance=a.current_balance
        )
        for a in accounts
    ]

    return CfoLiquidityResponse(
        report_date=date.today(),
        total_consolidated_liquidity=total_bank + total_cash,
        total_bank_balance=total_bank,
        total_cash_on_hand=total_cash,
        bank_breakdown=breakdown
    )

@router.get("/ceo/waterfall", response_model=WaterfallReportResponse)
async def get_ceo_waterfall(
    timeframe: str = Query("MTD", regex="^(WTD|MTD)$"),
    tax_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Báo cáo CEO (Bà Nguyễn Thị Lan Anh) - Biểu đồ Thác nước Waterfall Thu/Chi.
    """
    # Dữ liệu mẫu cấu trúc chuẩn hóa đồng bộ với SAD & api_contracts.yaml
    opening = Decimal("110000000000.00")
    inc1 = WaterfallComponentItem(category_name="Thu bán hàng & Đối tác", amount=Decimal("65000000000.00"))
    exp1 = WaterfallComponentItem(category_name="Chi Nhà cung cấp Thép", amount=Decimal("32000000000.00"))
    closing = opening + inc1.amount - exp1.amount

    steps = [
        WaterfallStepItem(name="Số dư Đầu kỳ", type="OPENING", value=opening),
        WaterfallStepItem(name="Thu bán hàng & Đối tác", type="INCOME", value=inc1.amount),
        WaterfallStepItem(name="Chi Nhà cung cấp Thép", type="EXPENSE", value=exp1.amount),
        WaterfallStepItem(name="Số dư Cuối kỳ", type="CLOSING", value=closing)
    ]

    return WaterfallReportResponse(
        timeframe=timeframe,
        opening_balance=opening,
        income_components=[inc1],
        expense_components=[exp1],
        steps=steps,
        closing_balance=closing
    )

@router.get("/export/excel")
async def export_excel(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    bank_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Xuất bảng giao dịch ra file Excel (.xlsx) chuẩn mực kế toán:
    - Định dạng số tiền #,##0.00 căn phải
    - Ngày DD/MM/YYYY
    - Sanitize chống Formula/CSV Injection triệt để (thêm tiền tố nháy đơn ')
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bao_Cao_Giao_Dich"

    # Header kế toán
    headers = ["STT", "Ngày giao dịch", "Số tài khoản", "Ngân hàng", "Nội dung diễn giải", "Phát sinh Nợ (Chi)", "Phát sinh Có (Thu)", "Số dư lũy kế", "Ghi chú nội bộ"]
    ws.append(headers)

    # Style Header
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # Mẫu dữ liệu demo an toàn có áp dụng sanitize_excel_cell
    sample_rows = [
        [1, "29/10/2026", "111386888", "MBB", sanitize_excel_cell("THANH TOAN TIEN HANG HD 1102"), 250000000.00, 0.00, 45200000000.00, sanitize_excel_cell("Đã duyệt")],
        [2, "29/10/2026", "0071000123456", "VCB", sanitize_excel_cell("KHACH HANG CHUYEN KHOAN"), 0.00, 650000000.00, 45850000000.00, sanitize_excel_cell("Hóa đơn 990")]
    ]

    for row in sample_rows:
        ws.append(row)

    # Format số tiền căn phải và #,##0.00
    for r in range(2, ws.max_row + 1):
        for col_idx in [6, 7, 8]:
            cell = ws.cell(row=r, column=col_idx)
            cell.number_format = '#,##0.00'
            cell.alignment = Alignment(horizontal="right")

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"Bao_cao_giao_dich_{date.today().strftime('%Y%m%d')}.xlsx"
    headers_resp = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers_resp
    )

