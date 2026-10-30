import hashlib
import socket
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Form, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import verify_file_magic_bytes
from app.core.config import settings
from app.models.statement_file import BankStatementFile
from app.models.account import BankAccount
from app.schemas.statement import StatementFileItem, StatementFileDetail, StatementStatusResponse
from app.schemas.common import PaginationMeta
from app.services.storage_service import save_statement_bytes
from app.services.parser.template_detector import detect_bank_template
from app.services.ingestion_service import process_statement_file, run_background_parse_task

router = APIRouter(prefix="/statements", tags=["Statements"])


def _is_redis_reachable() -> bool:
    try:
        with socket.create_connection((settings.REDIS_HOST, settings.REDIS_PORT), timeout=0.2):
            return True
    except OSError:
        return False


def _serialize_statement_item(f: BankStatementFile) -> StatementFileItem:
    acc: Optional[BankAccount] = f.account
    bank_code = acc.bank_code if acc else (f.template_code.split("_")[0] if f.template_code else None)
    account_number = acc.account_number if acc else None
    account_holder = acc.account_holder if acc else None
    return StatementFileItem(
        file_id=f.file_id,
        file_uuid=f.file_uuid,
        account_id=f.account_id,
        bank_code=bank_code,
        account_number=account_number,
        account_holder=account_holder,
        template_code=f.template_code,
        reconciliation_mode=f.reconciliation_mode,
        original_filename=f.original_filename,
        file_size_bytes=f.file_size_bytes,
        statement_period_start=f.statement_period_start,
        statement_period_end=f.statement_period_end,
        header_opening_balance=f.header_opening_balance,
        header_closing_balance=f.header_closing_balance,
        calculated_closing_balance=f.calculated_closing_balance,
        total_credit_amount=f.total_credit_amount,
        total_debit_amount=f.total_debit_amount,
        total_transactions_count=f.total_transactions_count,
        processing_status=f.processing_status,
        reconciliation_status=f.reconciliation_status,
        discrepancy_amount=f.discrepancy_amount,
        error_message=f.error_message,
        uploaded_by=f.uploaded_by,
        created_at=f.created_at,
    )


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    bank_code: Optional[str] = Form(None),
    template_code: Optional[str] = Form(None),
    async_mode: bool = Query(False, description="Đẩy sang hàng đợi ngầm nếu bật"),
    db: AsyncSession = Depends(get_db),
):
    # 1. Đọc 8 bytes đầu tiên để kiểm tra Magic Bytes nhị phân
    header_bytes = await file.read(8)
    verify_file_magic_bytes(header_bytes, file.filename or "statement.xlsx")

    # 2. Đọc phần còn lại để tính mã băm SHA-256 chống trùng lặp
    remaining_bytes = await file.read()
    full_content = header_bytes + remaining_bytes
    file_size = len(full_content)

    if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dung lượng file ({file_size / (1024*1024):.2f}MB) vượt quá giới hạn cho phép 25MB.",
        )

    file_sha256 = hashlib.sha256(full_content).hexdigest()

    # 3. Kiểm tra xem file đã tồn tại hay chưa
    stmt = select(BankStatementFile).where(BankStatementFile.file_sha256 == file_sha256)
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File sao kê này đã được tải lên trước đó (Trùng mã băm SHA-256).",
        )

    # 4. Tự động nhận diện mẫu ngân hàng qua TemplateDetector (kể cả khi chọn nhầm ngân hàng trên UI)
    try:
        detected_template_code, detected_cfg = detect_bank_template(
            full_content, filename=file.filename or "", hint_template_code=template_code
        )
        detected_bank_code = detected_cfg.get("bank_code", "UNKNOWN")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    bank_mismatch_warning = None
    if bank_code and bank_code not in ("AUTO_DETECT", "AUTO", "") and bank_code.upper() != detected_bank_code.upper():
        bank_mismatch_warning = (
            f"Bạn đã chọn '{bank_code}', nhưng hệ thống tự động nhận diện nội dung file thuộc "
            f"'{detected_bank_code}' (Mẫu {detected_template_code}) và đã tự động điều chỉnh."
        )

    # 5. Lưu file gốc vào Hybrid Storage (MinIO + Local Disk fallback)
    now = datetime.now()
    new_uuid = uuid.uuid4()
    safe_filename = (file.filename or "statement.xlsx").replace("/", "_").replace("\\", "_")
    storage_path = f"/statements/{detected_bank_code}/{now.year}/{now.month:02d}/{new_uuid}_{safe_filename}"
    save_statement_bytes(
        storage_path=storage_path,
        content=full_content,
        content_type=file.content_type or "application/octet-stream",
    )

    new_file = BankStatementFile(
        file_uuid=new_uuid,
        template_code=detected_template_code,
        reconciliation_mode=detected_cfg.get("reconciliation_mode"),
        original_filename=safe_filename,
        storage_path=storage_path,
        file_size_bytes=file_size,
        file_sha256=file_sha256,
        mime_type=file.content_type or "application/octet-stream",
        processing_status="QUEUED",
        reconciliation_status="PENDING",
        uploaded_by="Nghiêm Lê Cẩm Nhung",
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)

    # 6. Thực thi bóc tách & đối soát theo chế độ Hybrid Dual-Mode
    if async_mode:
        if _is_redis_reachable():
            try:
                from workers.statement_tasks import parse_statement_file_task

                parse_statement_file_task.delay(new_file.file_id, storage_path, detected_bank_code)
            except Exception:
                background_tasks.add_task(run_background_parse_task, new_file.file_id)
        else:
            background_tasks.add_task(run_background_parse_task, new_file.file_id)

        return {
            "file_id": new_file.file_id,
            "file_uuid": new_file.file_uuid,
            "filename": new_file.original_filename,
            "detected_bank_code": detected_bank_code,
            "detected_template_code": detected_template_code,
            "status": "QUEUED",
            "warning": bank_mismatch_warning,
            "message": "File đã được tiếp nhận và đưa vào hàng đợi bóc tách ngầm.",
        }
    else:
        result = await process_statement_file(new_file.file_id, db)
        msg = (
            f"Đã bóc tách thành công {result['processed_rows']} dòng giao dịch "
            f"(Mẫu {detected_template_code} • Đối soát: {result['reconciliation_status']})."
        )
        if bank_mismatch_warning:
            msg = f"{bank_mismatch_warning} {msg}"
        return {
            "file_id": new_file.file_id,
            "file_uuid": new_file.file_uuid,
            "filename": new_file.original_filename,
            "detected_bank_code": detected_bank_code,
            "detected_template_code": detected_template_code,
            "status": result["status"],
            "reconciliation_status": result["reconciliation_status"],
            "processed_rows": result["processed_rows"],
            "inserted_rows": result["inserted_rows"],
            "discrepancy_amount": result["discrepancy_amount"],
            "warning": bank_mismatch_warning,
            "message": msg,
        }


