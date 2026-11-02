# TÀI LIỆU CHÍNH THỨC: MÔ TẢ VÀ YÊU CẦU SẢN PHẨM (PRODUCT SPECIFICATION)

> **Dự án:** Hệ thống Xử lý & Báo cáo Sao kê Ngân hàng Tự động (Bank Statement Processing & Reporting System)  
> **Mã dự án:** `BSP-2026`  
> **Phiên bản:** 1.2.0  
> **Ngày cập nhật:** 2026-10-31  
> **Trạng thái:** Tài liệu gốc chuẩn hóa (Single Source of Truth) về kiến trúc sản phẩm, tính năng và luồng hệ thống.  
> **Tài liệu Bối cảnh & Yêu cầu:** Toàn bộ Agent BẮT BUỘC phải đọc kết hợp các tài liệu trong thư mục [`docs/`](../docs/) (như `docs/BRD.md`, `docs/Bank_Mapping_Matrix.md`, `docs/SAD.md`, `docs/api_contracts.yaml`, `docs/security_threat_modeling.md`) để nắm trọn vẹn bối cảnh nghiệp vụ và mục tiêu dự án.

---

## 1. Mục tiêu Sản phẩm (Product Goal)
Tự động hóa toàn diện quy trình từ tiếp nhận các file sao kê ngân hàng thô (sao kê tài khoản thanh toán và sao kê tín dụng/khoản vay) định dạng Excel/CSV, tự động bóc tách dữ liệu theo mẫu động của $\ge 7$ ngân hàng thương mại, chuẩn hóa làm sạch số liệu, đối soát kế toán cân bằng số dư và tổng dư nợ với độ chính xác tuyệt đối 100%, quản trị danh mục khoản vay hiện hành và kết xuất báo cáo điều hành tài chính chuyên nghiệp phục vụ Ban Lãnh đạo (CFO, CEO) trước 9h00 sáng mỗi ngày.

---

## 2. Luồng Nghiệp vụ Tổng thể (End-to-End Workflow)

```
[Người dùng Web (Chị Cẩm Nhung)]
       │
       ├─────────────────────────────────────────┐
       ▼ (1a. Nạp Sao kê Tài khoản)               ▼ (1b. Nạp Sao kê Tín dụng / Khoản vay)
[Module Ingestion Tài khoản]              [Module Ingestion Tín dụng]
       │                                         │
       ├─────────────────────────────────────────┘
       ▼ 2. Lưu file gốc nguyên bản vào Object Storage (MinIO Primary + GCS Backup)
       ▼    & Sinh mã băm SHA-256 chặn trùng lặp 100%
[Hàng đợi Bất đồng bộ (Redis 7.0+ Streams)]
       │ 3. Đưa Job bóc tách vào hàng đợi xử lý ngầm (Chunking Stream, tránh OOM)
       ▼
[Động cơ Đọc theo Mẫu (Universal & Credit Parsers)]
       │ 4a. Tra cứu mẫu tài khoản (bank_templates_config.yaml - 7 mẫu & canonical aliases)
       │ 4b. Tra cứu mẫu tín dụng (credit_templates_config.yaml - CTG_LOAN_XLS, MBB_LOAN_LD_XLSX)
       ▼
[Pipeline Làm sạch, Chuẩn hóa & Đối soát]
       │ 5a. Chuẩn hóa ngày ISO 8601, tiền tệ Decimal(18, 2), băm dedup_hash 6 thành phần
       │ 5b. Đối soát cân bằng số dư tài khoản 5 chế độ (MODE_1 .. MODE_5)
       │ 5c. Đối soát tổng dư nợ khoản vay: ∑ Dư nợ khế ước = Tổng dư nợ ghi trên file
       ▼
[Cơ sở Dữ liệu Quan hệ (PostgreSQL 15+)]
       │ 6. Bulk Insert giao dịch & Upsert danh mục khoản vay hiện hành (credit_facilities)
       ▼
[Module Báo cáo & Trực quan hóa (Reporting & Analytics)]
       │ 7a. Báo cáo CFO: Tồn quỹ hợp nhất (2 khối NH) & Thanh khoản Ròng (Net Liquidity)
       │ 7b. Báo cáo CEO: Biểu đồ Thác nước (Waterfall Chart) Thu/Chi (WTD / MTD)
       │ 7c. Quản lý Quy tắc Phân loại (Rule Engine UI) & Inline Tagging / Ghi chú
       │ 7d. Xuất Báo cáo Excel Kế toán Chuẩn mực (Chống Formula Injection)
       ▼
[Giao diện Người dùng Web SPA (React 18 + TypeScript)]
```

---

## 3. Đặc tả Yêu cầu Chi tiết từng Phân hệ (Feature Requirements)

### Phân hệ 1: Tiếp nhận & Upload File (Web Ingestion)
- **Giao diện:** Kéo - thả (Drag & Drop) đa file trực quan, hỗ trợ xem trước danh sách file, trạng thái và dung lượng.
- **Hỗ trợ định dạng:**
  - Sao kê tài khoản thanh toán: `.xlsx` (OOXML), `.xls` (BIFF8), `.csv` (dung lượng tối đa 25MB/file).
  - Sao kê tín dụng/khoản vay: `.xls` (BIFF8 OLE2 - VietinBank eFAST), `.xlsx` (OOXML - MB).
- **Tự động nhận diện mẫu (Auto-Detection):**
  - Bước 1: Kiểm tra Magic Bytes nhị phân (`50 4B 03 04` cho `.xlsx`, `D0 CF 11 E0 A1 B1 1A E1` cho `.xls`).
  - Bước 2: Quét chữ ký tiêu đề (Signatures) trong 25 dòng đầu tiên để tự nhận diện mẫu ngân hàng mà không cần người dùng chọn tay.
