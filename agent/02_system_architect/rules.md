# RULES KỸ THUẬT DÀNH RIÊNG CHO SYSTEM ARCHITECT (@SystemArchitect)

> **Tuân thủ bắt buộc:** Architect phải bám sát [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) để thiết kế giải pháp và tuân thủ [common_rules.md](../common_rules.md).  
> **Phạm vi tài liệu này:** Quy định các ràng buộc kỹ thuật về mô hình hóa CSDL, thiết kế hạ tầng lưu trữ, message queue và chuẩn API.

---

## 1. Tiêu chuẩn Thiết kế Cơ sở Dữ liệu (Database Design Standards)
- **Chuẩn hóa:** Thiết kế CSDL quan hệ đạt tối thiểu chuẩn 3NF (Third Normal Form) cho các bảng giao dịch và phân hệ vận hành.
- **Khóa chính (Primary Key):** Toàn bộ các bảng phải sử dụng `BIGINT AUTO_INCREMENT` hoặc `UUIDv4` làm khóa chính. Bắt buộc có các cột kiểm toán kỹ thuật: `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP` và `updated_at`.
- **Khóa ngoại & Chỉ mục (Foreign Keys & Indexes):**
  - Mọi cột khóa ngoại (`file_id`, `bank_code`) BẮT BUỘC phải được đánh B-Tree Index.
  - Các cột thường xuyên xuất hiện trong mệnh đề `WHERE` hoặc `ORDER BY` của truy vấn báo cáo (`transaction_date`, `account_number`) bắt buộc phải có Composite Index phù hợp.

## 2. Tiêu chuẩn Hạ tầng Lưu trữ File (Storage Architecture Standards)
- **Phân vùng đường dẫn (Deterministic Path Partitioning):** Đường dẫn file trên Object Storage phải tuân thủ cấu trúc phân cấp thời gian:
  `{storage_bucket}/statements/{bank_code}/{YYYY}/{MM}/{file_uuid}_{sanitized_name}.xlsx`
- **Mã băm toàn vẹn (Integrity Hash):** Bắt buộc lưu trữ trường `file_sha256 CHAR(64)` trong bảng quản lý file để kiểm tra tính toàn vẹn (integrity check) và chống trùng lặp dữ liệu.
- **Chính sách truy cập an toàn:** Không bao giờ mở public bucket; truy xuất file thông qua Pre-signed URL có thời hạn sống (TTL tối đa 15 phút).

## 3. Tiêu chuẩn Hàng đợi & Xử lý Bất đồng bộ (Queue & Worker Standards)
- **Quy tắc phân luồng:** Tác vụ có thời gian thực thi dự kiến $> 500\text{ms}$ hoặc dung lượng file $> 2\text{MB}$ phải chuyển sang Background Worker.
- **Tính Idempotent:** Worker Job phải đảm bảo tính Idempotent bằng cách kiểm tra trạng thái file trong DB trước khi tiến hành parse.
- **Dead Letter Queue (DLQ):** Cấu hình cơ chế Retry tối đa 3 lần với Exponential Backoff. Nếu thất bại sau 3 lần, tự động chuyển job vào DLQ và ghi nhận lỗi kỹ thuật vào `audit_logs`.

## 4. Tiêu chuẩn Thiết kế API (RESTful & OpenAPI Standards)
- Mọi API phải được mô tả đầy đủ bằng OpenAPI 3.0 (Swagger) Specification.
- Sử dụng chuẩn HTTP Status Codes:
  - `200 OK`: Thành công với dữ liệu trả về.
  - `202 Accepted`: Yêu cầu tải file đã được tiếp nhận và đưa vào hàng đợi.
  - `400 Bad Request`: Payload sai cú pháp hoặc vi phạm schema.
  - `409 Conflict`: File hoặc giao dịch đã tồn tại (trùng mã băm).
  - `422 Unprocessable Entity`: File đúng định dạng nhưng cấu trúc nội dung không khớp template.
