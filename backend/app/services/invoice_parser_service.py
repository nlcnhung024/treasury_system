"""
Invoice Parser Service
Bóc tách dữ liệu Hóa đơn điện tử định dạng XML (theo NĐ 123/2020/NĐ-CP & TT 78/2021/TT-BTC)
và đối soát tổng giá trị hóa đơn giải ngân với dư nợ gốc của khoản vay.
"""

from decimal import Decimal, InvalidOperation
import logging
import re
from typing import Any, Dict, List, Optional
import xml.etree.ElementTree as ET

from app.models.credit import CreditFacility, DisbursementDocument
from app.schemas.credit import LoanInvoiceReconciliationResponse

logger = logging.getLogger(__name__)


def clean_xml_tag(tag: str) -> str:
    """Loại bỏ namespace prefix khỏi XML tag name: {http://...}Tag -> Tag."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_xml_invoice_bytes(xml_bytes: bytes) -> Dict[str, Any]:
    """
    Bóc tách dữ liệu hóa đơn điện tử XML.
    Hỗ trợ chuẩn Tổng cục Thuế (NĐ 123 / TT 78) và các nhà cung cấp giải pháp (VNPT, Viettel, MISA, BKAV, FPT, CMC,...).
    
    Returns dict:
        {
            "invoice_number": str or None,
            "invoice_series": str or None,
            "invoice_date": str or None,
            "seller_name": str or None,
            "seller_tax_code": str or None,
            "buyer_name": str or None,
            "buyer_tax_code": str or None,
            "total_amount": Decimal or None,
            "currency": str,
            "is_valid_invoice": bool
        }
    """
    result: Dict[str, Any] = {
        "invoice_number": None,
        "invoice_series": None,
        "invoice_date": None,
        "seller_name": None,
        "seller_tax_code": None,
        "buyer_name": None,
        "buyer_tax_code": None,
        "total_amount": None,
        "currency": "VND",
        "is_valid_invoice": False,
    }

    try:
        # Decode sang text trước để xử lý encoding declaration nếu có
        try:
            xml_text = xml_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                xml_text = xml_bytes.decode("utf-8-sig")
            except UnicodeDecodeError:
                xml_text = xml_bytes.decode("latin-1")

        # Parse XML tree
        root = ET.fromstring(xml_text.encode("utf-8"))
    except Exception as e:
        logger.warning(f"Lỗi khi parse XML hóa đơn: {e}")
        return result

    # Duyệt qua toàn bộ node để tìm các trường quan trọng (case-insensitive & namespace-agnostic)
    nodes_by_tag: Dict[str, List[str]] = {}
    for elem in root.iter():
        tag_clean = clean_xml_tag(elem.tag).strip().upper()
        text_val = (elem.text or "").strip()
        if text_val:
            if tag_clean not in nodes_by_tag:
                nodes_by_tag[tag_clean] = []
            nodes_by_tag[tag_clean].append(text_val)

    # 1. Bóc tách số hóa đơn (SHDon / InvoiceNumber / SoHoaDon / InvNum)
    invoice_number = None
    for candidate in ["SHDON", "INVOICENUMBER", "SOHOADON", "INVNUM", "INVOICENO", "SHD"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            invoice_number = nodes_by_tag[candidate][0]
            break

    # 2. Bóc tách ký hiệu hóa đơn (KHHDon / InvoiceSeries / MauSo / KHMSHDon)
    invoice_series = None
    for candidate in ["KHHDON", "INVOICESERIES", "SERIES", "KHMSHDON"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            invoice_series = nodes_by_tag[candidate][0]
            break

    # 3. Bóc tách ngày lập hóa đơn (NLap / IssueDate / NgayLap)
    invoice_date = None
    for candidate in ["NLAP", "ISSUEDATE", "NGAYLAP", "INVOICEDATE", "DATE"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            invoice_date = nodes_by_tag[candidate][0]
            break

    # 4. Bóc tách tổng số tiền thanh toán (TgTTTBSo / TotalPayment / TgTToan / TongTienThanhToan)
    total_amount: Optional[Decimal] = None
    total_candidates = [
        "TGTTTBSO",
        "TOTALPAYMENT",
        "TGTTOAN",
        "TONGTIENTHANHTOAN",
        "TOTALAMOUNT",
        "AMOUNT",
        "SUMAMOUNT",
    ]
    for candidate in total_candidates:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            raw_val = nodes_by_tag[candidate][0]
            parsed_dec = clean_numeric_string(raw_val)
            if parsed_dec is not None and parsed_dec > 0:
                total_amount = parsed_dec
                break

    # Nếu chưa tìm thấy tổng tiền, thử cộng tiền chưa thuế (TgTCThue) + tiền thuế (TgTThue)
    if total_amount is None:
        amount_pre_tax = None
        tax_amount = None
        for candidate in ["TGTCTHUE", "TOTALTAXABLEAMOUNT", "SUBTOTAL"]:
            if candidate in nodes_by_tag and nodes_by_tag[candidate]:
                amount_pre_tax = clean_numeric_string(nodes_by_tag[candidate][0])
                break
        for candidate in ["TGTTHUE", "TOTALVATAMOUNT", "TAXAMOUNT"]:
            if candidate in nodes_by_tag and nodes_by_tag[candidate]:
                tax_amount = clean_numeric_string(nodes_by_tag[candidate][0])
                break
        if amount_pre_tax is not None:
            total_amount = amount_pre_tax + (tax_amount or Decimal("0.00"))

    # 5. Tiền tệ (DVTTe)
    currency = "VND"
    if "DVTTE" in nodes_by_tag and nodes_by_tag["DVTTE"]:
        currency = nodes_by_tag["DVTTE"][0].upper()
    elif "CURRENCY" in nodes_by_tag and nodes_by_tag["CURRENCY"]:
        currency = nodes_by_tag["CURRENCY"][0].upper()

    # 6. Người bán & Người mua
    seller_name = None
    if "NBAN" in nodes_by_tag:
        seller_name = nodes_by_tag["NBAN"][0]
    elif "TEN" in nodes_by_tag and len(nodes_by_tag["TEN"]) > 0:
        seller_name = nodes_by_tag["TEN"][0]

    seller_tax_code = None
    for candidate in ["MST", "TAXCODE"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            seller_tax_code = nodes_by_tag[candidate][0]
            break

    is_valid = bool(invoice_number or (total_amount is not None and total_amount > 0))

    result.update({
        "invoice_number": invoice_number,
        "invoice_series": invoice_series,
        "invoice_date": invoice_date,
        "seller_name": seller_name,
        "seller_tax_code": seller_tax_code,
        "total_amount": total_amount,
        "currency": currency,
        "is_valid_invoice": is_valid,
    })
    return result


def clean_numeric_string(raw: str) -> Optional[Decimal]:
    """Chuyển chuỗi số dạng 1.489.259.199 hoặc 1489259199.00 thành Decimal."""
    if not raw:
        return None
    val = raw.strip().replace(" ", "")
    # Trường hợp định dạng VN: 1.489.259.199,00
    if "," in val and "." in val:
        if val.rfind(",") > val.rfind("."):
            # Dấu phẩy là thập phân
            val = val.replace(".", "").replace(",", ".")
        else:
            # Dấu chấm là thập phân
            val = val.replace(",", "")
    elif "," in val and "." not in val:
        # Có thể là 1,489,259 hoặc 1489259,00
        parts = val.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            val = val.replace(",", ".")
        else:
            val = val.replace(",", "")
    
    # Loại bỏ ký tự không phải số hoặc dấu chấm
    val = re.sub(r"[^\d.-]", "", val)
    if not val:
        return None
    try:
        return Decimal(val)
    except (InvalidOperation, ValueError):
        return None


def calculate_loan_invoice_reconciliation(
    loan: CreditFacility,
    documents: List[DisbursementDocument]
) -> LoanInvoiceReconciliationResponse:
    """
    Tính toán đối soát hóa đơn cho một khoản vay:
    Tổng tiền hóa đơn = Tổng invoice_total_amount của các file hóa đơn XML.
    Nếu tổng tiền hóa đơn < dư nợ gốc: Báo động thiếu hóa đơn.
    """
    total_invoice_amount = Decimal("0.00")
    invoice_count = 0

    for doc in documents:
        if doc.invoice_total_amount is not None and doc.invoice_total_amount > Decimal("0.00"):
            total_invoice_amount += doc.invoice_total_amount
            invoice_count += 1
        elif doc.file_name.lower().endswith(".xml") and doc.invoice_total_amount:
            total_invoice_amount += doc.invoice_total_amount
            invoice_count += 1

    principal = loan.current_principal_balance or Decimal("0.00")
    
    if total_invoice_amount < principal:
        shortage = principal - total_invoice_amount
        is_sufficient = False
        warning = (
            f"⚠️ Cảnh báo: Thiếu hóa đơn giải ngân! "
            f"Tổng tiền hóa đơn ({total_invoice_amount:,.0f} ₫) bé hơn dư nợ gốc ({principal:,.0f} ₫). "
            f"Còn thiếu {shortage:,.0f} ₫ hóa đơn hợp lệ!"
        )
    else:
        shortage = Decimal("0.00")
        is_sufficient = True
        warning = None

    return LoanInvoiceReconciliationResponse(
        loan_id=loan.loan_id,
        contract_number=loan.contract_number,
        bank_code=loan.bank_code,
        current_principal_balance=principal,
        total_invoice_amount=total_invoice_amount,
        shortage_amount=shortage,
        is_sufficient=is_sufficient,
        invoice_count=invoice_count,
        warning_message=warning,
    )