- **Phản hồi người dùng:** Hiển thị thanh tiến trình xử lý thời gian thực qua WebSocket/Polling (`Uploading` $\rightarrow$ `Parsing` $\rightarrow$ `Cleansing` $\rightarrow$ `Reconciling` $\rightarrow$ `Completed`).

### Phân hệ 2: Lưu trữ File Gốc (Raw File Archiving & Chống trùng)
- **Kiến trúc Hybrid Object Storage:** File Excel/CSV gốc được lưu trữ nguyên bản trên cụm MinIO On-Premise nội bộ (Primary WORM Storage) và tự động đồng bộ sang Google Cloud Storage (GCS Coldline/Archive) phục vụ phòng chống thảm họa (Disaster Recovery).
- **Phân cấp đường dẫn định danh:**
  - Sao kê tài khoản: `/statements/{bank_code}/{YYYY}/{MM}/{file_uuid}_{sanitized_filename}.ext`
  - Sao kê tín dụng: `/credit_statements/{bank_code}/{YYYY}/{file_uuid}_{sanitized_filename}.ext`
- **Chống trùng lặp tuyệt đối:** Tính toán mã băm `file_sha256` (`CHAR(64)`) trên luồng byte gốc. Chặn $100\%$ file trùng lặp ngay tại Gateway với mã phản hồi HTTP `409 Conflict`.
- **Bảo mật truy cập:** File lưu trữ Private, sinh Pre-signed URL với thời gian sống tối đa 15 phút khi người dùng cần tải file gốc để đối chiếu.

### Phân hệ 3: Động cơ Đọc Dữ liệu theo Mẫu Động (Bank & Credit Template Parsers)
- **Kiến trúc Zero-Code Onboarding:** Không viết code cứng (hardcode) cấu trúc cột của từng ngân hàng. Toàn bộ cấu hình bóc tách được quản trị qua declarative YAML:
  - `backend/app/services/parser/bank_templates_config.yaml`: Quản lý 7 mẫu sao kê tài khoản thực tế (`MBB_CORP_XLSX`, `MBB_PERSONAL_XLSX`, `MBV_CORP_XLSX`, `VPB_CORP_XLSX`, `TPB_CORP_XLSX`, `CTG_EFAST_XLS`, `SHB_CORP_XLS`) cùng từ điển đồng nghĩa `canonical_header_aliases` tự động nhận diện cột cho ngân hàng mới (VCB, TCB, BIDV, ACB...) trong $\le 15$ phút.
  - `backend/app/services/parser/credit_templates_config.yaml`: Quản lý các mẫu sao kê tín dụng (`CTG_LOAN_XLS`, `MBB_LOAN_LD_XLSX`).
- **Độc lập Pháp nhân (Entity-Agnostic):** Tự động bóc tách động Tên chủ tài khoản, Số tài khoản, Mã số thuế (`tax_code`, `account_holder`), cho phép dùng chung một cấu hình mẫu để xử lý cho nhiều doanh nghiệp khác nhau trong tập đoàn.
- **Xử lý bảng dữ liệu phức tạp:** Tự động unmerge ô gộp (Merged Cells), bỏ qua dòng trống xen kẽ, bóc tách chính xác kể cả các mẫu bảng bắt đầu thụt lề hoặc khuyết cột STT.

### Phân hệ 4: Làm sạch & Đối soát Dữ liệu (Cleansing & Reconciliation Engine)
- **Chuẩn hóa Thời gian:** Nhận diện và chuyển đổi mọi định dạng ngày giờ nguồn (`DD/MM/YYYY HH:mm:ss`, `DD/MM/YYYY HH:mm`, `DD-MM-YYYY`, `YYYY-MM-DD`) về chuẩn ISO 8601 có múi giờ Việt Nam (`+07:00`).
- **Chuẩn hóa Tiền tệ Độ chính xác Tuyệt đối:**
  - Chuyển đổi $100\%$ chuỗi tiền tệ (US comma, VN dot, dấu cách, số âm trong ngoặc đơn `(xxx)`) sang kiểu `DECIMAL(18, 2)`.
  - Bảo toàn định dạng số mũ Scientific Notation (như `1.441E8`) từ XML/Excel trước khi ép kiểu `Decimal`. Cấm tuyệt đối kiểu dấu phẩy động nhị phân (`FLOAT`, `DOUBLE`).
- **Đối soát Số dư Tài khoản 5 Chế độ (`MODE_1` đến `MODE_5`):**
  $$\text{Số dư cuối kỳ tính toán} = \text{Số dư đầu kỳ} + \sum \text{Phát sinh Có (Thu)} - \sum \text{Phát sinh Nợ (Chi)}$$
  $$\text{Độ lệch} \ (\Delta) = |\text{Số dư cuối kỳ thực tế} - \text{Số dư cuối kỳ tính toán}|$$
  - Nếu $\Delta = 0.00 \rightarrow$ Ghi nhận `reconciliation_status = 'BALANCED'` (Khớp 100%).
  - Nếu $\Delta \neq 0.00 \rightarrow$ Ghi nhận `reconciliation_status = 'DISCREPANCY'`, hiển thị cảnh báo đỏ và lưu số tiền chênh lệch.
