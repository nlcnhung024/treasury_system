from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.account import BankAccount
from app.schemas.account import BankAccountItem, CreateAccountPayload

router = APIRouter(prefix="/accounts", tags=["Accounts"])

@router.get("", response_model=List[BankAccountItem])
async def list_accounts(
    bank_code: Optional[str] = Query(None),
    tax_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(BankAccount).where(BankAccount.is_active == True)
    if bank_code:
        query = query.where(BankAccount.bank_code == bank_code)
    if tax_code:
        query = query.where(BankAccount.tax_code == tax_code)
    
    res = await db.execute(query)
    accounts = res.scalars().all()
    return [BankAccountItem.model_validate(a) for a in accounts]

@router.post("", response_model=BankAccountItem, status_code=status.HTTP_201_CREATED)
async def create_account(payload: CreateAccountPayload, db: AsyncSession = Depends(get_db)):
    new_acc = BankAccount(
        bank_code=payload.bank_code,
        bank_name=payload.bank_name,
        account_number=payload.account_number,
        account_holder=payload.account_holder,
        tax_code=payload.tax_code,
        account_type=payload.account_type,
        currency=payload.currency,
        opening_balance=payload.opening_balance,
        current_balance=payload.opening_balance
    )
    db.add(new_acc)
    await db.commit()
    await db.refresh(new_acc)
    return BankAccountItem.model_validate(new_acc)

