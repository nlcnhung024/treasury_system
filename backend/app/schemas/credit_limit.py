from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Any
from uuid import UUID
from pydantic import BaseModel


# =============================================================================
# 1. HỢP ĐỒNG TÍN DỤNG (CREDIT AGREEMENTS)
# =============================================================================

class LinkedLoanBrief(BaseModel):
    loan_id: int
    contract_number: str
    borrower_name: str
    disbursement_date: Optional[date] = None
    maturity_date: Optional[date] = None
    interest_rate: Decimal = Decimal("0.0000")
    original_principal_balance: Decimal = Decimal("0.00")
    current_principal_balance: Decimal = Decimal("0.00")
    status: str = "ACTIVE"

    class Config:
        from_attributes = True


class LinkedCollateralBrief(BaseModel):
    asset_id: int
    asset_code: str
    asset_name: str
    owner_name: str
    appraised_value: Decimal = Decimal("0.00")
    ltv_ratio: Decimal = Decimal("70.00")
    max_secured_loan_value: Decimal = Decimal("0.00")
    collateral_status: str
    latest_valuation_date: Optional[date] = None
    requires_revaluation: bool = False

    class Config:
        from_attributes = True


class SublimitItem(BaseModel):
    name: str
    amount: Decimal


class CreditAgreementResponse(BaseModel):
    agreement_id: int
    agreement_uuid: UUID
    bank_id: Optional[int] = None
    bank_code: str
    bank_name: str
    agreement_number: str
    agreement_name: str
    entity_id: Optional[int] = None
    entity_code: Optional[str] = None
    entity_short_name: Optional[str] = None
    borrower_name: str
    total_credit_limit: Decimal = Decimal("0.00")
    loan_sublimit: Optional[Decimal] = None
    guarantee_sublimit: Optional[Decimal] = None
    lc_sublimit: Optional[Decimal] = None
    sublimits_json: Optional[str] = "[]"
    sublimits: List[SublimitItem] = []
    contract_file_name: Optional[str] = None
    contract_file_path: Optional[str] = None
    contract_file_size: Optional[int] = None
    currency: str = "VND"
    signed_date: Optional[date] = None
    effective_from: date
    effective_to: date
    interest_rate_framework: Optional[str] = None
    collateral_summary: Optional[str] = None
    status: str = "ACTIVE"
    computed_status: str = "ACTIVE"
    days_to_expiry: int = 0
    parent_agreement_id: Optional[int] = None
    parent_agreement_number: Optional[str] = None
    renewed_to_agreement_id: Optional[int] = None
    renewed_to_agreement_number: Optional[str] = None
    notes: Optional[str] = None
    created_by: str = "SYSTEM"
    created_at: datetime
    updated_at: datetime

    # Dynamic Aggregations from Linked CreditFacilities & Collaterals
    active_loans_count: int = 0
    total_loans_count: int = 0
    utilized_loan_amount: Decimal = Decimal("0.00")
    available_credit_limit: Decimal = Decimal("0.00")
    utilization_pct: Decimal = Decimal("0.00")
    collateral_count: int = 0
    total_collateral_value: Decimal = Decimal("0.00")
    total_max_secured_value: Decimal = Decimal("0.00")
    linked_loans: List[LinkedLoanBrief] = []
    linked_collaterals: List[LinkedCollateralBrief] = []

    class Config:
        from_attributes = True


class CreditAgreementCreate(BaseModel):
    bank_id: Optional[int] = None
    bank_code: str
    bank_name: str
    agreement_number: str
    agreement_name: str
    entity_id: Optional[int] = None
    borrower_name: str
    total_credit_limit: Decimal
    loan_sublimit: Optional[Decimal] = None
    guarantee_sublimit: Optional[Decimal] = None
    lc_sublimit: Optional[Decimal] = None
    sublimits_json: Optional[str] = "[]"
    sublimits: Optional[List[SublimitItem]] = None
    contract_file_name: Optional[str] = None
    contract_file_path: Optional[str] = None
    contract_file_size: Optional[int] = None
    currency: str = "VND"
    signed_date: Optional[date] = None
    effective_from: date
    effective_to: date
    interest_rate_framework: Optional[str] = None
    collateral_summary: Optional[str] = None
    status: str = "ACTIVE"
    parent_agreement_id: Optional[int] = None
    notes: Optional[str] = None
    transfer_collaterals_from_parent: bool = True


