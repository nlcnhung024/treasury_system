import io
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.schemas.invoice import (
    InvoiceResponse,
    InvoiceListResponse,
    LoanBatchAllocationRequest,
    LoanAllocatedInvoicesResponse,
    SyncInvoicesFromLoansResponse,
)
from app.services import invoice_service
from app.services.storage_service import read_statement_bytes

router = APIRouter()


@router.post("/invoices/upload", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def upload_invoice(
    xml_file: UploadFile = File(..., description="File hóa đơn điện tử XML (chuẩn NĐ 123 / TT 78)"),
    pdf_file: Optional[UploadFile] = File(None, description="File PDF hóa đơn tương ứng (tùy chọn)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Tiếp nhận và bóc tách file hóa đơn điện tử XML vào Kho Hóa Đơn độc lập.
    Tự động liên kết với file PDF tương ứng nếu người dùng đính kèm cả 2 file.
    """
    if not xml_file.filename or not xml_file.filename.lower().endswith(".xml"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File hóa đơn chính phải có định dạng .xml theo chuẩn Tổng cục Thuế.",
        )

    xml_bytes = await xml_file.read()
    if not xml_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File XML rỗng.")

    pdf_bytes = None
    pdf_filename = None
    if pdf_file and pdf_file.filename:
        if not pdf_file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File đính kèm trực quan phải có định dạng .pdf.",
            )
        pdf_bytes = await pdf_file.read()
        pdf_filename = pdf_file.filename

    try:
        inv = await invoice_service.save_invoice_from_xml(
            db=db,
            xml_bytes=xml_bytes,
            xml_filename=xml_file.filename,
            pdf_bytes=pdf_bytes,
            pdf_filename=pdf_filename,
        )
        return inv
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi xử lý hóa đơn: {e}")


@router.post("/invoices/upload-batch", response_model=List[InvoiceResponse], status_code=status.HTTP_201_CREATED)
async def upload_invoices_batch(
    zip_file: UploadFile = File(..., description="Gói nạp ZIP chứa các file XML và PDF (tự động ghép cặp)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Nạp hàng loạt hóa đơn từ file ZIP (mẫu Sample_hoa_don).
    Hệ thống tự động quét toàn bộ file XML và tìm file PDF có cùng tên cơ sở để ghép cặp.
    """
    if not zip_file.filename or not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File nạp hàng loạt phải có định dạng .zip.",
        )

    zip_bytes = await zip_file.read()
    if not zip_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File ZIP rỗng.")

    try:
        invoices = await invoice_service.ingest_zip_package(db=db, zip_bytes=zip_bytes)
        return invoices
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi giải nén và xử lý gói hóa đơn: {e}")


@router.post("/invoices/{invoice_id}/attach-pdf", response_model=InvoiceResponse)
async def attach_pdf_to_invoice(
    invoice_id: int,
    pdf_file: UploadFile = File(..., description="File PDF hóa đơn tương ứng"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Bổ sung file PDF vào hóa đơn đã có sẵn trong kho."""
    if not pdf_file.filename or not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File phải có định dạng .pdf.")

    pdf_bytes = await pdf_file.read()
    try:
        inv = await invoice_service.attach_pdf_to_invoice(
            db=db,
            invoice_id=invoice_id,
            pdf_bytes=pdf_bytes,
            pdf_filename=pdf_file.filename,
        )
        return inv
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/invoices/sync-from-loans", response_model=SyncInvoicesFromLoansResponse)
async def sync_invoices_from_loans(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Quét toàn bộ hồ sơ giải ngân của các khoản vay (disbursement_documents).
    Nếu tìm thấy các file hóa đơn (XML/PDF) chưa có trong Kho Hóa Đơn,
    tự động bóc tách và nạp bổ sung vào Kho Hóa Đơn (invoices + invoice_items),
    đồng thời liên kết 2 chiều với chứng từ giải ngân.
    """
    try:
        stats = await invoice_service.sync_invoices_from_loan_dossiers(db=db)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi đồng bộ hóa đơn từ hồ sơ giải ngân: {e}",
        )


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    search: Optional[str] = Query(None, description="Tìm kiếm theo số HĐ, ký hiệu, đơn vị bán, MST"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: AVAILABLE, PARTIALLY_ALLOCATED, FULLY_ALLOCATED"),
    locked_bank_code: Optional[str] = Query(None, description="Lọc theo ngân hàng đang dùng"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách Bảng thống kê hóa đơn mà doanh nghiệp hiện đang có."""
    result = await invoice_service.list_invoices(
        db=db,
        search=search,
        status=status,
        locked_bank_code=locked_bank_code,
        limit=limit,
        offset=offset,
    )
    return result


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice_detail(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Xem chi tiết hóa đơn kèm danh mục mặt hàng và lịch sử nhận nợ."""
    inv = await invoice_service.get_invoice_by_id(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hóa đơn.")
    return inv


@router.get("/invoices/{invoice_id}/download-pdf")
async def download_invoice_pdf(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Tải hoặc xem file PDF hóa đơn tương ứng."""
    inv = await invoice_service.get_invoice_by_id(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hóa đơn.")
    if not inv.pdf_storage_path or not inv.has_pdf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hóa đơn này chưa có file PDF liên kết.")

    try:
        content = read_statement_bytes(inv.pdf_storage_path)
        filename = inv.pdf_file_name or f"invoice_{inv.invoice_number}.pdf"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không thể đọc file PDF: {e}")


@router.get("/invoices/{invoice_id}/download-xml")
async def download_invoice_xml(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Tải file XML hóa đơn gốc."""
    inv = await invoice_service.get_invoice_by_id(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hóa đơn.")
    if not inv.xml_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đường dẫn lưu file XML.")

    try:
        content = read_statement_bytes(inv.xml_storage_path)
        filename = inv.xml_file_name or f"invoice_{inv.invoice_number}.xml"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/xml",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không thể đọc file XML: {e}")


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Xóa hóa đơn khỏi kho nếu chưa được phân bổ nhận nợ cho khoản vay."""
    try:
        await invoice_service.delete_invoice(db, invoice_id)
        return {"message": "Đã xóa hóa đơn khỏi kho dữ liệu thành công."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# =============================================================================
# CÁC ENDPOINT PHÂN BỔ HÓA ĐƠN CHO KHOẢN VAY
# =============================================================================

@router.post("/loans/{loan_id}/allocate-invoices", response_model=LoanAllocatedInvoicesResponse)
async def allocate_invoices_to_loan(
    loan_id: int,
    payload: LoanBatchAllocationRequest,
    strict_principal_check: bool = Query(False, description="Bắt buộc tổng tiền nhận nợ bằng chính xác 100% gốc vay ban đầu"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Phân bổ hóa đơn bảo đảm nhận nợ cho khoản vay.
    Kiểm tra nghiêm ngặt:
    - Ràng buộc cùng một TCTD: hóa đơn đã gán cho ngân hàng nào thì phần còn lại chỉ được bảo đảm cho khoản vay cùng ngân hàng đó.
    - Số tiền nhận nợ không vượt quá hạn mức còn lại của hóa đơn.
    - Cảnh báo hoặc bắt buộc khớp chính xác giá trị gốc vay ban đầu.
    """
    try:
        user_name = current_user.get("sub", "SYSTEM") if isinstance(current_user, dict) else "SYSTEM"
        result = await invoice_service.allocate_invoices_to_loan(
            db=db,
            loan_id=loan_id,
            allocation_items=payload.allocations,
            strict_principal_check=strict_principal_check,
            user=user_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi phân bổ hóa đơn: {e}")


@router.get("/loans/{loan_id}/allocated-invoices", response_model=LoanAllocatedInvoicesResponse)
async def get_loan_allocated_invoices(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Xem danh sách hóa đơn và số tiền nhận nợ đang bảo đảm cho khoản vay."""
    try:
        return await invoice_service.get_loan_allocated_invoices(db, loan_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/loans/{loan_id}/allocated-invoices/{allocation_id}")
async def remove_loan_allocation(
    loan_id: int,
    allocation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Hủy phân bổ hóa đơn khỏi khoản vay và hoàn lại hạn mức cho hóa đơn."""
    try:
        await invoice_service.remove_loan_allocation(db, allocation_id)
        return {"message": "Đã hủy phân bổ hóa đơn và giải phóng hạn mức thành công."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
