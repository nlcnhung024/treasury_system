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
  invoice_total_amount?: number | null;
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
  original_principal_balance?: number;
  total_repaid_principal?: number;
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

export type CapacityMode = 'UNIFORM' | 'SEASONAL';
export type RepaymentStrategy = 'SPLIT_LARGE_LOANS' | 'AVALANCHE' | 'SNOWBALL' | 'BALANCED';
export type ReborrowMode = 'SRPR_OPTIMAL' | 'LUMP_SUM_STANDARD' | 'STAGGERED_SMOOTHING';

export interface MonthlyRepaymentComparisonItem {
  month: string;
  natural_due_amount: number;
  reborrowed_new_due_amount?: number;
  bridged_due_amount?: number;
  intraday_reroute_cut_amount?: number;
  allocated_payment_amount: number;
  prepaid_principal_amount: number;
  regular_principal_amount: number;
  closing_total_debt?: number;
  reroute_destination_note?: string;
  monthly_capacity: number;
  remaining_capacity: number;
  is_safe: boolean;
  status_label: 'SAFE' | 'REFINANCED' | 'OVER_CAPACITY';
}

export interface LoanAllocationActionItem {
  loan_id: number;
  bank_code: string;
  contract_number: string;
  original_balance: number;
  interest_rate: number;
  original_due_date?: string | null;
  action_type: 'PAY_ON_DUE' | 'PARTIAL_PREPAYMENT' | 'FULL_PREPAYMENT' | 'ROLLOVER_REFINANCE' | 'NEW_REBORROW_DRAWDOWN' | 'STEPPED_BRIDGING_DRAWDOWN' | 'INTRADAY_PREPAY_REROUTE' | 'MATURITY_ROLLOVER';
  payment_month: string;
  payment_amount: number;
  remaining_balance_after: number;
  days_early: number;
  estimated_interest_saved: number;
  prepayment_penalty_fee: number;
  rollover_new_maturity?: string | null;
  note: string;
}

export interface DebtRepaymentPlanResponse {
  total_principal_debt: number;
  total_loans_count: number;
  capacity_mode: CapacityMode;
  uniform_monthly_capacity: number;
  prepayment_penalty_rate: number;
  strategy: RepaymentStrategy;
  reborrow_rate: number;
  reborrow_mode: ReborrowMode;
  total_reborrowed_amount: number;
  total_cut_and_reborrowed_amount?: number;
  reborrow_summary_note: string;
  peak_debt_before: number;
  peak_debt_after: number;
  peak_reduction_percent: number;
  total_interest_saved: number;
  total_penalty_incurred: number;
  net_financial_benefit: number;
  monthly_schedule: MonthlyRepaymentComparisonItem[];
  allocations: LoanAllocationActionItem[];
}

export interface RepaymentPlanSimulateRequest {
  capacity_mode: CapacityMode;
  uniform_monthly_capacity: number;
  seasonal_capacities?: Record<string, number>;
  prepayment_penalty_rate: number;
  strategy: RepaymentStrategy;
  mb_tenor_months: number;
  ctg_tenor_months: number;
  reborrow_rate: number;
  reborrow_mode: ReborrowMode;
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
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  previous_principal_balance: number;
  remaining_principal_balance: number;
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