class CreditAgreementUpdate(BaseModel):
    bank_id: Optional[int] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    agreement_number: Optional[str] = None
    agreement_name: Optional[str] = None
    entity_id: Optional[int] = None
    borrower_name: Optional[str] = None
    total_credit_limit: Optional[Decimal] = None
    loan_sublimit: Optional[Decimal] = None
    guarantee_sublimit: Optional[Decimal] = None
    lc_sublimit: Optional[Decimal] = None
    sublimits_json: Optional[str] = None
    sublimits: Optional[List[SublimitItem]] = None
    contract_file_name: Optional[str] = None
    contract_file_path: Optional[str] = None
    contract_file_size: Optional[int] = None
    currency: Optional[str] = None
    signed_date: Optional[date] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    interest_rate_framework: Optional[str] = None
    collateral_summary: Optional[str] = None
    status: Optional[str] = None
    parent_agreement_id: Optional[int] = None
    renewed_to_agreement_id: Optional[int] = None
    notes: Optional[str] = None
    transfer_collaterals_from_parent: Optional[bool] = False


class CreditAgreementRenewPayload(BaseModel):
    new_agreement_number: str
    new_agreement_name: str
    total_credit_limit: Decimal
    loan_sublimit: Optional[Decimal] = None
    guarantee_sublimit: Optional[Decimal] = None
    lc_sublimit: Optional[Decimal] = None
    signed_date: Optional[date] = None
    effective_from: date
    effective_to: date
    interest_rate_framework: Optional[str] = None
    notes: Optional[str] = None
    transfer_collateral_ids: Optional[List[int]] = None


# =============================================================================
# 2. HỒ SƠ HẠN MỨC (CREDIT LIMIT DOSSIERS)
# =============================================================================

class ChecklistItemSchema(BaseModel):
    key: str
    label: str
    category: str
    is_required: bool = True
    is_completed: bool = False
    note: Optional[str] = None


class CreditLimitDossierFileResponse(BaseModel):
    file_id: int
    file_uuid: UUID
    dossier_id: int
    category: str
    file_name: str
    storage_path: str
    file_size_bytes: int
    mime_type: str
    description: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class CreditLimitDossierResponse(BaseModel):
    dossier_id: int
    dossier_uuid: UUID
    agreement_id: Optional[int] = None
    agreement_number: Optional[str] = None
    bank_code: str
    bank_name: str
    borrower_name: str
    dossier_code: str
    dossier_title: str
    dossier_type: str
    proposed_limit_amount: Decimal = Decimal("0.00")
    approved_limit_amount: Optional[Decimal] = None
    submission_date: Optional[date] = None
    approval_date: Optional[date] = None
    expiry_review_date: Optional[date] = None
    status: str
    checklist: List[ChecklistItemSchema] = []
    completion_pct: int = 0
    responsible_person: Optional[str] = None
    notes: Optional[str] = None
    files: List[CreditLimitDossierFileResponse] = []
    created_at: datetime
    updated_at: datetime


class CreditLimitDossierCreate(BaseModel):
    agreement_id: Optional[int] = None
    bank_code: str
    bank_name: str
    borrower_name: str
    dossier_code: str
    dossier_title: str
    dossier_type: str = "RENEWAL"
    proposed_limit_amount: Decimal = Decimal("0.00")
    approved_limit_amount: Optional[Decimal] = None
    submission_date: Optional[date] = None
    approval_date: Optional[date] = None
    expiry_review_date: Optional[date] = None
    status: str = "PREPARING"
    checklist: Optional[List[ChecklistItemSchema]] = None
    responsible_person: Optional[str] = None
    notes: Optional[str] = None


