-- =============================================================================
-- HỆ THỐNG XỬ LÝ & BÁO CÁO SAO KÊ NGÂN HÀNG TỰ ĐỘNG (BANK STATEMENT PROCESSOR)
-- DATABASE SCHEMA DEFINITION (POSTGRESQL 15+ / STANDARD RDBMS COMPLIANT)
-- CHUẨN THIẾT KẾ: 3NF, HIGH-PRECISION DECIMAL, COMPOSITE INDEXES, AUDIT TRAIL
-- THIẾT KẾ BỞI: Lead System & Data Architect (@SystemArchitect)
-- =============================================================================

-- Kích hoạt extension hỗ trợ UUID và sinh mã ngẫu nhiên nếu cần
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. BẢNG NGÂN HÀNG & TÀI KHOẢN (BANK ACCOUNTS)
-- Lưu thông tin cấu hình của >= 7 ngân hàng thương mại và tài khoản cá nhân MBBank
-- =============================================================================
CREATE TABLE bank_accounts (
    account_id BIGSERIAL PRIMARY KEY,
    bank_code VARCHAR(20) NOT NULL,                         -- MBB, MBV, VPB, TPB, CTG, SHB, VCB, TCB, ...
    bank_name VARCHAR(100) NOT NULL,                        -- Tên ngân hàng đầy đủ
    account_number VARCHAR(50) NOT NULL UNIQUE,             -- Số tài khoản thanh toán
    account_holder VARCHAR(150) NOT NULL,                   -- Tên chủ tài khoản / Pháp nhân (Cty hoặc Bà Nguyễn Thị Lan Anh)
    tax_code VARCHAR(50),                                   -- Mã số thuế / Mã định danh Pháp nhân (Multi-Entity Isolation)
    account_type VARCHAR(20) NOT NULL DEFAULT 'CORPORATE',  -- 'CORPORATE' (Cty) hoặc 'SPECIAL_CASH' (MBBank rút tiền mặt)
    currency VARCHAR(5) NOT NULL DEFAULT 'VND',             -- Đơn vị tiền tệ
    opening_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,   -- Số dư khởi tạo ban đầu
    current_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,   -- Số dư cập nhật mới nhất
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bank_accounts_code ON bank_accounts(bank_code);
CREATE INDEX idx_bank_accounts_type ON bank_accounts(account_type);
CREATE INDEX idx_bank_accounts_tax_code ON bank_accounts(tax_code);
CREATE INDEX idx_bank_accounts_holder ON bank_accounts(account_holder);

-- =============================================================================
-- 2. BẢNG QUẢN LÝ FILE SAO KÊ GỐC (BANK STATEMENT FILES)
-- Quản lý metadata, vị trí lưu trữ trên Object Storage và trạng thái đối soát
-- =============================================================================
CREATE TABLE bank_statement_files (
    file_id BIGSERIAL PRIMARY KEY,
    file_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    account_id BIGINT REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    template_code VARCHAR(50),                              -- MBB_CORP_XLSX, MBB_PERSONAL_XLSX, MBV_CORP_XLSX, VPB_CORP_XLSX, TPB_CORP_XLSX, CTG_EFAST_XLS, SHB_CORP_XLS...
    reconciliation_mode VARCHAR(50),                        -- MODE_1_FULL_HEADER_FOOTER .. MODE_5_CUTOFF_INTEREST_INCLUDED
    original_filename VARCHAR(255) NOT NULL,               -- Tên file gốc người dùng tải lên (.xlsx, .xls)
    storage_path VARCHAR(500) NOT NULL,                     -- Đường dẫn Object Storage: /statements/{bank}/{YYYY}/{MM}/{uuid}.xlsx
    file_size_bytes BIGINT NOT NULL,                        -- Dung lượng file (Bytes)
    file_sha256 CHAR(64) NOT NULL UNIQUE,                   -- Mã băm toàn vẹn SHA-256 chống trùng lặp upload
    mime_type VARCHAR(100) NOT NULL,                        -- MIME type xác thực
    
    -- Siêu dữ liệu bóc tách từ Header / Footer của sao kê
    statement_period_start DATE,                            -- Kỳ sao kê từ ngày
    statement_period_end DATE,                              -- Kỳ sao kê đến ngày
    header_opening_balance DECIMAL(18, 2),                  -- Số dư đầu kỳ ghi trên file
    header_closing_balance DECIMAL(18, 2),                  -- Số dư cuối kỳ ghi trên file
    calculated_closing_balance DECIMAL(18, 2),              -- Số dư cuối kỳ hệ thống tính toán đối soát
    
    -- Thống kê tổng hợp
    total_credit_amount DECIMAL(18, 2) DEFAULT 0.00,        -- Tổng phát sinh Có (Thu)
    total_debit_amount DECIMAL(18, 2) DEFAULT 0.00,         -- Tổng phát sinh Nợ (Chi)
    total_transactions_count INT DEFAULT 0,                 -- Tổng số dòng giao dịch bóc tách được
    
    -- Trạng thái vòng đời xử lý
    processing_status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED', 
    -- 'UPLOADED' -> 'QUEUED' -> 'PARSING' -> 'RECONCILING' -> 'COMPLETED' -> 'FAILED'
    
    -- Trạng thái đối soát số dư
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- 'PENDING' -> 'BALANCED' (Khớp 100%) -> 'DISCREPANCY' (Lệch số dư)
    discrepancy_amount DECIMAL(18, 2) DEFAULT 0.00,         -- Chênh lệch số dư nếu có (|header - calculated|)
    error_message TEXT,                                     -- Chi tiết lỗi nếu parsing thất bại
    
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',     -- Chị Nghiêm Lê Cẩm Nhung
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_account_id ON bank_statement_files(account_id);
CREATE INDEX idx_files_status ON bank_statement_files(processing_status);
CREATE INDEX idx_files_reconciliation ON bank_statement_files(reconciliation_status);
CREATE INDEX idx_files_created_at ON bank_statement_files(created_at DESC);

-- =============================================================================
-- 3. BẢNG DANH MỤC THU / CHI (CATEGORIES)
-- Người dùng (Chị Nhung) hoàn toàn tự tạo, chỉnh sửa và quản lý trên giao diện
-- =============================================================================
CREATE TABLE categories (
    category_id BIGSERIAL PRIMARY KEY,
    category_type VARCHAR(10) NOT NULL CHECK (category_type IN ('INCOME', 'EXPENSE')), -- THU hoặc CHI
    category_name VARCHAR(150) NOT NULL,                    -- Tên danh mục (ví dụ: Chi Nhà cung cấp, Chi Lương...)
    color_code VARCHAR(10) DEFAULT '#3B82F6',               -- Màu đại diện hiển thị trên biểu đồ Waterfall / Tag
    description VARCHAR(255),
    display_order INT DEFAULT 0,                            -- Thứ tự hiển thị trên báo cáo
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_type_name UNIQUE (category_type, category_name)
);

CREATE INDEX idx_categories_type ON categories(category_type);

-- =============================================================================
-- 4. BẢNG QUY TẮC PHÂN LOẠI NÂNG CAO (CLASSIFICATION RULES)
-- Trình thiết lập luật phân loại từ khóa kết hợp điều kiện đa trường (AND/OR)
-- =============================================================================
CREATE TABLE classification_rules (
    rule_id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    rule_name VARCHAR(150) NOT NULL,
    priority INT NOT NULL DEFAULT 10,                       -- Mức độ ưu tiên (số nhỏ ưu tiên chạy trước)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Bộ điều kiện nâng cao (Multi-Conditions Logic)
    keyword_patterns TEXT NOT NULL,                         -- Từ khóa cách nhau dấu phẩy: "ncc, tien hang, inv"
    match_type VARCHAR(20) NOT NULL DEFAULT 'CONTAINS',     -- 'CONTAINS', 'EXACT', 'REGEX'
    target_bank_code VARCHAR(20),                           -- Áp dụng riêng cho 1 ngân hàng (NULL = Tất cả)
    target_account_number VARCHAR(50),                      -- Áp dụng riêng cho 1 số TK cụ thể (NULL = Tất cả)
    min_amount DECIMAL(18, 2),                              -- Áp dụng nếu số tiền >= min_amount (NULL = Bỏ qua)
    max_amount DECIMAL(18, 2),                              -- Áp dụng nếu số tiền <= max_amount (NULL = Bỏ qua)
    applies_to_flow VARCHAR(10) CHECK (applies_to_flow IN ('ALL', 'CREDIT', 'DEBIT')), -- Áp dụng Thu / Chi / Cả hai
    
    created_by VARCHAR(100) DEFAULT 'USER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rules_priority ON classification_rules(priority ASC);
CREATE INDEX idx_rules_category ON classification_rules(category_id);
CREATE INDEX idx_rules_active ON classification_rules(is_active);

-- =============================================================================
-- 5. BẢNG GIAO DỊCH CHI TIẾT (BANK TRANSACTIONS)
-- Lưu trữ từng dòng giao dịch đã làm sạch, độ chính xác Decimal(18,2), Audit Trail
-- =============================================================================
CREATE TABLE bank_transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    file_id BIGINT NOT NULL REFERENCES bank_statement_files(file_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES bank_accounts(account_id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES categories(category_id) ON DELETE SET NULL,
    
    -- Dữ liệu giao dịch chuẩn hóa
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,     -- Ngày giờ giao dịch chuẩn hóa ISO 8601
    value_date DATE,                                        -- Ngày hiệu lực / giá trị
    reference_number VARCHAR(100),                          -- Số tham chiếu / Mã bút toán ngân hàng
    counter_party VARCHAR(255),                             -- Đối tượng thụ hưởng hoặc đối tượng chuyển (để trống nếu không có trong sao kê)
    description TEXT NOT NULL,                              -- Nội dung diễn giải nguyên bản từ sao kê
    
    -- Số tiền chính xác cao (DECIMAL 18, 2)
    debit_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,      -- Phát sinh Nợ (Tiền chi ra)
    credit_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,     -- Phát sinh Có (Tiền thu vào)
    running_balance DECIMAL(18, 2) NOT NULL,                -- Số dư lũy kế sau giao dịch
    
    -- Chống trùng lặp dòng giao dịch (6-Tuple Canonical Hash)
    dedup_hash CHAR(64) NOT NULL,                           -- SHA256(account_no | trans_date_iso | debit | credit | ref_no | running_balance)
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,            -- Cờ đánh dấu giao dịch trùng
    
    -- Cơ chế Phân loại & Khóa ghi đè (Manual Override & Notes)
    is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE nếu người dùng tự tay phân loại -> CẤM quy tắc đè lên
    applied_rule_id BIGINT REFERENCES classification_rules(rule_id) ON DELETE SET NULL,
    internal_note TEXT,                                     -- Ghi chú nội bộ do chị Cẩm Nhung nhập tay
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_transaction_dedup UNIQUE (account_id, dedup_hash)
);

-- Chỉ mục tối ưu cho truy vấn báo cáo tốc độ cao (< 500ms)
CREATE INDEX idx_trans_file_id ON bank_transactions(file_id);
CREATE INDEX idx_trans_account_date ON bank_transactions(account_id, transaction_date DESC);
CREATE INDEX idx_trans_date ON bank_transactions(transaction_date DESC);
CREATE INDEX idx_trans_category ON bank_transactions(category_id);
CREATE INDEX idx_trans_counter_party ON bank_transactions(counter_party);
CREATE INDEX idx_trans_manual_override ON bank_transactions(is_manual_override);
CREATE INDEX idx_trans_search_desc ON bank_transactions USING gin(to_tsvector('simple', description));

-- =============================================================================
-- 6. BẢNG SỔ QUỸ TIỀN MẶT ĐỐI ỨNG (CASH LEDGER)
-- Theo dõi luồng tiền mặt rút từ TK MBBank của bà Nguyễn Thị Lan Anh về quỹ
-- =============================================================================
CREATE TABLE cash_ledger (
    cash_entry_id BIGSERIAL PRIMARY KEY,
    linked_transaction_id BIGINT REFERENCES bank_transactions(transaction_id) ON DELETE SET NULL,
    entry_date DATE NOT NULL,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('INFLOW', 'OUTFLOW')), -- NHẬP QUỸ hoặc XUẤT QUỸ
    amount DECIMAL(18, 2) NOT NULL,
    running_cash_balance DECIMAL(18, 2) NOT NULL,           -- Tồn quỹ tiền mặt lũy kế sau bút toán
    receiver_payer VARCHAR(150),                            -- Người nhận / Người nộp
    reason TEXT NOT NULL,                                   -- Lý do thu/chi tiền mặt
    internal_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cash_date ON cash_ledger(entry_date DESC);

-- =============================================================================
-- 7. BẢNG NHẬT KÝ KIỂM TOÁN HỆ THỐNG (AUDIT LOGS)
-- Ghi nhận toàn bộ thao tác upload, đối soát, áp dụng luật và sửa đổi thủ công
-- =============================================================================
CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    actor VARCHAR(100) NOT NULL,                            -- User hoặc Background Worker
    action VARCHAR(50) NOT NULL,                            -- 'UPLOAD_FILE', 'PARSE_COMPLETED', 'MANUAL_TAG', ...
    target_entity VARCHAR(50) NOT NULL,                     -- 'STATEMENT_FILE', 'TRANSACTION', 'RULE'
    target_id VARCHAR(50) NOT NULL,
    details JSONB,                                          -- Lưu chi tiết thay đổi (Before/After)
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_target ON audit_logs(target_entity, target_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================================================
-- 8. VIEW BÁO CÁO CFO (TỔNG TỒN QUỸ HỢP NHẤT HÔM NAY - TRƯỚC 9H SÁNG)
-- =============================================================================
CREATE OR REPLACE VIEW v_cfo_daily_liquidity AS
WITH bank_totals AS (
    SELECT 
        ba.account_id,
        ba.bank_code,
        ba.bank_name,
        ba.account_number,
        ba.account_holder,
        ba.account_type,
        ba.current_balance AS account_balance
    FROM bank_accounts ba
    WHERE ba.is_active = TRUE
),
cash_total AS (
    SELECT COALESCE(
        (SELECT running_cash_balance FROM cash_ledger ORDER BY entry_date DESC, cash_entry_id DESC LIMIT 1),
        0.00
    ) AS cash_on_hand_balance
)
SELECT 
    COALESCE((SELECT SUM(account_balance) FROM bank_totals), 0.00) AS total_bank_balance,
    0.00::DECIMAL(18, 2) AS total_cash_on_hand,
    COALESCE((SELECT SUM(account_balance) FROM bank_totals), 0.00) AS total_consolidated_liquidity,
    CURRENT_DATE AS report_date;

-- =============================================================================
-- 9. BẢNG QUẢN LÝ FILE SAO KÊ TÍN DỤNG GỐC (CREDIT STATEMENT FILES)
-- =============================================================================
CREATE TABLE credit_statement_files (
    file_id BIGSERIAL PRIMARY KEY,
    file_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    bank_code VARCHAR(20) NOT NULL,                         -- CTG, MBB, BIDV...
    template_code VARCHAR(50) NOT NULL,                     -- CTG_LOAN_XLS, MBB_LOAN_LD_XLSX
    original_filename VARCHAR(255) NOT NULL,                -- Tên file gốc người dùng tải lên (.xlsx, .xls)
    storage_path VARCHAR(500) NOT NULL,                     -- Đường dẫn Object Storage: /credit_statements/{bank}/{YYYY}/{uuid}.ext
    file_size_bytes BIGINT NOT NULL,                        -- Dung lượng file (Bytes)
    file_sha256 CHAR(64) NOT NULL UNIQUE,                   -- Mã băm toàn vẹn SHA-256 chống trùng lặp upload
    mime_type VARCHAR(100) NOT NULL,                        -- MIME type xác thực
    
    -- Siêu dữ liệu bóc tách từ sao kê tín dụng
    statement_date DATE,                                    -- Ngày in hoặc ngày chốt dữ liệu ghi trên file
    total_principal_amount DECIMAL(18, 2) DEFAULT 0.00,     -- Tổng dư nợ ghi trên file (Header/Dòng Tổng)
    total_interest_amount DECIMAL(18, 2) DEFAULT 0.00,      -- Tổng lãi phải trả/cộng dồn ghi trên file
    total_payable_amount DECIMAL(18, 2) DEFAULT 0.00,       -- Tổng tiền phải trả ghi trên file
    calculated_principal_amount DECIMAL(18, 2) DEFAULT 0.00,-- Tổng dư nợ hệ thống tính toán từ các khoản vay
    total_contracts_count INT DEFAULT 0,                    -- Tổng số lượng khoản vay / khế ước bóc tách được
    
    -- Trạng thái vòng đời xử lý & đối soát
    processing_status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
    -- 'UPLOADED' -> 'PARSING' -> 'COMPLETED' -> 'FAILED'
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- 'PENDING' -> 'BALANCED' (Khớp 100%) -> 'DISCREPANCY' (Lệch số dư)
    discrepancy_amount DECIMAL(18, 2) DEFAULT 0.00,         -- Chênh lệch (|total_principal_amount - calculated_principal_amount|)
    error_message TEXT,
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_files_bank ON credit_statement_files(bank_code);
CREATE INDEX idx_credit_files_status ON credit_statement_files(processing_status);
CREATE INDEX idx_credit_files_reconcile ON credit_statement_files(reconciliation_status);
CREATE INDEX idx_credit_files_created ON credit_statement_files(created_at DESC);

-- =============================================================================
-- 10. BẢNG DANH MỤC HỢP ĐỒNG VAY & KHẾ ƯỚC (CREDIT FACILITIES / LOANS)
-- Lưu trữ trạng thái mới nhất của các khoản vay tín dụng
-- =============================================================================
CREATE TABLE credit_facilities (
    loan_id BIGSERIAL PRIMARY KEY,
    bank_code VARCHAR(20) NOT NULL,                         -- CTG, MBB, ...
    bank_name VARCHAR(100) NOT NULL,                        -- Tên ngân hàng
    contract_number VARCHAR(50) NOT NULL,                   -- Số tài khoản vay / Số LD / Số HĐ tín dụng
    borrower_name VARCHAR(150) NOT NULL,                    -- Tên đơn vị vay (Doanh nghiệp)
    cif_number VARCHAR(50),                                 -- Mã CIF khách hàng
    loan_purpose TEXT,                                      -- Mục đích vay (Thanh toan tien hang...)
    currency VARCHAR(5) NOT NULL DEFAULT 'VND',             -- Loại tiền
    disbursement_date DATE,                                 -- Ngày giải ngân
    maturity_date DATE,                                     -- Ngày đáo hạn
    term VARCHAR(20),                                       -- Kỳ hạn (4M, 6M...)
    interest_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,    -- Lãi suất (%/năm)
    debt_group VARCHAR(10) NOT NULL DEFAULT '1',            -- Nhóm nợ (1: Đủ tiêu chuẩn, 2, 3...)
    loan_type VARCHAR(30) NOT NULL DEFAULT 'SHORT_TERM',    -- 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'FINANCIAL_LEASE'
    institution_type VARCHAR(30) NOT NULL DEFAULT 'BANK',   -- 'BANK', 'FINANCE_COMPANY', 'LEASING_COMPANY', 'OTHER'
    is_manual BOOLEAN NOT NULL DEFAULT FALSE,               -- TRUE nếu nhập lẻ thủ công, FALSE nếu bóc tách từ file sao kê
    note TEXT,                                              -- Ghi chú nội bộ
    
    -- Hình thức trả lãi & Lịch trả lãi (Thông tư 14/2017/TT-NHNN)
    interest_payment_method VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (interest_payment_method IN ('MONTHLY', 'END_OF_TERM')), -- 'MONTHLY' (Hằng tháng), 'END_OF_TERM' (Cuối kỳ)
    monthly_interest_due_day INT CHECK (monthly_interest_due_day IS NULL OR (monthly_interest_due_day >= 1 AND monthly_interest_due_day <= 31)), -- Ngày trả lãi trong tháng (1-31)
    calculated_interest_due DECIMAL(18, 2) NOT NULL DEFAULT 0.00, -- Số lãi cần trả tính theo quy định pháp luật (TT 14/2017/TT-NHNN Actual/365)

    -- Số dư & nghĩa vụ trả nợ
    current_principal_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00, -- Dư nợ gốc hiện tại
    accrued_interest DECIMAL(18, 2) DEFAULT 0.00,           -- Lãi cộng dồn
    next_repayment_date DATE,                               -- Ngày đến hạn tiếp theo
    next_principal_amount DECIMAL(18, 2) DEFAULT 0.00,      -- Số tiền gốc đến hạn gần nhất
    next_interest_amount DECIMAL(18, 2) DEFAULT 0.00,       -- Số tiền lãi đến hạn gần nhất
    total_repayment_amount DECIMAL(18, 2) DEFAULT 0.00,     -- Tổng số tiền phải trả kỳ tới
    
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',           -- 'ACTIVE', 'SETTLED', 'OVERDUE'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_credit_facility_bank_contract UNIQUE (bank_code, contract_number)
);

CREATE INDEX idx_credit_facilities_bank ON credit_facilities(bank_code);
CREATE INDEX idx_credit_facilities_institution_type ON credit_facilities(institution_type);
CREATE INDEX idx_credit_facilities_is_manual ON credit_facilities(is_manual);
CREATE INDEX idx_credit_facilities_maturity ON credit_facilities(maturity_date);
CREATE INDEX idx_credit_facilities_next_repayment ON credit_facilities(next_repayment_date);
CREATE INDEX idx_credit_facilities_status ON credit_facilities(status);

-- =============================================================================
-- 11. BẢNG CHI TIẾT KHOẢN VAY THEO FILE SAO KÊ (CREDIT STATEMENT ITEMS)
-- Lưu trữ snapshot lịch sử theo từng lần upload sao kê phục vụ kiểm toán
-- =============================================================================
CREATE TABLE credit_statement_items (
    item_id BIGSERIAL PRIMARY KEY,
    file_id BIGINT NOT NULL REFERENCES credit_statement_files(file_id) ON DELETE CASCADE,
    loan_id BIGINT REFERENCES credit_facilities(loan_id) ON DELETE SET NULL,
    contract_number VARCHAR(50) NOT NULL,
    disbursement_date DATE,
    maturity_date DATE,
    term VARCHAR(20),
    interest_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,
    debt_group VARCHAR(10) DEFAULT '1',
    loan_purpose TEXT,
    interest_payment_method VARCHAR(20) DEFAULT 'MONTHLY',
    monthly_interest_due_day INT,
    calculated_interest_due DECIMAL(18, 2) DEFAULT 0.00,
    principal_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    principal_balance_vnd DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    accrued_interest DECIMAL(18, 2) DEFAULT 0.00,
    next_principal_due_date DATE,
    next_principal_amount DECIMAL(18, 2) DEFAULT 0.00,
    next_interest_due_date DATE,
    next_interest_amount DECIMAL(18, 2) DEFAULT 0.00,
    total_due_amount DECIMAL(18, 2) DEFAULT 0.00,
    currency VARCHAR(5) NOT NULL DEFAULT 'VND',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_items_file ON credit_statement_items(file_id);
CREATE INDEX idx_credit_items_loan ON credit_statement_items(loan_id);
CREATE INDEX idx_credit_items_contract ON credit_statement_items(contract_number);

-- =============================================================================
-- 12. BẢNG HỒ SƠ GIẢI NGÂN KHOẢN VAY (DISBURSEMENT DOCUMENTS / DOSSIER)
-- Mỗi khoản vay liên kết với một bộ hồ sơ giải ngân lưu tại Object Storage
-- Đường dẫn Object Storage: /disbursement_dossiers/{bank_code}/{contract_number}/{uuid}_{filename}
-- =============================================================================
CREATE TABLE disbursement_documents (
    document_id BIGSERIAL PRIMARY KEY,
    document_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    loan_id BIGINT NOT NULL REFERENCES credit_facilities(loan_id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,                        -- Tên file tài liệu gốc (.pdf, .jpg, .docx, .zip...)
    storage_path VARCHAR(500) NOT NULL,                     -- Đường dẫn Object Storage: disbursement_dossiers/{bank}/{contract}/{uuid}_{name}
    file_size_bytes BIGINT NOT NULL,                        -- Kích thước file (bytes)
    file_sha256 CHAR(64) NOT NULL,                          -- Mã băm SHA-256 toàn vẹn tài liệu
    mime_type VARCHAR(100) NOT NULL,                        -- MIME type tài liệu
    document_type VARCHAR(50) NOT NULL DEFAULT 'DISBURSEMENT_RECORD',
    -- 'CONTRACT' (Hợp đồng tín dụng), 'DISBURSEMENT_RECORD' (Hồ sơ/Biên bản giải ngân), 'DEBT_NOTE' (Khế ước nhận nợ), 'INVOICE' (Hóa đơn/chứng từ sử dụng vốn/UNC), 'COLLATERAL' (Tài sản bảo đảm/thế chấp), 'APPROVAL' (Phê duyệt tín dụng), 'OTHER' (Khác)
    description TEXT,                                       -- Mô tả hoặc ghi chú chứng từ
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disburse_docs_loan_id ON disbursement_documents(loan_id);
CREATE INDEX idx_disburse_docs_uuid ON disbursement_documents(document_uuid);

-- =============================================================================
-- 13. VIEW BÁO CÁO NGHĨA VỤ NỢ TÍN DỤNG & THANH KHOẢN RÒNG CFO
-- =============================================================================
CREATE OR REPLACE VIEW v_cfo_debt_obligations AS
SELECT 
    cf.bank_code,
    cf.bank_name,
    COUNT(cf.loan_id) AS total_active_loans,
    SUM(cf.current_principal_balance) AS total_principal_balance,
    SUM(cf.accrued_interest) AS total_accrued_interest,
    SUM(cf.next_principal_amount) AS upcoming_principal_due,
    SUM(cf.next_interest_amount) AS upcoming_interest_due,
    SUM(cf.next_principal_amount + cf.next_interest_amount) AS total_upcoming_debt_obligation,
    ROUND(SUM(cf.current_principal_balance * cf.interest_rate) / NULLIF(SUM(cf.current_principal_balance), 0), 4) AS weighted_avg_interest_rate
FROM credit_facilities cf
WHERE cf.is_active = TRUE AND cf.status = 'ACTIVE'
GROUP BY cf.bank_code, cf.bank_name;


