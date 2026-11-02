# ĐẶC TẢ BÀI TOÁN KINH DOANH VÀ GIẢI PHÁP KỸ THUẬT: ĐỐI SOÁT CHI TRẢ NỢ VAY & TỰ ĐỘNG GIẢM TRỪ DƯ NỢ GỐC/LÃI (US-07.9)

## 1. Bối cảnh Kinh doanh & Vấn đề Thực tế (Business Problem)
Doanh nghiệp hiện đang duy trì danh mục gồm 37+ khoản vay tín dụng ngắn hạn tại các ngân hàng thương mại (chủ đạo là VietinBank - CTG và MBBank - MBB) với tổng dư nợ lên tới hàng chục tỷ đồng. Hằng tháng, dòng tiền chi từ các tài khoản thanh toán của doanh nghiệp liên tục phát sinh các giao dịch trả nợ ngân hàng.

### Thực trạng nghiệp vụ trước khi có giải pháp:
1. **Dòng tiền chi trả nợ bị phân tán:** Trên sao kê tài khoản thanh toán, ngân hàng tự động trích nợ (auto-debit) hoặc kế toán lập ủy nhiệm chi (UNC) thanh toán nợ với các nội dung diễn giải khác nhau:
   - Trả nợ gốc đúng hạn hoặc trước hạn (ví dụ: `Tra no khoan vay 805007289545, Goc: 5,000,000,000 VND`).
   - Trích thu lãi định kỳ hằng tháng (ví dụ: `Thu lai khe uoc: LD2623006063`, `THU LAI TK: 040MAZS262180006`).
   - Tất toán gộp cả gốc và lãi trong cùng một giao dịch (ví dụ: `Tat toan khoan vay 807007327618, So tien goc: 4,483,000,000 VND, Lai cong don: 14,001,699 VND`).
2. **Quy trình thủ công gây trễ và sai lệch số liệu:**
   - Kế toán (Chị Cẩm Nhung) phải đối chiếu thủ công từng dòng tiền chi trên sao kê thanh toán với danh mục khế ước vay trên file Excel hoặc phần mềm kế toán.
   - Khi giao dịch bao gồm cả gốc và lãi, việc bóc tách số tiền trả gốc để giảm trừ nợ gốc thường mất nhiều thời gian, dễ gây nhầm lẫn dẫn tới lệch số dư nợ gốc thực tế so với sổ phụ tín dụng của ngân hàng.
3. **Mất dấu vết kiểm toán thời điểm trả nợ (Audit Trail Disconnect):**
   - Thời điểm kế toán nhập liệu lên phần mềm thường lệch vài ngày đến vài tuần so với thời điểm ngân hàng trích nợ thực tế trên sao kê. Điều này dẫn tới tính sai ngày chịu lãi (theo Thông tư 14/2017/TT-NHNN) và gây khó khăn cho CFO (Ông Tuấn) khi lập báo cáo dòng tiền và thanh khoản ròng.

---

## 2. Mục tiêu Nghiệp vụ (Business Objectives)
1. **Tự động lọc giao dịch chi trả nợ:** Hệ thống tự động phát hiện mọi khoản chi (`debit_amount > 0`) đã được phân loại vào danh mục **"Trả nợ"** (Category ID = 25) trên toàn bộ các tài khoản ngân hàng.
2. **Gợi ý khế ước thông minh:** Tự động trích xuất số khế ước (VietinBank 12 số `80xxxxxxxxxx`, MBBank `LDxxxxxxxxxx`, `040MAZS...`) và số tiền gốc/lãi gợi ý từ nội dung sao kê.
3. **Khung chia Gốc & Lãi trực quan:** Giao diện đối soát cho phép người dùng chia tách số tiền gốc và lãi với ràng buộc toán học tuyệt đối:
   $$\text{Số tiền trả gốc} + \text{Số tiền trả lãi} = \text{Tổng giá trị giao dịch chi}$$
   Cung cấp nút bấm một chạm **[100% Trả Gốc]** để tự động gán toàn bộ số tiền là trả gốc mà không cần tính toán thủ công.
4. **Tự động giảm trừ dư nợ gốc:** Cập nhật ngay lập tức `current_principal_balance = current_principal_balance - principal_amount` trên khoản vay tương ứng. Tự động chuyển trạng thái khoản vay sang `SETTLED` khi dư nợ gốc về 0.
5. **Ghi nhận lịch sử chuẩn kiểm toán:** Lưu nhật ký trả nợ với **thời điểm trả nợ đúng bằng thời điểm giao dịch trên sao kê ngân hàng** (`repayment_date = transaction_date`).
6. **Hỗ trợ hoàn tác (Rollback):** Cho phép kế toán hủy đối soát an toàn nếu phát hiện đối chiếu nhầm khoản vay, tự động khôi phục lại số dư nợ gốc ban đầu.

---

## 3. Kiến trúc Giải pháp Kỹ thuật (Technical Solution Architecture)