- **Chỉ báo Khoảng trống Dữ liệu Sao kê (Statement Data Gap / Lệch số dư ĐK - CK):**
  - Tự động quét và phát hiện các trường hợp lệch số dư giữa các kỳ sao kê: số dư cuối kỳ trước $\neq$ số dư đầu kỳ sau giữa các file sao kê, hoặc số dư sau giao dịch chốt kỳ trước $\neq$ số dư mở đầu kỳ hiện tại (không phụ thuộc vào khoảng cách số ngày).
  - Tự động chuẩn hóa Số dư đầu kỳ theo số dư mở sổ thực tế của sao kê kỳ báo cáo để Số dư cuối kỳ trên Bảng Tổng hợp luôn khớp 100% với giao dịch chốt thực tế của ngân hàng.
  - Bật cờ cảnh báo `has_data_gap = True` ("Lệch số dư ĐK/CK") kèm mô tả chi tiết số tiền chênh lệch giữa hai mốc kỳ sao kê trên giao diện để kế toán kịp thời nạp bổ sung sao kê các kỳ còn thiếu.
- **Bảo vệ Số dư Hiện hành khi Nạp file Quá khứ:**
  - Hệ thống chỉ cập nhật `current_balance` trong bảng `bank_accounts` nếu kỳ kết thúc (`statement_period_end`) của file sao kê mới nạp lớn hơn hoặc bằng kỳ sao kê hiện có, ngăn ngừa tuyệt đối việc nạp file năm cũ ghi đè số dư của năm hiện tại.
- **Băm Chống trùng Dòng Giao dịch (6-Tuple Canonical Hash):**
  $$\text{dedup\_hash} = \text{SHA256}(\text{account\_number} \parallel \text{"|"} \parallel \text{trans\_date\_iso} \parallel \text{"|"} \parallel \text{debit} \parallel \text{"|"} \parallel \text{credit} \parallel \text{"|"} \parallel \text{ref\_no} \parallel \text{"|"} \parallel \text{running\_balance})$$
  Phân biệt chính xác $100\%$ các giao dịch tách Phí/VAT có cùng mã tham chiếu và cùng giây giao dịch.

### Phân hệ 5: Lưu trữ Cơ sở Dữ liệu Quan hệ (Database Persistence - 3NF)
- Cơ sở dữ liệu PostgreSQL 15+ chuẩn hóa 3NF, lưu trữ 10 bảng và view nghiệp vụ:
  1. `bank_accounts`: Danh mục tài khoản ngân hàng và tài khoản ủy quyền CEO.
  2. `bank_statement_files`: Metadata file sao kê tài khoản và trạng thái đối soát.
  3. `bank_transactions`: Dòng giao dịch chi tiết, đối tượng thụ hưởng/chuyển (`counter_party`), cờ khóa ghi đè, ghi chú nội bộ.
  4. `categories`: Danh mục Thu/Chi do người dùng tự tạo trên giao diện.
  5. `classification_rules`: Bộ quy tắc từ khóa kết hợp điều kiện đa trường (AND/OR).
  6. `cash_ledger`: Sổ theo dõi dòng tiền mặt đối ứng từ TK MBBank của CEO.
  7. `audit_logs`: Nhật ký kiểm toán bất biến (Trigger cấm UPDATE/DELETE).
  8. `credit_statement_files`: Metadata file sao kê tín dụng và kết quả đối soát dư nợ.
  9. `credit_facilities`: Danh mục hợp đồng vay và khế ước LD hiện hành.
  10. `credit_statement_items`: Snapshot chi tiết từng khoản vay theo từng file sao kê.
  11. View `v_cfo_daily_liquidity` & `v_cfo_debt_obligations`: Báo cáo hợp nhất tốc độ cao (< 100ms).

### Phân hệ 6: Trích xuất Báo cáo & Trực quan hóa (Reporting & Analytics)
- **Bộ lọc đa chiều:** Theo khoảng ngày, tài khoản ngân hàng, loại thu/chi, khoảng số tiền, từ khóa nội dung diễn giải.
- **Báo cáo Tồn quỹ Hợp nhất CFO (Ông Trần Ngọc Tuấn - Trước 9h00 sáng):**
  - Hỗ trợ chọn kỳ báo cáo linh hoạt (`TODAY`, `YESTERDAY`, `WTD`, `MTD`, `ALL`, `CUSTOM` Từ ngày - Đến ngày) với đủ 5 cột biến động số học `DECIMAL(18, 2)`: **Số dư đầu kỳ $\rightarrow$ Tổng Thu $\rightarrow$ Tổng Chi $\rightarrow$ Số dư cuối kỳ $\rightarrow$ Chênh lệch ròng ($\pm$ và %)**.
  - Phân nhóm cấu trúc hệ thống Tài khoản Ngân hàng thành **2 Khối nguồn tiền** (**bỏ phần tiền mặt tại quỹ, không cộng quỹ tiền mặt vào tổng tồn quỹ**):
    1. **Khối 1:** Tài khoản Thanh toán Doanh nghiệp (`CORPORATE`).
    2. **Khối 2:** Tài khoản Ủy quyền CEO (`SPECIAL_CASH` - MBBank cá nhân Bà Nguyễn Thị Lan Anh).
    Kèm dòng Tiểu tổng từng khối và Dòng Tổng cộng Hợp nhất toàn hệ thống (Khối 1 + Khối 2).
  - Hỗ trợ bật/tắt **Loại trừ luân chuyển nội bộ** trên Tổng Thu/Chi hợp nhất để tách bạch dòng tiền thực với đối tác bên ngoài.
  - Hiển thị bộ 3 chỉ số quản trị trên từng tài khoản: **Tỷ trọng %**, **Trạng thái Đối soát** (`BALANCED`/`DISCREPANCY`/`UNANCHORED`), **Thời điểm cập nhật gần nhất**.
  - **Biểu đồ phân bổ nguồn tiền** theo ngân hàng và so sánh Thu - Chi theo từng tài khoản.
  - **Inline Drill-down trực tiếp:** Bấm vào bất kỳ dòng tài khoản nào trên bảng sẽ mở rộng danh sách giao dịch phát sinh trong kỳ của riêng tài khoản đó, có lọc Thu/Chi và sắp xếp số tiền giảm dần.
  - **Xuất Excel Báo cáo Tồn quỹ CFO:** Xuất file `.xlsx` Báo cáo Tồn quỹ định dạng kế toán chuẩn mực (`/api/v1/reports/cfo/export-excel`).
