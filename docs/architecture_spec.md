# TÀI LIỆU THIẾT KẾ KIẾN TRÚC HỆ THỐNG (SOFTWARE ARCHITECTURE SPECIFICATION)

> **Dự án:** Hệ thống Xử lý & Báo cáo Sao kê Ngân hàng Tự động (Bank Statement Processing & Reporting System)  
> **Phiên bản:** 1.2.0  
> **Trạng thái:** Bản thiết kế Kiến trúc Chính thức (Architectural Baseline) - Đã đồng bộ với sản phẩm thực tế (Cập nhật 2026-11-04: Chuẩn hóa kiến trúc Bảng Dữ liệu Đa năng)  
> **Chủ trì (Lead System Architect):** System & Data Architect Team (`@SystemArchitect`)  
> **Tài liệu căn cứ:** [`docs/BRD.md`](./BRD.md), [`docs/Bank_Mapping_Matrix.md`](./Bank_Mapping_Matrix.md), [`database/schema.sql`](../database/schema.sql), [`agent/PRODUCT_SPEC.md`](../agent/PRODUCT_SPEC.md), [`agent/common_rules.md`](../agent/common_rules.md), [`agent/02_system_architect/rules.md`](../agent/02_system_architect/rules.md)

---

## 1. Tổng quan Kiến trúc Hệ thống (System Architecture Overview)

Hệ thống được thiết kế theo mô hình **Kiến trúc Phân tầng Hướng Dịch vụ (Layered Service-Oriented Architecture)** kết hợp cơ chế **Xử lý Bất đồng bộ dựa trên Sự kiện (Event-Driven Async Processing)**, giải quyết triệt để bài toán nghẽn I/O khi xử lý đồng thời nhiều file Excel lớn từ $\ge 7$ ngân hàng tài khoản thanh toán và các mẫu sao kê tín dụng/khoản vay doanh nghiệp.

