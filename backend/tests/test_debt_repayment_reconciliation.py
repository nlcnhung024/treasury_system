import pytest
from datetime import datetime, timezone, date
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.credit import CreditFacility, LoanRepaymentHistory
from app.models.transaction import BankTransaction
from app.models.account import BankAccount
from app.models.category_rule import Category


@pytest.fixture
async def setup_test_data():
    async with AsyncSessionLocal() as session:
        # 1. Tìm hoặc tạo Category "Trả nợ"
        stmt_cat = select(Category).where(Category.category_name == "Trả nợ")
        cat = (await session.execute(stmt_cat)).scalar_one_or_none()
        if not cat:
            cat = Category(
                category_type="EXPENSE",
                category_name="Trả nợ",
                color_code="#EF4444",
            )
            session.add(cat)
            await session.flush()

        # 2. Tìm hoặc tạo BankAccount
        stmt_acc = select(BankAccount).where(BankAccount.account_number == "9999TESTACC")
        acc = (await session.execute(stmt_acc)).scalar_one_or_none()
        if not acc:
            acc = BankAccount(
                bank_code="CTG",
                bank_name="VietinBank Test",
                account_number="9999TESTACC",
                account_holder="CONG TY TEST",
                current_balance=Decimal("5000000000.00"),
                is_active=True,
            )
            session.add(acc)
            await session.flush()

        # Lấy một file_id hợp lệ từ bank_statement_files
        from app.models.statement_file import BankStatementFile
        stmt_file = select(BankStatementFile.file_id).limit(1)
        valid_file_id = (await session.execute(stmt_file)).scalar_one_or_none() or 1

        # 3. Tạo một CreditFacility thử nghiệm
        test_contract = "TEST_HDTD_999001"
        stmt_loan = select(CreditFacility).where(CreditFacility.contract_number == test_contract)
        loan = (await session.execute(stmt_loan)).scalar_one_or_none()
        if loan:
            # Xóa các repayment history cũ nếu có
            await session.execute(delete(LoanRepaymentHistory).where(LoanRepaymentHistory.loan_id == loan.loan_id))
            loan.current_principal_balance = Decimal("1000000000.00")
            loan.status = "ACTIVE"
        else:
            loan = CreditFacility(
                bank_code="CTG",
                bank_name="VietinBank Test",
                contract_number=test_contract,
                borrower_name="CONG TY TEST",
                current_principal_balance=Decimal("1000000000.00"),
                interest_rate=Decimal("0.0850"),
                disbursement_date=date(2026, 6, 1),
                maturity_date=date(2026, 12, 1),
                status="ACTIVE",
                is_active=True,
            )
            session.add(loan)
            await session.flush()

        # 4. Tạo một BankTransaction chi trả nợ
        test_tx_date = datetime(2026, 10, 20, 14, 30, 0, tzinfo=timezone.utc)
        test_hash = f"test_hash_repay_{datetime.now().timestamp()}"
        tx = BankTransaction(
            file_id=valid_file_id,
            account_id=acc.account_id,
            category_id=cat.category_id,
            transaction_date=test_tx_date,
            value_date=date(2026, 10, 20),
            reference_number="REF-REPAY-999001",
            counter_party="VietinBank CN Ba Dinh",
            description=f"Tra no khoan vay {test_contract}, Goc: 1,000,000,000 VND",
            debit_amount=Decimal("1000000000.00"),
            credit_amount=Decimal("0.00"),
            running_balance=Decimal("4000000000.00"),
            dedup_hash=test_hash,
        )
        session.add(tx)
        await session.commit()
        await session.refresh(loan)
        await session.refresh(tx)

        yield {
            "loan_id": loan.loan_id,
            "contract_number": test_contract,
            "transaction_id": tx.transaction_id,
            "transaction_date": test_tx_date,
            "debit_amount": tx.debit_amount,
        }

        # Cleanup sau khi test
        async with AsyncSessionLocal() as clean_session:
            await clean_session.execute(delete(LoanRepaymentHistory).where(LoanRepaymentHistory.loan_id == loan.loan_id))
            await clean_session.execute(delete(BankTransaction).where(BankTransaction.transaction_id == tx.transaction_id))
            await clean_session.execute(delete(CreditFacility).where(CreditFacility.loan_id == loan.loan_id))
            await clean_session.execute(delete(BankAccount).where(BankAccount.account_number == "9999TESTACC"))
            await clean_session.commit()


