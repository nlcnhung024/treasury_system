from datetime import date, datetime, time, timezone, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Body, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.transaction import BankTransaction
from app.models.account import BankAccount
from app.models.statement_file import BankStatementFile
from app.models.category_rule import Category
from app.models.audit_log import AuditLog
from app.schemas.transaction import (
    TransactionItem,
    UpdateTransactionPayload,
    BulkTagPayload,
    BulkTagResponse,
)
from app.schemas.common import PaginationMeta

router = APIRouter(prefix="/transactions", tags=["Transactions"])
VN_TZ = timezone(timedelta(hours=7))


def _serialize_transaction(t: BankTransaction) -> TransactionItem:
    acc: Optional[BankAccount] = t.account
    cat: Optional[Category] = t.category
    return TransactionItem(
        transaction_id=t.transaction_id,
        file_id=t.file_id,
        account_id=t.account_id,
        bank_code=acc.bank_code if acc else None,
        account_number=acc.account_number if acc else None,
        account_holder=acc.account_holder if acc else None,
        account_type=acc.account_type if acc else None,
        tax_code=acc.tax_code if acc else None,
        transaction_date=t.transaction_date,
        value_date=t.value_date,
        reference_number=t.reference_number,
        counter_party=t.counter_party,
        description=t.description,
        debit_amount=t.debit_amount,
        credit_amount=t.credit_amount,
        running_balance=t.running_balance,
        category_id=t.category_id,
        category_name=cat.category_name if cat else None,
        category_type=cat.category_type if cat else None,
        category_color=cat.color_code if cat else None,
        internal_note=t.internal_note,
        is_manual_override=t.is_manual_override,
        applied_rule_id=t.applied_rule_id,
        dedup_hash=t.dedup_hash,
    )


