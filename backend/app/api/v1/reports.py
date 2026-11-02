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
    CashFundSummary,
    WaterfallReportResponse,
    BankBreakdownItem,
    WaterfallComponentItem,
    WaterfallStepItem,
)
from app.models.account import BankAccount
from app.models.transaction import BankTransaction
from app.models.statement_file import BankStatementFile
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


async def _compute_cfo_liquidity_data(
    db: AsyncSession,
    timeframe: str = "MTD",
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    exclude_internal_transfers: bool = False,
    tax_code: Optional[str] = None,
    bank_code: Optional[str] = None,
) -> CfoLiquidityResponse:
    acc_query = (
        select(BankAccount)
        .where(BankAccount.is_active == True)
        .order_by(BankAccount.account_type.asc(), BankAccount.bank_code.asc(), BankAccount.account_number.asc())
    )
    if tax_code:
        acc_query = acc_query.where(BankAccount.tax_code == tax_code)
    if bank_code:
        acc_query = acc_query.where(BankAccount.bank_code == bank_code.upper())

    accounts = list((await db.execute(acc_query)).scalars().all())
    account_ids = [a.account_id for a in accounts]

    all_txs: List[BankTransaction] = []
    files_by_acc: Dict[int, List[BankStatementFile]] = {}
    if account_ids:
        tx_query = (
            select(BankTransaction)
            .where(BankTransaction.account_id.in_(account_ids))
            .options(selectinload(BankTransaction.category))
            .order_by(BankTransaction.transaction_date.asc(), BankTransaction.transaction_id.asc())
        )
        all_txs = list((await db.execute(tx_query)).scalars().all())

        file_query = (
            select(BankStatementFile)
            .where(BankStatementFile.account_id.in_(account_ids))
            .order_by(
                BankStatementFile.statement_period_end.desc().nullslast(),
                BankStatementFile.created_at.desc(),
                BankStatementFile.file_id.desc(),
            )
        )
        for sf in (await db.execute(file_query)).scalars().all():
            if sf.account_id is not None:
                files_by_acc.setdefault(sf.account_id, []).append(sf)

    # Xác định ngày mốc (Anchor Date) từ giao dịch ngân hàng mới nhất trong CSDL
    all_dates: List[date] = [tx.transaction_date.astimezone(VN_TZ).date() for tx in all_txs]
    anchor_date = max(all_dates) if all_dates else date.today()
    min_date = min(all_dates) if all_dates else anchor_date.replace(day=1)

    if from_date and to_date:
        p_start, p_end = from_date, to_date
    elif timeframe == "TODAY":
        p_start = from_date or anchor_date
        p_end = to_date or anchor_date
    elif timeframe == "YESTERDAY":
        prev_day = anchor_date - timedelta(days=1)
        p_start = from_date or prev_day
        p_end = to_date or prev_day
    elif timeframe == "WTD":
        p_end = to_date or anchor_date
        monday = p_end - timedelta(days=p_end.weekday())
        p_start = from_date or min(monday, p_end - timedelta(days=6))
    elif timeframe == "ALL":
        p_start = from_date or min_date
        p_end = to_date or anchor_date
    else:  # MTD
        p_end = to_date or anchor_date
        p_start = from_date or p_end.replace(day=1)

    start_dt = datetime.combine(p_start, time.min, tzinfo=VN_TZ)
    end_dt = datetime.combine(p_end, time.max, tzinfo=VN_TZ)

    txs_by_acc: Dict[int, List[BankTransaction]] = {}
    for tx in all_txs:
        txs_by_acc.setdefault(tx.account_id, []).append(tx)

    breakdown: List[BankBreakdownItem] = []
    opening_bank_total = Decimal("0.00")
    closing_bank_total = Decimal("0.00")
    corporate_bank_total = Decimal("0.00")
    special_cash_bank_total = Decimal("0.00")
    bank_gross_inflow = Decimal("0.00")
    bank_gross_outflow = Decimal("0.00")
    bank_internal_inflow = Decimal("0.00")
    bank_internal_outflow = Decimal("0.00")
    internal_tx_count = 0
    discrepancy_count = 0
    unanchored_count = 0
    data_gap_count = 0

    for acc in accounts:
        acc_txs = txs_by_acc.get(acc.account_id, [])
        acc_files = files_by_acc.get(acc.account_id, [])
        latest_file = acc_files[0] if acc_files else None

        before_txs = [t for t in acc_txs if t.transaction_date < start_dt]
        period_txs = [t for t in acc_txs if start_dt <= t.transaction_date <= end_dt]

        has_data_gap = False
        data_gap_desc: Optional[str] = None

        # 1. Kiểm tra không khớp giữa Số dư cuối kỳ trước và Số dư đầu kỳ sau của các file sao kê
        # Bật cảnh báo thuần túy dựa trên việc Số dư cuối kỳ trước ≠ Số dư đầu kỳ sau, không dựa vào khoảng cách ngày/thời gian
        valid_files = [
            f
            for f in acc_files
            if f.statement_period_start
            and f.statement_period_end
            and f.reconciliation_mode not in ("MODE_4_TOTAL_FLOW_ONLY", "MODE_2_INFERRED_OPENING_CLOSING")
        ]
        valid_files.sort(key=lambda x: (x.statement_period_start, x.statement_period_end))

        for i in range(len(valid_files) - 1):
            f_prev = valid_files[i]
            f_next = valid_files[i + 1]
            if f_prev.statement_period_end <= f_next.statement_period_start:
                f_prev_close = (
                    f_prev.header_closing_balance
                    if f_prev.header_closing_balance is not None
                    else f_prev.calculated_closing_balance
                )
                f_next_open = f_next.header_opening_balance
                if f_prev_close is not None and f_next_open is not None and f_prev_close != f_next_open:
                    has_data_gap = True
                    diff = abs(f_next_open - f_prev_close)
                    p_end_str = f_prev.statement_period_end.strftime("%d/%m/%Y")
                    n_start_str = f_next.statement_period_start.strftime("%d/%m/%Y")
                    data_gap_desc = (
                        f"Lệch số dư giữa 2 kỳ sao kê: cuối kỳ trước ({p_end_str}: {f_prev_close:,.0f} VND) "
                        f"≠ đầu kỳ sau ({n_start_str}: {f_next_open:,.0f} VND), chênh lệch {diff:,.0f} VND"
                    )
                    break

        # 2. Kiểm tra khớp số dư giữa giao dịch chốt kỳ trước và mở kỳ hiện tại
        if period_txs:
            first_p_tx = period_txs[0]
            expected_period_open = first_p_tx.running_balance - first_p_tx.credit_amount + first_p_tx.debit_amount
            if before_txs:
                before_close = before_txs[-1].running_balance
                if before_close != expected_period_open:
                    has_data_gap = True
                    gap_amt = abs(expected_period_open - before_close)
                    b_date_str = before_txs[-1].transaction_date.strftime("%d/%m/%Y")
                    p_date_str = first_p_tx.transaction_date.strftime("%d/%m/%Y")
                    data_gap_desc = (
                        f"Số dư cuối kỳ trước ({b_date_str}: {before_close:,.0f} VND) "
                        f"≠ đầu kỳ này ({p_date_str}: {expected_period_open:,.0f} VND), chênh lệch {gap_amt:,.0f} VND"
                    )
                    acc_open = expected_period_open
                else:
                    acc_open = before_close
            else:
                acc_open = expected_period_open
        elif before_txs:
            acc_open = before_txs[-1].running_balance
        else:
            acc_open = acc.opening_balance if acc.opening_balance != Decimal("0.00") else acc.current_balance

        if has_data_gap:
            data_gap_count += 1

        acc_inflow = Decimal("0.00")
        acc_outflow = Decimal("0.00")
        acc_int_in = Decimal("0.00")
        acc_int_out = Decimal("0.00")

        for t in period_txs:
            acc_inflow += t.credit_amount
            acc_outflow += t.debit_amount
            if _is_internal_transfer(t):
                internal_tx_count += 1
                acc_int_in += t.credit_amount
                acc_int_out += t.debit_amount

        acc_close = acc_open + acc_inflow - acc_outflow if acc_txs else acc.current_balance
        net_chg = acc_close - acc_open
        net_chg_pct: Optional[Decimal] = None
        if acc_open != Decimal("0.00"):
            net_chg_pct = ((net_chg / abs(acc_open)) * Decimal("100.00")).quantize(Decimal("0.01"))

        # Kiểm tra trạng thái đối soát & độ tươi dữ liệu
        acc_files = files_by_acc.get(acc.account_id, [])
        latest_file = acc_files[0] if acc_files else None
        recon_status = "BALANCED"
        recon_mode = latest_file.reconciliation_mode if latest_file else None
        disc_amt = Decimal("0.00")

        if not latest_file and not acc_txs:
            recon_status = "NO_STATEMENT"
        elif any(f.reconciliation_status == "DISCREPANCY" for f in acc_files):
            recon_status = "DISCREPANCY"
            disc_amt = sum((f.discrepancy_amount or Decimal("0.00") for f in acc_files if f.reconciliation_status == "DISCREPANCY"), Decimal("0.00"))
            discrepancy_count += 1
        elif (
            recon_mode == "MODE_4_TOTAL_FLOW_ONLY"
            and acc.opening_balance == Decimal("0.00")
            and acc_txs
            and min(t.running_balance for t in acc_txs) < Decimal("0.00")
        ):
            recon_status = "UNANCHORED"
            unanchored_count += 1

        latest_tx_dt = acc_txs[-1].transaction_date if acc_txs else None
        last_up_dt = latest_file.created_at if latest_file else None
        latest_fname = latest_file.original_filename if latest_file else None

        opening_bank_total += acc_open
        closing_bank_total += acc_close
        bank_gross_inflow += acc_inflow
        bank_gross_outflow += acc_outflow
        bank_internal_inflow += acc_int_in
        bank_internal_outflow += acc_int_out

        if acc.account_type == "SPECIAL_CASH":
            special_cash_bank_total += acc_close
        else:
            corporate_bank_total += acc_close

        breakdown.append(
            BankBreakdownItem(
                account_id=acc.account_id,
                bank_code=acc.bank_code,
                bank_name=acc.bank_name,
                account_number=acc.account_number,
                account_holder=acc.account_holder,
                account_type=acc.account_type,
                tax_code=acc.tax_code,
                opening_balance=acc_open,
                total_inflow=acc_inflow,
                total_outflow=acc_outflow,
                internal_inflow=acc_int_in,
                internal_outflow=acc_int_out,
                balance=acc_close,
                closing_balance=acc_close,
                net_change=net_chg,
                net_change_pct=net_chg_pct,
                share_pct=Decimal("0.00"),
                period_tx_count=len(period_txs),
                reconciliation_status=recon_status,
                reconciliation_mode=recon_mode,
                discrepancy_amount=disc_amt,
                latest_tx_date=latest_tx_dt,
                last_uploaded_at=last_up_dt,
                latest_filename=latest_fname,
                has_data_gap=has_data_gap,
                data_gap_desc=data_gap_desc,
            )
        )

    # Hợp nhất Tồn quỹ chỉ tính từ hệ thống Tài khoản Ngân hàng (Khối 1 Doanh nghiệp + Khối 2 Ủy quyền CEO), không tính phần tiền mặt vào quỹ
    opening_consolidated = opening_bank_total
    closing_consolidated = closing_bank_total
    net_change_consolidated = closing_consolidated - opening_consolidated
    net_change_consolidated_pct: Optional[Decimal] = None
    if opening_consolidated != Decimal("0.00"):
        net_change_consolidated_pct = (
            (net_change_consolidated / abs(opening_consolidated)) * Decimal("100.00")
        ).quantize(Decimal("0.01"))

    gross_inflow = bank_gross_inflow
    gross_outflow = bank_gross_outflow
    total_internal_in = bank_internal_inflow
    total_internal_out = bank_internal_outflow

    external_inflow = max(Decimal("0.00"), gross_inflow - total_internal_in)
    external_outflow = max(Decimal("0.00"), gross_outflow - total_internal_out)

    display_inflow = external_inflow if exclude_internal_transfers else gross_inflow
    display_outflow = external_outflow if exclude_internal_transfers else gross_outflow

    # Cập nhật tỷ trọng % (share_pct) trên Tổng tồn quỹ ngân hàng hợp nhất cuối kỳ
    if closing_consolidated > Decimal("0.00"):
        for item in breakdown:
            if item.closing_balance > Decimal("0.00"):
                item.share_pct = ((item.closing_balance / closing_consolidated) * Decimal("100.00")).quantize(
                    Decimal("0.01")
                )

    return CfoLiquidityResponse(
        report_date=p_end,
        timeframe=timeframe,
        period_start=p_start,
        period_end=p_end,
        exclude_internal_transfers=exclude_internal_transfers,
        internal_transfer_tx_count=internal_tx_count,
        internal_inflow_amount=total_internal_in,
        internal_outflow_amount=total_internal_out,
        opening_consolidated_liquidity=opening_consolidated,
        total_inflow_consolidated=display_inflow,
        total_outflow_consolidated=display_outflow,
        gross_inflow_consolidated=gross_inflow,
        gross_outflow_consolidated=gross_outflow,
        external_inflow_consolidated=external_inflow,
        external_outflow_consolidated=external_outflow,
        total_consolidated_liquidity=closing_consolidated,
        net_change_consolidated=net_change_consolidated,
        net_change_consolidated_pct=net_change_consolidated_pct,
        opening_bank_balance=opening_bank_total,
        total_bank_balance=closing_bank_total,
        corporate_bank_balance=corporate_bank_total,
        special_cash_bank_balance=special_cash_bank_total,
        total_cash_on_hand=Decimal("0.00"),
        cash_summary=None,
        discrepancy_accounts_count=discrepancy_count,
        unanchored_accounts_count=unanchored_count,
        data_gap_accounts_count=data_gap_count,
        bank_breakdown=breakdown,
    )


