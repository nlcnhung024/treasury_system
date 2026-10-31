from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class CreditStatementFileItem(BaseModel):
    file_id: int
    file_uuid: UUID
    bank_code: str
    template_code: str
    original_filename: str
    file_size_bytes: int
    statement_date: Optional[date] = None
    total_principal_amount: Decimal = Decimal("0.00")
    total_interest_amount: Decimal = Decimal("0.00")
    total_payable_amount: Decimal = Decimal("0.00")
    calculated_principal_amount: Decimal = Decimal("0.00")
    total_contracts_count: int = 0
    processing_status: str
    reconciliation_status: str
    discrepancy_amount: Decimal = Decimal("0.00")
    error_message: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class CreditStatementItemResponse(BaseModel):
    item_id: int
    file_id: int
    loan_id: Optional[int] = None
    contract_number: str
    disbursement_date: Optional[date] = None
    maturity_date: Optional[date] = None
    term: Optional[str] = None
    interest_rate: Decimal = Decimal("0.0000")
    debt_group: str = "1"
    loan_purpose: Optional[str] = None
    principal_balance: Decimal = Decimal("0.00")
    principal_balance_vnd: Decimal = Decimal("0.00")
    accrued_interest: Decimal = Decimal("0.00")
    next_principal_due_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_due_date: Optional[date] = None
    next_interest_amount: Decimal = Decimal("0.00")
    total_due_amount: Decimal = Decimal("0.00")
    currency: str = "VND"
    created_at: datetime

    class Config:
        from_attributes = True


class CreditStatementFileDetail(CreditStatementFileItem):
    storage_path: str
    file_sha256: str
    items: List[CreditStatementItemResponse] = []


class CreditFacilityItem(BaseModel):
    loan_id: int
    bank_code: str
    bank_name: str
    contract_number: str
    borrower_name: str
    cif_number: Optional[str] = None
    loan_purpose: Optional[str] = None
    currency: str = "VND"
    disbursement_date: Optional[date] = None
    maturity_date: Optional[date] = None
    term: Optional[str] = None
    interest_rate: Decimal = Decimal("0.0000")
    debt_group: str = "1"
    loan_type: str = "SHORT_TERM"
    current_principal_balance: Decimal = Decimal("0.00")
    accrued_interest: Decimal = Decimal("0.00")
    next_repayment_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_amount: Decimal = Decimal("0.00")
    total_repayment_amount: Decimal = Decimal("0.00")
    status: str = "ACTIVE"
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BankDebtSummary(BaseModel):
    bank_code: str
    bank_name: str
    loans_count: int
    total_principal_balance: Decimal = Decimal("0.00")
    total_accrued_interest: Decimal = Decimal("0.00")
    upcoming_principal_due: Decimal = Decimal("0.00")
    upcoming_interest_due: Decimal = Decimal("0.00")
    weighted_avg_interest_rate: Decimal = Decimal("0.0000")


class CreditFacilitySummary(BaseModel):
    total_active_loans: int = 0
    total_principal_balance: Decimal = Decimal("0.00")
    total_accrued_interest: Decimal = Decimal("0.00")
    total_upcoming_principal_due: Decimal = Decimal("0.00")
    total_upcoming_interest_due: Decimal = Decimal("0.00")
    total_upcoming_due_7days: Decimal = Decimal("0.00")
    total_upcoming_due_30days: Decimal = Decimal("0.00")
    weighted_avg_interest_rate: Decimal = Decimal("0.0000")
    by_bank: List[BankDebtSummary] = []


class CreditUploadResponse(BaseModel):
    file_id: int
    file_uuid: UUID
    bank_code: str
    template_code: str
    original_filename: str
    reconciliation_status: str
    discrepancy_amount: Decimal
    total_principal_amount: Decimal
    calculated_principal_amount: Decimal
    total_contracts_count: int
    message: str
    warning: Optional[str] = None

