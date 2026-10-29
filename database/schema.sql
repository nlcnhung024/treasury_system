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
    (SELECT SUM(account_balance) FROM bank_totals) AS total_bank_balance,
    (SELECT cash_on_hand_balance FROM cash_total) AS total_cash_on_hand,
    ((SELECT SUM(account_balance) FROM bank_totals) + (SELECT cash_on_hand_balance FROM cash_total)) AS total_consolidated_liquidity,
    CURRENT_DATE AS report_date;

