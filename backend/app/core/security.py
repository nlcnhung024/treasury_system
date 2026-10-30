from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DANGEROUS_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '\n')

MAGIC_BYTES = {
    "XLSX": b"\x50\x4B\x03\x04",  # PK zip header
    "XLS": b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"  # Compound File Binary Format
}

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

def sanitize_excel_cell(value: Any) -> Any:
    """
    Phòng chống triệt để Formula/CSV Injection (CWE-1236).
    Thêm ký tự nháy đơn (') vào đầu các ô chuỗi bắt đầu bằng '=', '+', '-', '@', '\t', '\r', '\n'.
    """
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned.startswith(DANGEROUS_FORMULA_PREFIXES):
            return f"'{cleaned}"
    return value

def verify_file_magic_bytes(header_bytes: bytes, filename: str) -> str:
    """
    Kiểm tra Magic Bytes nhị phân 8 bytes đầu tiên của file để xác thực định dạng thực tế.
    """
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if ext == 'xlsx':
        if header_bytes.startswith(MAGIC_BYTES["XLSX"]):
            return "XLSX"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File có đuôi .xlsx nhưng không khớp chữ ký nhị phân PK Zip hợp lệ."
        )
    elif ext == 'xls':
        if header_bytes.startswith(MAGIC_BYTES["XLS"]):
            return "XLS"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File có đuôi .xls nhưng không khớp chữ ký nhị phân Compound File OLE hợp lệ."
        )
    elif ext == 'csv':
        return "CSV"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng file .{ext} không được hỗ trợ. Chỉ chấp nhận .xlsx, .xls, .csv."
        )

