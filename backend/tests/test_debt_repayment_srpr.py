"""Unit tests cho Debt Repayment Engine (US-07.8) - không chạm CSDL, không cần teardown."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.schemas.credit import RepaymentPlanSimulateRequest
from app.services.debt_repayment_service import DebtRepaymentService

TODAY = date(2026, 11, 3)
B = Decimal("1000000000")  # 1 tỷ


def loan(lid, bank, amount_ty, due, rate="8.0"):
    return SimpleNamespace(
        loan_id=lid, bank_code=bank, contract_number=f"{bank}-{lid}",
        current_principal_balance=Decimal(amount_ty) * B, interest_rate=Decimal(rate),
        next_repayment_date=due, maturity_date=due,
    )


def req(**kw):
    base = dict(uniform_monthly_capacity=Decimal("14") * B)
    base.update(kw)
    return RepaymentPlanSimulateRequest(**base)


def plan(loans, **kw):
    return DebtRepaymentService.build_plan(loans, req(**kw), today=TODAY)


def test_empty_portfolio():
    p = plan([])
    assert p.total_loans_count == 0 and p.monthly_schedule == []


def test_peak_month_is_smoothed_under_capacity():
    loans = [loan(1, "CTG", "5", date(2026, 11, 20)),
             loan(2, "CTG", "5", date(2026, 12, 20)),
             loan(3, "MBB", "30", date(2027, 3, 15))]
    p = plan(loans)
    assert len(p.monthly_schedule) == 7
    for m in p.monthly_schedule:
        assert m.allocated_payment_amount <= m.monthly_capacity, m.month
        assert m.is_safe
    assert p.peak_debt_after <= Decimal("14") * B
    assert p.peak_debt_before > p.peak_debt_after
    assert p.total_cut_and_reborrowed_amount > 0


def test_new_loan_changes_result():
    base = [loan(1, "MBB", "10", date(2027, 1, 10))]
    p1 = plan(base)
    p2 = plan(base + [loan(2, "MBB", "8", date(2027, 1, 12))])
    assert p2.total_principal_debt - p1.total_principal_debt == Decimal("8") * B
    assert p1.monthly_schedule != p2.monthly_schedule


def test_reborrow_full_match_and_balance_conserved():
    loans = [loan(1, "CTG", "20", date(2026, 12, 5))]
    p = plan(loans, reborrow_rate=Decimal("100"))
    # Vay lại 100% -> dư nợ cuối kỳ không đổi
    assert p.monthly_schedule[-1].closing_total_debt == Decimal("20") * B


def test_zero_reborrow_reduces_debt():
    loans = [loan(1, "CTG", "10", date(2026, 12, 5))]
    p = plan(loans, reborrow_rate=Decimal("0"))
    assert p.total_reborrowed_amount == 0
    assert p.monthly_schedule[-1].closing_total_debt == 0


def test_overdue_loan_lands_in_first_month():
    p = plan([loan(1, "OTHER", "5", date(2026, 9, 1))])
    assert p.monthly_schedule[0].natural_due_amount == Decimal("5") * B


def test_infeasible_reports_over_capacity():
    # Đến hạn ngay tháng đầu, vượt trần, không có tháng trước để cắt
    p = plan([loan(1, "MBB", "30", date(2026, 11, 10))])
    first = p.monthly_schedule[0]
    assert first.is_safe is False and first.status_label == "OVER_CAPACITY"
    assert "Cảnh báo" in p.reborrow_summary_note


def test_penalty_applied_on_prepayment():
    loans = [loan(1, "MBB", "30", date(2027, 3, 15))]
    p = plan(loans, prepayment_penalty_rate=Decimal("1"))
    prepaid = sum(m.prepaid_principal_amount for m in p.monthly_schedule)
    assert prepaid > 0
    assert p.total_penalty_incurred == (prepaid * Decimal("0.01")).quantize(Decimal("0.01"))


def test_lump_sum_mode_does_not_smooth():
    loans = [loan(1, "MBB", "30", date(2027, 3, 15))]
    p = plan(loans, reborrow_mode="LUMP_SUM_STANDARD")
    m03 = next(m for m in p.monthly_schedule if m.month == "2027-03")
    assert m03.is_safe is False
    assert p.peak_debt_before == p.peak_debt_after


def test_seasonal_capacity_respected():
    caps = {"2026-11": Decimal("5") * B, "2026-12": Decimal("20") * B, "2027-01": Decimal("20") * B,
            "2027-02": Decimal("20") * B, "2027-03": Decimal("10") * B, "2027-04": Decimal("10") * B,
            "2027-05": Decimal("10") * B}
    loans = [loan(1, "MBB", "25", date(2027, 3, 15))]
    p = plan(loans, capacity_mode="SEASONAL", seasonal_capacities=caps)
    for m in p.monthly_schedule:
        assert m.monthly_capacity == caps[m.month]
        assert m.allocated_payment_amount <= m.monthly_capacity
