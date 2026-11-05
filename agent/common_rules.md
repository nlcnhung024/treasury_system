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
- **Bất biến Số dư Lũy kế theo Thời gian (Chronological Running Balance Invariant):**
  - Mọi cột số dư lũy kế (đầu kỳ / còn lại / running balance) trên báo cáo, sổ phụ, bảng dòng tiền BẮT BUỘC được dựng lại bằng cách duyệt sự kiện nguồn theo `(event_date, id)` tăng dần, bắt đầu từ số dư gốc.
  - CẤM hiển thị trực tiếp các snapshot số dư được ghi tại thời điểm người dùng thao tác (vd. `previous_*_balance`, `remaining_*_balance`), vì chúng phụ thuộc thứ tự thao tác chứ không phải thứ tự giao dịch.
  - Số dư dựng lại âm phải được gắn cờ (vd. `is_over_*`) và hiển thị cảnh báo, không được clamp về 0.
- **Cấm Phân bổ lại Ngầm giữa các Trường Tiền tệ (No Silent Reallocation):**
  - Khi một giá trị vượt giới hạn hợp lệ (vd. số trả gốc > dư nợ), hệ thống BẮT BUỘC từ chối với HTTP 422 kèm thông điệp rõ ràng.
  - CẤM tự động (hoặc gián tiếp ép người dùng) dồn phần vượt sang một trường tiền tệ khác (gốc → lãi, nợ → có…).
  - Nếu nội dung giao dịch nguồn có ghi rõ số tiền theo từng thành phần, giá trị parse được là ràng buộc cứng; lệch so với giá trị ghi nhận phải được cảnh báo.
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

- **Tiêu chuẩn Thiết kế Bảng Dữ liệu Đa năng (Universal Interactive Data Grid Standard):**
  - Mọi bảng dữ liệu / lưới danh sách (Data Grid) trên toàn hệ thống bắt buộc phải trang bị:
    1. **Header luôn có Sort và Filter:** Hỗ trợ sắp xếp 2 chiều và bộ lọc trực tiếp trên Header.
    2. **Bộ lọc phân loại theo kiểu dữ liệu:** Dạng chữ (Text) lọc bằng điều kiện chuỗi (chứa, bằng, bắt đầu bằng...); Dạng số hoặc ngày (Number/Date) lọc theo điều kiện khoảng (Min - Max, Từ ngày - Đến ngày).
    3. **Quản trị Ẩn / Hiện Cột (Column Visibility Toggle):** Cung cấp công cụ bật/tắt hiển thị từng cột và lưu nhớ trạng thái vào localStorage.
    4. **Thay đổi Độ rộng Cột (Column Resizing):** Cho phép kéo thả chuột để tùy chỉnh kích thước cột kèm ràng buộc độ rộng tối thiểu (minWidth) an toàn chống vỡ giao diện.

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
- **Quy ước Định danh Dữ liệu Kiểm thử (Deterministic Test Prefixing):**
  - Mọi thực thể/bản ghi tạo ra trong quá trình kiểm thử tự động hoặc chạy kịch bản thử nghiệm (tài khoản, hợp đồng vay, khế ước, mã hóa đơn, file upload) BẮT BUỘC phải mang tiền tố nhận diện chuẩn hóa rõ ràng: `TEST_...` hoặc `TEST-...` (ví dụ: `TEST-LOAN-...`, `TEST-ACC-...`, `TEST-INV-...`).
  - TUYỆT ĐỐI CẤM sinh mã hoặc ký hiệu ngẫu nhiên không có tiền tố kiểm thử (như mã ngân hàng thật `CTG-...` thiếu tiền tố `TEST-`) khiến hệ thống quét dọn không nhận diện được để xóa tự động.
- **Cơ chế Thu dọn Kép Hai Đầu (Pre-Clean & Post-Teardown):**
  - Mọi test suite tương tác trực tiếp với cơ sở dữ liệu dùng chung BẮT BUỘC phải thực hiện cơ chế dọn dẹp hai đầu:
    1. *Pre-clean (Đầu vào):* Truy vấn xóa sạch toàn bộ các bản ghi rác mang tiền tố `TEST%` còn sót lại từ lần chạy trước trước khi bắt đầu kịch bản.
    2. *Post-teardown (Đầu ra):* Toàn bộ thao tác xóa phải nằm trong khối `finally:` hoặc pytest fixture `yield` teardown đảm bảo thực thi 100% kể cả khi test case bị `AssertionError`, ngoại lệ đột ngột hay bị ngắt ngang.
