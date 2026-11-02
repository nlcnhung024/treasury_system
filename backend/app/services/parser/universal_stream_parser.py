import io
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import openpyxl
import openpyxl.utils
import xlrd

from app.services.cleansing_service import (
    clean_currency,
    parse_iso_datetime,
    parse_iso_date,
    normalize_whitespace,
    normalize_description,
    resolve_counter_party,
)
from app.services.parser.template_detector import detect_bank_template, load_templates_config
from app.services.reconciler import reconcile_statement, ReconciliationResult


@dataclass
class ParsedStatementPackage:
    template_code: str
    bank_code: str
    bank_name: str
    account_number: str
    account_holder: str
    tax_code: Optional[str]
    account_type: str  # "CORPORATE" | "SPECIAL_CASH"
    currency: str
    period_start: Optional[date]
    period_end: Optional[date]
    transactions: List[Dict[str, Any]]
    reconciliation: ReconciliationResult


def _col_to_idx(col_letter: str) -> int:
    """Chuyển chữ cái cột Excel ('A' -> 0, 'B' -> 1, ...)"""
    return openpyxl.utils.column_index_from_string(col_letter.upper()) - 1


def _get_row_cell(row_values: List[Any], col_letter: Optional[str]) -> Any:
    if not col_letter:
        return None
    idx = _col_to_idx(col_letter)
    if 0 <= idx < len(row_values):
        return row_values[idx]
    return None


def _cell_as_clean_int_or_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return normalize_whitespace(val)


def _load_sheet_rows(file_bytes: bytes, file_format: str, sheet_index: int = 0) -> List[List[Any]]:
    """
    Đọc các dòng của Sheet theo luồng (Streaming iter_rows đối với XLSX và sheet_by_index đối với XLS).
    """
    rows: List[List[Any]] = []
    if file_format == "XLSX":
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        try:
            ws = wb.worksheets[sheet_index]
            max_c = min(30, ws.max_column)
            for r_idx in range(1, ws.max_row + 1):
                rows.append([ws.cell(r_idx, c_idx).value for c_idx in range(1, max_c + 1)])
        finally:
            wb.close()
    elif file_format == "XLS":
        wb = xlrd.open_workbook(file_contents=file_bytes)
        ws = wb.sheet_by_index(sheet_index)
        for r_idx in range(ws.nrows):
            rows.append([ws.cell_value(r_idx, c_idx) for c_idx in range(ws.ncols)])
    else:
        raise ValueError(f"Chưa hỗ trợ định dạng '{file_format}'.")
    return rows


def _get_cell_by_coord(rows: List[List[Any]], coord: str) -> Any:
    m = re.match(r"^([A-Za-z]+)(\d+)$", coord.strip())
    if not m:
        return None
    col_letter, row_num_str = m.group(1), m.group(2)
    r_idx = int(row_num_str) - 1
    c_idx = _col_to_idx(col_letter)
    if 0 <= r_idx < len(rows) and 0 <= c_idx < len(rows[r_idx]):
        return rows[r_idx][c_idx]
    return None


def _auto_discover_columns(
    header_row_values: List[Any], canonical_aliases: Dict[str, List[str]]
) -> Dict[str, str]:
    """
    Tự động ánh xạ cột qua từ điển canonical_header_aliases cho các ngân hàng mới (Zero-Code Onboarding).
    """
    discovered: Dict[str, str] = {}
    for c_idx, raw_header in enumerate(header_row_values):
        h_text = normalize_whitespace(raw_header).upper()
        if not h_text:
            continue
        col_letter = openpyxl.utils.get_column_letter(c_idx + 1)
        for field_name, aliases in canonical_aliases.items():
            if field_name in discovered:
                continue
            for alias in aliases:
                if alias.upper() in h_text:
                    discovered[field_name] = col_letter
                    break
    return discovered


