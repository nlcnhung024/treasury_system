# RULES KỸ THUẬT DÀNH RIÊNG CHO DATA PARSER & ETL ENGINEER (@DataParserEngineer)

> **Tuân thủ bắt buộc:** Data Engineer phải bám sát [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) và tuân thủ [common_rules.md](../common_rules.md).  
> **Phạm vi tài liệu này:** Quy định các ràng buộc kỹ thuật về quản lý bộ nhớ, đọc I/O stream, ép kiểu dữ liệu và thao tác cơ sở dữ liệu số lượng lớn.

---

## 1. Tiêu chuẩn Quản lý Bộ nhớ & Đọc Stream (Memory & Stream I/O)
- **Cấm Eager-Loading:** TUYỆT ĐỐI CẤM tải toàn bộ nội dung file Excel vào bộ nhớ RAM bằng các hàm load đầy đủ (như `openpyxl.load_workbook()` ở chế độ mặc định hoặc `pd.read_excel()` nguyên file) trên môi trường production.
- **Bắt buộc Stream / Read-Only Chunking:**
  - Trong Python: Bắt buộc dùng `openpyxl.load_workbook(filename, read_only=True, data_only=True)` hoặc các thư viện stream tương đương.
  - **Xử lý Khiếm khuyết Metadata Kích thước Bảng tính (Worksheet Dimension Resetting):** Khi đọc file `.xlsx` ở chế độ `read_only=True` được xuất từ hệ thống phần mềm ngân hàng (như MBBank e-banking) có khai báo kích thước sai lệch `<dimension ref="A1"/>`, `openpyxl` mặc định sẽ ngắt lặp sau dòng 1. Parser bắt buộc phải thực thi `ws.reset_dimensions()` trước khi lặp qua `ws.iter_rows()` để đảm bảo đọc đủ 100% các dòng thực tế mà vẫn bảo toàn bộ nhớ stream.
  - Trong Node.js: Bắt buộc dùng `exceljs` streaming reader hoặc `xlsx-stream-reader`.
- **Giới hạn kích thước Chunk:** Đọc và xử lý theo từng khối (chunk size) cố định từ 500 đến 1.000 dòng một lần.
- **Tương thích Đa Định dạng & Cấu trúc Bảng Phức tạp:**
  - Hỗ trợ đọc chuẩn cả định dạng OOXML (`.xlsx` bao gồm cả `sharedStrings.xml` và `inlineStr` `<is><t>`) lẫn định dạng nhị phân Compound File BIFF8 (`.xls`).
  - Tự động xử lý các bảng có ô gộp ngang/dọc (Merged Cells), bảng thụt lề cột (Indented Grid) và tự động bỏ qua (skip) các dòng trống xen kẽ trong vùng dữ liệu cho đến khi gặp điều kiện dừng (`stop_condition`).

## 2. Tiêu chuẩn Ép kiểu & Tính toán Số học (Typing & Numerical Parsing)
- **Chuyển đổi Tiền tệ:** 
  - Mọi giá trị tiền tệ sau khi bóc tách từ chuỗi thô phải được ép kiểu ngay lập tức sang đối tượng `Decimal`.
  - **Bảo toàn Ký hiệu Số mũ Khoa học (Scientific Notation Preservation):** Khi làm sạch chuỗi tiền tệ từ XML/Excel (như `'1.441E8'`, `'4.99999999E8'`), chỉ được phép xóa các từ khóa đơn vị tiền tệ cụ thể (`(?i)(VND|USD)`), khoảng trắng, `\t` và dấu phân cách hàng nghìn. **TUYỆT ĐỐI CẤM** dùng biểu thức chính quy xóa chữ cái chung `[A-Za-z]` làm mất ký tự số mũ `E`/`e` trước khi truyền vào `Decimal()`.
  - Quy tắc làm tròn số: Khi có phép chia hoặc quy đổi, bắt buộc định rõ chế độ làm tròn `ROUND_HALF_UP` đến đúng 2 chữ số thập phân (`0.01`).
