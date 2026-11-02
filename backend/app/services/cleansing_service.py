import hashlib
import re
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Optional

VN_TZ = timezone(timedelta(hours=7))
TWO_PLACES = Decimal("0.01")


def clean_currency(value: Any, number_format: str = "RAW_OR_US_COMMA") -> Decimal:
    """
    Chuẩn hóa mọi định dạng tiền tệ nguồn sang kiểu Decimal(18, 2) chính xác tuyệt đối.
    Tuyệt đối cấm làm tròn qua float nhị phân.
    """
    if value is None:
        return Decimal("0.00")

    if isinstance(value, Decimal):
        return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    if isinstance(value, int):
        return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    if isinstance(value, float):
        # Chuyển float sang chuỗi repr chuẩn trước khi đưa vào Decimal
        return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    raw_str = str(value).strip()
    if not raw_str or raw_str in ("-", "--", "N/A", "null", "None"):
        return Decimal("0.00")

    # Xử lý số âm kế toán trong ngoặc đơn: (1,500,000) -> -1,500,000
    is_negative = False
    acct_neg_match = re.match(r"^\(\s*(.+?)\s*\)$", raw_str)
    if acct_neg_match:
        is_negative = True
        raw_str = acct_neg_match.group(1)

    # Xóa đơn vị tiền tệ (VND, USD, VNĐ, đ) nhưng bảo toàn ký tự khoa học E/e
    clean_str = re.sub(r"(?i)\b(VND|VNĐ|USD|EUR)\b", "", raw_str)
    clean_str = clean_str.replace("\t", "").replace("\r", "").replace("\n", "").strip()

    if clean_str.startswith("-"):
        is_negative = not is_negative
        clean_str = clean_str[1:].strip()
    elif clean_str.startswith("+"):
        clean_str = clean_str[1:].strip()

    clean_str = clean_str.replace(" ", "")
    if not clean_str:
        return Decimal("0.00")

    if number_format == "VN_DOT_COMMA":
        # Định dạng VN: 5.818.504.823,00 hoặc 499.999.999
        if "," in clean_str:
            clean_str = clean_str.replace(".", "").replace(",", ".")
        elif clean_str.count(".") > 1 or (
            clean_str.count(".") == 1 and len(clean_str.split(".")[1]) == 3 and "E" not in clean_str.upper()
        ):
            clean_str = clean_str.replace(".", "")
    elif number_format == "BIFF8_NUMERIC_OR_VN_DOT":
        # SHB: Header dùng US comma (785,868), bảng có thể dùng số thực hoặc VN dot (44.000)
        if "," in clean_str and "." not in clean_str:
            clean_str = clean_str.replace(",", "")
        elif "." in clean_str and "," not in clean_str:
            parts = clean_str.split(".")
            if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3 and "E" not in clean_str.upper()):
                clean_str = clean_str.replace(".", "")
        elif "," in clean_str and "." in clean_str:
            if clean_str.rfind(",") > clean_str.rfind("."):
                clean_str = clean_str.replace(".", "").replace(",", ".")
            else:
                clean_str = clean_str.replace(",", "")
    else:
        # RAW_OR_US_COMMA, US_COMMA_DECIMAL, US_COMMA_INTEGER, SPACE_TAB_SEPARATED, RAW_NUMERIC
        clean_str = clean_str.replace(",", "")

    try:
        result = Decimal(clean_str).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        return -result if is_negative else result
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Không thể chuyển đổi giá trị tiền tệ '{value}' (format={number_format}): {exc}") from exc


def parse_iso_datetime(value: Any, fallback_value: Any = None) -> datetime:
    """
    Chuẩn hóa chuỗi ngày giờ đa định dạng sang datetime có múi giờ ISO 8601 (+07:00).
    """
    target = value if (value is not None and str(value).strip() != "") else fallback_value
    if target is None or str(target).strip() == "":
        raise ValueError("Ngày giao dịch trống và không có giá trị dự phòng.")

    if isinstance(target, datetime):
        if target.tzinfo is None:
            return target.replace(tzinfo=VN_TZ)
        return target.astimezone(VN_TZ)

    if isinstance(target, date):
        return datetime(target.year, target.month, target.day, 0, 0, 0, tzinfo=VN_TZ)

    s = re.sub(r"\s+", " ", str(target).strip())

    # Nếu đã ở dạng ISO 8601
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=VN_TZ)
        return dt.astimezone(VN_TZ)
    except ValueError:
        pass

    formats = [
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=VN_TZ)
        except ValueError:
            continue

    raise ValueError(f"Định dạng ngày giờ không hợp lệ: '{s}'")


