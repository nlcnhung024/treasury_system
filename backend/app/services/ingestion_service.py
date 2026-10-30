import logging
import re
from decimal import Decimal
from typing import Dict, Any, List
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.account import BankAccount
from app.models.statement_file import BankStatementFile
from app.models.transaction import BankTransaction
from app.models.category_rule import ClassificationRule
from app.models.cash_ledger import CashLedger
from app.models.audit_log import AuditLog
from app.services.storage_service import read_statement_bytes
from app.services.parser.universal_stream_parser import parse_statement_file
from app.services.rule_engine import find_matching_rule

logger = logging.getLogger(__name__)

CASH_WITHDRAWAL_PATTERN = re.compile(r"(?i)\b(rut\s*tien|rút\s*tiền)\b")
CASH_DEPOSIT_PATTERN = re.compile(r"(?i)\b(nop\s*tien|nộp\s*tiền)\b")


async def sync_and_recalculate_cash_ledger(db: AsyncSession) -> int:
    """
    Đồng bộ Sổ quỹ Tiền mặt (cash_ledger) theo công thức chuẩn:
      Quỹ tiền mặt = Tổng Rút tiền mặt từ NH (INFLOW) - Tổng Nộp tiền mặt vào NH (OUTFLOW)
    1. Xóa các bản ghi tự động mồ côi (khi file sao kê gốc đã bị xóa nên linked_transaction_id IS NULL).
    2. Quét toàn bộ giao dịch ngân hàng để bổ sung các bút toán Rút tiền (INFLOW) hoặc Nộp tiền (OUTFLOW) còn thiếu.
    3. Sắp xếp toàn bộ Sổ quỹ theo thứ tự thời gian (entry_date ASC, cash_entry_id ASC) và tính lại running_cash_balance.
    """
    # 1. Dọn các bút toán tự động mồ côi
    await db.execute(
        delete(CashLedger).where(
            CashLedger.linked_transaction_id.is_(None),
            CashLedger.internal_note.like("Tự động đối ứng%"),
        )
    )
    await db.flush()

    # 2. Lấy tập linked_transaction_id đã có trong cash_ledger
    existing_linked_res = await db.execute(
        select(CashLedger.linked_transaction_id).where(CashLedger.linked_transaction_id.is_not(None))
    )
    existing_linked_ids = set(existing_linked_res.scalars().all())

    tx_stmt = (
        select(BankTransaction)
        .options(selectinload(BankTransaction.account))
        .order_by(BankTransaction.transaction_date.asc(), BankTransaction.transaction_id.asc())
    )
    all_txs = list((await db.execute(tx_stmt)).scalars().all())

    created_count = 0
    for tx_obj in all_txs:
        if tx_obj.transaction_id in existing_linked_ids:
            continue
        desc_str = tx_obj.description or ""
        acc = tx_obj.account
        bank_label = f"{acc.bank_code} - {acc.account_number}" if acc else f"Account #{tx_obj.account_id}"
        holder_name = acc.account_holder if acc else None

        reason_str = desc_str
        if tx_obj.reference_number and tx_obj.reference_number not in reason_str:
            reason_str = f"{reason_str} ({tx_obj.reference_number})"

        if tx_obj.debit_amount > Decimal("0.00") and CASH_WITHDRAWAL_PATTERN.search(desc_str):
            db.add(
                CashLedger(
                    linked_transaction_id=tx_obj.transaction_id,
                    entry_date=tx_obj.value_date or tx_obj.transaction_date.date(),
                    entry_type="INFLOW",
                    amount=tx_obj.debit_amount,
                    running_cash_balance=Decimal("0.00"),
                    receiver_payer=holder_name,
                    reason=reason_str,
                    internal_note=f"Tự động đối ứng rút tiền mặt từ TK {bank_label}",
                )
            )
            created_count += 1
        elif tx_obj.credit_amount > Decimal("0.00") and CASH_DEPOSIT_PATTERN.search(desc_str):
            db.add(
                CashLedger(
                    linked_transaction_id=tx_obj.transaction_id,
                    entry_date=tx_obj.value_date or tx_obj.transaction_date.date(),
                    entry_type="OUTFLOW",
                    amount=tx_obj.credit_amount,
                    running_cash_balance=Decimal("0.00"),
                    receiver_payer=holder_name,
                    reason=reason_str,
                    internal_note=f"Tự động đối ứng nộp tiền mặt vào TK {bank_label}",
                )
            )
            created_count += 1

    await db.flush()

    # 3. Tính lại running_cash_balance chuẩn xác theo thứ tự thời gian (Rút tiền - Nộp tiền)
    all_cash_stmt = select(CashLedger).order_by(CashLedger.entry_date.asc(), CashLedger.cash_entry_id.asc())
    all_cash_entries = list((await db.execute(all_cash_stmt)).scalars().all())
    running_bal = Decimal("0.00")
    for entry in all_cash_entries:
        if entry.entry_type == "INFLOW":
            running_bal += entry.amount
        else:
            running_bal -= entry.amount
        entry.running_cash_balance = running_bal

    await db.flush()
    return created_count