- **Nội suy Khuyết Cột & Đa Chế độ Đối soát (Missing-Column Inference & Multi-Mode Reconciliation):**
  - Đối với các mẫu khuyết cột `running_balance` (nhưng có Số dư ĐK/CK ở Header) hoặc khuyết Số dư ĐK/CK ở Header/Footer (nhưng có cột `running_balance` trên dòng), Parser bắt buộc phải thực hiện thuật toán nội suy lũy kế theo chế độ cấu hình (`reconciliation_mode`) để đảm bảo trường `running_balance` (`NOT NULL`) và đối soát cân bằng đạt sai số $\Delta = 0.00$.
- **Phân tích Thời gian (Date Parsing):**
  - Không dựa vào cơ chế tự động đoán định dạng mơ hồ (auto-infer). Bắt buộc chỉ định rõ định dạng mẫu đầu vào theo cấu hình (`%d/%m/%Y`, `%Y-%m-%d`, v.v.).
  - Bắt buộc kiểm tra tính hợp lệ của ngày tháng (Date Range Validation) trước khi chuyển đổi sang chuỗi ISO 8601 UTC.

## 3. Tiêu chuẩn Sinh Mã Băm Nhận diện (Canonical Hashing Standard)
- Thuật toán băm nhận diện giao dịch duy nhất bắt buộc sử dụng `SHA-256`.
- **Chuẩn hóa chuỗi 6 thành phần trước khi băm (6-Tuple Canonical String):**
  Để phân biệt chính xác các bút toán tách Phí/VAT hoặc tách lệnh có cùng thời gian và cùng mã tham chiếu, chuỗi đầu vào bắt buộc kết hợp đủ 6 thành phần ngăn cách bởi dấu pipe `|`:
  `canonical_str = f"{account_no.strip().lower()}|{trans_date_iso}|{debit_decimal:.2f}|{credit_decimal:.2f}|{trans_ref.strip().lower()}|{running_balance_decimal:.2f}"`
  `dedup_hash = hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()`

## 4. Tiêu chuẩn Thao tác Ghi CSDL (Batch Insertion Standard)
- Thao tác nạp dữ liệu vào CSDL phải sử dụng Parameterized Multi-Row Bulk Insert (`INSERT INTO transactions (...) VALUES (...), (...) ON CONFLICT DO NOTHING`).
- Toàn bộ thao tác ghi cho một file phải nằm trong một Database Transaction duy nhất để đảm bảo tính nguyên tử (Atomicity).

## 5. Tiêu chuẩn Cấu hình Mẫu Mở rộng & Độc lập Pháp nhân (Config-Driven & Entity-Agnostic Parsing)
- **Không gắn cứng Pháp nhân trong Template:** Mọi cấu hình mẫu (`template_config`) chỉ định nghĩa tọa độ/Regex và từ khóa tiêu đề (`header_aliases`), tuyệt đối không hardcode tên doanh nghiệp, mã số thuế hay số tài khoản cụ thể.
- **Triệt tiêu Hardcode Tọa độ Cột trong Code:** Toàn bộ quá trình bóc tách các dòng chi tiết (cả sao kê tài khoản và sao kê tín dụng/khoản vay) bắt buộc phải dựa vào hàm ánh xạ động `_get_row_cell(row, cols.get(field_name))` từ file declarative config YAML, cấm hardcode các chỉ số cột cố định (`row[2]`, `row[5]`...) trong thân hàm parser.
- **Trích xuất Động Định danh Pháp nhân:** Parser bắt buộc trích xuất động `(account_number, account_holder, tax_code)` từ Header tài liệu để định tuyến dữ liệu về đúng pháp nhân sở hữu, cho phép dùng chung 1 mẫu cấu hình để quét cho nhiều doanh nghiệp khác nhau.
