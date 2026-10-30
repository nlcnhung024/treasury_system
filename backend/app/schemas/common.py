from typing import Any, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field

class PaginationMeta(BaseModel):
    current_page: int = Field(default=1, example=1)
    page_size: int = Field(default=50, example=50)
    total_records: int = Field(default=0, example=1250)
    total_pages: int = Field(default=0, example=25)

class ErrorResponse(BaseModel):
    error_code: str = Field(..., example="VALIDATION_ERROR")
    message: str = Field(..., example="Dữ liệu đầu vào không hợp lệ")
    correlation_id: Optional[UUID] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: Optional[Any] = None

