import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple


def get_actual_days_in_monthly_cycle(
    ref_date: date,
    due_day: int,
    disbursement_date: Optional[date] = None,
) -> int:
    """
    Xác định số ngày tính lãi thực tế trong kỳ trả lãi hằng tháng (Actual days).
    Theo Điều 5 Thông tư 14/2017/TT-NHNN:
    - Tính ngày đầu, bỏ ngày cuối của kỳ tính lãi.
    - Thời hạn từ ngày trả lãi kỳ trước đến ngày trả lãi kỳ này.
    """
    clamped_due_day = max(1, min(due_day, 31))

    # Xác định ngày đến hạn của tháng hiện tại/gần nhất
    max_days_current_month = calendar.monthrange(ref_date.year, ref_date.month)[1]
    curr_due_date = date(ref_date.year, ref_date.month, min(clamped_due_day, max_days_current_month))

    if ref_date > curr_due_date:
        # Đã qua ngày trả lãi tháng này -> Kỳ tới là tháng sau
        if ref_date.month == 12:
            next_year, next_month = ref_date.year + 1, 1
        else:
            next_year, next_month = ref_date.year, ref_date.month + 1
        
        max_days_next = calendar.monthrange(next_year, next_month)[1]
        next_due_date = date(next_year, next_month, min(clamped_due_day, max_days_next))
        prev_due_date = curr_due_date
    else:
        # Chưa đến ngày trả lãi tháng này -> Kỳ tới chính là curr_due_date
        next_due_date = curr_due_date
        if ref_date.month == 1:
            prev_year, prev_month = ref_date.year - 1, 12
        else:
            prev_year, prev_month = ref_date.year, ref_date.month - 1
        
        max_days_prev = calendar.monthrange(prev_year, prev_month)[1]
        prev_due_date = date(prev_year, prev_month, min(clamped_due_day, max_days_prev))

    # Nếu có disbursement_date và khoản vay mới giải ngân sau prev_due_date
    if disbursement_date and disbursement_date > prev_due_date:
        start_date = disbursement_date
    else:
        start_date = prev_due_date

    days = (next_due_date - start_date).days
    return max(1, days)


def calculate_loan_interest(
    principal_balance: Decimal,
    annual_interest_rate: Decimal,
    payment_method: str = "MONTHLY",
    monthly_due_day: Optional[int] = None,
    disbursement_date: Optional[date] = None,
    maturity_date: Optional[date] = None,
    as_of_date: Optional[date] = None,
) -> Decimal:
    """
    Tính số lãi cần trả theo quy định hiện hành của pháp luật:
    Căn cứ: Thông tư số 14/2017/TT-NHNN của Thống đốc Ngân hàng Nhà nước Việt Nam.
    - Cơ sở tính lãi: 1 năm là 365 ngày (Actual/365).
    - Công thức: Số tiền lãi = (Số dư thực tế * Số ngày duy trì thực tế * Lãi suất %/năm) / 365
    - Thời hạn tính lãi: Tính ngày đầu, bỏ ngày cuối của kỳ tính lãi.
    
    1. Hình thức 'MONTHLY' (Hằng tháng):
       Tính tiền lãi của kỳ hằng tháng tới hạn gần nhất dựa trên số ngày thực tế trong chu kỳ trả lãi.
    2. Hình thức 'END_OF_TERM' (Cuối kỳ):
       Tính tổng tiền lãi phải thanh toán vào ngày đáo hạn (từ ngày giải ngân đến ngày đáo hạn).
    """
    if principal_balance <= Decimal("0.00") or annual_interest_rate <= Decimal("0.0000"):
        return Decimal("0.00")

    today = as_of_date or date.today()
    # annual_interest_rate trong CSDL lưu dạng % (ví dụ 8.7000 nghĩa là 8.7%)
    rate_fraction = annual_interest_rate / Decimal("100.0")

    method = (payment_method or "MONTHLY").upper().strip()

    if method == "END_OF_TERM":
        # Trả lãi cuối kỳ: Toàn bộ số lãi từ disbursement_date đến maturity_date
        if disbursement_date and maturity_date and maturity_date > disbursement_date:
            days = (maturity_date - disbursement_date).days
        elif disbursement_date and today > disbursement_date:
            days = (today - disbursement_date).days
        elif maturity_date and maturity_date > today:
            days = (maturity_date - today).days
        else:
            days = 30  # Fallback 1 tháng nếu thiếu mốc ngày

        # Tiền lãi = (Dư nợ gốc * Lãi suất năm * Số ngày) / 365
        interest = (principal_balance * rate_fraction * Decimal(days)) / Decimal("365.0")
        return interest.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    else:
        # Trả lãi hằng tháng (MONTHLY):
        due_day = monthly_due_day
        if not due_day:
            if disbursement_date:
                due_day = disbursement_date.day
            else:
                due_day = 25

        days = get_actual_days_in_monthly_cycle(today, due_day, disbursement_date)
        interest = (principal_balance * rate_fraction * Decimal(days)) / Decimal("365.0")
        return interest.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
