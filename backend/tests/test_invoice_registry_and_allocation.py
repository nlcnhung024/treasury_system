import zipfile
from decimal import Decimal
from pathlib import Path
import pytest
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.credit import CreditFacility
from app.models.invoice import Invoice, InvoiceItem, LoanInvoiceAllocation
from app.services.invoice_parser_service import parse_xml_invoice_bytes
from app.services import invoice_service
from app.schemas.invoice import SingleAllocationItem

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_DIR = WORKSPACE_ROOT / "Resources" / "Sample_hoa_don"
SAMPLE_ZIP = SAMPLE_DIR / "hoa_don_dau_vao (2).zip"


def get_sample_xml_bytes() -> bytes:
    with zipfile.ZipFile(SAMPLE_ZIP) as z:
        return z.read("2802584811_1_C26TXM_20572_31102026_congtycophanximangdaiduong.xml")


def test_parse_real_xml_sample_hoa_don():
    """Kiểm tra bóc tách file XML thật từ folder Resources/Sample_hoa_don."""
    assert SAMPLE_ZIP.exists(), f"Không tìm thấy file ZIP tại {SAMPLE_ZIP}"
    xml_bytes = get_sample_xml_bytes()

    parsed = parse_xml_invoice_bytes(xml_bytes)
    assert parsed["is_valid_invoice"] is True
    assert parsed["invoice_number"] == "20572"
    assert parsed["invoice_series"] == "C26TXM"
    assert parsed["invoice_template"] == "1"
    assert parsed["invoice_date"] == "2026-10-31"
    assert parsed["tax_authority_code"] == "00674643E49AB04A0DBDF382E6D77FAA73"
    assert parsed["seller_tax_code"] == "2802584811"
    assert "ĐẠI DƯƠNG" in parsed["seller_name"]
    assert parsed["buyer_tax_code"] == "0109730501"
    assert "SUNRISE" in parsed["buyer_name"]
    assert parsed["total_amount"] == Decimal("19398960")
    assert parsed["subtotal_amount"] == Decimal("17962000")
    assert parsed["tax_amount"] == Decimal("1436960")
    assert parsed["currency"] == "VND"

    # Kiểm tra chi tiết hàng hóa
    assert len(parsed["items"]) == 1
    item = parsed["items"][0]
    assert "Hoàng Thanh Sơn" in item["item_name"]
    assert item["unit"] == "Tấn"
    assert item["quantity"] == Decimal("20")
    assert item["unit_price"] == Decimal("898100")
    assert item["subtotal"] == Decimal("17962000")
    assert item["tax_rate"] == "8%"


@pytest.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session


