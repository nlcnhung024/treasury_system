# NGUYÊN TẮC THIẾT KẾ VÀ TỔ CHỨC MULTI-AGENT (MULTI-AGENT ARCHITECTURE RULES)

Khi thiết kế hoặc quản lý hệ thống Agent và Rules cho dự án, trợ lý BẮT BUỘC tuân thủ các nguyên tắc sau:

## 1. Cấu trúc Thư mục Độc lập cho từng Agent
- Mỗi Agent phải có một thư mục riêng biệt đặt tên theo định dạng `agent/{agent_name}/`.
- Trong thư mục của từng Agent bắt buộc có:
  - `profile.md`: Hồ sơ năng lực, System Prompt, nhiệm vụ chính và sản phẩm bàn giao.
  - `rules.md`: Bộ quy tắc kỹ thuật mà Agent đó bắt buộc phải tuân theo.

## 2. Phân tách Tuyệt đối giữa Kỹ thuật và Nghiệp vụ (Strict Separation)
- **Các tệp `rules.md` CHỈ NÓI VỀ MẶT KỸ THUẬT:**
  - Quy định về kiểu dữ liệu (Data types, precision, Decimal thay vì Float).
  - Quy định về bộ nhớ và I/O (Streaming, chunking, cấm load OOM).
  - Quy định an toàn bảo mật (Injection, sanitization, RBAC).
  - Tiêu chuẩn tài liệu (YAML/JSON schema, Gherkin syntax).
  - Tiêu chuẩn kiểm thử (Coverage, sandbox test data, bắt buộc 100% teardown không để rò rỉ mock data ra CSDL dùng chung).
  - **TUYỆT ĐỐI KHÔNG:** Mô tả nghiệp vụ ngân hàng/tài chính, luồng màn hình người dùng, hoặc tính năng sản phẩm trong `rules.md`.

## 3. Nguồn Chân lý Nghiệp vụ & Nguyên tắc Tra cứu Tiết kiệm Token (On-Demand Retrieval)
- Nguồn chân lý nghiệp vụ được quy định tập trung tại `agent/PRODUCT_SPEC.md` và thư mục `docs/` (`docs/BRD.md`, `docs/Bank_Mapping_Matrix.md`, v.v.). Mọi Agent không được tự ý suy diễn hoặc thay đổi ngoài tài liệu.
- **Quy tắc Tiết kiệm Token (BẮT BUỘC):**
  - **CẤM đọc toàn bộ thư mục `docs/` hoặc đọc toàn bộ các file lớn (>30KB) trong một lượt.**
  - Agent bắt buộc tham chiếu tệp chỉ mục [`docs/INDEX.md`](file:///c:/Users/Admin/OneDrive/Sao%20kê/docs/INDEX.md) để xác định chính xác tài liệu và phạm vi cần đọc.
  - Sử dụng công cụ tìm kiếm từ khóa (`grep`), hoặc đọc có giới hạn dòng (`StartLine`/`EndLine`) chỉ với các phân đoạn liên quan trực tiếp đến nhiệm vụ đang thực hiện.

## 4. Bộ Nguyên tắc Kỹ thuật Chung (Common Technical Baseline)
- Thiết lập tệp `agent/common_rules.md` chứa các tiêu chuẩn kỹ thuật áp dụng chung cho toàn bộ dự án.
- Mọi Agent đều kế thừa và chịu sự chi phối của tài liệu này.

## 5. Cơ chế Tự động Học và Cập nhật Rules (Continuous Self-Learning)
Trong suốt quá trình xây dựng dự án, mỗi khi người dùng sửa lỗi (correction), điều chỉnh cách làm hoặc đưa ra ràng buộc mới cho Agent, trợ lý BẮT BUỘC tự động đúc kết bài học và cập nhật ngay vào hệ thống tài liệu mà không cần chờ lệnh `/learn`:
- **Lỗi/Ràng buộc kỹ thuật của riêng một Agent:** Tự động cập nhật bổ sung vào `agent/{agent_name}/rules.md` tương ứng.
- **Lỗi/Ràng buộc kỹ thuật áp dụng cho toàn hệ thống:** Tự động cập nhật bổ sung vào `agent/common_rules.md`.
- **Điều chỉnh về mặt nghiệp vụ hoặc tính năng sản phẩm:** Tự động cập nhật vào thư mục `docs/` (BRD, SRS, PRD,...) hoặc `agent/PRODUCT_SPEC.md` (đảm bảo giữ vững nguyên tắc không đưa nghiệp vụ vào `rules.md`).

## 6. Nguyên tắc Đồng bộ Liên Tài liệu & Chống Mâu thuẫn Chéo (Cross-Document Consistency & Ripple-Effect Rule)
Để triệt tiêu vĩnh viễn tình trạng lệch pha hoặc mâu thuẫn giữa các tài liệu trong dự án, mọi Agent BẮT BUỘC tuân thủ kỷ luật đồng bộ nguyên tử sau:
- **Cấm Cập nhật Cục bộ Đơn lẻ (No Siloed Documentation Edits):** Khi bất kỳ Agent nào thêm mới, sửa đổi hoặc loại bỏ một định nghĩa dùng chung (tên bảng/cột, tập giá trị `ENUM`, công thức tính toán/băm, cấu trúc API payload, hoặc quy tắc đối soát) trong một tài liệu, Agent đó BẮT BUỘC phải truy vết và cập nhật đồng bộ tất cả các tài liệu liên quan trong chuỗi (`docs/*`, `agent/PRODUCT_SPEC.md`, `database/schema.sql`) ngay trong **cùng một lượt thực thi (Atomic Turn)**.
- **Phân quyền Nguồn Chân lý theo Miền Tài liệu (Canonical Domain Ownership):**
  - Yêu cầu nghiệp vụ & luồng người dùng: `docs/BRD.md` & `agent/PRODUCT_SPEC.md`.
  - Quy tắc ánh xạ dữ liệu nguồn & công thức chuẩn hóa/đối soát: `docs/Bank_Mapping_Matrix.md`.
  - Cấu trúc bảng, tên cột, kiểu dữ liệu & ràng buộc `ENUM` CSDL: `database/schema.sql`.
  - Đặc tả giao tiếp API, Request/Response Schema & HTTP Status: `docs/api_contracts.yaml`.
  - Kiến trúc hệ thống tổng thể & luồng xử lý kỹ thuật: `docs/SAD.md` (và `docs/architecture_spec.md`).
- **Cổng Kiểm tra Đồng bộ Chéo Tiết kiệm Token (Targeted Consistency Gate):** Trước khi kết thúc nhiệm vụ có chỉnh sửa định nghĩa dùng chung, Agent thực hiện quét đối chiếu có mục tiêu (`grep` chính xác tên trường, mã ENUM, endpoint vừa chỉnh sửa) trên các tệp liên quan trong `docs/` và `database/schema.sql`. **Cấm đọc toàn bộ nội dung file để kiểm tra chéo.**