- **Tích hợp Thanh khoản Ròng CFO (Net Liquidity):**
  Dashboard CFO tự động tích hợp số liệu dư nợ vay từ phân hệ Tín dụng để giám sát thanh khoản ròng:
  $$\text{Thanh khoản Ròng (Net Liquidity)} = \text{Tổng tồn quỹ hợp nhất} - \text{Nghĩa vụ nợ gốc \& lãi đến hạn kỳ tới}$$
- **Biểu đồ Thác nước Waterfall Thu/Chi (Báo cáo CEO - Bà Nguyễn Thị Lan Anh):** Tự động sinh biểu đồ Waterfall phân rã chi tiết từng cấu phần Thu và Chi từ số dư đầu kỳ đến số dư cuối kỳ, hỗ trợ xem theo lũy kế tuần (WTD) và lũy kế tháng (MTD).
- **Giao diện tự quản lý quy tắc phân loại (Self-Service Rule Management UI):** Màn hình trực quan cho phép người dùng tự tạo/sửa danh mục Thu/Chi, thiết lập điều kiện kết hợp (Từ khóa, Số tài khoản, Chiều dòng tiền, Ngưỡng số tiền), sắp xếp độ ưu tiên và chủ động bấm "Chạy lại quy tắc".
- **Danh sách Giao dịch Chi tiết (Transaction Ledger):** Hiển thị trực quan Ngày giờ GD, Ngân hàng/Số TK, Đối tượng thụ hưởng hoặc đối tượng chuyển (`counter_party` - hiển thị rõ ràng, nếu file sao kê không có cột đối ứng thì để trống), Nội dung diễn giải, Phát sinh Nợ/Có, Số dư lũy kế, Danh mục phân loại (Inline Tagging), Ghi chú nội bộ và Trạng thái khóa ghi đè.
- **Phân loại thủ công & Khóa chống ghi đè (Manual Inline Tagging & Override Protection):** Cho phép click chọn danh mục trực tiếp trên bảng hoặc chọn hàng loạt dòng để gán nhãn thủ công; tự động gắn cờ `is_manual_override = true` ngăn chặn mọi quy tắc tự động đè lên dữ liệu đã sửa tay.
- **Quản lý Ghi chú Nội bộ (Internal Transaction Notes):** Nhập, sửa và lưu trữ ghi chú (`internal_note`) trực tiếp trên từng dòng giao dịch để giải trình nội bộ.
- **Hiệu chỉnh Điểm neo Số dư Lũy kế & Lan truyền 2 Chiều (Anchor Balance Recalculation):** Cho phép chỉnh sửa trực tiếp `running_balance` tại một dòng giao dịch bất kỳ để tự động tính lại toàn bộ chuỗi số dư lũy kế (xuôi & ngược) và đồng bộ số dư đầu/cuối kỳ cho tài khoản đó (đặc thù mẫu sổ phụ cá nhân MBBank).
- **Xuất Báo cáo Excel An toàn:** Xuất file `.xlsx` chuẩn kế toán (`DD/MM/YYYY`, format số `#,##0.00` căn phải, dòng `TỔNG CỘNG` tự động tính), escape ký tự đầu dòng (`=`, `+`, `-`, `@`) chống triệt để lỗ hổng Formula/CSV Injection.

### Phân hệ 7: Xử lý & Báo cáo Sao kê Tín dụng Doanh nghiệp (Credit & Loan Statements)
- **Tiếp nhận & Nhận diện Mẫu:** Kéo - thả upload file sao kê danh sách khoản vay, khế ước nhận nợ LD từ VietinBank eFAST (`.xls`), MB (`.xlsx`). Hệ thống tự động nhận diện mẫu qua Magic Bytes và signatures.
- **Bóc tách Chi tiết Khoản vay & Khế ước:**
  - Bóc tách siêu dữ liệu: Tên đơn vị vay, Số CIF, Ngày chốt dữ liệu, Tổng dư nợ báo cáo trên Header/Footer.
  - Bóc tách từng khế ước: Số tài khoản vay / Số LD khế ước, Ngày giải ngân, Ngày đáo hạn, Kỳ hạn, Lãi suất (%/năm), Dư nợ gốc hiện tại, Lãi cộng dồn, Lịch trả nợ gốc/lãi kỳ tới, Nhóm nợ.
- **Đối soát Số dư Tín dụng Tự động:**
  $$\sum \text{Dư nợ gốc từng khoản vay} = \text{Tổng dư nợ ghi trên Header / Dòng Tổng của file}$$
  Nếu chênh lệch $= 0$, đánh dấu file đạt `BALANCED` (Khớp 100%). Nếu chênh lệch $\neq 0$, hệ thống cảnh báo cờ `DISCREPANCY` kèm số tiền lệch.
