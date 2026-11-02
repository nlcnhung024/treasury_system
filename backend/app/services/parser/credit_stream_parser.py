import io
import re
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import openpyxl
import openpyxl.utils
import xlrd
import yaml

from app.services.cleansing_service import (
    clean_currency,
    normalize_whitespace,
    normalize_description,
)

CONFIG_PATH = Path(__file__).parent / "credit_templates_config.yaml"

XLSX_MAGIC = b"\x50\x4b\x03\x04"
XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


@dataclass
class ParsedCreditPackage:
    template_code: str
    bank_code: str
    bank_name: str
    borrower_name: str
    cif_number: Optional[str]
    statement_date: Optional[date]
    total_principal_amount: Decimal
    total_interest_amount: Decimal
    total_payable_amount: Decimal
    calculated_principal_amount: Decimal
    total_contracts_count: int
    reconciliation_status: str  # "BALANCED" | "DISCREPANCY"
    discrepancy_amount: Decimal
    items: List[Dict[str, Any]]


def load_credit_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    target = config_path or CONFIG_PATH
    with open(target, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _col_to_idx(col_letter: str) -> int:
    return openpyxl.utils.column_index_from_string(col_letter.upper()) - 1


def _parse_flexible_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.date() if isinstance(val, datetime) else val
    s = normalize_whitespace(val)
    if not s or s in ("-", "--", "N/A"):
        return None
    # match DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    # Regex extract date if surrounded by other text
    m = re.search(r"(\d{2})[/-](\d{2})[/-](\d{4})", s)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return None


def _clean_rate(val: Any) -> Decimal:
    if val is None:
        return Decimal("0.0000")
    if isinstance(val, (int, float, Decimal)):
        return Decimal(str(val)).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
    s = str(val).replace("%", "").strip()
    try:
        return Decimal(s).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.0000")


def detect_credit_template(
    file_bytes: bytes, filename: str = "", hint_template_code: Optional[str] = None
) -> Tuple[str, Dict[str, Any]]:
    config = load_credit_config()
    templates = config.get("templates", {})

    is_xlsx = file_bytes.startswith(XLSX_MAGIC)
    is_xls = file_bytes.startswith(XLS_MAGIC)

    if not is_xlsx and not is_xls:
        ext = Path(filename).suffix.lower()
        if ext == ".xlsx":
            is_xlsx = True
        elif ext == ".xls":
            is_xls = True
        else:
            raise ValueError(f"Định dạng file không hợp lệ: {filename}. Chỉ chấp nhận .xlsx hoặc .xls.")

    # Trích xuất 25 dòng đầu
    cells: Dict[str, str] = {}
    if is_xlsx:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        try:
            ws = wb.worksheets[0]
            for r in range(1, min(25, ws.max_row) + 1):
                for c in range(1, min(25, ws.max_column) + 1):
                    val = ws.cell(r, c).value
                    if val is not None:
                        s = normalize_whitespace(val)
                        if s:
                            letter = openpyxl.utils.get_column_letter(c)
                            cells[f"{letter}{r}"] = s
        finally:
            wb.close()
    elif is_xls:
        wb = xlrd.open_workbook(file_contents=file_bytes)
        ws = wb.sheet_by_index(0)
        for r in range(min(25, ws.nrows)):
            for c in range(min(25, ws.ncols)):
                val = ws.cell_value(r, c)
                if val is not None:
                    s = normalize_whitespace(val)
                    if s:
                        letter = openpyxl.utils.get_column_letter(c + 1)
                        cells[f"{letter}{r + 1}"] = s

    if hint_template_code and hint_template_code in templates:
        return hint_template_code, templates[hint_template_code]

    # Kiểm tra quy tắc detection
    for code, t_cfg in templates.items():
        rules = t_cfg.get("detection_rules", [])
        all_match = True
        for rule in rules:
            target_cell = rule.get("cell", "")
            contains_str = rule.get("contains", "")
            cell_val = cells.get(target_cell, "")
            if contains_str.lower() not in cell_val.lower():
                all_match = False
                break
        if all_match and rules:
            return code, t_cfg

    raise ValueError(
        f"Không nhận diện được mẫu sao kê tín dụng phù hợp cho file '{filename}'. "
        "Hỗ trợ: VietinBank eFAST Báo cáo khoản vay (XLS) và MB Báo cáo Vay/LD (XLSX)."
    )


def _load_all_rows(file_bytes: bytes, file_format: str) -> List[List[Any]]:
    rows: List[List[Any]] = []
    if file_format == "XLSX":
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        try:
            ws = wb.worksheets[0]
            max_c = min(30, ws.max_column)
            for r in range(1, ws.max_row + 1):
                rows.append([ws.cell(r, c).value for c in range(1, max_c + 1)])
        finally:
            wb.close()
    elif file_format == "XLS":
        wb = xlrd.open_workbook(file_contents=file_bytes)
        ws = wb.sheet_by_index(0)
        for r in range(ws.nrows):
            rows.append([ws.cell_value(r, c) for c in range(ws.ncols)])
    return rows


def parse_credit_statement_file(
    file_source: Union[bytes, Path, str], filename: str = "", hint_template_code: Optional[str] = None
) -> ParsedCreditPackage:
    if isinstance(file_source, (Path, str)):
        p = Path(file_source)
        file_bytes = p.read_bytes()
        if not filename:
            filename = p.name
    else:
        file_bytes = file_source

    template_code, t_cfg = detect_credit_template(file_bytes, filename, hint_template_code)
    bank_code = t_cfg.get("bank_code", "UNKNOWN")
    bank_name = t_cfg.get("bank_name", "")
    file_format = t_cfg.get("file_format", "XLSX")

    rows = _load_all_rows(file_bytes, file_format)

    # 1. Bóc tách Metadata
    borrower_name = "Doanh nghiệp vay vốn"
    cif_number: Optional[str] = None
    statement_date: Optional[date] = None
    total_principal_amount = Decimal("0.00")
    total_interest_amount = Decimal("0.00")
    total_payable_amount = Decimal("0.00")

    meta_cfg = t_cfg.get("metadata_extractors", {})

    if template_code == "CTG_LOAN_XLS":
        # borrower_name: A7 (r_idx = 6, c_idx = 0)
        if len(rows) > 6 and len(rows[6]) > 0 and rows[6][0]:
            borrower_name = normalize_whitespace(rows[6][0])
        # cif: A8 (r_idx = 7)
        if len(rows) > 7 and len(rows[7]) > 0 and rows[7][0]:
            m = re.search(r"Số CIF:\s*([0-9]+)", str(rows[7][0]))
            if m:
                cif_number = m.group(1)
        # statement_date: K4 (r_idx = 3, c_idx = 10)
        if len(rows) > 3 and len(rows[3]) > 10 and rows[3][10]:
            statement_date = _parse_flexible_date(rows[3][10])
        # overview: E13 (r_idx = 12), F13, G13
        if len(rows) > 12:
            total_principal_amount = clean_currency(rows[12][4] if len(rows[12]) > 4 else None)
            total_interest_amount = clean_currency(rows[12][5] if len(rows[12]) > 5 else None)
            total_payable_amount = clean_currency(rows[12][6] if len(rows[12]) > 6 else None)

    elif template_code in ("MBB_LOAN_LD_XLSX", "BIDV_LOAN_LD_XLSX"):
        # statement_date: N3 (r_idx = 2, c_idx = 13)
        if len(rows) > 2 and len(rows[2]) > 13 and rows[2][13]:
            statement_date = _parse_flexible_date(rows[2][13])
        borrower_name = "Doanh nghiệp vay vốn MB"
        # Tìm dòng Tổng
        for row in rows:
            if len(row) > 2 and str(row[2]).strip() == "Tổng":
                # col G: index 6 (total principal)
                if len(row) > 6:
                    total_principal_amount = clean_currency(row[6])
                # col P: index 15 (total interest)
                if len(row) > 15:
                    total_interest_amount = clean_currency(row[15])
                break

    # 2. Bóc tách danh sách các dòng khoản vay
    grid = t_cfg.get("grid_boundaries", {})
    data_start = grid.get("data_start_row", 1) - 1
    stop_cfg = grid.get("stop_condition", {})

    items: List[Dict[str, Any]] = []
    calculated_principal = Decimal("0.00")

    for r_idx in range(data_start, len(rows)):
        row = rows[r_idx]
        if not any(row):
            continue

        if template_code == "CTG_LOAN_XLS":
            # stop condition: col B (index 1) empty
            acc_val = row[1] if len(row) > 1 else None
            contract_number = normalize_whitespace(acc_val)
            if not contract_number or not re.match(r"^\d+$", contract_number):
                continue

            disbursement_date = _parse_flexible_date(row[2] if len(row) > 2 else None)
            maturity_date = _parse_flexible_date(row[3] if len(row) > 3 else None)
            term = normalize_whitespace(row[4] if len(row) > 4 else "")
            next_repayment_date = _parse_flexible_date(row[5] if len(row) > 5 else None)
            principal_balance = clean_currency(row[6] if len(row) > 6 else None)
            currency = normalize_whitespace(row[7] if len(row) > 7 else "VND")
            interest_rate = _clean_rate(row[8] if len(row) > 8 else None)
            accrued_interest = clean_currency(row[9] if len(row) > 9 else None)
            total_repayment = clean_currency(row[10] if len(row) > 10 else None)

            calculated_principal += principal_balance

            items.append({
                "contract_number": contract_number,
                "disbursement_date": disbursement_date,
                "maturity_date": maturity_date,
                "term": term,
                "interest_rate": interest_rate,
                "debt_group": "1",
                "loan_purpose": "Vay vốn sản xuất kinh doanh",
                "principal_balance": principal_balance,
                "principal_balance_vnd": principal_balance,
                "accrued_interest": accrued_interest,
                "next_principal_due_date": next_repayment_date,
                "next_principal_amount": Decimal("0.00"),
                "next_interest_due_date": next_repayment_date,
                "next_interest_amount": total_repayment,
                "total_due_amount": total_repayment,
                "currency": currency,
            })

        elif template_code in ("MBB_LOAN_LD_XLSX", "BIDV_LOAN_LD_XLSX"):
            # col C: index 2 is Số LD
            ld_val = row[2] if len(row) > 2 else None
            contract_number = normalize_whitespace(ld_val)
            if not contract_number or contract_number == "Tổng":
                if contract_number == "Tổng":
                    break
                continue

            currency = normalize_whitespace(row[3] if len(row) > 3 else "VND")
            loan_purpose = normalize_whitespace(row[4] if len(row) > 4 else "")
            principal_balance = clean_currency(row[5] if len(row) > 5 else None)
            principal_balance_vnd = clean_currency(row[6] if len(row) > 6 else None)
            disbursement_date = _parse_flexible_date(row[7] if len(row) > 7 else None)
            maturity_date = _parse_flexible_date(row[8] if len(row) > 8 else None)
            debt_group = normalize_whitespace(row[9] if len(row) > 9 else "1")
            interest_rate = _clean_rate(row[10] if len(row) > 10 else None)
            next_prin_amount = clean_currency(row[11] if len(row) > 11 else None)
            next_prin_date = _parse_flexible_date(row[13] if len(row) > 13 else None)
            next_int_amount = clean_currency(row[14] if len(row) > 14 else None)
            next_int_date = _parse_flexible_date(row[16] if len(row) > 16 else None)

            calculated_principal += principal_balance

            items.append({
                "contract_number": contract_number,
                "disbursement_date": disbursement_date,
                "maturity_date": maturity_date,
                "term": None,
                "interest_rate": interest_rate,
                "debt_group": debt_group or "1",
                "loan_purpose": loan_purpose,
                "principal_balance": principal_balance,
                "principal_balance_vnd": principal_balance_vnd or principal_balance,
                "accrued_interest": Decimal("0.00"),
                "next_principal_due_date": next_prin_date,
                "next_principal_amount": next_prin_amount,
                "next_interest_due_date": next_int_date,
                "next_interest_amount": next_int_amount,
                "total_due_amount": next_prin_amount + next_int_amount,
                "currency": currency,
            })

    # 3. Đối soát tổng dư nợ
    discrepancy = abs(total_principal_amount - calculated_principal).quantize(TWO_PLACES)
    reconciled_status = "BALANCED" if discrepancy == Decimal("0.00") else "DISCREPANCY"

    return ParsedCreditPackage(
        template_code=template_code,
        bank_code=bank_code,
        bank_name=bank_name,
        borrower_name=borrower_name,
        cif_number=cif_number,
        statement_date=statement_date,
        total_principal_amount=total_principal_amount,
        total_interest_amount=total_interest_amount,
        total_payable_amount=total_payable_amount,
        calculated_principal_amount=calculated_principal,
        total_contracts_count=len(items),
        reconciliation_status=reconciled_status,
        discrepancy_amount=discrepancy,
        items=items,
    )
