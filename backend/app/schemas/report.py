from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class BankBreakdownItem(BaseModel):
    account_id: Optional[int] = None
    bank_code: str
    bank_name: str
    account_number: str
    account_holder: str
    account_type: str = "CORPORATE"
    tax_code: Optional[str] = None
    opening_balance: Decimal = Decimal("0.00")
    total_inflow: Decimal = Decimal("0.00")
    total_outflow: Decimal = Decimal("0.00")
    internal_inflow: Decimal = Decimal("0.00")
    internal_outflow: Decimal = Decimal("0.00")
    balance: Decimal
    closing_balance: Decimal = Decimal("0.00")
    net_change: Decimal = Decimal("0.00")
    net_change_pct: Optional[Decimal] = None
    share_pct: Decimal = Decimal("0.00")
    period_tx_count: int = 0
    reconciliation_status: str = "BALANCED"
    reconciliation_mode: Optional[str] = None
    discrepancy_amount: Decimal = Decimal("0.00")
    latest_tx_date: Optional[datetime] = None
    last_uploaded_at: Optional[datetime] = None
    latest_filename: Optional[str] = None
    has_data_gap: bool = False
    data_gap_desc: Optional[str] = None


class CashFundSummary(BaseModel):
    opening_balance: Decimal = Decimal("0.00")
    total_inflow: Decimal = Decimal("0.00")
    total_outflow: Decimal = Decimal("0.00")
    internal_inflow: Decimal = Decimal("0.00")
    closing_balance: Decimal = Decimal("0.00")
    net_change: Decimal = Decimal("0.00")
    net_change_pct: Optional[Decimal] = None
    share_pct: Decimal = Decimal("0.00")
    period_entry_count: int = 0
    latest_entry_date: Optional[date] = None


class CfoLiquidityResponse(BaseModel):
    report_date: date
    timeframe: str = "MTD"
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    exclude_internal_transfers: bool = False
    internal_transfer_tx_count: int = 0
    internal_inflow_amount: Decimal = Decimal("0.00")
    internal_outflow_amount: Decimal = Decimal("0.00")
    opening_consolidated_liquidity: Decimal = Decimal("0.00")
    total_inflow_consolidated: Decimal = Decimal("0.00")
    total_outflow_consolidated: Decimal = Decimal("0.00")
    gross_inflow_consolidated: Decimal = Decimal("0.00")
    gross_outflow_consolidated: Decimal = Decimal("0.00")
    external_inflow_consolidated: Decimal = Decimal("0.00")
    external_outflow_consolidated: Decimal = Decimal("0.00")
    total_consolidated_liquidity: Decimal
    net_change_consolidated: Decimal = Decimal("0.00")
    net_change_consolidated_pct: Optional[Decimal] = None
    opening_bank_balance: Decimal = Decimal("0.00")
    total_bank_balance: Decimal
    corporate_bank_balance: Decimal = Decimal("0.00")
    special_cash_bank_balance: Decimal = Decimal("0.00")
    total_cash_on_hand: Decimal
    cash_summary: Optional[CashFundSummary] = None
    discrepancy_accounts_count: int = 0
    unanchored_accounts_count: int = 0
    data_gap_accounts_count: int = 0
    bank_breakdown: List[BankBreakdownItem] = []


class WaterfallComponentItem(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    color_code: str = "#3B82F6"
    amount: Decimal


class WaterfallStepItem(BaseModel):
    name: str
    type: str  # OPENING, INCOME, EXPENSE, CLOSING
    value: Decimal
    color_code: Optional[str] = None


class WaterfallReportResponse(BaseModel):
    timeframe: str  # WTD, MTD, CUSTOM
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    exclude_internal_transfers: bool = False
    excluded_internal_transfers_count: int = 0
    opening_balance: Decimal
    total_income: Decimal = Decimal("0.00")
    total_expense: Decimal = Decimal("0.00")
    income_components: List[WaterfallComponentItem] = []
    expense_components: List[WaterfallComponentItem] = []
    steps: List[WaterfallStepItem] = []
    closing_balance: Decimal
