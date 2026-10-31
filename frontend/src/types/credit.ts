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
  current_principal_balance: number;
  accrued_interest: number;
  next_repayment_date?: string | null;
  next_principal_amount: number;
  next_interest_amount: number;
  total_repayment_amount: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