def parse_iso_date(value: Any, fallback_dt: Optional[datetime] = None) -> Optional[date]:
    """
    Chuẩn hóa chuỗi ngày hiệu lực (value_date) sang kiểu date (YYYY-MM-DD).
    """
    if value is None or str(value).strip() == "":
        return fallback_dt.date() if fallback_dt else None

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    s = re.sub(r"\s+", " ", str(value).strip())
    formats = [
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue

    return fallback_dt.date() if fallback_dt else None


def normalize_whitespace(text: Any) -> str:
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip()


def normalize_description(
    main_desc: Any,
    counterparty_name: Any = None,
    counterparty_account: Any = None,
    counterparty_bank: Any = None,
    virtual_account: Any = None,
) -> str:
    """
    Chuẩn hóa nội dung diễn giải và ghép thông tin đối ứng theo chuẩn Bank_Mapping_Matrix.md.
    """
    base = normalize_whitespace(main_desc)
    cp_name = normalize_whitespace(counterparty_name)
    cp_acc = normalize_whitespace(counterparty_account)
    cp_bank = normalize_whitespace(counterparty_bank)
    va = normalize_whitespace(virtual_account)

    meta_parts = []
    if cp_name:
        meta_parts.append(f"ĐV: {cp_name}")
    if cp_acc:
        meta_parts.append(f"TK: {cp_acc}")
    if cp_bank:
        meta_parts.append(f"NH: {cp_bank}")
    if va:
        meta_parts.append(f"VA: {va}")

    if meta_parts:
        meta_str = f"[{' - '.join(meta_parts)}]"
        return f"{base} {meta_str}".strip() if base else meta_str

    return base or "Giao dịch ngân hàng"


def generate_dedup_hash(
    account_number: str,
    transaction_date: datetime,
    debit_amount: Decimal,
    credit_amount: Decimal,
    reference_number: Optional[str],
    running_balance: Decimal,
) -> str:
    """
    Sinh mã băm chống trùng lặp 6 thành phần (6-Tuple Canonical SHA-256):
    SHA256(account_number | transaction_date_iso | debit_amount | credit_amount | reference_number | running_balance)
    Bảo toàn 100% các giao dịch tách Phí/VAT hoặc tách lệnh rút tiền có cùng mã bút toán và cùng thời gian.
    """
    acc_clean = normalize_whitespace(account_number)
    dt_iso = transaction_date.astimezone(VN_TZ).strftime("%Y-%m-%dT%H:%M:%S+07:00")
    debit_str = f"{debit_amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP):.2f}"
    credit_str = f"{credit_amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP):.2f}"
    ref_clean = normalize_whitespace(reference_number)
    bal_str = f"{running_balance.quantize(TWO_PLACES, rounding=ROUND_HALF_UP):.2f}"

    canonical_payload = f"{acc_clean}|{dt_iso}|{debit_str}|{credit_str}|{ref_clean}|{bal_str}"
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


KNOWN_ACCOUNTS = {
    "0869596789": "NGUYEN THI LAN ANH",
    "111386888": "CONG TY CO PHAN XI MANG SUNRISE (MB)",
    "111602218989": "CONG TY CO PHAN XI MANG SUNRISE (CTG)",
    "79868686889": "CONG TY CO PHAN XI MANG SUNRISE (TPB)",
    "86528888": "CONG TY CO PHAN XI MANG SUNRISE (MBV)",
    "446637355": "CONG TY CO PHAN XI MANG SUNRISE (VPB)",
    "2283866789": "CONG TY CO PHAN XI MANG SUNRISE (SHB)",
    "83866883": "CONG TY CO PHAN THUONG MAI XAY DUNG PHUC PHAT DAT",
}


def clean_duplicate_words(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    tokens = text.split()
    half = len(tokens) // 2
    if half >= 2 and tokens[:half] == tokens[half:]:
        return " ".join(tokens[:half])
    return text


def resolve_counter_party(
    raw_cp: Any,
    main_desc: Any,
    debit_amount: Decimal = Decimal("0.00"),
    credit_amount: Decimal = Decimal("0.00"),
    account_holder: Optional[str] = None,
) -> Optional[str]:
    """
    Trích xuất và chuẩn hóa đối tượng thụ hưởng hoặc đối tượng chuyển (counter_party):
    1. Nếu có cột counterparty trong sao kê:
       - Trường hợp tiền vào (credit > 0) mà tên ghi trùng tên chủ tài khoản (do ngân hàng điền người thụ hưởng thay vì người chuyển),
         hệ thống tự động bóc tách tên người chuyển thực tế từ nội dung giao dịch.
       - Chuẩn hóa loại bỏ từ ngữ trùng lặp.
    2. Nếu không có cột riêng trên sao kê (VPBank, SHB, v.v.):
       - Bóc tách theo mẫu nội dung (NHAN TU, CCCD, CTCP, CTNB, Quỹ tiền mặt).
    3. Nếu không có thông tin đối tác trong sao kê (thu phí, trả lãi, thuế VAT): để trống (None).
    """
    cp = normalize_whitespace(raw_cp)
    d = normalize_whitespace(main_desc)
    holder_upper = normalize_whitespace(account_holder).upper() if account_holder else ""

    # TH1: Có cột counterparty nhưng là tiền vào và ghi tên chính chủ TK -> bóc tách người chuyển thực tế từ diễn giải
    if cp and holder_upper and cp.upper() == holder_upper and credit_amount > Decimal("0.00"):
        inbound = _find_inbound_sender(d)
        if inbound:
            return clean_duplicate_words(inbound)
        return clean_duplicate_words(cp)

    if cp:
        return clean_duplicate_words(cp)

    # TH2: Không có cột counterparty riêng -> Bóc tách từ nội dung giao dịch nếu có đối tác
    return _extract_counterparty_from_desc(d)


def _find_inbound_sender(desc: str) -> Optional[str]:
    if not desc:
        return None
    d = desc.strip()
    if re.search(r"tra lai tien gui|thu phi|thue vat|phi sms", d, re.I):
        return None
    m = re.match(r"^VND-TGTT-([A-Z\s]+?)(?:\s+Q[a-z0-9]|\s+APPMB|\s+chuyen|\s*$)", d, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"TU:\s*([A-Z0-9\s.,-]+?)(?:-|\.|\s*$)", d, re.I)
    if m:
        val = m.group(1).strip()
        if len(val) > 2 and not any(k in val.upper() for k in ["CUSTOMER", "VND", "DEN"]):
            return val
    m = re.match(r"^([A-Z\s]{3,35}?)(?:\s+QAECST|\s+Qaecst|\s+APPMB)", d)
    if m:
        val = m.group(1).strip()
        if not any(k in val.upper() for k in ["CUSTOMER", "VND", "DEN", "NOP"]):
            return val
    m = re.match(r"^([A-Z\s]{3,40}?)\s+(?:chuyen tien|chuyen khoan)", d, re.I)
    if m:
        val = m.group(1).strip()
        if not any(k in val.upper() for k in ["CUSTOMER", "VND", "DEN", "NOP"]):
            return val
    m = re.match(r"^(CONG TY [A-Z\s]+?)\s+nhap quy", d, re.I)
    if m:
        return m.group(1).strip()
    return None


def _extract_counterparty_from_desc(desc: str) -> Optional[str]:
    if not desc:
        return None
    d = desc.strip()
    if re.search(r"tra lai tien gui|thu phi|thue vat|phi sms|nhan lai tu tai khoan", d, re.I):
        return None
    # VPBank: NHAN TU <ACC>
    m = re.search(r"NHAN TU\s+([0-9]{8,16})", d, re.I)
    if m:
        acc = m.group(1)
        return KNOWN_ACCOUNTS.get(acc, f"TK: {acc}")
    # Doanh nghiệp: Cty TNHH / CTY CP
    m = re.match(r"^(Cty\s+[^\n]+?)\s+chuyen khoan", d, re.I)
    if m:
        return clean_duplicate_words(m.group(1).strip())
    # SHB: NGUYEN THI LAN ANH CCCD ...
    m = re.match(r"^(NGUYEN THI LAN ANH)\s+CCCD", d, re.I)
    if m:
        return m.group(1).strip()
    m = re.match(r"^(CTCP\s+[^\n]+?|CTY\s+[^\n]+?)\s+TT TIEN HANG", d, re.I)
    if m:
        return m.group(1).strip()
    # Chuyển tiền nội bộ (CTNB)
    if re.search(r"\bctnb\b", d, re.I):
        if "vtb" in d.lower():
            return "CONG TY CO PHAN XI MANG SUNRISE (CTG)"
        if "mb" in d.lower():
            return "CONG TY CO PHAN XI MANG SUNRISE (MBB)"
        return "CONG TY CO PHAN XI MANG SUNRISE"
    if re.search(r"\bnhap quy\b", d, re.I):
        return "NGUYEN THI LAN ANH (Quỹ tiền mặt)"
    if re.search(r"\brut tien\b", d, re.I):
        return "NGUYEN THI LAN ANH (Rút tiền mặt)"
    return None

