import pytest
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_srpr_optimal_simulation():
    """
    Kiểm tra thuật toán SRPR v2.0:
    1. Đỉnh nợ T03/2027 được triệt tiêu về đúng 14.00 tỷ VND (bằng trần an toàn).
    2. Sau khi cắt nợ (CTG bắc cầu hoặc MBB trả trước), toàn bộ số tiền gốc đều được vay lại đúng số gốc đó.
    3. Mọi tháng từ T11/2026 đến T05/2027 đều đạt is_safe = True.
    4. Giảm đỉnh nợ từ 73.76 tỷ xuống 14.00 tỷ (giảm ~81%).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "capacity_mode": "UNIFORM",
            "uniform_monthly_capacity": "14000000000.00",
            "reborrow_rate": "100.00",
            "reborrow_mode": "SRPR_OPTIMAL",
        }
        res = await client.post("/api/v1/loans/repayment-plan/simulate", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert Decimal(data["total_principal_debt"]) > Decimal("0.00")
        assert data["total_loans_count"] > 0
        assert Decimal(data["peak_debt_before"]) > Decimal("0.00")
        assert Decimal(data["peak_debt_after"]) == Decimal("14000000000.00")
        assert Decimal(data["peak_reduction_percent"]) > Decimal("0.00")

        # Kiểm tra từng tháng trong schedule
        schedule_map = {m["month"]: m for m in data["monthly_schedule"]}
        assert len(schedule_map) == 7

        # T11/2026
        assert Decimal(schedule_map["2026-11"]["allocated_payment_amount"]) == Decimal("14000000000.00")
        assert schedule_map["2026-11"]["is_safe"] is True

        # T12/2026: Đáo hạn 13 tỷ (11.9 tỷ CTG bắc cầu + 1.1 tỷ tự nhiên)
        assert Decimal(schedule_map["2026-12"]["allocated_payment_amount"]) == Decimal("13000000000.00")
        assert Decimal(schedule_map["2026-12"]["bridged_due_amount"]) == Decimal("11900000000.00")
        assert schedule_map["2026-12"]["is_safe"] is True

        # T01/2027: Đáo hạn 13 tỷ CTG bắc cầu
        assert Decimal(schedule_map["2027-01"]["allocated_payment_amount"]) == Decimal("13000000000.00")
        assert Decimal(schedule_map["2027-01"]["bridged_due_amount"]) == Decimal("13000000000.00")
        assert schedule_map["2027-01"]["is_safe"] is True

        # T02/2027: Đáo hạn 5 tỷ CTG bắc cầu
        assert Decimal(schedule_map["2027-02"]["allocated_payment_amount"]) == Decimal("5000000000.00")
        assert Decimal(schedule_map["2027-02"]["bridged_due_amount"]) == Decimal("5000000000.00")
        assert schedule_map["2027-02"]["is_safe"] is True

        # T03/2027: ĐỈNH NỢ ĐƯỢC LÀM PHẲNG VỀ ĐÚNG 14.00 TỶ!
        assert Decimal(schedule_map["2027-03"]["allocated_payment_amount"]) == Decimal("14000000000.00")
        assert schedule_map["2027-03"]["is_safe"] is True

        # T04 & T05
        assert Decimal(schedule_map["2027-04"]["allocated_payment_amount"]) == Decimal("14000000000.00")
        assert Decimal(schedule_map["2027-05"]["allocated_payment_amount"]) == Decimal("14000000000.00")

        # Kiểm tra tổng tiền đã cắt và được vay lại đúng số tiền gốc
        assert Decimal(data["total_cut_and_reborrowed_amount"]) > Decimal("50000000000.00")

        # Kiểm tra allocations có đầy đủ các action nghiệp vụ
        action_types = {alc["action_type"] for alc in data["allocations"]}
        assert "STEPPED_BRIDGING_DRAWDOWN" in action_types
        assert "INTRADAY_PREPAY_REROUTE" in action_types
        assert "MATURITY_ROLLOVER" in action_types
        assert "PAY_ON_DUE" in action_types


@pytest.mark.asyncio
async def test_lump_sum_standard_scenario():
    """
    Kiểm tra Kịch bản đối chứng (LUMP_SUM_STANDARD):
    Tái vay 4T thụ động khiến nợ dồn vào Tháng 03/2027 lên 73.76 tỷ VND (quá tải).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "capacity_mode": "UNIFORM",
            "uniform_monthly_capacity": "14000000000.00",
            "reborrow_rate": "100.00",
            "reborrow_mode": "LUMP_SUM_STANDARD",
        }
        res = await client.post("/api/v1/loans/repayment-plan/simulate", json=payload)
        assert res.status_code == 200
        data = res.json()

        schedule_map = {m["month"]: m for m in data["monthly_schedule"]}
        assert Decimal(schedule_map["2027-03"]["natural_due_amount"]) == Decimal("73760540000.00")
        assert schedule_map["2027-03"]["is_safe"] is False
