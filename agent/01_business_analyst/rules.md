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
