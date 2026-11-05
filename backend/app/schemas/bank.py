from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class BankBase(BaseModel):
    bank_code: str = Field(..., max_length=20, example="MBB")
    bank_name: str = Field(..., max_length=150, example="Ngân hàng TMCP Quân Đội")
    branch_name: Optional[str] = Field(None, max_length=150, example="Chi nhánh Ba Đình")
    tax_code: Optional[str] = Field(None, max_length=50, example="0100283873")
    short_name: str = Field(..., max_length=50, example="MB")
    is_active: bool = Field(default=True)

class BankCreateRequest(BankBase):
    pass

class BankUpdateRequest(BaseModel):
    bank_code: Optional[str] = None
    bank_name: Optional[str] = None
    branch_name: Optional[str] = None
    tax_code: Optional[str] = None
    short_name: Optional[str] = None
    is_active: Optional[bool] = None

class BankItemResponse(BankBase):
    bank_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
