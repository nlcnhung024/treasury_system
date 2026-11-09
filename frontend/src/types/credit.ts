export interface CreditStatementFile {
  file_id: number;
  file_uuid: string;
  bank_code: string;
  template_code: string;
  original_filename: string;
  file_size_bytes: number;
  statement_date?: string | null;
  total_principal_amount: number;
  total_interest_amount: number;
  total_payable_amount: number;
  calculated_principal_amount: number;
  total_contracts_count: number;
  processing_status: string;
  reconciliation_status: 'BALANCED' | 'DISCREPANCY' | 'PENDING';
  discrepancy_amount: number;
  error_message?: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface CreditStatementItem {
  item_id: number;
  file_id: number;
  loan_id?: number | null;
  contract_number: string;
  disbursement_date?: string | null;
  maturity_date?: string | null;
  term?: string | null;
  interest_rate: number;
  debt_group: string;
  loan_purpose?: string | null;
  principal_balance: number;
  principal_balance_vnd: number;
  accrued_interest: number;
  next_principal_due_date?: string | null;
  next_principal_amount: number;
  next_interest_due_date?: string | null;
  next_interest_amount: number;
  total_due_amount: number;
  currency: string;
  created_at: string;
}

export interface CreditStatementFileDetail extends CreditStatementFile {
  storage_path: string;
  file_sha256: string;
  items: CreditStatementItem[];
}

export type InstitutionType = 'BANK' | 'FINANCE_COMPANY' | 'LEASING_COMPANY' | 'OTHER';
export type InterestPaymentMethod = 'MONTHLY' | 'END_OF_TERM';

export interface DisbursementDocument {
  document_id: number;
  document_uuid: string;
  loan_id: number;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  file_sha256: string;
  mime_type: string;
  document_type: string; // 'CONTRACT', 'DEBT_NOTE', 'DISBURSEMENT_RECORD', 'INVOICE', 'COLLATERAL', 'APPROVAL', 'OTHER'
  description?: string | null;
  invoice_number?: string | null;
  invoice_series?: string | null;
  invoice_issue_date?: string | null;
  seller_tax_code?: string | null;
  seller_name?: string | null;
  buyer_tax_code?: string | null;
  buyer_name?: string | null;
  invoice_total_amount?: number | null;
  verification_status?: 'UNVERIFIED' | 'VERIFIED_MATCH' | 'DEFICIENT_AMOUNT' | 'INVALID_SCHEMA';
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface LoanInvoiceReconciliation {
  loan_id: number;
  contract_number: string;
  bank_code: string;
  current_principal_balance: number;
  total_invoice_amount: number;
  shortage_amount: number;
  is_sufficient: boolean;
  invoice_count: number;
  warning_message?: string | null;
}

export interface CreditFacility {
  loan_id: number;
  agreement_id?: number | null;
  agreement_number?: string | null;
  bank_id?: number | null;
  bank_code: string;
  bank_name: string;
  contract_number: string;
  borrower_name: string;
  cif_number?: string | null;
  loan_purpose?: string | null;
  currency: string;
  disbursement_date?: string | null;
  maturity_date?: string | null;
  term?: string | null;
  interest_rate: number;
  debt_group: string;
  loan_type: string;
  institution_type?: InstitutionType;
  is_manual?: boolean;
  note?: string | null;
  interest_payment_method: InterestPaymentMethod;
  monthly_interest_due_day?: number | null;
  calculated_interest_due: number;
  snapshot_date?: string | null;
  snapshot_principal_balance?: number;
  original_principal_balance?: number;
  total_repaid_principal?: number;
  repaid_before_snapshot?: number;
  repaid_after_snapshot?: number;
  current_principal_balance: number;
  accrued_interest: number;
  next_repayment_date?: string | null;
  next_principal_amount: number;
  next_interest_amount: number;
  total_repayment_amount: number;
  dossier_files_count?: number;
  total_invoices_amount?: number;
  invoice_reconciliation_status?: 'SUFFICIENT' | 'DEFICIENT' | 'NO_INVOICE';
  invoice_shortage_amount?: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreditFacilityCreatePayload {
  bank_code: string;
  bank_name: string;
  institution_type?: InstitutionType;
  contract_number: string;
  borrower_name: string;
  cif_number?: string | null;
  loan_purpose?: string | null;
  currency?: string;
  disbursement_date?: string | null;
  maturity_date?: string | null;
  term?: string | null;
  interest_rate?: number;
  debt_group?: string;
  loan_type?: string;
  interest_payment_method?: InterestPaymentMethod;
  monthly_interest_due_day?: number | null;
  original_principal_balance?: number;
  current_principal_balance?: number;
  accrued_interest?: number;
  next_repayment_date?: string | null;
  next_principal_amount?: number;
  next_interest_amount?: number;
  total_repayment_amount?: number | null;
  status?: string;
  note?: string | null;
}

export interface CreditFacilityUpdatePayload {
  bank_code?: string;
  bank_name?: string;
  institution_type?: InstitutionType;
  contract_number?: string;
  borrower_name?: string;
  cif_number?: string | null;
  loan_purpose?: string | null;
  currency?: string;
  disbursement_date?: string | null;
  maturity_date?: string | null;
  term?: string | null;
  interest_rate?: number;
  debt_group?: string;
  loan_type?: string;
  interest_payment_method?: InterestPaymentMethod;
  monthly_interest_due_day?: number | null;
  original_principal_balance?: number;
  current_principal_balance?: number;
  accrued_interest?: number;
  next_repayment_date?: string | null;
  next_principal_amount?: number;
  next_interest_amount?: number;
  total_repayment_amount?: number | null;
  status?: string;
  note?: string | null;
}

export interface BankDebtSummary {
  bank_code: string;
  bank_name: string;
  loans_count: number;
  total_principal_balance: number;
  total_accrued_interest: number;
  upcoming_principal_due: number;
  upcoming_interest_due: number;
  weighted_avg_interest_rate: number;
}

export interface CreditFacilitySummary {
  total_active_loans: number;
  total_principal_balance: number;
  total_accrued_interest: number;
  total_upcoming_principal_due: number;
  total_upcoming_interest_due: number;
  total_upcoming_due_7days: number;
  total_upcoming_due_30days: number;
  weighted_avg_interest_rate: number;
  by_bank: BankDebtSummary[];
}

export interface UnreconciledDebtTransaction {
  transaction_id: number;
  account_id: number;
  bank_code: string;
  account_number?: string;
  account_holder?: string;
  transaction_date: string;
  reference_number?: string;
  counter_party?: string;
  description: string;
  debit_amount: number;
  category_id?: number;
  category_name?: string;

  suggested_contract_number?: string;
  suggested_loan_id?: number;
  suggested_bank_code?: string;
  suggested_borrower_name?: string;
  suggested_principal_balance?: number;
  suggested_snapshot_date?: string | null;
  suggested_snapshot_balance?: number;
  timing_prediction?: 'PRE_SNAPSHOT' | 'POST_SNAPSHOT' | null;
  suggested_interest_rate?: number;
  suggested_principal_amount?: number;
  suggested_interest_amount?: number;
  match_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

export interface RepaymentReconcilePayload {
  transaction_id: number;
  loan_id: number;
  principal_amount: number;
  interest_amount: number;
  notes?: string;
}

export interface RepaymentReconcileResult {
  repayment_id: number;
  loan_id: number;
  transaction_id: number;
  contract_number: string;
  bank_code: string;
  repayment_date: string;
  repayment_timing?: 'PRE_SNAPSHOT' | 'POST_SNAPSHOT' | string;
  snapshot_date?: string | null;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  previous_principal_balance: number;
  remaining_principal_balance: number;
  original_principal_balance?: number;
  total_repaid_principal?: number;
  loan_status: string;
  message: string;
}

export interface LoanRepaymentHistoryRecord {
  repayment_id: number;
  loan_id: number;
  transaction_id: number;
  contract_number: string;
  bank_code: string;
  repayment_date: string;
  repayment_timing?: 'PRE_SNAPSHOT' | 'POST_SNAPSHOT' | string;
  snapshot_date?: string | null;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  previous_principal_balance: number;
  remaining_principal_balance: number;
  notes?: string;
  reconciled_by: string;
  created_at: string;
  transaction_description?: string;
  reference_number?: string;
}

export interface RepaymentRollbackResult {
  repayment_id: number;
  loan_id: number;
  contract_number: string;
  restored_balance: number;
  loan_status: string;
  message: string;
}

export interface InvoiceLineItem {
  item_id: number;
  line_number: number;
  item_name: string;
  unit?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  subtotal: number;
  tax_rate?: string | null;
  tax_amount: number;
}

export interface LoanAllocationRecord {
  allocation_id: number;
  loan_id: number;
  invoice_id: number;
  bank_code: string;
  contract_number: string;
  allocated_amount: number;
  allocation_date: string;
  notes?: string | null;
  invoice_number?: string | null;
  invoice_series?: string | null;
  seller_name?: string | null;
  total_invoice_amount?: number | null;
  created_at?: string | null;
}

export interface InvoiceRegistryItem {
  invoice_id: number;
  invoice_uuid: string;
  entity_id?: number | null;
  invoice_number: string;
  invoice_series: string;
  invoice_template: string;
  invoice_date: string;
  tax_authority_code?: string | null;
  seller_tax_code: string;
  seller_name: string;
  seller_address?: string | null;
  buyer_tax_code: string;
  buyer_name: string;
  buyer_address?: string | null;
  currency: string;
  exchange_rate: number;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  allocated_amount: number;
  remaining_amount: number;
  locked_bank_code?: string | null;
  status: 'AVAILABLE' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED';
  xml_file_name?: string | null;
  pdf_file_name?: string | null;
  has_pdf: boolean;
  note?: string | null;
  created_at?: string | null;
  items?: InvoiceLineItem[];
  allocations?: LoanAllocationRecord[];
}

export interface InvoiceListResponse {
  items: InvoiceRegistryItem[];
  total: number;
  total_value: number;
  total_allocated: number;
  total_remaining: number;
}

export interface LoanAllocatedInvoicesResponse {
  loan_id: number;
  contract_number: string;
  bank_code: string;
  original_principal_balance: number;
  total_allocated_amount: number;
  difference_amount: number;
  is_fully_secured: boolean;
  status_message: string;
  allocations: LoanAllocationRecord[];
}





export type RolloverPriorityField =
  | 'bank_total_principal'
  | 'bank_monthly_principal'
  | 'bank_custom_order'
  | 'interest_rate'
  | 'disbursement_date'
  | 'principal'
  | 'maturity_date'
  | 'term_months'
  | 'original_principal'
  | 'calculated_interest'
  | 'interest_payment_method'
  | 'loan_source';

export interface RolloverPriorityRule {
  field: RolloverPriorityField;
  direction: 'ASC' | 'DESC';
  enabled: boolean;
}

export interface DebtRolloverPlanConfig {
  config_id?: number;
  borrower_name: string;
  horizon_months: number;
  default_monthly_ocf: number;
  default_rollover_term_months: number;
  monthly_ocf_overrides: Record<string, number>;
  bank_term_overrides: Record<string, number>;
  payoff_contract_numbers: string[];
  locked_rollover_actions: LockedRolloverAction[];
  priority_rules?: RolloverPriorityRule[];
  custom_bank_order?: string[];
  updated_by?: string;
  updated_at?: string;
}

export interface LockedRolloverAction {
  contract_number: string;
  source_month: string; // YYYY-MM
  target_month: string; // YYYY-MM
  amount: number;
  new_maturity_month: string; // YYYY-MM
}

export type RolloverActionType =
  | 'NATURAL_REPAYMENT' // Đáo hạn đúng hạn và giải ngân lại
  | 'EARLY_ROLLOVER' // Kéo từ tháng sau về đảo nợ sớm
  | 'RE_DISBURSED_MATURITY' // Nợ tái đáo hạn từ các khoản đã đảo nợ trước đó
  | 'PERMANENT_PAYOFF'; // Tất toán đứt bằng OCF, không vay lại

export interface RolloverExecutionItem {
  id: string;
  loan_id: number;
  contract_number: string;
  bank_code: string;
  bank_name: string;
  borrower_name: string;
  interest_rate: number;
  disbursement_date?: string; // YYYY-MM-DD
  original_due_date: string; // YYYY-MM-DD
  original_month: string; // YYYY-MM
  execution_month: string; // YYYY-MM
  settlement_amount: number;
  redisbursement_amount: number;
  term_months: number;
  new_maturity_date: string; // YYYY-MM-DD
  new_maturity_month: string; // YYYY-MM
  action_type: RolloverActionType;
  is_partial: boolean;
  is_locked: boolean;
  is_permanent_payoff: boolean;
  source_excess_month?: string; // Tháng cao điểm nguồn bị kéo đi
}

export interface MonthlyRolloverBucket {
  month_key: string; // YYYY-MM
  month_label: string; // Tháng MM/YYYY
  ocf_limit: number;
  is_ocf_overridden: boolean;

  // 4 Cấu phần Waterfall Hằng Tháng:
  // (1) Gốc đến hạn tại thời điểm hiện tại (Gross ban đầu & Net còn lại tại tháng)
  natural_due_amount: number;
  natural_settled_amount: number;

  // (2) (-) Gốc đã đáo nợ sớm (Phần nợ của tháng này đã được kéo về các tháng trước < M)
  pulled_out_early_amount: number;
  natural_pulled_out_amount: number;
  redisbursed_pulled_out_amount: number;

  // (3) (+) Gốc đến hạn các khoản đảo nợ mới (Từ các khoản giải ngân lại ở kỳ M - term)
  re_disbursed_due_gross_amount: number;
  re_disbursed_due_amount: number; // Phần thực tế tất toán tại tháng M

  // (4) (+) Đảo nợ sớm (Kéo từ các tháng cao điểm > M về tháng M này)
  early_pulled_in_amount: number;

  // Tổng hợp
  initial_excess_amount: number;
  total_settled_amount: number;
  total_redisbursed_amount: number;
  remaining_ocf: number;
  shortfall_amount: number; // Phần vượt trần không giải cứu được

  items: RolloverExecutionItem[];
  pulled_out_items: RolloverExecutionItem[];
}

export interface DebtRolloverSimulationResult {
  horizon_months: number;
  total_active_principal: number;
  initial_overload_months_count: number;
  final_overload_months_count: number;
  total_early_rollover_volume: number;
  total_liquidity_shortfall: number;
  is_fully_feasible: boolean;
  monthly_buckets: MonthlyRolloverBucket[];
  unique_banks: Array<{
    bank_code: string;
    bank_name: string;
    total_principal: number;
    loans_count: number;
  }>;
}

// =============================================================================
// PHÂN HỆ QUẢN LÝ HẠN MỨC (HỢP ĐỒNG TÍN DỤNG, HỒ SƠ HẠN MỨC, TSĐB, CAM KẾT SAU VAY)
// =============================================================================

export interface LinkedLoanBrief {
  loan_id: number;
  contract_number: string;
  borrower_name: string;
  disbursement_date?: string | null;
  maturity_date?: string | null;
  interest_rate: number;
  original_principal_balance: number;
  current_principal_balance: number;
  status: string;
}

export interface LinkedCollateralBrief {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  owner_name: string;
  appraised_value: number;
  ltv_ratio: number;
  max_secured_loan_value: number;
  collateral_status: 'UNVALUED' | 'VALUED' | 'MORTGAGED' | 'RELEASED';
  latest_valuation_date?: string | null;
  requires_revaluation: boolean;
}

export interface SublimitItem {
  name: string;
  amount: number;
}

export interface CreditAgreement {
  agreement_id: number;
  agreement_uuid: string;
  bank_id?: number | null;
  bank_code: string;
  bank_name: string;
  agreement_number: string;
  agreement_name: string;
  entity_id?: number | null;
  entity_code?: string | null;
  entity_short_name?: string | null;
  borrower_name: string;
  total_credit_limit: number;
  loan_sublimit?: number | null;
  guarantee_sublimit?: number | null;
  lc_sublimit?: number | null;
  sublimits_json?: string | null;
  sublimits?: SublimitItem[];
  contract_file_name?: string | null;
  contract_file_path?: string | null;
  contract_file_size?: number | null;
  currency: string;
  signed_date?: string | null;
  effective_from: string;
  effective_to: string;
  interest_rate_framework?: string | null;
  collateral_summary?: string | null;
  status: string;
  computed_status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RENEWED' | 'SETTLED';
  days_to_expiry: number;
  parent_agreement_id?: number | null;
  parent_agreement_number?: string | null;
  renewed_to_agreement_id?: number | null;
  renewed_to_agreement_number?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Dynamic Aggregations
  active_loans_count: number;
  total_loans_count: number;
  utilized_loan_amount: number;
  available_credit_limit: number;
  utilization_pct: number;
  collateral_count: number;
  total_collateral_value: number;
  total_max_secured_value: number;
  linked_loans: LinkedLoanBrief[];
  linked_collaterals: LinkedCollateralBrief[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  category: string;
  is_required: boolean;
  is_completed: boolean;
  note?: string | null;
}

export interface CreditLimitDossierFile {
  file_id: number;
  file_uuid: string;
  dossier_id: number;
  category: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  description?: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface CreditLimitDossier {
  dossier_id: number;
  dossier_uuid: string;
  agreement_id?: number | null;
  agreement_number?: string | null;
  bank_code: string;
  bank_name: string;
  borrower_name: string;
  dossier_code: string;
  dossier_title: string;
  dossier_type: 'NEW_LIMIT' | 'RENEWAL' | 'INCREASE_LIMIT' | 'PERIODIC_REVIEW';
  proposed_limit_amount: number;
  approved_limit_amount?: number | null;
  submission_date?: string | null;
  approval_date?: string | null;
  expiry_review_date?: string | null;
  status: 'PREPARING' | 'SUBMITTED' | 'NEED_SUPPLEMENT' | 'APPROVED' | 'REJECTED';
  checklist: ChecklistItem[];
  completion_pct: number;
  responsible_person?: string | null;
  notes?: string | null;
  files: CreditLimitDossierFile[];
  created_at: string;
  updated_at: string;
}

export interface CollateralValuation {
  valuation_id: number;
  valuation_uuid: string;
  asset_id: number;
  valuation_org: string;
  valuation_amount: number;
  valuation_date: string;
  valuer_name?: string | null;
  report_number?: string | null;
  report_file_name?: string | null;
  report_storage_path?: string | null;
  report_file_size?: number | null;
  report_mime_type?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
}

export interface CollateralDocument {
  doc_id: number;
  doc_uuid: string;
  asset_id: number;
  doc_category: 'RED_BOOK' | 'SITE_PHOTO' | 'MORTGAGE_CONTRACT' | 'SECURITY_REGISTRATION' | 'OTHER';
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  description?: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface CollateralAgreementHistory {
  history_id: number;
  asset_id: number;
  from_agreement_id?: number | null;
  from_agreement_number?: string | null;
  to_agreement_id?: number | null;
  to_agreement_number?: string | null;
  bank_code?: string | null;
  action_type: 'INITIAL_MORTGAGE' | 'ROLLOVER_TRANSFER' | 'MANUAL_REASSIGN' | 'RELEASE';
  effective_date: string;
  notes?: string | null;
  performed_by: string;
  created_at: string;
}

export interface CollateralAsset {
  asset_id: number;
  asset_uuid: string;
  asset_code: string;
  asset_name: string;
  asset_type: 'REAL_ESTATE_LAND' | 'FACTORY_INDUSTRIAL' | 'MACHINERY_VEHICLE' | 'DEPOSIT_SAVINGS' | 'INVENTORY_RECEIVABLES' | 'OTHER';
  owner_name: string;
  owner_id_or_tax_code?: string | null;
  ownership_relation: 'BORROWER_OWNED' | 'THIRD_PARTY';
  borrower_name?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  agreement_id?: number | null;
  agreement_number?: string | null;
  agreement_status?: string | null;
  agreement_effective_to?: string | null;
  appraised_value: number;
  ltv_ratio: number;
  max_secured_loan_value: number;
  currency: string;
  collateral_status: 'UNVALUED' | 'VALUED' | 'MORTGAGED' | 'RELEASED';
  latest_valuation_date?: string | null;
  days_since_valuation?: number | null;
  requires_revaluation: boolean;
  revaluation_warning?: string | null;
  certificate_number?: string | null;
  certificate_issue_date?: string | null;
  certificate_issued_by?: string | null;
  address?: string | null;
  land_area_m2?: number | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  valuations: CollateralValuation[];
  documents: CollateralDocument[];
  agreement_history: CollateralAgreementHistory[];
}

export interface PostLoanCovenant {
  covenant_id: number;
  covenant_uuid: string;
  agreement_id: number;
  agreement_number?: string | null;
  loan_id?: number | null;
  loan_contract_number?: string | null;
  bank_code: string;
  bank_name: string;
  borrower_name: string;
  covenant_title: string;
  covenant_category: 'CASHFLOW_TURNOVER' | 'PERIODIC_REPORTING' | 'FINANCIAL_RATIO' | 'POST_DISBURSEMENT_DOC';
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  linked_account_id?: number | null;
  linked_account_number?: string | null;
  period_start?: string | null;
  due_date: string;
  days_until_due: number;
  target_value?: number | null;
  actual_value?: number | null;
  auto_casa_credit_turnover?: number | null;
  achievement_pct?: number | null;
  unit: string;
  compliance_status: 'COMPLIANT' | 'IN_PROGRESS' | 'DUE_SOON' | 'BREACHED';
  computed_compliance_status: 'COMPLIANT' | 'IN_PROGRESS' | 'DUE_SOON' | 'BREACHED';
  evidence_file_name?: string | null;
  evidence_storage_path?: string | null;
  responsible_person?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}