```mermaid
flowchart TD
    subgraph ClientLayer["TẦNG GIAO DIỆN NGƯỜI DÙNG (WEB SPA)"]
        UI_Upload["Màn hình Upload Kéo-thả & Tiến trình Realtime"]
        UI_Table["Bảng Giao dịch: Inline Tagging & Ghi chú Note"]
        UI_Credit["Màn hình Sao kê Tín dụng & Danh mục Nợ Vay (/credit-statements)"]
        UI_Rules["Trình Quản lý Quy tắc Nâng cao (Rule Builder UI)"]
        UI_CFO["Dashboard Tồn quỹ Hợp nhất CFO & Net Liquidity (< 9h sáng)"]
        UI_CEO["Biểu đồ Thác nước Waterfall CEO (WTD / MTD)"]
    end

    subgraph APILayer["TẦNG API GATEWAY & INGESTION SERVICE"]
        API_Gate["API Ingestion Gateway (FastAPI / Express)"]
        Val_Module["Bộ Kiểm tra Upload 2 Lớp (Magic Bytes & SHA-256)"]
        Auth_RBAC["Phân quyền & Kiểm soát Truy cập (RBAC)"]
    end

    subgraph StorageQueue["TẦNG LƯU TRỮ NHỊ PHÂN & HÀNG ĐỢI"]
        Obj_Store[("Hybrid Object Storage<br/>MinIO On-Premise (Primary) & GCS (Backup)<br/>/statements/, /credit_statements/ & /disbursement_dossiers/")]
        Msg_Queue[("Message Queue (Redis 7.0+ Streams)<br/>Hàng đợi Job bóc tách ngầm")]
        DLQ[("Dead Letter Queue (DLQ)<br/>Xử lý Retry & Lưu vết lỗi")]
    end

    subgraph WorkerLayer["TẦNG XỬ LÝ DỮ LIỆU NGẦM (ETL PARSER ENGINE)"]
        Worker_Pool["Đội ngũ Worker Xử lý Bất đồng bộ"]
        Stream_Parser["Động cơ Bóc tách TK Thanh toán (bank_templates_config.yaml)"]
        Credit_Parser["Động cơ Bóc tách Sao kê Tín dụng (credit_templates_config.yaml)"]
        Clean_Engine["Pipeline Chuẩn hóa: Ngày ISO & Tiền tệ Decimal"]
        Recon_Engine["Module Đối soát Cân bằng Kế toán Số dư & Dư nợ Tín dụng"]
        Rule_Engine["Động cơ Khớp Luật Từ khóa Nâng cao"]
    end

    subgraph DataLayer["TẦNG CƠ SỞ DỮ LIỆU QUAN HỆ (RDBMS)"]
        PG_DB[("PostgreSQL 15+ Cluster<br/>Chuẩn hóa 3NF, Decimal(18,2)")]
        Table_Files["bank_statement_files"]
        Table_Trans["bank_transactions"]
        Table_Rules["classification_rules & categories"]
        Table_Cash["cash_ledger"]
        Table_CreditFiles["credit_statement_files"]
        Table_CreditFac["credit_facilities, credit_statement_items & loan_invoice_allocations"]
        Table_Invoices["invoices & invoice_items (Kho HĐĐT độc lập)"]
        Table_DisburseDocs["disbursement_documents (Hồ sơ giải ngân khác)"]
        Table_Audit["audit_logs"]
        View_CFO["v_cfo_daily_liquidity & v_cfo_debt_obligations"]
    end

    %% Luồng kết nối
    UI_Upload -->|1. Multipart Form Data| API_Gate
    UI_Credit -->|Multipart Upload & Tra cứu nợ vay| API_Gate
    API_Gate --> Val_Module
    Val_Module -->|2. Lưu file gốc nguyên bản| Obj_Store
    Val_Module -->|3. Đẩy Job xử lý| Msg_Queue
    Msg_Queue --> Worker_Pool
    Worker_Pool -->|Retry > 3 lần| DLQ
    Worker_Pool -->|Đọc file dạng Stream| Obj_Store
    Worker_Pool --> Stream_Parser & Credit_Parser
    Stream_Parser --> Clean_Engine --> Recon_Engine --> Rule_Engine
    Credit_Parser --> Recon_Engine
    Rule_Engine -->|Bulk Insert / Update| PG_DB
    Recon_Engine -->|Upsert nợ vay & file status| PG_DB
    
    UI_Table <-->|Truy vấn & Sửa Note/Tag| API_Gate
    UI_Rules <-->|CRUD Quy tắc & Chạy lại| API_Gate
    UI_CFO <-->|Lấy Tồn quỹ trước 9h & Nghĩa vụ nợ| API_Gate
    UI_CEO <-->|Lấy dữ liệu Waterfall| API_Gate
    API_Gate <-->|Query Aggregation tối ưu & Views| PG_DB
```

---

## 2. Thiết kế Hạ tầng Lưu trữ & Phân tầng File Gốc (Object Storage Architecture)

Tuân thủ nghiêm ngặt nguyên tắc **Stateless & Tách biệt Hoàn toàn giữa Blob và RDBMS**:

1. **Quy tắc Phân cấp Đường dẫn Định danh (Deterministic Partitioning):**
   ```text
   # Sao kê tài khoản thanh toán:
   s3://bank-statements/statements/{bank_code}/{YYYY}/{MM}/{file_uuid}_{sanitized_original_filename}.xlsx

   # Sao kê khoản vay tín dụng:
   s3://bank-statements/credit_statements/{bank_code}/{YYYY}/{file_uuid}_{sanitized_original_filename}.ext

   # Hồ sơ giải ngân tín dụng liên kết khoản vay:
   s3://bank-statements/disbursement_dossiers/{bank_code}/{contract_number}/{document_uuid}_{sanitized_file_name}.ext
   ```
   - `{bank_code}`: VCB, TCB, ACB, BIDV, MBB, CTG,...
   - `{YYYY}/{MM}`: Phân vùng theo năm và tháng nạp file để tối ưu tốc độ duyệt bucket.
   - `{file_uuid}`: UUIDv4 ngẫu nhiên chống ghi đè khi nạp các file trùng tên.

