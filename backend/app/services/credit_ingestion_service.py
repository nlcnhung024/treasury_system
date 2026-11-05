import hashlib
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, Optional
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit import CreditStatementFile, CreditFacility, CreditStatementItem, LoanRepaymentHistory
from app.models.bank import Bank
from app.models.audit_log import AuditLog
from app.services.storage_service import save_statement_bytes
from app.services.parser.credit_stream_parser import parse_credit_statement_file, ParsedCreditPackage
from app.services.loan_interest_service import calculate_loan_interest

logger = logging.getLogger(__name__)


async def ingest_credit_statement(
    file_bytes: bytes,
    filename: str,
    uploaded_by: str = "SYSTEM",
    borrower_name: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    if db is None:
        raise ValueError("Database session is required for credit statement ingestion.")

    file_size = len(file_bytes)
    file_sha256 = hashlib.sha256(file_bytes).hexdigest()

    # 1. Kiểm tra chống trùng lặp file
    stmt = select(CreditStatementFile).where(CreditStatementFile.file_sha256 == file_sha256)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise ValueError("File sao kê tín dụng này đã được tải lên trước đó (Trùng mã băm SHA-256).")

    # 2. Bóc tách dữ liệu
    pkg: ParsedCreditPackage = parse_credit_statement_file(file_bytes, filename=filename)

    # Nếu người dùng đã chọn thực thể doanh nghiệp trên thanh Header, ưu tiên dùng tên doanh nghiệp đó
    if borrower_name and borrower_name.strip():
        pkg.borrower_name = borrower_name.strip()

    # Tra cứu thông tin ngân hàng chuẩn từ bảng banks
    bank_stmt = select(Bank).where(Bank.bank_code == pkg.bank_code)
    bank_record = (await db.execute(bank_stmt)).scalar_one_or_none()
    bank_id = bank_record.bank_id if bank_record else None
    bank_display_name = bank_record.short_name if bank_record else pkg.bank_name

    # 3. Lưu file vào Object Storage
    file_uuid = uuid.uuid4()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "xlsx"
    year_str = datetime.now().strftime("%Y")
    storage_path = f"credit_statements/{pkg.bank_code}/{year_str}/{file_uuid}.{ext}"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext == "xlsx" else "application/vnd.ms-excel"
    save_statement_bytes(storage_path, file_bytes, content_type=content_type)

    # 4. Ghi nhận `CreditStatementFile`
    file_record = CreditStatementFile(
        file_uuid=file_uuid,
        bank_id=bank_id,
        bank_code=pkg.bank_code,
        template_code=pkg.template_code,
        original_filename=filename,
        storage_path=storage_path,
        file_size_bytes=file_size,
        file_sha256=file_sha256,
        mime_type=content_type,
        statement_date=pkg.statement_date,
        total_principal_amount=pkg.total_principal_amount,
        total_interest_amount=pkg.total_interest_amount,
        total_payable_amount=pkg.total_payable_amount,
        calculated_principal_amount=pkg.calculated_principal_amount,
        total_contracts_count=pkg.total_contracts_count,
        processing_status="COMPLETED",
        reconciliation_status=pkg.reconciliation_status,
        discrepancy_amount=pkg.discrepancy_amount,
        uploaded_by=uploaded_by,
    )
    db.add(file_record)
    await db.flush()  # Sinh file_id

    # 5. Upsert các khoản vay vào `CreditFacility` & ghi nhận snapshot `CreditStatementItem`
    contract_numbers = [item["contract_number"] for item in pkg.items]
    existing_facs_stmt = select(CreditFacility).where(
        CreditFacility.bank_code == pkg.bank_code,
        CreditFacility.contract_number.in_(contract_numbers),
    )
    existing_facilities = {
        fac.contract_number: fac
        for fac in (await db.execute(existing_facs_stmt)).scalars().all()
    }

    for item in pkg.items:
        contract_number = item["contract_number"]
        facility = existing_facilities.get(contract_number)

        next_rep_date = item.get("next_principal_due_date") or item.get("next_interest_due_date")
        disb_date = item.get("disbursement_date")
        mat_date = item.get("maturity_date")
        prin_balance = item.get("principal_balance", Decimal("0.00"))
        rate = item.get("interest_rate", Decimal("0.0000"))

        if facility:
            if bank_id and not facility.bank_id:
                facility.bank_id = bank_id
            if bank_display_name:
                facility.bank_name = bank_display_name
            # Truy vấn các lần trả nợ đã đối soát trước đó của khế ước này (nếu có)
            stmt_repay = select(LoanRepaymentHistory).where(LoanRepaymentHistory.loan_id == facility.loan_id)
            past_repays = (await db.execute(stmt_repay)).scalars().all()

            repaid_before = Decimal("0.00")
            repaid_after = Decimal("0.00")
            snap_dt = pkg.statement_date

            if snap_dt:
                for r in past_repays:
                    r_date = r.repayment_date.date() if isinstance(r.repayment_date, datetime) else r.repayment_date
                    if r_date <= snap_dt:
                        repaid_before += r.principal_amount
                        r.repayment_timing = "PRE_SNAPSHOT"
                    else:
                        repaid_after += r.principal_amount
                        r.repayment_timing = "POST_SNAPSHOT"
                    r.snapshot_date = snap_dt
            else:
                for r in past_repays:
                    repaid_after += r.principal_amount

            facility.snapshot_date = snap_dt
            facility.snapshot_principal_balance = prin_balance
            facility.repaid_before_snapshot = repaid_before
            facility.repaid_after_snapshot = repaid_after
            facility.total_repaid_principal = repaid_before + repaid_after
            facility.original_principal_balance = prin_balance + repaid_before
            facility.current_principal_balance = max(Decimal("0.00"), prin_balance - repaid_after)

            facility.accrued_interest = item["accrued_interest"]
            facility.next_principal_amount = item["next_principal_amount"]
            facility.next_interest_amount = item["next_interest_amount"]
            facility.next_repayment_date = next_rep_date
            facility.total_repayment_amount = item["total_due_amount"]
            facility.interest_rate = rate
            facility.debt_group = item["debt_group"]
            facility.borrower_name = pkg.borrower_name
            if disb_date:
                facility.disbursement_date = disb_date
            if mat_date:
                facility.maturity_date = mat_date
            if item.get("term"):
                facility.term = item["term"]
            if item.get("loan_purpose"):
                facility.loan_purpose = item["loan_purpose"]
            facility.status = "SETTLED" if facility.current_principal_balance == Decimal("0.00") else "ACTIVE"

            if pkg.bank_code in ("CTG", "CTG_LEASING"):
                facility.interest_payment_method = "MONTHLY"
                facility.monthly_interest_due_day = 5
            elif not facility.monthly_interest_due_day:
                facility.monthly_interest_due_day = disb_date.day if disb_date else 25

            # Tính số lãi cần trả theo quy định hiện hành của pháp luật (Thông tư 14/2017/TT-NHNN)
            calc_interest = calculate_loan_interest(
                principal_balance=facility.current_principal_balance,
                annual_interest_rate=facility.interest_rate,
                payment_method=facility.interest_payment_method or "MONTHLY",
                monthly_due_day=facility.monthly_interest_due_day,
                disbursement_date=facility.disbursement_date,
                maturity_date=facility.maturity_date,
            )
            facility.calculated_interest_due = calc_interest
            loan_id = facility.loan_id
            curr_payment_method = facility.interest_payment_method
            curr_due_day = facility.monthly_interest_due_day
        else:
            default_due_day = 5 if pkg.bank_code in ("CTG", "CTG_LEASING") else (disb_date.day if disb_date else 25)
            calc_interest = calculate_loan_interest(
                principal_balance=prin_balance,
                annual_interest_rate=rate,
                payment_method="MONTHLY",
                monthly_due_day=default_due_day,
                disbursement_date=disb_date,
                maturity_date=mat_date,
            )
            facility = CreditFacility(
                bank_id=bank_id,
                bank_code=pkg.bank_code,
                bank_name=bank_display_name,
                contract_number=contract_number,
                borrower_name=pkg.borrower_name,
                cif_number=pkg.cif_number,
                loan_purpose=item.get("loan_purpose"),
                currency=item.get("currency", "VND"),
                disbursement_date=disb_date,
                maturity_date=mat_date,
                term=item.get("term"),
                interest_rate=rate,
                debt_group=item.get("debt_group", "1"),
                loan_type="SHORT_TERM",
                interest_payment_method="MONTHLY",
                monthly_interest_due_day=default_due_day,
                calculated_interest_due=calc_interest,
                snapshot_date=pkg.statement_date,
                snapshot_principal_balance=prin_balance,
                repaid_before_snapshot=Decimal("0.00"),
                repaid_after_snapshot=Decimal("0.00"),
                total_repaid_principal=Decimal("0.00"),
                original_principal_balance=prin_balance,
                current_principal_balance=prin_balance,
                accrued_interest=item.get("accrued_interest", Decimal("0.00")),
                next_repayment_date=next_rep_date,
                next_principal_amount=item.get("next_principal_amount", Decimal("0.00")),
                next_interest_amount=item.get("next_interest_amount", Decimal("0.00")),
                total_repayment_amount=item.get("total_due_amount", Decimal("0.00")),
                status="ACTIVE",
            )
            db.add(facility)
            await db.flush()
            loan_id = facility.loan_id
            curr_payment_method = "MONTHLY"
            curr_due_day = default_due_day

        # Thêm snapshot item
        snapshot = CreditStatementItem(
            file_id=file_record.file_id,
            loan_id=loan_id,
            contract_number=contract_number,
            disbursement_date=disb_date,
            maturity_date=mat_date,
            term=item.get("term"),
            interest_rate=rate,
            debt_group=item.get("debt_group", "1"),
            loan_purpose=item.get("loan_purpose"),
            interest_payment_method=curr_payment_method,
            monthly_interest_due_day=curr_due_day,
            calculated_interest_due=calc_interest,
            principal_balance=prin_balance,
            principal_balance_vnd=item.get("principal_balance_vnd", Decimal("0.00")),
            accrued_interest=item.get("accrued_interest", Decimal("0.00")),
            next_principal_due_date=item.get("next_principal_due_date"),
            next_principal_amount=item.get("next_principal_amount", Decimal("0.00")),
            next_interest_due_date=item.get("next_interest_due_date"),
            next_interest_amount=item.get("next_interest_amount", Decimal("0.00")),
            total_due_amount=item.get("total_due_amount", Decimal("0.00")),
            currency=item.get("currency", "VND"),
        )
        db.add(snapshot)

    # 6. Ghi Audit Log
    db.add(
        AuditLog(
            actor=uploaded_by,
            action="CREDIT_STATEMENT_UPLOADED",
            target_entity="CREDIT_STATEMENT_FILE",
            target_id=str(file_record.file_id),
            details={
                "bank_code": pkg.bank_code,
                "template_code": pkg.template_code,
                "contracts_count": pkg.total_contracts_count,
                "total_principal": str(pkg.total_principal_amount),
                "reconciliation_status": pkg.reconciliation_status,
                "discrepancy_amount": str(pkg.discrepancy_amount),
            },
        )
    )

    await db.commit()
    await db.refresh(file_record)

    return {
        "file_id": file_record.file_id,
        "file_uuid": file_record.file_uuid,
        "bank_code": file_record.bank_code,
        "template_code": file_record.template_code,
        "original_filename": file_record.original_filename,
        "reconciliation_status": file_record.reconciliation_status,
        "discrepancy_amount": file_record.discrepancy_amount,
        "total_principal_amount": file_record.total_principal_amount,
        "calculated_principal_amount": file_record.calculated_principal_amount,
        "total_contracts_count": file_record.total_contracts_count,
        "message": f"Nạp sao kê tín dụng thành công! {pkg.total_contracts_count} khoản vay đã được cập nhật.",
    }

