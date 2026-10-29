# RULES KỸ THUẬT DÀNH RIÊNG CHO BUSINESS ANALYST (@BusinessAnalyst)

> **Tuân thủ bắt buộc:** BA phải tuân thủ [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) cho toàn bộ yêu cầu sản phẩm và [common_rules.md](../common_rules.md) cho các tiêu chuẩn chung.  
> **Phạm vi tài liệu này:** Chỉ quy định các tiêu chuẩn kỹ thuật về quy cách tài liệu, định dạng đặc tả và phương pháp mô hình hóa.

---

## 1. Tiêu chuẩn Định dạng & Cấu trúc Tài liệu (Specification Formatting)
- **Định dạng chuẩn:** Mọi tài liệu đặc tả phải viết bằng GitHub Flavored Markdown (GFM). Khi đặc tả cấu trúc dữ liệu hoặc ma trận cấu hình, bắt buộc dùng chuẩn YAML hoặc JSON Schema.
- **Quy chuẩn Từ điển Dữ liệu (Data Dictionary):** Khi mô tả bất kỳ trường dữ liệu nào, bảng đặc tả bắt buộc phải có đầy đủ các cột kỹ thuật sau:
  | Tên trường kỹ thuật | Tên hiển thị | Kiểu dữ liệu | Bắt buộc (Nullable) | Độ dài tối đa | Định dạng / Regex | Ví dụ |
  | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
  | `trans_date` | Ngày giao dịch | `DATETIME` | NOT NULL | - | `YYYY-MM-DD HH:mm:ss` | `2026-03-15 08:30:00` |
  | `amount` | Số tiền | `DECIMAL(18,2)` | NOT NULL | 18 | `^-?\d+(\.\d{1,2})?$` | `1500000.00` |

## 2. Tiêu chuẩn Đặc tả Tiêu chí Chấp nhận (Acceptance Criteria - Gherkin Syntax)
- Mọi User Story và ca sử dụng kỹ thuật BẮT BUỘC phải đi kèm Tiêu chí chấp nhận viết theo đúng cú pháp Gherkin chuẩn:
  ```gherkin
  Scenario: [Tên kịch bản kỹ thuật]
    Given [Điều kiện tiên quyết / Trạng thái hệ thống trước thực thi]
    When [Hành động kích hoạt từ người dùng hoặc hệ thống]
    Then [Kết quả đầu ra kỹ thuật mong đợi]
    And [Các ràng buộc dữ liệu hoặc trạng thái đi kèm]
  ```

## 3. Quy chuẩn Định danh & Truy vết Yêu cầu (Traceability Standard)
- Mọi yêu cầu kỹ thuật phải được gán mã định danh duy nhất (Unique ID) theo tiền tố module để phục vụ truy vết (Traceability Matrix):
  - `REQ-INGEST-xxx`: Phân hệ tiếp nhận và upload file.
  - `REQ-PARSE-xxx`: Phân hệ đọc mẫu và bóc tách dữ liệu.
  - `REQ-CLEAN-xxx`: Phân hệ làm sạch và chuẩn hóa.
  - `REQ-PERSIST-xxx`: Phân hệ lưu trữ CSDL và File.
  - `REQ-REPORT-xxx`: Phân hệ trích xuất báo cáo.

## 4. Nguyên tắc Không Mơ hồ (Zero-Ambiguity Rule)
- TUYỆT ĐỐI KHÔNG sử dụng các từ ngữ định tính, mơ hồ trong tài liệu kỹ thuật (ví dụ: *"xử lý nhanh"*, *"giao diện đẹp"*, *"file dung lượng vừa phải"*).
- BẮT BUỘC định lượng bằng con số kỹ thuật cụ thể (ví dụ: *"thời gian phản hồi API < 1.000ms"*, *"dung lượng file tối đa 25MB"*, *"sai số tính toán = 0"*).

## 5. Tiêu chuẩn Đặc tả Động cơ Quy tắc Tự quản lý (Self-Service Rule Specification Standard)
- Khi phân tích các phân hệ phân loại, gắn nhãn dữ liệu hoặc lọc giao dịch, BA **TUYỆT ĐỐI KHÔNG** đặc tả các bảng danh mục hay từ khóa cố định (hardcoded) trong mã nguồn.
- BẮT BUỘC phải đặc tả dưới dạng **Mô hình Quy tắc Cấu hình Động (Config-driven Rule Engine)** với đầy đủ các cấu phần kỹ thuật:
  - Cấu trúc điều kiện (Condition Schema): Cho phép kết hợp đa trường (`field`, `operator`, `value`, logic `AND`/`OR`).
  - Mức độ ưu tiên thực thi (`priority` dạng số nguyên tăng dần).
  - Trạng thái kích hoạt (`is_active: BOOLEAN`).
  - Hành động thực thi (`action_type`, `target_category_id`).

