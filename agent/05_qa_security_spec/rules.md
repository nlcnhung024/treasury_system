# RULES KỸ THUẬT DÀNH RIÊNG CHO QA & SECURITY SPECIALIST (@QASecuritySpecialist)

> **Tuân thủ bắt buộc:** QA & Security Specialist phải đối chiếu kiểm thử với [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) và tuân thủ [common_rules.md](../common_rules.md).  
> **Phạm vi tài liệu này:** Quy định các tiêu chuẩn kỹ thuật về phạm vi kiểm thử tự động, độ bao phủ mã nguồn, cô lập môi trường test và quy trình quét bảo mật.

---

## 1. Tiêu chuẩn Tự động hóa & Độ Bao phủ Mã nguồn (Test Automation & Coverage)
- **Độ bao phủ tối thiểu (Code Coverage Threshold):**
  - Module Parsing Engine và Cleansing Pipeline bắt buộc đạt độ bao phủ Unit Test $\ge 90\%$.
  - Toàn bộ hệ thống Backend đạt độ bao phủ kiểm thử tích hợp (Integration Test) $\ge 80\%$.
- **Cổng chất lượng (Quality Gate):** Mọi bản dựng (build) đều phải vượt qua 100% các bộ kiểm thử tự động trước khi chuyển sang môi trường Staging/Production.

## 2. Tiêu chuẩn Cô lập Môi trường & Dữ liệu Kiểm thử (Test Data & Sandbox Isolation)
- **Cô lập tuyệt đối:** Quá trình kiểm thử tự động chỉ được phép thực thi trên Cơ sở dữ liệu Test cô lập hoặc Mock Server. TUYỆT ĐỐI CẤM chạy dữ liệu test trên CSDL Staging/Production.
- **Cơ chế Dọn dẹp (Teardown):** Mọi test case sau khi thực thi xong phải tự động rollback transaction hoặc dọn dẹp sạch sẽ (delete) các tài khoản ngân hàng thử nghiệm (`bank_accounts`), tệp sao kê tải lên (`credit_statement_files`, `bank_statement_files`), và các giao dịch/khoản vay mock. Tuyệt đối không để dữ liệu test tồn đọng trong CSDL làm sai lệch thông tin hiển thị trên UI.
- **Bảo mật Dữ liệu Sao kê Mẫu:** Không sử dụng dữ liệu sao kê thật chứa số tài khoản, danh tính thật của cá nhân/doanh nghiệp. Toàn bộ file mock data phải được ẩn danh hóa (Anonymized / Fuzzed Data).

## 3. Tiêu chuẩn Kiểm thử Biên Kỹ thuật (Boundary & Negative Testing)
QA bắt buộc phải thiết lập các kịch bản kiểm định kỹ thuật tự động cho các trường hợp:
1. **Kiểm thử Tải trọng Kích thước (Payload Limits):**
   - File dung lượng 0 byte (Empty file).
   - File dung lượng $25\text{MB} - 1\text{KB}$ (Biên trên hợp lệ).
   - File dung lượng $25\text{MB} + 1\text{KB}$ (Biên trên không hợp lệ - phải bị chặn ở HTTP 413).
2. **Kiểm thử Tính toàn vẹn Định dạng (Malformed Formats):**
   - File nhị phân bị hỏng (Corrupted zip container của file `.xlsx`).
   - File giả mạo extension (Đổi file thực thi `.exe` hoặc file shell script thành `.xlsx`).
3. **Kiểm thử Ký tự Đặc biệt (Unicode & Special Characters):**
   - Nội dung giao dịch chứa chuỗi Unicode độ dài lớn, emoji, ký tự điều khiển ASCII `\x00` - `\x1F`.

## 4. Tiêu chuẩn Quét An toàn Bảo mật (Security Auditing)
- **Kiểm thử Khai thác Lỗ hổng Bảng tính (Formula Injection Test):** Tự động kiểm tra xem các ô dữ liệu chứa tiền tố `=`, `@`, `+`, `-` có được escape dấu nháy đơn `'` an toàn khi xuất file hay không.
- **Kiểm thử Phân quyền Tài nguyên (Broken Object Level Authorization - BOLA/IDOR):** Kiểm thử tự động bằng cách hoán đổi ID người dùng / ID file để đảm bảo không người dùng nào truy cập được dữ liệu sao kê của người dùng khác.

## 5. Tiêu chuẩn Viết Assertions Kiểm thử Tích hợp & Mô phỏng (Dynamic Assertion Invariant)
Khi viết các test case kiểm thử tích hợp (Integration Tests), thuật toán tối ưu hóa hoặc kiểm thử mô phỏng dòng tiền:
- **Tuyệt đối cấm Hardcoded Magic Numbers:**
  - TUYỆT ĐỐI KHÔNG so sánh bằng (`==`) với một con số cố định được tính nhẩm từ trước trên toàn bảng CSDL dùng chung (ví dụ: cấm `assert total_debt == Decimal("79160540000.00")`), vì khi có test case khác hoặc dữ liệu người dùng nạp thêm vào, assertion này sẽ lập tức bị gãy.
- **Bắt buộc sử dụng Invariant Properties hoặc Relative Deltas:**
  - Kiểm tra tính bảo toàn tài chính: $\sum \text{Dư nợ sau trả} = \text{Dư nợ trước trả} - \text{Số tiền trả gốc}$.
  - Kiểm tra tính hợp lệ cơ bản: `assert total_debt > Decimal("0.00")`, `assert total_loans_count > 0`.
  - Nếu cần kiểm tra chính xác giá trị: Bắt buộc truy vấn trạng thái nền (Baseline Snapshot) ngay đầu hàm test và so sánh độ lệch biến động (Delta) do chính hành vi trong hàm test gây ra.