2. **Chống Trùng lặp File qua Mã Băm SHA-256:**
   - Khi tiếp nhận file tại Gateway, tính toán ngay chuỗi `file_sha256 = SHA256(file_content)`.
   - Kiểm tra nhanh trên bảng `bank_statement_files(file_sha256)`. Nếu đã tồn tại $\rightarrow$ Trả về mã lỗi `409 Conflict` kèm thông tin ngày giờ nạp trước đó, chặn hoàn toàn việc xử lý trùng lặp.

3. **Chính sách Truy cập An toàn (Security Policy):**
   - Bucket ở chế độ `Private`, không mở public.
   - Khi người dùng cần tải lại file gốc để đối chiếu, API Gateway sinh **Pre-signed URL** với thời gian sống (TTL) tối đa **15 phút**.

4. **Chiến lược Sao lưu Dự phòng Hybrid (MinIO Primary -> GCS Off-site Backup):**
   - **Kho lưu trữ chính (Primary On-Premise):** Cài đặt cụm MinIO nội bộ trong mạng LAN công ty, đảm bảo tốc độ đọc/ghi tối đa và cách ly dữ liệu nhạy cảm.
   - **Sao lưu ngoại vi (Disaster Recovery):** Tích hợp tiến trình đồng bộ tự động sao chép toàn bộ file sang Google Cloud Storage (GCS) gói Coldline/Archive. File trước khi đẩy lên GCS được mã hóa Client-side (AES-256), đảm bảo an toàn tuyệt đối ngay cả khi máy chủ nội bộ gặp sự cố hỏng hóc hoặc thảm họa.

---

## 3. Kiến trúc Động cơ Xử lý Dữ liệu Ngầm (ETL & Parser Engine)

Động cơ đọc sao kê được thiết kế để giải quyết bài toán tải trọng nặng từ $\ge 7$ ngân hàng mỗi ngày:

1. **Kỹ thuật Đọc Stream Chunking (Chống Tràn Bộ Nhớ - OOM Prevention):**
   - TUYỆT ĐỐI KHÔNG nạp toàn bộ workbook Excel vào RAM (tránh dùng `pandas.read_excel()` thông thường).
   - Sử dụng cơ chế đọc theo luồng (Streaming generator) với kích thước chunk từ **500 đến 1.000 dòng/lần**:
     - Trong Python: `openpyxl` ở chế độ `read_only=True` kết hợp `itertools.islice`.
     - Trong TypeScript/Node.js: `exceljs` hoặc `xlsx-stream-reader`.
   - Giữ mức chiếm dụng bộ nhớ RAM luôn $\le 512\text{MB}$ ngay cả khi xử lý file sao kê hàng chục ngàn dòng.

2. **Quy tắc Ép Kiểu & Toàn vẹn Số học:**
   - Toàn bộ giá trị tiền tệ bắt buộc ép sang kiểu `Decimal` với thuật toán làm tròn ngân hàng chuẩn mực `ROUND_HALF_UP`.
   - Khi làm sạch chuỗi tiền tệ từ XML/Excel (như `'1.441E8'`, `'4.99999999E8'`), chỉ xóa từ khóa tiền tệ (`(?i)(VND|USD)`), khoảng trắng, `\t` và dấu phân cách; bảo toàn ký tự số mũ `E`/`e` trong Scientific Notation trước khi truyền vào `Decimal()`.
   - Xử lý số âm kế toán trong ngoặc đơn: Chuỗi `(1,500,000)` được chuyển đổi thành số âm chuẩn `-1500000.00`.

