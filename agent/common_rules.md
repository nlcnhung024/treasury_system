# BỘ NGUYÊN TẮC KỸ THUẬT CHUNG (COMMON TECHNICAL RULES)

> **Phạm vi áp dụng:** BẮT BUỘC áp dụng cho TOÀN BỘ các Agent trong dự án.  
> **Nguyên tắc cốt lõi:** Rules chỉ quy định về mặt kỹ thuật, kiến trúc, an toàn thông tin và tiêu chuẩn lập trình. Mọi thông tin về nghiệp vụ, bối cảnh dự án và tính năng sản phẩm BẮT BUỘC phải tra cứu từ thư mục tài liệu [`docs/`](../docs/) (BRD, SRS, PRD,...) và [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).

---

## 1. Nguyên tắc Hiểu Bối cảnh & Nguồn Chân lý Nghiệp vụ (Context Understanding & Single Source of Truth)
- **Bắt buộc đọc tài liệu bối cảnh:** Trước khi thực hiện bất kỳ nhiệm vụ phân tích, thiết kế, lập trình hay kiểm thử nào, TOÀN BỘ Agent BẮT BUỘC phải đọc và nắm bắt toàn diện bối cảnh dự án, bài toán kinh doanh và yêu cầu chức năng từ các tài liệu trong thư mục `docs/`:
  - `docs/BRD.md`: Tài liệu Yêu cầu Nghiệp vụ (Business Requirements Document).
  - `docs/SRS.md`: Tài liệu Đặc tả Yêu cầu Hệ thống / Phần mềm (System/Software Requirements Specification).
  - `docs/PRD.md`: Tài liệu Yêu cầu Sản phẩm (Product Requirements Document).
  - Kết hợp cùng tài liệu kiến trúc/đặc tả sản phẩm tổng thể [`agent/PRODUCT_SPEC.md`](./PRODUCT_SPEC.md).
- **Tuyệt đối không suy diễn nghiệp vụ:** Toàn bộ các Agent không được tự ý suy diễn, bổ sung hoặc thay đổi nghiệp vụ/yêu cầu sản phẩm bên ngoài phạm vi đã được định nghĩa trong `docs/` và `PRODUCT_SPEC.md`.
- **Thứ tự ưu tiên khi xung đột:** Khi có xung đột giữa giả định kỹ thuật và yêu cầu sản phẩm, nội dung trong tài liệu đặc tả nghiệp vụ (`docs/`, `PRODUCT_SPEC.md`) luôn có quyền ưu tiên cao nhất.