@pytest.mark.asyncio
async def test_get_unreconciled_transactions(setup_test_data):
    data = setup_test_data
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/loans/repayment-reconciliations/unreconciled?keyword=TEST_HDTD_999001")
        assert res.status_code == 200
        body = res.json()
        assert "items" in body
        assert body["total_count"] >= 1

        matched = next((it for it in body["items"] if it["transaction_id"] == data["transaction_id"]), None)
        assert matched is not None
        assert matched["suggested_contract_number"] == data["contract_number"]
        assert matched["suggested_loan_id"] == data["loan_id"]
        assert matched["match_confidence"] == "HIGH"
        assert Decimal(str(matched["suggested_principal_amount"])) == Decimal("1000000000.00")


@pytest.mark.asyncio
async def test_reconcile_full_principal_100pct(setup_test_data):
    data = setup_test_data
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "1000000000.00",
            "interest_amount": "0.00",
            "notes": "Test tra no 100% goc",
        }
        res = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res.status_code == 200
        body = res.json()

        assert body["contract_number"] == data["contract_number"]
        assert Decimal(str(body["principal_amount"])) == Decimal("1000000000.00")
        assert Decimal(str(body["remaining_principal_balance"])) == Decimal("0.00")
        assert body["loan_status"] == "SETTLED"

        # Thời điểm trả nợ đúng bằng thời điểm giao dịch sao kê
        repay_dt = datetime.fromisoformat(body["repayment_date"])
        assert repay_dt.year == data["transaction_date"].year
        assert repay_dt.month == data["transaction_date"].month
        assert repay_dt.day == data["transaction_date"].day
        assert repay_dt.hour == data["transaction_date"].hour

        repayment_id = body["repayment_id"]

        # Kiểm tra giao dịch không còn trong danh sách unreconciled
        res_un = await client.get("/api/v1/loans/repayment-reconciliations/unreconciled?keyword=TEST_HDTD_999001")
        assert res_un.status_code == 200
        un_items = res_un.json()["items"]
        assert not any(it["transaction_id"] == data["transaction_id"] for it in un_items)

        # Kiểm tra rollback
        res_rb = await client.post(f"/api/v1/loans/repayment-reconciliations/{repayment_id}/rollback")
        assert res_rb.status_code == 200
        rb_body = res_rb.json()
        assert Decimal(str(rb_body["restored_balance"])) == Decimal("1000000000.00")
        assert rb_body["loan_status"] == "ACTIVE"


@pytest.mark.asyncio
async def test_reconcile_validation_failure_mismatch_amounts(setup_test_data):
    data = setup_test_data
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "800000000.00",
            "interest_amount": "100000000.00",  # Tổng = 900tr != 1 tỷ
            "notes": "Test fail mismatch",
        }
        res = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res.status_code == 400
        assert "khác với tổng số tiền giao dịch" in res.json()["detail"]


@pytest.mark.asyncio
async def test_reconcile_validation_failure_overpayment(setup_test_data):
    data = setup_test_data
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Giả định sửa loan về dư nợ 500tr
        async with AsyncSessionLocal() as session:
            stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == data["loan_id"])
            l = (await session.execute(stmt_loan)).scalar_one()
            l.current_principal_balance = Decimal("500000000.00")
            await session.commit()

        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "1000000000.00",  # Vượt quá dư nợ 500tr
            "interest_amount": "0.00",
            "notes": "Test fail overpayment",
        }
        res = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res.status_code == 400
        assert "vượt quá dư nợ gốc hiện tại" in res.json()["detail"]


