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
- **Tiền tố Định danh Dữ liệu Test (Mandatory Test Prefix):** Toàn bộ dữ liệu test (tài khoản, khoản vay, khế ước, số hóa đơn) phải luôn bắt đầu bằng tiền tố `TEST-` hoặc `TEST_` để phục vụ tự động nhận diện và quét dọn cô lập.
- **Cơ chế Dọn dẹp Hai Đầu (Pre-Clean & Post-Teardown):** Mọi test case sau khi thực thi xong phải tự động rollback transaction hoặc dọn dẹp sạch sẽ (delete) các tài khoản ngân hàng thử nghiệm (`bank_accounts`), tệp sao kê tải lên (`credit_statement_files`, `bank_statement_files`), hóa đơn (`invoices`), và các giao dịch/khoản vay mock. Bắt buộc đặt trong `finally:` hoặc teardown fixture, đồng thời pre-clean đầu vào để dọn sạch dữ liệu test còn tồn đọng trước đó.
- **Dọn dẹp File Vật lý (Physical Storage Cleanup):** Khi test tạo các file tải lên trong `backend/storage/`, teardown bắt buộc phải `unlink()` xóa bỏ toàn bộ file vật lý trên đĩa, không để lại tệp rác mồ côi.
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

## 6. Tiêu chuẩn Kiểm thử Bảng Dữ liệu & Lưới Tương tác (Data Grid Testing Standard)
Khi viết kịch bản kiểm thử E2E / Component Test cho giao diện bảng dữ liệu:
- **Kiểm thử Sắp xếp (Sort):** Xác thực thứ tự hiển thị của các hàng khi click sort tăng dần/giảm dần đối với chuỗi tiếng Việt (có dấu), số tiền (Decimal) và ngày tháng (ISO 8601).
- **Kiểm thử Bộ lọc (Filter):**
  - Cột Text: Kiểm tra đúng điều kiện chuỗi (chứa, bằng chính xác, bắt đầu bằng, không phân biệt hoa thường và không lỗi ký tự Unicode tiếng Việt).
  - Cột Số / Ngày: Kiểm tra đúng điều kiện lọc khoảng `[Min, Max]` / `[Từ ngày, Đến ngày]`, bao gồm cả giá trị cận biên (inclusive boundary) và trường hợp chỉ nhập 1 đầu khoảng.
- **Kiểm thử Ẩn/Hiện Cột (Column Visibility):** Kiểm tra khi bỏ chọn checkbox thì cột ẩn hoàn toàn khỏi DOM/table, không làm xô lệch các cột còn lại; khi bật lại hiển thị đúng vị trí ban đầu; kiểm tra trạng thái lưu trữ trong `localStorage`.
- **Kiểm thử Thay đổi Độ rộng Cột (Column Resizing):** Kiểm tra thao tác kéo dãn chuột không làm vỡ layout, không co nhỏ hơn `minWidth`, và nội dung quá dài hiển thị `text-ellipsis` kèm tooltip.

