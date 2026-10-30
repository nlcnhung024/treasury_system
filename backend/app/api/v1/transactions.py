from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.transaction import BankTransaction
from app.schemas.transaction import TransactionItem, BulkTagPayload, BulkTagResponse
from app.schemas.common import PaginationMeta

router = APIRouter(prefix="/transactions", tags=["Transactions"])

@router.get("", response_model=dict)
async def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    keyword: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_manual_override: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(BankTransaction).order_by(desc(BankTransaction.transaction_date))
    if category_id:
        query = query.where(BankTransaction.category_id == category_id)
    if is_manual_override is not None:
        query = query.where(BankTransaction.is_manual_override == is_manual_override)
    if keyword:
        query = query.where(BankTransaction.description.ilike(f"%{keyword}%"))

    query = query.offset((page - 1) * limit).limit(limit)
    res = await db.execute(query)
    trans = res.scalars().all()

    return {
        "data": [TransactionItem.model_validate(t) for t in trans],
        "pagination": PaginationMeta(current_page=page, page_size=limit, total_records=len(trans), total_pages=1)
    }

@router.patch("/{transaction_id}", response_model=TransactionItem)
async def update_transaction(
    transaction_id: int,
    category_id: Optional[int] = None,
    internal_note: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BankTransaction).where(BankTransaction.transaction_id == transaction_id)
    res = await db.execute(stmt)
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch")

    if category_id is not None:
        t.category_id = category_id
        t.is_manual_override = True
    if internal_note is not None:
        t.internal_note = internal_note
        t.is_manual_override = True

    await db.commit()
    await db.refresh(t)
    return TransactionItem.model_validate(t)

@router.post("/bulk-tag", response_model=BulkTagResponse)
async def bulk_tag_transactions(payload: BulkTagPayload, db: AsyncSession = Depends(get_db)):
    stmt = select(BankTransaction).where(BankTransaction.transaction_id.in_(payload.transaction_ids))
    res = await db.execute(stmt)
    records = res.scalars().all()
    
    count = 0
    for r in records:
        r.category_id = payload.category_id
        r.is_manual_override = True
        count += 1

    await db.commit()
    return BulkTagResponse(
        updated_count=count,
        message=f"Đã gán nhãn thành công {count} giao dịch và kích hoạt khóa bảo vệ chống ghi đè."
    )

