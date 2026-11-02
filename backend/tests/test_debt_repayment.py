import pytest
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_get_default_repayment_plan():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/loans/repayment-plan?monthly_capacity=14000000000")
        assert res.status_code == 200
        data = res.json()
        assert "total_principal_debt" in data
        assert Decimal(data["total_principal_debt"]) > Decimal("0")
        assert len(data["monthly_schedule"]) > 0
        assert Decimal(data["peak_debt_after"]) <= Decimal("14000000000.00")
        assert Decimal(data["peak_reduction_percent"]) > 0
        assert len(data["allocations"]) > 0


@pytest.mark.asyncio
async def test_simulate_seasonal_repayment_plan():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "capacity_mode": "SEASONAL",
            "uniform_monthly_capacity": "14000000000.00",
            "seasonal_capacities": {
                "2026-11": "15000000000.00",
                "2026-12": "18000000000.00",
                "2027-01": "20000000000.00",
                "2027-02": "8000000000.00",
                "2027-03": "14000000000.00",
                "2027-04": "12000000000.00",
                "2027-05": "10000000000.00",
            },
            "prepayment_penalty_rate": "0.00",
            "strategy": "SPLIT_LARGE_LOANS",
            "mb_tenor_months": 6,
            "ctg_tenor_months": 4,
        }
        res = await client.post("/api/v1/loans/repayment-plan/simulate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["capacity_mode"] == "SEASONAL"
        for m in data["monthly_schedule"]:
            month_key = m["month"]
            expected_cap = Decimal(payload["seasonal_capacities"][month_key])
            assert Decimal(m["monthly_capacity"]) == expected_cap
            # Ensure every month's allocated payment is within capacity
            assert Decimal(m["allocated_payment_amount"]) <= expected_cap
