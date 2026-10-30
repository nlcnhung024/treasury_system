from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

class CategoryItem(BaseModel):
    category_id: int
    category_type: str # INCOME / EXPENSE
    category_name: str
    color_code: str
    description: Optional[str] = None
    display_order: int
    is_active: bool

    class Config:
        from_attributes = True

class CreateCategoryPayload(BaseModel):
    category_type: str = Field(..., example="EXPENSE")
    category_name: str = Field(..., example="Chi Nhà cung cấp Thép")
    color_code: str = Field(default="#3B82F6", example="#EF4444")
    description: Optional[str] = None
    display_order: int = 0

class RuleItem(BaseModel):
    rule_id: int
    category_id: int
    category_name: Optional[str] = None
    category_type: Optional[str] = None
    rule_name: str
    priority: int
    keyword_patterns: str
    match_type: str = "CONTAINS"
    target_bank_code: Optional[str] = None
    target_account_number: Optional[str] = None
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None
    applies_to_flow: str = "DEBIT"
    is_active: bool

    class Config:
        from_attributes = True

class CreateRulePayload(BaseModel):
    rule_name: str = Field(..., example="Quy tắc Chi NCC Thép Hòa Phát")
    category_id: int = Field(..., example=3)
    priority: int = Field(default=10, example=10)
    keyword_patterns: str = Field(..., example="thep hoa phat, hoa phat, hp steel")
    match_type: str = Field(default="CONTAINS", example="CONTAINS")
    target_bank_code: Optional[str] = None
    target_account_number: Optional[str] = None
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None
    applies_to_flow: str = Field(default="DEBIT", example="DEBIT")

class ReapplyRulesResponse(BaseModel):
    total_processed: int
    tagged_count: int
    skipped_manual_override_count: int
    message: str

