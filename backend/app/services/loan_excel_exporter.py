import io
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional, Dict, Any

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from app.core.security import sanitize_excel_cell


def build_contracts_summary_excel(
    items: List[Dict[str, Any]],
    company_name: Optional[str] = None,
    report_date: Optional[datetime] = None,
) -> io.BytesIO:
    """
    Tạo file Excel gồm 2 trang theo chuẩn kế toán chuyên nghiệp:
    - Trang 1 (Danh_Sach_Khe_Uoc): Bảng số liệu cột hàng chi tiết các khế ước nhận nợ còn hiệu lực.
    - Trang 2 (Pivot_Ngay_Den_Han): Bảng ma trận Pivot (Hàng: Ngày đến hạn, Cột: Ngân hàng),
      có header báo cáo quản trị chuyên nghiệp, ghi rõ tên nội dung và ngày báo cáo.
    """
    if report_date is None:
        report_date = datetime.now()

    report_date_str = report_date.strftime("%d/%m/%Y")
    corp_name = company_name or "CÔNG TY CỔ PHẦN XI MĂNG SUNRISE"

    wb = openpyxl.Workbook()

    # Styling constants
    font_family = "Calibri"
    navy_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name=font_family, size=10, bold=True, color="FFFFFF")
    data_font = Font(name=font_family, size=10, color="0F172A")
    bold_data_font = Font(name=font_family, size=10, bold=True, color="0F172A")
    total_font = Font(name=font_family, size=10, bold=True, color="1E3A8A")
    
    total_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    subtle_row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )
    total_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="double", color="0F172A"),
    )

    currency_fmt = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)'
    rate_fmt = '0.00%'

    # =========================================================================
    # TRANG 1: BẢNG SỐ LIỆU CỘT HÀNG (DANH SÁCH KHẾ ƯỚC CHI TIẾT)
    # =========================================================================
    ws_data = wb.active
    ws_data.title = "Danh_Sach_Khe_Uoc"
    ws_data.views.sheetView[0].showGridLines = True

    data_headers = [
        "STT",
        "Ngân hàng",
        "Số khế ước",
        "Chủ thể vay",
        "Dư nợ gốc (VNĐ)",
        "Tổng gốc đã trả (VNĐ)",
        "Dư nợ hiện tại (VNĐ)",
        "Lãi suất (%/năm)",
        "Tiền lãi ước tính (VNĐ)",
        "Tiền lãi đã trả (VNĐ)",
        "Ngày giải ngân",
        "Ngày đến hạn",
        "Tình trạng hóa đơn",
        "Mục đích / Ghi chú",
    ]

    ws_data.row_dimensions[1].height = 28
    for col_idx, h_text in enumerate(data_headers, start=1):
        c = ws_data.cell(row=1, column=col_idx, value=h_text)
        c.fill = navy_header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    invoice_status_map = {
        "FULLY_SECURED": "Đủ HĐ (100%)",
        "UNDER_SECURED": "Thiếu HĐ",
        "OVER_SECURED": "Thừa HĐ",
        "NO_INVOICE": "Chưa có HĐ",
    }

    curr_row = 2
    for idx, item in enumerate(items, start=1):
        ws_data.row_dimensions[curr_row].height = 20
        row_fill = subtle_row_fill if (idx % 2 == 1) else None

        orig_bal = float(item.get("original_principal_balance") or 0)
        repaid_prin = float(item.get("total_principal_paid") or 0)
        cur_bal = float(item.get("current_principal_balance") or 0)
        
        # Lãi suất: nếu dạng phần trăm 11.2 thì chia 100 để hiển thị định dạng 11.20%
        raw_rate = float(item.get("interest_rate") or 0)
        rate_val = raw_rate / 100.0 if raw_rate > 1.0 else raw_rate

        est_int = float(item.get("estimated_interest") or 0)
        paid_int = float(item.get("total_interest_paid") or 0)

        disb_str = item.get("disbursement_date")
        disb_val = ""
        if disb_str:
            try:
                disb_val = datetime.strptime(disb_str[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
            except Exception:
                disb_val = disb_str

        mat_str = item.get("maturity_date")
        mat_val = ""
        if mat_str:
            try:
                mat_val = datetime.strptime(mat_str[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
            except Exception:
                mat_val = mat_str

        inv_status = invoice_status_map.get(item.get("invoice_reconciliation_status") or "", item.get("invoice_reconciliation_status") or "-")
        note = item.get("loan_purpose") or item.get("note") or ""

        row_vals = [
            (idx, Alignment(horizontal="center", vertical="center"), None, None),
            (sanitize_excel_cell(item.get("bank_name") or item.get("bank_code") or ""), Alignment(horizontal="left", vertical="center"), None, None),
            (sanitize_excel_cell(item.get("contract_number") or ""), Alignment(horizontal="center", vertical="center"), "@", None),
            (sanitize_excel_cell(item.get("borrower_name") or ""), Alignment(horizontal="left", vertical="center"), None, None),
            (orig_bal, Alignment(horizontal="right", vertical="center"), currency_fmt, None),
            (repaid_prin, Alignment(horizontal="right", vertical="center"), currency_fmt, None),
            (cur_bal, Alignment(horizontal="right", vertical="center"), currency_fmt, None),
            (rate_val, Alignment(horizontal="right", vertical="center"), rate_fmt, None),
            (est_int, Alignment(horizontal="right", vertical="center"), currency_fmt, None),
            (paid_int, Alignment(horizontal="right", vertical="center"), currency_fmt, None),
            (disb_val, Alignment(horizontal="center", vertical="center"), None, None),
            (mat_val, Alignment(horizontal="center", vertical="center"), None, None),
            (inv_status, Alignment(horizontal="center", vertical="center"), None, None),
            (sanitize_excel_cell(note), Alignment(horizontal="left", vertical="center"), None, None),
        ]

        for col_idx, (val, align, num_fmt, f_override) in enumerate(row_vals, start=1):
            cell = ws_data.cell(row=curr_row, column=col_idx, value=val)
            cell.font = f_override or data_font
            cell.alignment = align
            if num_fmt:
                cell.number_format = num_fmt
            if row_fill:
                cell.fill = row_fill
            cell.border = thin_border

        curr_row += 1

    # Dòng tổng cộng Trang 1
    total_row = curr_row
    ws_data.row_dimensions[total_row].height = 24
    ws_data.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=4)
    tot_label = ws_data.cell(row=total_row, column=1, value="TỔNG CỘNG")
    tot_label.font = total_font
    tot_label.alignment = Alignment(horizontal="center", vertical="center")

    for col_idx in range(1, len(data_headers) + 1):
        cell = ws_data.cell(row=total_row, column=col_idx)
        cell.fill = total_fill
        cell.border = total_border

    # Gán công thức SUM cho các cột số tiền
    sum_cols = {
        5: f"=SUM(E2:E{total_row - 1})",
        6: f"=SUM(F2:F{total_row - 1})",
        7: f"=SUM(G2:G{total_row - 1})",
        9: f"=SUM(I2:I{total_row - 1})",
        10: f"=SUM(J2:J{total_row - 1})",
    }
    for col_idx, formula in sum_cols.items():
        c = ws_data.cell(row=total_row, column=col_idx, value=formula)
        c.font = total_font
        c.alignment = Alignment(horizontal="right", vertical="center")
        c.number_format = currency_fmt
        c.border = total_border

    # Tự động căn chỉnh độ rộng cột Trang 1
    for col in ws_data.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        header_val = str(col[0].value or "")
        for cell in col:
            val_str = str(cell.value or "")
            if cell.number_format == currency_fmt and isinstance(cell.value, (int, float)):
                val_str = f"{cell.value:,.0f}"
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws_data.column_dimensions[col_letter].width = max(max_len + 3, len(header_val) + 3, 12)

    ws_data.column_dimensions["A"].width = 7
    ws_data.column_dimensions["B"].width = 18
    ws_data.column_dimensions["C"].width = 22
    ws_data.column_dimensions["D"].width = 34

    # =========================================================================
    # TRANG 2: PIVOT DỰA TRÊN BẢNG SỐ LIỆU (HÀNG: NGÀY ĐẾN HẠN, CỘT: NGÂN HÀNG)
    # =========================================================================
    ws_pivot = wb.create_sheet(title="Pivot_Ngay_Den_Han")
    ws_pivot.views.sheetView[0].showGridLines = True

    # 1. Trích xuất danh sách ngân hàng duy nhất
    bank_set = set()
    for item in items:
        b_name = item.get("bank_name") or item.get("bank_code") or "Khác"
        bank_set.add(b_name.strip())
    
    # Sắp xếp danh sách ngân hàng ổn định
    banks = sorted(list(bank_set))
    if not banks:
        banks = ["Chưa xác định NH"]

    # 2. Nhóm dữ liệu theo ngày đến hạn (Maturity Date) và ngân hàng
    # Key: (sort_key, date_display)
    pivot_data: Dict[str, Dict[str, Decimal]] = {}
    date_sort_keys: Dict[str, date] = {}

    for item in items:
        m_date_str = item.get("maturity_date")
        b_name = (item.get("bank_name") or item.get("bank_code") or "Khác").strip()
        cur_bal = Decimal(str(item.get("current_principal_balance") or 0))

        if m_date_str:
            try:
                d_obj = datetime.strptime(m_date_str[:10], "%Y-%m-%d").date()
                d_key = d_obj.strftime("%d/%m/%Y")
            except Exception:
                d_obj = date(2099, 12, 31)
                d_key = str(m_date_str)
        else:
            d_obj = date(2099, 12, 31)
            d_key = "Chưa xác định"

        if d_key not in pivot_data:
            pivot_data[d_key] = {}
            date_sort_keys[d_key] = d_obj

        pivot_data[d_key][b_name] = pivot_data[d_key].get(b_name, Decimal("0")) + cur_bal

    # Sắp xếp ngày đến hạn theo thứ tự thời gian tăng dần
    sorted_date_keys = sorted(pivot_data.keys(), key=lambda k: date_sort_keys[k])

    num_cols = 2 + len(banks) + 1  # STT + Ngày đến hạn + 各 ngân hàng + Tổng cộng
    last_col_letter = get_column_letter(num_cols)
    last_bank_col_letter = get_column_letter(num_cols - 1)

    # 3. HEADER BÁO CÁO CHUYÊN NGHIỆP TRANG 2
    ws_pivot.row_dimensions[1].height = 18
    ws_pivot.cell(row=1, column=1, value=sanitize_excel_cell(f"ĐƠN VỊ: {corp_name}")).font = Font(
        name=font_family, size=10, bold=True, color="334155"
    )

    ws_pivot.row_dimensions[2].height = 16
    ws_pivot.cell(
        row=2,
        column=1,
        value="BỘ PHẬN: PHÒNG TÀI CHÍNH KẾ TOÁN - BỘ PHẬN QUẢN TRỊ VỐN & TÍN DỤNG",
    ).font = Font(name=font_family, size=9, italic=True, color="64748B")

    # Dòng tiêu đề báo cáo
    ws_pivot.row_dimensions[4].height = 28
    ws_pivot.merge_cells(start_row=4, start_column=1, end_row=4, end_column=num_cols)
    p_title = ws_pivot.cell(
        row=4,
        column=1,
        value="BÁO CÁO THỐNG KÊ KHẾ ƯỚC NHẬN NỢ CÒN HIỆU LỰC THEO NGÀY ĐẾN HẠN",
    )
    p_title.font = Font(name=font_family, size=14, bold=True, color="1E3A8A")
    p_title.alignment = Alignment(horizontal="center", vertical="center")

    # Dòng thông tin ngày báo cáo
    ws_pivot.row_dimensions[5].height = 20
    ws_pivot.merge_cells(start_row=5, start_column=1, end_row=5, end_column=num_cols)
    p_sub = ws_pivot.cell(
        row=5,
        column=1,
        value=f"Ngày lập báo cáo: {report_date_str}  |  Đơn vị tiền tệ: VNĐ  |  Nguồn: Chi tiết khế ước còn hiệu lực",
    )
    p_sub.font = Font(name=font_family, size=10, italic=True, color="475569")
    p_sub.alignment = Alignment(horizontal="center", vertical="center")

    # 4. HEADER BẢNG PIVOT (ROW 7)
    pivot_header_row = 7
    ws_pivot.row_dimensions[pivot_header_row].height = 28

    pivot_headers = ["STT", "Ngày đến hạn"] + banks + ["Tổng cộng"]
    for col_idx, h_text in enumerate(pivot_headers, start=1):
        c = ws_pivot.cell(row=pivot_header_row, column=col_idx, value=h_text)
        c.fill = navy_header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    # 5. DỮ LIỆU BẢNG PIVOT
    curr_pivot_row = 8
    for idx, d_key in enumerate(sorted_date_keys, start=1):
        ws_pivot.row_dimensions[curr_pivot_row].height = 20
        row_fill = subtle_row_fill if (idx % 2 == 1) else None

        # STT
        c_stt = ws_pivot.cell(row=curr_pivot_row, column=1, value=idx)
        c_stt.font = data_font
        c_stt.alignment = Alignment(horizontal="center", vertical="center")
        c_stt.border = thin_border
        if row_fill:
            c_stt.fill = row_fill

        # Ngày đến hạn
        c_date = ws_pivot.cell(row=curr_pivot_row, column=2, value=d_key)
        c_date.font = bold_data_font
        c_date.alignment = Alignment(horizontal="center", vertical="center")
        c_date.border = thin_border
        if row_fill:
            c_date.fill = row_fill

        # Các cột ngân hàng
        bank_amounts = pivot_data.get(d_key, {})
        for b_idx, b_name in enumerate(banks, start=3):
            val = float(bank_amounts.get(b_name, Decimal("0")))
            c_bank = ws_pivot.cell(row=curr_pivot_row, column=b_idx, value=val)
            c_bank.font = data_font
            c_bank.alignment = Alignment(horizontal="right", vertical="center")
            c_bank.number_format = currency_fmt
            c_bank.border = thin_border
            if row_fill:
                c_bank.fill = row_fill

        # Cột Tổng cộng hàng ngang
        sum_formula = f"=SUM(C{curr_pivot_row}:{last_bank_col_letter}{curr_pivot_row})"
        c_row_tot = ws_pivot.cell(row=curr_pivot_row, column=num_cols, value=sum_formula)
        c_row_tot.font = bold_data_font
        c_row_tot.alignment = Alignment(horizontal="right", vertical="center")
        c_row_tot.number_format = currency_fmt
        c_row_tot.border = thin_border
        if row_fill:
            c_row_tot.fill = row_fill

        curr_pivot_row += 1

    # 6. DÒNG TỔNG CỘNG CỦA BẢNG PIVOT
    pivot_total_row = curr_pivot_row
    ws_pivot.row_dimensions[pivot_total_row].height = 24

    ws_pivot.merge_cells(start_row=pivot_total_row, start_column=1, end_row=pivot_total_row, end_column=2)
    p_tot_label = ws_pivot.cell(row=pivot_total_row, column=1, value="TỔNG CỘNG")
    p_tot_label.font = total_font
    p_tot_label.alignment = Alignment(horizontal="center", vertical="center")

    for col_idx in range(1, num_cols + 1):
        cell = ws_pivot.cell(row=pivot_total_row, column=col_idx)
        cell.fill = total_fill
        cell.border = total_border

    # Gán công thức SUM theo từng cột ngân hàng
    data_start_row = 8
    data_end_row = pivot_total_row - 1
    for col_idx in range(3, num_cols + 1):
        col_let = get_column_letter(col_idx)
        c = ws_pivot.cell(
            row=pivot_total_row,
            column=col_idx,
            value=f"=SUM({col_let}{data_start_row}:{col_let}{data_end_row})",
        )
        c.font = total_font
        c.alignment = Alignment(horizontal="right", vertical="center")
        c.number_format = currency_fmt
        c.border = total_border

    # 7. PHẦN CHỮ KÝ PHÊ DUYỆT BÁO CÁO CUỐI TRANG 2
    sig_row_title = pivot_total_row + 3
    sig_row_desc = sig_row_title + 1

    ws_pivot.row_dimensions[sig_row_title].height = 20
    ws_pivot.row_dimensions[sig_row_desc].height = 18

    # Cột Trái: Người lập biểu
    ws_pivot.cell(row=sig_row_title, column=2, value="Người lập biểu").font = Font(
        name=font_family, size=10, bold=True, color="1E293B"
    )
    ws_pivot.cell(row=sig_row_title, column=2).alignment = Alignment(horizontal="center", vertical="center")
    ws_pivot.cell(row=sig_row_desc, column=2, value="(Ký, ghi rõ họ tên)").font = Font(
        name=font_family, size=9, italic=True, color="64748B"
    )
    ws_pivot.cell(row=sig_row_desc, column=2).alignment = Alignment(horizontal="center", vertical="center")

    # Cột Giữa: Kế toán trưởng
    mid_col = max(3, num_cols // 2 + 1)
    ws_pivot.cell(row=sig_row_title, column=mid_col, value="Kế toán trưởng").font = Font(
        name=font_family, size=10, bold=True, color="1E293B"
    )
    ws_pivot.cell(row=sig_row_title, column=mid_col).alignment = Alignment(horizontal="center", vertical="center")
    ws_pivot.cell(row=sig_row_desc, column=mid_col, value="(Ký, ghi rõ họ tên)").font = Font(
        name=font_family, size=9, italic=True, color="64748B"
    )
    ws_pivot.cell(row=sig_row_desc, column=mid_col).alignment = Alignment(horizontal="center", vertical="center")

    # Cột Phải: Giám đốc tài chính
    ws_pivot.cell(row=sig_row_title, column=num_cols, value="Giám đốc Tài chính").font = Font(
        name=font_family, size=10, bold=True, color="1E293B"
    )
    ws_pivot.cell(row=sig_row_title, column=num_cols).alignment = Alignment(horizontal="center", vertical="center")
    ws_pivot.cell(row=sig_row_desc, column=num_cols, value="(Ký, đóng dấu)").font = Font(
        name=font_family, size=9, italic=True, color="64748B"
    )
    ws_pivot.cell(row=sig_row_desc, column=num_cols).alignment = Alignment(horizontal="center", vertical="center")

    # Tự động căn chỉnh độ rộng cột Trang 2
    ws_pivot.column_dimensions["A"].width = 7
    ws_pivot.column_dimensions["B"].width = 16
    for b_idx in range(3, num_cols):
        col_let = get_column_letter(b_idx)
        bank_title = str(ws_pivot.cell(row=pivot_header_row, column=b_idx).value or "")
        ws_pivot.column_dimensions[col_let].width = max(len(bank_title) + 5, 20)
    ws_pivot.column_dimensions[last_col_letter].width = 22

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