3. **Công thức Đối soát Kế toán Cân bằng Số dư 5 Chế độ (`MODE_1` $\rightarrow$ `MODE_5`):**
   $$\text{Số dư cuối kỳ tính toán} = \text{Số dư đầu kỳ (hoặc nội suy)} + \sum \text{Phát sinh Có (Thu)} - \sum \text{Phát sinh Nợ (Chi)}$$
   $$\text{Độ lệch} \ (\Delta) = |\text{Số dư cuối kỳ thực tế} - \text{Số dư cuối kỳ tính toán}|$$
   - Hỗ trợ đầy đủ 5 chế độ đối soát và nội suy số dư (`MODE_1_FULL_HEADER_FOOTER`, `MODE_2_INFERRED_OPENING_CLOSING`, `MODE_3_DERIVED_RUNNING_BALANCE`, `MODE_4_TOTAL_FLOW_ONLY`, `MODE_5_CUTOFF_INTEREST_INCLUDED`) theo đặc tả tại [`docs/Bank_Mapping_Matrix.md`](./Bank_Mapping_Matrix.md).
   - Nếu $\Delta = 0.00 \rightarrow$ Ghi nhận `reconciliation_status = 'BALANCED'`.
   - Nếu $\Delta \neq 0.00 \rightarrow$ Ghi nhận `reconciliation_status = 'DISCREPANCY'`, lưu giá trị $\Delta$ và kích hoạt cờ cảnh báo trên màn hình cho chị Cẩm Nhung.

4. **Chống Trùng lặp Giao dịch (Transaction Deduplication - 6-Tuple Canonical Hash):**
   - Tính toán chuỗi canonical hash 6 thành phần cho từng dòng giao dịch (phân biệt chính xác các bút toán tách Phí/VAT cùng mã tham chiếu):
     $$\text{dedup\_hash} = \text{SHA256}(\text{account\_number} \parallel \text{"|"} \parallel \text{trans\_date\_iso} \parallel \text{"|"} \parallel \text{debit} \parallel \text{"|"} \parallel \text{credit} \parallel \text{"|"} \parallel \text{ref\_no} \parallel \text{"|"} \parallel \text{running\_balance})$$
   - Tận dụng ràng buộc `UNIQUE(account_id, dedup_hash)` trên CSDL kết hợp cú pháp `ON CONFLICT DO NOTHING` hoặc gắn cờ `is_duplicate = TRUE`.

5. **Kiến trúc Đa Pháp nhân (Multi-Entity Isolation) & Mở rộng Ngân hàng Mới (Zero-Code):**
   - Cấu hình mẫu trong `bank_templates_config.yaml` hoàn toàn độc lập với Pháp nhân (`Entity-Agnostic`), tự động trích xuất động `(account_number, account_holder, tax_code)` từ Header sao kê để định tuyến và cô lập dữ liệu cho nhiều doanh nghiệp khác nhau trên cùng một mẫu.

6. **Động cơ Bóc tách Sao kê Khoản vay Tín dụng & Đối soát Dư nợ (`credit_templates_config.yaml`):**
   - Đọc và bóc tách các mẫu sao kê khoản vay BIFF8 (`.xls`) và OOXML (`.xlsx`) như `CTG_LOAN_XLS` (VietinBank eFAST) và `MBB_LOAN_LD_XLSX` (MBBank / MB).
   - Bóc tách chi tiết từng khế ước LD: `contract_number`, ngày giải ngân, ngày đáo hạn, kỳ hạn, lãi suất (%/năm), dư nợ gốc hiện tại, lãi cộng dồn, lịch trả nợ gốc/lãi tiếp theo.
   - Đối soát tự động: $\sum \text{Dư nợ gốc từng khế ước} = \text{Tổng dư nợ ghi trên file} \ (\Delta = 0.00\text{ VND})$.
   - Tự động cập nhật (upsert) vào danh mục `credit_facilities` và lưu snapshot vào `credit_statement_items`.

---

## 4. Thiết kế Mô hình Dữ liệu Quan hệ (Relational Database Design - 3NF)

Cơ sở dữ liệu được tổ chức theo chuẩn **PostgreSQL 15+**, tuân thủ nghiêm ngặt chuẩn 3NF:

