import io
import re
import uuid
import hashlib
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_, case
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import verify_file_magic_bytes
from app.core.config import settings
from app.models.credit import CreditStatementFile, CreditFacility, CreditStatementItem, DisbursementDocument, LoanRepaymentHistory
from app.models.audit_log import AuditLog
from app.schemas.credit import (
    CreditStatementFileItem,
    CreditStatementFileDetail,
    CreditStatementItemResponse,
    CreditFacilityItem,
    CreditFacilityCreate,
    CreditFacilityUpdate,
    CreditFacilitySummary,
    BankDebtSummary,
    CreditUploadResponse,
    DisbursementDocumentItem,
    DisbursementDocumentUploadResponse,
    CreditOrganizationItem,
    RepaymentPlanSimulateRequest,
    DebtRepaymentPlanResponse,
    UnreconciledDebtTransactionItem,
    RepaymentReconcileRequest,
    RepaymentReconcileResponse,
    LoanRepaymentHistoryItem,
    RepaymentRollbackResponse,
    LoanInvoiceReconciliationResponse,
)
from app.schemas.common import PaginationMeta
from app.services.credit_ingestion_service import ingest_credit_statement
from app.services.storage_service import save_statement_bytes, read_statement_bytes
from app.services.debt_repayment_service import DebtRepaymentService
from app.services.loan_interest_service import calculate_loan_interest
from app.services.debt_reconciliation_service import DebtReconciliationService
from app.services.invoice_parser_service import parse_xml_invoice_bytes, calculate_loan_invoice_reconciliation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Credit Statements & Loans"])