@router.get("", response_model=dict)
async def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    keyword: Optional[str] = Query(None),
    bank_code: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None, description="Truyền -1 để lọc các dòng Chưa phân loại"),
    flow_type: Optional[str] = Query(None, description="DEBIT hoặc CREDIT"),
    counter_party: Optional[str] = Query(None, description="Lọc theo đối tượng thụ hưởng hoặc đối tượng chuyển"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    is_manual_override: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    base_query = select(BankTransaction).join(BankAccount, BankTransaction.account_id == BankAccount.account_id)

    if bank_code:
        base_query = base_query.where(BankAccount.bank_code == bank_code.upper())
    if account_id:
        base_query = base_query.where(BankTransaction.account_id == account_id)
    if counter_party and counter_party.strip():
        base_query = base_query.where(BankTransaction.counter_party.ilike(f"%{counter_party.strip()}%"))
    if category_id is not None:
        if category_id == -1:
            base_query = base_query.where(BankTransaction.category_id.is_(None))
        else:
            base_query = base_query.where(BankTransaction.category_id == category_id)
    if flow_type:
        ft = flow_type.upper()
        if ft == "DEBIT":
            base_query = base_query.where(BankTransaction.debit_amount > Decimal("0.00"))
        elif ft == "CREDIT":
            base_query = base_query.where(BankTransaction.credit_amount > Decimal("0.00"))
    if from_date:
        start_dt = datetime.combine(from_date, time.min, tzinfo=VN_TZ)
        base_query = base_query.where(BankTransaction.transaction_date >= start_dt)
    if to_date:
        end_dt = datetime.combine(to_date, time.max, tzinfo=VN_TZ)
        base_query = base_query.where(BankTransaction.transaction_date <= end_dt)
    if is_manual_override is not None:
        base_query = base_query.where(BankTransaction.is_manual_override == is_manual_override)
    if keyword and keyword.strip():
        kw = f"%{keyword.strip()}%"
        base_query = base_query.where(
            or_(
                BankTransaction.description.ilike(kw),
                BankTransaction.reference_number.ilike(kw),
                BankTransaction.counter_party.ilike(kw),
                BankTransaction.internal_note.ilike(kw),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total_records = (await db.execute(count_query)).scalar() or 0
    total_pages = max(1, (total_records + limit - 1) // limit)

    data_query = (
        base_query.options(
            selectinload(BankTransaction.account),
            selectinload(BankTransaction.category),
        )
        .order_by(desc(BankTransaction.transaction_date), desc(BankTransaction.transaction_id))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    res = await db.execute(data_query)
    trans = res.scalars().all()

    return {
        "data": [_serialize_transaction(t) for t in trans],
        "pagination": PaginationMeta(
            current_page=page,
            page_size=limit,
            total_records=total_records,
            total_pages=total_pages,
        ),
    }


async def _recalculate_account_running_balances(
    db: AsyncSession,
    anchor_tx: BankTransaction,
    anchor_running_balance: Decimal,
) -> None:
    """
    Lấy số dư lũy kế được sửa thủ công tại giao dịch `anchor_tx` làm điểm neo chuẩn (căn cước),
    tự động tính toán lại toàn bộ chuỗi `running_balance` của các giao dịch trước và sau
    của cùng tài khoản (`account_id`), đồng thời đồng bộ lại `opening_balance`, `current_balance`
    trên `BankAccount` và `BankStatementFile`.
    """
    acc_tx_stmt = (
        select(BankTransaction)
        .where(BankTransaction.account_id == anchor_tx.account_id)
        .order_by(BankTransaction.transaction_date.asc(), BankTransaction.transaction_id.asc())
    )
    all_acc_txs = list((await db.execute(acc_tx_stmt)).scalars().all())
    if not all_acc_txs:
        return

    anchor_idx = next(
        (i for i, item in enumerate(all_acc_txs) if item.transaction_id == anchor_tx.transaction_id),
        None,
    )
    if anchor_idx is None:
        return

    anchor_rounded = anchor_running_balance.quantize(Decimal("0.01"))
    all_acc_txs[anchor_idx].running_balance = anchor_rounded

    # 1. Lan truyền xuôi về tương lai (từ anchor_idx + 1 đến giao dịch mới nhất)
    for i in range(anchor_idx + 1, len(all_acc_txs)):
        prev_bal = all_acc_txs[i - 1].running_balance
        curr_tx = all_acc_txs[i]
        curr_tx.running_balance = (
            prev_bal + curr_tx.credit_amount - curr_tx.debit_amount
        ).quantize(Decimal("0.01"))

    # 2. Lan truyền ngược về quá khứ (từ anchor_idx - 1 lùi về giao dịch cũ nhất)
    for i in range(anchor_idx - 1, -1, -1):
        next_tx = all_acc_txs[i + 1]
        # Vì next_tx.running_balance = curr_tx.running_balance + next_tx.credit - next_tx.debit
        # => curr_tx.running_balance = next_tx.running_balance - next_tx.credit + next_tx.debit
        all_acc_txs[i].running_balance = (
            next_tx.running_balance - next_tx.credit_amount + next_tx.debit_amount
        ).quantize(Decimal("0.01"))

    # 3. Tính số dư đầu kỳ trước giao dịch đầu tiên và số dư cuối kỳ tại giao dịch cuối cùng
    first_tx = all_acc_txs[0]
    last_tx = all_acc_txs[-1]
    inferred_opening = (
        first_tx.running_balance - first_tx.credit_amount + first_tx.debit_amount
    ).quantize(Decimal("0.01"))
    latest_closing = last_tx.running_balance

    # 4. Cập nhật BankAccount
    acc_stmt = select(BankAccount).where(BankAccount.account_id == anchor_tx.account_id)
    account = (await db.execute(acc_stmt)).scalar_one_or_none()
    if account:
        account.opening_balance = inferred_opening
        account.current_balance = latest_closing

    # 5. Cập nhật BankStatementFile của tài khoản này
    file_stmt = select(BankStatementFile).where(BankStatementFile.account_id == anchor_tx.account_id)
    stmt_files = list((await db.execute(file_stmt)).scalars().all())
    for sf in stmt_files:
        file_txs = [tx for tx in all_acc_txs if tx.file_id == sf.file_id]
        if file_txs:
            sf_first = file_txs[0]
            sf_last = file_txs[-1]
            sf_open = (
                sf_first.running_balance - sf_first.credit_amount + sf_first.debit_amount
            ).quantize(Decimal("0.01"))
            sf_close = sf_last.running_balance
            sf.header_opening_balance = sf_open
            sf.header_closing_balance = sf_close
            sf.calculated_closing_balance = sf_close
            sf.discrepancy_amount = Decimal("0.00")
            sf.reconciliation_status = "BALANCED"

    # 6. Ghi nhận AuditLog
    db.add(
        AuditLog(
            actor="USER_MANUAL",
            action="ANCHOR_RUNNING_BALANCE_UPDATED",
            target_entity="BANK_ACCOUNT",
            target_id=str(anchor_tx.account_id),
            details={
                "anchor_transaction_id": anchor_tx.transaction_id,
                "anchor_running_balance": str(anchor_rounded),
                "recalculated_transactions_count": len(all_acc_txs),
                "new_opening_balance": str(inferred_opening),
                "new_closing_balance": str(latest_closing),
            },
        )
    )


@router.patch("/{transaction_id}", response_model=TransactionItem)
async def update_transaction(
    transaction_id: int,
    payload: Optional[UpdateTransactionPayload] = Body(default=None),
    category_id: Optional[int] = Query(default=None),
    internal_note: Optional[str] = Query(default=None),
    is_manual_override: Optional[bool] = Query(default=None),
    running_balance: Optional[Decimal] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(BankTransaction)
        .options(selectinload(BankTransaction.account), selectinload(BankTransaction.category))
        .where(BankTransaction.transaction_id == transaction_id)
    )
    res = await db.execute(stmt)
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch")

    new_anchor_balance: Optional[Decimal] = None

    if payload:
        if payload.clear_category:
            t.category_id = None
            t.is_manual_override = False
        elif payload.category_id is not None:
            t.category_id = payload.category_id
            t.is_manual_override = True
        if payload.internal_note is not None:
            t.internal_note = payload.internal_note
        if payload.is_manual_override is not None:
            t.is_manual_override = payload.is_manual_override
        if payload.running_balance is not None:
            new_anchor_balance = payload.running_balance
    else:
        if category_id is not None:
            t.category_id = None if category_id <= 0 else category_id
            t.is_manual_override = category_id > 0
        if internal_note is not None:
            t.internal_note = internal_note
        if is_manual_override is not None:
            t.is_manual_override = is_manual_override
        if running_balance is not None:
            new_anchor_balance = running_balance

    if new_anchor_balance is not None:
        await _recalculate_account_running_balances(db, t, new_anchor_balance)

    await db.commit()
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_transaction(refreshed)


@router.post("/bulk-tag", response_model=BulkTagResponse)
async def bulk_tag_transactions(payload: BulkTagPayload, db: AsyncSession = Depends(get_db)):
    stmt = select(BankTransaction).where(BankTransaction.transaction_id.in_(payload.transaction_ids))
    res = await db.execute(stmt)
    records = res.scalars().all()

    count = 0
    for r in records:
        r.category_id = payload.category_id
        r.is_manual_override = payload.is_manual_override if payload.category_id is not None else False
        count += 1

    await db.commit()
    return BulkTagResponse(
        updated_count=count,
        message=f"Đã cập nhật phân loại cho {count} giao dịch và kích hoạt khóa bảo vệ chống ghi đè.",
    )