@pytest.mark.asyncio
async def test_ingest_zip_and_auto_pair_pdf(db_session: AsyncSession):
    """Kiểm tra nạp file ZIP hóa đơn và tự động ghép cặp file PDF."""
    assert SAMPLE_ZIP.exists(), f"Không tìm thấy file ZIP tại {SAMPLE_ZIP}"
    zip_bytes = SAMPLE_ZIP.read_bytes()

    # Dọn dẹp dữ liệu cũ nếu có
    inv_ids = (await db_session.execute(
        select(Invoice.invoice_id).where(Invoice.invoice_number == "20572", Invoice.invoice_series == "C26TXM")
    )).scalars().all()
    if inv_ids:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id.in_(inv_ids)))
        await db_session.execute(delete(Invoice).where(Invoice.invoice_id.in_(inv_ids)))
        await db_session.commit()

    invoices = await invoice_service.ingest_zip_package(db_session, zip_bytes)
    assert len(invoices) >= 1
    inv = next(i for i in invoices if i.invoice_number == "20572")
    assert inv.invoice_number == "20572"
    assert inv.invoice_series == "C26TXM"
    assert inv.has_pdf is True
    assert inv.pdf_file_name.endswith(".pdf")
    assert inv.total_amount == Decimal("19398960.00")
    assert inv.remaining_amount == Decimal("19398960.00")
    assert inv.allocated_amount == Decimal("0.00")
    assert inv.status == "AVAILABLE"
    assert inv.locked_bank_code is None

    # Teardown
    await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id == inv.invoice_id))
    await db_session.execute(delete(Invoice).where(Invoice.invoice_id == inv.invoice_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_single_bank_rule_and_exact_principal_allocation(db_session: AsyncSession):
    """
    Kiểm tra toàn diện các quy tắc nghiệp vụ:
    1. Mỗi khoản vay bảo đảm bởi một hoặc nhiều hóa đơn.
    2. Mỗi hóa đơn có số tiền nhận nợ <= tổng giá trị hóa đơn.
    3. Tổng số tiền nhận nợ từ các hóa đơn gán cho khoản vay phải BẰNG CHÍNH XÁC giá trị gốc vay ban đầu.
    4. RÀNG BUỘC CÙNG TỔ CHỨC TÍN DỤNG: Nếu nhận nợ 1 phần, phần còn lại CHỈ ĐƯỢC PHÉP dùng cho khoản vay CÙNG NGÂN HÀNG.
    """
    # 1. Dọn dẹp trước nếu có
    inv_ids = (await db_session.execute(
        select(Invoice.invoice_id).where(Invoice.invoice_number == "20572", Invoice.invoice_series == "C26TXM")
    )).scalars().all()
    if inv_ids:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id.in_(inv_ids)))
        await db_session.execute(delete(Invoice).where(Invoice.invoice_id.in_(inv_ids)))

    # Xóa các khoản vay test cũ nếu có
    old_loans = (await db_session.execute(
        select(CreditFacility.loan_id).where(CreditFacility.contract_number.in_(["TEST_HDTD_MBB_001", "TEST_HDTD_CTG_002", "TEST_HDTD_MBB_003"]))
    )).scalars().all()
    if old_loans:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.loan_id.in_(old_loans)))
        await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id.in_(old_loans)))
    await db_session.commit()

    # Tạo Hóa đơn 10 tỷ VND
    xml_bytes = get_sample_xml_bytes()
    inv = await invoice_service.save_invoice_from_xml(
        db_session,
        xml_bytes=xml_bytes,
        xml_filename="sample.xml",
    )
    # Cập nhật tổng tiền thành 10 tỷ để test phân bổ nhiều lần
    inv.total_amount = Decimal("10000000000.00")
    inv.remaining_amount = Decimal("10000000000.00")
    await db_session.commit()
    await db_session.refresh(inv)

    # 2. Tạo Khoản vay 1 tại MBBank (gốc ban đầu 6 tỷ VND)
    loan_mb1 = CreditFacility(
        bank_code="MBB",
        bank_name="Ngân hàng TMCP Quân Đội",
        contract_number="TEST_HDTD_MBB_001",
        borrower_name="Công ty CP Xây dựng",
        original_principal_balance=Decimal("6000000000.00"),
        current_principal_balance=Decimal("6000000000.00"),
    )
    db_session.add(loan_mb1)
    await db_session.flush()

    # 3. Phân bổ 6 tỷ từ hóa đơn cho Khoản vay 1
    res1 = await invoice_service.allocate_invoices_to_loan(
        db=db_session,
        loan_id=loan_mb1.loan_id,
        allocation_items=[
            SingleAllocationItem(invoice_id=inv.invoice_id, allocated_amount=Decimal("6000000000.00"))
        ],
        strict_principal_check=True,
    )
    assert res1.is_fully_secured is True
    assert res1.total_allocated_amount == Decimal("6000000000.00")
    assert res1.difference_amount == Decimal("0.00")

    # Kiểm tra trạng thái hóa đơn sau lần nhận nợ đầu tiên
    await db_session.refresh(inv)
    assert inv.allocated_amount == Decimal("6000000000.00")
    assert inv.remaining_amount == Decimal("4000000000.00")
    assert inv.locked_bank_code == "MBB"  # Đã khóa cho MBBank!
    assert inv.status == "PARTIALLY_ALLOCATED"

    # 4. Tạo Khoản vay 2 tại VietinBank (CTG) gốc 4 tỷ VND (KHÁC NGÂN HÀNG!)
    loan_ctg = CreditFacility(
        bank_code="CTG",
        bank_name="Ngân hàng TMCP Công Thương Việt Nam",
        contract_number="TEST_HDTD_CTG_002",
        borrower_name="Công ty CP Xây dựng",
        original_principal_balance=Decimal("4000000000.00"),
        current_principal_balance=Decimal("4000000000.00"),
    )
    db_session.add(loan_ctg)
    await db_session.flush()

    # 5. Cố tình phân bổ 4 tỷ còn lại của hóa đơn cho Khoản vay CTG -> BẮT BUỘC BỊ TỪ CHỐI!
    with pytest.raises(ValueError) as excinfo:
        await invoice_service.allocate_invoices_to_loan(
            db=db_session,
            loan_id=loan_ctg.loan_id,
            allocation_items=[
                SingleAllocationItem(invoice_id=inv.invoice_id, allocated_amount=Decimal("4000000000.00"))
            ],
        )
    assert "Lỗi vi phạm nguyên tắc TCTD" in str(excinfo.value)
    assert "MBB" in str(excinfo.value)
    assert "CTG" in str(excinfo.value)

    # 6. Tạo Khoản vay 3 tại MBBank (gốc 4 tỷ VND - CÙNG NGÂN HÀNG MBB)
    loan_mb2 = CreditFacility(
        bank_code="MBB",
        bank_name="Ngân hàng TMCP Quân Đội",
        contract_number="TEST_HDTD_MBB_003",
        borrower_name="Công ty CP Xây dựng",
        original_principal_balance=Decimal("4000000000.00"),
        current_principal_balance=Decimal("4000000000.00"),
    )
    db_session.add(loan_mb2)
    await db_session.flush()

    # 7. Phân bổ 4 tỷ còn lại cho Khoản vay 3 -> THÀNH CÔNG!
    res3 = await invoice_service.allocate_invoices_to_loan(
        db=db_session,
        loan_id=loan_mb2.loan_id,
        allocation_items=[
            SingleAllocationItem(invoice_id=inv.invoice_id, allocated_amount=Decimal("4000000000.00"))
        ],
        strict_principal_check=True,
    )
    assert res3.is_fully_secured is True
    assert res3.total_allocated_amount == Decimal("4000000000.00")

    # Kiểm tra hóa đơn đã hết hạn mức
    await db_session.refresh(inv)
    assert inv.allocated_amount == Decimal("10000000000.00")
    assert inv.remaining_amount == Decimal("0.00")
    assert inv.status == "FULLY_ALLOCATED"

    # Teardown 100% sạch sẽ
    await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id == inv.invoice_id))
    await db_session.execute(delete(Invoice).where(Invoice.invoice_id == inv.invoice_id))
    await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id.in_([loan_mb1.loan_id, loan_ctg.loan_id, loan_mb2.loan_id])))
    await db_session.commit()