class CreditLimitDossierUpdate(BaseModel):
    agreement_id: Optional[int] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    borrower_name: Optional[str] = None
    dossier_code: Optional[str] = None
    dossier_title: Optional[str] = None
    dossier_type: Optional[str] = None
    proposed_limit_amount: Optional[Decimal] = None
    approved_limit_amount: Optional[Decimal] = None
    submission_date: Optional[date] = None
    approval_date: Optional[date] = None
    expiry_review_date: Optional[date] = None
    status: Optional[str] = None
    checklist: Optional[List[ChecklistItemSchema]] = None
    responsible_person: Optional[str] = None
    notes: Optional[str] = None


# =============================================================================
# 3. TÀI SẢN ĐẢM BẢO (COLLATERAL ASSETS)
# =============================================================================

class CollateralValuationResponse(BaseModel):
    valuation_id: int
    valuation_uuid: UUID
    asset_id: int
    valuation_org: str
    valuation_amount: Decimal
    valuation_date: date
    valuer_name: Optional[str] = None
    report_number: Optional[str] = None
    report_file_name: Optional[str] = None
    report_storage_path: Optional[str] = None
    report_file_size: Optional[int] = None
    report_mime_type: Optional[str] = None
    notes: Optional[str] = None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class CollateralDocumentResponse(BaseModel):
    doc_id: int
    doc_uuid: UUID
    asset_id: int
    doc_category: str
    file_name: str
    storage_path: str
    file_size_bytes: int
    mime_type: str
    description: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class CollateralAgreementHistoryResponse(BaseModel):
    history_id: int
    asset_id: int
    from_agreement_id: Optional[int] = None
    from_agreement_number: Optional[str] = None
    to_agreement_id: Optional[int] = None
    to_agreement_number: Optional[str] = None
    bank_code: Optional[str] = None
    action_type: str
    effective_date: date
    notes: Optional[str] = None
    performed_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class CollateralAssetResponse(BaseModel):
    asset_id: int
    asset_uuid: UUID
    asset_code: str
    asset_name: str
    asset_type: str
    owner_name: str
    owner_id_or_tax_code: Optional[str] = None
    ownership_relation: str = "BORROWER_OWNED"
    borrower_name: Optional[str] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    agreement_id: Optional[int] = None
    agreement_number: Optional[str] = None
    agreement_status: Optional[str] = None
    agreement_effective_to: Optional[date] = None
    appraised_value: Decimal = Decimal("0.00")
    ltv_ratio: Decimal = Decimal("70.00")
    max_secured_loan_value: Decimal = Decimal("0.00")
    currency: str = "VND"
    collateral_status: str = "MORTGAGED"
    latest_valuation_date: Optional[date] = None
    days_since_valuation: Optional[int] = None
    requires_revaluation: bool = False
    revaluation_warning: Optional[str] = None
    certificate_number: Optional[str] = None
    certificate_issue_date: Optional[date] = None
    certificate_issued_by: Optional[str] = None
    address: Optional[str] = None
    land_area_m2: Optional[Decimal] = None
    google_maps_url: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    valuations: List[CollateralValuationResponse] = []
    documents: List[CollateralDocumentResponse] = []
    agreement_history: List[CollateralAgreementHistoryResponse] = []

    class Config:
        from_attributes = True


class CollateralAssetCreate(BaseModel):
    asset_code: str
    asset_name: str
    asset_type: str = "REAL_ESTATE_LAND"
    owner_name: str
    owner_id_or_tax_code: Optional[str] = None
    ownership_relation: str = "BORROWER_OWNED"
    borrower_name: Optional[str] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    agreement_id: Optional[int] = None
    appraised_value: Decimal = Decimal("0.00")
    ltv_ratio: Decimal = Decimal("70.00")
    collateral_status: str = "MORTGAGED"
    latest_valuation_date: Optional[date] = None
    certificate_number: Optional[str] = None
    certificate_issue_date: Optional[date] = None
    certificate_issued_by: Optional[str] = None
    address: Optional[str] = None
    land_area_m2: Optional[Decimal] = None
    google_maps_url: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    notes: Optional[str] = None


