from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class CorporateEntityBase(BaseModel):
    entity_code: Optional[str] = None
    company_name: str = Field(..., min_length=2, max_length=255, description="Tên pháp nhân đầy đủ hoặc họ và tên cá nhân")
    short_name: str = Field(..., min_length=1, max_length=100, description="Tên hiển thị ngắn gọn")
    tax_code: Optional[str] = Field(None, max_length=50, description="Mã số thuế hoặc CCCD")
    entity_type: str = Field("CORPORATE", description="Loại thực thể: CORPORATE, SPECIAL_CASH, INDIVIDUAL")
    is_holding_parent: bool = Field(False, description="Đánh dấu công ty mẹ hoặc pháp nhân nợ chính")
    description: Optional[str] = Field(None, description="Mô tả vai trò hoạt động trong hệ sinh thái")
    badge_label: Optional[str] = Field("Thành viên", max_length=50, description="Nhãn phân loại")
    color_class: Optional[str] = Field("bg-indigo-50 text-indigo-700 border-indigo-200", max_length=100)

class CorporateEntityCreate(CorporateEntityBase):
    pass

class CorporateEntityResponse(CorporateEntityBase):
    entity_id: int
    entity_code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