- **Thu dọn Đồng bộ Tệp Vật lý trên Storage (Physical Storage Cleanup):**
  - Khi kịch bản test có phát sinh lưu trữ file nhị phân vào thư mục hệ thống (`backend/storage/...`), kịch bản kiểm thử BẮT BUỘC phải xóa cả file vật lý trên đĩa (disk/storage) song song với việc xóa bản ghi trong CSDL. Tuyệt đối không để tồn đọng các tệp mồ côi (orphan files) làm phình to dung lượng và rác storage.
- **Xử lý Dữ liệu Mẫu In-Memory (In-Memory Processing for Test Samples):**
  - Tuyệt đối không giải nén (extract) các file zip mẫu vào thư mục tĩnh của dự án khi chạy test. Mọi thao tác đọc file mẫu kiểm thử phải được xử lý trực tiếp trên bộ nhớ (In-memory via `zipfile.ZipFile`, `io.BytesIO`) và tự động giải phóng khi hoàn tất.
- **Bảo vệ môi trường phát triển & UI:** TUYỆT ĐỐI KHÔNG để sót lại tài khoản test (như `9999TESTACC`, `CONG TY TEST`), hợp đồng test (`TEST-LOAN-...`), file test (`Test Accountant`) hoặc bản ghi rác trong cơ sở dữ liệu làm hiển thị sai lệch trên giao diện người dùng thực tế.




## 9. Tiêu chuẩn Bảng Dữ liệu Phía Frontend (Frontend Data Table Sorting Standard)
- **Bắt buộc hỗ trợ sắp xếp 2 chiều (Sort Ascending / Descending):** Toàn bộ các bảng hiển thị dữ liệu (Data Tables) trên giao diện Frontend BẮT BUỘC phải hỗ trợ tính năng sắp xếp 2 chiều trên tất cả các tiêu đề cột (Table Headers) có dữ liệu.
  - Áp dụng NGAY khi tạo mới bất kỳ bảng nào (kể cả bảng con/bảng mở rộng trong dòng), không chờ yêu cầu bổ sung.
- **Thành phần dùng chung (Reusable Sortable Header):** Sử dụng component `<SortableTh>` (`frontend/src/components/common/SortableTh.tsx`) kết hợp cùng hàm so sánh đa năng `sortList` / `compareValues` (`frontend/src/utils/sort.ts`).
- **Độ chính xác so sánh đa kiểu dữ liệu:** Hỗ trợ chuẩn hóa so sánh tiếng Việt có dấu (`localeCompare('vi', { numeric: true, sensitivity: 'base' })`), số thực tiền tệ, ngày tháng ISO và boolean.
- **Tiêu chuẩn Trợ năng (Accessibility & Visual UX):** Header có thuộc tính `role="columnheader"`, `aria-sort`, `tabIndex={0}`, hỗ trợ phím Enter/Space, có tooltip và biểu tượng trạng thái trực quan (`ArrowUp`, `ArrowDown`, `ArrowUpDown`).
- **Bắt buộc có ô tìm kiếm (Search Bar):**
  - Mọi bảng danh sách chính phải có ô tìm kiếm phía client đặt phía trên bảng, có icon `Search`, `aria-label`, placeholder mô tả các trường được tìm.
  - So khớp không phân biệt hoa/thường và không dấu tiếng Việt: `normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()`.
  - Lọc được thực hiện trước khi sort (`useMemo` gộp filter → `sortList`); khi không có kết quả phải hiển thị thông điệp phân biệt "chưa có dữ liệu" và "không tìm thấy kết quả phù hợp".

## 10. Bất biến Trường Dữ liệu Tự động Tính toán (Auto-Calculated Fields Invariant)
- **Tự động hóa 100% các giá trị phái sinh:** Các trường dữ liệu có quy tắc hoặc công thức luật định rõ ràng (như Lãi cộng dồn, Lãi dự trả theo Thông tư 14/2017/TT-NHNN, Tổng nghĩa vụ đến hạn) BẮT BUỘC phải do hệ thống tự động tính toán. TUYỆT ĐỐI KHÔNG yêu cầu người dùng phải tự tính nhẩm hoặc nhập tay trên giao diện người dùng.
- **Bảo đảm tính toàn vẹn số học hai đầu (Client & Server):** Phía giao diện hiển thị trường dưới dạng Read-Only / Computed Display trực quan, cập nhật thời gian thực khi tham số gốc thay đổi; phía backend luôn tự động tính toán lại và đồng bộ chính xác khi thêm mới hoặc sửa đổi dữ liệu.
