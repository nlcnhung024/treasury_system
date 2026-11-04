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