## 2. Tiêu chuẩn Kiểu dữ liệu & Độ chính xác (Typing & Numerical Precision)
- **Kiểu dữ liệu tiền tệ:** BẮT BUỘC sử dụng kiểu số thực có độ chính xác cao (`DECIMAL(18, 2)` / `NUMERIC(18, 2)` trong SQL; `Decimal` trong Python; `Decimal.js` hoặc `BigNumber` trong JavaScript/TypeScript).
- **Tuyệt đối cấm:** KHÔNG sử dụng kiểu dấu phẩy động nhị phân (`FLOAT`, `DOUBLE`) cho bất kỳ trường dữ liệu nào liên quan đến tiền tệ, số dư hoặc phí.
- **Tiêu chuẩn thời gian:** Toàn bộ dữ liệu ngày giờ phải được chuẩn hóa và lưu trữ theo định dạng ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`) với múi giờ UTC hoặc UTC+7 đồng nhất.

## 3. Kiến trúc Phi trạng thái & Tách biệt Trách nhiệm (Stateless & Separation of Concerns)
- **Tách biệt lưu trữ nhị phân:** TUYỆT ĐỐI KHÔNG lưu trữ file nhị phân (Binary/Blob) bên trong Cơ sở dữ liệu quan hệ (RDBMS). CSDL chỉ lưu Metadata và đường dẫn URI đến Object Storage.
- **Không chặn luồng (Non-blocking I/O):** Mọi tác vụ tốn tài nguyên (I/O file lớn, parsing, cleansing, aggregation phức tạp) bắt buộc phải xử lý qua hàng đợi bất đồng bộ (Message Queue / Background Worker).

## 4. An toàn Thông tin & Phòng chống Tấn công (Security by Design)
- **Zero-Trust Input Validation:** Xác thực dữ liệu đầu vào tại mọi ranh giới (Client-side, API Gateway, và Service Layer). Không tin cậy bất kỳ input nào từ phía client.
- **Phòng chống Injection:**
  - SQL Injection: Bắt buộc sử dụng Parameterized Queries hoặc ORM, cấm ghép chuỗi câu lệnh SQL thô.
  - Formula/CSV Injection: Bắt buộc sanitize và escape các ký tự khởi đầu công thức (`=`, `+`, `-`, `@`) trước khi ghi hoặc xuất file bảng tính.
  - Cross-Site Scripting (XSS): Toàn bộ dữ liệu văn bản từ file người dùng tải lên phải được HTML-escaped trước khi render ra màn hình.
- **Quyền tối thiểu (Principle of Least Privilege):** Phân quyền truy cập nghiêm ngặt (RBAC) ở cấp độ từng tài nguyên và API endpoint.

## 5. Xử lý Lỗi & Tính Toàn vẹn Dữ liệu (Error Handling & Atomicity)
- **Tính nguyên tử (ACID Transactions):** Các thao tác ghi dữ liệu nhiều bước (ghi file metadata $\rightarrow$ insert hàng ngàn giao dịch) phải được bọc trong Database Transaction. Nếu xảy ra lỗi giữa chừng, toàn bộ thay đổi phải được Rollback.
- **Fail-Safe & Idempotency:** Mọi API và Worker Job phải đảm bảo tính Idempotent (thực thi lại nhiều lần không tạo ra dữ liệu trùng lặp hoặc sai lệch).
- **Structured Logging:** Ghi log hệ thống theo định dạng JSON có kèm mã lỗi (`error_code`), dấu vết thời gian (`timestamp`), và mã định danh phiên làm việc (`correlation_id`).
- **Bất biến Nhật ký Kiểm toán (Audit Trail Invariant):** Toàn bộ bản ghi kiểm toán nghiệp vụ bắt buộc tuân thủ đúng cấu trúc 5 thành phần: `actor`, `action`, `target_entity`, `target_id`, và `details` (JSON object).
- **Bất biến Thứ tự Route API (Route Ordering Invariant):** Mọi API Router trên backend bắt buộc đặt Static Routes trước Dynamic Parameter Routes để triệt tiêu lỗi ép kiểu path parameter (`int_parsing` collision).
- **Thực thi DDL tuần tự trên Asyncpg (Asyncpg Single-Statement Invariant):**
  - Trình điều khiển `asyncpg` của PostgreSQL KHÔNG hỗ trợ gộp nhiều câu lệnh SQL trong cùng một prepared statement (`cannot insert multiple commands into a prepared statement`).
  - Khi viết script khởi tạo hoặc migration CSDL (DDL), BẮT BUỘC phải tách và thực thi từng câu lệnh riêng biệt (tách riêng `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`), cấm gộp chuỗi nhiều lệnh cách nhau bằng dấu chấm phẩy `;`.

## 6. Tiêu chuẩn Tài liệu & Mã nguồn (Code & Spec Standards)
- Đặt tên biến, hàm, bảng, cột nhất quán theo quy ước kỹ thuật chuẩn:
  - CSDL & API JSON: `snake_case` (ví dụ: `account_number`, `transaction_date`).
  - Code Typescript/Javascript: `camelCase` cho biến/hàm, `PascalCase` cho Class/Interface.
  - Code Python: `snake_case` cho hàm/biến, `PascalCase` cho Class.
- **Tiêu chuẩn Khung Phản hồi Danh sách API (Collection Response Envelope Standard):**
  - Mọi API trả về danh sách nhiều bản ghi bắt buộc phải đồng nhất cấu trúc bao gói (Envelope). Khuyến nghị chuẩn hóa sử dụng khóa `data` hoặc `items` kèm `pagination`:
    ```json
    {
      "data": [...],
      "pagination": { "page": 1, "page_size": 50, "total_records": 100 }
    }
    ```
  - Khi phía Frontend tiếp nhận dữ liệu danh sách, BẮT BUỘC áp dụng cơ chế bóc tách phòng vệ (Defensive Extraction):
    `const list = res.data?.data || res.data?.items || [];`
    nhằm triệt tiêu vĩnh viễn lỗi giao diện nhận mảng rỗng do lệch tên khóa.

## 7. Tiêu chuẩn Đồng bộ Hóa Tài liệu & Kiểm soát Lan truyền Thay đổi (Cross-Artifact Synchronization Standard)
Mọi Agent khi khởi tạo hoặc cập nhật bất kỳ tài liệu kỹ thuật/nghiệp vụ nào (`docs/*.md`, `docs/*.yaml`, `database/*.sql`) BẮT BUỘC thực thi quy trình 3 bước để đảm bảo tính nhất quán tuyệt đối 100%:
- **Bước 1 — Đối chiếu Ma trận Tác động Chéo (Ripple-Effect Impact Check):**
  - Thay đổi Tên bảng / Tên cột / Kiểu dữ liệu / `ENUM` $\rightarrow$ Bắt buộc đồng bộ giữa `database/schema.sql`, `docs/Bank_Mapping_Matrix.md`, `docs/SAD.md`, `docs/architecture_spec.md` và `docs/api_contracts.yaml`.
  - Thay đổi Công thức tính toán / Thuật toán băm / Chế độ kiểm toán $\rightarrow$ Bắt buộc đồng bộ giữa `docs/BRD.md`, `docs/Bank_Mapping_Matrix.md`, `docs/SAD.md`, `docs/architecture_spec.md` và `database/schema.sql`.
  - Thay đổi Cấu trúc Request/Response JSON $\rightarrow$ Bắt buộc đồng bộ giữa `docs/api_contracts.yaml` và các ví dụ minh họa trong `docs/SAD.md`, `docs/architecture_spec.md`.
- **Bước 2 — Kiểm tra 5 Bất biến Dùng chung (5 Shared Invariants Verification):**
  Trước khi bàn giao tài liệu, Agent bắt buộc dùng công cụ tìm kiếm toàn cục để kiểm chứng 5 yếu tố sau không bị mâu thuẫn giữa các file:
  1. *Tên định danh (`snake_case`)* của mọi bảng và cột.
  2. *Tập giá trị hằng số/trạng thái (`ENUM`)* (tuyệt đối không dùng từ đồng nghĩa hoặc tên trạng thái tự đặt khác với `database/schema.sql`).
  3. *Biểu thức công thức* (số lượng tham số, thứ tự trường, ký tự phân tách).
  4. *Kiểu dữ liệu và độ chính xác* (`DECIMAL(18,2)`, chuẩn thời gian ISO 8601).
  5. *Khóa JSON (JSON Keys)* trong các mẫu payload API.
- **Bước 3 — Ghi nhận Phiên bản Liên kết (Linked Version Bump):**
  Cập nhật bảng Lịch sử Phiên bản (Version History) tại các tài liệu vừa chỉnh sửa, ghi rõ phiên bản mới và danh sách các tệp đã được đồng bộ chéo.

## 8. Tiêu chuẩn Cô lập & Thu dọn Dữ liệu Kiểm thử (Test Isolation & Mandatory Teardown)
- **Dọn dẹp triệt để (Mandatory Cleanup):** Khi viết hoặc chạy các kịch bản kiểm thử (test suite, pytest fixture, integration tests), mọi dữ liệu giả lập (mock/test accounts, test statement files, test loans, test transactions) BẮT BUỘC phải được dọn dẹp sạch sẽ (teardown/delete) ngay sau khi test hoàn tất hoặc sử dụng transaction rollback riêng biệt.
- **Bảo vệ môi trường phát triển & UI:** TUYỆT ĐỐI KHÔNG để sót lại tài khoản test (như `9999TESTACC`, `CONG TY TEST`), file test (`Test Accountant`) hoặc bản ghi rác trong cơ sở dữ liệu làm hiển thị sai lệch trên giao diện người dùng thực tế.