### 3.1. Cấu trúc Bảng Cơ sở Dữ liệu (`loan_repayment_history`)
Bảng chuyên dụng ghi nhận từng lần đối soát trả nợ giữa giao dịch sao kê và khoản vay tín dụng:
- `repayment_id`: Khóa chính định danh lần trả nợ.
- `loan_id`: Khóa ngoại tham chiếu đến hợp đồng vay/khế ước (`credit_facilities.loan_id`).
- `transaction_id`: Khóa ngoại tham chiếu đến dòng giao dịch sao kê (`bank_transactions.transaction_id`), ràng buộc `UNIQUE` để ngăn chặn đối soát trùng lặp 2 lần cho cùng một giao dịch.
- `contract_number`: Số khế ước nhận nợ (ví dụ: `807007327618`).
- `bank_code`: Mã ngân hàng (`CTG`, `MBB`, `BIDV`,...).
- `repayment_date`: Thời điểm trả nợ **chính xác bằng `transaction_date`** của giao dịch sao kê.
- `principal_amount`: Số tiền nợ gốc được giảm trừ (`DECIMAL(18, 2)`).
- `interest_amount`: Số tiền trả lãi (`DECIMAL(18, 2)`).
- `total_amount`: Tổng số tiền giao dịch (`DECIMAL(18, 2)`).
- `previous_principal_balance`: Dư nợ gốc trước khi giảm trừ (lưu vết kiểm toán).
- `remaining_principal_balance`: Dư nợ gốc sau khi giảm trừ.
- `notes`: Ghi chú đối soát của kế toán.
- `reconciled_by`: Người thực hiện (ví dụ: `nhung.nghiem`).
- `created_at`: Thời điểm bấm nút đối soát trên hệ thống.

Ràng buộc tính toàn vẹn cấp CSDL:
```sql
CONSTRAINT chk_repayment_split CHECK (principal_amount + interest_amount = total_amount),
CONSTRAINT chk_repayment_amounts_non_negative CHECK (principal_amount >= 0 AND interest_amount >= 0)
```

### 3.2. Thuật toán Trích xuất & Gợi ý Khế ước (Regex Extraction Engine)
Hệ thống sử dụng các biểu thức chính quy (Regular Expressions) để quét nội dung diễn giải `description`:
- **VietinBank (CTG):** Quét dãy 12 chữ số liên tiếp (`\b80\d{10}\b`), các mẫu `khoan vay (\d{12})`, `TK: (\d{12})`.
- **MBBank (MBB):** Quét mã khế ước `LD\d{10}`, `PDLD\d{10}`, `\b\d{3}MAZS\d{9}\b`.
- **Bóc tách Gốc/Lãi:** Quét từ khóa `Goc:\s*([\d,.]+)` và `Lai[^:]*:\s*([\d,.]+)` để điền trước số tiền gợi ý cho kế toán.

### 3.3. Quy trình Giao dịch Nguyên tử (Atomic Reconciliation Transaction)
Khi kế toán xác nhận đối soát:
1. Mở Transaction với khóa dòng `SELECT ... FOR UPDATE` trên cả `CreditFacility` và `BankTransaction`.
2. Kiểm tra `transaction_id` chưa từng tồn tại trong `loan_repayment_history`.
3. Kiểm tra $\text{principal\_amount} + \text{interest\_amount} == \text{transaction.debit\_amount}$.
4. Kiểm tra $\text{principal\_amount} \le \text{loan.current\_principal\_balance}$.
5. Cập nhật `loan.current_principal_balance = loan.current_principal_balance - principal_amount`.
6. Nếu `loan.current_principal_balance == 0`, cập nhật `loan.status = 'SETTLED'`.
7. `INSERT` vào `loan_repayment_history` với `repayment_date = transaction.transaction_date`.
8. `INSERT` vào `audit_logs` với `action = 'REPAYMENT_RECONCILED'`.
9. `COMMIT` Transaction.

### 3.4. Giao diện Người dùng Khung chia Gốc - Lãi Trực quan
Giao diện bao gồm:
- **Thanh đo tỷ lệ (Visual Split Bar):** Hiển thị trực quan tỷ lệ % Gốc (xanh dương) và % Lãi (vàng cam).
- **Nút bấm 1-click:**
  - `[100% Trả Gốc]`: Gán ngay `principal = debit_amount`, `interest = 0`.
  - `[100% Trả Lãi]`: Gán ngay `interest = debit_amount`, `principal = 0`.
- **Cơ chế cân bằng tự động 2 chiều:** Khi sửa ô Gốc, ô Lãi tự động tính lại bằng $\text{Tổng} - \text{Gốc}$, và ngược lại.
- **Huy hiệu Tất toán:** Khi số tiền trả gốc bằng toàn bộ dư nợ hiện tại, hiển thị huy hiệu xanh lá thông báo khoản vay sẽ chuyển sang trạng thái "TẤT TOÁN".
- **Tab Lịch sử Trả nợ:** Hiển thị toàn bộ lịch sử các lần trả nợ với thời điểm giao dịch thực tế và nút Hoàn tác (Rollback) an toàn.
