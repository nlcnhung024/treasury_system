from datetime import datetime, date
from decimal import Decimal
import hashlib
import io
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
import zipfile

from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice, InvoiceItem, LoanInvoiceAllocation
from app.models.credit import CreditFacility, DisbursementDocument
from app.services.invoice_parser_service import parse_xml_invoice_bytes
from app.services.storage_service import save_statement_bytes, read_statement_bytes
from app.schemas.invoice import SingleAllocationItem, LoanAllocatedInvoicesResponse, LoanAllocationItemResponse

logger = logging.getLogger(__name__)


def compute_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


async def save_invoice_from_xml(
    db: AsyncSession,
    xml_bytes: bytes,
    xml_filename: str,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> Invoice:
    """
    Tiếp nhận, bóc tách và lưu trữ hóa đơn điện tử XML độc lập vào Kho Hóa Đơn.
    Tự động liên kết file PDF tương ứng nếu được cung cấp.
    """
    parsed = parse_xml_invoice_bytes(xml_bytes)
    if not parsed["is_valid_invoice"]:
        raise ValueError("File XML không đúng định dạng hóa đơn điện tử hợp lệ (NĐ 123 / TT 78).")

    xml_sha = compute_sha256(xml_bytes)
    inv_uuid = uuid.uuid4()
    xml_storage_path = f"invoices/xml/{inv_uuid}_{xml_filename}"
    save_statement_bytes(xml_storage_path, xml_bytes, "application/xml")

    pdf_storage_path = None
    pdf_sha = None
    pdf_size = None
    if pdf_bytes and pdf_filename:
        pdf_sha = compute_sha256(pdf_bytes)
        pdf_storage_path = f"invoices/pdf/{inv_uuid}_{pdf_filename}"
        save_statement_bytes(pdf_storage_path, pdf_bytes, "application/pdf")
        pdf_size = len(pdf_bytes)

    seller_tax_code = parsed["seller_tax_code"] or "UNKNOWN"
    invoice_series = parsed["invoice_series"] or "UNKNOWN"
    invoice_number = parsed["invoice_number"] or "UNKNOWN"

    # Kiểm tra hóa đơn đã tồn tại trong CSDL chưa
    stmt = (
        select(Invoice)
        .where(
            Invoice.seller_tax_code == seller_tax_code,
            Invoice.invoice_series == invoice_series,
            Invoice.invoice_number == invoice_number,
        )
        .options(selectinload(Invoice.items), selectinload(Invoice.allocations))
    )
    result = await db.execute(stmt)
    existing_inv = result.scalar_one_or_none()

    if existing_inv:
        # Cập nhật file XML & PDF mới nếu có
        existing_inv.xml_file_name = xml_filename
        existing_inv.xml_storage_path = xml_storage_path
        existing_inv.xml_file_sha256 = xml_sha
        existing_inv.xml_file_size = len(xml_bytes)
        if pdf_bytes and pdf_filename:
            existing_inv.pdf_file_name = pdf_filename
            existing_inv.pdf_storage_path = pdf_storage_path
            existing_inv.pdf_file_sha256 = pdf_sha
            existing_inv.pdf_file_size = pdf_size
            existing_inv.has_pdf = True
        await db.commit()
        await db.refresh(existing_inv)
        return existing_inv

    # Parse ngày lập
    inv_date = date.today()
    if parsed.get("invoice_date"):
        try:
            # Hỗ trợ YYYY-MM-DD hoặc YYYY-MM-DDTHH:MM:SS
            raw_d = parsed["invoice_date"][:10]
            inv_date = date.fromisoformat(raw_d)
        except Exception:
            pass

    total_amount = parsed["total_amount"] or Decimal("0.00")
    subtotal_amount = parsed.get("subtotal_amount") or Decimal("0.00")
    tax_amount = parsed.get("tax_amount") or Decimal("0.00")
    if total_amount == Decimal("0.00") and subtotal_amount > Decimal("0.00"):
        total_amount = subtotal_amount + tax_amount

    new_invoice = Invoice(
        invoice_uuid=inv_uuid,
        entity_id=entity_id,
        invoice_number=invoice_number,
        invoice_series=invoice_series,
        invoice_template=parsed.get("invoice_template") or "1",
        invoice_date=inv_date,
        tax_authority_code=parsed.get("tax_authority_code"),
        seller_tax_code=seller_tax_code,
        seller_name=parsed.get("seller_name") or "Chưa rõ bên bán",
        seller_address=parsed.get("seller_address"),
        buyer_tax_code=parsed.get("buyer_tax_code") or "UNKNOWN",
        buyer_name=parsed.get("buyer_name") or "Chưa rõ bên mua",
        buyer_address=parsed.get("buyer_address"),
        currency=parsed.get("currency") or "VND",
        exchange_rate=parsed.get("exchange_rate") or Decimal("1.0000"),
        subtotal_amount=subtotal_amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        allocated_amount=Decimal("0.00"),
        remaining_amount=total_amount,
        locked_bank_code=None,
        status="AVAILABLE",
        xml_file_name=xml_filename,
        xml_storage_path=xml_storage_path,
        xml_file_sha256=xml_sha,
        xml_file_size=len(xml_bytes),
        pdf_file_name=pdf_filename,
        pdf_storage_path=pdf_storage_path,
        pdf_file_sha256=pdf_sha,
        pdf_file_size=pdf_size,
        has_pdf=bool(pdf_storage_path),
    )
    db.add(new_invoice)
    await db.flush()

    # Thêm chi tiết các dòng hàng
    for item_data in parsed.get("items", []):
        inv_item = InvoiceItem(
            invoice_id=new_invoice.invoice_id,
            line_number=item_data["line_number"],
            item_name=item_data["item_name"],
            unit=item_data.get("unit"),
            quantity=item_data.get("quantity"),
            unit_price=item_data.get("unit_price"),
            subtotal=item_data["subtotal"],
            tax_rate=item_data.get("tax_rate"),
            tax_amount=item_data.get("tax_amount") or Decimal("0.00"),
        )
        db.add(inv_item)

    await db.commit()
    await db.refresh(new_invoice)
    return new_invoice


async def attach_pdf_to_invoice(
    db: AsyncSession,
    invoice_id: int,
    pdf_bytes: bytes,
    pdf_filename: str,
) -> Invoice:
    """Gán/bổ sung file PDF vào hóa đơn đã có sẵn trong kho."""
    stmt = (
        select(Invoice)
        .where(Invoice.invoice_id == invoice_id)
        .options(selectinload(Invoice.items), selectinload(Invoice.allocations))
    )
    res = await db.execute(stmt)
    inv = res.scalar_one_or_none()
    if not inv:
        raise ValueError(f"Không tìm thấy hóa đơn #{invoice_id}")

    pdf_sha = compute_sha256(pdf_bytes)
    storage_path = f"invoices/pdf/{inv.invoice_uuid}_{pdf_filename}"
    save_statement_bytes(storage_path, pdf_bytes, "application/pdf")

    inv.pdf_file_name = pdf_filename
    inv.pdf_storage_path = storage_path
    inv.pdf_file_sha256 = pdf_sha
    inv.pdf_file_size = len(pdf_bytes)
    inv.has_pdf = True

    await db.commit()
    await db.refresh(inv)
    return inv


async def ingest_zip_package(
    db: AsyncSession,
    zip_bytes: bytes,
    entity_id: Optional[int] = None,
) -> List[Invoice]:
    """
    Tiếp nhận gói nạp hàng loạt (file ZIP chứa các file XML và PDF).
    Tự động ghép cặp (auto-pairing) giữa XML và PDF có cùng stem / tên cơ sở.
    Ví dụ: Sample_hoa_don chứa file .xml và file .pdf có cùng tên.
    """
    invoices: List[Invoice] = []
    xml_files: Dict[str, Tuple[str, bytes]] = {}  # stem -> (filename, bytes)
    pdf_files: Dict[str, Tuple[str, bytes]] = {}  # stem -> (filename, bytes)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            fname = info.filename.replace("\\", "/").split("/")[-1]
            if not fname or fname.startswith("."):
                continue
            lower_name = fname.lower()
            file_bytes = zf.read(info.filename)

            if lower_name.endswith(".xml"):
                stem = fname[:-4]
                xml_files[stem] = (fname, file_bytes)
            elif lower_name.endswith(".pdf"):
                stem = fname[:-4]
                pdf_files[stem] = (fname, file_bytes)

    # Xử lý từng file XML và ghép cặp PDF
    for stem, (xml_name, xml_data) in xml_files.items():
        matched_pdf = pdf_files.get(stem)
        pdf_name = matched_pdf[0] if matched_pdf else None
        pdf_data = matched_pdf[1] if matched_pdf else None

        try:
            inv = await save_invoice_from_xml(
                db=db,
                xml_bytes=xml_data,
                xml_filename=xml_name,
                pdf_bytes=pdf_data,
                pdf_filename=pdf_name,
                entity_id=entity_id,
            )
            invoices.append(inv)
        except Exception as e:
            logger.warning(f"Bỏ qua file XML {xml_name} do lỗi: {e}")

    return invoices


async def list_invoices(
    db: AsyncSession,
    search: Optional[str] = None,
    status: Optional[str] = None,
    locked_bank_code: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Lấy danh sách Bảng thống kê hóa đơn mà doanh nghiệp hiện đang có.
    Hỗ trợ tìm kiếm, lọc theo trạng thái và tổ chức tín dụng.
    Tự động đồng bộ hóa đơn từ hồ sơ giải ngân nếu phát hiện có chứng từ hóa đơn chưa liên kết vào kho.
    """
    # Tự động đồng bộ hóa đơn từ hồ sơ giải ngân nếu có chứng từ chưa liên kết vào kho
    unsynced_stmt = select(func.count(DisbursementDocument.document_id)).where(
        DisbursementDocument.document_type == "INVOICE",
        DisbursementDocument.invoice_id.is_(None),
    )
    unsynced_count = (await db.execute(unsynced_stmt)).scalar() or 0
    if unsynced_count > 0:
        try:
            await sync_invoices_from_loan_dossiers(db)
        except Exception as e:
            logger.warning(f"Lỗi khi tự động đồng bộ hóa đơn từ hồ sơ giải ngân: {e}")

    conditions = []
    if search:
        s = f"%{search.strip()}%"
        conditions.append(
            or_(
                Invoice.invoice_number.ilike(s),
                Invoice.invoice_series.ilike(s),
                Invoice.seller_name.ilike(s),
                Invoice.seller_tax_code.ilike(s),
                Invoice.buyer_name.ilike(s),
            )
        )
    if status:
        conditions.append(Invoice.status == status)
    if locked_bank_code:
        conditions.append(Invoice.locked_bank_code == locked_bank_code)

    where_clause = and_(*conditions) if conditions else True

    # Tổng số lượng
    count_stmt = select(func.count(Invoice.invoice_id)).where(where_clause)
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Tổng giá trị, đã phân bổ, còn lại
    agg_stmt = (
        select(
            func.coalesce(func.sum(Invoice.total_amount), 0),
            func.coalesce(func.sum(Invoice.allocated_amount), 0),
            func.coalesce(func.sum(Invoice.remaining_amount), 0),
        )
        .where(where_clause)
    )
    agg_res = (await db.execute(agg_stmt)).one()
    total_value = Decimal(str(agg_res[0]))
    total_allocated = Decimal(str(agg_res[1]))
    total_remaining = Decimal(str(agg_res[2]))

    # Lấy items
    stmt = (
        select(Invoice)
        .where(where_clause)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.allocations).selectinload(LoanInvoiceAllocation.loan),
        )
        .order_by(Invoice.invoice_date.desc(), Invoice.invoice_id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = (await db.execute(stmt)).scalars().all()

    return {
        "items": items,
        "total": total_count,
        "total_value": total_value,
        "total_allocated": total_allocated,
        "total_remaining": total_remaining,
    }


async def get_invoice_by_id(db: AsyncSession, invoice_id: int) -> Optional[Invoice]:
    stmt = (
        select(Invoice)
        .where(Invoice.invoice_id == invoice_id)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.allocations).selectinload(LoanInvoiceAllocation.loan),
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def allocate_invoices_to_loan(
    db: AsyncSession,
    loan_id: int,
    allocation_items: List[SingleAllocationItem],
    strict_principal_check: bool = False,
    user: str = "SYSTEM",
) -> LoanAllocatedInvoicesResponse:
    """
    Phân bổ hóa đơn bảo đảm nhận nợ cho khoản vay theo các nguyên tắc nghiêm ngặt:
    1. Một khoản vay được bảo đảm bởi một hoặc nhiều hóa đơn.
    2. Mỗi hóa đơn có số tiền nhận nợ allocated_amount <= giá trị còn lại của hóa đơn.
    3. Tổng số tiền nhận nợ từ các hóa đơn gán cho khoản vay phải BẰNG CHÍNH XÁC giá trị gốc vay ban đầu của khoản vay (khi strict_principal_check=True hoặc kiểm tra trạng thái fully_secured).
    4. RÀNG BUỘC CÙNG TỔ CHỨC TÍN DỤNG: Nếu hóa đơn nhận nợ 1 phần, phần còn lại CHỈ ĐƯỢC PHÉP bảo đảm cho các khoản vay CÙNG MỘT TỔ CHỨC TÍN DỤNG (cùng bank_code).
    """
    # 1. Tải khoản vay
    stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan_res = await db.execute(stmt_loan)
    loan = loan_res.scalar_one_or_none()
    if not loan:
        raise ValueError(f"Không tìm thấy khoản vay #{loan_id}")

    loan_bank = loan.bank_code.strip().upper()
    loan_principal = loan.original_principal_balance or Decimal("0.00")

    # 2. Lấy các phân bổ hiện có của khoản vay này
    existing_alloc_stmt = (
        select(LoanInvoiceAllocation)
        .where(LoanInvoiceAllocation.loan_id == loan_id)
        .options(selectinload(LoanInvoiceAllocation.invoice))
    )
    existing_allocs = (await db.execute(existing_alloc_stmt)).scalars().all()
    existing_by_invoice = {a.invoice_id: a for a in existing_allocs}

    # 3. Duyệt và kiểm tra tính hợp lệ từng hóa đơn trong yêu cầu phân bổ
    total_allocated_request = Decimal("0.00")
    validated_invoices: Dict[int, Tuple[Invoice, Decimal, Optional[str]]] = {}

    for item in allocation_items:
        if item.allocated_amount <= Decimal("0.00"):
            raise ValueError(f"Số tiền nhận nợ cho hóa đơn #{item.invoice_id} phải lớn hơn 0.")

        # Lấy hóa đơn
        stmt_inv = (
            select(Invoice)
            .where(Invoice.invoice_id == item.invoice_id)
            .options(selectinload(Invoice.allocations))
        )
        inv_res = await db.execute(stmt_inv)
        inv = inv_res.scalar_one_or_none()
        if not inv:
            raise ValueError(f"Không tìm thấy hóa đơn #{item.invoice_id} trong kho dữ liệu.")

        # Quy tắc 4: Ràng buộc cùng một Tổ chức tín dụng (Single Bank Rule)
        if inv.locked_bank_code and inv.locked_bank_code.strip().upper() != loan_bank:
            raise ValueError(
                f"Lỗi vi phạm nguyên tắc TCTD: Hóa đơn #{inv.invoice_number} ({inv.invoice_series}) "
                f"đã được sử dụng bảo đảm cho Ngân hàng {inv.locked_bank_code}. "
                f"Phần còn lại chỉ được phép bảo đảm cho các khoản vay cùng Ngân hàng {inv.locked_bank_code}, "
                f"không được dùng cho Ngân hàng {loan_bank}!"
            )

        # Tính toán hạn mức còn lại có thể nhận nợ cho khoản vay này
        current_alloc_for_this_loan = (
            existing_by_invoice[inv.invoice_id].allocated_amount
            if inv.invoice_id in existing_by_invoice
            else Decimal("0.00")
        )
        available_limit = inv.remaining_amount + current_alloc_for_this_loan

        if item.allocated_amount > available_limit:
            raise ValueError(
                f"Số tiền nhận nợ ({item.allocated_amount:,.0f} ₫) vượt quá giá trị còn lại "
                f"của hóa đơn #{inv.invoice_number} ({available_limit:,.0f} ₫)!"
            )

        total_allocated_request += item.allocated_amount
        validated_invoices[inv.invoice_id] = (inv, item.allocated_amount, item.notes)

    # Quy tắc 3: Kiểm tra cân bằng với Dư nợ gốc ban đầu
    difference = loan_principal - total_allocated_request
    if total_allocated_request > loan_principal:
        raise ValueError(
            f"Tổng số tiền nhận nợ từ các hóa đơn ({total_allocated_request:,.0f} ₫) "
            f"không được vượt quá giá trị gốc vay ban đầu của khoản vay ({loan_principal:,.0f} ₫)!"
        )

    if strict_principal_check and total_allocated_request != loan_principal:
        raise ValueError(
            f"Tổng số tiền nhận nợ từ các hóa đơn ({total_allocated_request:,.0f} ₫) "
            f"phải BẰNG CHÍNH XÁC giá trị gốc vay ban đầu của khoản vay ({loan_principal:,.0f} ₫)! "
            f"Hiện chênh lệch: {difference:,.0f} ₫."
        )

    # 4. Thực thi cập nhật phân bổ trong CSDL
    # Xóa các allocation cũ của khoản vay không còn trong danh sách mới
    new_invoice_ids = set(validated_invoices.keys())
    for old_alloc in existing_allocs:
        if old_alloc.invoice_id not in new_invoice_ids:
            inv_to_free = old_alloc.invoice
            await db.delete(old_alloc)
            await db.flush()
            # Tính lại số tiền và trạng thái cho hóa đơn bị gỡ bỏ
            await _recalculate_invoice_state(db, inv_to_free.invoice_id)

    # Thêm mới hoặc cập nhật các allocation
    for inv_id, (inv, alloc_amount, notes) in validated_invoices.items():
        if inv_id in existing_by_invoice:
            alloc_record = existing_by_invoice[inv_id]
            alloc_record.allocated_amount = alloc_amount
            alloc_record.notes = notes
            alloc_record.bank_code = loan_bank
            alloc_record.contract_number = loan.contract_number
        else:
            alloc_record = LoanInvoiceAllocation(
                loan_id=loan_id,
                invoice_id=inv_id,
                bank_code=loan_bank,
                contract_number=loan.contract_number,
                allocated_amount=alloc_amount,
                notes=notes,
                created_by=user,
            )
            db.add(alloc_record)

        await db.flush()
        # Tính lại số tiền và trạng thái cho hóa đơn
        await _recalculate_invoice_state(db, inv_id)

    await db.commit()

    # 5. Đóng gói kết quả trả về
    return await get_loan_allocated_invoices(db, loan_id)


async def _recalculate_invoice_state(db: AsyncSession, invoice_id: int) -> None:
    """Tính toán lại tổng tiền đã nhận nợ, số tiền còn lại và trạng thái khóa TCTD của hóa đơn."""
    stmt = select(Invoice).where(Invoice.invoice_id == invoice_id)
    res = await db.execute(stmt)
    inv = res.scalar_one_or_none()
    if not inv:
        return

    alloc_sum_stmt = (
        select(func.coalesce(func.sum(LoanInvoiceAllocation.allocated_amount), 0))
        .where(LoanInvoiceAllocation.invoice_id == invoice_id)
    )
    total_allocated = Decimal(str((await db.execute(alloc_sum_stmt)).scalar() or "0.00"))
    remaining = inv.total_amount - total_allocated
    if remaining < Decimal("0.00"):
        remaining = Decimal("0.00")

    inv.allocated_amount = total_allocated
    inv.remaining_amount = remaining

    if total_allocated == Decimal("0.00"):
        inv.locked_bank_code = None
        inv.status = "AVAILABLE"
    else:
        bank_code_stmt = (
            select(LoanInvoiceAllocation.bank_code)
            .where(LoanInvoiceAllocation.invoice_id == invoice_id)
            .limit(1)
        )
        bank_code = (await db.execute(bank_code_stmt)).scalar_one_or_none()
        inv.locked_bank_code = bank_code
        if remaining == Decimal("0.00"):
            inv.status = "FULLY_ALLOCATED"
        else:
            inv.status = "PARTIALLY_ALLOCATED"

    await db.flush()


async def get_loan_allocated_invoices(db: AsyncSession, loan_id: int) -> LoanAllocatedInvoicesResponse:
    """Lấy danh sách các hóa đơn và số tiền nhận nợ đang bảo đảm cho khoản vay."""
    stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == loan_id)
    loan_res = await db.execute(stmt_loan)
    loan = loan_res.scalar_one_or_none()
    if not loan:
        raise ValueError(f"Không tìm thấy khoản vay #{loan_id}")

    stmt_alloc = (
        select(LoanInvoiceAllocation)
        .where(LoanInvoiceAllocation.loan_id == loan_id)
        .options(selectinload(LoanInvoiceAllocation.invoice))
        .order_by(LoanInvoiceAllocation.allocation_id.asc())
    )
    allocs = (await db.execute(stmt_alloc)).scalars().all()

    total_allocated = sum(a.allocated_amount for a in allocs)
    principal = loan.original_principal_balance or Decimal("0.00")
    difference = principal - total_allocated
    is_fully_secured = (total_allocated == principal)

    if is_fully_secured:
        msg = "✅ Đủ hóa đơn bảo đảm nhận nợ (khớp chính xác 100% gốc vay ban đầu)."
    elif total_allocated < principal:
        msg = f"⚠️ Cảnh báo: Thiếu hóa đơn nhận nợ! Còn thiếu {difference:,.0f} ₫ để đảm bảo đủ gốc vay ban đầu."
    else:
        msg = f"⚠️ Cảnh báo: Số tiền nhận nợ vượt quá gốc vay ban đầu (+{abs(difference):,.0f} ₫)!"

    alloc_items = [
        LoanAllocationItemResponse(
            allocation_id=a.allocation_id,
            loan_id=a.loan_id,
            invoice_id=a.invoice_id,
            bank_code=a.bank_code,
            contract_number=a.contract_number,
            allocated_amount=a.allocated_amount,
            allocation_date=a.allocation_date,
            notes=a.notes,
            invoice_number=a.invoice.invoice_number if a.invoice else None,
            invoice_series=a.invoice.invoice_series if a.invoice else None,
            seller_name=a.invoice.seller_name if a.invoice else None,
            total_invoice_amount=a.invoice.total_amount if a.invoice else None,
            created_at=a.created_at,
        )
        for a in allocs
    ]

    return LoanAllocatedInvoicesResponse(
        loan_id=loan.loan_id,
        contract_number=loan.contract_number,
        bank_code=loan.bank_code,
        original_principal_balance=principal,
        total_allocated_amount=total_allocated,
        difference_amount=difference,
        is_fully_secured=is_fully_secured,
        status_message=msg,
        allocations=alloc_items,
    )


async def remove_loan_allocation(db: AsyncSession, allocation_id: int) -> None:
    """Xóa một phân bổ hóa đơn khỏi khoản vay và giải phóng hạn mức cho hóa đơn."""
    stmt = (
        select(LoanInvoiceAllocation)
        .where(LoanInvoiceAllocation.allocation_id == allocation_id)
        .options(selectinload(LoanInvoiceAllocation.invoice))
    )
    res = await db.execute(stmt)
    alloc = res.scalar_one_or_none()
    if not alloc:
        raise ValueError(f"Không tìm thấy phân bổ #{allocation_id}")

    invoice_id = alloc.invoice_id
    await db.delete(alloc)
    await db.flush()
    await _recalculate_invoice_state(db, invoice_id)
    await db.commit()


async def delete_invoice(db: AsyncSession, invoice_id: int) -> None:
    """Xóa hóa đơn khỏi kho nếu chưa được phân bổ nhận nợ cho khoản vay nào."""
    stmt = (
        select(Invoice)
        .where(Invoice.invoice_id == invoice_id)
        .options(selectinload(Invoice.allocations))
    )
    res = await db.execute(stmt)
    inv = res.scalar_one_or_none()
    if not inv:
        raise ValueError(f"Không tìm thấy hóa đơn #{invoice_id}")

    if inv.allocations:
        raise ValueError("Không thể xóa hóa đơn đang được sử dụng bảo đảm nhận nợ cho khoản vay.")

    await db.delete(inv)
    await db.commit()


async def sync_invoices_from_loan_dossiers(db: AsyncSession) -> Dict[str, Any]:
    """
    Quét toàn bộ hồ sơ giải ngân của các khoản vay (disbursement_documents).
    Nếu tìm thấy các file hóa đơn (XML/PDF) chưa có trong Kho Hóa Đơn,
    tự động bóc tách và nạp bổ sung vào Kho Hóa Đơn (invoices + invoice_items),
    đồng thời liên kết 2 chiều qua disbursement_documents.invoice_id.
    """
    stmt = (
        select(DisbursementDocument)
        .where(
            or_(
                DisbursementDocument.document_type == "INVOICE",
                DisbursementDocument.file_name.ilike("%.xml"),
                DisbursementDocument.file_name.ilike("%.pdf"),
            )
        )
        .order_by(DisbursementDocument.loan_id, DisbursementDocument.document_id)
    )
    result = await db.execute(stmt)
    all_docs = result.scalars().all()

    xml_map: Dict[Tuple[int, str], DisbursementDocument] = {}
    pdf_map: Dict[Tuple[int, str], DisbursementDocument] = {}

    for doc in all_docs:
        name_lower = doc.file_name.lower()
        if "." not in name_lower:
            continue
        base_stem = doc.file_name.rsplit(".", 1)[0].lower()
        ext = name_lower.rsplit(".", 1)[-1]
        if ext == "xml":
            xml_map[(doc.loan_id, base_stem)] = doc
        elif ext == "pdf" and doc.document_type == "INVOICE":
            pdf_map[(doc.loan_id, base_stem)] = doc

    newly_added = 0
    already_existing = 0
    linked_docs_count = 0
    total_value_added = Decimal("0.00")

    for (loan_id, base_stem), xml_doc in xml_map.items():
        pdf_doc = pdf_map.get((loan_id, base_stem))

        try:
            xml_bytes = read_statement_bytes(xml_doc.storage_path)
            parsed = parse_xml_invoice_bytes(xml_bytes)
            if not parsed.get("is_valid_invoice"):
                continue

            seller_tax_code = parsed["seller_tax_code"] or "UNKNOWN"
            invoice_series = parsed["invoice_series"] or "UNKNOWN"
            invoice_number = parsed["invoice_number"] or "UNKNOWN"

            chk_stmt = (
                select(Invoice)
                .where(
                    Invoice.seller_tax_code == seller_tax_code,
                    Invoice.invoice_series == invoice_series,
                    Invoice.invoice_number == invoice_number,
                )
                .options(selectinload(Invoice.items))
            )
            inv_res = await db.execute(chk_stmt)
            existing_inv = inv_res.scalar_one_or_none()

            if existing_inv:
                already_existing += 1
                if not existing_inv.has_pdf and pdf_doc:
                    existing_inv.pdf_storage_path = pdf_doc.storage_path
                    existing_inv.pdf_file_name = pdf_doc.file_name
                    existing_inv.pdf_file_sha256 = pdf_doc.file_sha256
                    existing_inv.pdf_file_size = pdf_doc.file_size_bytes
                    existing_inv.has_pdf = True

                if xml_doc.invoice_id != existing_inv.invoice_id:
                    xml_doc.invoice_id = existing_inv.invoice_id
                    xml_doc.invoice_number = existing_inv.invoice_number
                    xml_doc.invoice_total_amount = existing_inv.total_amount
                    linked_docs_count += 1
                if pdf_doc and pdf_doc.invoice_id != existing_inv.invoice_id:
                    pdf_doc.invoice_id = existing_inv.invoice_id
                    pdf_doc.invoice_number = existing_inv.invoice_number
                    pdf_doc.invoice_total_amount = existing_inv.total_amount
                    linked_docs_count += 1
            else:
                inv_date = date.today()
                if parsed.get("invoice_date"):
                    try:
                        inv_date = date.fromisoformat(parsed["invoice_date"][:10])
                    except Exception:
                        pass

                total_amount = parsed["total_amount"] or Decimal("0.00")
                subtotal_amount = parsed.get("subtotal_amount") or Decimal("0.00")
                tax_amount = parsed.get("tax_amount") or Decimal("0.00")
                if total_amount == Decimal("0.00") and subtotal_amount > Decimal("0.00"):
                    total_amount = subtotal_amount + tax_amount

                inv_uuid = uuid.uuid4()
                new_inv = Invoice(
                    invoice_uuid=inv_uuid,
                    entity_id=None,
                    invoice_number=invoice_number,
                    invoice_series=invoice_series,
                    invoice_template=parsed.get("invoice_template") or "1",
                    invoice_date=inv_date,
                    tax_authority_code=parsed.get("tax_authority_code"),
                    seller_tax_code=seller_tax_code,
                    seller_name=parsed.get("seller_name") or "Chưa rõ bên bán",
                    seller_address=parsed.get("seller_address"),
                    buyer_tax_code=parsed.get("buyer_tax_code") or "UNKNOWN",
                    buyer_name=parsed.get("buyer_name") or "Chưa rõ bên mua",
                    buyer_address=parsed.get("buyer_address"),
                    currency=parsed.get("currency") or "VND",
                    exchange_rate=parsed.get("exchange_rate") or Decimal("1.0000"),
                    subtotal_amount=subtotal_amount,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    allocated_amount=Decimal("0.00"),
                    remaining_amount=total_amount,
                    locked_bank_code=None,
                    status="AVAILABLE",
                    xml_file_name=xml_doc.file_name,
                    xml_storage_path=xml_doc.storage_path,
                    xml_file_sha256=xml_doc.file_sha256,
                    xml_file_size=xml_doc.file_size_bytes,
                    pdf_file_name=pdf_doc.file_name if pdf_doc else None,
                    pdf_storage_path=pdf_doc.storage_path if pdf_doc else None,
                    pdf_file_sha256=pdf_doc.file_sha256 if pdf_doc else None,
                    pdf_file_size=pdf_doc.file_size_bytes if pdf_doc else None,
                    has_pdf=bool(pdf_doc),
                )
                db.add(new_inv)
                await db.flush()

                for it in parsed.get("items", []):
                    item_rec = InvoiceItem(
                        invoice_id=new_inv.invoice_id,
                        line_number=it["line_number"],
                        item_name=it["item_name"],
                        unit=it.get("unit"),
                        quantity=it.get("quantity"),
                        unit_price=it.get("unit_price"),
                        subtotal=it["subtotal"],
                        tax_rate=it.get("tax_rate"),
                        tax_amount=it.get("tax_amount") or Decimal("0.00"),
                    )
                    db.add(item_rec)

                xml_doc.invoice_id = new_inv.invoice_id
                xml_doc.invoice_number = new_inv.invoice_number
                xml_doc.invoice_total_amount = new_inv.total_amount
                linked_docs_count += 1

                if pdf_doc:
                    pdf_doc.invoice_id = new_inv.invoice_id
                    pdf_doc.invoice_number = new_inv.invoice_number
                    pdf_doc.invoice_total_amount = new_inv.total_amount
                    linked_docs_count += 1

                newly_added += 1
                total_value_added += total_amount
        except Exception as e:
            logger.warning(f"Lỗi khi đồng bộ hóa đơn từ hồ sơ #{xml_doc.document_id} ({xml_doc.file_name}): {e}")

    for (loan_id, base_stem), pdf_doc in pdf_map.items():
        if pdf_doc.invoice_id is None:
            match_inv_stmt = select(Invoice).where(
                or_(
                    Invoice.pdf_file_name == pdf_doc.file_name,
                    Invoice.xml_file_name.ilike(f"{base_stem}.xml"),
                )
            )
            m_inv = (await db.execute(match_inv_stmt)).scalar_one_or_none()
            if m_inv:
                pdf_doc.invoice_id = m_inv.invoice_id
                pdf_doc.invoice_number = m_inv.invoice_number
                pdf_doc.invoice_total_amount = m_inv.total_amount
                if not m_inv.has_pdf:
                    m_inv.pdf_storage_path = pdf_doc.storage_path
                    m_inv.pdf_file_name = pdf_doc.file_name
                    m_inv.pdf_file_sha256 = pdf_doc.file_sha256
                    m_inv.pdf_file_size = pdf_doc.file_size_bytes
                    m_inv.has_pdf = True
                linked_docs_count += 1

    await db.commit()

    return {
        "total_scanned_documents": len(all_docs),
        "total_xml_found": len(xml_map),
        "newly_added_invoices": newly_added,
        "already_existing_invoices": already_existing,
        "linked_documents_count": linked_docs_count,
        "total_value_added": total_value_added,
        "message": f"Đồng bộ thành công: Đã thêm mới {newly_added} hóa đơn vào kho (tổng trị giá {total_value_added:,.0f} VND), liên kết {linked_docs_count} chứng từ giải ngân.",
    }


async def auto_sync_dossier_document_to_invoice(
    db: AsyncSession,
    loan: CreditFacility,
    doc_record: DisbursementDocument,
    content: bytes,
) -> Optional[Invoice]:
    """
    Khi một tài liệu hóa đơn mới (XML hoặc PDF) được nạp vào hồ sơ giải ngân của khoản vay,
    tự động kiểm tra và bổ sung vào Kho Hóa Đơn nếu chưa tồn tại, đồng thời ghép cặp liên kết.
    """
    filename_lower = doc_record.file_name.lower()
    base_stem = doc_record.file_name.rsplit(".", 1)[0] if "." in doc_record.file_name else doc_record.file_name
    stem_lower = base_stem.lower()

    if filename_lower.endswith(".xml") or doc_record.mime_type in ("application/xml", "text/xml"):
        parsed = parse_xml_invoice_bytes(content)
        if not parsed.get("is_valid_invoice"):
            return None

        seller_tax_code = parsed["seller_tax_code"] or "UNKNOWN"
        invoice_series = parsed["invoice_series"] or "UNKNOWN"
        invoice_number = parsed["invoice_number"] or "UNKNOWN"

        doc_record.invoice_number = invoice_number
        doc_record.invoice_total_amount = parsed.get("total_amount")

        stmt = (
            select(Invoice)
            .where(
                Invoice.seller_tax_code == seller_tax_code,
                Invoice.invoice_series == invoice_series,
                Invoice.invoice_number == invoice_number,
            )
            .options(selectinload(Invoice.items))
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

        pdf_stmt = (
            select(DisbursementDocument)
            .where(
                DisbursementDocument.loan_id == loan.loan_id,
                DisbursementDocument.file_name.ilike(f"{stem_lower}.pdf"),
            )
        )
        matching_pdf = (await db.execute(pdf_stmt)).scalar_one_or_none()

        if existing:
            doc_record.invoice_id = existing.invoice_id
            if matching_pdf and not existing.has_pdf:
                existing.pdf_storage_path = matching_pdf.storage_path
                existing.pdf_file_name = matching_pdf.file_name
                existing.pdf_file_sha256 = matching_pdf.file_sha256
                existing.pdf_file_size = matching_pdf.file_size_bytes
                existing.has_pdf = True
                matching_pdf.invoice_id = existing.invoice_id
            return existing

        inv_date = date.today()
        if parsed.get("invoice_date"):
            try:
                inv_date = date.fromisoformat(parsed["invoice_date"][:10])
            except Exception:
                pass

        total_amount = parsed["total_amount"] or Decimal("0.00")
        subtotal_amount = parsed.get("subtotal_amount") or Decimal("0.00")
        tax_amount = parsed.get("tax_amount") or Decimal("0.00")
        if total_amount == Decimal("0.00") and subtotal_amount > Decimal("0.00"):
            total_amount = subtotal_amount + tax_amount

        new_inv = Invoice(
            invoice_uuid=uuid.uuid4(),
            entity_id=None,
            invoice_number=invoice_number,
            invoice_series=invoice_series,
            invoice_template=parsed.get("invoice_template") or "1",
            invoice_date=inv_date,
            tax_authority_code=parsed.get("tax_authority_code"),
            seller_tax_code=seller_tax_code,
            seller_name=parsed.get("seller_name") or "Chưa rõ bên bán",
            seller_address=parsed.get("seller_address"),
            buyer_tax_code=parsed.get("buyer_tax_code") or "UNKNOWN",
            buyer_name=parsed.get("buyer_name") or "Chưa rõ bên mua",
            buyer_address=parsed.get("buyer_address"),
            currency=parsed.get("currency") or "VND",
            exchange_rate=parsed.get("exchange_rate") or Decimal("1.0000"),
            subtotal_amount=subtotal_amount,
            tax_amount=tax_amount,
            total_amount=total_amount,
            allocated_amount=Decimal("0.00"),
            remaining_amount=total_amount,
            locked_bank_code=None,
            status="AVAILABLE",
            xml_file_name=doc_record.file_name,
            xml_storage_path=doc_record.storage_path,
            xml_file_sha256=doc_record.file_sha256,
            xml_file_size=doc_record.file_size_bytes,
            pdf_file_name=matching_pdf.file_name if matching_pdf else None,
            pdf_storage_path=matching_pdf.storage_path if matching_pdf else None,
            pdf_file_sha256=matching_pdf.file_sha256 if matching_pdf else None,
            pdf_file_size=matching_pdf.file_size_bytes if matching_pdf else None,
            has_pdf=bool(matching_pdf),
        )
        db.add(new_inv)
        await db.flush()

        for it in parsed.get("items", []):
            item_rec = InvoiceItem(
                invoice_id=new_inv.invoice_id,
                line_number=it["line_number"],
                item_name=it["item_name"],
                unit=it.get("unit"),
                quantity=it.get("quantity"),
                unit_price=it.get("unit_price"),
                subtotal=it["subtotal"],
                tax_rate=it.get("tax_rate"),
                tax_amount=it.get("tax_amount") or Decimal("0.00"),
            )
            db.add(item_rec)

        doc_record.invoice_id = new_inv.invoice_id
        if matching_pdf:
            matching_pdf.invoice_id = new_inv.invoice_id
            matching_pdf.invoice_number = new_inv.invoice_number
            matching_pdf.invoice_total_amount = new_inv.total_amount

        return new_inv

    elif filename_lower.endswith(".pdf") and doc_record.document_type == "INVOICE":
        xml_stmt = (
            select(DisbursementDocument)
            .where(
                DisbursementDocument.loan_id == loan.loan_id,
                DisbursementDocument.file_name.ilike(f"{stem_lower}.xml"),
            )
        )
        matching_xml = (await db.execute(xml_stmt)).scalar_one_or_none()

        if matching_xml and matching_xml.invoice_id:
            inv = await db.get(Invoice, matching_xml.invoice_id)
            if inv:
                inv.pdf_file_name = doc_record.file_name
                inv.pdf_storage_path = doc_record.storage_path
                inv.pdf_file_sha256 = doc_record.file_sha256
                inv.pdf_file_size = doc_record.file_size_bytes
                inv.has_pdf = True
                doc_record.invoice_id = inv.invoice_id
                doc_record.invoice_number = inv.invoice_number
                doc_record.invoice_total_amount = inv.total_amount
                return inv
        elif matching_xml:
            try:
                xml_bytes = read_statement_bytes(matching_xml.storage_path)
                inv = await save_invoice_from_xml(
                    db=db,
                    xml_bytes=xml_bytes,
                    xml_filename=matching_xml.file_name,
                    pdf_bytes=content,
                    pdf_filename=doc_record.file_name,
                )
                doc_record.invoice_id = inv.invoice_id
                doc_record.invoice_number = inv.invoice_number
                doc_record.invoice_total_amount = inv.total_amount
                matching_xml.invoice_id = inv.invoice_id
                matching_xml.invoice_number = inv.invoice_number
                matching_xml.invoice_total_amount = inv.total_amount
                return inv
            except Exception as e:
                logger.warning(f"Lỗi parse XML từ file PDF kèm theo: {e}")

    return None