class CollateralAssetUpdate(BaseModel):
    asset_code: Optional[str] = None
    asset_name: Optional[str] = None
    asset_type: Optional[str] = None
    owner_name: Optional[str] = None
    owner_id_or_tax_code: Optional[str] = None
    ownership_relation: Optional[str] = None
    borrower_name: Optional[str] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    agreement_id: Optional[int] = None
    appraised_value: Optional[Decimal] = None
    ltv_ratio: Optional[Decimal] = None
    collateral_status: Optional[str] = None
    latest_valuation_date: Optional[date] = None
    certificate_number: Optional[str] = None
    certificate_issue_date: Optional[date] = None
    certificate_issued_by: Optional[str] = None
    address: Optional[str] = None
    land_area_m2: Optional[Decimal] = None
    google_maps_url: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    notes: Optional[str] = None


class CollateralTransferAgreementRequest(BaseModel):
    to_agreement_id: Optional[int] = None
    action_type: str = "ROLLOVER_TRANSFER"  # 'ROLLOVER_TRANSFER', 'MANUAL_REASSIGN', 'RELEASE'
    effective_date: date
    notes: Optional[str] = None
    performed_by: str = "Chị Cẩm Nhung"


# =============================================================================
# 4. CAM KẾT SAU VAY (POST-LOAN COVENANTS)
# =============================================================================

class PostLoanCovenantResponse(BaseModel):
    covenant_id: int
    covenant_uuid: UUID
    agreement_id: int
    agreement_number: Optional[str] = None
    loan_id: Optional[int] = None
    loan_contract_number: Optional[str] = None
    bank_code: str
    bank_name: str
    borrower_name: str
    covenant_title: str
    covenant_category: str
    frequency: str
    linked_account_id: Optional[int] = None
    linked_account_number: Optional[str] = None
    period_start: Optional[date] = None
    due_date: date
    days_until_due: int = 0
    target_value: Optional[Decimal] = None
    actual_value: Optional[Decimal] = None
    auto_casa_credit_turnover: Optional[Decimal] = None
    achievement_pct: Optional[Decimal] = None
    unit: str = "VND"
    compliance_status: str
    computed_compliance_status: str
    evidence_file_name: Optional[str] = None
    evidence_storage_path: Optional[str] = None
    responsible_person: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PostLoanCovenantCreate(BaseModel):
    agreement_id: int
    loan_id: Optional[int] = None
    bank_code: str
    bank_name: str
    borrower_name: str
    covenant_title: str
    covenant_category: str = "CASHFLOW_TURNOVER"
    frequency: str = "QUARTERLY"
    linked_account_id: Optional[int] = None
    linked_account_number: Optional[str] = None
    period_start: Optional[date] = None
    due_date: date
    target_value: Optional[Decimal] = None
    actual_value: Optional[Decimal] = None
    unit: str = "VND"
    compliance_status: str = "IN_PROGRESS"
    responsible_person: Optional[str] = None
    notes: Optional[str] = None


class PostLoanCovenantUpdate(BaseModel):
    agreement_id: Optional[int] = None
    loan_id: Optional[int] = None
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    borrower_name: Optional[str] = None
    covenant_title: Optional[str] = None
    covenant_category: Optional[str] = None
    frequency: Optional[str] = None
    linked_account_id: Optional[int] = None
    linked_account_number: Optional[str] = None
    period_start: Optional[date] = None
    due_date: Optional[date] = None
    target_value: Optional[Decimal] = None
    actual_value: Optional[Decimal] = None
    unit: Optional[str] = None
    compliance_status: Optional[str] = None
    responsible_person: Optional[str] = None
    notes: Optional[str] = None
