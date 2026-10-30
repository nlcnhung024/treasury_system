import hashlib
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.security import verify_file_magic_bytes
from app.core.config import settings
from app.models.statement_file import BankStatementFile
from app.schemas.statement import StatementFileItem, StatementFileDetail, StatementStatusResponse
from app.schemas.common import PaginationMeta

router = APIRouter(prefix="/statements", tags=["Statements"])

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_statement(
    file: UploadFile = File(...),
    bank_code: Optional[str] = Form(None),
    template_code: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    # 1. Đọc 8 bytes đầu tiên để kiểm tra Magic Bytes nhị phân
    header_bytes = await file.read(8)
    file_type = verify_file_magic_bytes(header_bytes, file.filename)
    
    # 2. Đọc phần còn lại để tính mã băm SHA-256 chống trùng lặp
    remaining_bytes = await file.read()
    full_content = header_bytes + remaining_bytes
    file_size = len(full_content)

    if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dung lượng file ({file_size / (1024*1024):.2f}MB) vượt quá giới hạn cho phép 25MB."
        )

    file_sha256 = hashlib.sha256(full_content).hexdigest()

    # 3. Kiểm tra xem file đã tồn tại hay chưa
    stmt = select(BankStatementFile).where(BankStatementFile.file_sha256 == file_sha256)
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File sao kê này đã được tải lên trước đó (Trùng mã băm SHA-256)."
        )

    # 4. Ghi nhận bản ghi metadata trạng thái QUEUED
    new_uuid = uuid.uuid4()
    storage_path = f"/statements/{bank_code or 'UNKNOWN'}/2026/10/{new_uuid}_{file.filename}"
    
    new_file = BankStatementFile(
        file_uuid=new_uuid,
        bank_code=bank_code or "AUTO_DETECT",
        template_code=template_code,
        original_filename=file.filename,
        storage_path=storage_path,
        file_size_bytes=file_size,
        file_sha256=file_sha256,
        mime_type=file.content_type or "application/octet-stream",
        processing_status="QUEUED",
        reconciliation_status="PENDING",
        uploaded_by="Nghiêm Lê Cẩm Nhung"
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)

    # TODO: Đẩy Job {file_id, storage_path} vào Redis Streams / Celery Worker

    return {
        "file_id": new_file.file_id,
        "file_uuid": new_file.file_uuid,
        "filename": new_file.original_filename,
        "detected_template_code": template_code or "MBB_CORP_XLSX",
        "status": "QUEUED",
        "message": "File đã được tiếp nhận thành công và đưa vào hàng đợi bóc tách ngầm."
    }

@router.get("", response_model=dict)
async def list_statements(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BankStatementFile).order_by(desc(BankStatementFile.created_at)).offset((page - 1) * limit).limit(limit)
    res = await db.execute(stmt)
    files = res.scalars().all()

    return {
        "data": [StatementFileItem.model_validate(f) for f in files],
        "pagination": PaginationMeta(current_page=page, page_size=limit, total_records=len(files), total_pages=1)
    }

@router.get("/{file_id}/status", response_model=StatementStatusResponse)
async def get_statement_status(file_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(BankStatementFile).where(BankStatementFile.file_id == file_id)
    res = await db.execute(stmt)
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Không tìm thấy file sao kê")
    return StatementStatusResponse(
        file_id=f.file_id,
        template_code=f.template_code,
        reconciliation_mode=f.reconciliation_mode,
        processing_status=f.processing_status,
        reconciliation_status=f.reconciliation_status,
        total_transactions=f.total_transactions_count,
        discrepancy_amount=f.discrepancy_amount,
        error_message=f.error_message
    )

