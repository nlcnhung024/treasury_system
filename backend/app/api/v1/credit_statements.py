import io
import re
import json
import uuid
import hashlib
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_, case, text, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import verify_file_magic_bytes
from app.core.config import settings
from app.models.credit import (
    CreditStatementFile,
    CreditFacility,
    CreditStatementItem,
    DisbursementDocument,
    LoanRepaymentHistory,
    DebtRolloverPlanConfig,
)
from app.models.credit_limit import CreditAgreement
from app.api.v1.credit_limits import ensure_credit_limit_seed_data, sync_facilities_to_agreements
from app.models.invoice import Invoice, InvoiceItem, LoanInvoiceAllocation
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
    UnreconciledDebtTransactionItem,
    RepaymentReconcileRequest,
    RepaymentReconcileResponse,
    LoanRepaymentHistoryItem,
    RepaymentRollbackResponse,
    LoanInvoiceReconciliationResponse,
    DebtRolloverPlanConfigSchema,
    DebtRolloverPlanConfigUpdate,
)
from app.schemas.common import PaginationMeta
from app.services.credit_ingestion_service import ingest_credit_statement
from app.services.storage_service import save_statement_bytes, read_statement_bytes, delete_statement_file
from app.services.loan_interest_service import calculate_loan_interest
from app.services.debt_reconciliation_service import DebtReconciliationService
from app.services.invoice_parser_service import parse_xml_invoice_bytes, calculate_loan_invoice_reconciliation
from app.services import invoice_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Credit Statements & Loans"])


