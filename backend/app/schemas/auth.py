from typing import List, Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    username: str = Field(..., example="nhung.nghiem@enterprise.internal")
    password: str = Field(..., example="P@ssw0rdSecure2026!")

class UserProfileResponse(BaseModel):
    user_id: int = Field(..., example=101)
    username: str = Field(..., example="nhung.nghiem")
    full_name: str = Field(..., example="Nghiêm Lê Cẩm Nhung")
    role: str = Field(..., example="ACCOUNTANT") # ACCOUNTANT, CFO, CEO, SYSTEM_ADMIN
    allowed_tax_codes: List[str] = Field(default_factory=list, example=["0109730501"])

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900
    refresh_token: str
    user: UserProfileResponse

