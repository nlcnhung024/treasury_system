# RULES KỸ THUẬT DÀNH RIÊNG CHO FULLSTACK DEVELOPER (@FullstackDeveloper)

> **Tuân thủ bắt buộc:** Fullstack Developer phải hiện thực hóa đúng [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) và tuân thủ [common_rules.md](../common_rules.md).  
> **Phạm vi tài liệu này:** Quy định các ràng buộc kỹ thuật về giao diện người dùng, xử lý upload, bảo mật phòng chống tấn công và tối ưu hóa truy vấn hiển thị.

---

## 1. Tiêu chuẩn Xác thực Upload Đa Tầng (Multi-Layer Ingestion Validation)
- **Tầng Client (Browser):**
  - Kiểm tra đuôi file mở rộng (extension whitelist): chỉ chấp nhận `.xlsx`, `.xls`, `.csv`.
  - Kiểm tra dung lượng file (Payload size check): từ chối và cảnh báo ngay lập tức nếu dung lượng $> 25\text{MB}$ trước khi kích hoạt request upload.
- **Tầng Server (API Gateway / Controller):**
  - Kiểm tra Magic Bytes / File Signature (Header nhị phân thực tế của file), không phụ thuộc vào `Content-Type` header do client gửi lên.
  - Tạo tên file an toàn: Loại bỏ toàn bộ ký tự đặc biệt khỏi tên file gốc, chỉ giữ lại ký tự `[a-zA-Z0-9_-]`, ghép với `UUIDv4`.

## 2. Tiêu chuẩn Phòng chống Tấn công Formula / CSV Injection (Spreadsheet Sanitization)
Khi xây dựng chức năng xuất dữ liệu báo cáo ra file Excel hoặc CSV:
- **Quy tắc tiền tố:** Nếu bất kỳ ô dữ liệu chuỗi nào bắt đầu bằng một trong các ký tự sau: `=`, `+`, `-`, `@`, `\t`, `\r`, `\n`:
  $\rightarrow$ BẮT BUỘC chèn thêm một dấu nháy đơn `'` vào đầu chuỗi trước khi ghi file (ví dụ: chuỗi `=SUM(A1:A10)` phải được ghi thành `'=SUM(A1:A10)`).
- Biện pháp này ngăn chặn phần mềm bảng tính (Microsoft Excel, LibreOffice) tự động thực thi mã lệnh nguy hiểm trên máy tính người dùng.

## 3. Tiêu chuẩn Phân trang & Tối ưu Hiệu năng Truy vấn (Pagination & Query Performance)
- **Bắt buộc Phân trang:** TUYỆT ĐỐI CẤM trả về mảng dữ liệu không giới hạn trong các API danh sách giao dịch.
  - Áp dụng phân trang theo chuẩn `limit` và `offset` (hoặc Cursor-based với trường `id`).
  - Giá trị `limit` mặc định là `20`, giá trị `limit` tối đa cho phép là `100`.
- **Tổng hợp số liệu trên CSDL (Database-Side Aggregation):**
  - Mọi chỉ số thống kê (Tổng phát sinh Có, Tổng phát sinh Nợ, Số dư) bắt buộc phải được tính toán bằng các hàm tổng hợp SQL (`SUM()`, `COUNT()`) có chỉ mục hỗ trợ.
  - CẤM kéo toàn bộ danh sách bản ghi về phía Backend hoặc Frontend rồi dùng vòng lặp để cộng nhẩm.

## 4. Tiêu chuẩn Cập nhật Trạng thái Thời gian thực (Realtime State Management)
- Khi người dùng gửi file thành công và nhận mã Job (HTTP `202 Accepted`), giao diện Web bắt buộc phải kết nối cập nhật trạng thái thông qua Server-Sent Events (SSE) hoặc Polling có Exponential Backoff.
- Khi trạng thái chuyển sang `COMPLETED` hoặc `FAILED`, tự động kích hoạt cập nhật giao diện mà không yêu cầu người dùng phải tải lại trang (F5).

## 5. Tiêu chuẩn Bóc tách Dữ liệu Danh sách Phía Client (Frontend Defensive Data Extraction)
- Khi gọi các API trả về danh sách dữ liệu (như danh mục khoản vay, sao kê, giao dịch), Frontend Developer TUYỆT ĐỐI KHÔNG giả định cứng một khóa duy nhất (`.items` hoặc `.data`).
- **Bắt buộc viết bóc tách phòng vệ:**
  ```typescript
  const records = res.data?.data || res.data?.items || [];
  ```
- Nếu API có phân trang, kiểm tra an toàn metadata phân trang:
  ```typescript
  const totalCount = res.data?.pagination?.total_records ?? res.data?.total_count ?? records.length;
  ```

## 6. Tiêu chuẩn Escape Dấu Ngoặc Nhọn trong JSX (JSX Syntax Conflict Prevention)
- Khi render văn bản, chú thích công thức toán học hoặc chuỗi ký tự có chứa dấu ngoặc nhọn `{` hoặc `}` trong các component React/TSX:
  - **TUYỆT ĐỐI CẤM:** Viết trực tiếp dấu `{` hoặc `}` trong thẻ JSX (vì trình biên dịch TypeScript sẽ nhận diện nhầm là biểu thức nhúng JavaScript, gây lỗi `TS1005: '}' expected`).
  - **Bắt buộc xử lý:**
    - Cách 1 (Khuyến nghị): Bọc trong chuỗi ký tự JavaScript: `{"{"}` và `{"}"}`.
    - Cách 2: Sử dụng HTML Entities: `&lbrace;` và `&rbrace;`.
    - Cách 3: Bọc toàn bộ câu văn bản thuần túy trong thẻ span hoặc chuỗi string: `<span>{"(40.43 tỷ MBB + 33.34 tỷ CTG)"}</span>`.