## 6. Tiêu chuẩn Đặc tả Cơ chế Khóa Ghi đè Thủ công (Manual Override & Immutability Standard)
- Khi đặc tả bất kỳ tính năng xử lý hàng loạt tự động (Batch Processing / Auto-categorization / Bulk Sync), BA BẮT BUỘC phải định nghĩa cơ chế bảo vệ thao tác người dùng:
  - Bắt buộc có cờ kỹ thuật khóa ghi đè: `is_manual_override: BOOLEAN DEFAULT FALSE`.
  - Tiêu chí chấp nhận (AC) bắt buộc: Khi người dùng thao tác thủ công (gán nhãn, sửa note), cờ này được set thành `TRUE`. Mọi tiến trình chạy lại quy tắc tự động (Re-apply batch rules) **TUYỆT ĐỐI KHÔNG** được phép cập nhật hoặc ghi đè lên các bản ghi có `is_manual_override = TRUE`.

## 7. Tiêu chuẩn Đặc tả Xuất Bảng tính Kế toán & Phòng chống Injection (Spreadsheet Export Standard)
- Khi đặc tả chức năng xuất dữ liệu ra file bảng tính (Excel `.xlsx` / CSV), bảng đặc tả kỹ thuật của BA bắt buộc phải quy định rõ:
  - Định dạng hiển thị ngày giờ chuẩn xác (`format: DD/MM/YYYY` hoặc `DD/MM/YYYY HH:mm:ss`).
  - Định dạng số tiền tệ kế toán có phân cách hàng nghìn (`format: #,##0.00` hoặc `#,##0`) và căn phải ô dữ liệu.
  - Hàng tổng cộng (Total Row) sử dụng công thức kế toán động (`SUBTOTAL` hoặc `SUM`).
  - Ràng buộc an toàn thông tin: Bắt buộc đặc tả quy tắc sanitize và escape dấu nháy đơn `'` cho các chuỗi bắt đầu bằng ký tự nguy hiểm (`=`, `+`, `-`, `@`) để triệt tiêu lỗ hổng Formula/CSV Injection.

## 8. Tiêu chuẩn Đặc tả Ma trận Ánh xạ Mở rộng & Đa Pháp nhân (Extensible & Multi-Entity Mapping Standard)
- **Khả năng mở rộng mẫu nguồn mới (Zero-Code Template Extensibility):**
  - Mọi ma trận ánh xạ dữ liệu phải được thiết kế theo kiến trúc **Declarative Config Schema** (YAML/JSON) tách rời hoàn toàn khỏi mã nguồn Parser, chuẩn hóa thành các khối cấu hình nguyên tử: nhận diện mẫu (`detection_rules`), trích xuất siêu dữ liệu (`metadata_extractors`), biên bảng dữ liệu (`grid_boundaries`), ánh xạ cột (`column_mappings`), quy cách định dạng số/ngày (`format_profiles`), và chế độ đối soát (`reconciliation_mode`).
  - Hỗ trợ cơ chế dò dòng tiêu đề động theo danh sách từ khóa đồng nghĩa (`header_aliases`) kết hợp tọa độ cột cố định để nạp thêm mẫu mới trong $\le 15$ phút mà không cần sửa mã nguồn.
- **Tính độc lập Pháp nhân / Đa Doanh nghiệp (Entity-Agnostic Template & Multi-Entity Isolation):**
  - Cấu hình mẫu ánh xạ (`template_config`) **TUYỆT ĐỐI KHÔNG** được gắn cứng (hardcode) với tên doanh nghiệp, mã số thuế hay số tài khoản cụ thể.
  - Phải phân tách rõ 2 tầng dữ liệu:
    1. **Tầng Cấu hình Mẫu (Global Shared Layer):** Dùng chung một mẫu bóc tách cho $N$ doanh nghiệp khác nhau.
    2. **Tầng Định danh & Cô lập Pháp nhân (Entity Resolution & Scoped Data Layer):** Trích xuất động `(account_number, account_holder, tax_code)` từ Header tài liệu để định tuyến và cô lập dữ liệu giao dịch, quy tắc phân loại và báo cáo theo từng doanh nghiệp (`company_id` / `entity_code`).