def parse_statement_file(
    file_source: Union[bytes, Path, str],
    filename: str = "",
    hint_template_code: Optional[str] = None,
    account_opening_balance: Decimal = Decimal("0.00"),
) -> ParsedStatementPackage:
    """
    Động cơ Universal Stream Parser:
    1. Tự động nhận diện mẫu sao kê (TemplateDetector).
    2. Trích xuất động Siêu dữ liệu Pháp nhân & Kỳ sao kê (Entity-Agnostic).
    3. Bóc tách dòng giao dịch (xử lý Merged Cells, dòng trống xen kẽ, điều kiện dừng).
    4. Thực thi Đối soát 5 chế độ (MODE_1 -> MODE_5) và sinh mã băm chống trùng 6 thành phần.
    """
    if isinstance(file_source, (Path, str)):
        path_obj = Path(file_source)
        file_bytes = path_obj.read_bytes()
        if not filename:
            filename = path_obj.name
    else:
        file_bytes = file_source

    template_code, t_cfg = detect_bank_template(
        file_bytes, filename=filename, hint_template_code=hint_template_code
    )
    file_format = t_cfg.get("file_format", "XLSX").upper()
    number_format = t_cfg.get("number_format", "RAW_OR_US_COMMA")
    reconciliation_mode = t_cfg.get("reconciliation_mode", "MODE_1_FULL_HEADER_FOOTER")
    skip_empty_rows = bool(t_cfg.get("skip_empty_rows", False))
    sheet_idx = int(t_cfg.get("target_sheet_index", 0))

    rows = _load_sheet_rows(file_bytes, file_format, sheet_index=sheet_idx)

    grid = t_cfg.get("grid_boundaries", {})
    header_row_num = int(grid.get("header_row", 1))
    data_start_row_num = int(grid.get("data_start_row", header_row_num + 1))
    stop_cond = grid.get("stop_condition", {})

    col_map: Dict[str, str] = dict(t_cfg.get("column_mappings", {}))
    if not col_map and 0 <= header_row_num - 1 < len(rows):
        full_cfg = load_templates_config()
        col_map = _auto_discover_columns(
            rows[header_row_num - 1], full_cfg.get("canonical_header_aliases", {})
        )

    # 1. Duyệt các dòng dữ liệu giao dịch từ data_start_row_num
    transactions: List[Dict[str, Any]] = []
    stop_row_idx: Optional[int] = None

    for r_idx in range(data_start_row_num - 1, len(rows)):
        row_vals = rows[r_idx]

        # Kiểm tra điều kiện dừng (Stop Condition) trước
        if stop_cond:
            sc_col = stop_cond.get("col")
            sc_raw = _get_row_cell(row_vals, sc_col)
            sc_str = _cell_as_clean_int_or_str(sc_raw)

            if "equals" in stop_cond:
                if sc_str.upper() == normalize_whitespace(stop_cond["equals"]).upper():
                    stop_row_idx = r_idx
                    break
            elif "contains" in stop_cond:
                if normalize_whitespace(stop_cond["contains"]).upper() in sc_str.upper():
                    stop_row_idx = r_idx
                    break
            elif "empty_or_contains" in stop_cond:
                target_sub = normalize_whitespace(stop_cond["empty_or_contains"]).upper()
                if not sc_str or target_sub in sc_str.upper():
                    stop_row_idx = r_idx
                    break
            elif "not_regex" in stop_cond:
                pattern = stop_cond["not_regex"]
                if not re.match(pattern, sc_str):
                    stop_row_idx = r_idx
                    break

        # Kiểm tra dòng trống hoàn toàn (ví dụ: MBB_PERSONAL_XLSX có các dòng trống xen kẽ)
        if all(v is None or normalize_whitespace(v) == "" for v in row_vals):
            if skip_empty_rows:
                continue
            else:
                stop_row_idx = r_idx
                break

        # Nếu có cột STT và skip_empty_rows=True, bỏ qua dòng nếu ô ngày giao dịch rỗng
        raw_tx_date = _get_row_cell(row_vals, col_map.get("transaction_date"))
        raw_val_date = _get_row_cell(row_vals, col_map.get("value_date"))
        if (raw_tx_date is None or normalize_whitespace(raw_tx_date) == "") and (
            raw_val_date is None or normalize_whitespace(raw_val_date) == ""
        ):
            if skip_empty_rows:
                continue
            else:
                stop_row_idx = r_idx
                break

        tx_dt = parse_iso_datetime(raw_tx_date, fallback_value=raw_val_date)
        val_date = parse_iso_date(raw_val_date, fallback_dt=tx_dt)

        raw_debit = _get_row_cell(row_vals, col_map.get("debit_amount"))
        raw_credit = _get_row_cell(row_vals, col_map.get("credit_amount"))
        debit_amt = clean_currency(raw_debit, number_format=number_format)
        credit_amt = clean_currency(raw_credit, number_format=number_format)

        raw_bal = _get_row_cell(row_vals, col_map.get("running_balance"))
        running_bal = (
            clean_currency(raw_bal, number_format=number_format)
            if col_map.get("running_balance") is not None
            else Decimal("0.00")
        )

        raw_ref = _get_row_cell(row_vals, col_map.get("reference_number"))
        ref_no = normalize_whitespace(raw_ref) if raw_ref is not None else None
        if ref_no == "":
            ref_no = None

        raw_cp = _get_row_cell(row_vals, col_map.get("counterparty_name"))
        raw_main_desc = _get_row_cell(row_vals, col_map.get("description"))

        desc = normalize_description(
            main_desc=raw_main_desc,
            counterparty_name=raw_cp,
            counterparty_account=_get_row_cell(row_vals, col_map.get("counterparty_account")),
            counterparty_bank=_get_row_cell(row_vals, col_map.get("counterparty_bank")),
            virtual_account=_get_row_cell(row_vals, col_map.get("virtual_account")),
        )

        transactions.append(
            {
                "transaction_date": tx_dt,
                "value_date": val_date,
                "reference_number": ref_no,
                "raw_counter_party": raw_cp,
                "raw_main_desc": raw_main_desc,
                "description": desc,
                "debit_amount": debit_amt,
                "credit_amount": credit_amt,
                "running_balance": running_bal,
            }
        )

    # 2. Trích xuất Metadata Header & Footer (account_number, account_holder, tax_code, balances...)
    meta_cfg: Dict[str, Dict[str, Any]] = t_cfg.get("metadata_extractors", {})
    extracted_meta: Dict[str, Any] = {}

    for field_name, rule in meta_cfg.items():
        raw_val: Any = None
        if "cell" in rule:
            raw_val = _get_cell_by_coord(rows, rule["cell"])
        elif "row_anchor" in rule and stop_row_idx is not None:
            anchor = rule["row_anchor"]
            target_r = stop_row_idx if anchor == "TOTAL_ROW" else stop_row_idx + 1
            if 0 <= target_r < len(rows):
                raw_val = _get_row_cell(rows[target_r], rule.get("col"))
        elif "row_label_col" in rule:
            lbl_col = rule["row_label_col"]
            lbl_sub = normalize_whitespace(rule.get("label_contains", "")).upper()
            val_col = rule["value_col"]
            search_start = stop_row_idx if stop_row_idx is not None else 0
            for r_i in range(search_start, len(rows)):
                cell_lbl = normalize_whitespace(_get_row_cell(rows[r_i], lbl_col)).upper()
                if lbl_sub in cell_lbl:
                    raw_val = _get_row_cell(rows[r_i], val_col)
                    break

        if raw_val is None:
            extracted_meta[field_name] = None
            continue

        # Áp dụng regex nếu có
        matched_str: Optional[str] = None
        if "regex" in rule:
            raw_text = str(raw_val).strip()
            m = re.search(rule["regex"], raw_text, flags=re.IGNORECASE | re.MULTILINE)
            if not m:
                norm_text = normalize_whitespace(raw_val)
                m = re.search(rule["regex"], norm_text, flags=re.IGNORECASE)
            if m:
                matched_str = m.group(1).strip() if m.lastindex else m.group(0).strip()
        else:
            matched_str = str(raw_val).strip()

        if field_name in ("opening_balance", "closing_balance", "total_debit", "total_credit"):
            # Với trường số tiền, ưu tiên dùng giá trị số nguyên bản nếu là int/float
            if isinstance(raw_val, (int, float, Decimal)) and "regex" not in rule:
                extracted_meta[field_name] = clean_currency(raw_val, number_format=number_format)
            elif matched_str is not None and matched_str != "":
                # Đối với Header SHB dùng US comma dù bảng dùng BIFF8_NUMERIC_OR_VN_DOT
                fmt_to_use = number_format
                extracted_meta[field_name] = clean_currency(matched_str, number_format=fmt_to_use)
            elif isinstance(raw_val, (int, float, Decimal)):
                extracted_meta[field_name] = clean_currency(raw_val, number_format=number_format)
            else:
                extracted_meta[field_name] = None
        elif field_name in ("period_start", "period_end"):
            extracted_meta[field_name] = parse_iso_date(matched_str) if matched_str else None
        else:
            extracted_meta[field_name] = normalize_whitespace(matched_str) if matched_str else None

    account_number = extracted_meta.get("account_number") or "UNKNOWN_ACCOUNT"
    account_holder = extracted_meta.get("account_holder") or "UNKNOWN_HOLDER"
    tax_code = extracted_meta.get("tax_code")
    currency = extracted_meta.get("currency") or "VND"

    # Phân loại tài khoản CORPORATE vs SPECIAL_CASH (TK cá nhân MBBank của CEO Nguyễn Thị Lan Anh)
    if template_code == "MBB_PERSONAL_XLSX" or account_number == "0869596789":
        account_type = "SPECIAL_CASH"
    else:
        account_type = "CORPORATE"

    # Chuẩn hóa đối tượng thụ hưởng hoặc đối tượng chuyển (counter_party)
    for tx in transactions:
        tx["counter_party"] = resolve_counter_party(
            raw_cp=tx.pop("raw_counter_party", None),
            main_desc=tx.pop("raw_main_desc", None),
            debit_amount=tx["debit_amount"],
            credit_amount=tx["credit_amount"],
            account_holder=account_holder,
        )

    # 3. Thực thi Đối soát 5 chế độ
    recon_result = reconcile_statement(
        reconciliation_mode=reconciliation_mode,
        account_number=account_number,
        transactions=transactions,
        metadata=extracted_meta,
        account_opening_balance=account_opening_balance,
    )

    return ParsedStatementPackage(
        template_code=template_code,
        bank_code=t_cfg.get("bank_code", "UNKNOWN"),
        bank_name=t_cfg.get("bank_name", "Ngân hàng Thương mại"),
        account_number=account_number,
        account_holder=account_holder,
        tax_code=tax_code,
        account_type=account_type,
        currency=currency,
        period_start=extracted_meta.get("period_start"),
        period_end=extracted_meta.get("period_end"),
        transactions=transactions,
        reconciliation=recon_result,
    )
