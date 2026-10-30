from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.cash_ledger import CashLedger
from app.schemas.cash_ledger import CashLedgerItem, CreateCashEntryPayload
from app.schemas.common import PaginationMeta

router = APIRouter(prefix="/cash-ledger", tags=["Cash Ledger"])

@router.get("", response_model=dict)
async def list_cash_ledger(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(CashLedger).order_by(desc(CashLedger.entry_date), desc(CashLedger.cash_entry_id)).offset((page - 1) * limit).limit(limit)
    res = await db.execute(stmt)
    entries = res.scalars().all()

    return {
        "data": [CashLedgerItem.model_validate(e) for e in entries],
        "pagination": PaginationMeta(current_page=page, page_size=limit, total_records=len(entries), total_pages=1)
    }

@router.post("", response_model=CashLedgerItem, status_code=status.HTTP_201_CREATED)
async def create_cash_entry(payload: CreateCashEntryPayload, db: AsyncSession = Depends(get_db)):
    # Lấy số dư tiền mặt gần nhất
    stmt = select(CashLedger).order_by(desc(CashLedger.entry_date), desc(CashLedger.cash_entry_id)).limit(1)
    res = await db.execute(stmt)
    last_entry = res.scalar_one_or_none()
    current_cash = last_entry.running_cash_balance if last_entry else Decimal("0.00")

    if payload.entry_type == "INFLOW":
        new_balance = current_cash + payload.amount
    else:
        new_balance = current_cash - payload.amount

    new_entry = CashLedger(
        entry_date=payload.entry_date,
        entry_type=payload.entry_type,
        amount=payload.amount,
        running_cash_balance=new_balance,
        linked_transaction_id=payload.linked_transaction_id,
        receiver_payer=payload.receiver_payer,
        reason=payload.reason,
        internal_note=payload.internal_note
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return CashLedgerItem.model_validate(new_entry)

