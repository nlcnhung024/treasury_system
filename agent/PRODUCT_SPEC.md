# TÀI LIỆU CHÍNH THỨC: MÔ TẢ VÀ YÊU CẦU SẢN PHẨM (PRODUCT SPECIFICATION)

> **Dự án:** Hệ thống Xử lý & Báo cáo Sao kê Ngân hàng Tự động (Bank Statement Processing & Reporting System)  
> **Phiên bản:** 1.0.0  
> **Trạng thái:** Tài liệu gốc chuẩn hóa (Single Source of Truth) về kiến trúc sản phẩm và luồng hệ thống.  
> **Tài liệu Bối cảnh & Yêu cầu:** Toàn bộ Agent BẮT BUỘC phải đọc kết hợp các tài liệu trong thư mục [`docs/`](../docs/) (như `docs/BRD.md`, `docs/SRS.md`, `docs/PRD.md`) để nắm trọn vẹn bối cảnh nghiệp vụ và mục tiêu dự án.

---

## 1. Mục tiêu Sản phẩm (Product Goal)
Tự động hóa toàn bộ quy trình từ tiếp nhận file sao kê ngân hàng thô (Excel/CSV), bóc tách dữ liệu theo từng mẫu ngân hàng, làm sạch, kiểm tra đối soát, lưu trữ an toàn và kết xuất báo cáo tài chính trực quan, chính xác 100%.

---

## 2. Luồng Nghiệp vụ Tổng thể (End-to-End Workflow)

```
[Người dùng Web] 
       │ 1. Upload File Excel sao kê
       ▼
[Module Upload & Ingestion] 
       │ 2. Lưu file gốc vào Object Storage & ghi nhận Metadata
       ▼
[Hàng đợi Bất đồng bộ (Queue)] 
       │ 3. Đưa Job vào hàng đợi xử lý ngầm
       ▼
[Động cơ Đọc theo Mẫu (Template Parser)] 
       │ 4. Bóc tách dữ liệu dựa trên cấu hình mẫu ngân hàng
       ▼
[Pipeline Làm sạch & Đối soát (Cleansing & Reconciliation)] 
       │ 5. Chuẩn hóa ngày, tiền tệ, lọc trùng, đối soát cân bằng số dư
       ▼
[Cơ sở Dữ liệu (Database)] 
       │ 6. Ghi dữ liệu sạch vào DB quan hệ
       ▼
[Module Báo cáo & Xuất dữ liệu (Reporting)] 
       │ 7. Truy vấn, tổng hợp số liệu thu/chi và xuất file Excel/PDF
       ▼
[Giao diện Người dùng Web]
```

---

## 3. Đặc tả Yêu cầu Chi tiết từng Phân hệ (Feature Requirements)

### Phân hệ 1: Tiếp nhận & Upload File (Web Ingestion)
- **Giao diện:** Kéo - thả (Drag & Drop) file sao kê.
- **Hỗ trợ định dạng:** `.xlsx`, `.xls`, `.csv`.
- **Tùy chọn ngân hàng:** Cho phép người dùng chọn ngân hàng phát hành (Vietcombank, Techcombank, ACB, BIDV, MBBank...) hoặc hệ thống tự nhận diện qua nội dung tiêu đề file.
- **Phản hồi người dùng:** Hiển thị thanh tiến trình xử lý thời gian thực (Uploading $\rightarrow$ Parsing $\rightarrow$ Cleansing $\rightarrow$ Completed).

### Phân hệ 2: Lưu trữ File Gốc (Raw File Archiving)
- File Excel gốc phải được lưu trữ nguyên bản trên hệ thống Object Storage độc lập: Kho chính nội bộ bằng MinIO On-Premise và tiến trình sao lưu tự động sang Google Cloud Storage (GCS) để phòng chống thảm họa.
- Đặt tên file theo cấu trúc phân tầng thời gian kèm UUID để tránh ghi đè.
- Tính toán và lưu mã băm SHA-256 của file để ngăn chặn người dùng upload trùng lặp cùng một file.

### Phân hệ 3: Động cơ Đọc Dữ liệu theo Mẫu (Bank Template Parser)
- Không viết code cứng (hardcode) cấu trúc cột của từng ngân hàng.
- Bóc tách theo cấu hình mẫu động (Dynamic Template):
  - Dòng bắt đầu bảng dữ liệu (Header Row Index).
  - Tọa độ cột: Ngày giao dịch, Số tài khoản, Số tiền (Nợ/Có), Số dư sau giao dịch, Số tham chiếu/Mã GD, Diễn giải.
  - Vị trí Metadata đầu/cuối file: Tên chủ tài khoản, Số tài khoản, Kỳ sao kê, Số dư đầu kỳ, Số dư cuối kỳ.

### Phân hệ 4: Làm sạch & Đối soát Dữ liệu (Cleansing & Reconciliation)
- **Chuẩn hóa ngày tháng:** Nhận diện các format `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY HH:mm:ss` đưa về ISO 8601.
- **Chuẩn hóa tiền tệ:** 
  - Loại bỏ ký hiệu tiền tệ, dấu chấm/phẩy phân cách hàng nghìn.
  - Phân loại rõ ràng dòng tiền Thu (Phát sinh Có) và Chi (Phát sinh Nợ).
  - Xử lý số âm kế toán trong ngoặc `(xxx)` thành số âm chuẩn `-xxx`.
