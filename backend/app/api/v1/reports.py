from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import io
import re
from typing import Optional, Dict, List
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, desc
from sqlalchemy.orm import selectinload
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

from app.core.database import get_db
from app.core.security import sanitize_excel_cell
from app.schemas.report import (
    CfoLiquidityResponse,
    WaterfallReportResponse,
    BankBreakdownItem,
    WaterfallComponentItem,
    WaterfallStepItem,
)
from app.models.account import BankAccount
from app.models.transaction import BankTransaction
from app.models.category_rule import Category

router = APIRouter(prefix="/reports", tags=["Reports"])
VN_TZ = timezone(timedelta(hours=7))

INTERNAL_TRANSFER_PATTERNS = re.compile(
    r"(?i)\b(ctnb|nop\s*tk|nhap\s*quy|mb\s*-\s*vtb|vtb\s*-?\s*88|88\s*mbv)\b"
)


def _is_internal_transfer(tx: BankTransaction) -> bool:
    desc_str = tx.description or ""
    if INTERNAL_TRANSFER_PATTERNS.search(desc_str):
        return True
    if tx.category and "NỘI BỘ" in (tx.category.category_name or "").upper():
        return True
    return False


@router.get("/cfo/daily-liquidity", response_model=CfoLiquidityResponse)
async def get_cfo_daily_liquidity(
    tax_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Báo cáo CFO (Ông Trần Ngọc Tuấn trước 9h sáng) - Tổng tồn quỹ hợp nhất đầu ngày.
    """
    acc_query = select(BankAccount).where(BankAccount.is_active == True).order_by(BankAccount.account_type.asc(), BankAccount.bank_code.asc())
    if tax_code:
        acc_query = acc_query.where(BankAccount.tax_code == tax_code)

    acc_res = await db.execute(acc_query)
    accounts = list(acc_res.scalars().all())

    total_bank = sum((a.current_balance for a in accounts), Decimal("0.00"))

    cash_query = text(
        "SELECT COALESCE((SELECT running_cash_balance FROM cash_ledger ORDER BY entry_date DESC, cash_entry_id DESC LIMIT 1), 0.00)"
    )
    cash_res = await db.execute(cash_query)
    total_cash = Decimal(str(cash_res.scalar_one_or_none() or "0.00"))

    breakdown = [
        BankBreakdownItem(
            account_id=a.account_id,
            bank_code=a.bank_code,
            bank_name=a.bank_name,
            account_number=a.account_number,
            account_holder=a.account_holder,
            account_type=a.account_type,
            tax_code=a.tax_code,
            opening_balance=a.opening_balance,
            balance=a.current_balance,
        )
        for a in accounts
    ]

    return CfoLiquidityResponse(
        report_date=date.today(),
        total_consolidated_liquidity=total_bank + total_cash,
        total_bank_balance=total_bank,
        total_cash_on_hand=total_cash,
        bank_breakdown=breakdown,
    )


@router.get("/ceo/waterfall", response_model=WaterfallReportResponse)
async def get_ceo_waterfall(
    timeframe: str = Query("MTD", pattern="^(WTD|MTD|CUSTOM)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    exclude_internal_transfers: bool = Query(False),
    tax_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Báo cáo CEO (Bà Nguyễn Thị Lan Anh) - Biểu đồ Thác nước Waterfall Thu/Chi thực tế từ CSDL.
    Tự động neo WTD/MTD theo ngày giao dịch mới nhất trong CSDL, gom các dòng chưa phân loại
    vào nhóm 'Thu/Chi chưa phân loại' để bảo toàn ĐK + Thu - Chi == CK (Δ = 0.00).
    """
    tx_query = (
        select(BankTransaction)
        .join(BankAccount, BankTransaction.account_id == BankAccount.account_id)
        .options(selectinload(BankTransaction.category), selectinload(BankTransaction.account))
        .order_by(BankTransaction.transaction_date.asc(), BankTransaction.transaction_id.asc())
    )
    if tax_code:
        tx_query = tx_query.where(BankAccount.tax_code == tax_code)

    all_txs = list((await db.execute(tx_query)).scalars().all())

    if not all_txs:
        today = date.today()
        return WaterfallReportResponse(
            timeframe=timeframe,
            period_start=from_date or today.replace(day=1),
            period_end=to_date or today,
            exclude_internal_transfers=exclude_internal_transfers,
            excluded_internal_transfers_count=0,
            opening_balance=Decimal("0.00"),
            total_income=Decimal("0.00"),
            total_expense=Decimal("0.00"),
            income_components=[],
            expense_components=[],
            steps=[
                WaterfallStepItem(name="Số dư Đầu kỳ", type="OPENING", value=Decimal("0.00"), color_code="#475569"),
                WaterfallStepItem(name="Số dư Cuối kỳ", type="CLOSING", value=Decimal("0.00"), color_code="#2563EB"),
            ],
            closing_balance=Decimal("0.00"),
        )

    latest_tx_date = max(tx.transaction_date.astimezone(VN_TZ).date() for tx in all_txs)

    if from_date and to_date:
        p_start, p_end = from_date, to_date
    elif timeframe == "WTD":
        p_end = to_date or latest_tx_date
        # Lũy kế tuần (7 ngày gần nhất tính đến ngày giao dịch mới nhất để phản ánh đầy đủ tuần giao dịch)
        monday = p_end - timedelta(days=p_end.weekday())
        p_start = from_date or min(monday, p_end - timedelta(days=6))
    else:  # MTD
        p_end = to_date or latest_tx_date
        p_start = from_date or p_end.replace(day=1)

    start_dt = datetime.combine(p_start, time.min, tzinfo=VN_TZ)
    end_dt = datetime.combine(p_end, time.max, tzinfo=VN_TZ)

    # Tính Số dư Đầu kỳ hợp nhất của các tài khoản tại thời điểm start_dt
    acc_query = select(BankAccount).where(BankAccount.is_active == True)
    if tax_code:
        acc_query = acc_query.where(BankAccount.tax_code == tax_code)
    accounts = list((await db.execute(acc_query)).scalars().all())

    txs_by_account: Dict[int, List[BankTransaction]] = {}
    for tx in all_txs:
        txs_by_account.setdefault(tx.account_id, []).append(tx)

    opening_balance = Decimal("0.00")
    for acc in accounts:
        acc_txs = txs_by_account.get(acc.account_id, [])
        before_txs = [t for t in acc_txs if t.transaction_date < start_dt]
        if before_txs:
            # Giao dịch cuối cùng ngay trước kỳ báo cáo
            opening_balance += before_txs[-1].running_balance
        elif acc_txs:
            # Nội suy từ giao dịch đầu tiên của tài khoản
            first_tx = acc_txs[0]
            inferred_open = first_tx.running_balance - first_tx.credit_amount + first_tx.debit_amount
            opening_balance += inferred_open
        else:
            opening_balance += acc.opening_balance

    # Lọc các giao dịch nằm trong khoảng [start_dt, end_dt]
    period_txs = [t for t in all_txs if start_dt <= t.transaction_date <= end_dt]

    excluded_count = 0
    filtered_txs: List[BankTransaction] = []
    for tx in period_txs:
        if exclude_internal_transfers and _is_internal_transfer(tx):
            excluded_count += 1
            continue
        filtered_txs.append(tx)

    # Gom nhóm theo Danh mục Thu / Chi (bảo toàn 100% dòng chưa phân loại)
    income_map: Dict[str, WaterfallComponentItem] = {}
    expense_map: Dict[str, WaterfallComponentItem] = {}

    for tx in filtered_txs:
        cat: Optional[Category] = tx.category
        if tx.credit_amount > Decimal("0.00"):
            if cat:
                key = f"CAT_{cat.category_id}"
                c_name = cat.category_name
                c_color = cat.color_code or "#10B981"
                c_id = cat.category_id
            else:
                key = "UNCATEGORIZED_INCOME"
                c_name = "Thu khác (Chưa phân loại)"
                c_color = "#10B981"
                c_id = None

            if key not in income_map:
                income_map[key] = WaterfallComponentItem(
                    category_id=c_id, category_name=c_name, color_code=c_color, amount=Decimal("0.00")
                )
            income_map[key].amount += tx.credit_amount

        if tx.debit_amount > Decimal("0.00"):
            if cat:
                key = f"CAT_{cat.category_id}"
                c_name = cat.category_name
                c_color = cat.color_code or "#EF4444"
                c_id = cat.category_id
            else:
                key = "UNCATEGORIZED_EXPENSE"
                c_name = "Chi khác (Chưa phân loại)"
                c_color = "#EF4444"
                c_id = None

            if key not in expense_map:
                expense_map[key] = WaterfallComponentItem(
                    category_id=c_id, category_name=c_name, color_code=c_color, amount=Decimal("0.00")
                )
            expense_map[key].amount += tx.debit_amount

    income_components = sorted(income_map.values(), key=lambda x: x.amount, reverse=True)
    expense_components = sorted(expense_map.values(), key=lambda x: x.amount, reverse=True)

    total_income = sum((c.amount for c in income_components), Decimal("0.00"))
    total_expense = sum((c.amount for c in expense_components), Decimal("0.00"))
    closing_balance = opening_balance + total_income - total_expense

    steps: List[WaterfallStepItem] = [
        WaterfallStepItem(name="Số dư Đầu kỳ", type="OPENING", value=opening_balance, color_code="#475569")
    ]
    for inc in income_components:
        steps.append(
            WaterfallStepItem(name=inc.category_name, type="INCOME", value=inc.amount, color_code=inc.color_code)
        )
    for exp in expense_components:
        steps.append(
            WaterfallStepItem(name=exp.category_name, type="EXPENSE", value=exp.amount, color_code=exp.color_code)
        )
    steps.append(
        WaterfallStepItem(name="Số dư Cuối kỳ", type="CLOSING", value=closing_balance, color_code="#2563EB")
    )

    return WaterfallReportResponse(
        timeframe=timeframe,
        period_start=p_start,
        period_end=p_end,
        exclude_internal_transfers=exclude_internal_transfers,
        excluded_internal_transfers_count=excluded_count,
        opening_balance=opening_balance,
        total_income=total_income,
        total_expense=total_expense,
        income_components=income_components,
        expense_components=expense_components,
        steps=steps,
        closing_balance=closing_balance,
    )


@router.get("/export/excel")
async def export_excel(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    bank_code: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Xuất Báo cáo Excel Chuẩn Mực Kế toán:
    - Định dạng ngày DD/MM/YYYY, tiền tệ #,##0.00
    - Tích hợp sanitize_excel_cell() chống Formula Injection (CSV/Excel Injection)
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bao_Cao_Giao_Dich"

    headers = [
        "STT",
        "Ngân hàng",
        "Số tài khoản",
        "Ngày giao dịch",
        "Số bút toán",
        "Nội dung diễn giải",
        "Danh mục",
        "Phát sinh Nợ (VND)",
        "Phát sinh Có (VND)",
        "Số dư sau GD (VND)",
        "Ghi chú nội bộ",
    ]
    ws.append(headers)

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    stmt = (
        select(BankTransaction)
        .join(BankAccount, BankTransaction.account_id == BankAccount.account_id)
        .options(selectinload(BankTransaction.account), selectinload(BankTransaction.category))
        .order_by(BankTransaction.transaction_date.desc())
    )
    if bank_code:
        stmt = stmt.where(BankAccount.bank_code == bank_code.upper())
    if account_id:
        stmt = stmt.where(BankTransaction.account_id == account_id)
    if category_id is not None:
        if category_id == -1:
            stmt = stmt.where(BankTransaction.category_id.is_(None))
        else:
            stmt = stmt.where(BankTransaction.category_id == category_id)
    if from_date:
        stmt = stmt.where(BankTransaction.transaction_date >= datetime.combine(from_date, time.min, tzinfo=VN_TZ))
    if to_date:
        stmt = stmt.where(BankTransaction.transaction_date <= datetime.combine(to_date, time.max, tzinfo=VN_TZ))
    if keyword and keyword.strip():
        stmt = stmt.where(BankTransaction.description.ilike(f"%{keyword.strip()}%"))

    res = await db.execute(stmt)
    transactions = list(res.scalars().all())

    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")

    for idx, t in enumerate(transactions, start=1):
        acc = t.account
        cat = t.category
        row_idx = idx + 1
        ws.cell(row=row_idx, column=1, value=idx)
        ws.cell(row=row_idx, column=2, value=sanitize_excel_cell(acc.bank_code if acc else ""))
        ws.cell(row=row_idx, column=3, value=sanitize_excel_cell(acc.account_number if acc else ""))
        ws.cell(row=row_idx, column=4, value=t.transaction_date.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M"))
        ws.cell(row=row_idx, column=5, value=sanitize_excel_cell(t.reference_number or ""))
        ws.cell(row=row_idx, column=6, value=sanitize_excel_cell(t.description))
        ws.cell(row=row_idx, column=7, value=sanitize_excel_cell(cat.category_name if cat else "Chưa phân loại"))

        c_debit = ws.cell(row=row_idx, column=8, value=t.debit_amount)
        c_credit = ws.cell(row=row_idx, column=9, value=t.credit_amount)
        c_bal = ws.cell(row=row_idx, column=10, value=t.running_balance)
        c_debit.number_format = "#,##0.00"
        c_credit.number_format = "#,##0.00"
        c_bal.number_format = "#,##0.00"

        ws.cell(row=row_idx, column=11, value=sanitize_excel_cell(t.internal_note or ""))

        total_debit += t.debit_amount
        total_credit += t.credit_amount

    summary_row = len(transactions) + 2
    ws.cell(row=summary_row, column=6, value="TỔNG CỘNG").font = Font(bold=True)
    s_debit = ws.cell(row=summary_row, column=8, value=total_debit)
    s_credit = ws.cell(row=summary_row, column=9, value=total_credit)
    s_debit.font = Font(bold=True)
    s_credit.font = Font(bold=True)
    s_debit.number_format = "#,##0.00"
    s_credit.number_format = "#,##0.00"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Bao_Cao_Sao_Ke_Hop_Nhat.xlsx"'},
    )
