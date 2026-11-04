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


def test_parse_mbb_credit_statement():
    f = SAMPLES_CREDIT_DIR / "Vay_LD (1).xlsx"
    assert f.exists(), f"Không tìm thấy file mẫu: {f}"

    pkg = parse_credit_statement_file(f)

    assert pkg.template_code == "MBB_LOAN_LD_XLSX"
    assert pkg.bank_code == "MBB"
    assert "MB" in pkg.bank_name or "Quân Đội" in pkg.bank_name
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

        # 3. Upload MBB (Vay/LD)
        f2_path = SAMPLES_CREDIT_DIR / "Vay_LD (1).xlsx"
        f2_bytes = f2_path.read_bytes()
        files2 = {"file": ("Vay_LD (1).xlsx", f2_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        res2 = await ac.post("/api/v1/credit-statements/upload", files=files2, data={"uploaded_by": "Test Accountant"})
        assert res2.status_code == 201
        data2 = res2.json()
        assert data2["bank_code"] == "MBB"
        assert data2["template_code"] == "MBB_LOAN_LD_XLSX"
        assert data2["total_contracts_count"] == 18
        assert data2["reconciliation_status"] == "BALANCED"

        # 4. Kiểm tra danh sách loans
        loans_res = await ac.get("/api/v1/loans?limit=100")
        assert loans_res.status_code == 200
        loans_data = loans_res.json()["data"]
        assert len(loans_data) >= 37  # 19 CTG + 18 MBB

        # 5. Kiểm tra summary KPI hợp nhất
        summary_res = await ac.get("/api/v1/loans/summary")
        assert summary_res.status_code == 200
        summary_data = summary_res.json()
        assert summary_data["total_active_loans"] >= 37
        assert len(summary_data["by_bank"]) >= 2

        # Dọn dẹp dữ liệu upload sau khi test
        async with AsyncSessionLocal() as clean_session:
            await clean_session.execute(delete(CreditStatementFile).where(CreditStatementFile.file_sha256.in_([sha1, sha2])))
            await clean_session.commit()


@pytest.mark.asyncio
async def test_manual_loan_crud_and_filtering():
    """
    Kiểm tra luồng CRUD khoản nợ lẻ từ công ty tài chính/cho thuê tài chính
    và các bộ lọc đa chiều theo loại tổ chức và nguồn thủ công.
    """
    from httpx import AsyncClient, ASGITransport
    from sqlalchemy import delete
    from app.main import app
    from app.core.database import AsyncSessionLocal
    from app.models.credit import CreditFacility

    test_contract = "TEST-FE-2026-99"

    async with AsyncSessionLocal() as session:
        await session.execute(delete(CreditFacility).where(CreditFacility.contract_number == test_contract))
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Tạo mới khoản vay lẻ từ Công ty Tài chính FE Credit
        create_payload = {
            "bank_code": "FE_CREDIT",
            "bank_name": "Công ty Tài chính TNHH MTV VPBank SMBC (FE Credit)",
            "institution_type": "FINANCE_COMPANY",
            "contract_number": test_contract,
            "borrower_name": "CONG TY CO PHAN XI MANG SUNRISE",
            "cif_number": "CIF-FE-8899",
            "loan_purpose": "Vay tiêu dùng / bổ sung vốn lưu động",
            "currency": "VND",
            "disbursement_date": "2026-06-01",
            "maturity_date": "2026-12-01",
            "term": "6M",
            "interest_rate": 12.5,
            "debt_group": "1",
            "loan_type": "SHORT_TERM",
            "current_principal_balance": 500000000.00,
            "accrued_interest": 5208333.00,
            "next_repayment_date": "2026-07-01",
            "next_principal_amount": 83333333.00,
            "next_interest_amount": 5208333.00,
            "note": "Hợp đồng nợ lẻ ngoài sao kê ngân hàng",
        }
        res_create = await ac.post("/api/v1/loans", json=create_payload)
        assert res_create.status_code == 201, res_create.text
        created_data = res_create.json()
        loan_id = created_data["loan_id"]
        assert created_data["contract_number"] == test_contract
        assert created_data["institution_type"] == "FINANCE_COMPANY"
        assert created_data["is_manual"] is True
        assert Decimal(str(created_data["total_repayment_amount"])) == Decimal("83333333.00") + Decimal("5208333.00")

        # 2. Kiểm tra chống trùng lặp (409 Conflict)
        res_dup = await ac.post("/api/v1/loans", json=create_payload)
        assert res_dup.status_code == 409

        # 3. Lọc theo institution_type=FINANCE_COMPANY
        res_filter_inst = await ac.get("/api/v1/loans?institution_type=FINANCE_COMPANY")
        assert res_filter_inst.status_code == 200
        inst_loans = res_filter_inst.json()["data"]
        assert any(l["loan_id"] == loan_id for l in inst_loans)

        # 4. Lọc theo is_manual=true
        res_filter_manual = await ac.get("/api/v1/loans?is_manual=true")
        assert res_filter_manual.status_code == 200
        manual_loans = res_filter_manual.json()["data"]
        assert any(l["loan_id"] == loan_id for l in manual_loans)

        # 5. Cập nhật thông tin khoản vay qua PUT
        # 5.1 Kiểm tra API /loans/organizations trả về tổ chức vừa tạo
        res_orgs = await ac.get("/api/v1/loans/organizations")
        assert res_orgs.status_code == 200
        orgs = res_orgs.json()
        fe_org = next((o for o in orgs if o["bank_code"] == "FE_CREDIT"), None)
        assert fe_org is not None
        assert fe_org["institution_type"] == "FINANCE_COMPANY"
        assert fe_org["bank_name"] == create_payload["bank_name"]

        update_payload = {
            "interest_rate": 11.8,
            "note": "Đã thương lượng giảm lãi suất",
        }
        res_update = await ac.put(f"/api/v1/loans/{loan_id}", json=update_payload)
        assert res_update.status_code == 200
        updated_data = res_update.json()
        assert float(updated_data["interest_rate"]) == 11.8
        assert updated_data["note"] == "Đã thương lượng giảm lãi suất"

        # 6. Xóa khoản vay
        res_delete = await ac.delete(f"/api/v1/loans/{loan_id}")
        assert res_delete.status_code == 200

        # Kiểm tra không còn trong danh sách active
        res_check = await ac.get(f"/api/v1/loans/{loan_id}")
        assert res_check.status_code == 404


@pytest.mark.asyncio
async def test_vietinbank_interest_payment_monthly_day_5():
    """
    Kiểm tra quy định đối với các khoản vay VietinBank (CTG):
    - Hình thức trả lãi chuẩn là MONTHLY (Hằng tháng).
    - Ngày trả lãi định kỳ cố định là ngày 5 hằng tháng.
    - Số lãi cần trả (calculated_interest_due) tính theo Thông tư 14/2017/TT-NHNN cơ sở Actual/365.
    """
    import uuid
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Kiểm tra danh sách khoản vay CTG hiện có trong DB
        res_ctg = await ac.get("/api/v1/loans?bank_code=CTG&limit=50")
        assert res_ctg.status_code == 200
        ctg_loans = res_ctg.json()["data"]
        assert len(ctg_loans) > 0, "Phải có danh mục khoản vay CTG"

        for loan in ctg_loans:
            assert loan["interest_payment_method"] == "MONTHLY", f"Khoản vay CTG {loan['contract_number']} phải trả lãi MONTHLY"
            assert loan["monthly_interest_due_day"] == 5, f"Khoản vay CTG {loan['contract_number']} phải có ngày trả lãi là 5"

        # 2. Tạo khoản vay CTG mới không truyền monthly_interest_due_day -> Hệ thống tự gán là 5
        test_ctg_contract = f"CTG-TEST-{uuid.uuid4().hex[:6].upper()}"
        ctg_create_payload = {
            "bank_code": "CTG",
            "bank_name": "Ngân hàng TMCP Công Thương Việt Nam (VietinBank)",
            "institution_type": "BANK",
            "contract_number": test_ctg_contract,
            "borrower_name": "CONG TY CO PHAN XI MANG SUNRISE",
            "interest_rate": 8.7,
            "current_principal_balance": 1000000000.00,
            "disbursement_date": "2026-08-20",
            "maturity_date": "2026-12-20",
        }
        res_create = await ac.post("/api/v1/loans", json=ctg_create_payload)
        assert res_create.status_code == 201, res_create.text
        created = res_create.json()
        new_loan_id = created["loan_id"]

        try:
            assert created["interest_payment_method"] == "MONTHLY"
            assert created["monthly_interest_due_day"] == 5
            assert Decimal(str(created["calculated_interest_due"])) > 0
            # Lãi cộng dồn tự động tính bằng hệ thống
            assert Decimal(str(created["accrued_interest"])) == Decimal(str(created["calculated_interest_due"]))

            # Kiểm tra cập nhật khoản vay -> Lãi cộng dồn tự động tính toán lại
            res_upd = await ac.put(f"/api/v1/loans/{new_loan_id}", json={"current_principal_balance": 500000000.00})
            assert res_upd.status_code == 200
            upd_data = res_upd.json()
            assert Decimal(str(upd_data["current_principal_balance"])) == Decimal("500000000.00")
            assert Decimal(str(upd_data["accrued_interest"])) == Decimal(str(upd_data["calculated_interest_due"]))
            assert Decimal(str(upd_data["accrued_interest"])) < Decimal(str(created["accrued_interest"]))
        finally:
            await ac.delete(f"/api/v1/loans/{new_loan_id}")



