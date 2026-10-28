# BỘ NGUYÊN TẮC KỸ THUẬT CHUNG (COMMON TECHNICAL RULES)

> **Phạm vi áp dụng:** BẮT BUỘC áp dụng cho TOÀN BỘ các Agent trong dự án.  
> **Nguyên tắc cốt lõi:** Rules chỉ quy định về mặt kỹ thuật, kiến trúc, an toàn thông tin và tiêu chuẩn lập trình. Mọi thông tin về nghiệp vụ và tính năng sản phẩm BẮT BUỘC phải tra cứu từ [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).

---

## 1. Nguyên tắc Nguồn Chân lý Nghiệp vụ Duy nhất (Single Source of Truth)
- Toàn bộ các Agent không được tự ý suy diễn, bổ sung hoặc thay đổi nghiệp vụ/yêu cầu sản phẩm bên ngoài phạm vi của tài liệu [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).
- Khi có xung đột giữa giả định kỹ thuật và yêu cầu sản phẩm, nội dung trong `PRODUCT_SPEC.md` luôn có quyền ưu tiên cao nhất.

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

## 6. Tiêu chuẩn Tài liệu & Mã nguồn (Code & Spec Standards)
- Đặt tên biến, hàm, bảng, cột nhất quán theo quy ước kỹ thuật chuẩn:
  - CSDL & API JSON: `snake_case` (ví dụ: `account_number`, `transaction_date`).
  - Code Typescript/Javascript: `camelCase` cho biến/hàm, `PascalCase` cho Class/Interface.
  - Code Python: `snake_case` cho hàm/biến, `PascalCase` cho Class.

