from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import LoginRequest, LoginResponse, UserProfileResponse
from app.core.security import create_access_token, create_refresh_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    # Mock user verification for initial development baseline
    if payload.username.startswith("nhung") or payload.username.startswith("admin"):
        user = UserProfileResponse(
            user_id=101,
            username=payload.username,
            full_name="Nghiêm Lê Cẩm Nhung",
            role="ACCOUNTANT",
            allowed_tax_codes=["0109730501"]
        )
    elif "tuan" in payload.username:
        user = UserProfileResponse(
            user_id=102,
            username=payload.username,
            full_name="Trần Ngọc Tuấn",
            role="CFO",
            allowed_tax_codes=["0109730501"]
        )
    elif "lananh" in payload.username:
        user = UserProfileResponse(
            user_id=103,
            username=payload.username,
            full_name="Nguyễn Thị Lan Anh",
            role="CEO",
            allowed_tax_codes=["0109730501"]
        )
    else:
        user = UserProfileResponse(
            user_id=104,
            username=payload.username,
            full_name="Quản trị viên",
            role="SYSTEM_ADMIN",
            allowed_tax_codes=["0109730501"]
        )

    token_data = {"sub": user.username, "user_id": user.user_id, "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=900,
        refresh_token=refresh_token,
        user=user
    )

@router.get("/me", response_model=UserProfileResponse)
async def get_me():
    return UserProfileResponse(
        user_id=101,
        username="nhung.nghiem",
        full_name="Nghiêm Lê Cẩm Nhung",
        role="ACCOUNTANT",
        allowed_tax_codes=["0109730501"]
    )

