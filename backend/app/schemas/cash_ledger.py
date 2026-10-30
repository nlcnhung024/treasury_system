from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

class CashLedgerItem(BaseModel):
    cash_entry_id: int
    linked_transaction_id: Optional[int] = None
    entry_date: date
    entry_type: str # INFLOW / OUTFLOW
    amount: Decimal
    running_cash_balance: Decimal
    receiver_payer: Optional[str] = None
    reason: str
    internal_note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class CreateCashEntryPayload(BaseModel):
    entry_date: date
    entry_type: str = Field(..., example="INFLOW")
    amount: Decimal = Field(..., example=Decimal("50000000.00"))
    linked_transaction_id: Optional[int] = None
    receiver_payer: Optional[str] = Field(None, example="Nguyễn Thị Lan Anh")
    reason: str = Field(..., example="Rút tiền mặt từ tài khoản MBBank cá nhân nhập quỹ")
    internal_note: Optional[str] = None

