from datetime import date
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
    balance: Decimal


class CfoLiquidityResponse(BaseModel):
    report_date: date
    total_consolidated_liquidity: Decimal
    total_bank_balance: Decimal
    total_cash_on_hand: Decimal
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