@pytest.mark.asyncio
async def test_allocation_amount_exceeding_invoice_remaining(db_session: AsyncSession):
    """Kiểm tra từ chối khi số tiền nhận nợ vượt quá giá trị còn lại của hóa đơn."""
    # Dọn dẹp trước
    inv_ids = (await db_session.execute(
        select(Invoice.invoice_id).where(Invoice.invoice_number == "20572", Invoice.invoice_series == "C26TXM")
    )).scalars().all()
    if inv_ids:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id.in_(inv_ids)))
        await db_session.execute(delete(Invoice).where(Invoice.invoice_id.in_(inv_ids)))

    old_vcb = (await db_session.execute(
        select(CreditFacility.loan_id).where(CreditFacility.contract_number == "TEST_HDTD_VCB_001")
    )).scalars().all()
    if old_vcb:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.loan_id.in_(old_vcb)))
        await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id.in_(old_vcb)))
    await db_session.commit()

    xml_bytes = get_sample_xml_bytes()
    inv = await invoice_service.save_invoice_from_xml(db_session, xml_bytes, "sample.xml")
    inv.total_amount = Decimal("50000000.00")
    inv.remaining_amount = Decimal("50000000.00")
    await db_session.commit()

    loan = CreditFacility(
        bank_code="VCB",
        bank_name="Vietcombank",
        contract_number="TEST_HDTD_VCB_001",
        borrower_name="Công ty CP Xây dựng",
        original_principal_balance=Decimal("100000000.00"),
        current_principal_balance=Decimal("100000000.00"),
    )
    db_session.add(loan)
    await db_session.flush()

    with pytest.raises(ValueError) as exc:
        await invoice_service.allocate_invoices_to_loan(
            db=db_session,
            loan_id=loan.loan_id,
            allocation_items=[
                SingleAllocationItem(invoice_id=inv.invoice_id, allocated_amount=Decimal("60000000.00"))
            ],
        )
    assert "vượt quá giá trị còn lại" in str(exc.value)

    # Teardown 100%
    await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id == inv.invoice_id))
    await db_session.execute(delete(Invoice).where(Invoice.invoice_id == inv.invoice_id))
    await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id == loan.loan_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_sync_invoices_from_loan_dossiers(db_session: AsyncSession):
    """
    Kiểm tra cơ chế quét hồ sơ giải ngân của các khoản vay và tự động
    bổ sung các file hóa đơn chưa có vào Kho Hóa Đơn, ghép cặp XML và PDF.
    """
    from app.models.credit import DisbursementDocument

    stats = await invoice_service.sync_invoices_from_loan_dossiers(db_session)
    assert stats["total_scanned_documents"] >= 134
    assert stats["total_xml_found"] >= 67
    assert stats["linked_documents_count"] >= 0

    # Kiểm tra toàn bộ chứng từ hóa đơn trong CSDL đã được liên kết với kho hóa đơn
    total_linked = (await db_session.execute(
        select(func.count(DisbursementDocument.document_id))
        .where(DisbursementDocument.document_type == "INVOICE", DisbursementDocument.invoice_id.is_not(None))
    )).scalar()
    assert total_linked >= 134

    # Kiểm tra không còn file hóa đơn nào chưa liên kết
    unlinked = (await db_session.execute(
        select(DisbursementDocument)
        .where(DisbursementDocument.document_type == "INVOICE", DisbursementDocument.invoice_id.is_(None))
    )).scalars().all()
    assert len(unlinked) == 0

    # Kiểm tra hóa đơn trong kho có đầy đủ thông tin PDF
    sample_inv = (await db_session.execute(
        select(Invoice).where(Invoice.pdf_file_name.is_not(None)).limit(1)
    )).scalar_one_or_none()
    assert sample_inv is not None
    assert sample_inv.has_pdf is True
    assert sample_inv.total_amount > Decimal("0.00")



