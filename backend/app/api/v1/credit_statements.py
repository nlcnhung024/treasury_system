import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import verify_file_magic_bytes
from app.core.config import settings
from app.models.credit import CreditStatementFile, CreditFacility, CreditStatementItem
from app.models.audit_log import AuditLog
from app.schemas.credit import (
    CreditStatementFileItem,
    CreditStatementFileDetail,
    CreditStatementItemResponse,
    CreditFacilityItem,
    CreditFacilitySummary,
    BankDebtSummary,
    CreditUploadResponse,
)
from app.schemas.common import PaginationMeta
from app.services.credit_ingestion_service import ingest_credit_statement

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


@router.get("/loans", response_model=dict)
async def list_loans(
    bank_code: Optional[str] = Query(None),
    debt_group: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("ACTIVE"),
    search: Optional[str] = Query(None),
    due_within_days: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    filters = [CreditFacility.is_active == True]

    if status_filter:
        filters.append(CreditFacility.status == status_filter)
    if bank_code:
        filters.append(CreditFacility.bank_code == bank_code)
    if debt_group:
        filters.append(CreditFacility.debt_group == debt_group)
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                CreditFacility.contract_number.ilike(search_pattern),
                CreditFacility.loan_purpose.ilike(search_pattern),
                CreditFacility.borrower_name.ilike(search_pattern),
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

    stmt = (
        select(CreditFacility)
        .where(*filters)
        .order_by(CreditFacility.next_repayment_date.asc().nullslast(), desc(CreditFacility.current_principal_balance))
        .offset(offset)
        .limit(limit)
    )
    records = (await db.execute(stmt)).scalars().all()

    return {
        "data": [CreditFacilityItem.model_validate(r) for r in records],
        "pagination": PaginationMeta(
            page=(offset // limit) + 1,
            page_size=limit,
            total_records=total_count,
            total_pages=(total_count + limit - 1) // limit if limit > 0 else 1,
        ),
    }


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