- **Quản lý Danh mục Khoản vay Hiện hành (`credit_facilities`):**
  - Tự động cập nhật (upsert) số dư và nghĩa vụ trả nợ mới nhất của từng hợp đồng/khế ước vào bảng `credit_facilities`.
  - Lưu trữ toàn bộ snapshot dữ liệu từng lần nạp vào bảng `credit_statement_items` để đối soát và tra cứu lịch sử kiểm toán.
- **Hình Thức Trả Lãi & Ngày Trả Lãi Hằng Tháng:**
  - Bổ sung trường Hình thức trả lãi (`interest_payment_method`): `MONTHLY` (Hằng tháng) hoặc `END_OF_TERM` (Cuối kỳ khi đáo hạn).
  - Bổ sung trường Ngày trả lãi hằng tháng (`monthly_interest_due_day`): Số nguyên từ 1 đến 31 (chỉ định ngày chốt trả lãi trong tháng đối với hình thức Hằng tháng).
  - **Quy định đối với VietinBank (CTG):** Toàn bộ các khoản vay của VietinBank có hình thức trả lãi là Hằng tháng (`MONTHLY`), ngày trả lãi định kỳ cố định là ngày 5 hằng tháng (`monthly_interest_due_day = 5`). Hệ thống tự động áp dụng ngày 5 khi bóc tách từ file sao kê khoản vay VietinBank eFAST (`CTG_LOAN_XLS`) và khi thêm mới/chỉnh sửa khoản nợ CTG.
- **Tính Toán Số Lãi Cần Trả Theo Quy Định Hiện Hành của Pháp Luật (Thông tư 14/2017/TT-NHNN):**
  - Căn cứ pháp lý: Điều 5 Thông tư 14/2017/TT-NHNN ngày 29/09/2017 của Ngân hàng Nhà nước Việt Nam về phương pháp tính lãi trong hoạt động cấp tín dụng.
  - Cơ sở thời gian: Một năm chuẩn là 365 ngày (`Actual / 365`).
  - Thời hạn tính lãi: Xác định từ ngày giải ngân (hoặc ngày liền kề sau ngày kết thúc kỳ tính lãi trước) đến hết ngày liền kề trước ngày thanh toán hết khoản vay (tính ngày đầu, bỏ ngày cuối của kỳ tính lãi).
  - Công thức tính lãi chuẩn:
    $$\text{Số tiền lãi} = \frac{\sum (\text{Số dư thực tế} \times \text{Lãi suất tính lãi (\%/năm)} \times \text{Số ngày duy trì số dư thực tế})}{365}$$
  - Phân loại theo hình thức:
    - `MONTHLY`: Tính số lãi của kỳ tháng tới hạn dựa trên số ngày thực tế trong chu kỳ trả lãi hàng tháng (căn cứ theo `monthly_interest_due_day`).
    - `END_OF_TERM`: Tính tổng số lãi phải thanh toán vào ngày đáo hạn dựa trên số ngày thực tế từ ngày giải ngân đến ngày đáo hạn.