@pytest.mark.asyncio
async def test_manual_allocation_priority_over_rolling_sync(db_session: AsyncSession):
    """
    Kiểm tra nguyên tắc Ưu tiên Bản sửa thủ công của người dùng:
    Khi người dùng đã sửa/gán thủ công một hóa đơn,
    kể cả khi chạy Đồng bộ cuốn chiếu (force_recalculate=True),
    hệ thống TUYỆT ĐỐI BẢO VỆ số tiền thủ công của người dùng,
    chỉ tự động cuốn chiếu phần dư nợ còn thiếu trên các hóa đơn còn lại.
    """
    from app.models.credit import DisbursementDocument

    # 1. Dọn dẹp trước nếu có dữ liệu cũ
    old_loans = (await db_session.execute(
        select(CreditFacility.loan_id).where(CreditFacility.contract_number == "TEST_HDTD_MANUAL_PRIORITY")
    )).scalars().all()
    if old_loans:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.loan_id.in_(old_loans)))
        await db_session.execute(delete(DisbursementDocument).where(DisbursementDocument.loan_id.in_(old_loans)))
        await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id.in_(old_loans)))

    old_invs = (await db_session.execute(
        select(Invoice.invoice_id).where(Invoice.invoice_number.in_(["TEST_MAN_001", "TEST_MAN_002"]))
    )).scalars().all()
    if old_invs:
        await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.invoice_id.in_(old_invs)))
        await db_session.execute(delete(Invoice).where(Invoice.invoice_id.in_(old_invs)))
    await db_session.commit()

    # 2. Tạo 2 hóa đơn
    from datetime import date
    inv1 = Invoice(
        invoice_number="TEST_MAN_001",
        invoice_series="C26MAN",
        invoice_date=date(2026, 11, 1),
        seller_tax_code="0101010101",
        seller_name="CÔNG TY CỔ PHẦN VẬT TƯ A",
        buyer_tax_code="0109730501",
        buyer_name="SUNRISE",
        total_amount=Decimal("50000000.00"),
        remaining_amount=Decimal("50000000.00"),
        status="AVAILABLE",
    )
    inv2 = Invoice(
        invoice_number="TEST_MAN_002",
        invoice_series="C26MAN",
        invoice_date=date(2026, 11, 2),
        seller_tax_code="0202020202",
        seller_name="CÔNG TY CỔ PHẦN VẬT TƯ B",
        buyer_tax_code="0109730501",
        buyer_name="SUNRISE",
        total_amount=Decimal("80000000.00"),
        remaining_amount=Decimal("80000000.00"),
        status="AVAILABLE",
    )
    db_session.add_all([inv1, inv2])
    await db_session.flush()

    # 3. Tạo khoản vay 100 triệu
    loan = CreditFacility(
        bank_code="MBB",
        bank_name="Ngân hàng TMCP Quân Đội",
        contract_number="TEST_HDTD_MANUAL_PRIORITY",
        borrower_name="SUNRISE",
        original_principal_balance=Decimal("100000000.00"),
        current_principal_balance=Decimal("100000000.00"),
    )
    db_session.add(loan)
    await db_session.flush()

    # 4. Tạo hồ sơ giải ngân chứa 2 hóa đơn này
    doc1 = DisbursementDocument(
        loan_id=loan.loan_id,
        file_name="TEST_MAN_001.xml",
        storage_path="statements/MBB/2026/doc1.xml",
        file_size_bytes=1024,
        file_sha256="fake_sha256_man_1",
        mime_type="text/xml",
        document_type="INVOICE",
        invoice_id=inv1.invoice_id,
    )
    doc2 = DisbursementDocument(
        loan_id=loan.loan_id,
        file_name="TEST_MAN_002.xml",
        storage_path="statements/MBB/2026/doc2.xml",
        file_size_bytes=1024,
        file_sha256="fake_sha256_man_2",
        mime_type="text/xml",
        document_type="INVOICE",
        invoice_id=inv2.invoice_id,
    )
    db_session.add_all([doc1, doc2])
    await db_session.commit()

    # 5. Người dùng sửa thủ công: gán cho inv1 số tiền 30,000,000 đ (thay vì 50,000,000)
    manual_res = await invoice_service.allocate_invoices_to_loan(
        db=db_session,
        loan_id=loan.loan_id,
        allocation_items=[
            SingleAllocationItem(
                invoice_id=inv1.invoice_id,
                allocated_amount=Decimal("30000000.00"),
                notes="Điều chỉnh thủ công từ kế toán",
                is_manual=True,
            )
        ],
        strict_principal_check=False,
    )
    assert len(manual_res.allocations) == 1
    assert manual_res.allocations[0].allocated_amount == Decimal("30000000.00")
    assert manual_res.allocations[0].is_manual is True

    # 6. Người dùng bấm "Đồng Bộ Cuốn Chiếu" (force_recalculate=True)
    # Kỳ vọng: Bản sửa thủ công 30 triệu của inv1 ĐƯỢC GIỮ NGUYÊN!
    # Hệ thống chỉ tự động cuốn chiếu phần còn thiếu (100tr - 30tr = 70tr) sang inv2!
    sync_res = await invoice_service.auto_sync_dossier_invoices_rolling(
        db=db_session,
        loan_id=loan.loan_id,
        user="Chị Cẩm Nhung",
        force_recalculate=True,
    )
    assert sync_res.is_fully_secured is True
    assert sync_res.total_allocated_amount == Decimal("100000000.00")
    assert len(sync_res.allocations) == 2

    alloc_map = {a.invoice_id: a for a in sync_res.allocations}
    # inv1 vẫn phải giữ nguyên 30 triệu và is_manual == True
    assert alloc_map[inv1.invoice_id].allocated_amount == Decimal("30000000.00")
    assert alloc_map[inv1.invoice_id].is_manual is True

    # inv2 được tự động cuốn chiếu 70 triệu
    assert alloc_map[inv2.invoice_id].allocated_amount == Decimal("70000000.00")
    assert alloc_map[inv2.invoice_id].is_manual is False

    # 7. Teardown 100% sạch sẽ
    await db_session.execute(delete(LoanInvoiceAllocation).where(LoanInvoiceAllocation.loan_id == loan.loan_id))
    await db_session.execute(delete(DisbursementDocument).where(DisbursementDocument.loan_id == loan.loan_id))
    await db_session.execute(delete(CreditFacility).where(CreditFacility.loan_id == loan.loan_id))
    await db_session.execute(delete(Invoice).where(Invoice.invoice_id.in_([inv1.invoice_id, inv2.invoice_id])))
    await db_session.commit()


