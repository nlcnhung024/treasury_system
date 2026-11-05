"""
Test bóc tách Hóa đơn XML và đối soát hóa đơn với dư nợ gốc khoản vay
"""
from decimal import Decimal
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.credit import CreditFacility, DisbursementDocument
from app.services.invoice_parser_service import (
    parse_xml_invoice_bytes,
    calculate_loan_invoice_reconciliation,
)

SAMPLE_XML_INVOICE = """<?xml version="1.0" encoding="utf-8"?>
<HDon xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <DLHDon>
        <TTChung>
            <SHDon>0000427</SHDon>
            <KHHDon>1C24TTA</KHHDon>
            <NLap>2026-03-15</NLap>
            <DVTTe>VND</DVTTe>
        </TTChung>
        <NDHDon>
            <NBan>
                <Ten>Công ty TNHH Cung ứng Vật tư Xây dựng Hà Nội</Ten>
                <MST>0109988776</MST>
            </NBan>
            <NMua>
                <Ten>Công ty Cổ phần Xây dựng và Thương mại ABC</Ten>
                <MST>0101234567</MST>
            </NMua>
            <TToan>
                <TgTCThue>148792545</TgTCThue>
                <TgTThue>14879255</TgTThue>
                <TgTTTBSo>163671800</TgTTTBSo>
            </TToan>
        </NDHDon>
    </DLHDon>
</HDon>
"""


def test_parse_xml_invoice():
    res = parse_xml_invoice_bytes(SAMPLE_XML_INVOICE.encode("utf-8"))
    assert res["is_valid_invoice"] is True
    assert res["invoice_number"] == "0000427"
    assert res["invoice_series"] == "1C24TTA"
    assert res["total_amount"] == Decimal("163671800")
    assert res["currency"] == "VND"
    assert "Hà Nội" in (res["seller_name"] or "")


def test_calculate_loan_invoice_reconciliation_shortage():
    # Giả lập khoản vay dư nợ gốc 500 triệu
    loan = CreditFacility(
        loan_id=101,
        contract_number="HDTD_TEST_001",
        bank_code="EVF",
        current_principal_balance=Decimal("500000000.00"),
    )
    # 2 hóa đơn tổng 300 triệu
    docs = [
        DisbursementDocument(
            document_id=1,
            loan_id=101,
            file_name="HD_001.xml",
            storage_path="path/1",
            file_size_bytes=1000,
            file_sha256="hash1",
            mime_type="text/xml",
            invoice_number="001",
            invoice_total_amount=Decimal("100000000.00"),
        ),
        DisbursementDocument(
            document_id=2,
            loan_id=101,
            file_name="HD_002.xml",
            storage_path="path/2",
            file_size_bytes=1000,
            file_sha256="hash2",
            mime_type="text/xml",
            invoice_number="002",
            invoice_total_amount=Decimal("200000000.00"),
        ),
    ]

    reconcile = calculate_loan_invoice_reconciliation(loan, docs)
    assert reconcile.is_sufficient is False
    assert reconcile.total_invoice_amount == Decimal("300000000.00")
    assert reconcile.shortage_amount == Decimal("200000000.00")
    assert reconcile.warning_message is not None
    assert "Thiếu hóa đơn giải ngân" in reconcile.warning_message


def test_calculate_loan_invoice_reconciliation_sufficient():
    # Giả lập khoản vay dư nợ gốc 200 triệu
    loan = CreditFacility(
        loan_id=102,
        contract_number="HDTD_TEST_002",
        bank_code="EVF",
        current_principal_balance=Decimal("200000000.00"),
    )
    # Hóa đơn tổng 250 triệu (đủ/thừa)
    docs = [
        DisbursementDocument(
            document_id=3,
            loan_id=102,
            file_name="HD_003.xml",
            storage_path="path/3",
            file_size_bytes=1000,
            file_sha256="hash3",
            mime_type="text/xml",
            invoice_number="003",
            invoice_total_amount=Decimal("250000000.00"),
        ),
    ]

    reconcile = calculate_loan_invoice_reconciliation(loan, docs)
    assert reconcile.is_sufficient is True
    assert reconcile.total_invoice_amount == Decimal("250000000.00")
    assert reconcile.shortage_amount == Decimal("0.00")
    assert reconcile.warning_message is None


@pytest.mark.asyncio
async def test_reconciliation_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Lấy danh sách khoản vay
        loans_res = await client.get("/api/v1/loans?limit=5")
        assert loans_res.status_code == 200
        data = loans_res.json()["data"]
        if len(data) > 0:
            target_loan = data[0]
            loan_id = target_loan["loan_id"]
            
            # Gọi endpoint reconciliation
            rec_res = await client.get(f"/api/v1/loans/{loan_id}/invoices/reconciliation")
            assert rec_res.status_code == 200
            rec_data = rec_res.json()
            assert rec_data["loan_id"] == loan_id
            assert "total_invoice_amount" in rec_data
            assert "is_sufficient" in rec_data
            assert "shortage_amount" in rec_data


@pytest.mark.asyncio
async def test_auto_sync_dossier_invoices_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Lấy danh sách hợp đồng khế ước
        res = await client.get("/api/v1/loans?limit=10")
        assert res.status_code == 200
        loans = res.json()["data"]
        # Tìm khoản vay có dossier_count > 0 nếu có
        dossier_loan = next((l for l in loans if l.get("dossier_count", 0) > 0), None)
        if dossier_loan:
            loan_id = dossier_loan["loan_id"]
            sync_res = await client.post(f"/api/v1/loans/{loan_id}/auto-sync-dossier-invoices?force_recalculate=false")
            assert sync_res.status_code == 200
            data = sync_res.json()
            assert data["loan_id"] == loan_id
            assert "total_allocated_amount" in data
            assert "is_fully_secured" in data
            assert isinstance(data["allocations"], list)