- **Liên Kết Bộ Hồ Sơ Giải Ngân Lưu Trữ Tại Object Storage:**
  - Mỗi khoản vay tín dụng bắt buộc liên kết với một bộ hồ sơ giải ngân lưu tại Object Storage (MinIO On-Premise kết hợp Local Disk).
  - Đường dẫn lưu trữ chuẩn: `disbursement_dossiers/{bank_code}/{contract_number}/{uuid}_{sanitized_filename}`.
  - Bảng quản lý siêu dữ liệu: `disbursement_documents` (`document_id`, `document_uuid`, `loan_id`, `file_name`, `storage_path`, `file_size_bytes`, `file_sha256`, `mime_type`, `document_type`, `description`, `uploaded_by`).
  - Hỗ trợ đa dạng loại tài liệu phân tách rành mạch: mặc định gồm `CONTRACT` (Hợp đồng tín dụng / Thỏa thuận vay), `DEBT_NOTE` / `DISBURSEMENT_RECORD` (Khế ước nhận nợ / Giấy đề nghị giải ngân LD), `INVOICE` (Chứng từ sử dụng vốn: Hóa đơn GTGT / UNC thanh toán), `COLLATERAL` (Hồ sơ tài sản bảo đảm & Thế chấp), `OTHER` / `APPROVAL` (Thông báo phê duyệt / Chứng từ khác) cùng **khả năng bổ sung loại hồ sơ tùy biến động** (như Thư bảo lãnh, Biên bản nghiệm thu, Hồ sơ pháp lý, Bảo hiểm công trình, v.v.), tự động lưu trữ và ghi nhớ đồng bộ trên client & database với dung lượng tối đa 50MB/file.
  - Phân chia khu vực nhập và quản lý bộ hồ sơ giải ngân theo từng danh mục loại chứng từ độc lập (bao gồm các loại hồ sơ mặc định và các loại hồ sơ do người dùng tự bổ sung), tuyệt đối không gom chung toàn bộ hồ sơ vào một phân vùng duy nhất. Giao diện cung cấp điều hướng Tab/Section theo từng loại chứng từ, nút "+ Thêm loại hồ sơ" với gợi ý nhanh các nhóm hồ sơ thông dụng, tự động gán phân loại khi tải lên, hiển thị số lượng file theo từng loại, xem/tải xuống an toàn từ Object Storage và Audit Log chi tiết.
  - Giao diện bảng danh mục khoản vay tối giản, tinh gọn và đa năng:
    - **Phân tách rành mạch 3 cột Số dư Gốc & Cơ chế Tính Lãi:**
      1. **Dư Nợ Gốc Ban Đầu (`original_principal_balance`):** Giá trị giải ngân ghi nhận theo Hợp đồng tín dụng / Khế ước nhận nợ, cố định bất biến trong suốt vòng đời khoản vay.
      2. **Đã Trả Gốc (`total_repaid_principal`):** Tổng lũy kế số tiền nợ gốc đã thanh toán, đối soát tự động từ các giao dịch chi trả nợ trên sao kê tài khoản ngân hàng.
      3. **Dư Nợ Gốc Hiện Tại (`current_principal_balance`):** Dư nợ gốc còn lại thực tế ($\text{Gốc hiện tại} = \text{Gốc ban đầu} - \text{Đã trả gốc}$). **Đây là mốc chuẩn duy nhất theo thời gian để tính số tiền lãi cần trả theo quy định pháp luật (Thông tư 14/2017/TT-NHNN)**.
    - **Header hỗ trợ sắp xếp (Sort 2 chiều):** Click vào bất kỳ tiêu đề cột nào (Số HĐ, Ngân hàng, Dư nợ gốc ban đầu, Đã trả gốc, Dư nợ gốc hiện tại, Lãi suất, Ngày giải ngân, Đáo hạn, v.v.) để sắp xếp tăng dần hoặc giảm dần với icon trực quan.
    - **Cột Ngày Giải Ngân độc lập:** Hiển thị rõ ràng ngày giải ngân kèm biểu tượng lịch, phân tách mạch lạc với cột Ngày Đáo Hạn / Thời Hạn.
    - **Icon nhận diện hồ sơ đầu Số HĐ:** Trang giấy có chữ (`FileText`, xanh tím) khi khoản vay đã có bộ hồ sơ/chứng từ sao kê đính kèm; Trang giấy trắng (`File`, xám nhạt) khi khoản vay chưa nạp hồ sơ chứng từ. Click vào icon để mở nhanh modal nạp/xem hồ sơ.
    - **Mỗi hàng duy trì đúng 1 nút "Sửa" (Edit) duy nhất:** Ở cột Thao Tác cố định mép phải (`sticky right-0`), modal mở ra tích hợp cả thông tin hợp đồng và phân vùng tải lên/quản lý Bộ hồ sơ giải ngân phân theo 5 loại chứng từ, kèm nút xóa khoản vay an toàn ở chân modal. Trên thanh công cụ chính vẫn có nút tập trung "+ Nhập Bộ Hồ Sơ Cho Khoản Vay" khi cần nạp nhanh theo lô.
    - **Khung nhìn chuẩn 1 trang & Phân trang thông minh:** Cố định chiều cao nội bộ (`max-h-[calc(100vh-320px)]`), khóa cố định tiêu đề (`sticky top-0`) và cột Số HĐ (`sticky left-0`). Tích hợp thanh phân trang (mặc định 10 dòng/trang vừa khít màn hình, tùy chọn 15, 20, 50 hoặc Tất cả) đảm bảo toàn bộ bảng dữ liệu luôn nằm gọn trong đúng 1 trang màn hình mà không bao giờ làm trôi kéo giãn toàn bộ trang web.
- **Tab Phân Tích Đa Chiều (Interactive Pivot Table) cho Danh Mục Khoản Vay:**
  - Tab điều hướng thứ 4: `Phân Tích Đa Chiều (Pivot)` trên trang Sao Kê Tín Dụng & Danh Mục Khoản Vay (`/credit-statements`).
  - **Tùy biến Chiều Phân tích linh hoạt:**
    - **Chiều Dòng (Row Dimensions):** Ngân hàng / TCTD, Loại tổ chức tín dụng (`BANK`, `FINANCE_COMPANY`, `LEASING_COMPANY`, `OTHER`), Nhóm nợ (Nhóm 1 đến 5), Hình thức trả lãi (Hàng tháng, Cuối kỳ/Đáo hạn), Kỳ hạn (`term`), Tháng giải ngân (`disbursement_month` YYYY-MM), Tháng đáo hạn (`maturity_month` YYYY-MM), Nguồn dữ liệu (Nhập thủ công vs Bóc tách từ sao kê), Tình trạng hồ sơ giải ngân (Đã có hồ sơ vs Chưa có hồ sơ).
    - **Chiều Cột (Column Dimensions):** Hỗ trợ chế độ Ma trận 2 Chiều (Dòng × Cột) hoặc Bảng 1 Chiều (`NONE` - Không phân chia cột).
    - **Chỉ Số Tổng Hợp (Aggregation Metrics):**
      - Tổng Dư Nợ Gốc (VNĐ - Sum).
      - Tổng Tiền Lãi Dự Trả TT14 (VNĐ - Sum).
      - Gốc Đến Hạn Kỳ Tới (VNĐ - Sum).
      - Lãi Suất Bình Quân Gia Quyền (WAIR %/năm - Weighted Average theo dư nợ gốc).
      - Số Lượng Hợp Đồng / Khế Ước (HĐ - Count).
  - **6 Mẫu Xem Nhanh (1-Click Presets):**
    - Ngân hàng × Nhóm nợ (Dư nợ gốc).
    - Ngân hàng × Hình thức trả lãi (Lãi dự trả TT14).
    - Loại TCTD × Kỳ hạn (Dư nợ gốc).
    - Tháng đáo hạn × Ngân hàng (Gốc đến hạn kỳ tới).
    - Ngân hàng × Hồ sơ giải ngân (Số lượng HĐ).
    - Tổng hợp theo Ngân hàng (Bảng 1D Dư nợ gốc).
  - **Trực Quan Hóa & Xuất Dữ Liệu:**
    - Tự động đồng bộ với bộ lọc toàn cục ở đầu trang (`filteredLoans`).
    - Thanh tìm kiếm nội bộ ma trận (lọc nhanh theo tên dòng/cột).
    - 4 Thẻ KPI tóm tắt tức thì (Tổng Dư Nợ, Lãi Dự Trả, WAIR, Tổng HĐ).
    - Dải nhiệt màu (Heatmap Bar) hiển thị tỷ trọng đóng góp của từng ô trên ma trận.
    - Dòng & Cột Tổng Cộng Toàn Bộ (Grand Total Row & Column).
    - Nút xuất file CSV tương thích Microsoft Excel với UTF-8 BOM (`\uFEFF`).
