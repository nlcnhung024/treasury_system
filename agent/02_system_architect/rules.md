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
- **Cơ chế Khóa Bảo vệ Can thiệp Thủ công:** Đối với mọi bảng dữ liệu có quy trình tự động phân loại, gán nhãn hoặc nạp hàng loạt (batch import) kết hợp người dùng sửa tay, BẮT BUỘC phải thiết kế cờ:
  `is_manual_override BOOLEAN NOT NULL DEFAULT FALSE`
  và đặc tả rõ ràng trong logic cập nhật: Cấm các tiến trình batch tự động ghi đè lên các bản ghi có `is_manual_override = TRUE`.
- **Chỉ mục Tìm kiếm Toàn văn (Full-Text Search Indexing):** Các trường văn bản dài thường xuyên phục vụ người dùng tìm kiếm tự do (như `description`, `internal_note`) BẮT BUỘC phải được đánh chỉ mục GIN trên `to_tsvector` (hoặc Full-text Index tương đương) để đảm bảo tốc độ phản hồi < 200ms.
- **Database Views cho Dashboard Quản trị Tức thời:** Với các chỉ số điều hành cấp cao (như Tồn quỹ khả dụng, Báo cáo đầu ngày), BẮT BUỘC phải thiết kế Database View chuyên dụng tổng hợp sẵn trên các bảng đã đánh chỉ mục, cam kết thời gian truy vấn API $\le 100\text{ms}$.
- **Kiến trúc Cô lập Đa Pháp nhân (Multi-Entity / Multi-Tenant Isolation):**
  - Tách biệt hoàn toàn giữa cấu hình mẫu dùng chung (Global Shared Templates) và dữ liệu giao dịch theo từng pháp nhân/doanh nghiệp (`account_holder`, `tax_code` / `entity_id`).
  - Đảm bảo khả năng mở rộng dùng chung một mẫu cấu hình để quét và phân tách dữ liệu độc lập cho nhiều doanh nghiệp khác nhau mà không làm rò rỉ hay trộn lẫn số liệu.

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
- **Chuẩn Cập nhật Từng phần (Partial Updates):** Các thao tác chỉnh sửa trực tiếp tại bảng (Inline Tagging, sửa Note nội bộ) BẮT BUỘC phải sử dụng phương thức HTTP `PATCH` thay vì `PUT`.
- **Hợp đồng API Xử lý Hàng loạt (Batch/Re-apply Endpoints):** Các API chạy lại quy tắc hoặc xử lý dữ liệu hàng loạt bắt buộc phải trả về metadata chi tiết: `total_processed`, `updated_count`, và `skipped_manual_override_count` (số bản ghi được bảo vệ không ghi đè).
- **Chuẩn Xuất Bảng tính Kế toán An toàn:** API xuất file Excel (`.xlsx`) bắt buộc khai báo header `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, format số tiền căn phải và sanitize ký tự mở đầu (`=`, `+`, `-`, `@`) chống Formula Injection.

## 5. Tiêu chuẩn Tài liệu Thiết kế Kiến trúc (Software Architecture Document - SAD)
- Mọi tài liệu thiết kế kiến trúc hệ thống (SAD) bắt buộc phải tuân theo mô hình chuẩn **Kruchten 4+1 Views**:
  1. **Logical View:** Phân tầng dịch vụ, trách nhiệm từng tầng từ Presentation đến Persistence.
  2. **Process View:** Cơ chế xử lý bất đồng bộ, concurrency, Message Queue, Event-driven và Dead Letter Queue (DLQ).
  3. **Development View:** Cấu trúc tổ chức mã nguồn, phân chia thư viện và gói module (Clean Architecture/Monorepo).
  4. **Physical / Deployment View:** Sơ đồ mạng hạ tầng, phân vùng DMZ, Reverse Proxy, Container Pods và cụm CSDL.
  5. **Use Case / Scenario View (+1 View):** Hiện thực hóa luồng xử lý đầu-cuối của các ca sử dụng phức tạp nhất trong BRD.
- Toàn bộ sơ đồ kiến trúc bắt buộc sử dụng cú pháp **Mermaid** trực quan (`flowchart`, `sequenceDiagram`, `erDiagram`).