@pytest.mark.asyncio
async def test_reconcile_pre_snapshot_reconstruct_original_principal(setup_test_data):
    """
    Kiểm chứng quy tắc mới:
    - Giao dịch trước ngày xuất file (Pre-Snapshot):
      + Không trừ tiếp vào current_principal_balance (chống trừ 2 lần)
      + Hoàn nguyên tăng original_principal_balance
      + Cho phép số tiền trả nợ lớn hơn current_principal_balance
      + Lưu repayment_timing = 'PRE_SNAPSHOT'
    """
    data = setup_test_data
    transport = ASGITransport(app=app)

    # Thiết lập khế ước có snapshot_date = 2026-10-31 (giao dịch test_tx_date là 2026-10-20 <= 2026-10-31)
    async with AsyncSessionLocal() as session:
        stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == data["loan_id"])
        loan = (await session.execute(stmt_loan)).scalar_one()
        loan.snapshot_date = date(2026, 10, 31)
        loan.snapshot_principal_balance = Decimal("2880000000.00")
        loan.original_principal_balance = Decimal("2880000000.00")
        loan.current_principal_balance = Decimal("2880000000.00")
        loan.repaid_before_snapshot = Decimal("0.00")
        loan.repaid_after_snapshot = Decimal("0.00")
        loan.total_repaid_principal = Decimal("0.00")
        loan.status = "ACTIVE"
        await session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Kiểm tra API unreconciled nhận diện đúng PRE_SNAPSHOT
        res_un = await client.get(f"/api/v1/loans/repayment-reconciliations/unreconciled?keyword={data['contract_number']}")
        assert res_un.status_code == 200
        un_items = res_un.json()["items"]
        matched_tx = next((it for it in un_items if it["transaction_id"] == data["transaction_id"]), None)
        assert matched_tx is not None
        assert matched_tx["timing_prediction"] == "PRE_SNAPSHOT"

        # 2. Thực hiện đối soát 1 tỷ trả gốc
        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "1000000000.00",
            "interest_amount": "0.00",
            "notes": "Test tra no truoc ngay xuat file",
        }
        res_rec = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res_rec.status_code == 200
        rec_body = res_rec.json()

        assert rec_body["repayment_timing"] == "PRE_SNAPSHOT"
        # Dư nợ hiện tại vẫn là 2.88 tỷ (KHÔNG BỊ TRỪ 2 LẦN)
        assert Decimal(str(rec_body["remaining_principal_balance"])) == Decimal("2880000000.00")
        # Dư nợ gốc ban đầu được hoàn nguyên lên: 2.88 tỷ + 1.00 tỷ = 3.88 tỷ
        assert Decimal(str(rec_body["original_principal_balance"])) == Decimal("3880000000.00")
        assert Decimal(str(rec_body["total_repaid_principal"])) == Decimal("1000000000.00")
        assert rec_body["loan_status"] == "ACTIVE"

        repay_id = rec_body["repayment_id"]

        # 3. Kiểm tra Rollback đối soát Pre-Snapshot
        res_rb = await client.post(f"/api/v1/loans/repayment-reconciliations/{repay_id}/rollback")
        assert res_rb.status_code == 200

        # Kiểm tra lại số dư trong CSDL sau rollback
        async with AsyncSessionLocal() as session:
            stmt_chk = select(CreditFacility).where(CreditFacility.loan_id == data["loan_id"])
            loan_after = (await session.execute(stmt_chk)).scalar_one()
            assert loan_after.original_principal_balance == Decimal("2880000000.00")
            assert loan_after.current_principal_balance == Decimal("2880000000.00")
            assert loan_after.repaid_before_snapshot == Decimal("0.00")
            assert loan_after.total_repaid_principal == Decimal("0.00")


