import io
import re
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, Union
import openpyxl
import openpyxl.utils
import xlrd
import yaml
from app.services.cleansing_service import normalize_whitespace

CONFIG_PATH = Path(__file__).parent / "bank_templates_config.yaml"

XLSX_MAGIC = b"\x50\x4b\x03\x04"
XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def load_templates_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    target = config_path or CONFIG_PATH
    with open(target, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def detect_physical_format(file_bytes: bytes, filename: str = "") -> str:
    """
    Xác thực định dạng vật lý 2 lớp qua Magic Bytes nhị phân.
    """
    if file_bytes.startswith(XLSX_MAGIC):
        return "XLSX"
    if file_bytes.startswith(XLS_MAGIC):
        return "XLS"
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        return "CSV"
    raise ValueError(
        f"Định dạng vật lý không hợp lệ cho file '{filename}'. Chỉ chấp nhận .xlsx (OOXML) hoặc .xls (BIFF8)."
    )


def extract_preview_cells(file_bytes: bytes, file_format: str, max_rows: int = 26) -> Dict[str, str]:
    """
    Quét nhanh 26 dòng đầu tiên của Sheet đầu tiên để lấy từ điển tọa độ ô (VD: 'C1', 'H3', 'A25').
    """
    cells: Dict[str, str] = {}
    if file_format == "XLSX":
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        try:
            ws = wb.worksheets[0]
            limit_r = min(max_rows, ws.max_row)
            limit_c = min(30, ws.max_column)
            for r_idx in range(1, limit_r + 1):
                for c_idx in range(1, limit_c + 1):
                    val = ws.cell(r_idx, c_idx).value
                    if val is not None:
                        s_val = normalize_whitespace(val)
                        if s_val:
                            col_letter = openpyxl.utils.get_column_letter(c_idx)
                            cells[f"{col_letter}{r_idx}"] = s_val
        finally:
            wb.close()
    elif file_format == "XLS":
        wb = xlrd.open_workbook(file_contents=file_bytes)
        ws = wb.sheet_by_index(0)
        limit_r = min(max_rows, ws.nrows)
        for r_idx in range(limit_r):
            for c_idx in range(ws.ncols):
                val = ws.cell_value(r_idx, c_idx)
                if val is not None:
                    s_val = normalize_whitespace(val)
                    if s_val:
                        col_letter = openpyxl.utils.get_column_letter(c_idx + 1)
                        cells[f"{col_letter}{r_idx + 1}"] = s_val
    return cells


def detect_bank_template(
    file_source: Union[bytes, Path, str],
    filename: str = "",
    hint_template_code: Optional[str] = None,
    config_path: Optional[Path] = None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Nhận diện tự động 100% mẫu sao kê ngân hàng dựa trên Magic Bytes và Signature Rules trong 26 dòng đầu.
    Hoàn toàn độc lập với tên doanh nghiệp hay số tài khoản (Entity-Agnostic).
    """
    if isinstance(file_source, (Path, str)):
        path_obj = Path(file_source)
        file_bytes = path_obj.read_bytes()
        if not filename:
            filename = path_obj.name
    else:
        file_bytes = file_source

    file_format = detect_physical_format(file_bytes, filename)
    config = load_templates_config(config_path)
    templates: Dict[str, Dict[str, Any]] = config.get("templates", {})

    # Nếu chỉ định trực tiếp mã template hợp lệ và khớp định dạng vật lý
    if hint_template_code and hint_template_code in templates:
        t_cfg = templates[hint_template_code]
        if t_cfg.get("file_format", "").upper() == file_format:
            return hint_template_code, t_cfg

    preview_cells = extract_preview_cells(file_bytes, file_format, max_rows=26)

    for template_code, t_cfg in templates.items():
        if t_cfg.get("file_format", "").upper() != file_format:
            continue

        rules = t_cfg.get("detection_rules", [])
        if not rules:
            continue

        matched_all = True
        for rule in rules:
            cell_coord = rule.get("cell", "").upper()
            actual_val = preview_cells.get(cell_coord, "")
            if "contains" in rule:
                expected_sub = normalize_whitespace(rule["contains"]).upper()
                if expected_sub not in actual_val.upper():
                    matched_all = False
                    break
            elif "equals" in rule:
                expected_eq = normalize_whitespace(rule["equals"]).upper()
                if actual_val.upper() != expected_eq:
                    matched_all = False
                    break

        if matched_all:
            return template_code, t_cfg

    raise ValueError(
        f"Không nhận diện được mẫu sao kê ngân hàng phù hợp cho file '{filename}' (Định dạng: {file_format})."
    )
