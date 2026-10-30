from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class StatementFileItem(BaseModel):
    file_id: int
    file_uuid: UUID
    account_id: Optional[int] = None
    bank_code: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    template_code: Optional[str] = None
    reconciliation_mode: Optional[str] = None
    original_filename: str
    file_size_bytes: int
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    header_opening_balance: Optional[Decimal] = None
    header_closing_balance: Optional[Decimal] = None
    calculated_closing_balance: Optional[Decimal] = None
    total_credit_amount: Decimal = Decimal("0.00")
    total_debit_amount: Decimal = Decimal("0.00")
    total_transactions_count: int = 0
    processing_status: str
    reconciliation_status: str
    discrepancy_amount: Decimal = Decimal("0.00")
    error_message: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class StatementFileDetail(StatementFileItem):
    storage_path: str
    file_sha256: str


class StatementStatusResponse(BaseModel):
    file_id: int
    template_code: Optional[str] = None
    reconciliation_mode: Optional[str] = None
    processing_status: str
    reconciliation_status: str
    total_transactions: int = 0
    discrepancy_amount: Decimal = Decimal("0.00")
    error_message: Optional[str] = None
