from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel

class BankBreakdownItem(BaseModel):
    bank_code: str
    bank_name: str
    account_number: str
    account_holder: str
    balance: Decimal

class CfoLiquidityResponse(BaseModel):
    report_date: date
    total_consolidated_liquidity: Decimal
    total_bank_balance: Decimal
    total_cash_on_hand: Decimal
    bank_breakdown: List[BankBreakdownItem] = []

class WaterfallComponentItem(BaseModel):
    category_name: str
    amount: Decimal

class WaterfallStepItem(BaseModel):
    name: str
    type: str # OPENING, INCOME, EXPENSE, CLOSING
    value: Decimal

class WaterfallReportResponse(BaseModel):
    timeframe: str # WTD, MTD
    opening_balance: Decimal
    income_components: List[WaterfallComponentItem] = []
    expense_components: List[WaterfallComponentItem] = []
    steps: List[WaterfallStepItem] = []
    closing_balance: Decimal