@router.get("/cfo/daily-liquidity", response_model=CfoLiquidityResponse)
async def get_cfo_daily_liquidity(
    timeframe: str = Query("MTD", pattern="^(TODAY|YESTERDAY|WTD|MTD|ALL|CUSTOM)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    exclude_internal_transfers: bool = Query(False),
    tax_code: Optional[str] = Query(None),
    bank_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Báo cáo CFO (Ông Trần Ngọc Tuấn trước 9h sáng) - Báo cáo Tồn quỹ Hợp nhất Đa kỳ (Khối 1 TK Doanh nghiệp + Khối 2 TK Ủy quyền CEO).
    Bảo toàn tuyệt đối: Số dư đầu kỳ + Tổng Thu - Tổng Chi == Số dư cuối kỳ (Δ = 0.00).
    """
    return await _compute_cfo_liquidity_data(
        db=db,
        timeframe=timeframe,
        from_date=from_date,
        to_date=to_date,
        exclude_internal_transfers=exclude_internal_transfers,
        tax_code=tax_code,
        bank_code=bank_code,
    )


@router.get("/cfo/export-excel")
async def export_cfo_liquidity_excel(
    timeframe: str = Query("MTD", pattern="^(TODAY|YESTERDAY|WTD|MTD|ALL|CUSTOM)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    exclude_internal_transfers: bool = Query(False),
    tax_code: Optional[str] = Query(None),
    bank_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Xuất Báo cáo Tồn quỹ Hợp nhất CFO ra file Excel (.xlsx) chuẩn mực kế toán:
    - Bảng Tổng hợp Tồn quỹ Hợp nhất các Tài khoản Ngân hàng (Khối 1 + Khối 2)
    - Bảo vệ chống Formula Injection thông qua sanitize_excel_cell().
    """
    report = await _compute_cfo_liquidity_data(
        db=db,
        timeframe=timeframe,
        from_date=from_date,
        to_date=to_date,
        exclude_internal_transfers=exclude_internal_transfers,
        tax_code=tax_code,
        bank_code=bank_code,
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bao_Cao_Ton_Quy_CFO"

    title_font = Font(bold=True, size=13, color="1E3A8A")
    subtitle_font = Font(italic=True, size=10, color="475569")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    group_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    group_font = Font(bold=True, size=10, color="1E40AF")
    total_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    total_font = Font(color="FFFFFF", bold=True, size=11)
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    ws.cell(row=1, column=1, value="BÁO CÁO TỒN QUỸ HỢP NHẤT ĐIỀU HÀNH (CFO TREASURY REPORT)").font = title_font
    period_str = f"Kỳ báo cáo: {report.period_start.strftime('%d/%m/%Y') if report.period_start else ''} - {report.period_end.strftime('%d/%m/%Y') if report.period_end else ''} ({report.timeframe})"
    ws.cell(row=2, column=1, value=period_str).font = subtitle_font

    headers = [
        "Khối / Phân nhóm",
        "Mã NH",
        "Tên Ngân hàng",
        "Số tài khoản",
        "Chủ tài khoản / Pháp nhân",
        "Số dư Đầu kỳ (VND)",
        "Tổng Thu trong kỳ (VND)",
        "Tổng Chi trong kỳ (VND)",
        "Số dư Cuối kỳ (VND)",
        "Biến động ròng (+/- VND)",
        "Tỷ trọng (%)",
        "Trạng thái Đối soát",
        "Cập nhật gần nhất",
    ]
    header_row = 4
    for col_idx, h_text in enumerate(headers, start=1):
        c = ws.cell(row=header_row, column=col_idx, value=h_text)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border

    curr_row = 5

    def _write_account_row(row_idx: int, group_label: str, item: BankBreakdownItem):
        ws.cell(row=row_idx, column=1, value=sanitize_excel_cell(group_label)).border = thin_border
        ws.cell(row=row_idx, column=2, value=sanitize_excel_cell(item.bank_code)).border = thin_border
        ws.cell(row=row_idx, column=3, value=sanitize_excel_cell(item.bank_name)).border = thin_border
        ws.cell(row=row_idx, column=4, value=sanitize_excel_cell(item.account_number)).border = thin_border
        ws.cell(row=row_idx, column=5, value=sanitize_excel_cell(item.account_holder)).border = thin_border

        for col_i, val in [
            (6, item.opening_balance),
            (7, item.total_inflow),
            (8, item.total_outflow),
            (9, item.closing_balance),
            (10, item.net_change),
        ]:
            c = ws.cell(row=row_idx, column=col_i, value=val)
            c.number_format = "#,##0.00"
            c.border = thin_border

        c_pct = ws.cell(row=row_idx, column=11, value=float(item.share_pct))
        c_pct.number_format = "0.00"
        c_pct.border = thin_border

        ws.cell(row=row_idx, column=12, value=sanitize_excel_cell(item.reconciliation_status)).border = thin_border
        up_str = item.latest_tx_date.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M") if item.latest_tx_date else "—"
        ws.cell(row=row_idx, column=13, value=up_str).border = thin_border

    def _write_subtotal_row(
        row_idx: int,
        label: str,
        open_val: Decimal,
        in_val: Decimal,
        out_val: Decimal,
        close_val: Decimal,
        net_val: Decimal,
        share_val: Decimal,
    ):
        for col_i in range(1, 14):
            cell = ws.cell(row=row_idx, column=col_i)
            cell.fill = group_fill
            cell.font = group_font
            cell.border = thin_border
        ws.cell(row=row_idx, column=1, value=label)
        for col_i, val in [
            (6, open_val),
            (7, in_val),
            (8, out_val),
            (9, close_val),
            (10, net_val),
        ]:
            c = ws.cell(row=row_idx, column=col_i, value=val)
            c.number_format = "#,##0.00"
        c_pct = ws.cell(row=row_idx, column=11, value=float(share_val))
        c_pct.number_format = "0.00"

    corp_items = [b for b in report.bank_breakdown if b.account_type != "SPECIAL_CASH"]
    spec_items = [b for b in report.bank_breakdown if b.account_type == "SPECIAL_CASH"]

    # Khối 1: TK Doanh nghiệp
    for item in corp_items:
        _write_account_row(curr_row, "Khối 1: TK Doanh nghiệp", item)
        curr_row += 1

    _write_subtotal_row(
        curr_row,
        "TIỂU TỔNG KHỐI 1 (TÀI KHOẢN DOANH NGHIỆP)",
        sum((i.opening_balance for i in corp_items), Decimal("0.00")),
        sum((i.total_inflow for i in corp_items), Decimal("0.00")),
        sum((i.total_outflow for i in corp_items), Decimal("0.00")),
        sum((i.closing_balance for i in corp_items), Decimal("0.00")),
        sum((i.net_change for i in corp_items), Decimal("0.00")),
        sum((i.share_pct for i in corp_items), Decimal("0.00")),
    )
    curr_row += 1

    # Khối 2: TK Ủy quyền CEO
    for item in spec_items:
        _write_account_row(curr_row, "Khối 2: TK Ủy quyền CEO", item)
        curr_row += 1

    _write_subtotal_row(
        curr_row,
        "TIỂU TỔNG KHỐI 2 (TÀI KHOẢN ỦY QUYỀN CEO)",
        sum((i.opening_balance for i in spec_items), Decimal("0.00")),
        sum((i.total_inflow for i in spec_items), Decimal("0.00")),
        sum((i.total_outflow for i in spec_items), Decimal("0.00")),
        sum((i.closing_balance for i in spec_items), Decimal("0.00")),
        sum((i.net_change for i in spec_items), Decimal("0.00")),
        sum((i.share_pct for i in spec_items), Decimal("0.00")),
    )
    curr_row += 1

    # Dòng Tổng cộng Hợp nhất Toàn hệ thống (Khối 1 + Khối 2)
    for col_i in range(1, 14):
        cell = ws.cell(row=curr_row, column=col_i)
        cell.fill = total_fill
        cell.font = total_font
        cell.border = thin_border
    ws.cell(row=curr_row, column=1, value="TỔNG CỘNG TỒN QUỸ HỢP NHẤT (KHỐI 1 + KHỐI 2)")
    for col_i, val in [
        (6, report.opening_consolidated_liquidity),
        (7, report.total_inflow_consolidated),
        (8, report.total_outflow_consolidated),
        (9, report.total_consolidated_liquidity),
        (10, report.net_change_consolidated),
    ]:
        c = ws.cell(row=curr_row, column=col_i, value=val)
        c.number_format = "#,##0.00"
    ws.cell(row=curr_row, column=11, value=100.00).number_format = "0.00"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Bao_Cao_Ton_Quy_CFO.xlsx"'},
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
        "Đối tác (Thụ hưởng/Chuyển)",
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
        stmt = stmt.where(
            or_(
                BankTransaction.description.ilike(f"%{keyword.strip()}%"),
                BankTransaction.counter_party.ilike(f"%{keyword.strip()}%"),
            )
        )

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
        ws.cell(row=row_idx, column=6, value=sanitize_excel_cell(t.counter_party or ""))
        ws.cell(row=row_idx, column=7, value=sanitize_excel_cell(t.description))
        ws.cell(row=row_idx, column=8, value=sanitize_excel_cell(cat.category_name if cat else "Chưa phân loại"))

        c_debit = ws.cell(row=row_idx, column=9, value=t.debit_amount)
        c_credit = ws.cell(row=row_idx, column=10, value=t.credit_amount)
        c_bal = ws.cell(row=row_idx, column=11, value=t.running_balance)
        c_debit.number_format = "#,##0.00"
        c_credit.number_format = "#,##0.00"
        c_bal.number_format = "#,##0.00"

        ws.cell(row=row_idx, column=12, value=sanitize_excel_cell(t.internal_note or ""))

        total_debit += t.debit_amount
        total_credit += t.credit_amount

    summary_row = len(transactions) + 2
    ws.cell(row=summary_row, column=7, value="TỔNG CỘNG").font = Font(bold=True)
    s_debit = ws.cell(row=summary_row, column=9, value=total_debit)
    s_credit = ws.cell(row=summary_row, column=10, value=total_credit)
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
