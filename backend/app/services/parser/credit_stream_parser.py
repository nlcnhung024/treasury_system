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


def _get_row_cell(row: List[Any], col_letter: Optional[str]) -> Any:
    if not col_letter:
        return None
    idx = _col_to_idx(col_letter)
    return row[idx] if 0 <= idx < len(row) else None


def _extract_cell_val(rows: List[List[Any]], cell_coord: Optional[str]) -> Any:
    if not cell_coord:
        return None
    m = re.match(r"^([A-Za-z]+)(\d+)$", cell_coord.strip())
    if not m:
        return None
    c_idx = _col_to_idx(m.group(1))
    r_idx = int(m.group(2)) - 1
    if 0 <= r_idx < len(rows) and 0 <= c_idx < len(rows[r_idx]):
        return rows[r_idx][c_idx]
    return None


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

    # Trích xuất 25 dòng đầu dùng Stream / Read-Only
    cells: Dict[str, str] = {}
    if is_xlsx:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        try:
            ws = wb.worksheets[0]
            if hasattr(ws, "reset_dimensions"):
                ws.reset_dimensions()
            for r_idx, row in enumerate(ws.iter_rows(max_row=25, max_col=25, values_only=True), start=1):
                for c_idx, val in enumerate(row, start=1):
                    if val is not None:
                        s = normalize_whitespace(val)
                        if s:
                            letter = openpyxl.utils.get_column_letter(c_idx)
                            cells[f"{letter}{r_idx}"] = s
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
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        try:
            ws = wb.worksheets[0]
            if hasattr(ws, "reset_dimensions"):
                ws.reset_dimensions()
            for row in ws.iter_rows(values_only=True):
                rows.append(list(row))
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

    # 1. Bóc tách Metadata hoàn toàn theo Declarative Config
    meta_cfg = t_cfg.get("metadata_extractors", {})

    borrower_name = "CONG TY CO PHAN XI MANG SUNRISE"
    if "borrower_name" in meta_cfg:
        b_cfg = meta_cfg["borrower_name"]
        if "cell" in b_cfg:
            b_val = _extract_cell_val(rows, b_cfg["cell"])
            if b_val:
                borrower_name = normalize_whitespace(b_val)
        elif "default" in b_cfg:
            borrower_name = b_cfg["default"]

    cif_number: Optional[str] = None
    if "cif_number" in meta_cfg:
        c_cfg = meta_cfg["cif_number"]
        val = _extract_cell_val(rows, c_cfg.get("cell"))
        if val:
            regex_pat = c_cfg.get("regex")
            if regex_pat:
                m = re.search(regex_pat, str(val))
                if m:
                    cif_number = m.group(1)
            if not cif_number:
                m = re.search(r"(\d+)", str(val))
                if m:
                    cif_number = m.group(1)
                else:
                    cif_number = normalize_whitespace(val)

    statement_date: Optional[date] = None
    if "statement_date" in meta_cfg:
        d_cfg = meta_cfg["statement_date"]
        val = _extract_cell_val(rows, d_cfg.get("cell"))
        if val:
            statement_date = _parse_flexible_date(val)

    total_principal_amount = Decimal("0.00")
    total_interest_amount = Decimal("0.00")
    total_payable_amount = Decimal("0.00")

    if "total_principal" in meta_cfg:
        total_principal_amount = clean_currency(_extract_cell_val(rows, meta_cfg["total_principal"].get("cell")))
    if "total_interest" in meta_cfg:
        total_interest_amount = clean_currency(_extract_cell_val(rows, meta_cfg["total_interest"].get("cell")))
    if "total_payable" in meta_cfg:
        total_payable_amount = clean_currency(_extract_cell_val(rows, meta_cfg["total_payable"].get("cell")))

    # Trích xuất tổng từ summary_row nếu có khai báo
    summary_cfg = meta_cfg.get("summary_row") or t_cfg.get("summary_row")
    if summary_cfg:
        match_col = summary_cfg.get("match_col")
        match_val = summary_cfg.get("match_val", "Tổng")
        p_col = summary_cfg.get("total_principal")
        i_col = summary_cfg.get("total_interest")
        for row in rows:
            c_val = normalize_whitespace(_get_row_cell(row, match_col))
            if c_val == match_val:
                if p_col:
                    total_principal_amount = clean_currency(_get_row_cell(row, p_col))
                if i_col:
                    total_interest_amount = clean_currency(_get_row_cell(row, i_col))
                total_payable_amount = total_principal_amount + total_interest_amount
                break

    # 2. Bóc tách danh sách các dòng khoản vay (Dynamic Grid Extraction)
    grid = t_cfg.get("grid_boundaries", {})
    data_start = max(0, grid.get("data_start_row", 1) - 1)
    stop_cfg = grid.get("stop_condition", {})
    cols = t_cfg.get("column_mappings", {})

    stop_col = stop_cfg.get("col")
    stop_equals = stop_cfg.get("equals")
    stop_empty = stop_cfg.get("empty", False)

    items: List[Dict[str, Any]] = []
    calculated_principal = Decimal("0.00")

    for r_idx in range(data_start, len(rows)):
        row = rows[r_idx]
        if not any(row):
            continue

        raw_contract = _get_row_cell(row, cols.get("contract_number"))
        contract_number = normalize_whitespace(raw_contract)

        # Kiểm tra điều kiện dừng
        if stop_col:
            val_at_stop = normalize_whitespace(_get_row_cell(row, stop_col))
            if stop_equals and val_at_stop == stop_equals:
                break
            if stop_empty and not val_at_stop:
                continue

        if not contract_number or contract_number == "Tổng":
            continue

        # Bỏ qua các dòng tiêu đề phụ/phần tử không hợp lệ đối với mẫu số hợp đồng chỉ gồm số
        if template_code == "CTG_LOAN_XLS" and not re.match(r"^\d+$", contract_number):
            continue

        disbursement_date = _parse_flexible_date(_get_row_cell(row, cols.get("disbursement_date")))
        maturity_date = _parse_flexible_date(_get_row_cell(row, cols.get("maturity_date")))
        term = normalize_whitespace(_get_row_cell(row, cols.get("term"))) if cols.get("term") else None
        interest_rate = _clean_rate(_get_row_cell(row, cols.get("interest_rate")))
        debt_group = normalize_whitespace(_get_row_cell(row, cols.get("debt_group"))) or "1"
        loan_purpose = normalize_whitespace(_get_row_cell(row, cols.get("loan_purpose"))) or "Vay vốn sản xuất kinh doanh"
        currency = normalize_whitespace(_get_row_cell(row, cols.get("currency"))) or "VND"

        principal_balance = clean_currency(_get_row_cell(row, cols.get("principal_balance")))
        principal_balance_vnd = (
            clean_currency(_get_row_cell(row, cols.get("principal_balance_vnd")))
            if cols.get("principal_balance_vnd")
            else principal_balance
        )
        accrued_interest = (
            clean_currency(_get_row_cell(row, cols.get("accrued_interest")))
            if cols.get("accrued_interest")
            else Decimal("0.00")
        )

        # Trích xuất nghĩa vụ trả nợ kỳ tới:
        if cols.get("total_repayment_amount"):
            # Mẫu hợp nhất ngày và tổng tiền phải trả (như CTG)
            next_repayment_date = _parse_flexible_date(_get_row_cell(row, cols.get("next_repayment_date")))
            total_repayment = clean_currency(_get_row_cell(row, cols.get("total_repayment_amount")))
            next_prin_date = next_repayment_date
            next_prin_amount = Decimal("0.00")
            next_int_date = next_repayment_date
            next_int_amount = total_repayment
            total_due = total_repayment
        else:
            # Mẫu tách biệt gốc và lãi (như MB)
            next_prin_amount = clean_currency(_get_row_cell(row, cols.get("next_principal_amount")))
            next_prin_date = _parse_flexible_date(_get_row_cell(row, cols.get("next_principal_due_date")))
            next_int_amount = clean_currency(_get_row_cell(row, cols.get("next_interest_amount")))
            next_int_date = _parse_flexible_date(_get_row_cell(row, cols.get("next_interest_due_date")))
            total_due = next_prin_amount + next_int_amount

        calculated_principal += principal_balance

        items.append({
            "contract_number": contract_number,
            "disbursement_date": disbursement_date,
            "maturity_date": maturity_date,
            "term": term,
            "interest_rate": interest_rate,
            "debt_group": debt_group,
            "loan_purpose": loan_purpose,
            "principal_balance": principal_balance,
            "principal_balance_vnd": principal_balance_vnd or principal_balance,
            "accrued_interest": accrued_interest,
            "next_principal_due_date": next_prin_date,
            "next_principal_amount": next_prin_amount,
            "next_interest_due_date": next_int_date,
            "next_interest_amount": next_int_amount,
            "total_due_amount": total_due,
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
