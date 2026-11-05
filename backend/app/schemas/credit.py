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
    bank_id: Optional[int] = None
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
    snapshot_date: Optional[date] = None
    snapshot_principal_balance: Decimal = Decimal("0.00")
    original_principal_balance: Decimal = Decimal("0.00")
    total_repaid_principal: Decimal = Decimal("0.00")
    repaid_before_snapshot: Decimal = Decimal("0.00")
    repaid_after_snapshot: Decimal = Decimal("0.00")
    current_principal_balance: Decimal = Decimal("0.00")
    accrued_interest: Decimal = Decimal("0.00")
    next_repayment_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_amount: Decimal = Decimal("0.00")
    total_repayment_amount: Decimal = Decimal("0.00")
    dossier_files_count: int = 0
    total_invoices_amount: Decimal = Decimal("0.00")
    invoice_reconciliation_status: Optional[str] = None  # 'SUFFICIENT', 'DEFICIENT', 'NO_INVOICE'
    invoice_shortage_amount: Decimal = Decimal("0.00")
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
    invoice_number: Optional[str] = None
    invoice_total_amount: Optional[Decimal] = None
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
    invoice_number: Optional[str] = None
    invoice_total_amount: Optional[Decimal] = None
    message: str


class LoanInvoiceReconciliationResponse(BaseModel):
    loan_id: int
    contract_number: str
    bank_code: str
    current_principal_balance: Decimal
    total_invoice_amount: Decimal
    shortage_amount: Decimal
    is_sufficient: bool
    invoice_count: int
    warning_message: Optional[str] = None


class CreditFacilityCreate(BaseModel):
    bank_id: Optional[int] = None
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
    original_principal_balance: Optional[Decimal] = None
    current_principal_balance: Optional[Decimal] = None
    accrued_interest: Optional[Decimal] = None
    next_repayment_date: Optional[date] = None
    next_principal_amount: Decimal = Decimal("0.00")
    next_interest_amount: Decimal = Decimal("0.00")
    total_repayment_amount: Optional[Decimal] = None
    status: str = "ACTIVE"
    note: Optional[str] = None


class CreditFacilityUpdate(BaseModel):
    bank_id: Optional[int] = None
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
    original_principal_balance: Optional[Decimal] = None
    current_principal_balance: Optional[Decimal] = None
    accrued_interest: Optional[Decimal] = None
    next_repayment_date: Optional[date] = None
    next_principal_amount: Optional[Decimal] = None
    next_interest_amount: Optional[Decimal] = None
    total_repayment_amount: Optional[Decimal] = None
    status: Optional[str] = None
    note: Optional[str] = None


class CreditOrganizationItem(BaseModel):
    bank_code: str
    bank_name: str
    institution_type: str = "OTHER"

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


# =============================================================================
# SCHEMAS: ĐỐI SOÁT TRẢ NỢ VÀ GIẢM TRỪ NỢ GỐC (US-07.9)
# =============================================================================

class UnreconciledDebtTransactionItem(BaseModel):
    transaction_id: int
    account_id: int
    bank_code: str
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    transaction_date: datetime
    reference_number: Optional[str] = None
    counter_party: Optional[str] = None
    description: str
    debit_amount: Decimal
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    # Gợi ý khế ước tự động từ Regex
    suggested_contract_number: Optional[str] = None
    suggested_loan_id: Optional[int] = None
    suggested_bank_code: Optional[str] = None
    suggested_borrower_name: Optional[str] = None
    suggested_principal_balance: Optional[Decimal] = None
    suggested_snapshot_date: Optional[date] = None
    suggested_snapshot_balance: Optional[Decimal] = None
    timing_prediction: Optional[str] = None  # 'PRE_SNAPSHOT', 'POST_SNAPSHOT'
    suggested_interest_rate: Optional[Decimal] = None
    suggested_principal_amount: Optional[Decimal] = None
    suggested_interest_amount: Optional[Decimal] = None
    match_confidence: str = "NONE"  # 'HIGH', 'MEDIUM', 'LOW', 'NONE'

    class Config:
        from_attributes = True


class RepaymentReconcileRequest(BaseModel):
    transaction_id: int
    loan_id: int
    principal_amount: Decimal
    interest_amount: Decimal
    repayment_timing: Optional[str] = None  # 'PRE_SNAPSHOT', 'POST_SNAPSHOT'
    notes: Optional[str] = None


class RepaymentReconcileResponse(BaseModel):
    repayment_id: int
    loan_id: int
    transaction_id: int
    contract_number: str
    bank_code: str
    repayment_date: datetime
    repayment_timing: str = "POST_SNAPSHOT"  # 'PRE_SNAPSHOT', 'POST_SNAPSHOT'
    snapshot_date: Optional[date] = None
    principal_amount: Decimal
    interest_amount: Decimal
    total_amount: Decimal
    previous_principal_balance: Decimal
    remaining_principal_balance: Decimal
    original_principal_balance: Decimal = Decimal("0.00")
    total_repaid_principal: Decimal = Decimal("0.00")
    loan_status: str  # 'ACTIVE', 'SETTLED'
    message: str


class LoanRepaymentHistoryItem(BaseModel):
    repayment_id: int
    loan_id: int
    transaction_id: int
    contract_number: str
    bank_code: str
    repayment_date: datetime
    repayment_timing: str = "POST_SNAPSHOT"  # 'PRE_SNAPSHOT', 'POST_SNAPSHOT'
    snapshot_date: Optional[date] = None
    principal_amount: Decimal
    interest_amount: Decimal
    total_amount: Decimal
    previous_principal_balance: Decimal
    remaining_principal_balance: Decimal
    notes: Optional[str] = None
    reconciled_by: str
    created_at: datetime
    transaction_description: Optional[str] = None
    reference_number: Optional[str] = None

    class Config:
        from_attributes = True


class RepaymentRollbackResponse(BaseModel):
    repayment_id: int
    loan_id: int
    contract_number: str
    restored_balance: Decimal
    loan_status: str
    message: str