- **Giao diện Nhập Lẻ Khoản Vay & Quản Lý Nợ Ngoài Sao Kê File:**
  - Hỗ trợ nhập trực tiếp các khoản nợ lẻ từ các Ngân hàng thương mại, Công ty tài chính (FE Credit, Home Credit, HD SAISON, Shinhan Finance, Mcredit, Mirae Asset...), Công ty cho thuê tài chính (VietinBank Leasing, BIDV-SuMi TRUST Leasing, Chailease, ACB Leasing...) hoặc đối tác tín dụng khác.
  - Phân loại tổ chức tín dụng: `BANK` (Ngân hàng), `FINANCE_COMPANY` (Công ty tài chính), `LEASING_COMPANY` (Cho thuê tài chính), `OTHER` (Khác).
  - Tự động tính toán tổng số tiền phải trả kỳ tới ($\text{Gốc} + \text{Lãi}$), kiểm tra trùng lặp số hợp đồng, ghi nhận Audit Log và tích hợp ngay lập tức vào tổng dư nợ và chỉ số Thanh khoản Ròng CFO.
  - Hỗ trợ đầy đủ chức năng Thêm mới, Chỉnh sửa (Inline/Modal) và Xóa/Tất toán khoản nợ, cùng bộ lọc đa chiều (theo loại tổ chức, nguồn gốc nhập lẻ vs sao kê tự động).
- **Báo cáo Giám sát Nghĩa vụ Nợ & Lịch Thanh toán:**
  - Thống kê tổng dư nợ theo từng ngân hàng và toàn hệ thống.
  - Lịch đến hạn trả nợ gốc và lãi (trong 7 ngày, 30 ngày tới).
  - Tự động tính Lãi suất bình quân gia quyền của toàn bộ danh mục nợ vay.
  - Tích hợp số liệu vào CFO Dashboard phục vụ giám sát Thanh khoản Ròng.
- **Phân Hệ Kế Hoạch Trả Nợ & Điều Phối Thanh Khoản Tín Dụng Tuần Hoàn (`/loan-repayment-plan`):**
  - Màn hình chuyên dụng cho CFO và Kế toán nằm dưới mục *Theo dõi khoản vay*.
  - Thuật toán *SRPR Engine v2.0 (Stepped Rollover & Prepay-to-Reroute)*:
    - **Bảo đảm hoàn lại gốc 100% sau khi cắt nợ:** Mọi khoản nợ bị cắt/trả (dù là trả trước hạn để tái định tuyến hay trả đúng hạn) đều được giải ngân vay lại đúng bằng số tiền gốc đã cắt.
    - **Bắc cầu kỳ hạn cho VietinBank (CTG):** Chia nhỏ nợ T11 thành 4 nhánh (1T, 2T, 3T, 4T); khi đáo hạn tại trạm T12, T01, T02 tiếp tục tái vay đúng gốc 4T sang T04, T05, T06/2027 mà không vi phạm quy định 4 tháng của VietinBank.
    - **Cắt nợ & Vay lại ngay trong ngày cho MBBank (MBB):** Cắt trước hạn 29.87 tỷ nợ MBB ở đỉnh T03/2027 tại T12, T01, T02 và vay lại đúng số tiền gốc với kỳ hạn mới 5–6 tháng (đẩy sang T05–T08/2027).
    - **Triệt tiêu đỉnh nợ T03/2027:** Đưa tổng nợ thực tế T03 từ 73.76 tỷ về đúng bằng trần an toàn **14.00 tỷ VND** ($10.56$ tỷ MBB + $3.44$ tỷ CTG).
  - Hỗ trợ 2 chế độ thiết lập ngân sách: *Cố định đều các tháng* (mặc định 14 tỷ VND/tháng) và *Tùy chỉnh theo mùa vụ kinh doanh*.
  - Biểu đồ Cột Stacked Bar: Phân tách minh bạch nợ gốc tự nhiên cũ (cam/xám), nợ bắc cầu đổ về (tím) và nợ thanh toán đề xuất (xanh), đảm bảo 100% các tháng nằm an toàn dưới đường trần chi trả.
  - Ma trận Điều phối Dòng tiền 7 Tháng (7 cột chuẩn CFO) và Bảng lịch trình chi tiết từng khế ước (70+ hành động thực thi, ghi chú nghiệp vụ và tiền lãi tiết kiệm được).