@pytest.mark.asyncio
async def test_reconcile_pre_snapshot_larger_than_current_balance(setup_test_data):
    """
    Kiểm chứng: Giao dịch trước ngày xuất file có số tiền lớn hơn dư nợ hiện tại trên file
    vẫn được chấp nhận và hoàn nguyên thành công (không bị lỗi overpayment).
    """
    data = setup_test_data
    transport = ASGITransport(app=app)

    async with AsyncSessionLocal() as session:
        stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == data["loan_id"])
        loan = (await session.execute(stmt_loan)).scalar_one()
        loan.snapshot_date = date(2026, 10, 31)
        loan.snapshot_principal_balance = Decimal("500000000.00")  # 500tr
        loan.original_principal_balance = Decimal("500000000.00")
        loan.current_principal_balance = Decimal("500000000.00")
        loan.repaid_before_snapshot = Decimal("0.00")
        loan.total_repaid_principal = Decimal("0.00")
        await session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Giao dịch chi 1 tỷ (lớn hơn số dư 500tr trên file)
        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "1000000000.00",
            "interest_amount": "0.00",
            "notes": "Tra no goc 1 ty trong khi tren file chi con 500tr",
        }
        res = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["repayment_timing"] == "PRE_SNAPSHOT"
        assert Decimal(str(body["remaining_principal_balance"])) == Decimal("500000000.00")
        # Hoàn nguyên gốc ban đầu: 500tr + 1 tỷ = 1.5 tỷ
        assert Decimal(str(body["original_principal_balance"])) == Decimal("1500000000.00")


@pytest.mark.asyncio
async def test_reconcile_with_negative_interest_payoff(setup_test_data):
    """
    Kiểm chứng: Cho phép đối soát với số tiền lãi âm (hoàn lãi / thoái thu / giảm trừ lãi khi tất toán).
    Ví dụ: Dư nợ 921.000.000 đ, Tổng tiền GD 920.111.343 đ, Lãi cộng dồn -888.657 đ -> Tất toán về 0 đ.
    """
    data = setup_test_data
    transport = ASGITransport(app=app)

    async with AsyncSessionLocal() as session:
        # Cập nhật số dư khoản vay thành 921 triệu
        stmt_loan = select(CreditFacility).where(CreditFacility.loan_id == data["loan_id"])
        loan = (await session.execute(stmt_loan)).scalar_one()
        loan.snapshot_date = date(2026, 9, 3)
        loan.snapshot_principal_balance = Decimal("1221000000.00")
        loan.current_principal_balance = Decimal("921000000.00")
        loan.original_principal_balance = Decimal("1950000000.00")
        loan.status = "ACTIVE"

        # Cập nhật số tiền transaction thành 920.111.343 đ (phát sinh sau snapshot: 2026-09-07)
        stmt_tx = select(BankTransaction).where(BankTransaction.transaction_id == data["transaction_id"])
        tx = (await session.execute(stmt_tx)).scalar_one()
        tx.transaction_date = datetime(2026, 9, 7, 13, 43, 17, tzinfo=timezone.utc)
        tx.debit_amount = Decimal("920111343.00")
        tx.description = "Tat toan khoan vay TEST_HDTD_999001, So tien goc: 921,000,000 VND, Lai cong don: -888,657 VND"
        await session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Kiểm tra gợi ý tự động bóc tách được số tiền lãi âm và gốc đầy đủ
        res_unrec = await client.get("/api/v1/loans/repayment-reconciliations/unreconciled?keyword=TEST_HDTD_999001")
        assert res_unrec.status_code == 200
        items = res_unrec.json().get("items", [])
        assert len(items) >= 1
        item = items[0]
        assert Decimal(str(item["suggested_principal_amount"])) == Decimal("921000000.00")
        assert Decimal(str(item["suggested_interest_amount"])) == Decimal("-888657.00")

        # 2. Thực hiện đối soát với lãi âm
        payload = {
            "transaction_id": data["transaction_id"],
            "loan_id": data["loan_id"],
            "principal_amount": "921000000.00",
            "interest_amount": "-888657.00",
            "notes": "Tat toan tat ca no goc, lai am do ngan hang thoai thu lai",
        }
        res = await client.post("/api/v1/loans/repayment-reconciliations/reconcile", json=payload)
        assert res.status_code == 200
        body = res.json()

        assert body["repayment_timing"] == "POST_SNAPSHOT"
        assert Decimal(str(body["principal_amount"])) == Decimal("921000000.00")
        assert Decimal(str(body["interest_amount"])) == Decimal("-888657.00")
        assert Decimal(str(body["total_amount"])) == Decimal("920111343.00")
        assert Decimal(str(body["remaining_principal_balance"])) == Decimal("0.00")
        assert body["loan_status"] == "SETTLED"

        # 3. Rollback hoàn tác
        repay_id = body["repayment_id"]
        res_rb = await client.post(f"/api/v1/loans/repayment-reconciliations/{repay_id}/rollback")
        assert res_rb.status_code == 200



