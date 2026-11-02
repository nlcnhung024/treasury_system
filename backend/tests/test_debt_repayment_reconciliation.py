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
