from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        # Development fallback / mock user if no token provided during early local development
        return {
            "user_id": 101,
            "username": "nhung.nghiem",
            "full_name": "Nghiêm Lê Cẩm Nhung",
            "role": "ACCOUNTANT",
            "allowed_tax_codes": ["0109730501"]
        }
    payload = decode_token(token)
    return payload

def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role")
        if user_role not in allowed_roles and "SYSTEM_ADMIN" not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tài khoản vai trò '{user_role}' không có quyền truy cập tài nguyên này."
            )
        return current_user
    return role_checker