@pytest.mark.asyncio
async def test_unreconciled_transaction_unknown_contract_leaves_blank(setup_test_data):
    """
    Quy tắc nghiệp vụ: Chỉ gợi ý khế ước nếu khế ước đó có trong danh sách đã nạp (credit_facilities).
    Nếu không có trong danh sách khế ước đã nạp thì tuyệt đối để trống (None).
    """
    data = setup_test_data
    transport = ASGITransport(app=app)
    async with AsyncSessionLocal() as session:
        tx = await session.get(BankTransaction, data["transaction_id"])
        tx.description = "Thu lai khe uoc LD999999999999, So tien: 500,000 VND"
        await session.commit()

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/loans/repayment-reconciliations/unreconciled?keyword=LD999999999999")
            assert res.status_code == 200
            items = res.json().get("items", [])
            matched = next((it for it in items if it["transaction_id"] == data["transaction_id"]), None)
            assert matched is not None
            # Bắt buộc để trống nếu khế ước không có trong danh sách đã nạp
            assert matched["suggested_contract_number"] is None
            assert matched["suggested_loan_id"] is None
            assert matched["suggested_principal_balance"] is None
            assert matched["match_confidence"] == "NONE"
    finally:
        async with AsyncSessionLocal() as session:
            tx = await session.get(BankTransaction, data["transaction_id"])
            if tx:
                tx.description = f"Tra no khoan vay {data['contract_number']}, Goc: 1,000,000,000 VND"
                await session.commit()


@pytest.mark.asyncio
async def test_repayment_history_keyword_search(setup_test_data):
    """
    Kiểm thử tìm kiếm theo từ khóa (keyword) trên tab Nhật ký lịch sử trả nợ.
    Tìm kiếm đúng số khế ước, diễn giải sao kê, hoặc ghi chú.
    Đảm bảo teardown 100% sau kiểm thử.
    """
    data = setup_test_data
    transport = ASGITransport(app=app)
    repay_id = None

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Đối soát 1 giao dịch
        res_rec = await client.post(
            "/api/v1/loans/repayment-reconciliations/reconcile",
            json={
                "transaction_id": data["transaction_id"],
                "loan_id": data["loan_id"],
                "principal_amount": 1000000000.0,
                "interest_amount": 0.0,
                "repayment_timing": "POST_SNAPSHOT",
                "notes": "Ghi chú test keyword search",
            },
        )
        assert res_rec.status_code == 200
        repay_id = res_rec.json()["repayment_id"]

        try:
            # 2. Tìm kiếm với keyword khớp số khế ước
            res_kw1 = await client.get(
                f"/api/v1/loans/repayment-reconciliations/history?keyword={data['contract_number']}"
            )
            assert res_kw1.status_code == 200
            items1 = res_kw1.json().get("items", [])
            assert any(it["repayment_id"] == repay_id for it in items1)

            # 3. Tìm kiếm với keyword không khớp
            res_kw2 = await client.get(
                "/api/v1/loans/repayment-reconciliations/history?keyword=NON_EXISTENT_KEYWORD_XYZ_999"
            )
            assert res_kw2.status_code == 200
            items2 = res_kw2.json().get("items", [])
            assert not any(it["repayment_id"] == repay_id for it in items2)
        finally:
            # 4. Teardown: Rollback giao dịch để trả lại trạng thái CSDL
            if repay_id:
                res_rb = await client.post(
                    f"/api/v1/loans/repayment-reconciliations/{repay_id}/rollback"
                )
                assert res_rb.status_code == 200
