# RULES KỸ THUẬT DÀNH RIÊNG CHO DATA PARSER & ETL ENGINEER (@DataParserEngineer)

> **Tuân thủ bắt buộc:** Data Engineer phải bám sát [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) và tuân thủ [common_rules.md](../common_rules.md).  
> **Phạm vi tài liệu này:** Quy định các ràng buộc kỹ thuật về quản lý bộ nhớ, đọc I/O stream, ép kiểu dữ liệu và thao tác cơ sở dữ liệu số lượng lớn.

---

## 1. Tiêu chuẩn Quản lý Bộ nhớ & Đọc Stream (Memory & Stream I/O)
- **Cấm Eager-Loading:** TUYỆT ĐỐI CẤM tải toàn bộ nội dung file Excel vào bộ nhớ RAM bằng các hàm load đầy đủ (như `openpyxl.load_workbook()` ở chế độ mặc định hoặc `pd.read_excel()` nguyên file) trên môi trường production.
- **Bắt buộc Stream / Read-Only Chunking:**
  - Trong Python: Bắt buộc dùng `openpyxl.load_workbook(filename, read_only=True, data_only=True)` hoặc các thư viện stream tương đương.
  - Trong Node.js: Bắt buộc dùng `exceljs` streaming reader hoặc `xlsx-stream-reader`.
- **Giới hạn kích thước Chunk:** Đọc và xử lý theo từng khối (chunk size) cố định từ 500 đến 1.000 dòng một lần.

## 2. Tiêu chuẩn Ép kiểu & Tính toán Số học (Typing & Numerical Parsing)
- **Chuyển đổi Tiền tệ:** 
  - Mọi giá trị tiền tệ sau khi bóc tách từ chuỗi thô phải được ép kiểu ngay lập tức sang đối tượng `Decimal`.
  - Quy tắc làm tròn số: Khi có phép chia hoặc quy đổi, bắt buộc định rõ chế độ làm tròn `ROUND_HALF_UP` đến đúng 2 chữ số thập phân (`0.01`).
- **Phân tích Thời gian (Date Parsing):**
  - Không dựa vào cơ chế tự động đoán định dạng mơ hồ (auto-infer). Bắt buộc chỉ định rõ định dạng mẫu đầu vào theo cấu hình (`%d/%m/%Y`, `%Y-%m-%d`, v.v.).
  - Bắt buộc kiểm tra tính hợp lệ của ngày tháng (Date Range Validation) trước khi chuyển đổi sang chuỗi ISO 8601 UTC.

## 3. Tiêu chuẩn Sinh Mã Băm Nhận diện (Canonical Hashing Standard)
- Thuật toán băm nhận diện giao dịch duy nhất bắt buộc sử dụng `SHA-256`.
- **Chuẩn hóa chuỗi trước khi băm (Canonical String):**
  Các trường phải được trim khoảng trắng, chuyển về chữ thường (lowercase) và nối với nhau bằng ký tự phân cách pipe `|`:
  `canonical_str = f"{account_no.strip().lower()}|{trans_date_iso}|{amount_decimal}|{trans_ref.strip().lower()}"`
  `dedup_hash = hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()`

## 4. Tiêu chuẩn Thao tác Ghi CSDL (Batch Insertion Standard)
- Thao tác nạp dữ liệu vào CSDL phải sử dụng Parameterized Multi-Row Bulk Insert (`INSERT INTO transactions (...) VALUES (...), (...) ON CONFLICT DO NOTHING`).
- Toàn bộ thao tác ghi cho một file phải nằm trong một Database Transaction duy nhất để đảm bảo tính nguyên tử (Atomicity).
