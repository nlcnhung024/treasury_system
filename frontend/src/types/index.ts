export interface Transaction {
  transaction_id: number;
  file_id: number;
  account_id: number;
  bank_code?: string;
  account_number?: string;
  account_holder?: string;
  tax_code?: string;
  transaction_date: string;
  value_date?: string;
  reference_number?: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  category_id?: number | null;
  category_name?: string | null;
  category_type?: 'INCOME' | 'EXPENSE' | null;
  internal_note?: string | null;
  is_manual_override: boolean;
  applied_rule_id?: number | null;
  dedup_hash: string;
}

export interface StatementFile {
  file_id: number;
  file_uuid: string;
  bank_code?: string;
  account_number?: string;
  original_filename: string;
  file_size_bytes: number;
  statement_period_start?: string;
  statement_period_end?: string;
  total_transactions_count: number;
  processing_status: 'UPLOADED' | 'QUEUED' | 'PARSING' | 'RECONCILING' | 'COMPLETED' | 'FAILED';
  reconciliation_status: 'PENDING' | 'BALANCED' | 'DISCREPANCY';
  discrepancy_amount: number;
  uploaded_by: string;
  created_at: string;
}

export interface CFOLiquidityData {
  report_date: string;
  total_consolidated_liquidity: number;
  total_bank_balance: number;
  total_cash_on_hand: number;
  bank_breakdown: Array<{
    bank_code: string;
    bank_name: string;
    account_number: string;
    account_holder: string;
    balance: number;
  }>;
}

export interface WaterfallStep {
  name: string;
  type: 'OPENING' | 'INCOME' | 'EXPENSE' | 'CLOSING';
  value: number;
}

export interface CEOWaterfallData {
  timeframe: string;
  opening_balance: number;
  income_components: Array<{ category_name: string; amount: number }>;
  expense_components: Array<{ category_name: string; amount: number }>;
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
  rule_name: string;
  priority: number;
  keyword_patterns: string;
  match_type: string;
  target_bank_code?: string;
  applies_to_flow: string;
  is_active: boolean;
}

