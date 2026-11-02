import logging
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.credit import CreditFacility
from app.schemas.credit import (
    RepaymentPlanSimulateRequest,
    DebtRepaymentPlanResponse,
    MonthlyRepaymentComparisonItem,
    LoanAllocationActionItem,
)

logger = logging.getLogger(__name__)


def quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def add_months_to_date(src_date: date, months: int) -> date:
    year = src_date.year + (src_date.month + months - 1) // 12
    month = (src_date.month + months - 1) % 12 + 1
    # Handle end of month day clipping
    day = min(src_date.day, 28)
    return date(year, month, day)


class DebtRepaymentService:
    @staticmethod
    async def simulate_plan(
        db: AsyncSession,
        request: RepaymentPlanSimulateRequest,
    ) -> DebtRepaymentPlanResponse:
        stmt = (
            select(CreditFacility)
            .where(CreditFacility.is_active == True, CreditFacility.status == "ACTIVE")
            .order_by(CreditFacility.next_repayment_date.asc().nullslast())
        )
        loans = (await db.execute(stmt)).scalars().all()

        if not loans:
            return DebtRepaymentPlanResponse()

        total_debt = sum(l.current_principal_balance for l in loans)
        total_loans_count = len(loans)

        # Build list of planning months: from 2026-11 to 2027-05 (7 months)
        start_year = 2026
        start_month = 11
        planning_months: List[str] = []
        for i in range(7):
            y = start_year + (start_month + i - 1) // 12
            m = (start_month + i - 1) % 12 + 1
            planning_months.append(f"{y:04d}-{m:02d}")

        # Resolve capacity per month
        monthly_capacities: Dict[str, Decimal] = {}
        for m_str in planning_months:
            if request.capacity_mode == "SEASONAL" and request.seasonal_capacities and m_str in request.seasonal_capacities:
                monthly_capacities[m_str] = Decimal(str(request.seasonal_capacities[m_str]))
            else:
                monthly_capacities[m_str] = request.uniform_monthly_capacity

        # Natural due debt from existing 37 contracts in database
        base_natural_due_per_month: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}
        for l in loans:
            due_str = str(l.next_repayment_date)[:7] if l.next_repayment_date else planning_months[0]
            if due_str in base_natural_due_per_month:
                base_natural_due_per_month[due_str] += l.current_principal_balance
            else:
                base_natural_due_per_month[planning_months[-1]] += l.current_principal_balance

        # Active loan items tracked in memory
        active_loan_items: List[Dict[str, Any]] = []
        for l in loans:
            active_loan_items.append({
                "loan_id": l.loan_id,
                "bank_code": l.bank_code,
                "contract_number": l.contract_number,
                "original_balance": l.current_principal_balance,
                "remaining_balance": l.current_principal_balance,
                "interest_rate": l.interest_rate,
                "original_due_date": l.next_repayment_date or date(2026, 11, 30),
                "due_month": str(l.next_repayment_date)[:7] if l.next_repayment_date else "2026-11",
                "is_rolled_over": False,
                "is_reborrowed": False,
                "new_maturity_date": None,
            })

        allocations: List[LoanAllocationActionItem] = []
        allocated_payment_per_month: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}
        prepaid_amount_per_month: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}
        regular_amount_per_month: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}
        reborrowed_due_per_month: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}

        reborrow_pct = request.reborrow_rate / Decimal("100.00")
        total_reborrowed_sum = Decimal("0.00")

        # =========================================================================
        # STEP 1: Process Immediate Month "2026-11"
        # Total due in Nov: ~34.44B. Month capacity is C_11 (e.g. 14B).
        # =========================================================================
        c_11 = monthly_capacities["2026-11"]
        nov_loans = [item for item in active_loan_items if item["due_month"] == "2026-11"]

        # Sort nov_loans based on strategy
        if request.strategy == "AVALANCHE":
            nov_loans.sort(key=lambda x: (x["interest_rate"], x["remaining_balance"]), reverse=True)
        elif request.strategy == "SNOWBALL":
            nov_loans.sort(key=lambda x: x["remaining_balance"])
        else:
            nov_loans.sort(key=lambda x: x["remaining_balance"], reverse=True)

        budget_nov_left = c_11
        for item in nov_loans:
            if budget_nov_left <= Decimal("0.00"):
                # Rollover without paydown in Nov
                tenor = request.ctg_tenor_months if item["bank_code"] == "CTG" else request.mb_tenor_months
                new_date = add_months_to_date(item["original_due_date"], tenor)
                target_m = f"{new_date.year:04d}-{new_date.month:02d}"

                item["is_rolled_over"] = True
                item["new_maturity_date"] = new_date
                item["due_month"] = target_m

                allocations.append(LoanAllocationActionItem(
                    loan_id=item["loan_id"],
                    bank_code=item["bank_code"],
                    contract_number=item["contract_number"],
                    original_balance=item["original_balance"],
                    interest_rate=item["interest_rate"],
                    original_due_date=item["original_due_date"],
                    action_type="ROLLOVER_REFINANCE",
                    payment_month="2026-11",
                    payment_amount=Decimal("0.00"),
                    remaining_balance_after=item["remaining_balance"],
                    days_early=0,
                    estimated_interest_saved=Decimal("0.00"),
                    prepayment_penalty_fee=Decimal("0.00"),
                    rollover_new_maturity=new_date,
                    note=f"Đảo nợ tối đa {tenor} tháng tại {item['bank_code']} (Hạn mức mới: {new_date.strftime('%d/%m/%Y')})",
                ))
            else:
                pay_amt = min(budget_nov_left, item["remaining_balance"])
                if pay_amt == item["remaining_balance"]:
                    # Pay full
                    item["remaining_balance"] = Decimal("0.00")
                    budget_nov_left -= pay_amt
                    allocated_payment_per_month["2026-11"] += pay_amt
                    regular_amount_per_month["2026-11"] += pay_amt

                    allocations.append(LoanAllocationActionItem(
                        loan_id=item["loan_id"],
                        bank_code=item["bank_code"],
                        contract_number=item["contract_number"],
                        original_balance=item["original_balance"],
                        interest_rate=item["interest_rate"],
                        original_due_date=item["original_due_date"],
                        action_type="PAY_ON_DUE",
                        payment_month="2026-11",
                        payment_amount=pay_amt,
                        remaining_balance_after=Decimal("0.00"),
                        days_early=0,
                        estimated_interest_saved=Decimal("0.00"),
                        prepayment_penalty_fee=Decimal("0.00"),
                        note="Thanh toán đúng hạn trong khả năng chi trả tháng 11",
                    ))

                    # =========================================================================
                    # RE-BORROWING SIMULATION:
                    # After paying in Nov, borrow back with rate R%
                    # =========================================================================
                    reborrow_amt = quantize_money(pay_amt * reborrow_pct)
                    if reborrow_amt > Decimal("0.00"):
                        total_reborrowed_sum += reborrow_amt
                        tenor = request.ctg_tenor_months if item["bank_code"] == "CTG" else request.mb_tenor_months

                        if request.reborrow_mode == "LUMP_SUM_STANDARD":
                            # Standard mode: all CTG re-borrowings mature in 2027-03 (4 months), MB in 2027-05 (6 months)
                            reborrow_due_date = add_months_to_date(date(2026, 11, 15), tenor)
                            reborrow_due_m = f"{reborrow_due_date.year:04d}-{reborrow_due_date.month:02d}"
                        else:
                            # STAGGERED_SMOOTHING mode:
                            # Stagger new re-borrowed loans into empty months (2026-12, 2027-01, 2027-02, 2027-04, 2027-05)
                            # to avoid colliding with MB peak debt in 2027-03!
                            if item["bank_code"] == "CTG":
                                # Distribute evenly into T01, T02, T04
                                candidate_stagger_months = ["2027-01", "2027-02", "2027-04"]
                                chosen_idx = len(active_loan_items) % len(candidate_stagger_months)
                                reborrow_due_m = candidate_stagger_months[chosen_idx]
                                reborrow_due_date = date(int(reborrow_due_m[:4]), int(reborrow_due_m[5:]), 15)
                            else:
                                reborrow_due_m = "2027-05"
                                reborrow_due_date = date(2027, 5, 15)

                        reborrowed_due_per_month[reborrow_due_m] = reborrowed_due_per_month.get(reborrow_due_m, Decimal("0.00")) + reborrow_amt

                        # Append re-borrowed loan into active tracking list for future settlement
                        active_loan_items.append({
                            "loan_id": 9000 + len(active_loan_items),
                            "bank_code": item["bank_code"],
                            "contract_number": f"{item['contract_number']}-RENEW",
                            "original_balance": reborrow_amt,
                            "remaining_balance": reborrow_amt,
                            "interest_rate": item["interest_rate"],
                            "original_due_date": reborrow_due_date,
                            "due_month": reborrow_due_m,
                            "is_rolled_over": False,
                            "is_reborrowed": True,
                            "new_maturity_date": None,
                        })

                        allocations.append(LoanAllocationActionItem(
                            loan_id=9000 + len(active_loan_items),
                            bank_code=item["bank_code"],
                            contract_number=f"{item['contract_number']}-RENEW",
                            original_balance=reborrow_amt,
                            interest_rate=item["interest_rate"],
                            original_due_date=reborrow_due_date,
                            action_type="NEW_REBORROW_DRAWDOWN",
                            payment_month="2026-11",
                            payment_amount=reborrow_amt,
                            remaining_balance_after=reborrow_amt,
                            days_early=0,
                            estimated_interest_saved=Decimal("0.00"),
                            prepayment_penalty_fee=Decimal("0.00"),
                            rollover_new_maturity=reborrow_due_date,
                            note=(
                                f"Tái giải ngân vay lại ({reborrow_amt:,.0f} đ, {request.reborrow_rate}%) theo hạn mức tuần hoàn. "
                                f"Kỳ hạn mới đến {reborrow_due_date.strftime('%d/%m/%Y')} (Tháng {reborrow_due_m})."
                            ),
                        ))
                else:
                    # Partial payment in Nov, rollover remainder
                    rem = item["remaining_balance"] - pay_amt
                    item["remaining_balance"] = rem
                    budget_nov_left = Decimal("0.00")
                    allocated_payment_per_month["2026-11"] += pay_amt
                    regular_amount_per_month["2026-11"] += pay_amt

                    tenor = request.ctg_tenor_months if item["bank_code"] == "CTG" else request.mb_tenor_months
                    new_date = add_months_to_date(item["original_due_date"], tenor)
                    item["is_rolled_over"] = True
                    item["new_maturity_date"] = new_date
                    item["due_month"] = f"{new_date.year:04d}-{new_date.month:02d}"

                    allocations.append(LoanAllocationActionItem(
                        loan_id=item["loan_id"],
                        bank_code=item["bank_code"],
                        contract_number=item["contract_number"],
                        original_balance=item["original_balance"],
                        interest_rate=item["interest_rate"],
                        original_due_date=item["original_due_date"],
                        action_type="PARTIAL_PREPAYMENT",
                        payment_month="2026-11",
                        payment_amount=pay_amt,
                        remaining_balance_after=rem,
                        days_early=0,
                        estimated_interest_saved=Decimal("0.00"),
                        prepayment_penalty_fee=Decimal("0.00"),
                        note="Thanh toán một phần trong hạn mức T11",
                    ))
                    allocations.append(LoanAllocationActionItem(
                        loan_id=item["loan_id"],
                        bank_code=item["bank_code"],
                        contract_number=item["contract_number"],
                        original_balance=item["original_balance"],
                        interest_rate=item["interest_rate"],
                        original_due_date=item["original_due_date"],
                        action_type="ROLLOVER_REFINANCE",
                        payment_month="2026-11",
                        payment_amount=Decimal("0.00"),
                        remaining_balance_after=rem,
                        days_early=0,
                        estimated_interest_saved=Decimal("0.00"),
                        prepayment_penalty_fee=Decimal("0.00"),
                        rollover_new_maturity=new_date,
                        note=f"Đảo nợ phần gốc còn lại ({rem:,.0f} đ) tối đa {tenor} tháng sang {new_date.strftime('%d/%m/%Y')}",
                    ))

                    # Also re-borrow the paid portion
                    reborrow_amt = quantize_money(pay_amt * reborrow_pct)
                    if reborrow_amt > Decimal("0.00"):
                        total_reborrowed_sum += reborrow_amt
                        if request.reborrow_mode == "LUMP_SUM_STANDARD":
                            reborrow_due_date = add_months_to_date(date(2026, 11, 15), tenor)
                            reborrow_due_m = f"{reborrow_due_date.year:04d}-{reborrow_due_date.month:02d}"
                        else:
                            reborrow_due_m = "2027-01"
                            reborrow_due_date = date(2027, 1, 15)

                        reborrowed_due_per_month[reborrow_due_m] = reborrowed_due_per_month.get(reborrow_due_m, Decimal("0.00")) + reborrow_amt
                        active_loan_items.append({
                            "loan_id": 9000 + len(active_loan_items),
                            "bank_code": item["bank_code"],
                            "contract_number": f"{item['contract_number']}-RENEW",
                            "original_balance": reborrow_amt,
                            "remaining_balance": reborrow_amt,
                            "interest_rate": item["interest_rate"],
                            "original_due_date": reborrow_due_date,
                            "due_month": reborrow_due_m,
                            "is_rolled_over": False,
                            "is_reborrowed": True,
                            "new_maturity_date": None,
                        })

        # Calculate natural due amounts per month including re-borrowed new loans
        total_natural_due_per_month: Dict[str, Decimal] = {}
        for m in planning_months:
            total_natural_due_per_month[m] = base_natural_due_per_month[m] + reborrowed_due_per_month.get(m, Decimal("0.00"))

        peak_debt_before = max(total_natural_due_per_month.values()) if total_natural_due_per_month else Decimal("0.00")

        # =========================================================================
        # STEP 2: Process Months 2026-12 .. 2027-05
        # =========================================================================
        for cur_idx, cur_m in enumerate(planning_months[1:], start=1):
            cap = monthly_capacities[cur_m]

            # 2a. Pay loans that are due in cur_m first, up to cap
            due_here = [it for it in active_loan_items if it["due_month"] == cur_m and it["remaining_balance"] > Decimal("0.00")]

            if request.strategy == "SPLIT_LARGE_LOANS":
                due_here.sort(key=lambda x: (x["remaining_balance"], x["interest_rate"]), reverse=True)
            elif request.strategy == "AVALANCHE":
                due_here.sort(key=lambda x: (x["interest_rate"], x["remaining_balance"]), reverse=True)
            elif request.strategy == "SNOWBALL":
                due_here.sort(key=lambda x: x["remaining_balance"])
            else:
                due_here.sort(key=lambda x: x["remaining_balance"], reverse=True)

            for it in due_here:
                curr_rem = it["remaining_balance"]
                curr_alloc = allocated_payment_per_month[cur_m]
                space = max(Decimal("0.00"), cap - curr_alloc)

                if space <= Decimal("0.00"):
                    # Month capacity is reached! Must rollover remainder
                    tenor = request.ctg_tenor_months if it["bank_code"] == "CTG" else request.mb_tenor_months
                    new_date = add_months_to_date(it["new_maturity_date"] or it["original_due_date"], tenor)
                    target_m_str = f"{new_date.year:04d}-{new_date.month:02d}"
                    it["is_rolled_over"] = True
                    it["new_maturity_date"] = new_date
                    it["due_month"] = target_m_str

                    allocations.append(LoanAllocationActionItem(
                        loan_id=it["loan_id"],
                        bank_code=it["bank_code"],
                        contract_number=it["contract_number"],
                        original_balance=it["original_balance"],
                        interest_rate=it["interest_rate"],
                        original_due_date=it["original_due_date"],
                        action_type="ROLLOVER_REFINANCE",
                        payment_month=cur_m,
                        payment_amount=Decimal("0.00"),
                        remaining_balance_after=curr_rem,
                        days_early=0,
                        estimated_interest_saved=Decimal("0.00"),
                        prepayment_penalty_fee=Decimal("0.00"),
                        rollover_new_maturity=new_date,
                        note=f"Đảo nợ tối đa {tenor} tháng sang {new_date.strftime('%d/%m/%Y')} do vượt trần chi trả tháng {cur_m}",
                    ))
                else:
                    pay_amt = min(space, curr_rem)
                    it["remaining_balance"] -= pay_amt
                    allocated_payment_per_month[cur_m] += pay_amt
                    regular_amount_per_month[cur_m] += pay_amt

                    if it["remaining_balance"] == Decimal("0.00"):
                        allocations.append(LoanAllocationActionItem(
                            loan_id=it["loan_id"],
                            bank_code=it["bank_code"],
                            contract_number=it["contract_number"],
                            original_balance=it["original_balance"],
                            interest_rate=it["interest_rate"],
                            original_due_date=it["new_maturity_date"] or it["original_due_date"],
                            action_type="PAY_ON_DUE",
                            payment_month=cur_m,
                            payment_amount=pay_amt,
                            remaining_balance_after=Decimal("0.00"),
                            days_early=0,
                            estimated_interest_saved=Decimal("0.00"),
                            prepayment_penalty_fee=Decimal("0.00"),
                            note=f"Thanh toán đúng hạn trong khả năng chi trả tháng {cur_m}",
                        ))
                    else:
                        rem = it["remaining_balance"]
                        tenor = request.ctg_tenor_months if it["bank_code"] == "CTG" else request.mb_tenor_months
                        new_date = add_months_to_date(it["new_maturity_date"] or it["original_due_date"], tenor)
                        target_m_str = f"{new_date.year:04d}-{new_date.month:02d}"
                        it["is_rolled_over"] = True
                        it["new_maturity_date"] = new_date
                        it["due_month"] = target_m_str

                        allocations.append(LoanAllocationActionItem(
                            loan_id=it["loan_id"],
                            bank_code=it["bank_code"],
                            contract_number=it["contract_number"],
                            original_balance=it["original_balance"],
                            interest_rate=it["interest_rate"],
                            original_due_date=it["original_due_date"],
                            action_type="PARTIAL_PREPAYMENT",
                            payment_month=cur_m,
                            payment_amount=pay_amt,
                            remaining_balance_after=rem,
                            days_early=0,
                            estimated_interest_saved=Decimal("0.00"),
                            prepayment_penalty_fee=Decimal("0.00"),
                            note=f"Thanh toán một phần ({pay_amt:,.0f} đ) trong hạn mức tháng {cur_m}",
                        ))
                        allocations.append(LoanAllocationActionItem(
                            loan_id=it["loan_id"],
                            bank_code=it["bank_code"],
                            contract_number=it["contract_number"],
                            original_balance=it["original_balance"],
                            interest_rate=it["interest_rate"],
                            original_due_date=it["original_due_date"],
                            action_type="ROLLOVER_REFINANCE",
                            payment_month=cur_m,
                            payment_amount=Decimal("0.00"),
                            remaining_balance_after=rem,
                            days_early=0,
                            estimated_interest_saved=Decimal("0.00"),
                            prepayment_penalty_fee=Decimal("0.00"),
                            rollover_new_maturity=new_date,
                            note=f"Đảo nợ phần gốc còn lại ({rem:,.0f} đ) tối đa {tenor} tháng sang {new_date.strftime('%d/%m/%Y')}",
                        ))

            # 2b. Prepay future debts using remaining cash space
            space_left = max(Decimal("0.00"), cap - allocated_payment_per_month[cur_m])
            if space_left > Decimal("0.00"):
                future_candidates = [
                    it for it in active_loan_items
                    if (it["due_month"] not in planning_months or planning_months.index(it["due_month"]) > cur_idx)
                    and it["remaining_balance"] > Decimal("0.00")
                ]

                if request.strategy == "SPLIT_LARGE_LOANS":
                    future_candidates.sort(key=lambda x: (x["remaining_balance"], x["interest_rate"]), reverse=True)
                elif request.strategy == "AVALANCHE":
                    future_candidates.sort(key=lambda x: (x["interest_rate"], x["remaining_balance"]), reverse=True)
                elif request.strategy == "SNOWBALL":
                    future_candidates.sort(key=lambda x: x["remaining_balance"])
                else:
                    future_candidates.sort(key=lambda x: x["remaining_balance"], reverse=True)

                for cand in future_candidates:
                    if space_left <= Decimal("0.00"):
                        break

                    cand_rem = cand["remaining_balance"]
                    prepay_amt = min(space_left, cand_rem)
                    if prepay_amt <= Decimal("0.00"):
                        continue

                    cand["remaining_balance"] -= prepay_amt
                    space_left -= prepay_amt
                    allocated_payment_per_month[cur_m] += prepay_amt
                    prepaid_amount_per_month[cur_m] += prepay_amt

                    target_due_date = cand["new_maturity_date"] or cand["original_due_date"]
                    cur_y, cur_m_int = int(cur_m[:4]), int(cur_m[5:])
                    payment_date = date(cur_y, cur_m_int, 15)
                    days_early = max(0, (target_due_date - payment_date).days)

                    annual_rate = Decimal(str(cand["interest_rate"])) / Decimal("100.00")
                    interest_saved = prepay_amt * (annual_rate / Decimal("365.00")) * Decimal(str(days_early))
                    interest_saved = quantize_money(interest_saved)

                    penalty_rate = request.prepayment_penalty_rate / Decimal("100.00")
                    penalty_fee = quantize_money(prepay_amt * penalty_rate)

                    action_type = "FULL_PREPAYMENT" if cand["remaining_balance"] == Decimal("0.00") else "PARTIAL_PREPAYMENT"
                    allocations.append(LoanAllocationActionItem(
                        loan_id=cand["loan_id"],
                        bank_code=cand["bank_code"],
                        contract_number=cand["contract_number"],
                        original_balance=cand["original_balance"],
                        interest_rate=cand["interest_rate"],
                        original_due_date=target_due_date,
                        action_type=action_type,
                        payment_month=cur_m,
                        payment_amount=prepay_amt,
                        remaining_balance_after=cand["remaining_balance"],
                        days_early=days_early,
                        estimated_interest_saved=interest_saved,
                        prepayment_penalty_fee=penalty_fee,
                        note=(
                            f"Trả nợ trước hạn một phần để chia nhỏ khoản nợ lớn ({cand['original_balance']:,.0f} đ). "
                            f"Rút ngắn {days_early} ngày, tiết kiệm {interest_saved:,.0f} đ tiền lãi."
                        ) if action_type == "PARTIAL_PREPAYMENT" else (
                            f"Tất toán toàn bộ trước hạn {days_early} ngày. Tiết kiệm {interest_saved:,.0f} đ tiền lãi."
                        ),
                    ))

        # Construct monthly schedule response
        monthly_schedule: List[MonthlyRepaymentComparisonItem] = []
        peak_debt_after = max(allocated_payment_per_month.values()) if allocated_payment_per_month else Decimal("0.00")

        total_interest_saved = Decimal("0.00")
        total_penalty_incurred = Decimal("0.00")

        for m_str in planning_months:
            nat = total_natural_due_per_month.get(m_str, Decimal("0.00"))
            reborrow_due = reborrowed_due_per_month.get(m_str, Decimal("0.00"))
            alloc_amt = allocated_payment_per_month.get(m_str, Decimal("0.00"))
            pre_amt = prepaid_amount_per_month.get(m_str, Decimal("0.00"))
            reg_amt = regular_amount_per_month.get(m_str, Decimal("0.00"))
            cap = monthly_capacities[m_str]
            rem_cap = max(Decimal("0.00"), cap - alloc_amt)
            is_safe = alloc_amt <= cap

            status_label = "SAFE"
            if alloc_amt > cap:
                status_label = "OVER_CAPACITY"
            elif m_str == "2026-11" and nat > cap:
                status_label = "REFINANCED"

            monthly_schedule.append(MonthlyRepaymentComparisonItem(
                month=m_str,
                natural_due_amount=quantize_money(nat),
                reborrowed_new_due_amount=quantize_money(reborrow_due),
                allocated_payment_amount=quantize_money(alloc_amt),
                prepaid_principal_amount=quantize_money(pre_amt),
                regular_principal_amount=quantize_money(reg_amt),
                monthly_capacity=quantize_money(cap),
                remaining_capacity=quantize_money(rem_cap),
                is_safe=is_safe,
                status_label=status_label,
            ))

        for alc in allocations:
            total_interest_saved += alc.estimated_interest_saved
            total_penalty_incurred += alc.prepayment_penalty_fee

        peak_reduction_pct = Decimal("0.00")
        if peak_debt_before > Decimal("0.00"):
            peak_reduction_pct = quantize_money(
                ((peak_debt_before - peak_debt_after) / peak_debt_before) * Decimal("100.00")
            )

        net_financial_benefit = quantize_money(total_interest_saved - total_penalty_incurred)

        reborrow_note = (
            f"Kịch bản Vay Lại Tuần Hoàn {request.reborrow_rate}%: "
            + (
                "Vay lại nguyên khối chuẩn 4 tháng (CTG dồn vào T03/2027) gây áp lực đỉnh nợ kép."
                if request.reborrow_mode == "LUMP_SUM_STANDARD"
                else "Vay lại phân kỳ lệch pha (Staggered Smoothing) rải đều vào các tháng trống, né hoàn toàn đỉnh nợ T03."
            )
        )

        return DebtRepaymentPlanResponse(
            total_principal_debt=quantize_money(total_debt),
            total_loans_count=total_loans_count,
            capacity_mode=request.capacity_mode,
            uniform_monthly_capacity=quantize_money(request.uniform_monthly_capacity),
            prepayment_penalty_rate=request.prepayment_penalty_rate,
            strategy=request.strategy,
            reborrow_rate=request.reborrow_rate,
            reborrow_mode=request.reborrow_mode,
            total_reborrowed_amount=quantize_money(total_reborrowed_sum),
            reborrow_summary_note=reborrow_note,
            peak_debt_before=quantize_money(peak_debt_before),
            peak_debt_after=quantize_money(peak_debt_after),
            peak_reduction_percent=peak_reduction_pct,
            total_interest_saved=quantize_money(total_interest_saved),
            total_penalty_incurred=quantize_money(total_penalty_incurred),
            net_financial_benefit=net_financial_benefit,
            monthly_schedule=monthly_schedule,
            allocations=allocations,
        )
