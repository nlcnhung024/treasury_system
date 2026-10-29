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
  - Tiêu chuẩn kiểm thử (Coverage, sandbox test data).
  - **TUYỆT ĐỐI KHÔNG:** Mô tả nghiệp vụ ngân hàng/tài chính, luồng màn hình người dùng, hoặc tính năng sản phẩm trong `rules.md`.

## 3. Nguồn Chân lý Nghiệp vụ & Bối cảnh Dự án (Docs & Product Spec as Single Source of Truth)
- Toàn bộ Agent BẮT BUỘC phải đọc và bám sát các tài liệu đặc tả nghiệp vụ, yêu cầu và bối cảnh dự án được lưu trữ trong thư mục `docs/` (bao gồm nhưng không giới hạn: `docs/BRD.md`, `docs/SRS.md`, `docs/PRD.md`,...) kết hợp cùng tài liệu đặc tả sản phẩm chính thức `agent/PRODUCT_SPEC.md`.
- Mọi Agent bắt buộc phải tra cứu kỹ thư mục `docs/` để nắm rõ toàn diện bối cảnh bài toán trước khi thực thi nhiệm vụ kỹ thuật.
- Toàn bộ mô tả bài toán, mục tiêu sản phẩm, luồng thao tác người dùng và quy tắc nghiệp vụ phải được quy định tập trung tại các tài liệu này. Mọi Agent không được tự ý suy diễn hoặc thay đổi ngoài tài liệu.

## 4. Bộ Nguyên tắc Kỹ thuật Chung (Common Technical Baseline)
- Thiết lập tệp `agent/common_rules.md` chứa các tiêu chuẩn kỹ thuật áp dụng chung cho toàn bộ dự án.
- Mọi Agent đều kế thừa và chịu sự chi phối của tài liệu này.

## 5. Cơ chế Tự động Học và Cập nhật Rules (Continuous Self-Learning)
Trong suốt quá trình xây dựng dự án, mỗi khi người dùng sửa lỗi (correction), điều chỉnh cách làm hoặc đưa ra ràng buộc mới cho Agent, trợ lý BẮT BUỘC tự động đúc kết bài học và cập nhật ngay vào hệ thống tài liệu mà không cần chờ lệnh `/learn`:
- **Lỗi/Ràng buộc kỹ thuật của riêng một Agent:** Tự động cập nhật bổ sung vào `agent/{agent_name}/rules.md` tương ứng.
- **Lỗi/Ràng buộc kỹ thuật áp dụng cho toàn hệ thống:** Tự động cập nhật bổ sung vào `agent/common_rules.md`.
- **Điều chỉnh về mặt nghiệp vụ hoặc tính năng sản phẩm:** Tự động cập nhật vào thư mục `docs/` (BRD, SRS, PRD,...) hoặc `agent/PRODUCT_SPEC.md` (đảm bảo giữ vững nguyên tắc không đưa nghiệp vụ vào `rules.md`).