@router.get("", response_model=dict)
async def list_statements(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_stmt = select(func.count(BankStatementFile.file_id))
    total_records = (await db.execute(count_stmt)).scalar() or 0
    total_pages = max(1, (total_records + limit - 1) // limit)

    stmt = (
        select(BankStatementFile)
        .options(selectinload(BankStatementFile.account))
        .order_by(desc(BankStatementFile.created_at), desc(BankStatementFile.file_id))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    res = await db.execute(stmt)
    files = res.scalars().all()

    return {
        "data": [_serialize_statement_item(f) for f in files],
        "pagination": PaginationMeta(
            current_page=page,
            page_size=limit,
            total_records=total_records,
            total_pages=total_pages,
        ),
    }


@router.get("/{file_id}", response_model=StatementFileDetail)
async def get_statement_detail(file_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(BankStatementFile)
        .options(selectinload(BankStatementFile.account))
        .where(BankStatementFile.file_id == file_id)
    )
    res = await db.execute(stmt)
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Không tìm thấy file sao kê")

    base_item = _serialize_statement_item(f)
    return StatementFileDetail(
        **base_item.model_dump(),
        storage_path=f.storage_path,
        file_sha256=f.file_sha256,
    )


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
        error_message=f.error_message,
    )


@router.delete("/{file_id}", status_code=status.HTTP_200_OK)
async def delete_statement_file(file_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(BankStatementFile).where(BankStatementFile.file_id == file_id)
    res = await db.execute(stmt)
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Không tìm thấy file sao kê")

    await db.delete(f)
    await db.commit()
    return {"message": f"Đã xóa file sao kê '{f.original_filename}' (ID: {file_id}) và các giao dịch liên kết."}
