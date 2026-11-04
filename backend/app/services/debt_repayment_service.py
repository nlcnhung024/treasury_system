"""
Debt Repayment Plan Engine (US-07.8) - Capacity-Constrained Rollover Smoothing.

Nguyên tắc duy nhất (Safety Invariant): tại mọi tháng t trong kỳ kế hoạch,
tổng tiền gốc phải chi trả (nợ đến hạn + nợ trả trước hạn) <= trần chi trả C_t.

Toàn bộ số liệu được tính động từ danh mục khoản vay trong CSDL (không hardcode).
"""
import logging
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit import CreditFacility
from app.schemas.credit import (
    RepaymentPlanSimulateRequest,
    DebtRepaymentPlanResponse,
    MonthlyRepaymentComparisonItem,
    LoanAllocationActionItem,
)

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")
HUNDRED = Decimal("100.00")
DAYS_IN_YEAR = Decimal("365")
PLANNING_HORIZON_MONTHS = 7
MIN_TRANCHE_AMOUNT = Decimal("1000000.00")  # Không tách nhánh nhỏ hơn 1 triệu VND
SMOOTHING_MODES = {"SRPR_OPTIMAL", "STAGGERED_SMOOTHING"}


def quantize_money(amount: Decimal) -> Decimal:
    return Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def add_months_to_date(src_date: date, months: int) -> date:
    year = src_date.year + (src_date.month + months - 1) // 12
    month = (src_date.month + months - 1) % 12 + 1
    day = min(src_date.day, 28)
    return date(year, month, day)


def month_index(start: date, d: date) -> int:
    return (d.year - start.year) * 12 + (d.month - start.month)


def month_key(start: date, idx: int) -> str:
    d = add_months_to_date(start, idx)
    return f"{d.year:04d}-{d.month:02d}"


@dataclass
class Tranche:
    """Một nghĩa vụ trả gốc đến hạn tại một tháng (khế ước gốc hoặc khế ước vay lại)."""
    tranche_id: int
    loan_id: int
    bank_code: str
    contract_number: str
    amount: Decimal
    interest_rate: Decimal
    due_idx: int
    due_day: int
    original_due_date: date
    is_reborrow: bool = False


@dataclass
class SimulationResult:
    due_natural: Dict[int, Decimal] = field(default_factory=dict)
    due_reborrow: Dict[int, Decimal] = field(default_factory=dict)
    paid_on_due: Dict[int, Decimal] = field(default_factory=dict)
    prepaid: Dict[int, Decimal] = field(default_factory=dict)
    cut_from: Dict[int, Decimal] = field(default_factory=dict)
    reborrowed: Dict[int, Decimal] = field(default_factory=dict)
    notes: Dict[int, List[str]] = field(default_factory=dict)
    allocations: List[LoanAllocationActionItem] = field(default_factory=list)
    total_reborrowed: Decimal = ZERO
    total_cut_and_reborrowed: Decimal = ZERO
    interest_saved: Decimal = ZERO
    penalty: Decimal = ZERO