- **Đối soát kế toán tự động:**
  $$\text{Số dư cuối kỳ} = \text{Số dư đầu kỳ} + \sum \text{Phát sinh Có (Thu)} - \sum \text{Phát sinh Nợ (Chi)}$$
  Nếu có chênh lệch $\neq 0$, hệ thống phải ghi nhận cờ cảnh báo và đưa vào danh sách cần kế toán kiểm tra lại.
- **Lọc trùng lặp giao dịch (Deduplication):** Nhận diện giao dịch bị import lặp thông qua mã băm giao dịch (Số tài khoản + Ngày + Số tiền + Mã GD).

### Phân hệ 5: Lưu trữ Cơ sở Dữ liệu (Database Persistence)
- Lưu trữ toàn bộ giao dịch vào các bảng quan hệ với độ chính xác cao (`DECIMAL(18, 2)`).
- Lưu liên kết giữa giao dịch với file sao kê gốc (`file_id`).
- Hỗ trợ lưu trữ lịch sử xử lý (Audit Log).

### Phân hệ 6: Trích xuất Báo cáo & Trực quan hóa (Reporting & Analytics)
- **Bộ lọc đa chiều:** Theo khoảng ngày, số tài khoản, loại thu/chi, khoảng số tiền, từ khóa nội dung.
- **Báo cáo Tồn quỹ Hợp nhất & Điều hành Thanh khoản Đa kỳ (Báo cáo CFO - Ông Trần Ngọc Tuấn trước 9h00 sáng):**
  - Hỗ trợ chọn kỳ báo cáo linh hoạt (`TODAY`, `YESTERDAY`, `WTD`, `MTD`, `ALL`, `CUSTOM` Từ ngày - Đến ngày) với đủ 5 cột biến động số học `DECIMAL(18, 2)`: **Số dư đầu kỳ $\rightarrow$ Tổng Thu $\rightarrow$ Tổng Chi $\rightarrow$ Số dư cuối kỳ $\rightarrow$ Chênh lệch ròng ($\pm$ và %)**.
  - Phân nhóm cấu trúc hệ thống Tài khoản Ngân hàng thành **2 Khối nguồn tiền** (**bỏ phần tiền mặt tại quỹ, không cộng quỹ tiền mặt vào tổng tồn quỹ**): (1) Khối Tài khoản Doanh nghiệp (`CORPORATE`) và (2) Khối Tài khoản Ủy quyền CEO (`SPECIAL_CASH`), kèm dòng Tiểu tổng từng khối và Dòng Tổng cộng Hợp nhất toàn hệ thống (Khối 1 + Khối 2).
  - Hỗ trợ bật/tắt **Loại trừ luân chuyển nội bộ** trên Tổng Thu/Chi hợp nhất, hiển thị bộ 3 chỉ số quản trị trên từng tài khoản (**Tỷ trọng %**, **Trạng thái Đối soát `BALANCED`/`DISCREPANCY`/`UNANCHORED`**, **Thời điểm cập nhật gần nhất**), biểu đồ phân bổ nguồn tiền theo ngân hàng, **Drill-down trực tiếp** xem giao dịch phát sinh của từng tài khoản ngay trên bảng và **Xuất Excel Báo cáo Tồn quỹ CFO** chuẩn kế toán.
- **Biểu đồ Thác nước Waterfall Thu/Chi (Báo cáo CEO - Bà Nguyễn Thị Lan Anh):** Tự động sinh biểu đồ Waterfall phân rã chi tiết từng cấu phần Thu và Chi từ số dư đầu kỳ đến số dư cuối kỳ, hỗ trợ xem theo lũy kế tuần (WTD) và lũy kế tháng (MTD).
- **Giao diện tự quản lý quy tắc phân loại & Điều kiện nâng cao (Self-Service Rule Management UI):** Cung cấp màn hình trực quan cho phép người dùng tự tạo/chỉnh sửa danh mục Thu/Chi, thiết lập điều kiện kết hợp (Từ khóa nội dung, Số tài khoản ngân hàng, Loại phát sinh, Ngưỡng số tiền), sắp xếp độ ưu tiên và chủ động bấm "Chạy lại quy tắc".
- **Phân loại thủ công & Khóa chống ghi đè (Manual Inline Tagging & Override Protection):** Cho phép người dùng click chọn danh mục trực tiếp trên bảng hoặc chọn hàng loạt dòng để gán nhãn thủ công cho các giao dịch đặc thù/ngoại lệ; gắn cờ khóa bảo vệ không cho phép quy tắc tự động ghi đè lên các dòng đã phân loại tay.
- **Quản lý Ghi chú Nội bộ (Internal Transaction Notes):** Cho phép nhập, chỉnh sửa và lưu trữ ghi chú (`internal_note`) trực tiếp trên từng dòng giao dịch để giải trình nội bộ.
- **Hiệu chỉnh Điểm neo Số dư Lũy kế & Lan truyền 2 Chiều (Anchor Running Balance Recalculation):** Cho phép chỉnh sửa trực tiếp `running_balance` tại một dòng giao dịch bất kỳ trên Bảng Giao dịch làm mốc căn cứ để tự động tính lại toàn bộ chuỗi số dư lũy kế (xuôi & ngược) và đồng bộ số dư đầu/cuối kỳ cho tài khoản đó (đặc biệt phục vụ mẫu sổ phụ cá nhân khuyết cột số dư).
- **Xuất Báo cáo Excel Chuẩn Mực Kế toán:** Xuất file `.xlsx` định dạng sẵn ngày tháng `DD/MM/YYYY`, định dạng tiền tệ kế toán `#,##0.00` căn phải, có dòng `TỔNG CỘNG` tự động tính và bảo đảm an toàn chống Formula Injection.