@router.post("/credit-statements/upload", response_model=CreditUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_credit_statement(
    file: UploadFile = File(...),
    uploaded_by: str = Form("Chị Cẩm Nhung"),
    borrower_name: Optional[str] = Form(None),
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
            borrower_name=borrower_name,
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
    await ensure_credit_limit_seed_data(db)
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

    agreements_rows = (await db.execute(select(CreditAgreement.agreement_id, CreditAgreement.agreement_number))).all()
    agreement_num_map = {r[0]: r[1] for r in agreements_rows}

    data_items = []
    for loan, dossier_count, total_invoices, xml_inv_count, total_repaid in rows:
        item = CreditFacilityItem.model_validate(loan)
        if loan.agreement_id:
            item.agreement_number = agreement_num_map.get(loan.agreement_id)
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
    await sync_facilities_to_agreements(db, target_bank_code=loan.bank_code)

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


async def _ensure_rollover_config_table(db: AsyncSession) -> None:
    """Đảm bảo bảng debt_rollover_plan_configs đã tồn tại trong CSDL trước khi truy vấn."""
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS debt_rollover_plan_configs (
                config_id BIGSERIAL PRIMARY KEY,
                borrower_name VARCHAR(255) NOT NULL DEFAULT 'DEFAULT' UNIQUE,
                horizon_months INTEGER NOT NULL DEFAULT 12,
                default_monthly_ocf DECIMAL(18, 2) NOT NULL DEFAULT 10000000000.00,
                default_rollover_term_months INTEGER NOT NULL DEFAULT 6,
                monthly_ocf_overrides TEXT NOT NULL DEFAULT '{}',
                bank_term_overrides TEXT NOT NULL DEFAULT '{}',
                payoff_contract_numbers TEXT NOT NULL DEFAULT '[]',
                locked_rollover_actions TEXT NOT NULL DEFAULT '[]',
                priority_rules TEXT NOT NULL DEFAULT '[]',
                custom_bank_order TEXT NOT NULL DEFAULT '[]',
                updated_by VARCHAR(100) DEFAULT 'System',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    )
    await db.execute(
        text("ALTER TABLE debt_rollover_plan_configs ADD COLUMN IF NOT EXISTS priority_rules TEXT NOT NULL DEFAULT '[]';")
    )
    await db.execute(
        text("ALTER TABLE debt_rollover_plan_configs ADD COLUMN IF NOT EXISTS custom_bank_order TEXT NOT NULL DEFAULT '[]';")
    )
    await db.commit()


@router.get("/loans/rollover-plan-config", response_model=DebtRolloverPlanConfigSchema)
async def get_rollover_plan_config(
    borrower_name: str = Query("DEFAULT"),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy cấu hình kế hoạch tất toán & đảo nợ hằng tháng (OCF, kỳ hạn ngân hàng, lệnh khóa, tháp ưu tiên)
    """
    await _ensure_rollover_config_table(db)
    stmt = select(DebtRolloverPlanConfig).where(DebtRolloverPlanConfig.borrower_name == borrower_name)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config and borrower_name != "DEFAULT":
        stmt_default = select(DebtRolloverPlanConfig).where(DebtRolloverPlanConfig.borrower_name == "DEFAULT")
        result_default = await db.execute(stmt_default)
        config = result_default.scalar_one_or_none()

    default_rules = [
        {"field": "interest_rate", "direction": "DESC", "enabled": True},
        {"field": "disbursement_date", "direction": "ASC", "enabled": True},
        {"field": "principal", "direction": "DESC", "enabled": True},
        {"field": "maturity_date", "direction": "ASC", "enabled": True},
    ]

    if not config:
        return DebtRolloverPlanConfigSchema(
            borrower_name=borrower_name,
            horizon_months=12,
            default_monthly_ocf=Decimal("10000000000.00"),
            default_rollover_term_months=6,
            monthly_ocf_overrides={},
            bank_term_overrides={},
            payoff_contract_numbers=[],
            locked_rollover_actions=[],
            priority_rules=default_rules,
            custom_bank_order=[],
            updated_by="System",
        )

    try:
        monthly_ocf = json.loads(config.monthly_ocf_overrides) if isinstance(config.monthly_ocf_overrides, str) else config.monthly_ocf_overrides
    except Exception:
        monthly_ocf = {}
    try:
        bank_terms = json.loads(config.bank_term_overrides) if isinstance(config.bank_term_overrides, str) else config.bank_term_overrides
    except Exception:
        bank_terms = {}
    try:
        payoff = json.loads(config.payoff_contract_numbers) if isinstance(config.payoff_contract_numbers, str) else config.payoff_contract_numbers
    except Exception:
        payoff = []
    try:
        locked = json.loads(config.locked_rollover_actions) if isinstance(config.locked_rollover_actions, str) else config.locked_rollover_actions
    except Exception:
        locked = []
    try:
        p_rules = json.loads(config.priority_rules) if isinstance(config.priority_rules, str) else config.priority_rules
    except Exception:
        p_rules = []
    try:
        c_banks = json.loads(config.custom_bank_order) if isinstance(config.custom_bank_order, str) else config.custom_bank_order
    except Exception:
        c_banks = []

    return DebtRolloverPlanConfigSchema(
        config_id=config.config_id,
        borrower_name=config.borrower_name,
        horizon_months=config.horizon_months,
        default_monthly_ocf=config.default_monthly_ocf,
        default_rollover_term_months=config.default_rollover_term_months,
        monthly_ocf_overrides=monthly_ocf or {},
        bank_term_overrides=bank_terms or {},
        payoff_contract_numbers=payoff or [],
        locked_rollover_actions=locked or [],
        priority_rules=p_rules if p_rules else default_rules,
        custom_bank_order=c_banks or [],
        updated_by=config.updated_by,
        updated_at=config.updated_at,
    )


@router.put("/loans/rollover-plan-config", response_model=DebtRolloverPlanConfigSchema)
async def update_rollover_plan_config(
    payload: DebtRolloverPlanConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Cập nhật hoặc khởi tạo cấu hình kế hoạch tất toán & đảo nợ hằng tháng
    """
    await _ensure_rollover_config_table(db)
    borrower = payload.borrower_name or "DEFAULT"
    stmt = select(DebtRolloverPlanConfig).where(DebtRolloverPlanConfig.borrower_name == borrower)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    monthly_ocf_str = json.dumps(payload.monthly_ocf_overrides or {})
    bank_terms_str = json.dumps(payload.bank_term_overrides or {})
    payoff_str = json.dumps(payload.payoff_contract_numbers or [])
    locked_str = json.dumps(payload.locked_rollover_actions or [])
    priority_rules_str = json.dumps(payload.priority_rules or [])
    custom_bank_order_str = json.dumps(payload.custom_bank_order or [])

    if not config:
        config = DebtRolloverPlanConfig(
            borrower_name=borrower,
            horizon_months=payload.horizon_months or 12,
            default_monthly_ocf=payload.default_monthly_ocf or Decimal("10000000000.00"),
            default_rollover_term_months=payload.default_rollover_term_months or 6,
            monthly_ocf_overrides=monthly_ocf_str,
            bank_term_overrides=bank_terms_str,
            payoff_contract_numbers=payoff_str,
            locked_rollover_actions=locked_str,
            priority_rules=priority_rules_str,
            custom_bank_order=custom_bank_order_str,
            updated_by=payload.updated_by or "System",
        )
        db.add(config)
    else:
        if payload.horizon_months is not None:
            config.horizon_months = payload.horizon_months
        if payload.default_monthly_ocf is not None:
            config.default_monthly_ocf = payload.default_monthly_ocf
        if payload.default_rollover_term_months is not None:
            config.default_rollover_term_months = payload.default_rollover_term_months
        if payload.monthly_ocf_overrides is not None:
            config.monthly_ocf_overrides = monthly_ocf_str
        if payload.bank_term_overrides is not None:
            config.bank_term_overrides = bank_terms_str
        if payload.payoff_contract_numbers is not None:
            config.payoff_contract_numbers = payoff_str
        if payload.locked_rollover_actions is not None:
            config.locked_rollover_actions = locked_str
        if payload.priority_rules is not None:
            config.priority_rules = priority_rules_str
        if payload.custom_bank_order is not None:
            config.custom_bank_order = custom_bank_order_str
        if payload.updated_by:
            config.updated_by = payload.updated_by

    await db.commit()
    await db.refresh(config)

    return DebtRolloverPlanConfigSchema(
        config_id=config.config_id,
        borrower_name=config.borrower_name,
        horizon_months=config.horizon_months,
        default_monthly_ocf=config.default_monthly_ocf,
        default_rollover_term_months=config.default_rollover_term_months,
        monthly_ocf_overrides=payload.monthly_ocf_overrides or {},
        bank_term_overrides=payload.bank_term_overrides or {},
        payoff_contract_numbers=payload.payoff_contract_numbers or [],
        locked_rollover_actions=payload.locked_rollover_actions or [],
        priority_rules=payload.priority_rules or [],
        custom_bank_order=payload.custom_bank_order or [],
        updated_by=config.updated_by,
        updated_at=config.updated_at,
    )


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

    # Thống kê hóa đơn bảo đảm đã gán đối soát cho từng khế ước
    alloc_stmt = (
        select(
            LoanInvoiceAllocation.loan_id,
            func.coalesce(func.sum(LoanInvoiceAllocation.allocated_amount), 0),
            func.count(LoanInvoiceAllocation.allocation_id),
        ).group_by(LoanInvoiceAllocation.loan_id)
    )
    alloc_map = {
        row[0]: (Decimal(row[1]), int(row[2]))
        for row in (await db.execute(alloc_stmt)).all()
    }

    # Thống kê hồ sơ giải ngân đã lưu trữ cho từng khế ước
    doc_stmt = (
        select(
            DisbursementDocument.loan_id,
            func.count(DisbursementDocument.document_id),
        ).group_by(DisbursementDocument.loan_id)
    )
    doc_map = {
        row[0]: int(row[1])
        for row in (await db.execute(doc_stmt)).all()
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
        allocated_amt, alloc_count = alloc_map.get(loan.loan_id, (Decimal("0"), 0))

        if alloc_count == 0:
            rec_status = "NO_INVOICE"
        elif allocated_amt >= original and original > 0:
            rec_status = "FULLY_SECURED"
        elif allocated_amt > 0:
            rec_status = "UNDER_SECURED"
        else:
            rec_status = "NO_INVOICE"

        items.append({
            "loan_id": loan.loan_id,
            "bank_id": loan.bank_id,
            "bank_code": loan.bank_code,
            "bank_name": loan.bank_name,
            "contract_number": loan.contract_number,
            "borrower_name": loan.borrower_name,
            "cif_number": loan.cif_number,
            "loan_purpose": loan.loan_purpose,
            "term": loan.term,
            "debt_group": loan.debt_group,
            "loan_type": loan.loan_type,
            "institution_type": loan.institution_type,
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
            "note": loan.note,
            "allocated_invoices_amount": str(allocated_amt.quantize(Decimal("0.01"))),
            "allocated_invoices_count": alloc_count,
            "invoice_reconciliation_status": rec_status,
            "dossier_count": doc_map.get(loan.loan_id, 0),
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


@router.post("/loans/sync-mb-borrowers")
async def sync_mb_borrowers(
    target_borrower_name: str = Form("CONG TY CO PHAN XI MANG SUNRISE"),
    db: AsyncSession = Depends(get_db),
):
    """
    Cập nhật tên doanh nghiệp cho các khoản vay MB hoặc các khoản vay chưa phân biệt được pháp nhân.
    """
    stmt = (
        select(CreditFacility)
        .where(
            or_(
                CreditFacility.borrower_name == "Doanh nghiệp vay vốn",
                CreditFacility.borrower_name == "Doanh nghiệp vay vốn MB",
                CreditFacility.borrower_name.ilike("%Doanh nghiệp vay vốn%"),
            )
        )
    )
    loans = (await db.execute(stmt)).scalars().all()
    count = 0
    for loan in loans:
        old_val = loan.borrower_name
        loan.borrower_name = target_borrower_name
        count += 1
        audit = AuditLog(
            actor="Chị Cẩm Nhung",
            action="UPDATE_LOAN_BORROWER",
            target_entity="credit_facilities",
            target_id=str(loan.loan_id),
            details={
                "contract_number": loan.contract_number,
                "bank_code": loan.bank_code,
                "old_borrower_name": old_val,
                "new_borrower_name": target_borrower_name,
                "reason": "Chuẩn hóa chủ thể vay sang " + target_borrower_name,
            },
        )
        db.add(audit)
    await db.commit()
    return {"updated_count": count, "borrower_name": target_borrower_name}


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

    # Tự động đồng bộ bổ sung vào Kho Hóa Đơn nếu là file hóa đơn (XML/PDF)
    try:
        await invoice_service.auto_sync_dossier_document_to_invoice(
            db=db,
            loan=loan,
            doc_record=doc_record,
            content=content,
        )
        # Tự động đồng bộ cuốn chiếu sang tab Hóa đơn nhận nợ nếu là tài liệu hóa đơn
        if doc_record.invoice_id or original_filename.lower().endswith(".xml") or document_type == "INVOICE":
            await invoice_service.auto_sync_dossier_invoices_rolling(
                db=db,
                loan_id=loan_id,
                user=uploaded_by,
                force_recalculate=False,
            )
    except Exception as exc:
        logger.warning(f"Lỗi khi tự động bổ sung hoặc cuốn chiếu hóa đơn giải ngân: {exc}")

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


@router.get("/loans/dossier/document-types", response_model=List[str])
async def list_disbursement_document_types(
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách tất cả các loại chứng từ/hồ sơ đã từng được lưu/sử dụng trong hệ thống.
    """
    stmt = (
        select(DisbursementDocument.document_type)
        .where(DisbursementDocument.document_type.isnot(None))
        .distinct()
    )
    records = (await db.execute(stmt)).scalars().all()
    types = [r.strip() for r in records if r and r.strip()]
    return sorted(list(set(types)))


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
    Đồng thời liên kết tự động xóa số tiền nhận nợ bên dưới nếu đây là tệp hóa đơn.
    """
    stmt = select(DisbursementDocument).where(DisbursementDocument.document_id == document_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu giải ngân để xóa.")

    loan_id = doc.loan_id
    doc_invoice_id = doc.invoice_id
    doc_storage_path = doc.storage_path
    doc_file_name = doc.file_name

    # Nếu document chưa gắn invoice_id nhưng là file hóa đơn XML/PDF, tìm invoice tương ứng
    if not doc_invoice_id:
        stmt_find_inv = select(Invoice.invoice_id).where(
            or_(
                Invoice.xml_storage_path == doc_storage_path,
                Invoice.pdf_storage_path == doc_storage_path,
                Invoice.xml_file_name == doc_file_name,
                Invoice.pdf_file_name == doc_file_name,
            )
        )
        doc_invoice_id = (await db.execute(stmt_find_inv)).scalar_one_or_none()

    # Xóa tài liệu khỏi database
    await db.delete(doc)
    await db.flush()

    # Xóa file vật lý khỏi Object Storage / Local Disk
    if doc_storage_path:
        delete_statement_file(doc_storage_path)

    deleted_allocation = False
    if doc_invoice_id:
        # Kiểm tra xem khoản vay này còn tài liệu nào khác gắn với hóa đơn này không (ví dụ còn file PDF nếu vừa xóa XML)
        stmt_remaining_docs = select(func.count(DisbursementDocument.document_id)).where(
            DisbursementDocument.loan_id == loan_id,
            DisbursementDocument.invoice_id == doc_invoice_id,
        )
        remaining_docs = (await db.execute(stmt_remaining_docs)).scalar() or 0

        # Nếu không còn tệp hóa đơn nào khác cho hóa đơn này trong hồ sơ giải ngân:
        # Xóa luôn toàn bộ phần nhận nợ tương ứng của hóa đơn này tại khoản vay!
        if remaining_docs == 0:
            stmt_allocs = select(LoanInvoiceAllocation).where(
                LoanInvoiceAllocation.loan_id == loan_id,
                LoanInvoiceAllocation.invoice_id == doc_invoice_id,
            )
            allocs_to_del = (await db.execute(stmt_allocs)).scalars().all()
            for a in allocs_to_del:
                await db.delete(a)
                deleted_allocation = True

            await db.flush()
            await invoice_service._recalculate_invoice_state(db, doc_invoice_id)

            # Kiểm tra dọn dẹp hóa đơn mồ côi nếu không còn bất kỳ khoản vay nào nhận nợ
            # và cũng không còn tệp hồ sơ nào trong toàn hệ thống tham chiếu đến
            stmt_any_alloc = select(func.count(LoanInvoiceAllocation.allocation_id)).where(
                LoanInvoiceAllocation.invoice_id == doc_invoice_id
            )
            has_any_alloc = ((await db.execute(stmt_any_alloc)).scalar() or 0) > 0

            stmt_any_doc = select(func.count(DisbursementDocument.document_id)).where(
                DisbursementDocument.invoice_id == doc_invoice_id
            )
            has_any_doc = ((await db.execute(stmt_any_doc)).scalar() or 0) > 0

            if not has_any_alloc and not has_any_doc:
                orphaned_inv = await db.get(Invoice, doc_invoice_id)
                if orphaned_inv:
                    await db.execute(delete(InvoiceItem).where(InvoiceItem.invoice_id == doc_invoice_id))
                    await db.delete(orphaned_inv)

    audit = AuditLog(
        actor="Chị Cẩm Nhung",
        action="DELETE_DISBURSEMENT_DOCUMENT",
        target_entity="disbursement_documents",
        target_id=str(document_id),
        details={
            "storage_path": doc_storage_path,
            "file_name": doc_file_name,
            "loan_id": loan_id,
            "invoice_id": doc_invoice_id,
            "deleted_allocation": deleted_allocation,
        },
    )
    db.add(audit)
    await db.commit()

    msg = f"Đã xóa thành công tài liệu '{doc_file_name}' khỏi hồ sơ giải ngân."
    if deleted_allocation:
        msg += " Hệ thống đã tự động xóa phần nhận nợ tương ứng của hóa đơn khỏi khoản vay và hoàn lại hạn mức."
    return {"message": msg, "deleted_allocation": deleted_allocation}


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