class DebtRepaymentService:
    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _max_tenor(bank_code: str, request: RepaymentPlanSimulateRequest) -> int:
        code = (bank_code or "").upper()
        if code == "MBB":
            return max(1, request.mb_tenor_months)
        if code == "CTG":
            return max(1, request.ctg_tenor_months)
        # Ngân hàng khác: dùng kỳ hạn ngắn hơn (bảo thủ) giữa 2 cấu hình
        return max(1, min(request.mb_tenor_months, request.ctg_tenor_months))

    @staticmethod
    def _sort_key(strategy: str):
        if strategy == "AVALANCHE":  # lãi suất cao trước
            return lambda t: (-t.interest_rate, -t.amount)
        if strategy == "SNOWBALL":  # khoản nhỏ trước
            return lambda t: (t.amount, -t.interest_rate)
        # SPLIT_LARGE_LOANS / BALANCED: khoản lớn trước
        return lambda t: (-t.amount, -t.interest_rate)

    # --------------------------------------------------------------- simulation
    @classmethod
    def _run(
        cls,
        loans: List[CreditFacility],
        request: RepaymentPlanSimulateRequest,
        start: date,
        capacities: List[Decimal],
        smoothing: bool,
    ) -> SimulationResult:
        H = len(capacities)
        res = SimulationResult()
        for i in range(H):
            for d in (res.due_natural, res.due_reborrow, res.paid_on_due, res.prepaid,
                      res.cut_from, res.reborrowed):
                d[i] = ZERO
            res.notes[i] = []

        reborrow_pct = max(ZERO, min(HUNDRED, Decimal(request.reborrow_rate))) / HUNDRED
        penalty_pct = max(ZERO, Decimal(request.prepayment_penalty_rate)) / HUNDRED
        sort_key = cls._sort_key(request.strategy)

        buckets: Dict[int, List[Tranche]] = {}
        seq = [0]

        def next_id() -> int:
            seq[0] += 1
            return 900000 + seq[0]

        def scheduled(idx: int) -> Decimal:
            return sum((t.amount for t in buckets.get(idx, [])), ZERO)

        def used(idx: int) -> Decimal:
            # Tổng chi gốc của tháng = nợ còn chờ đến hạn + đã tất toán + đã trả trước
            paid = res.paid_on_due.get(idx, ZERO) + res.prepaid.get(idx, ZERO)
            return scheduled(idx) + paid

        # 1. Nạp nghĩa vụ gốc tự nhiên
        for l in loans:
            bal = Decimal(l.current_principal_balance or 0)
            if bal <= ZERO:
                continue
            due_date = l.next_repayment_date or l.maturity_date or start
            idx = max(0, month_index(start, due_date))  # nợ quá hạn -> tháng đầu
            t = Tranche(
                tranche_id=l.loan_id, loan_id=l.loan_id, bank_code=l.bank_code,
                contract_number=l.contract_number, amount=bal,
                interest_rate=Decimal(l.interest_rate or 0), due_idx=idx,
                due_day=min(due_date.day, 28), original_due_date=due_date,
            )
            buckets.setdefault(idx, []).append(t)
            if idx < H:
                res.due_natural[idx] += bal

        def land_reborrow(src: Tranche, amount: Decimal, from_idx: int, min_land: int,
                          day: int) -> List[tuple]:
            """Phân bổ khoản vay lại vào các tháng đáo hạn mới, ưu tiên kỳ hạn dài,
            không làm tháng đích vượt trần. Trả về [(land_idx, amount)]."""
            max_t = cls._max_tenor(src.bank_code, request)
            remaining = amount
            parts: List[tuple] = []
            tenors = [t for t in range(max_t, 0, -1) if from_idx + t >= min_land]
            if not smoothing:
                tenors = [max_t] if from_idx + max_t >= min_land else []
            for t in tenors:
                if remaining <= ZERO:
                    break
                land = from_idx + t
                if not smoothing or land >= H:
                    take = remaining
                else:
                    room = capacities[land] - used(land)
                    take = min(remaining, max(ZERO, room))
                    if take < remaining and take < MIN_TRANCHE_AMOUNT:
                        continue
                if take > ZERO:
                    parts.append((land, take))
                    remaining -= take
            if remaining > ZERO:
                # Không còn chỗ trống: dồn vào tháng hợp lệ có tải thấp nhất (tỷ lệ so với trần)
                candidates = [from_idx + t for t in range(1, max_t + 1) if from_idx + t >= min_land]
                if smoothing and candidates:
                    def load(l: int) -> Decimal:
                        if l >= H:
                            return Decimal("-1")
                        return (used(l) + remaining) / capacities[l] if capacities[l] > ZERO else Decimal("1e18")
                    land = min(candidates, key=lambda l: (load(l), -l))
                else:
                    land = from_idx + max_t
                parts.append((land, remaining))
            for land, amt in parts:
                nt = Tranche(
                    tranche_id=next_id(), loan_id=src.loan_id, bank_code=src.bank_code,
                    contract_number=f"{src.contract_number}-R{land - from_idx}M",
                    amount=amt, interest_rate=src.interest_rate, due_idx=land,
                    due_day=day, original_due_date=add_months_to_date(start, land).replace(day=day),
                    is_reborrow=True,
                )
                buckets.setdefault(land, []).append(nt)
                if land < H:
                    res.due_reborrow[land] += amt
            return parts

        def record_reborrow(src: Tranche, amount: Decimal, from_idx: int, min_land: int,
                            day: int, action: str, is_cut: bool):
            if amount <= ZERO:
                return
            parts = land_reborrow(src, amount, from_idx, min_land, day)
            res.reborrowed[from_idx] += amount
            res.total_reborrowed += amount
            if is_cut:
                res.total_cut_and_reborrowed += amount
            for land, amt in parts:
                new_mat = add_months_to_date(start, land).replace(day=day)
                res.allocations.append(LoanAllocationActionItem(
                    loan_id=next_id(), bank_code=src.bank_code,
                    contract_number=f"{src.contract_number}-R{land - from_idx}M",
                    original_balance=quantize_money(amt), interest_rate=src.interest_rate,
                    original_due_date=new_mat, action_type=action,
                    payment_month=month_key(start, from_idx), payment_amount=quantize_money(amt),
                    remaining_balance_after=quantize_money(amt), rollover_new_maturity=new_mat,
                    note=f"Vay lại {amt:,.0f} đ kỳ hạn {land - from_idx} tháng, đáo hạn {month_key(start, land)}",
                ))

        # 2. Duyệt tuần tự từng tháng
        for m in range(H):
            cap = capacities[m]
            excess = used(m) - cap

            # 2a. Cắt đỉnh: trả trước hạn ở tháng k < m còn dư trần, vay lại đẩy qua sau m
            if smoothing and excess > ZERO:
                donors = sorted(range(m), key=lambda k: capacities[k] - used(k), reverse=True)
                for k in donors:
                    if excess <= ZERO:
                        break
                    spare = capacities[k] - used(k)
                    if spare <= ZERO:
                        continue
                    for t in sorted(buckets.get(m, []), key=sort_key):
                        if excess <= ZERO or spare <= ZERO:
                            break
                        # Vay lại phải đáo hạn sau tháng m và trong kỳ hạn tối đa của ngân hàng
                        if reborrow_pct > ZERO and k + cls._max_tenor(t.bank_code, request) <= m:
                            continue
                        # Phần vay lại (r*x) rời khỏi tháng m; phần tự trả (1-r)*x cũng rời m.
                        cut = min(t.amount, excess, spare)
                        if cut < MIN_TRANCHE_AMOUNT and cut < t.amount:
                            continue
                        pay_day = min(t.due_day, 28)
                        pay_date = add_months_to_date(start, k).replace(day=pay_day)
                        due_date = add_months_to_date(start, m).replace(day=t.due_day)
                        days_early = max(0, (due_date - pay_date).days)
                        reb = quantize_money(cut * reborrow_pct)
                        own = cut - reb
                        saved = quantize_money(own * t.interest_rate / HUNDRED / DAYS_IN_YEAR * days_early)
                        fee = quantize_money(cut * penalty_pct)
                        t.amount -= cut
                        res.prepaid[k] += cut
                        res.cut_from[m] += cut
                        res.interest_saved += saved
                        res.penalty += fee
                        excess -= cut
                        spare -= cut
                        res.allocations.append(LoanAllocationActionItem(
                            loan_id=t.loan_id, bank_code=t.bank_code,
                            contract_number=t.contract_number,
                            original_balance=quantize_money(t.amount + cut),
                            interest_rate=t.interest_rate, original_due_date=t.original_due_date,
                            action_type="INTRADAY_PREPAY_REROUTE" if reb > ZERO else
                            ("FULL_PREPAYMENT" if t.amount <= ZERO else "PARTIAL_PREPAYMENT"),
                            payment_month=month_key(start, k), payment_amount=quantize_money(cut),
                            remaining_balance_after=quantize_money(t.amount), days_early=days_early,
                            estimated_interest_saved=saved, prepayment_penalty_fee=fee,
                            note=f"Trả trước hạn {cut:,.0f} đ tại {month_key(start, k)} để hạ nợ đến hạn tháng {month_key(start, m)} về trần",
                        ))
                        record_reborrow(t, reb, k, m + 1, pay_day,
                                        "NEW_REBORROW_DRAWDOWN", is_cut=True)
                    buckets[m] = [t for t in buckets.get(m, []) if t.amount > ZERO]
                if excess > ZERO:
                    res.notes[m].append(f"Không đủ dư địa các tháng trước để cắt {excess:,.0f} đ")

            # 2b. Tất toán nợ đến hạn tháng m và vay lại
            for t in sorted(buckets.get(m, []), key=sort_key):
                amt = t.amount
                res.paid_on_due[m] += amt
                res.allocations.append(LoanAllocationActionItem(
                    loan_id=t.loan_id, bank_code=t.bank_code, contract_number=t.contract_number,
                    original_balance=quantize_money(amt), interest_rate=t.interest_rate,
                    original_due_date=t.original_due_date, action_type="PAY_ON_DUE",
                    payment_month=month_key(start, m), payment_amount=quantize_money(amt),
                    remaining_balance_after=ZERO,
                    note=f"Tất toán đúng hạn {amt:,.0f} đ",
                ))
                reb = quantize_money(amt * reborrow_pct)
                record_reborrow(t, reb, m, m + 1, t.due_day,
                                "MATURITY_ROLLOVER" if smoothing else "ROLLOVER_REFINANCE",
                                is_cut=False)
                t.amount = ZERO
            buckets[m] = []
        return res

    # --------------------------------------------------------------- public API
    @classmethod
    async def simulate_plan(
        cls,
        db: AsyncSession,
        request: RepaymentPlanSimulateRequest,
        today: Optional[date] = None,
    ) -> DebtRepaymentPlanResponse:
        stmt = (
            select(CreditFacility)
            .where(CreditFacility.is_active == True, CreditFacility.status == "ACTIVE")  # noqa: E712
            .order_by(CreditFacility.next_repayment_date.asc().nullslast())
        )
        loans = list((await db.execute(stmt)).scalars().all())
        return cls.build_plan(loans, request, today=today)

    @classmethod
    def build_plan(
        cls,
        loans: List[CreditFacility],
        request: RepaymentPlanSimulateRequest,
        today: Optional[date] = None,
    ) -> DebtRepaymentPlanResponse:
        if not loans:
            return DebtRepaymentPlanResponse(
                capacity_mode=request.capacity_mode,
                uniform_monthly_capacity=quantize_money(request.uniform_monthly_capacity),
                strategy=request.strategy, reborrow_rate=request.reborrow_rate,
                reborrow_mode=request.reborrow_mode,
                reborrow_summary_note="Chưa có khoản vay đang hoạt động.",
            )

        start = (today or date.today()).replace(day=1)
        H = PLANNING_HORIZON_MONTHS
        capacities: List[Decimal] = []
        for i in range(H):
            key = month_key(start, i)
            if (request.capacity_mode == "SEASONAL" and request.seasonal_capacities
                    and key in request.seasonal_capacities):
                capacities.append(max(ZERO, Decimal(str(request.seasonal_capacities[key]))))
            else:
                capacities.append(max(ZERO, Decimal(request.uniform_monthly_capacity)))

        total_debt = sum((Decimal(l.current_principal_balance or 0) for l in loans), ZERO)
        smoothing = request.reborrow_mode in SMOOTHING_MODES

        baseline = cls._run(loans, request, start, capacities, smoothing=False)
        result = cls._run(loans, request, start, capacities, smoothing=True) if smoothing else baseline

        def peak(r: SimulationResult) -> Decimal:
            return max((r.paid_on_due[i] + r.prepaid[i] for i in range(H)), default=ZERO)

        peak_before, peak_after = peak(baseline), peak(result)

        schedule: List[MonthlyRepaymentComparisonItem] = []
        balance = total_debt
        over_months: List[str] = []
        for i in range(H):
            cap = capacities[i]
            paid = result.paid_on_due[i] + result.prepaid[i]
            balance = balance - paid + result.reborrowed[i]
            is_safe = paid <= cap
            if not is_safe:
                over_months.append(month_key(start, i))
            dest = []
            if result.prepaid[i] > ZERO:
                dest.append(f"Trả trước {result.prepaid[i]:,.0f} đ")
            if result.cut_from[i] > ZERO:
                dest.append(f"Đã cắt {result.cut_from[i]:,.0f} đ về các tháng trước")
            if result.reborrowed[i] > ZERO:
                dest.append(f"Vay lại {result.reborrowed[i]:,.0f} đ")
            dest.extend(result.notes[i])
            schedule.append(MonthlyRepaymentComparisonItem(
                month=month_key(start, i),
                natural_due_amount=quantize_money(result.due_natural[i]),
                reborrowed_new_due_amount=quantize_money(result.due_reborrow[i]),
                bridged_due_amount=quantize_money(result.due_reborrow[i]),
                # Dương: tháng thực hiện trả trước; âm: tháng được cắt đỉnh
                intraday_reroute_cut_amount=quantize_money(result.prepaid[i] - result.cut_from[i]),
                allocated_payment_amount=quantize_money(paid),
                prepaid_principal_amount=quantize_money(result.prepaid[i]),
                regular_principal_amount=quantize_money(result.paid_on_due[i]),
                closing_total_debt=quantize_money(balance),
                reroute_destination_note=" | ".join(dest),
                monthly_capacity=quantize_money(cap),
                remaining_capacity=quantize_money(max(ZERO, cap - paid)),
                is_safe=is_safe,
                status_label="SAFE" if is_safe else "OVER_CAPACITY",
            ))

        reduction = ZERO
        if peak_before > ZERO:
            reduction = quantize_money((peak_before - peak_after) / peak_before * HUNDRED)

        if over_months:
            note = (f"Cảnh báo: không thể đưa nợ đến hạn về dưới trần tại {', '.join(over_months)}. "
                    f"Cần tăng trần chi trả, kỳ hạn vay lại hoặc giảm tỷ lệ vay lại.")
        elif smoothing:
            note = (f"Tất cả {H} tháng đều nằm dưới trần chi trả. Đỉnh nợ đến hạn giảm từ "
                    f"{peak_before:,.0f} đ xuống {peak_after:,.0f} đ.")
        else:
            note = f"Tái vay nguyên khối kỳ hạn tối đa: đỉnh nợ đến hạn {peak_after:,.0f} đ."

        return DebtRepaymentPlanResponse(
            total_principal_debt=quantize_money(total_debt),
            total_loans_count=len(loans),
            capacity_mode=request.capacity_mode,
            uniform_monthly_capacity=quantize_money(request.uniform_monthly_capacity),
            prepayment_penalty_rate=request.prepayment_penalty_rate,
            strategy=request.strategy,
            reborrow_rate=request.reborrow_rate,
            reborrow_mode=request.reborrow_mode,
            total_reborrowed_amount=quantize_money(result.total_reborrowed),
            total_cut_and_reborrowed_amount=quantize_money(result.total_cut_and_reborrowed),
            reborrow_summary_note=note,
            peak_debt_before=quantize_money(peak_before),
            peak_debt_after=quantize_money(peak_after),
            peak_reduction_percent=reduction,
            total_interest_saved=quantize_money(result.interest_saved),
            total_penalty_incurred=quantize_money(result.penalty),
            net_financial_benefit=quantize_money(result.interest_saved - result.penalty),
            monthly_schedule=schedule,
            allocations=result.allocations,
        )
