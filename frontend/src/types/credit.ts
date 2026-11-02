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
  uploaded_by: string;
  created_at: string;
  updated_at: string;
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
  current_principal_balance: number;
  accrued_interest: number;
  next_repayment_date?: string | null;
  next_principal_amount: number;
  next_interest_amount: number;
  total_repayment_amount: number;
  dossier_files_count?: number;
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
  current_principal_balance: number;
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
export type ReborrowMode = 'LUMP_SUM_STANDARD' | 'STAGGERED_SMOOTHING';

export interface MonthlyRepaymentComparisonItem {
  month: string;
  natural_due_amount: number;
  reborrowed_new_due_amount?: number;
  allocated_payment_amount: number;
  prepaid_principal_amount: number;
  regular_principal_amount: number;
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
  action_type: 'PAY_ON_DUE' | 'PARTIAL_PREPAYMENT' | 'FULL_PREPAYMENT' | 'ROLLOVER_REFINANCE' | 'NEW_REBORROW_DRAWDOWN';
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