## 7. Tiêu chuẩn Thứ tự Khai báo Định tuyến FastAPI (FastAPI Route Ordering Invariant)
- **Quy tắc ưu tiên Route Tĩnh trước Route Động:**
  - Trong cùng một Router FastAPI, các endpoint có đường dẫn tĩnh (Static / Literal Path như `/summary`, `/export`, `/bulk-tag`, `/template`) BẮT BUỘC phải được khai báo **TRƯỚC** các endpoint có đường dẫn chứa biến động (Path Parameters như `/{item_id}`, `/{file_id}`, `/{uuid}`).
  - **Lý do kỹ thuật:** FastAPI duyệt router theo thứ tự từ trên xuống dưới. Khai báo Route Động trước sẽ "nuốt chửng" các Route Tĩnh và cố gắng ép kiểu chuỗi đường dẫn (ví dụ: chuỗi `"summary"`) sang kiểu `int` của ID, gây lỗi HTTP `422 Unprocessable Entity` (`int_parsing error`).

## 8. Tiêu chuẩn Khởi tạo Nhật ký Kiểm toán (AuditLog Invariant)
- Mọi thao tác ghi/sửa/xóa dữ liệu trọng yếu (khoản vay, cấu hình quy tắc, giao dịch) bắt buộc tạo bản ghi `AuditLog` với đúng chữ ký định nghĩa:
  - `actor`: Tên/email người thực hiện (`str`, tối đa 100 ký tự).
  - `action`: Mã định danh hành động chuẩn (`str`, viết hoa dạng `SNAKE_CASE`, ví dụ: `CREATE_MANUAL_LOAN`, `UPDATE_LOAN`, `DELETE_LOAN`).
  - `target_entity`: Tên bảng CSDL bị tác động (`str`, ví dụ: `"credit_facilities"`, `"bank_transactions"`).
  - `target_id`: ID của đối tượng bị tác động (`str`, ép kiểu từ số: `str(loan.loan_id)`).
  - `details`: `dict` chứa metadata biến động phục vụ kiểm toán (lưu trữ cột `JSONB`).
- TUYỆT ĐỐI KHÔNG dùng tên tham số tùy tiện như `entity_name`, `entity_id` hoặc truyền chuỗi văn bản thuần vào trường `details`.

## 9. Tiêu chuẩn Đồng bộ DDL khi Mở rộng Schema (Live DDL Migration)
- Khi thêm mới cột, ràng buộc hoặc chỉ mục vào SQLAlchemy Model và `database/schema.sql`:
  - BẮT BUỘC thực thi câu lệnh DDL gia số có điều kiện bảo vệ (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, `CREATE INDEX IF NOT EXISTS ...`) trên CSDL đang chạy.
  - Đảm bảo toàn bộ test suite (`pytest`) pass 100% trước khi bàn giao tính năng.

## 10. Tiêu chuẩn Bóc tách Hóa đơn Điện tử XML (XML E-Invoice Parsing Standard)
Khi xử lý các tệp hóa đơn điện tử định dạng XML (theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC) từ đa dạng nhà cung cấp giải pháp (VNPT, Viettel, MISA, BKAV, FPT, CMC, EasyInvoice,...):
- **Loại bỏ tiền tố Namespace (Namespace-Agnostic Tag Extraction):**
  - Trình phân tích XML BẮT BUỘC phải tách bỏ toàn bộ XML namespace prefix (dạng `{http://...}Tag` $\rightarrow$ `Tag`) trước khi đối chiếu tên thẻ, tuyệt đối không hardcode namespace của một nhà cung cấp cụ thể.
- **Duyệt thẻ không phân biệt hoa thường và hỗ trợ Danh sách Bí danh (Tag Aliases Fallback):**
  - Số hóa đơn: tìm kiếm lần lượt theo danh sách ưu tiên `["SHDON", "INVOICENUMBER", "SOHOADON", "INVNUM", "INVOICENO", "SHD"]`.
  - Tổng số tiền thanh toán: tìm kiếm theo danh sách `["TGTTTBSO", "TOTALPAYMENT", "TGTTOAN", "TONGTIENTHANHTOAN", "TOTALAMOUNT", "AMOUNT", "SUMAMOUNT"]`. Nếu không có thẻ tổng tiền, tự động tính tổng từ tiền chưa thuế (`TGTCTHUE`, `TOTALTAXABLEAMOUNT`) + tiền thuế GTGT (`TGTTHUE`, `TOTALVATAMOUNT`).
- **Chuẩn hóa Số chuỗi sang Decimal an toàn (Defensive Numeric Parsing):**
  - Xử lý tương thích cả 2 định dạng số phổ biến: Định dạng Việt Nam (dấu chấm phân cách hàng nghìn, dấu phẩy thập phân: `1.489.259.199,00`) và Định dạng Quốc tế (dấu phẩy phân cách hàng nghìn, dấu chấm thập phân: `1,489,259,199.00`).
  - Toàn bộ kết quả tiền tệ bóc tách được BẮT BUỘC lưu trữ và tính toán dưới dạng `Decimal`, cấm ép sang `float`.


