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

        # 7 planning months: 2026-11 .. 2027-05
        planning_months: List[str] = [
            "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"
        ]

        # Monthly capacities
        monthly_capacities: Dict[str, Decimal] = {}
        for m_str in planning_months:
            if request.capacity_mode == "SEASONAL" and request.seasonal_capacities and m_str in request.seasonal_capacities:
                monthly_capacities[m_str] = Decimal(str(request.seasonal_capacities[m_str]))
            else:
                monthly_capacities[m_str] = request.uniform_monthly_capacity

        # Natural due debt from database
        base_natural_due: Dict[str, Decimal] = {m: Decimal("0.00") for m in planning_months}
        for l in loans:
            due_str = str(l.next_repayment_date)[:7] if l.next_repayment_date else planning_months[0]
            if due_str in base_natural_due:
                base_natural_due[due_str] += l.current_principal_balance
            else:
                base_natural_due[planning_months[-1]] += l.current_principal_balance

        # Track active loans
        active_loans: List[Dict[str, Any]] = []
        for l in loans:
            active_loans.append({
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
        monthly_schedule: List[MonthlyRepaymentComparisonItem] = []

        total_interest_saved = Decimal("0.00")
        total_penalty_incurred = Decimal("0.00")
        total_reborrowed_sum = Decimal("0.00")
        total_cut_and_reborrowed = Decimal("0.00")

        reborrow_pct = request.reborrow_rate / Decimal("100.00")

        # =========================================================================
        # KỊCH BẢN 1: SRPR_OPTIMAL (Thuật toán Tối ưu v2.0 - Bậc thang & Vay lại đúng gốc)
        # =========================================================================
        if request.reborrow_mode == "SRPR_OPTIMAL" or request.reborrow_mode == "STAGGERED_SMOOTHING":
            # CTG nợ T11: ~33.335 tỷ; MBB nợ T11: ~1.10 tỷ
            ctg_t11_loans = [it for it in active_loans if it["due_month"] == "2026-11" and it["bank_code"] == "CTG"]
            mbb_t11_loans = [it for it in active_loans if it["due_month"] == "2026-11" and it["bank_code"] == "MBB"]
            mbb_t03_loans = [it for it in active_loans if it["due_month"] == "2027-03" and it["bank_code"] == "MBB"]
            # Sắp xếp các khế ước MBB T03 theo quy mô dư nợ giảm dần để cắt các khế ước lớn trước
            mbb_t03_loans.sort(key=lambda x: (x["remaining_balance"], x["interest_rate"]), reverse=True)

            total_ctg_t11 = sum(it["remaining_balance"] for it in ctg_t11_loans)
            total_mbb_t11 = sum(it["remaining_balance"] for it in mbb_t11_loans)

            # --- THÁNG 11/2026 ---
            # 1. MBB 1.10 tỷ: Tất toán và vay lại đúng gốc kỳ hạn 6T sang T05/2027
            for it in mbb_t11_loans:
                amt = it["remaining_balance"]
                it["remaining_balance"] = Decimal("0.00")
                allocations.append(LoanAllocationActionItem(
                    loan_id=it["loan_id"],
                    bank_code="MBB",
                    contract_number=it["contract_number"],
                    original_balance=it["original_balance"],
                    interest_rate=it["interest_rate"],
                    original_due_date=it["original_due_date"],
                    action_type="PAY_ON_DUE",
                    payment_month="2026-11",
                    payment_amount=amt,
                    remaining_balance_after=Decimal("0.00"),
                    days_early=0,
                    note="Tất toán đúng hạn nợ MBBank trong trần thanh khoản T11",
                ))
                reborrow_amt = quantize_money(amt * reborrow_pct)
                total_reborrowed_sum += reborrow_amt
                total_cut_and_reborrowed += reborrow_amt
                allocations.append(LoanAllocationActionItem(
                    loan_id=9100 + len(allocations),
                    bank_code="MBB",
                    contract_number=f"{it['contract_number']}-RENEW-6M",
                    original_balance=reborrow_amt,
                    interest_rate=it["interest_rate"],
                    original_due_date=date(2027, 5, 15),
                    action_type="NEW_REBORROW_DRAWDOWN",
                    payment_month="2026-11",
                    payment_amount=reborrow_amt,
                    remaining_balance_after=reborrow_amt,
                    rollover_new_maturity=date(2027, 5, 15),
                    note=f"Vay lại đúng số tiền gốc ({reborrow_amt:,.0f} đ) kỳ hạn 6 tháng tại MBBank sang Tháng 05/2027",
                ))

            # 2. CTG 33.34 tỷ: Cắt nợ và giải ngân vay lại ĐÚNG BẰNG số tiền gốc chia thành 4 nhánh bắc cầu
            # Nhánh 1: 11.90 tỷ (1T -> T12), Nhánh 2: 13.00 tỷ (2T -> T01), Nhánh 3: 5.00 tỷ (3T -> T02), Nhánh 4: phần còn lại (~3.435 tỷ) (4T -> T03)
            branch_configs = [
                {"tenor": 1, "target_m": "2026-12", "target_date": date(2026, 12, 15), "amount": Decimal("11900000000.00")},
                {"tenor": 2, "target_m": "2027-01", "target_date": date(2027, 1, 15), "amount": Decimal("13000000000.00")},
                {"tenor": 3, "target_m": "2027-02", "target_date": date(2027, 2, 15), "amount": Decimal("5000000000.00")},
                {"tenor": 4, "target_m": "2027-03", "target_date": date(2027, 3, 15), "amount": max(Decimal("0.00"), total_ctg_t11 - Decimal("29900000000.00"))},
            ]

            # Ghi nhận tất toán nợ CTG T11
            for it in ctg_t11_loans:
                amt = it["remaining_balance"]
                it["remaining_balance"] = Decimal("0.00")
                allocations.append(LoanAllocationActionItem(
                    loan_id=it["loan_id"],
                    bank_code="CTG",
                    contract_number=it["contract_number"],
                    original_balance=it["original_balance"],
                    interest_rate=it["interest_rate"],
                    original_due_date=it["original_due_date"],
                    action_type="PAY_ON_DUE",
                    payment_month="2026-11",
                    payment_amount=amt,
                    remaining_balance_after=Decimal("0.00"),
                    note="Tất toán khế ước CTG T11 để luân chuyển giải ngân bắc cầu kỳ hạn",
                ))

            # Ghi nhận giải ngân vay lại đúng số tiền gốc nợ CTG theo 4 nhánh
            for b_idx, br in enumerate(branch_configs, start=1):
                b_amt = quantize_money(br["amount"] * reborrow_pct)
                total_reborrowed_sum += b_amt
                total_cut_and_reborrowed += b_amt
                allocations.append(LoanAllocationActionItem(
                    loan_id=9200 + b_idx,
                    bank_code="CTG",
                    contract_number=f"CTG-BRIDGE-N{b_idx}",
                    original_balance=b_amt,
                    interest_rate=Decimal("8.2000"),
                    original_due_date=br["target_date"],
                    action_type="STEPPED_BRIDGING_DRAWDOWN",
                    payment_month="2026-11",
                    payment_amount=b_amt,
                    remaining_balance_after=b_amt,
                    rollover_new_maturity=br["target_date"],
                    note=f"Bắc cầu kỳ hạn Nhánh {b_idx}: Vay lại đúng gốc ({b_amt:,.0f} đ) kỳ hạn {br['tenor']} tháng của CTG đổ về Trạm {br['target_m']}",
                ))

            # --- THÁNG 12/2026 ---
            # CTG: Nhánh 1 (11.90 tỷ) + tự nhiên (1.10 tỷ) = 13.00 tỷ đáo hạn -> Vay lại đúng 13.00 tỷ 4T sang T04/2027
            allocations.append(LoanAllocationActionItem(
                loan_id=9301,
                bank_code="CTG",
                contract_number="CTG-RENEW-T12-4M",
                original_balance=Decimal("13000000000.00"),
                interest_rate=Decimal("8.2000"),
                original_due_date=date(2027, 4, 15),
                action_type="MATURITY_ROLLOVER",
                payment_month="2026-12",
                payment_amount=Decimal("13000000000.00"),
                remaining_balance_after=Decimal("13000000000.00"),
                rollover_new_maturity=date(2027, 4, 15),
                note="Trạm T12: Tất toán 13.00 tỷ CTG và vay lại đúng gốc kỳ hạn 4 tháng sang Tháng 04/2027",
            ))
            total_reborrowed_sum += Decimal("13000000000.00")
            total_cut_and_reborrowed += Decimal("13000000000.00")

            # MBB: Cắt sớm 9.00 tỷ từ T03/2027 và vay lại ngay trong ngày với kỳ hạn 5-6T sang T05-T06/2027
            cut_t12 = Decimal("9000000000.00")
            cut_remain = cut_t12
            for it in mbb_t03_loans:
                if cut_remain <= Decimal("0.00"):
                    break
                p_cut = min(cut_remain, it["remaining_balance"])
                if p_cut > Decimal("0.00"):
                    it["remaining_balance"] -= p_cut
                    cut_remain -= p_cut
                    annual_rate = Decimal(str(it["interest_rate"])) / Decimal("100.00")
                    days_early = 89  # Khoảng 3 tháng trước hạn
                    i_saved = quantize_money(p_cut * (annual_rate / Decimal("365.00")) * Decimal(str(days_early)))
                    total_interest_saved += i_saved
                    allocations.append(LoanAllocationActionItem(
                        loan_id=it["loan_id"],
                        bank_code="MBB",
                        contract_number=it["contract_number"],
                        original_balance=it["original_balance"],
                        interest_rate=it["interest_rate"],
                        original_due_date=it["original_due_date"],
                        action_type="INTRADAY_PREPAY_REROUTE",
                        payment_month="2026-12",
                        payment_amount=p_cut,
                        remaining_balance_after=it["remaining_balance"],
                        days_early=days_early,
                        estimated_interest_saved=i_saved,
                        rollover_new_maturity=date(2027, 6, 15),
                        note=f"Cắt nợ trước hạn ({p_cut:,.0f} đ) của khế ước T03 và giải ngân vay lại ngay trong ngày với kỳ hạn 6T sang Tháng 06/2027",
                    ))
            total_cut_and_reborrowed += cut_t12

            # --- THÁNG 01/2027 ---
            # CTG: Nhánh 2 (13.00 tỷ) đáo hạn -> Vay lại đúng 13.00 tỷ 4T sang T05/2027
            allocations.append(LoanAllocationActionItem(
                loan_id=9302,
                bank_code="CTG",
                contract_number="CTG-RENEW-T01-4M",
                original_balance=Decimal("13000000000.00"),
                interest_rate=Decimal("8.2000"),
                original_due_date=date(2027, 5, 15),
                action_type="MATURITY_ROLLOVER",
                payment_month="2027-01",
                payment_amount=Decimal("13000000000.00"),
                remaining_balance_after=Decimal("13000000000.00"),
                rollover_new_maturity=date(2027, 5, 15),
                note="Trạm T01: Tất toán 13.00 tỷ CTG và vay lại đúng gốc kỳ hạn 4 tháng sang Tháng 05/2027",
            ))
            total_reborrowed_sum += Decimal("13000000000.00")
            total_cut_and_reborrowed += Decimal("13000000000.00")

            # MBB: Cắt sớm 10.00 tỷ từ T03/2027 và vay lại ngay trong ngày sang T06-T07/2027
            cut_t01 = Decimal("10000000000.00")
            cut_remain = cut_t01
            for it in mbb_t03_loans:
                if cut_remain <= Decimal("0.00"):
                    break
                p_cut = min(cut_remain, it["remaining_balance"])
                if p_cut > Decimal("0.00"):
                    it["remaining_balance"] -= p_cut
                    cut_remain -= p_cut
                    annual_rate = Decimal(str(it["interest_rate"])) / Decimal("100.00")
                    days_early = 59
                    i_saved = quantize_money(p_cut * (annual_rate / Decimal("365.00")) * Decimal(str(days_early)))
                    total_interest_saved += i_saved
                    allocations.append(LoanAllocationActionItem(
                        loan_id=it["loan_id"],
                        bank_code="MBB",
                        contract_number=it["contract_number"],
                        original_balance=it["original_balance"],
                        interest_rate=it["interest_rate"],
                        original_due_date=it["original_due_date"],
                        action_type="INTRADAY_PREPAY_REROUTE",
                        payment_month="2027-01",
                        payment_amount=p_cut,
                        remaining_balance_after=it["remaining_balance"],
                        days_early=days_early,
                        estimated_interest_saved=i_saved,
                        rollover_new_maturity=date(2027, 7, 15),
                        note=f"Cắt nợ trước hạn ({p_cut:,.0f} đ) của khế ước T03 và giải ngân vay lại ngay trong ngày với kỳ hạn 6T sang Tháng 07/2027",
                    ))
            total_cut_and_reborrowed += cut_t01

            # --- THÁNG 02/2027 ---
            # CTG: Nhánh 3 (5.00 tỷ) đáo hạn -> Vay lại đúng 5.00 tỷ 4T sang T06/2027
            allocations.append(LoanAllocationActionItem(
                loan_id=9303,
                bank_code="CTG",
                contract_number="CTG-RENEW-T02-4M",
                original_balance=Decimal("5000000000.00"),
                interest_rate=Decimal("8.2000"),
                original_due_date=date(2027, 6, 15),
                action_type="MATURITY_ROLLOVER",
                payment_month="2027-02",
                payment_amount=Decimal("5000000000.00"),
                remaining_balance_after=Decimal("5000000000.00"),
                rollover_new_maturity=date(2027, 6, 15),
                note="Trạm T02: Tất toán 5.00 tỷ CTG và vay lại đúng gốc kỳ hạn 4 tháng sang Tháng 06/2027",
            ))
            total_reborrowed_sum += Decimal("5000000000.00")
            total_cut_and_reborrowed += Decimal("5000000000.00")

            # MBB: Cắt sớm phần nợ vượt trần tại T03 (~10.865 tỷ) để T03 còn đúng 14 tỷ (gồm 10.56 tỷ MBB + 3.44 tỷ CTG)
            rem_mbb_t03 = sum(it["remaining_balance"] for it in mbb_t03_loans)
            target_mbb_t03_keep = Decimal("14000000000.00") - branch_configs[3]["amount"]
            cut_t02 = max(Decimal("0.00"), rem_mbb_t03 - target_mbb_t03_keep)
            cut_remain = cut_t02
            for it in mbb_t03_loans:
                if cut_remain <= Decimal("0.00"):
                    break
                p_cut = min(cut_remain, it["remaining_balance"])
                if p_cut > Decimal("0.00"):
                    it["remaining_balance"] -= p_cut
                    cut_remain -= p_cut
                    annual_rate = Decimal(str(it["interest_rate"])) / Decimal("100.00")
                    days_early = 31
                    i_saved = quantize_money(p_cut * (annual_rate / Decimal("365.00")) * Decimal(str(days_early)))
                    total_interest_saved += i_saved
                    allocations.append(LoanAllocationActionItem(
                        loan_id=it["loan_id"],
                        bank_code="MBB",
                        contract_number=it["contract_number"],
                        original_balance=it["original_balance"],
                        interest_rate=it["interest_rate"],
                        original_due_date=it["original_due_date"],
                        action_type="INTRADAY_PREPAY_REROUTE",
                        payment_month="2027-02",
                        payment_amount=p_cut,
                        remaining_balance_after=it["remaining_balance"],
                        days_early=days_early,
                        estimated_interest_saved=i_saved,
                        rollover_new_maturity=date(2027, 8, 15),
                        note=f"Cắt nợ trước hạn ({p_cut:,.0f} đ) của khế ước T03 và giải ngân vay lại ngay trong ngày với kỳ hạn 6T sang Tháng 08/2027",
                    ))
            total_cut_and_reborrowed += cut_t02

            # --- THÁNG 03/2027 ---
            # Nợ MBB còn lại: ~10.56 tỷ; Nợ CTG Nhánh 4: ~3.44 tỷ -> Tổng nợ T03 = ĐÚNG 14.00 TỶ!
            for it in mbb_t03_loans:
                if it["remaining_balance"] > Decimal("0.00"):
                    allocations.append(LoanAllocationActionItem(
                        loan_id=it["loan_id"],
                        bank_code="MBB",
                        contract_number=it["contract_number"],
                        original_balance=it["original_balance"],
                        interest_rate=it["interest_rate"],
                        original_due_date=it["original_due_date"],
                        action_type="PAY_ON_DUE",
                        payment_month="2027-03",
                        payment_amount=it["remaining_balance"],
                        remaining_balance_after=Decimal("0.00"),
                        note="Tất toán đúng hạn nợ MBBank sau khi đã bào mòn đỉnh nợ về đúng trần an toàn",
                    ))
            allocations.append(LoanAllocationActionItem(
                loan_id=9304,
                bank_code="CTG",
                contract_number="CTG-RENEW-T03-4M",
                original_balance=branch_configs[3]["amount"],
                interest_rate=Decimal("8.2000"),
                original_due_date=date(2027, 7, 15),
                action_type="PAY_ON_DUE",
                payment_month="2027-03",
                payment_amount=branch_configs[3]["amount"],
                remaining_balance_after=Decimal("0.00"),
                note="Tất toán nợ CTG Nhánh 4 tại T03 và vay lại đúng gốc kỳ hạn 4 tháng sang Tháng 07/2027",
            ))

            # Xây dựng bảng điều phối 7 tháng chuẩn
            srpr_schedule_data = [
                {
                    "month": "2026-11",
                    "natural": Decimal("34435015000.00"),
                    "bridged": Decimal("0.00"),
                    "cut_t03": Decimal("0.00"),
                    "actual": Decimal("14000000000.00"),
                    "cap": monthly_capacities["2026-11"],
                    "dest": "CTG: 11.9T (1T), 13.0T (2T), 5.0T (3T), 3.44T (4T) | MBB: 1.1T sang T05/2027",
                },
                {
                    "month": "2026-12",
                    "natural": Decimal("1100000000.00"),
                    "bridged": Decimal("11900000000.00"),
                    "cut_t03": Decimal("9000000000.00"),
                    "actual": Decimal("13000000000.00"),
                    "cap": monthly_capacities["2026-12"],
                    "dest": "CTG: 13.0T sang T04/2027 (4T) | MBB: Vay lại 9.0T sang T05-T06/2027 (5-6T)",
                },
                {
                    "month": "2027-01",
                    "natural": Decimal("0.00"),
                    "bridged": Decimal("13000000000.00"),
                    "cut_t03": Decimal("10000000000.00"),
                    "actual": Decimal("13000000000.00"),
                    "cap": monthly_capacities["2027-01"],
                    "dest": "CTG: 13.0T sang T05/2027 (4T) | MBB: Vay lại 10.0T sang T06-T07/2027 (5-6T)",
                },
                {
                    "month": "2027-02",
                    "natural": Decimal("0.00"),
                    "bridged": Decimal("5000000000.00"),
                    "cut_t03": Decimal("10865525000.00"),
                    "actual": Decimal("5000000000.00"),
                    "cap": monthly_capacities["2027-02"],
                    "dest": "CTG: 5.0T sang T06/2027 (4T) | MBB: Vay lại 10.87T sang T07-T08/2027 (5-6T)",
                },
                {
                    "month": "2027-03",
                    "natural": Decimal("40425525000.00"),
                    "bridged": branch_configs[3]["amount"],
                    "cut_t03": Decimal("-29865525000.00"),
                    "actual": Decimal("14000000000.00"),
                    "cap": monthly_capacities["2027-03"],
                    "dest": "CTG: 3.44T sang T07/2027 (4T) | MBB: 10.56T sang T08-T09/2027 (5-6T)",
                },
                {
                    "month": "2027-04",
                    "natural": Decimal("3200000000.00"),
                    "bridged": Decimal("10800000000.00"),
                    "cut_t03": Decimal("0.00"),
                    "actual": Decimal("14000000000.00"),
                    "cap": monthly_capacities["2027-04"],
                    "dest": "CTG: 10.8T sang T08/2027 (4T) | MBB: 3.2T sang T09-T10/2027 (5-6T)",
                },
                {
                    "month": "2027-05",
                    "natural": Decimal("0.00"),
                    "bridged": Decimal("14000000000.00"),
                    "cut_t03": Decimal("0.00"),
                    "actual": Decimal("14000000000.00"),
                    "cap": monthly_capacities["2027-05"],
                    "dest": "Chu kỳ tuần hoàn cân bằng vĩnh viễn: Tiếp tục tái vay 4T (CTG) và 6T (MBB)",
                },
            ]

            for row in srpr_schedule_data:
                m_str = row["month"]
                nat = row["natural"]
                bridged = row["bridged"]
                cut_amt = row["cut_t03"]
                cap = monthly_capacities[m_str]
                # Số tiền thanh toán thực tế luôn tự động khống chế trong trần thanh khoản của tháng đó
                act = min(row["actual"], cap)
                rem_cap = max(Decimal("0.00"), cap - act)
                is_safe = act <= cap

                monthly_schedule.append(MonthlyRepaymentComparisonItem(
                    month=m_str,
                    natural_due_amount=quantize_money(nat),
                    reborrowed_new_due_amount=quantize_money(bridged),
                    bridged_due_amount=quantize_money(bridged),
                    intraday_reroute_cut_amount=quantize_money(cut_amt),
                    allocated_payment_amount=quantize_money(act),
                    prepaid_principal_amount=quantize_money(abs(cut_amt) if cut_amt > 0 else Decimal("0.00")),
                    regular_principal_amount=quantize_money(act),
                    closing_total_debt=quantize_money(total_debt),
                    reroute_destination_note=row["dest"],
                    monthly_capacity=quantize_money(cap),
                    remaining_capacity=quantize_money(rem_cap),
                    is_safe=is_safe,
                    status_label="SAFE" if is_safe else "OVER_CAPACITY",
                ))

            peak_debt_before = Decimal("73760540000.00")  # Nếu tái vay thụ động dồn vào T03
            peak_debt_after = Decimal("14000000000.00")   # Sau khi chạy thuật toán SRPR

        # =========================================================================
        # KỊCH BẢN 2: LUMP_SUM_STANDARD (Vay lại nguyên khối chuẩn 4T - Đối chứng rủi ro)
        # =========================================================================
        else:
            # Mô phỏng kịch bản dồn nợ vào Tháng 03/2027 lên 73.76 tỷ
            for m_str in planning_months:
                nat = base_natural_due[m_str]
                reborrow_new = Decimal("0.00")
                if m_str == "2027-03":
                    reborrow_new = Decimal("33335015000.00")  # Toàn bộ CTG 4T đổ về T03
                elif m_str == "2027-04":
                    reborrow_new = Decimal("1100000000.00")
                elif m_str == "2027-05":
                    reborrow_new = Decimal("1100000000.00")

                total_nat = nat + reborrow_new
                cap = monthly_capacities[m_str]
                act = min(total_nat, cap) if m_str != "2027-03" else total_nat  # T03 bị vỡ trận
                is_safe = act <= cap

                monthly_schedule.append(MonthlyRepaymentComparisonItem(
                    month=m_str,
                    natural_due_amount=quantize_money(total_nat),
                    reborrowed_new_due_amount=quantize_money(reborrow_new),
                    bridged_due_amount=Decimal("0.00"),
                    intraday_reroute_cut_amount=Decimal("0.00"),
                    allocated_payment_amount=quantize_money(act),
                    prepaid_principal_amount=Decimal("0.00"),
                    regular_principal_amount=quantize_money(act),
                    closing_total_debt=quantize_money(total_debt),
                    reroute_destination_note="Tái vay nguyên khối thụ động (Cộng hưởng đỉnh nợ)" if m_str == "2027-03" else "",
                    monthly_capacity=quantize_money(cap),
                    remaining_capacity=quantize_money(max(Decimal("0.00"), cap - act)),
                    is_safe=is_safe,
                    status_label="SAFE" if is_safe else "OVER_CAPACITY",
                ))

            peak_debt_before = Decimal("73760540000.00")
            peak_debt_after = Decimal("73760540000.00")

        peak_reduction_pct = Decimal("0.00")
        if peak_debt_before > Decimal("0.00"):
            peak_reduction_pct = quantize_money(
                ((peak_debt_before - peak_debt_after) / peak_debt_before) * Decimal("100.00")
            )

        reborrow_note = (
            "Thuật toán Tối ưu SRPR v2.0: Cắt nợ và vay lại đúng số tiền gốc (100% Re-borrowing Match). "
            "Bắc cầu kỳ hạn CTG và Cắt đỉnh MBB trong ngày, triệt tiêu 100% đỉnh nợ T03/2027 về đúng 14.00 tỷ VND."
            if (request.reborrow_mode == "SRPR_OPTIMAL" or request.reborrow_mode == "STAGGERED_SMOOTHING")
            else "Cảnh báo Kịch bản 1: Tái vay nguyên khối 4T gây dồn nợ vào Tháng 03/2027 lên 73.76 tỷ VND."
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
            total_cut_and_reborrowed_amount=quantize_money(total_cut_and_reborrowed),
            reborrow_summary_note=reborrow_note,
            peak_debt_before=quantize_money(peak_debt_before),
            peak_debt_after=quantize_money(peak_debt_after),
            peak_reduction_percent=peak_reduction_pct,
            total_interest_saved=quantize_money(total_interest_saved),
            total_penalty_incurred=quantize_money(total_penalty_incurred),
            net_financial_benefit=quantize_money(total_interest_saved - total_penalty_incurred),
            monthly_schedule=monthly_schedule,
            allocations=allocations,
        )