- **Phân hệ 7.9: Đối soát Giao dịch Chi Trả nợ & Tự động Giảm trừ Dư nợ Gốc/Lãi (US-07.9):**
  - **Lọc tự động:** Quét toàn bộ giao dịch chi (`debit_amount > 0`) đã phân loại là "Trả nợ" (Category ID 25) trên các tài khoản ngân hàng doanh nghiệp, loại trừ các giao dịch đã đối soát.
  - **Gợi ý khế ước thông minh:** Tự động trích xuất số khế ước (VietinBank 12 số, MBBank `LD...`, `040MAZS...`) và số tiền gốc/lãi gợi ý từ nội dung diễn giải sao kê ngân hàng (`description`).
  - **Khung chia Gốc & Lãi trực quan:** Đảm bảo đẳng thức $\text{Số tiền trả gốc} + \text{Số tiền trả lãi} = \text{Tổng tiền giao dịch chi}$. Cung cấp nút 1-click **[100% Trả Gốc]** để gán toàn bộ số tiền là trả gốc một chạm, nút [100% Trả Lãi] và cơ chế tự động cân bằng 2 chiều giữa 2 ô nhập.
  - **Tự động giảm trừ nợ gốc & Tất toán:** Giảm trừ tức thì `current_principal_balance = current_principal_balance - principal_amount`. Tự động chuyển trạng thái khoản vay sang `SETTLED` khi dư nợ gốc về 0.
  - **Lịch sử trả nợ chuẩn kiểm toán:** Bảng `loan_repayment_history` ghi nhận trường `repayment_date` **chính xác bằng thời điểm giao dịch trên sao kê** (`transaction_date`).
  - **Cơ chế Hoàn tác (Rollback):** Cho phép kế toán hủy đối soát nếu thao tác nhầm, khôi phục lại dư nợ gốc ban đầu và ghi nhận `audit_logs`.
- **Phân hệ 7.10: Bóc tách Hóa đơn Điện tử XML & Đối soát Hóa đơn Giải ngân (US-07.10):**
  - **Hỗ trợ định dạng Hóa đơn:** Hồ sơ dạng hóa đơn giải ngân lưu trữ gồm cả file XML và PDF theo quy chuẩn Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC.
  - **Bóc tách tự động file XML:** Tự động đọc nội dung file XML để trích xuất số hóa đơn (`<SHDon>`), ký hiệu (`<KHHDon>`), ngày lập (`<NLap>`), người bán/người mua, và tổng tiền thanh toán (`<TgTTTBSo>` hoặc `<TotalPayment>` / `<TgTToan>` / tổng tiền chưa thuế + thuế).
  - **Cộng dồn & Đối soát với Dư nợ gốc:**
    - Tính tổng số tiền trên toàn bộ các hóa đơn XML của khoản vay.
    - So sánh với dư nợ gốc của khoản vay (`current_principal_balance`).
    - **Cảnh báo thiếu hóa đơn (Deficiency Warning):** Nếu tổng số tiền trên hóa đơn nhỏ hơn dư nợ gốc ($\text{Tổng tiền HĐ XML} < \text{Dư nợ gốc}$), hệ thống hiển thị cảnh báo đỏ/vàng nổi bật **"⚠️ Thiếu hóa đơn giải ngân"**, hiển thị chi tiết số tiền còn thiếu để kế toán bổ sung chứng từ sử dụng vốn hợp lệ.
    - **Thông báo đủ hóa đơn (Sufficiency Notice):** Nếu tổng tiền hóa đơn $\ge \text{Dư nợ gốc}$, hiển thị nhãn xanh **"✅ Đủ hóa đơn giải ngân (100% bao phủ)"**.
  - **Giao diện đa tầng (Multi-tier UI):**
    - Trực quan hóa cảnh báo ngay tại bảng danh sách khoản vay (Cột *Hồ sơ Giải ngân* với badge `⚠️ Thiếu HĐ` kèm số tiền thiếu và tooltip chi tiết).
    - Hiển thị *Bảng Đối Soát Hóa Đơn Điện Tử XML* chuyên dụng trong tab *Hóa đơn & UNC* tại cả Modal quản lý hồ sơ giải ngân và Form tạo/sửa khoản vay.
    - Hiển thị chi tiết số hóa đơn và số tiền trên từng dòng chứng từ XML (cả tệp chuẩn bị nạp và tệp đã lưu trong CSDL).

### Phân hệ 8: Trải nghiệm Người dùng & Điều hướng theo Vai trò (Role Navigation & Personas)
- Cung cấp thanh chuyển đổi vai trò (Persona Switcher) linh hoạt trên thanh Sidebar:
  1. **Chị Nghiêm Lê Cẩm Nhung (Kế toán viên - Primary End-User):**
     - Mặc định truy cập: `/` (Màn hình Nạp Sao Kê).
     - Quyền truy cập: Nạp sao kê tài khoản & tín dụng, Bảng Giao Dịch, Bộ Quy Tắc, Sao Kê Tín Dụng, Kế Hoạch Trả Nợ, Xuất Excel.
  2. **Ông Trần Ngọc Tuấn (Giám đốc Tài chính - CFO):**
     - Mặc định truy cập: `/cfo-dashboard` (Tồn Quỹ CFO < 9h sáng & Thanh khoản Ròng).
     - Quyền truy cập: Xem toàn bộ tồn quỹ hợp nhất đa kỳ, biểu đồ ngân hàng, drill-down giao dịch, giám sát nghĩa vụ nợ tín dụng, mô phỏng Kế Hoạch Trả Nợ, xuất Excel CFO.
  3. **Bà Nguyễn Thị Lan Anh (Tổng Giám đốc - CEO):**
     - Mặc định truy cập: `/ceo-waterfall` (Biểu đồ Thác nước Thu/Chi).
     - Quyền truy cập: Xem biểu đồ Waterfall WTD/MTD, cơ cấu chi phí, giám sát tồn quỹ tổng thể.
