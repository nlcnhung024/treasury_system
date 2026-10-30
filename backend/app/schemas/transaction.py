from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field


class TransactionItem(BaseModel):
    transaction_id: int
    file_id: int
    account_id: int
    bank_code: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    account_type: Optional[str] = None
    tax_code: Optional[str] = None
    transaction_date: datetime
    value_date: Optional[date] = None
    reference_number: Optional[str] = None
    description: str
    debit_amount: Decimal
    credit_amount: Decimal
    running_balance: Decimal
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_type: Optional[str] = None
    category_color: Optional[str] = None
    internal_note: Optional[str] = None
    is_manual_override: bool
    applied_rule_id: Optional[int] = None
    dedup_hash: str

    class Config:
        from_attributes = True


class UpdateTransactionPayload(BaseModel):
    category_id: Optional[int] = None
    clear_category: bool = False
    internal_note: Optional[str] = None
    is_manual_override: Optional[bool] = None
    running_balance: Optional[Decimal] = None



class BulkTagPayload(BaseModel):
    transaction_ids: List[int] = Field(..., example=[101, 102, 105, 110])
    category_id: Optional[int] = Field(None, example=5)
    is_manual_override: bool = True


class BulkTagResponse(BaseModel):
    updated_count: int
    message: str