@pytest.mark.asyncio
async def test_delete_dossier_invoice_deletes_debt_allocation(db_session: AsyncSession):
    """
    Kiểm tra liên kết chặt chẽ giữa Hồ sơ tệp hóa đơn và Số tiền nhận nợ:
    Khi người dùng xóa file hóa đơn trong hồ sơ giải ngân, hệ thống bắt buộc phải
    xóa luôn phần nhận nợ tương ứng bên dưới của khoản vay và hoàn lại hạn mức.
    """
    import uuid
    from datetime import date
    from app.models.credit import DisbursementDocument
    from app.api.v1.credit_statements import delete_disbursement_document

    # 1. Tạo khoản vay
    loan = CreditFacility(
        bank_code="MBB",
        bank_name="MBBank",
        contract_number="TEST_DELETE_LINK_001",
        borrower_name="Công ty Test Liên Kết",
        disbursement_date=date(2026, 9, 1),
        maturity_date=date(2027, 3, 1),
        original_principal_balance=Decimal("50000000.00"),
        current_principal_balance=Decimal("50000000.00"),
        interest_rate=Decimal("8.5"),
    )
    db_session.add(loan)
    await db_session.flush()

    # 2. Tạo hóa đơn trong kho
    inv = Invoice(
        invoice_uuid=uuid.uuid4(),
        invoice_number="999888",
        invoice_series="C26TTest",
        invoice_template="1",
        invoice_date=date(2026, 9, 1),
        seller_tax_code="0101010101",
        seller_name="NCC Test",
        buyer_tax_code="0202020202",
        buyer_name="Công ty Test Liên Kết",
        total_amount=Decimal("50000000.00"),
        allocated_amount=Decimal("0.00"),
        remaining_amount=Decimal("50000000.00"),
        status="AVAILABLE",
    )
    db_session.add(inv)
    await db_session.flush()

    # 3. Tạo tài liệu hóa đơn trong bộ hồ sơ giải ngân
    doc = DisbursementDocument(
        document_uuid=uuid.uuid4(),
        loan_id=loan.loan_id,
        invoice_id=inv.invoice_id,
        file_name="0101010101_1_C26TTest_999888_01092026_ncctest.xml",
        storage_path="disbursement_dossiers/MBB/TEST_DELETE_LINK_001/doc_test.xml",
        file_size_bytes=1024,
        file_sha256="testsha256",
        mime_type="application/xml",
        document_type="INVOICE",
        invoice_number="999888",
        invoice_total_amount=Decimal("50000000.00"),
    )
    db_session.add(doc)
    await db_session.flush()

    # 4. Chạy đồng bộ cuốn chiếu -> tạo phân bổ nhận nợ
    sync_res = await invoice_service.auto_sync_dossier_invoices_rolling(
        db=db_session,
        loan_id=loan.loan_id,
        user="Tester",
    )
    assert len(sync_res.allocations) == 1
    assert sync_res.total_allocated_amount == Decimal("50000000.00")
    assert sync_res.is_fully_secured is True

    # 5. Thực thi XÓA FILE HÓA ĐƠN khỏi hồ sơ giải ngân
    del_res = await delete_disbursement_document(document_id=doc.document_id, db=db_session)
    assert del_res["deleted_allocation"] is True

    # 6. Kiểm tra lại danh sách phân bổ nhận nợ của khoản vay
    res_after = await invoice_service.get_loan_allocated_invoices(db=db_session, loan_id=loan.loan_id)
    # Phần nợ bên dưới bắt buộc phải biến mất hoàn toàn (0 đ)
    assert len(res_after.allocations) == 0
    assert res_after.total_allocated_amount == Decimal("0.00")
    assert res_after.is_fully_secured is False
