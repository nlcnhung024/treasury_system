from decimal import Decimal
from pathlib import Path
import pytest
from app.services.parser.credit_stream_parser import parse_credit_statement_file

SAMPLES_CREDIT_DIR = Path(__file__).resolve().parent.parent.parent / "Resources" / "Sample_sao_ke_tin_dung"


def test_parse_vietinbank_credit_statement():
    f = SAMPLES_CREDIT_DIR / "danh-sach-tai-khoan-tien-vay(31-10-2026 08_54_00).xls"
    assert f.exists(), f"Không tìm thấy file mẫu: {f}"

    pkg = parse_credit_statement_file(f)

    assert pkg.template_code == "CTG_LOAN_XLS"
    assert pkg.bank_code == "CTG"
    assert "VietinBank" in pkg.bank_name
    assert "CONG TY CO PHAN XI MANG SUNRISE" in pkg.borrower_name
    assert pkg.cif_number == "3023856159"
    assert pkg.total_contracts_count == 19

    # Kiểm tra tính cân bằng tuyệt đối
    assert pkg.total_principal_amount == Decimal("30355015000.00")
    assert pkg.calculated_principal_amount == Decimal("30355015000.00")
    assert pkg.reconciliation_status == "BALANCED"
    assert pkg.discrepancy_amount == Decimal("0.00")

    # Kiểm tra chi tiết từng khoản vay
    contract_numbers = [it["contract_number"] for it in pkg.items]
    assert len(contract_numbers) == 19
    assert len(set(contract_numbers)) == 19  # Không trùng lặp
    assert "805008104760" in contract_numbers

    first_item = pkg.items[0]
    assert first_item["contract_number"] == "805008104760"
    assert first_item["principal_balance"] == Decimal("2050000000.00")
    assert first_item["interest_rate"] == Decimal("8.7000")
    assert first_item["currency"] == "VND"
    assert first_item["term"] == "4M"


def test_parse_bidv_credit_statement():
    f = SAMPLES_CREDIT_DIR / "Vay_LD (1).xlsx"
    assert f.exists(), f"Không tìm thấy file mẫu: {f}"

    pkg = parse_credit_statement_file(f)

    assert pkg.template_code == "BIDV_LOAN_LD_XLSX"
    assert pkg.bank_code == "BIDV"
    assert "BIDV" in pkg.bank_name
    assert pkg.total_contracts_count == 18

    # Kiểm tra tính cân bằng tuyệt đối
    assert pkg.total_principal_amount == Decimal("48805525000.00")
    assert pkg.calculated_principal_amount == Decimal("48805525000.00")
    assert pkg.reconciliation_status == "BALANCED"
    assert pkg.discrepancy_amount == Decimal("0.00")

    # Kiểm tra chi tiết các khế ước LD
    ld_numbers = [it["contract_number"] for it in pkg.items]
    assert len(ld_numbers) == 18
    assert len(set(ld_numbers)) == 18
    assert "LD2612865515" in ld_numbers

    first_ld = pkg.items[0]
    assert first_ld["contract_number"] == "LD2612865515"
    assert first_ld["principal_balance"] == Decimal("2880000000.00")
    assert first_ld["interest_rate"] == Decimal("9.2700")
    assert first_ld["debt_group"] == "1"
    assert "Thanh toan tien hang" in first_ld["loan_purpose"]
    assert first_ld["next_principal_amount"] == Decimal("2880000000.00")
    assert first_ld["next_interest_amount"] == Decimal("22735627.00")


@pytest.mark.asyncio
async def test_end_to_end_credit_statement_api():
    import hashlib
    from httpx import AsyncClient, ASGITransport
    from sqlalchemy import select, delete
    from app.main import app
    from app.core.database import AsyncSessionLocal
    from app.models.credit import CreditStatementFile, CreditFacility, CreditStatementItem

    f1_path = SAMPLES_CREDIT_DIR / "danh-sach-tai-khoan-tien-vay(31-10-2026 08_54_00).xls"
    f1_bytes = f1_path.read_bytes()
    sha1 = hashlib.sha256(f1_bytes).hexdigest()

    f2_path = SAMPLES_CREDIT_DIR / "Vay_LD (1).xlsx"
    f2_bytes = f2_path.read_bytes()
    sha2 = hashlib.sha256(f2_bytes).hexdigest()

    # Dọn dẹp dữ liệu cũ nếu đã tồn tại để đảm bảo tính Idempotent của test
    async with AsyncSessionLocal() as session:
        await session.execute(delete(CreditStatementFile).where(CreditStatementFile.file_sha256.in_([sha1, sha2])))
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Upload VietinBank
        f1_path = SAMPLES_CREDIT_DIR / "danh-sach-tai-khoan-tien-vay(31-10-2026 08_54_00).xls"
        f1_bytes = f1_path.read_bytes()
        files1 = {"file": ("danh-sach-tai-khoan-tien-vay(31-10-2026 08_54_00).xls", f1_bytes, "application/vnd.ms-excel")}
        res1 = await ac.post("/api/v1/credit-statements/upload", files=files1, data={"uploaded_by": "Test Accountant"})
        assert res1.status_code == 201
        data1 = res1.json()
        assert data1["bank_code"] == "CTG"
        assert data1["template_code"] == "CTG_LOAN_XLS"
        assert data1["total_contracts_count"] == 19
        assert data1["reconciliation_status"] == "BALANCED"

        # 2. Upload lặp lại cùng file -> 409 Conflict
        res1_dup = await ac.post("/api/v1/credit-statements/upload", files=files1)
        assert res1_dup.status_code == 409

        # 3. Upload BIDV
        f2_path = SAMPLES_CREDIT_DIR / "Vay_LD (1).xlsx"
        f2_bytes = f2_path.read_bytes()
        files2 = {"file": ("Vay_LD (1).xlsx", f2_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        res2 = await ac.post("/api/v1/credit-statements/upload", files=files2, data={"uploaded_by": "Test Accountant"})
        assert res2.status_code == 201
        data2 = res2.json()
        assert data2["bank_code"] == "BIDV"
        assert data2["template_code"] == "BIDV_LOAN_LD_XLSX"
        assert data2["total_contracts_count"] == 18
        assert data2["reconciliation_status"] == "BALANCED"

        # 4. Kiểm tra danh sách loans
        loans_res = await ac.get("/api/v1/loans?limit=100")
        assert loans_res.status_code == 200
        loans_data = loans_res.json()["data"]
        assert len(loans_data) == 37  # 19 CTG + 18 BIDV

        # 5. Kiểm tra summary KPI hợp nhất
        summary_res = await ac.get("/api/v1/loans/summary")
        assert summary_res.status_code == 200
        summary_data = summary_res.json()
        assert summary_data["total_active_loans"] == 37
        expected_total = Decimal("30355015000.00") + Decimal("48805525000.00")
        assert Decimal(str(summary_data["total_principal_balance"])) == expected_total
        assert len(summary_data["by_bank"]) == 2