| Tên Bảng / View (Table/View Name) | Mục đích Quản lý | Khóa chính & Ràng buộc quan trọng |
| :--- | :--- | :--- |
| **`bank_accounts`** | Quản lý $\ge 7$ tài khoản ngân hàng và tài khoản cá nhân MBBank bà Lan Anh | `account_id (PK)`, `account_number (UNIQUE)` |
| **`bank_statement_files`** | Quản lý file gốc, metadata, kỳ sao kê và kết quả đối soát số dư | `file_id (PK)`, `file_sha256 (UNIQUE)` |
| **`categories`** | Danh mục Thu/Chi do người dùng tự tạo trên giao diện | `category_id (PK)`, `UNIQUE(category_type, category_name)` |
| **`classification_rules`** | Bộ quy tắc từ khóa kết hợp điều kiện nâng cao (AND/OR) | `rule_id (PK)`, `priority (ASC)` |
| **`bank_transactions`** | Chi tiết từng giao dịch sạch, Decimal(18,2), đối tượng thụ hưởng/chuyển (`counter_party`), cờ khóa ghi đè | `transaction_id (PK)`, `UNIQUE(account_id, dedup_hash)` |
| **`cash_ledger`** | Sổ theo dõi dòng tiền mặt đối ứng từ TK MBBank bà Lan Anh | `cash_entry_id (PK)`, `linked_transaction_id (FK)` |
| **`audit_logs`** | Ghi nhận nhật ký kiểm toán toàn bộ thao tác hệ thống | `log_id (PK)`, `correlation_id (UUID)` |
| **`credit_statement_files`** | Quản lý file sao kê tín dụng gốc, metadata tổng dư nợ và trạng thái đối soát | `file_id (PK)`, `file_sha256 (UNIQUE)` |
| **`credit_facilities`** | Danh mục hợp đồng vay & khế ước LD hiện hành, lịch trả nợ gốc/lãi, hình thức trả lãi, lãi tính theo TT14/2017 | `loan_id (PK)`, `UNIQUE(bank_code, contract_number)` |
| **`credit_statement_items`** | Chi tiết từng khế ước vay bóc tách theo file sao kê tín dụng | `item_id (PK)`, `file_id (FK)`, `loan_id (FK)` |
| **`invoices`** | Kho hóa đơn điện tử độc lập của doanh nghiệp, bóc tách XML và liên kết file PDF tương ứng | `invoice_id (PK)`, `invoice_uuid (UK)`, `UNIQUE(seller_tax_code, invoice_series, invoice_number)` |
| **`invoice_items`** | Chi tiết danh mục hàng hóa, dịch vụ và thuế suất bóc tách từ hóa đơn XML | `item_id (PK)`, `invoice_id (FK)` |
| **`loan_invoice_allocations`** | Phân bổ hóa đơn bảo đảm nhận nợ khoản vay (ràng buộc bằng đúng gốc vay ban đầu, cùng một TCTD) | `allocation_id (PK)`, `loan_id (FK)`, `invoice_id (FK)`, `UNIQUE(loan_id, invoice_id)` |
| **`disbursement_documents`** | Quản lý bộ hồ sơ giải ngân các chứng từ khác (Hợp đồng, khế ước, biên bản...) lưu tại Object Storage | `document_id (PK)`, `document_uuid (UK)`, `loan_id (FK)`, `invoice_id (FK)` |
| **`v_cfo_daily_liquidity`** | View tổng hợp tồn quỹ ngân hàng hợp nhất hôm nay (2 khối NH) | View tổng hợp phục vụ CFO |
| **`v_cfo_debt_obligations`** | View tổng hợp nghĩa vụ nợ tín dụng và lịch trả nợ theo ngân hàng | View phục vụ giám sát Thanh khoản Ròng |

*Chi tiết toàn bộ câu lệnh DDL khởi tạo đã được đóng gói hoàn chỉnh tại tệp mã nguồn: [`database/schema.sql`](../database/schema.sql).*

---

## 5. Hiện thực hóa các Yêu cầu Nghiệp vụ Đặc thù của Doanh nghiệp

