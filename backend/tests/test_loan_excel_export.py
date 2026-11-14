import pytest
import openpyxl
from datetime import datetime
from decimal import Decimal
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.loan_excel_exporter import build_contracts_summary_excel


def test_build_contracts_summary_excel():
    sample_items = [
        {
            "loan_id": 1,
            "bank_code": "TPB",
            "bank_name": "TPBank",
            "contract_number": "=cmd|' /C calc'!A0",  # Test formula injection
            "borrower_name": "CONG TY CO PHAN XI MANG SUNRISE",
            "original_principal_balance": "500000000",
            "total_principal_paid": "0",
            "current_principal_balance": "500000000",
            "interest_rate": "11.20",
            "estimated_interest": "18717808",
            "total_interest_paid": "13654794",
            "disbursement_date": "2026-06-15",
            "maturity_date": "2026-11-20",
            "invoice_reconciliation_status": "FULLY_SECURED",
            "loan_purpose": "Thanh toán tiền mua clinker",
        },
        {
            "loan_id": 2,
            "bank_code": "VPB",
            "bank_name": "VPBank",
            "contract_number": "040826-19716098-ONL-7",
            "borrower_name": "CONG TY CO PHAN XI MANG SUNRISE",
            "original_principal_balance": "2250000000",
            "total_principal_paid": "0",
            "current_principal_balance": "2250000000",
            "interest_rate": "10.70",
            "estimated_interest": "100917123",
            "total_interest_paid": "0",
            "disbursement_date": "2026-07-01",
            "maturity_date": "2026-11-20",
            "invoice_reconciliation_status": "UNDER_SECURED",
            "loan_purpose": "Bổ sung vốn lưu động",
        },
        {
            "loan_id": 3,
            "bank_code": "TPB",
            "bank_name": "TPBank",
            "contract_number": "040MAZS262180005",
            "borrower_name": "CONG TY CO PHAN XI MANG SUNRISE",
            "original_principal_balance": "400000000",
            "total_principal_paid": "0",
            "current_principal_balance": "400000000",
            "interest_rate": "11.20",
            "estimated_interest": "14974247",
            "total_interest_paid": "7609864",
            "disbursement_date": "2026-06-20",
            "maturity_date": "2026-12-10",
            "invoice_reconciliation_status": "NO_INVOICE",
            "loan_purpose": "Mua than",
        },
    ]

    report_dt = datetime(2026, 11, 14, 9, 0, 0)
    excel_stream = build_contracts_summary_excel(
        items=sample_items,
        company_name="CONG TY CO PHAN XI MANG SUNRISE",
        report_date=report_dt,
    )

    wb = openpyxl.load_workbook(excel_stream, data_only=False)
    sheet_names = wb.sheetnames
    assert len(sheet_names) == 2
    assert sheet_names[0] == "Danh_Sach_Khe_Uoc"
    assert sheet_names[1] == "Pivot_Ngay_Den_Han"

    # Sheet 1 assertions
    ws1 = wb["Danh_Sach_Khe_Uoc"]
    assert ws1.cell(row=1, column=1).value == "STT"
    assert ws1.cell(row=1, column=2).value == "Ngân hàng"
    assert ws1.cell(row=1, column=3).value == "Số khế ước"
    assert ws1.cell(row=1, column=7).value == "Dư nợ hiện tại (VNĐ)"

    # Verify formula injection sanitization in Sheet 1
    sanitized_contract = ws1.cell(row=2, column=3).value
    assert sanitized_contract.startswith("'")  # escaped with single quote

    # Sheet 2 assertions
    ws2 = wb["Pivot_Ngay_Den_Han"]
    # Check professional header
    assert "ĐƠN VỊ: CONG TY CO PHAN XI MANG SUNRISE" in str(ws2.cell(row=1, column=1).value)
    assert "BÁO CÁO THỐNG KÊ KHẾ ƯỚC NHẬN NỢ CÒN HIỆU LỰC THEO NGÀY ĐẾN HẠN" in str(ws2.cell(row=4, column=1).value)
    assert "14/11/2026" in str(ws2.cell(row=5, column=1).value)

    # Check pivot header (Row 7)
    headers_s2 = [ws2.cell(row=7, column=col).value for col in range(1, 6)]
    assert headers_s2[0] == "STT"
    assert headers_s2[1] == "Ngày đến hạn"
    assert "TPBank" in headers_s2
    assert "VPBank" in headers_s2
    assert headers_s2[-1] == "Tổng cộng"


@pytest.mark.asyncio
async def test_api_export_contracts_excel():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/loans/contracts/export-excel",
            json={"loan_ids": [], "company_name": "CONG TY CO PHAN XI MANG SUNRISE"},
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["Content-Type"]
        assert "attachment" in response.headers["Content-Disposition"]
        assert "Thong ke khe uoc nhan no con hieu luc" in response.headers["Content-Disposition"]