@router.post("/credit-statements/upload", response_model=CreditUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_credit_statement(
    file: UploadFile = File(...),
    uploaded_by: str = Form("Chị Cẩm Nhung"),
    db: AsyncSession = Depends(get_db),
):
    header_bytes = await file.read(8)
    verify_file_magic_bytes(header_bytes, file.filename or "credit_statement.xlsx")

    remaining_bytes = await file.read()
    full_content = header_bytes + remaining_bytes

    if len(full_content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng file vượt quá giới hạn 25MB.",
        )

    try:
        result = await ingest_credit_statement(
            file_bytes=full_content,
            filename=file.filename or "statement.xlsx",
            uploaded_by=uploaded_by,
            db=db,
        )
        return CreditUploadResponse(**result)
    except ValueError as exc:
        msg = str(exc)
        if "trùng mã băm" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
    except Exception as exc:
        logger.error(f"Lỗi khi xử lý sao kê tín dụng: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi bóc tách sao kê tín dụng: {str(exc)}",
        )


@router.get("/credit-statements", response_model=dict)
async def list_credit_statements(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    count_stmt = select(func.count(CreditStatementFile.file_id))
    total_count = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(CreditStatementFile)
        .order_by(desc(CreditStatementFile.created_at))
        .offset(offset)
        .limit(limit)
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return {
        "data": [CreditStatementFileItem.model_validate(r) for r in records],
        "pagination": PaginationMeta(
            page=(offset // limit) + 1,
            page_size=limit,
            total_records=total_count,
            total_pages=(total_count + limit - 1) // limit if limit > 0 else 1,
        ),
    }


@router.get("/credit-statements/{file_id}", response_model=CreditStatementFileDetail)
async def get_credit_statement_detail(
    file_id: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CreditStatementFile)
        .options(selectinload(CreditStatementFile.items))
        .where(CreditStatementFile.file_id == file_id)
    )
    record = (await db.execute(stmt)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file sao kê tín dụng.")

    return CreditStatementFileDetail(
        file_id=record.file_id,
        file_uuid=record.file_uuid,
        bank_code=record.bank_code,
        template_code=record.template_code,
        original_filename=record.original_filename,
        storage_path=record.storage_path,
        file_size_bytes=record.file_size_bytes,
        file_sha256=record.file_sha256,
        statement_date=record.statement_date,
        total_principal_amount=record.total_principal_amount,
        total_interest_amount=record.total_interest_amount,
        total_payable_amount=record.total_payable_amount,
        calculated_principal_amount=record.calculated_principal_amount,
        total_contracts_count=record.total_contracts_count,
        processing_status=record.processing_status,
        reconciliation_status=record.reconciliation_status,
        discrepancy_amount=record.discrepancy_amount,
        error_message=record.error_message,
        uploaded_by=record.uploaded_by,
        created_at=record.created_at,
        items=[CreditStatementItemResponse.model_validate(it) for it in record.items],
    )


@router.delete("/credit-statements/{file_id}")
async def delete_credit_statement(
    file_id: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CreditStatementFile).where(CreditStatementFile.file_id == file_id)
    record = (await db.execute(stmt)).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file sao kê tín dụng.")

    await db.delete(record)
    await db.commit()
    return {"message": f"Đã xóa thành công file sao kê tín dụng ID #{file_id}."}


# =============================================================================
# KHOẢN VAY & KHẾ ƯỚC NHẬN NỢ (CREDIT FACILITIES)
# =============================================================================

@router.get("/loans", response_model=dict)
async def list_loans(
    bank_code: Optional[str] = Query(None),
    institution_type: Optional[str] = Query(None),
    is_manual: Optional[bool] = Query(None),
    debt_group: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("ACTIVE"),
    search: Optional[str] = Query(None),
    due_within_days: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    filters = [CreditFacility.is_active == True]

    if status_filter:
        filters.append(CreditFacility.status == status_filter)
    if bank_code:
        filters.append(CreditFacility.bank_code == bank_code)
    if institution_type:
        filters.append(CreditFacility.institution_type == institution_type)
    if is_manual is not None:
        filters.append(CreditFacility.is_manual == is_manual)
    if debt_group:
        filters.append(CreditFacility.debt_group == debt_group)
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                CreditFacility.contract_number.ilike(search_pattern),
                CreditFacility.loan_purpose.ilike(search_pattern),
                CreditFacility.borrower_name.ilike(search_pattern),
                CreditFacility.bank_name.ilike(search_pattern),
            )
        )
    if due_within_days is not None:
        today = date.today()
        target_date = today + timedelta(days=due_within_days)
        filters.append(
            and_(
                CreditFacility.next_repayment_date.is_not(None),
                CreditFacility.next_repayment_date <= target_date,
            )
        )

    count_stmt = select(func.count(CreditFacility.loan_id)).where(*filters)
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Subquery đếm số tài liệu hồ sơ giải ngân và tổng tiền hóa đơn XML cho từng khoản vay
    doc_agg_subq = (
        select(
            DisbursementDocument.loan_id,
            func.count(DisbursementDocument.document_id).label("doc_count"),
            func.coalesce(
                func.sum(
                    case(
                        (DisbursementDocument.invoice_total_amount.is_not(None), DisbursementDocument.invoice_total_amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ).label("total_invoices_amount"),
            func.count(
                case(
                    (DisbursementDocument.invoice_total_amount.is_not(None), 1),
                    else_=None,
                )
            ).label("xml_invoice_count"),
        )
        .group_by(DisbursementDocument.loan_id)
        .subquery()
    )

    # Subquery tính tổng tiền đã trả nợ gốc
    repay_agg_subq = (
        select(
            LoanRepaymentHistory.loan_id,
            func.coalesce(func.sum(LoanRepaymentHistory.principal_amount), Decimal("0.00")).label("total_repaid_principal"),
        )
        .group_by(LoanRepaymentHistory.loan_id)
        .subquery()
    )

    stmt = (
        select(
            CreditFacility,
            func.coalesce(doc_agg_subq.c.doc_count, 0).label("dossier_count"),
            func.coalesce(doc_agg_subq.c.total_invoices_amount, Decimal("0.00")).label("total_invoices_amount"),
            func.coalesce(doc_agg_subq.c.xml_invoice_count, 0).label("xml_invoice_count"),
            func.coalesce(repay_agg_subq.c.total_repaid_principal, Decimal("0.00")).label("total_repaid"),
        )
        .outerjoin(doc_agg_subq, CreditFacility.loan_id == doc_agg_subq.c.loan_id)
        .outerjoin(repay_agg_subq, CreditFacility.loan_id == repay_agg_subq.c.loan_id)
        .where(*filters)
        .order_by(CreditFacility.next_repayment_date.asc().nullslast(), desc(CreditFacility.current_principal_balance))
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    data_items = []
    for loan, dossier_count, total_invoices, xml_inv_count, total_repaid in rows:
        item = CreditFacilityItem.model_validate(loan)
        item.dossier_files_count = dossier_count
        item.total_invoices_amount = total_invoices
        # Tính số tiền đã trả nợ gốc (từ subquery hoặc hiệu số giữa gốc ban đầu và gốc hiện tại)
        calculated_repaid = total_repaid if total_repaid > 0 else max(
            Decimal("0.00"),
            (loan.original_principal_balance or loan.current_principal_balance) - loan.current_principal_balance
        )
        item.total_repaid_principal = calculated_repaid

        if xml_inv_count > 0:
            if total_invoices < loan.current_principal_balance:
                item.invoice_reconciliation_status = "DEFICIENT"
                item.invoice_shortage_amount = loan.current_principal_balance - total_invoices
            else:
                item.invoice_reconciliation_status = "SUFFICIENT"
                item.invoice_shortage_amount = Decimal("0.00")
        else:
            item.invoice_reconciliation_status = "NO_INVOICE"
            item.invoice_shortage_amount = Decimal("0.00")

        if item.calculated_interest_due == Decimal("0.00") and item.current_principal_balance > 0:
            item.calculated_interest_due = calculate_loan_interest(
                principal_balance=loan.current_principal_balance,
                annual_interest_rate=loan.interest_rate,
                payment_method=loan.interest_payment_method or "MONTHLY",
                monthly_due_day=loan.monthly_interest_due_day or (5 if loan.bank_code in ("CTG", "CTG_LEASING") else 25),
                disbursement_date=loan.disbursement_date,
                maturity_date=loan.maturity_date,
            )
        data_items.append(item)

    return {
        "data": data_items,
        "pagination": PaginationMeta(
            page=(offset // limit) + 1,
            page_size=limit,
            total_records=total_count,
            total_pages=(total_count + limit - 1) // limit if limit > 0 else 1,
        ),
    }


@router.post("/loans", response_model=CreditFacilityItem, status_code=status.HTTP_201_CREATED)
async def create_manual_loan(
    payload: CreditFacilityCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Tạo mới một khoản nợ / khoản vay lẻ thủ công từ các ngân hàng,
    công ty tài chính, công ty cho thuê tài chính.
    """
    # 1. Kiểm tra xem cặp (bank_code, contract_number) đã tồn tại và đang active chưa
    exist_stmt = select(CreditFacility).where(
        CreditFacility.bank_code == payload.bank_code,
        CreditFacility.contract_number == payload.contract_number,
        CreditFacility.is_active == True,
    )
    existing_loan = (await db.execute(exist_stmt)).scalar_one_or_none()
    if existing_loan:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Khoản vay số hợp đồng '{payload.contract_number}' tại đơn vị '{payload.bank_name}' ({payload.bank_code}) đã tồn tại trong danh mục.",
        )

    # 2. Tính toán tổng số tiền phải trả kỳ tới nếu chưa truyền
    total_repayment = payload.total_repayment_amount
    if total_repayment is None or total_repayment == Decimal("0.00"):
        total_repayment = (payload.next_principal_amount or Decimal("0.00")) + (payload.next_interest_amount or Decimal("0.00"))

    due_day = payload.monthly_interest_due_day
    if not due_day:
        due_day = 5 if payload.bank_code.strip().upper() in ("CTG", "CTG_LEASING") else (payload.disbursement_date.day if payload.disbursement_date else 25)

    orig_principal = payload.original_principal_balance
    if orig_principal is None or orig_principal == Decimal("0.00"):
        orig_principal = payload.current_principal_balance or Decimal("0.00")

    curr_principal = payload.current_principal_balance
    if curr_principal is None:
        curr_principal = orig_principal

    calc_interest = calculate_loan_interest(
        principal_balance=curr_principal,
        annual_interest_rate=payload.interest_rate or Decimal("0.0000"),
        payment_method=payload.interest_payment_method or "MONTHLY",
        monthly_due_day=due_day,
        disbursement_date=payload.disbursement_date,
        maturity_date=payload.maturity_date,
    )

    # 3. Tạo record khoản vay mới
    loan = CreditFacility(
        bank_code=payload.bank_code.strip().upper(),
        bank_name=payload.bank_name.strip(),
        institution_type=payload.institution_type or "BANK",
        contract_number=payload.contract_number.strip(),
        borrower_name=payload.borrower_name.strip(),
        cif_number=payload.cif_number.strip() if payload.cif_number else None,
        loan_purpose=payload.loan_purpose.strip() if payload.loan_purpose else None,
        currency=payload.currency or "VND",
        disbursement_date=payload.disbursement_date,
        maturity_date=payload.maturity_date,
        term=payload.term.strip() if payload.term else None,
        interest_rate=payload.interest_rate or Decimal("0.0000"),
        debt_group=payload.debt_group or "1",
        loan_type=payload.loan_type or "SHORT_TERM",
        is_manual=True,
        note=payload.note,
        interest_payment_method=payload.interest_payment_method or "MONTHLY",
        monthly_interest_due_day=due_day,
        calculated_interest_due=calc_interest,
        original_principal_balance=orig_principal,
        current_principal_balance=curr_principal,
        accrued_interest=calc_interest if (payload.accrued_interest is None or payload.accrued_interest <= Decimal("0.00")) else payload.accrued_interest,
        next_repayment_date=payload.next_repayment_date,
        next_principal_amount=payload.next_principal_amount or Decimal("0.00"),
        next_interest_amount=payload.next_interest_amount or Decimal("0.00"),
        total_repayment_amount=total_repayment,
        status=payload.status or "ACTIVE",
        is_active=True,
    )

    db.add(loan)
    await db.flush()

    # 4. Ghi nhận Audit Log
    audit = AuditLog(
        actor="Chị Cẩm Nhung",
        action="CREATE_MANUAL_LOAN",
        target_entity="credit_facilities",
        target_id=str(loan.loan_id),
        details={
            "contract_number": loan.contract_number,
            "bank_name": loan.bank_name,
            "current_principal_balance": float(loan.current_principal_balance),
            "interest_payment_method": loan.interest_payment_method,
            "monthly_interest_due_day": loan.monthly_interest_due_day,
            "calculated_interest_due": float(loan.calculated_interest_due),
            "institution_type": loan.institution_type,
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(loan)

    res_item = CreditFacilityItem.model_validate(loan)
    res_item.dossier_files_count = 0
    return res_item

    return CreditFacilityItem.model_validate(loan)


@router.get("/loans/summary", response_model=CreditFacilitySummary)
async def get_loans_summary(
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CreditFacility).where(CreditFacility.is_active == True, CreditFacility.status == "ACTIVE")
    all_loans = (await db.execute(stmt)).scalars().all()

    if not all_loans:
        return CreditFacilitySummary()

    today = date.today()
    in_7_days = today + timedelta(days=7)
    in_30_days = today + timedelta(days=30)

    total_principal = Decimal("0.00")
    total_accrued_interest = Decimal("0.00")
    total_upcoming_principal = Decimal("0.00")
    total_upcoming_interest = Decimal("0.00")
    total_due_7days = Decimal("0.00")
    total_due_30days = Decimal("0.00")
    weighted_rate_sum = Decimal("0.00")

    bank_map: dict = {}

    for loan in all_loans:
        total_principal += loan.current_principal_balance
        total_accrued_interest += loan.accrued_interest
        total_upcoming_principal += loan.next_principal_amount
        total_upcoming_interest += loan.next_interest_amount

        weighted_rate_sum += loan.current_principal_balance * loan.interest_rate

        due_date = loan.next_repayment_date
        total_due = loan.total_repayment_amount
        if due_date:
            if due_date <= in_7_days:
                total_due_7days += total_due
            if due_date <= in_30_days:
                total_due_30days += total_due

        b_code = loan.bank_code
        if b_code not in bank_map:
            bank_map[b_code] = {
                "bank_code": b_code,
                "bank_name": loan.bank_name,
                "loans_count": 0,
                "total_principal_balance": Decimal("0.00"),
                "total_accrued_interest": Decimal("0.00"),
                "upcoming_principal_due": Decimal("0.00"),
                "upcoming_interest_due": Decimal("0.00"),
                "weighted_sum": Decimal("0.00"),
            }
        b_entry = bank_map[b_code]
        b_entry["loans_count"] += 1
        b_entry["total_principal_balance"] += loan.current_principal_balance
        b_entry["total_accrued_interest"] += loan.accrued_interest
        b_entry["upcoming_principal_due"] += loan.next_principal_amount
        b_entry["upcoming_interest_due"] += loan.next_interest_amount
        b_entry["weighted_sum"] += loan.current_principal_balance * loan.interest_rate

    overall_weighted_rate = (weighted_rate_sum / total_principal).quantize(Decimal("0.0001")) if total_principal > 0 else Decimal("0.0000")

    by_bank_list = []
    for b_code, b_data in bank_map.items():
        b_prin = b_data["total_principal_balance"]
        b_rate = (b_data["weighted_sum"] / b_prin).quantize(Decimal("0.0001")) if b_prin > 0 else Decimal("0.0000")
        by_bank_list.append(
            BankDebtSummary(
                bank_code=b_code,
                bank_name=b_data["bank_name"],
                loans_count=b_data["loans_count"],
                total_principal_balance=b_prin,
                total_accrued_interest=b_data["total_accrued_interest"],
                upcoming_principal_due=b_data["upcoming_principal_due"],
                upcoming_interest_due=b_data["upcoming_interest_due"],
                weighted_avg_interest_rate=b_rate,
            )
        )

    return CreditFacilitySummary(
        total_active_loans=len(all_loans),
        total_principal_balance=total_principal,
        total_accrued_interest=total_accrued_interest,
        total_upcoming_principal_due=total_upcoming_principal,
        total_upcoming_interest_due=total_upcoming_interest,
        total_upcoming_due_7days=total_due_7days,
        total_upcoming_due_30days=total_due_30days,
        weighted_avg_interest_rate=overall_weighted_rate,
        by_bank=by_bank_list,
    )


@router.get("/loans/organizations", response_model=List[CreditOrganizationItem])
async def get_loan_organizations(
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách các tổ chức cấp tín dụng / ngân hàng / cty tài chính / cho thuê
    đã từng có khoản vay trong hệ thống để tự động gợi ý và bổ sung vào dropdown.
    """
    stmt = (
        select(CreditFacility.bank_code, CreditFacility.bank_name, CreditFacility.institution_type)
        .where(CreditFacility.is_active == True)
        .distinct()
    )
    rows = (await db.execute(stmt)).all()

    seen = set()
    result = []
    for row in rows:
        b_code = (row[0] or "").strip().upper()
        b_name = (row[1] or "").strip()
        i_type = (row[2] or "OTHER").strip()
        if b_code and b_code not in seen:
            seen.add(b_code)
            result.append(
                CreditOrganizationItem(
                    bank_code=b_code,
                    bank_name=b_name or b_code,
                    institution_type=i_type,
                )
            )
    return result


@router.get("/loans/repayment-plan", response_model=DebtRepaymentPlanResponse)
async def get_default_repayment_plan(
    monthly_capacity: Optional[Decimal] = Query(None, description="Khả năng chi trả hàng tháng"),
    strategy: str = Query("SPLIT_LARGE_LOANS", description="Chiến lược phân bổ: SPLIT_LARGE_LOANS, AVALANCHE, SNOWBALL, BALANCED"),
    prepayment_penalty_rate: Decimal = Query(Decimal("0.00"), description="Tỷ lệ phí phạt trả trước hạn (mặc định 0%)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy kế hoạch phân bổ trả nợ tín dụng đến hạn và đề xuất trả trước hạn.
    """
    req = RepaymentPlanSimulateRequest(
        capacity_mode="UNIFORM",
        uniform_monthly_capacity=monthly_capacity or Decimal("14000000000.00"),
        strategy=strategy,
        prepayment_penalty_rate=prepayment_penalty_rate,
        mb_tenor_months=6,
        ctg_tenor_months=4,
    )
    return await DebtRepaymentService.simulate_plan(db, req)


@router.post("/loans/repayment-plan/simulate", response_model=DebtRepaymentPlanResponse)
async def simulate_repayment_plan(
    payload: RepaymentPlanSimulateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mô phỏng kế hoạch phân bổ trả nợ tín dụng theo kịch bản tùy chỉnh linh hoạt
    (hỗ trợ khả năng chi trả thay đổi theo mùa vụ từng tháng, điều chỉnh kỳ hạn đảo nợ MB 6T, CTG 4T).
    """
    return await DebtRepaymentService.simulate_plan(db, payload)


def _estimate_contract_interest(principal: Decimal, rate_pct: Decimal, start: Optional[date], end: Optional[date]) -> Decimal:
    """Lãi ước tính = Dư nợ gốc × Lãi suất năm × Số ngày (giải ngân → đáo hạn) / 365."""
    if not start or not end or principal <= 0 or rate_pct <= 0:
        return Decimal("0.00")
    days = Decimal((end - start).days)
    if days <= 0:
        return Decimal("0.00")
    value = principal * (rate_pct / Decimal("100")) * days / Decimal("365")
    return value.quantize(Decimal("0.01"))


@router.get("/loans/contract-details", response_model=dict)
async def list_contract_details(db: AsyncSession = Depends(get_db)):
    """
    Danh sách chi tiết khế ước kèm tổng gốc/lãi đã trả (từ các giao dịch đã đối soát
    trong loan_repayment_history) và lãi ước tính.
    """
    paid_stmt = (
        select(
            LoanRepaymentHistory.loan_id,
            func.coalesce(func.sum(LoanRepaymentHistory.principal_amount), 0),
            func.coalesce(func.sum(LoanRepaymentHistory.interest_amount), 0),
            func.count(LoanRepaymentHistory.repayment_id),
        ).group_by(LoanRepaymentHistory.loan_id)
    )
    paid_map = {
        row[0]: (Decimal(row[1]), Decimal(row[2]), int(row[3]))
        for row in (await db.execute(paid_stmt)).all()
    }

    loans = (
        await db.execute(
            select(CreditFacility).order_by(CreditFacility.bank_code, CreditFacility.disbursement_date, CreditFacility.contract_number)
        )
    ).scalars().all()

    items = []
    for loan in loans:
        original = Decimal(loan.original_principal_balance or 0)
        paid_principal, paid_interest, count = paid_map.get(loan.loan_id, (Decimal("0"), Decimal("0"), 0))
        items.append({
            "loan_id": loan.loan_id,
            "bank_code": loan.bank_code,
            "bank_name": loan.bank_name,
            "contract_number": loan.contract_number,
            "original_principal_balance": str(original),
            "total_principal_paid": str(paid_principal.quantize(Decimal("0.01"))),
            "current_principal_balance": str(Decimal(loan.current_principal_balance or 0)),
            "interest_rate": str(loan.interest_rate),
            "estimated_interest": str(_estimate_contract_interest(original, Decimal(loan.interest_rate or 0), loan.disbursement_date, loan.maturity_date)),
            "total_interest_paid": str(paid_interest.quantize(Decimal("0.01"))),
            "disbursement_date": loan.disbursement_date.isoformat() if loan.disbursement_date else None,
            "maturity_date": loan.maturity_date.isoformat() if loan.maturity_date else None,
            "repayment_count": count,
            "status": loan.status,
        })
    return {"data": items}


@router.get("/loans/{loan_id}/cashflow", response_model=dict)
async def get_loan_cashflow(loan_id: int, db: AsyncSession = Depends(get_db)):
    """
    Bảng dòng tiền trả gốc/lãi của một khế ước, sắp xếp theo thời điểm giao dịch.
    is_overdue = True nếu có trả gốc sau ngày đáo hạn.
    """
    loan = await db.get(CreditFacility, loan_id)
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khế ước")

    rows = (
        await db.execute(
            select(LoanRepaymentHistory)
            .options(selectinload(LoanRepaymentHistory.transaction))
            .where(LoanRepaymentHistory.loan_id == loan_id)
            .order_by(LoanRepaymentHistory.repayment_date, LoanRepaymentHistory.repayment_id)
        )
    ).scalars().all()

    # Dựng lại số dư theo trình tự thời gian (không dùng snapshot lúc đối soát,
    # vì snapshot phụ thuộc thứ tự bấm đối soát chứ không phải thứ tự giao dịch).
    running = Decimal(loan.original_principal_balance or 0)
    items = []
    for r in rows:
        principal = Decimal(r.principal_amount or 0)
        repay_day = r.repayment_date.date() if isinstance(r.repayment_date, datetime) else r.repayment_date
        is_overdue = bool(loan.maturity_date and principal > 0 and repay_day > loan.maturity_date)
        opening = running
        running = (running - principal).quantize(Decimal("0.01"))
        items.append({
            "repayment_id": r.repayment_id,
            "repayment_date": r.repayment_date.isoformat(),
            "repayment_timing": r.repayment_timing,
            "snapshot_date": r.snapshot_date.isoformat() if r.snapshot_date else None,
            "description": r.transaction.description if r.transaction else None,
            "opening_principal": str(opening.quantize(Decimal("0.01"))),
            "total_amount": str(r.total_amount),
            "principal_amount": str(principal),
            "interest_amount": str(r.interest_amount),
            "remaining_principal": str(running),
            "is_overdue": is_overdue,
            "is_over_repaid": running < 0,
        })
    return {
        "loan_id": loan.loan_id,
        "contract_number": loan.contract_number,
        "bank_name": loan.bank_name,
        "maturity_date": loan.maturity_date.isoformat() if loan.maturity_date else None,
        "snapshot_date": loan.snapshot_date.isoformat() if loan.snapshot_date else None,
        "snapshot_principal_balance": str(Decimal(loan.snapshot_principal_balance or 0)),
        "original_principal_balance": str(Decimal(loan.original_principal_balance or 0)),
        "computed_remaining_principal": str(running),
        "stored_current_principal_balance": str(Decimal(loan.current_principal_balance or 0)),
        "data": items,
    }


@router.get("/loans/{loan_id}", response_model=CreditFacilityItem)
async def get_loan_detail(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan = (await db.execute(stmt)).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản vay.")

    # Thống kê hồ sơ và hóa đơn XML
    agg_stmt = (
        select(
            func.count(DisbursementDocument.document_id).label("doc_count"),
            func.coalesce(
                func.sum(
                    case(
                        (DisbursementDocument.invoice_total_amount.is_not(None), DisbursementDocument.invoice_total_amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ).label("total_invoices"),
            func.count(
                case(
                    (DisbursementDocument.invoice_total_amount.is_not(None), 1),
                    else_=None,
                )
            ).label("xml_invoice_count"),
        )
        .where(DisbursementDocument.loan_id == loan_id)
    )
    agg_res = (await db.execute(agg_stmt)).one()
    dossier_count, total_invoices, xml_inv_count = agg_res[0], agg_res[1], agg_res[2]

    item = CreditFacilityItem.model_validate(loan)
    item.dossier_files_count = dossier_count
    item.total_invoices_amount = total_invoices

    # Tính tổng tiền đã trả nợ gốc
    repay_stmt = select(func.coalesce(func.sum(LoanRepaymentHistory.principal_amount), Decimal("0.00"))).where(LoanRepaymentHistory.loan_id == loan_id)
    repaid_amount = (await db.execute(repay_stmt)).scalar() or Decimal("0.00")
    if repaid_amount == Decimal("0.00") and loan.original_principal_balance > loan.current_principal_balance:
        repaid_amount = loan.original_principal_balance - loan.current_principal_balance
    item.total_repaid_principal = repaid_amount
    if xml_inv_count > 0:
        if total_invoices < loan.current_principal_balance:
            item.invoice_reconciliation_status = "DEFICIENT"
            item.invoice_shortage_amount = loan.current_principal_balance - total_invoices
        else:
            item.invoice_reconciliation_status = "SUFFICIENT"
            item.invoice_shortage_amount = Decimal("0.00")
    else:
        item.invoice_reconciliation_status = "NO_INVOICE"
        item.invoice_shortage_amount = Decimal("0.00")
    if item.calculated_interest_due == Decimal("0.00") and item.current_principal_balance > 0:
        item.calculated_interest_due = calculate_loan_interest(
            principal_balance=loan.current_principal_balance,
            annual_interest_rate=loan.interest_rate,
            payment_method=loan.interest_payment_method or "MONTHLY",
            monthly_due_day=loan.monthly_interest_due_day or (5 if loan.bank_code in ("CTG", "CTG_LEASING") else 25),
            disbursement_date=loan.disbursement_date,
            maturity_date=loan.maturity_date,
        )
    return item


@router.put("/loans/{loan_id}", response_model=CreditFacilityItem)
async def update_loan(
    loan_id: int,
    payload: CreditFacilityUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Cập nhật thông tin khoản nợ / khoản vay lẻ.
    Tự động tính toán lại số lãi cần trả theo quy định pháp luật (Thông tư 14/2017/TT-NHNN).
    """
    stmt = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan = (await db.execute(stmt)).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản vay để cập nhật.")

    update_data = payload.model_dump(exclude_unset=True)

    # Nếu cập nhật bank_code hoặc contract_number, kiểm tra trùng lặp
    target_bank = update_data.get("bank_code", loan.bank_code)
    target_contract = update_data.get("contract_number", loan.contract_number)
    if target_bank != loan.bank_code or target_contract != loan.contract_number:
        chk_stmt = select(CreditFacility).where(
            CreditFacility.bank_code == target_bank,
            CreditFacility.contract_number == target_contract,
            CreditFacility.loan_id != loan_id,
            CreditFacility.is_active == True,
        )
        if (await db.execute(chk_stmt)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Số hợp đồng '{target_contract}' tại đơn vị '{target_bank}' đã tồn tại trong hệ thống.",
            )

    for field, val in update_data.items():
        if field == "bank_code" and val:
            setattr(loan, field, val.strip().upper())
        elif field in ("bank_name", "contract_number", "borrower_name") and val:
            setattr(loan, field, val.strip())
        elif field == "interest_payment_method" and val:
            setattr(loan, field, val.strip().upper())
        else:
            setattr(loan, field, val)

    # Tự động tính toán lại total_repayment_amount nếu không truyền
    if "total_repayment_amount" not in update_data:
        loan.total_repayment_amount = (loan.next_principal_amount or Decimal("0.00")) + (loan.next_interest_amount or Decimal("0.00"))

    # Tự động tính toán lại số lãi cần trả theo quy định pháp luật (Thông tư 14/2017/TT-NHNN)
    loan.calculated_interest_due = calculate_loan_interest(
        principal_balance=loan.current_principal_balance,
        annual_interest_rate=loan.interest_rate,
        payment_method=loan.interest_payment_method or "MONTHLY",
        monthly_due_day=loan.monthly_interest_due_day or (5 if loan.bank_code in ("CTG", "CTG_LEASING") else 25),
        disbursement_date=loan.disbursement_date,
        maturity_date=loan.maturity_date,
    )
    # Lãi cộng dồn tự động tính bằng hệ thống theo Thông tư 14
    loan.accrued_interest = loan.calculated_interest_due

    # Ghi nhận Audit Log
    audit = AuditLog(
        actor="Chị Cẩm Nhung",
        action="UPDATE_LOAN",
        target_entity="credit_facilities",
        target_id=str(loan.loan_id),
        details={
            "contract_number": loan.contract_number,
            "interest_payment_method": loan.interest_payment_method,
            "monthly_interest_due_day": loan.monthly_interest_due_day,
            "calculated_interest_due": float(loan.calculated_interest_due),
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(loan)

    count_stmt = select(func.count(DisbursementDocument.document_id)).where(DisbursementDocument.loan_id == loan_id)
    dossier_count = (await db.execute(count_stmt)).scalar() or 0

    res_item = CreditFacilityItem.model_validate(loan)
    res_item.dossier_files_count = dossier_count
    return res_item


@router.delete("/loans/{loan_id}")
async def delete_loan(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Xóa hoặc tất toán khoản vay.
    """
    stmt = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan = (await db.execute(stmt)).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản vay.")

    contract_no = loan.contract_number

    # Kiểm tra xem khoản vay có liên kết tới credit_statement_items không
    item_chk_stmt = select(func.count(CreditStatementItem.item_id)).where(CreditStatementItem.loan_id == loan_id)
    items_count = (await db.execute(item_chk_stmt)).scalar() or 0

    if items_count > 0:
        # Nếu đã có snapshot bóc tách từ file sao kê, chuyển sang trạng thái SETTLED / Inactive để bảo toàn kiểm toán
        loan.is_active = False
        loan.status = "SETTLED"
    else:
        # Nếu là khoản nợ nhập lẻ hoặc chưa có snapshot, xóa hoàn toàn
        await db.delete(loan)

    # Ghi nhận Audit Log
    audit = AuditLog(
        actor="Chị Cẩm Nhung",
        action="DELETE_LOAN",
        target_entity="credit_facilities",
        target_id=str(loan_id),
        details={"contract_number": contract_no},
    )
    db.add(audit)

    await db.commit()
    return {"message": f"Đã xóa thành công khoản vay ID #{loan_id}."}


# =============================================================================
# HỒ SƠ GIẢI NGÂN KHOẢN VAY (DISBURSEMENT DOSSIERS & OBJECT STORAGE)
# =============================================================================

@router.post("/loans/{loan_id}/dossier/upload", response_model=DisbursementDocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_disbursement_document(
    loan_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("DISBURSEMENT_RECORD"),
    description: Optional[str] = Form(None),
    uploaded_by: str = Form("Chị Cẩm Nhung"),
    db: AsyncSession = Depends(get_db),
):
    """
    Tải lên tài liệu chứng từ thuộc Bộ hồ sơ giải ngân của khoản vay lên Object Storage.
    Mỗi khoản vay liên kết với một bộ hồ sơ giải ngân lưu tại Object Storage.
    Hỗ trợ: PDF, JPG, PNG, DOCX, XLSX, ZIP... tối đa 25MB.
    """
    stmt = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan = (await db.execute(stmt)).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản vay để đính kèm hồ sơ giải ngân.")

    content = await file.read()
    file_size = len(content)
    if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dung lượng file vượt quá giới hạn 25MB.")

    if file_size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File tải lên không có nội dung (0 bytes).")

    file_sha256 = hashlib.sha256(content).hexdigest()
    doc_uuid = uuid.uuid4()
    original_filename = file.filename or "disbursement_document.pdf"
    clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', original_filename)

    # Đường dẫn lưu trữ chuẩn Object Storage: disbursement_dossiers/{bank_code}/{contract_number}/{uuid}_{clean_name}
    storage_path = f"disbursement_dossiers/{loan.bank_code}/{loan.contract_number}/{doc_uuid}_{clean_name}"
    content_type = file.content_type or "application/octet-stream"

    # Lưu vào Object Storage (MinIO / Hybrid Local)
    save_statement_bytes(storage_path, content, content_type=content_type)

    # Nếu là hóa đơn XML, bóc tách số hóa đơn và tổng tiền thanh toán
    invoice_number = None
    invoice_total_amount = None
    if original_filename.lower().endswith(".xml") or content_type in ("application/xml", "text/xml"):
        parsed_inv = parse_xml_invoice_bytes(content)
        invoice_number = parsed_inv.get("invoice_number")
        invoice_total_amount = parsed_inv.get("total_amount")

    doc_record = DisbursementDocument(
        document_uuid=doc_uuid,
        loan_id=loan_id,
        file_name=original_filename,
        storage_path=storage_path,
        file_size_bytes=file_size,
        file_sha256=file_sha256,
        mime_type=content_type,
        document_type=document_type,
        description=description,
        invoice_number=invoice_number,
        invoice_total_amount=invoice_total_amount,
        uploaded_by=uploaded_by,
    )
    db.add(doc_record)
    await db.flush()

    audit = AuditLog(
        actor=uploaded_by,
        action="UPLOAD_DISBURSEMENT_DOCUMENT",
        target_entity="disbursement_documents",
        target_id=str(doc_record.document_id),
        details={
            "loan_id": loan_id,
            "contract_number": loan.contract_number,
            "bank_code": loan.bank_code,
            "file_name": original_filename,
            "document_type": document_type,
            "storage_path": storage_path,
            "file_size": file_size,
            "invoice_number": invoice_number,
            "invoice_total_amount": str(invoice_total_amount) if invoice_total_amount else None,
        },
    )
    db.add(audit)
    await db.commit()
    await db.refresh(doc_record)

    return DisbursementDocumentUploadResponse(
        document_id=doc_record.document_id,
        document_uuid=doc_record.document_uuid,
        loan_id=loan_id,
        file_name=doc_record.file_name,
        storage_path=doc_record.storage_path,
        file_size_bytes=doc_record.file_size_bytes,
        document_type=doc_record.document_type,
        invoice_number=doc_record.invoice_number,
        invoice_total_amount=doc_record.invoice_total_amount,
        message=f"Đã lưu thành công tài liệu '{original_filename}' vào bộ hồ sơ giải ngân khoản vay {loan.contract_number}.",
    )


@router.get("/loans/{loan_id}/invoices/reconciliation", response_model=LoanInvoiceReconciliationResponse)
async def get_loan_invoice_reconciliation(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Đối soát tổng giá trị hóa đơn XML với dư nợ gốc của khoản vay.
    Cảnh báo thiếu hóa đơn nếu tổng tiền hóa đơn < dư nợ gốc.
    """
    stmt = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan = (await db.execute(stmt)).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khoản vay.")

    docs_stmt = select(DisbursementDocument).where(DisbursementDocument.loan_id == loan_id)
    documents = (await db.execute(docs_stmt)).scalars().all()

    return calculate_loan_invoice_reconciliation(loan, list(documents))


@router.get("/loans/{loan_id}/dossier", response_model=List[DisbursementDocumentItem])
async def list_disbursement_documents(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách các tài liệu thuộc bộ hồ sơ giải ngân của một khoản vay.
    """
    stmt = (
        select(DisbursementDocument)
        .where(DisbursementDocument.loan_id == loan_id)
        .order_by(desc(DisbursementDocument.created_at))
    )
    records = (await db.execute(stmt)).scalars().all()
    return [DisbursementDocumentItem.model_validate(r) for r in records]


@router.get("/loans/dossier/{document_id}/download")
async def download_disbursement_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Tải file tài liệu chứng từ giải ngân từ Object Storage.
    """
    stmt = select(DisbursementDocument).where(DisbursementDocument.document_id == document_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu giải ngân.")

    try:
        data = read_statement_bytes(doc.storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không còn tồn tại trên kho lưu trữ Object Storage.")

    return StreamingResponse(
        io.BytesIO(data),
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.file_name}"'},
    )


@router.delete("/loans/dossier/{document_id}")
async def delete_disbursement_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Xóa tài liệu khỏi bộ hồ sơ giải ngân của khoản vay.
    """
    stmt = select(DisbursementDocument).where(DisbursementDocument.document_id == document_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu giải ngân để xóa.")

    await db.delete(doc)

    audit = AuditLog(
        actor="Chị Cẩm Nhung",
        action="DELETE_DISBURSEMENT_DOCUMENT",
        target_entity="disbursement_documents",
        target_id=str(document_id),
        details={"storage_path": doc.storage_path, "file_name": doc.file_name, "loan_id": doc.loan_id},
    )
    db.add(audit)
    await db.commit()

    return {"message": f"Đã xóa thành công tài liệu ID #{document_id} khỏi hồ sơ giải ngân."}


# =============================================================================
# ENDPOINTS: ĐỐI SOÁT CHI TRẢ NỢ VÀ GIẢM TRỪ NỢ GỐC (US-07.9)
# =============================================================================

@router.get("/loans/repayment-reconciliations/unreconciled", response_model=dict)
async def get_unreconciled_debt_transactions(
    bank_code: Optional[str] = Query(None, description="Lọc theo mã ngân hàng (CTG, MBB...)"),
    keyword: Optional[str] = Query(None, description="Lọc theo từ khóa khế ước hoặc diễn giải"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách các giao dịch chi từ sao kê ngân hàng đã phân loại là "Trả nợ"
    chưa được đối soát, kèm thông tin gợi ý khế ước bóc tách được từ Regex.
    """
    return await DebtReconciliationService.get_unreconciled_transactions(
        db=db,
        bank_code=bank_code,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/loans/repayment-reconciliations/reconcile",
    response_model=RepaymentReconcileResponse,
    status_code=status.HTTP_200_OK,
)
async def reconcile_debt_transaction(
    payload: RepaymentReconcileRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Thực hiện đối soát giao dịch chi trả nợ:
    - Ràng buộc: Số tiền trả gốc + trả lãi = Tổng số tiền giao dịch
    - Giảm trừ dư nợ gốc tương ứng trên CreditFacility
    - Tự động chuyển trạng thái SETTLED khi dư nợ = 0
    - Ghi nhận vào LoanRepaymentHistory với repayment_date = transaction.transaction_date
    """
    return await DebtReconciliationService.reconcile_transaction(
        db=db,
        payload=payload,
        actor="Chị Cẩm Nhung",
    )


@router.post(
    "/loans/repayment-reconciliations/{repayment_id}/rollback",
    response_model=RepaymentRollbackResponse,
    status_code=status.HTTP_200_OK,
)
async def rollback_debt_reconciliation(
    repayment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Hoàn tác (Rollback) một lần đối soát:
    - Khôi phục lại dư nợ gốc trên khoản vay
    - Khôi phục trạng thái ACTIVE nếu khoản vay đã bị tất toán
    - Xóa bản ghi lịch sử trả nợ
    - Ghi nhận AuditLog
    """
    return await DebtReconciliationService.rollback_repayment(
        db=db,
        repayment_id=repayment_id,
        actor="Chị Cẩm Nhung",
    )


@router.get("/loans/repayment-reconciliations/history", response_model=dict)
async def get_repayment_reconciliation_history(
    loan_id: Optional[int] = Query(None, description="Lọc theo ID khoản vay"),
    bank_code: Optional[str] = Query(None, description="Lọc theo mã ngân hàng"),
    keyword: Optional[str] = Query(None, description="Tìm theo số khế ước, diễn giải sao kê, số ref, ghi chú"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách nhật ký lịch sử các lần đối soát trả nợ trên toàn hệ thống.
    """
    return await DebtReconciliationService.list_repayment_history(
        db=db,
        loan_id=loan_id,
        bank_code=bank_code,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )


@router.get("/loans/{loan_id}/repayments", response_model=dict)
async def get_loan_repayments(
    loan_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách lịch sử trả nợ riêng của một khoản vay cụ thể.
    """
    return await DebtReconciliationService.list_repayment_history(
        db=db,
        loan_id=loan_id,
        limit=limit,
        offset=offset,
    )