### 5.1. Luồng Đối chiếu Dòng tiền Mặt qua TK Cá nhân MBBank (Bà Nguyễn Thị Lan Anh)
- **Thiết lập:** Cấu hình tài khoản MBBank với cờ `account_type = 'SPECIAL_CASH'`.
- **Logic tự động:**
  - $100\%$ các phát sinh chi tiền trên tài khoản MBBank của bà Lan Anh được tự động ghi nhận là chi phí hoạt động của công ty.
  - Các bút toán rút tiền mặt từ tài khoản này tự động sinh ra một bản ghi đối ứng trong bảng `cash_ledger` với `entry_type = 'INFLOW'` (Nhập quỹ tiền mặt).
  - Phân tách rõ ràng giữa dòng tiền tài khoản ngân hàng và sổ quỹ tiền mặt nội bộ (trong Báo cáo Tồn quỹ CFO, chỉ tính tổng tồn quỹ từ 2 khối tài khoản ngân hàng, không cộng dồn sổ quỹ tiền mặt).

### 5.2. Động cơ Phân loại Từ khóa Nâng cao kết hợp Khóa Ghi đè (Override Protection)
- **Quy trình khớp luật:**
  1. Khi một giao dịch mới được nạp, kiểm tra cờ `is_manual_override`. Nếu `TRUE` $\rightarrow$ **Bỏ qua, không can thiệp**.
  2. Quét lần lượt các quy tắc trong bảng `classification_rules` theo thứ tự `priority ASC`.
  3. Kiểm tra đồng thời các điều kiện:
     $$\text{Match} = (\text{Chứa từ khóa}) \land (\text{Khớp TK/Ngân hàng}) \land (\text{Khớp ngưỡng tiền}) \land (\text{Khớp chiều Thu/Chi})$$
  4. Nếu khớp $\rightarrow$ Gán `category_id` và gán `applied_rule_id`, dừng quét.
  5. Nếu không khớp bất kỳ luật nào $\rightarrow$ Giữ `category_id = NULL` (Nhóm *Chưa phân loại*).
- **Phân loại thủ công (Manual Tagging):** Khi chị Cẩm Nhung click chọn danh mục hoặc sửa Ghi chú trên UI:
  - Cập nhật `category_id` và `internal_note`.
  - Tự động set `is_manual_override = TRUE`.
  - Khi người dùng bấm nút *"Chạy lại quy tắc"*, câu lệnh SQL cập nhật có điều kiện bảo vệ:
    ```sql
    UPDATE bank_transactions 
    SET category_id = :new_cat_id 
    WHERE is_manual_override = FALSE AND ...;
    ```

### 5.3. Báo cáo CFO Trần Ngọc Tuấn (Sẵn sàng trước 9h00 Sáng)
- Tạo sẵn Database View chuyên dụng: `v_cfo_daily_liquidity` và `v_cfo_debt_obligations`.
- Phân nhóm nguồn tiền thành **2 Khối tài khoản ngân hàng**: (1) Khối TK Doanh nghiệp (`CORPORATE`) và (2) Khối TK Ủy quyền CEO (`SPECIAL_CASH`), không cộng quỹ tiền mặt vào tổng tồn quỹ.
- Tích hợp số liệu nghĩa vụ nợ tín dụng đến hạn từ `credit_facilities` để giám sát **Thanh khoản Ròng (Net Liquidity)**:
  $$\text{Thanh khoản Ròng (Net Liquidity)} = \text{Tổng tồn quỹ hợp nhất} - \text{Nghĩa vụ nợ gốc \& lãi đến hạn kỳ tới}$$
- Tốc độ phản hồi API `/api/v1/reports/cfo/daily-liquidity` đạt $\le 100\text{ms}$ nhờ cấu trúc chỉ mục trên `bank_accounts(current_balance)`.

