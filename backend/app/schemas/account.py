from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

class BankAccountItem(BaseModel):
    account_id: int
    bank_id: Optional[int] = None
    bank_code: str
    bank_name: str
    account_number: str
    account_holder: str
    tax_code: Optional[str] = None
    account_type: str = "CORPORATE" # CORPORATE, SPECIAL_CASH
    currency: str = "VND"
    opening_balance: Decimal
    current_balance: Decimal
    is_active: bool

    class Config:
        from_attributes = True

class CreateAccountPayload(BaseModel):
    bank_id: Optional[int] = None
    bank_code: str = Field(..., example="MBB")
    bank_name: str = Field(..., example="Ngân hàng TMCP Quân Đội")
    account_number: str = Field(..., example="111386888")
    account_holder: str = Field(..., example="CONG TY CO PHAN XI MANG SUNRISE")
    tax_code: Optional[str] = Field(None, example="0109730501")
    account_type: str = Field(default="CORPORATE", example="CORPORATE")
    currency: str = Field(default="VND", example="VND")
    opening_balance: Decimal = Field(default=Decimal("0.00"), example=Decimal("0.00"))

