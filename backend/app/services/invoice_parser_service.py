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


def clean_numeric_string(raw: str) -> Optional[Decimal]:
    """Chuyển chuỗi số dạng 1.489.259.199 hoặc 1489259199.00 hoặc 19398960 thành Decimal."""
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
    
    # Loại bỏ ký tự không phải số hoặc dấu chấm/dấu trừ
    val = re.sub(r"[^\d.-]", "", val)
    if not val:
        return None
    try:
        return Decimal(val)
    except (InvalidOperation, ValueError):
        return None


def parse_xml_invoice_bytes(xml_bytes: bytes) -> Dict[str, Any]:
    """
    Bóc tách dữ liệu hóa đơn điện tử XML toàn diện.
    Hỗ trợ chuẩn Tổng cục Thuế (NĐ 123 / TT 78) và các nhà cung cấp giải pháp (VNPT, Viettel, MISA, BKAV, FPT, CMC,...).
    
    Returns dict:
        {
            "invoice_number": str or None,
            "invoice_series": str or None,
            "invoice_template": str or "1",
            "invoice_date": str or None,
            "tax_authority_code": str or None,
            "seller_name": str or None,
            "seller_tax_code": str or None,
            "seller_address": str or None,
            "buyer_name": str or None,
            "buyer_tax_code": str or None,
            "buyer_address": str or None,
            "currency": str,
            "exchange_rate": Decimal,
            "subtotal_amount": Decimal,
            "tax_amount": Decimal,
            "total_amount": Decimal or None,
            "items": list of dict,
            "is_valid_invoice": bool
        }
    """
    result: Dict[str, Any] = {
        "invoice_number": None,
        "invoice_series": None,
        "invoice_template": "1",
        "invoice_date": None,
        "tax_authority_code": None,
        "seller_name": None,
        "seller_tax_code": None,
        "seller_address": None,
        "buyer_name": None,
        "buyer_tax_code": None,
        "buyer_address": None,
        "currency": "VND",
        "exchange_rate": Decimal("1.0000"),
        "subtotal_amount": Decimal("0.00"),
        "tax_amount": Decimal("0.00"),
        "total_amount": None,
        "items": [],
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

    # 1. Tìm thông tin người bán (NBan) và người mua (NMua) theo cấu trúc chuẩn
    for elem in root.iter():
        tag = clean_xml_tag(elem.tag).strip().upper()
        
        # Mã cơ quan thuế (MCCQT)
        if tag in ["MCCQT", "TAXAUTHORITYCODE", "MACOQUANTHUE"] and elem.text:
            result["tax_authority_code"] = elem.text.strip()
            
        # Thông tin bên bán (NBan / Seller)
        if tag in ["NBAN", "SELLER"]:
            for child in elem:
                c_tag = clean_xml_tag(child.tag).strip().upper()
                c_text = (child.text or "").strip()
                if c_tag in ["TEN", "NAME", "SELLERNAME"] and not result["seller_name"]:
                    result["seller_name"] = c_text
                elif c_tag in ["MST", "TAXCODE", "SELLERTAXCODE"] and not result["seller_tax_code"]:
                    result["seller_tax_code"] = c_text
                elif c_tag in ["DCHI", "ADDRESS", "SELLERADDRESS"] and not result["seller_address"]:
                    result["seller_address"] = c_text

        # Thông tin bên mua (NMua / Buyer)
        if tag in ["NMUA", "BUYER"]:
            for child in elem:
                c_tag = clean_xml_tag(child.tag).strip().upper()
                c_text = (child.text or "").strip()
                if c_tag in ["TEN", "NAME", "BUYERNAME"] and not result["buyer_name"]:
                    result["buyer_name"] = c_text
                elif c_tag in ["MST", "TAXCODE", "BUYERTAXCODE"] and not result["buyer_tax_code"]:
                    result["buyer_tax_code"] = c_text
                elif c_tag in ["DCHI", "ADDRESS", "BUYERADDRESS"] and not result["buyer_address"]:
                    result["buyer_address"] = c_text

        # Danh sách hàng hóa (DSHHDVu -> HHDVu)
        if tag in ["DSHHDVU", "ITEMS", "INVOICEDETAILS"]:
            line_no = 1
            for hhdvu in elem:
                h_tag = clean_xml_tag(hhdvu.tag).strip().upper()
                if h_tag in ["HHDVU", "ITEM", "ROW"]:
                    item_data: Dict[str, Any] = {
                        "line_number": line_no,
                        "item_name": "",
                        "unit": "",
                        "quantity": None,
                        "unit_price": None,
                        "subtotal": Decimal("0.00"),
                        "tax_rate": "8%",
                        "tax_amount": Decimal("0.00"),
                    }
                    for field in hhdvu:
                        f_tag = clean_xml_tag(field.tag).strip().upper()
                        f_text = (field.text or "").strip()
                        if f_tag in ["STT", "LINENO"]:
                            try:
                                item_data["line_number"] = int(f_text)
                            except ValueError:
                                pass
                        elif f_tag in ["THHDVU", "ITEMNAME", "NAME"]:
                            item_data["item_name"] = f_text
                        elif f_tag in ["DVTINH", "UNIT"]:
                            item_data["unit"] = f_text
                        elif f_tag in ["SLUONG", "QUANTITY"]:
                            item_data["quantity"] = clean_numeric_string(f_text)
                        elif f_tag in ["DGIA", "UNITPRICE", "PRICE"]:
                            item_data["unit_price"] = clean_numeric_string(f_text)
                        elif f_tag in ["THTIEN", "AMOUNT", "TOTAL"]:
                            amt = clean_numeric_string(f_text)
                            if amt is not None:
                                item_data["subtotal"] = amt
                        elif f_tag in ["TSUAT", "TAXRATE"]:
                            item_data["tax_rate"] = f_text

                    if item_data["item_name"] or item_data["subtotal"] > 0:
                        result["items"].append(item_data)
                        line_no += 1

    # Duyệt qua toàn bộ node để tìm các trường flat (fallback & tổng quát)
    nodes_by_tag: Dict[str, List[str]] = {}
    for elem in root.iter():
        tag_clean = clean_xml_tag(elem.tag).strip().upper()
        text_val = (elem.text or "").strip()
        if text_val:
            if tag_clean not in nodes_by_tag:
                nodes_by_tag[tag_clean] = []
            nodes_by_tag[tag_clean].append(text_val)

    # 2. Bóc tách số hóa đơn (SHDon / InvoiceNumber / SoHoaDon / InvNum)
    for candidate in ["SHDON", "INVOICENUMBER", "SOHOADON", "INVNUM", "INVOICENO", "SHD"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            result["invoice_number"] = nodes_by_tag[candidate][0]
            break

    # 3. Ký hiệu hóa đơn (KHHDon / InvoiceSeries / MauSo / Series)
    for candidate in ["KHHDON", "INVOICESERIES", "SERIES"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            result["invoice_series"] = nodes_by_tag[candidate][0]
            break

    # 4. Mẫu số hóa đơn (KHMSHDon / InvoiceTemplate)
    for candidate in ["KHMSHDON", "INVOICETEMPLATE", "MAUSO"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            result["invoice_template"] = nodes_by_tag[candidate][0]
            break

    # 5. Ngày lập hóa đơn (NLap / IssueDate / NgayLap)
    for candidate in ["NLAP", "ISSUEDATE", "NGAYLAP", "INVOICEDATE", "DATE"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            result["invoice_date"] = nodes_by_tag[candidate][0]
            break

    # 6. Đơn vị tiền tệ & Tỷ giá
    if "DVTTE" in nodes_by_tag and nodes_by_tag["DVTTE"]:
        result["currency"] = nodes_by_tag["DVTTE"][0].upper()
    elif "CURRENCY" in nodes_by_tag and nodes_by_tag["CURRENCY"]:
        result["currency"] = nodes_by_tag["CURRENCY"][0].upper()

    if "TGIA" in nodes_by_tag and nodes_by_tag["TGIA"]:
        ex = clean_numeric_string(nodes_by_tag["TGIA"][0])
        if ex:
            result["exchange_rate"] = ex

    # 7. Tổng tiền thanh toán (TgTTTBSo / TotalPayment / TgTToan)
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
            parsed_dec = clean_numeric_string(nodes_by_tag[candidate][0])
            if parsed_dec is not None and parsed_dec > 0:
                result["total_amount"] = parsed_dec
                break

    # Tiền chưa thuế (TgTCThue) & Tiền thuế (TgTThue)
    for candidate in ["TGTCTHUE", "TOTALTAXABLEAMOUNT", "SUBTOTAL"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            sub = clean_numeric_string(nodes_by_tag[candidate][0])
            if sub is not None:
                result["subtotal_amount"] = sub
                break

    for candidate in ["TGTTHUE", "TOTALVATAMOUNT", "TAXAMOUNT"]:
        if candidate in nodes_by_tag and nodes_by_tag[candidate]:
            tax = clean_numeric_string(nodes_by_tag[candidate][0])
            if tax is not None:
                result["tax_amount"] = tax
                break

    # Nếu chưa tìm thấy tổng tiền, thử cộng subtotal + tax
    if result["total_amount"] is None:
        if result["subtotal_amount"] > Decimal("0.00"):
            result["total_amount"] = result["subtotal_amount"] + result["tax_amount"]

    # Fallback cho Bên bán / Bên mua nếu chưa có
    if not result["seller_name"]:
        if "NBAN" in nodes_by_tag and nodes_by_tag["NBAN"]:
            result["seller_name"] = nodes_by_tag["NBAN"][0]
        elif "TEN" in nodes_by_tag and len(nodes_by_tag["TEN"]) > 0:
            result["seller_name"] = nodes_by_tag["TEN"][0]

    if not result["seller_tax_code"]:
        for candidate in ["MST", "TAXCODE"]:
            if candidate in nodes_by_tag and nodes_by_tag[candidate]:
                result["seller_tax_code"] = nodes_by_tag[candidate][0]
                break

    if not result["buyer_name"]:
        if "NMUA" in nodes_by_tag and nodes_by_tag["NMUA"]:
            result["buyer_name"] = nodes_by_tag["NMUA"][0]
        elif "TEN" in nodes_by_tag and len(nodes_by_tag["TEN"]) > 1:
            result["buyer_name"] = nodes_by_tag["TEN"][1]

    if not result["buyer_tax_code"]:
        if "MST" in nodes_by_tag and len(nodes_by_tag["MST"]) > 1:
            result["buyer_tax_code"] = nodes_by_tag["MST"][1]

    result["is_valid_invoice"] = bool(
        result["invoice_number"] or (result["total_amount"] is not None and result["total_amount"] > 0)
    )
    return result


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