### 5.4. Biểu đồ Thác nước (Waterfall Chart) Phân rã Thu/Chi cho CEO Nguyễn Thị Lan Anh
- API `/api/v1/reports/ceo/waterfall?timeframe=MTD` thực hiện truy vấn nhóm theo `category_name`:
  - Điểm neo xuất phát: $\text{Opening Balance}$.
  - Nhánh Dương (Cột xanh tăng): $\sum \text{Credit}$ theo từng Danh mục Thu.
  - Nhánh Âm (Cột đỏ giảm): $\sum \text{Debit}$ theo từng Danh mục Chi (bao gồm cả dòng chi tiền mặt MBBank).
  - Điểm neo kết thúc: $\text{Closing Balance}$.

### 5.5. Module Xuất Excel Chuẩn Mực Kế toán & Phòng chống Tấn công Formula Injection
- **Chuẩn định dạng:**
  - Ngày: `DD/MM/YYYY`, căn giữa.
  - Tiền tệ: Format `#,##0.00`, căn phải.
  - Dòng tổng cộng: Sử dụng công thức `SUBTOTAL(9, C2:C1000)` để khi người dùng lọc bảng trên Excel, con số tổng vẫn nhảy chính xác theo bộ lọc.
- **Kỹ thuật chống Formula/CSV Injection:**
  Trước khi ghi bất kỳ chuỗi ký tự nào (Diễn giải, Ghi chú nội bộ, Tên danh mục) vào ô Excel, kiểm tra ký tự đầu tiên:
  ```python
  if value and str(value)[0] in ('=', '+', '-', '@', '\t', '\r'):
      value = "'" + str(value)  # Escape bằng dấu nháy đơn
  ```

### 5.6. Quản trị Danh mục Khoản vay & Lịch Nghĩa vụ Nợ Tín dụng (Credit Facilities Management)
- **Tiếp nhận & Bóc tách Tự động:** Màn hình `/credit-statements` hỗ trợ kéo thả file sao kê khoản vay VietinBank eFAST (`.xls`) và MB (`.xlsx`). Hệ thống tự động nhận diện mẫu, bóc tách danh sách khế ước LD và đối soát cân bằng dư nợ gốc 100%.
- **Quản lý Nghĩa vụ Nợ & Tính Lãi Theo Luật:** API `/api/v1/loans` và `/api/v1/loans/summary` cung cấp danh sách khoản vay, bộ lọc đa tiêu chí (Ngân hàng, Nhóm nợ, Số ngày đến hạn), tính toán lãi suất bình quân gia quyền và tổng nghĩa vụ nợ đến hạn trong 7 ngày, 30 ngày tới.
- **Tính Lãi Theo Thông tư 14/2017/TT-NHNN:** Tự động tính toán số tiền lãi cần trả (`calculated_interest_due`) theo chuẩn pháp luật Việt Nam (cơ sở Actual/365, tính ngày đầu bỏ ngày cuối) cho 2 hình thức: trả lãi hằng tháng (`MONTHLY` dựa trên ngày trả lãi `monthly_interest_due_day`) và trả lãi cuối kỳ (`END_OF_TERM` từ ngày giải ngân đến ngày đáo hạn).
- **Liên kết Hồ sơ Giải ngân Object Storage:** Mỗi khoản vay liên kết với 1 bộ hồ sơ giải ngân gồm nhiều tài liệu (Hợp đồng tín dụng, Giấy nhận nợ, Hóa đơn thương mại, Biên bản định giá tài sản, Phê duyệt tín dụng, Khác) lưu trữ tại MinIO On-Premise theo đường dẫn phân cấp `disbursement_dossiers/{bank_code}/{contract_number}/`, bảo vệ bằng mã băm SHA-256 chống giả mạo và ghi nhận đầy đủ nhật ký kiểm toán.

