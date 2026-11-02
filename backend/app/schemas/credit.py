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
    interest_payment_method: str = "MONTHLY"
    monthly_interest_due_day: Optional[int] = None
    calculated_interest_due: Decimal = Decimal("0.00")
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
    institution_type: str = "BANK"
    is_manual: bool = False
    note: Optional[str] = None
    interest_payment_method: str = "MONTHLY"  # 'MONTHLY', 'END_OF_TERM'
    monthly_interest_due_day: Optional[int] = None
    calculated_interest_due: Decimal = Decimal("0.00")
    current_principal_balance: Decimal = Decimal("0.00")
    accrued_interest: Decimal = Decimal("0.00")
    next_repayment_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_amount: Decimal = Decimal("0.00")
    total_repayment_amount: Decimal = Decimal("0.00")
    dossier_files_count: int = 0
    status: str = "ACTIVE"
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisbursementDocumentItem(BaseModel):
    document_id: int
    document_uuid: UUID
    loan_id: int
    file_name: str
    storage_path: str
    file_size_bytes: int
    file_sha256: str
    mime_type: str
    document_type: str = "DISBURSEMENT_RECORD"
    description: Optional[str] = None
    uploaded_by: str = "SYSTEM"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisbursementDocumentUploadResponse(BaseModel):
    document_id: int
    document_uuid: UUID
    loan_id: int
    file_name: str
    storage_path: str
    file_size_bytes: int
    document_type: str
    message: str


class CreditFacilityCreate(BaseModel):
    bank_code: str
    bank_name: str
    institution_type: str = "BANK"  # 'BANK', 'FINANCE_COMPANY', 'LEASING_COMPANY', 'OTHER'
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
    loan_type: str = "SHORT_TERM"  # 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'FINANCIAL_LEASE'
    interest_payment_method: str = "MONTHLY"
    monthly_interest_due_day: Optional[int] = None
    current_principal_balance: Decimal = Decimal("0.00")
    accrued_interest: Decimal = Decimal("0.00")
    next_repayment_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_amount: Decimal = Decimal("0.00")
    total_repayment_amount: Optional[Decimal] = None
    status: str = "ACTIVE"
    note: Optional[str] = None


class CreditFacilityUpdate(BaseModel):
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    institution_type: Optional[str] = None
    contract_number: Optional[str] = None
    borrower_name: Optional[str] = None
    cif_number: Optional[str] = None
    loan_purpose: Optional[str] = None
    currency: Optional[str] = None
    disbursement_date: Optional[date] = None
    maturity_date: Optional[date] = None
    term: Optional[str] = None
    interest_rate: Optional[Decimal] = None
    debt_group: Optional[str] = None
    loan_type: Optional[str] = None
    interest_payment_method: Optional[str] = None
    monthly_interest_due_day: Optional[int] = None
    current_principal_balance: Optional[Decimal] = None
    accrued_interest: Optional[Decimal] = None
    next_repayment_date: Optional[date] = None
    next_principal_amount: Optional[Decimal] = None
    next_interest_amount: Optional[Decimal] = None
    total_repayment_amount: Optional[Decimal] = None
    status: Optional[str] = None
    note: Optional[str] = None


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


class RepaymentPlanSimulateRequest(BaseModel):
    capacity_mode: str = "UNIFORM"  # "UNIFORM" or "SEASONAL"
    uniform_monthly_capacity: Decimal = Decimal("14000000000.00")
    seasonal_capacities: Optional[dict[str, Decimal]] = None  # e.g. {"2026-11": Decimal(...)}
    prepayment_penalty_rate: Decimal = Decimal("0.0000")  # Default 0%
    strategy: str = "SPLIT_LARGE_LOANS"  # "SPLIT_LARGE_LOANS", "AVALANCHE", "SNOWBALL", "BALANCED"
    mb_tenor_months: int = 6  # MB max tenor = 6 months
    ctg_tenor_months: int = 4  # CTG max tenor = 4 months
    reborrow_rate: Decimal = Decimal("100.00")  # Tỷ lệ vay lại (0% - 100%, mặc định 100%)
    reborrow_mode: str = "STAGGERED_SMOOTHING"  # "LUMP_SUM_STANDARD" hoặc "STAGGERED_SMOOTHING"


class MonthlyRepaymentComparisonItem(BaseModel):
    month: str  # YYYY-MM
    natural_due_amount: Decimal = Decimal("0.00")
    reborrowed_new_due_amount: Decimal = Decimal("0.00")  # Nợ tái sinh từ vay lại đến hạn trong tháng này
    allocated_payment_amount: Decimal = Decimal("0.00")
    prepaid_principal_amount: Decimal = Decimal("0.00")
    regular_principal_amount: Decimal = Decimal("0.00")
    monthly_capacity: Decimal = Decimal("0.00")
    remaining_capacity: Decimal = Decimal("0.00")
    is_safe: bool = True
    status_label: str = "SAFE"  # "SAFE", "REFINANCED", "OVER_CAPACITY"


class LoanAllocationActionItem(BaseModel):
    loan_id: int
    bank_code: str
    contract_number: str
    original_balance: Decimal
    interest_rate: Decimal
    original_due_date: Optional[date] = None
    action_type: str  # "PAY_ON_DUE", "PARTIAL_PREPAYMENT", "FULL_PREPAYMENT", "ROLLOVER_REFINANCE", "NEW_REBORROW_DRAWDOWN"
    payment_month: str  # YYYY-MM
    payment_amount: Decimal
    remaining_balance_after: Decimal
    days_early: int = 0
    estimated_interest_saved: Decimal = Decimal("0.00")
    prepayment_penalty_fee: Decimal = Decimal("0.00")
    rollover_new_maturity: Optional[date] = None
    note: str = ""


class DebtRepaymentPlanResponse(BaseModel):
    total_principal_debt: Decimal = Decimal("0.00")
    total_loans_count: int = 0
    capacity_mode: str = "UNIFORM"
    uniform_monthly_capacity: Decimal = Decimal("14000000000.00")
    prepayment_penalty_rate: Decimal = Decimal("0.0000")
    strategy: str = "SPLIT_LARGE_LOANS"
    reborrow_rate: Decimal = Decimal("100.00")
    reborrow_mode: str = "STAGGERED_SMOOTHING"
    total_reborrowed_amount: Decimal = Decimal("0.00")
    reborrow_summary_note: str = ""
    peak_debt_before: Decimal = Decimal("0.00")
    peak_debt_after: Decimal = Decimal("0.00")
    peak_reduction_percent: Decimal = Decimal("0.00")
    total_interest_saved: Decimal = Decimal("0.00")
    total_penalty_incurred: Decimal = Decimal("0.00")
    net_financial_benefit: Decimal = Decimal("0.00")
    monthly_schedule: List[MonthlyRepaymentComparisonItem] = []
    allocations: List[LoanAllocationActionItem] = []