async def process_statement_file(file_id: int, db: AsyncSession) -> Dict[str, Any]:
    """
    Pipeline ETL & Đối soát đầu-cuối cho một file sao kê ngân hàng:
    1. Đọc file gốc từ Hybrid Storage (MinIO / Local Disk).
    2. Bóc tách tự động theo mẫu (Universal Stream Parser) & Đối soát 5 chế độ.
    3. Định danh Pháp nhân & Tài khoản (Multi-Entity Account Resolution).
    4. Lưu giao dịch chống trùng lặp (dedup_hash 6 thành phần) & tự động phân loại theo Rules.
    5. Tự động sinh bút toán Nhập quỹ tiền mặt (cash_ledger) đối ứng với các lệnh 'RUT TIEN'.
    6. Ghi nhận Audit Log.
    """
    stmt = select(BankStatementFile).where(BankStatementFile.file_id == file_id)
    res = await db.execute(stmt)
    stmt_file = res.scalar_one_or_none()
    if not stmt_file:
        raise ValueError(f"Không tìm thấy bản ghi BankStatementFile với file_id={file_id}")

    try:
        stmt_file.processing_status = "PARSING"
        await db.commit()

        file_bytes = read_statement_bytes(stmt_file.storage_path)

        # Lần đọc đầu để nhận diện số tài khoản & kiểm tra số dư khởi tạo nếu có trong DB
        pkg = parse_statement_file(
            file_bytes,
            filename=stmt_file.original_filename,
            hint_template_code=stmt_file.template_code,
        )

        # Tra cứu hoặc khởi tạo BankAccount
        acc_stmt = select(BankAccount).where(BankAccount.account_number == pkg.account_number)
        acc_res = await db.execute(acc_stmt)
        account = acc_res.scalar_one_or_none()

        if account and pkg.reconciliation.reconciliation_mode == "MODE_4_TOTAL_FLOW_ONLY":
            # Nếu tài khoản SPECIAL_CASH đã có opening_balance trong DB, tính lại running_balance theo điểm neo đó
            if account.opening_balance != Decimal("0.00"):
                pkg = parse_statement_file(
                    file_bytes,
                    filename=stmt_file.original_filename,
                    hint_template_code=stmt_file.template_code,
                    account_opening_balance=account.opening_balance,
                )

        stmt_file.processing_status = "RECONCILING"
        await db.commit()

        if not account:
            init_opening = (
                pkg.reconciliation.header_opening_balance
                if pkg.reconciliation.header_opening_balance is not None
                else Decimal("0.00")
            )
            account = BankAccount(
                bank_code=pkg.bank_code,
                bank_name=pkg.bank_name,
                account_number=pkg.account_number,
                account_holder=pkg.account_holder,
                tax_code=pkg.tax_code or "0109730501",
                account_type=pkg.account_type,
                currency=pkg.currency,
                opening_balance=init_opening,
                current_balance=pkg.reconciliation.calculated_closing_balance,
                is_active=True,
            )
            db.add(account)
            await db.flush()
        else:
            account.bank_code = pkg.bank_code
            account.bank_name = pkg.bank_name
            account.account_holder = pkg.account_holder
            if pkg.tax_code:
                account.tax_code = pkg.tax_code
            account.account_type = pkg.account_type
            account.current_balance = pkg.reconciliation.calculated_closing_balance
            await db.flush()

        # Tải danh sách ClassificationRule đang hoạt động
        rule_stmt = (
            select(ClassificationRule)
            .where(ClassificationRule.is_active == True)
            .order_by(ClassificationRule.priority.asc(), ClassificationRule.rule_id.asc())
        )
        rule_res = await db.execute(rule_stmt)
        active_rules = list(rule_res.scalars().all())

        # Tải tập dedup_hash đã tồn tại của tài khoản này để chống trùng lặp khi nạp file giao thoa kỳ
        existing_hash_stmt = select(BankTransaction.dedup_hash).where(
            BankTransaction.account_id == account.account_id
        )
        existing_hash_res = await db.execute(existing_hash_stmt)
        existing_hashes = set(existing_hash_res.scalars().all())

        inserted_txs: List[BankTransaction] = []
        duplicate_count = 0

        # Duyệt từ giao dịch cũ nhất lên mới nhất để thứ tự ID và Sổ quỹ tiền mặt tăng dần theo thời gian
        for tx_data in reversed(pkg.transactions):
            d_hash = tx_data["dedup_hash"]
            if d_hash in existing_hashes:
                duplicate_count += 1
                continue

            existing_hashes.add(d_hash)
            matched_rule = find_matching_rule(
                rules=active_rules,
                description=tx_data["description"],
                debit_amount=tx_data["debit_amount"],
                credit_amount=tx_data["credit_amount"],
                bank_code=account.bank_code,
                account_number=account.account_number,
            )

            new_tx = BankTransaction(
                file_id=stmt_file.file_id,
                account_id=account.account_id,
                category_id=matched_rule.category_id if matched_rule else None,
                applied_rule_id=matched_rule.rule_id if matched_rule else None,
                transaction_date=tx_data["transaction_date"],
                value_date=tx_data["value_date"],
                reference_number=tx_data["reference_number"],
                description=tx_data["description"],
                debit_amount=tx_data["debit_amount"],
                credit_amount=tx_data["credit_amount"],
                running_balance=tx_data["running_balance"],
                dedup_hash=d_hash,
                is_duplicate=False,
                is_manual_override=False,
            )
            db.add(new_tx)
            inserted_txs.append(new_tx)

        await db.flush()

        # Tự động đồng bộ & tính lại Sổ quỹ tiền mặt (cash_ledger): Rút tiền (INFLOW) - Nộp tiền (OUTFLOW)
        cash_entries_created = await sync_and_recalculate_cash_ledger(db)

        # Cập nhật kết quả đối soát lên BankStatementFile
        stmt_file.account_id = account.account_id
        stmt_file.template_code = pkg.template_code
        stmt_file.reconciliation_mode = pkg.reconciliation.reconciliation_mode
        stmt_file.statement_period_start = pkg.period_start
        stmt_file.statement_period_end = pkg.period_end
        stmt_file.header_opening_balance = pkg.reconciliation.header_opening_balance
        stmt_file.header_closing_balance = pkg.reconciliation.header_closing_balance
        stmt_file.calculated_closing_balance = pkg.reconciliation.calculated_closing_balance
        stmt_file.total_credit_amount = pkg.reconciliation.total_credit_amount
        stmt_file.total_debit_amount = pkg.reconciliation.total_debit_amount
        stmt_file.total_transactions_count = pkg.reconciliation.total_transactions_count
        stmt_file.reconciliation_status = pkg.reconciliation.reconciliation_status
        stmt_file.discrepancy_amount = pkg.reconciliation.discrepancy_amount
        stmt_file.processing_status = "COMPLETED"
        stmt_file.error_message = None

        # Ghi AuditLog
        audit = AuditLog(
            actor=stmt_file.uploaded_by or "SYSTEM",
            action="PARSE_COMPLETED",
            target_entity="STATEMENT_FILE",
            target_id=str(stmt_file.file_id),
            details={
                "template_code": pkg.template_code,
                "bank_code": pkg.bank_code,
                "account_number": pkg.account_number,
                "reconciliation_mode": pkg.reconciliation.reconciliation_mode,
                "reconciliation_status": pkg.reconciliation.reconciliation_status,
                "discrepancy_amount": str(pkg.reconciliation.discrepancy_amount),
                "total_rows": pkg.reconciliation.total_transactions_count,
                "inserted_rows": len(inserted_txs),
                "skipped_duplicates": duplicate_count,
                "cash_entries_created": cash_entries_created,
            },
        )
        db.add(audit)
        await db.commit()

        return {
            "status": "COMPLETED",
            "file_id": stmt_file.file_id,
            "template_code": pkg.template_code,
            "processed_rows": pkg.reconciliation.total_transactions_count,
            "inserted_rows": len(inserted_txs),
            "reconciliation_status": pkg.reconciliation.reconciliation_status,
            "discrepancy_amount": str(pkg.reconciliation.discrepancy_amount),
        }

    except Exception as exc:
        logger.exception(f"Lỗi khi bóc tách file_id={file_id}: {exc}")
        stmt_file.processing_status = "FAILED"
        stmt_file.reconciliation_status = "DISCREPANCY"
        stmt_file.error_message = str(exc)
        await db.commit()
        raise


async def run_background_parse_task(file_id: int) -> None:
    """
    Hàm thực thi trong FastAPI BackgroundTasks (mở phiên DB độc lập).
    """
    async with AsyncSessionLocal() as session:
        try:
            await process_statement_file(file_id, session)
        except Exception as exc:
            logger.error(f"Background parse task failed for file_id={file_id}: {exc}")