### 5.7. Kiến trúc Thành phần Bảng Dữ liệu Đa năng (Universal Interactive Data Grid Architecture)
Nhằm đồng bộ trải nghiệm người dùng trên tất cả các màn hình danh sách (Giao dịch, Sổ phụ tín dụng, Danh mục khoản vay, Kho hóa đơn, Nhật ký đối soát), tầng Frontend triển khai kiến trúc Component Bảng Dữ liệu Đa năng với 4 trụ cột kỹ thuật:
1. **Header Tích Hợp Sort & Filter Popover:**
   - Mỗi tiêu đề cột kết hợp tương tác Sắp xếp 2 chiều (Click text/icon) và Bộ lọc cột (Nút Filter kích hoạt Popover hoặc Input lọc tích hợp).
   - Biểu tượng trực quan: `ArrowUp`, `ArrowDown`, `ArrowUpDown`, cùng icon `Filter` đổi màu hoặc hiển thị badge khi cột đang áp dụng lọc.
2. **Bộ Lọc Phân Tách Theo Kiểu Dữ Liệu:**
   - **Dữ liệu dạng Chữ (Text / Code / Trạng thái):** Lọc theo điều kiện chuỗi (Condition Filter) gồm các toán tử: Chứa (`contains` - không phân biệt hoa/thường, hỗ trợ tiếng Việt có dấu/không dấu), Bằng (`equals`), Bắt đầu bằng (`startsWith`), Kết thúc bằng (`endsWith`), Không chứa (`notContains`), Rỗng (`isEmpty`), Không rỗng (`isNotEmpty`).
   - **Dữ liệu dạng Số / Tiền tệ / Ngày tháng (Number, Currency, Date):** Lọc theo điều kiện khoảng (Range Filter) với 2 giá trị cận biên `[Min, Max]` hoặc `[Từ ngày, Đến ngày]`. Đối với ngày tháng, xử lý bao gồm cả ngày cận biên (`00:00:00` đến `23:59:59`).
3. **Quản Lý Ẩn / Hiện Cột (Column Visibility Management):**
   - Tích hợp thanh công cụ Dropdown "Tùy chỉnh cột" cho phép người dùng bật/tắt (checkbox) từng cột.
   - Hỗ trợ cờ `disableHide` cho các cột định danh bắt buộc (STT, Mã hợp đồng, Thao tác).
   - Tự động đồng bộ và lưu nhớ trạng thái danh sách cột hiển thị vào `localStorage` theo khóa định danh bảng (`grid_cols_{table_id}`).
4. **Tùy Chỉnh Độ Rộng Cột & An Toàn Bố Cục (Resizable Columns):**
   - Tích hợp thanh Resizer tại mép phân tách giữa các tiêu đề cột, hỗ trợ kéo thả chuột (Mouse drag) điều chỉnh độ rộng linh hoạt.
   - Ràng buộc độ rộng tối thiểu an toàn (`minWidth: 80px`) tránh co giật vỡ bảng, cắt chữ (`text-ellipsis`) kèm tooltip khi chuỗi dữ liệu quá dài.
   - Ghi nhớ độ rộng cột tùy chỉnh vào `localStorage` (`grid_widths_{table_id}`).

---

## 6. Kế hoạch Kiểm định Kiến trúc & Bàn giao Kỹ thuật (Technical Sign-off)

1. **Hợp đồng API:** Đã ban hành toàn bộ tại [`docs/api_contracts.yaml`](./api_contracts.yaml) (OpenAPI 3.0.3 Specification).
2. **Kiến trúc Bảo mật & Đánh giá Rủi ro:** Đã ban hành chi tiết tại [`docs/security_threat_modeling.md`](./security_threat_modeling.md) (STRIDE Threat Model & Defense-in-Depth).
3. **Cơ sở Dữ liệu:** Đã biên soạn mã DDL tại [`database/schema.sql`](../database/schema.sql).
4. **Sẵn sàng chuyển giao:** Toàn bộ bản thiết kế đã đáp ứng trọn vẹn $100\%$ các User Stories trong [`docs/BRD.md`](./BRD.md), sẵn sàng để **Data Parser Engineer (`@DataParserEngineer`)** xây dựng động cơ bóc tách và **Fullstack Developer (`@FullstackDeveloper`)** triển khai giao diện.

