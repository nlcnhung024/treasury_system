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
