export interface BankAccount {
  account_id: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  tax_code?: string | null;
  account_type: 'CORPORATE' | 'SPECIAL_CASH';
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface Transaction {
  transaction_id: number;
  file_id: number;
  account_id: number;
  bank_code?: string;
  account_number?: string;
  account_holder?: string;
  account_type?: 'CORPORATE' | 'SPECIAL_CASH';
  tax_code?: string;
  transaction_date: string;
  value_date?: string;
  reference_number?: string;
  counter_party?: string | null;
  description: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  category_id?: number | null;
  category_name?: string | null;
  category_type?: 'INCOME' | 'EXPENSE' | null;
  category_color?: string | null;
  internal_note?: string | null;
  is_manual_override: boolean;
  applied_rule_id?: number | null;
  dedup_hash: string;
}

export interface StatementFile {
  file_id: number;
  file_uuid: string;
  account_id?: number | null;
  bank_code?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  template_code?: string | null;
  reconciliation_mode?: string | null;
  original_filename: string;
  file_size_bytes: number;
  statement_period_start?: string | null;
  statement_period_end?: string | null;
  header_opening_balance?: number | null;
  header_closing_balance?: number | null;
  calculated_closing_balance?: number | null;
  total_credit_amount: number;
  total_debit_amount: number;
  total_transactions_count: number;
  processing_status: 'UPLOADED' | 'QUEUED' | 'PARSING' | 'RECONCILING' | 'COMPLETED' | 'FAILED';
  reconciliation_status: 'PENDING' | 'BALANCED' | 'DISCREPANCY';
  discrepancy_amount: number;
  error_message?: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface CFOBankBreakdownItem {
  account_id?: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  account_type?: 'CORPORATE' | 'SPECIAL_CASH';
  tax_code?: string | null;
  opening_balance: number;
  total_inflow: number;
  total_outflow: number;
  internal_inflow: number;
  internal_outflow: number;
  balance: number;
  closing_balance: number;
  net_change: number;
  net_change_pct?: number | null;
  share_pct: number;
  period_tx_count: number;
  reconciliation_status: 'BALANCED' | 'DISCREPANCY' | 'UNANCHORED' | 'NO_STATEMENT';
  reconciliation_mode?: string | null;
  discrepancy_amount: number;
  latest_tx_date?: string | null;
  last_uploaded_at?: string | null;
  latest_filename?: string | null;
  has_data_gap?: boolean;
  data_gap_desc?: string | null;
}

export interface CFOCashFundSummary {
  opening_balance: number;
  total_inflow: number;
  total_outflow: number;
  internal_inflow: number;
  closing_balance: number;
  net_change: number;
  net_change_pct?: number | null;
  share_pct: number;
  period_entry_count: number;
  latest_entry_date?: string | null;
}

export interface CFOLiquidityData {
  report_date: string;
  timeframe: 'TODAY' | 'YESTERDAY' | 'WTD' | 'MTD' | 'ALL' | 'CUSTOM';
  period_start?: string;
  period_end?: string;
  exclude_internal_transfers: boolean;
  internal_transfer_tx_count: number;
  internal_inflow_amount: number;
  internal_outflow_amount: number;
  opening_consolidated_liquidity: number;
  total_inflow_consolidated: number;
  total_outflow_consolidated: number;
  gross_inflow_consolidated: number;
  gross_outflow_consolidated: number;
  external_inflow_consolidated: number;
  external_outflow_consolidated: number;
  total_consolidated_liquidity: number;
  net_change_consolidated: number;
  net_change_consolidated_pct?: number | null;
  opening_bank_balance: number;
  total_bank_balance: number;
  corporate_bank_balance: number;
  special_cash_bank_balance: number;
  total_cash_on_hand: number;
  cash_summary?: CFOCashFundSummary | null;
  discrepancy_accounts_count: number;
  unanchored_accounts_count: number;
  data_gap_accounts_count?: number;
  bank_breakdown: CFOBankBreakdownItem[];
}

export interface CashLedgerEntry {
  cash_entry_id: number;
  linked_transaction_id?: number | null;
  entry_date: string;
  entry_type: 'INFLOW' | 'OUTFLOW';
  amount: number;
  running_cash_balance: number;
  receiver_payer?: string | null;
  reason: string;
  internal_note?: string | null;
  created_at: string;
}

export interface WaterfallStep {
  name: string;
  type: 'OPENING' | 'INCOME' | 'EXPENSE' | 'CLOSING';
  value: number;
  color_code?: string;
}

export interface CEOWaterfallData {
  timeframe: string;
  period_start?: string;
  period_end?: string;
  exclude_internal_transfers?: boolean;
  excluded_internal_transfers_count?: number;
  opening_balance: number;
  total_income?: number;
  total_expense?: number;
  income_components: Array<{ category_id?: number | null; category_name: string; color_code?: string; amount: number }>;
  expense_components: Array<{ category_id?: number | null; category_name: string; color_code?: string; amount: number }>;
  steps: WaterfallStep[];
  closing_balance: number;
}

export interface Category {
  category_id: number;
  category_type: 'INCOME' | 'EXPENSE';
  category_name: string;
  color_code: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface ClassificationRule {
  rule_id: number;
  category_id: number;
  category_name?: string;
  category_type?: 'INCOME' | 'EXPENSE';
  rule_name: string;
  priority: number;
  keyword_patterns: string;
  match_type: string;
  target_bank_code?: string | null;
  target_account_number?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
  applies_to_flow: string;
  is_active: boolean;
}

export * from './credit';

