-- =============================================================================
-- HỆ THỐNG XỬ LÝ & BÁO CÁO SAO KÊ NGÂN HÀNG TỰ ĐỘNG (BANK STATEMENT PROCESSOR)
-- DATABASE SCHEMA DEFINITION (POSTGRESQL 15+ / STANDARD RDBMS COMPLIANT)
-- CHUẨN THIẾT KẾ: 3NF+, HIGH-PRECISION DECIMAL, COMPOSITE & PARTIAL INDEXES,
-- MULTI-ENTITY ISOLATION, DEBT REPAYMENT PLANNING & AUDIT TRAIL
-- THIẾT KẾ BỞI: Lead System & Data Architect (@SystemArchitect)
-- =============================================================================

-- Kích hoạt extension hỗ trợ UUID và sinh mã ngẫu nhiên
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. BẢNG PHÁP NHÂN & TỔ CHỨC DOANH NGHIỆP (CORPORATE ENTITIES)
-- Mô hình hóa cô lập đa pháp nhân (Multi-Entity / Multi-Tenant Isolation)
-- =============================================================================
CREATE TABLE corporate_entities (
    entity_id BIGSERIAL PRIMARY KEY,
    entity_code VARCHAR(50) NOT NULL UNIQUE,                -- Mã định danh: HQ_CORP, SUB_LOGISTICS, SUB_TRADING...
    company_name VARCHAR(255) NOT NULL,                     -- Tên đầy đủ pháp nhân doanh nghiệp
    tax_code VARCHAR(50) NOT NULL UNIQUE,                   -- Mã số thuế doanh nghiệp
    is_holding_parent BOOLEAN NOT NULL DEFAULT FALSE,       -- TRUE nếu là Công ty Mẹ / Trụ sở tập đoàn
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_corporate_entities_tax_code ON corporate_entities(tax_code);
CREATE INDEX idx_corporate_entities_code ON corporate_entities(entity_code);

-- =============================================================================
-- 1.1 BẢNG PHỤ DANH MỤC NGÂN HÀNG & TCTD (BANKS MASTER DIRECTORY)
-- Chứa thông tin chuẩn hóa về các tổ chức tín dụng / ngân hàng liên kết
-- =============================================================================
CREATE TABLE banks (
    bank_id BIGSERIAL PRIMARY KEY,
    bank_code VARCHAR(20) NOT NULL UNIQUE,                  -- MBB, CTG, VPB, TPB, SHB, MBV, EVF, VCB, TCB...
    bank_name VARCHAR(150) NOT NULL,                        -- Tên ngân hàng đầy đủ (vd: Ngân hàng TMCP Quân Đội)
    branch_name VARCHAR(150),                               -- Tên chi nhánh (vd: Chi nhánh Ba Đình, Chi nhánh Thăng Long...)
    tax_code VARCHAR(50),                                   -- Mã số thuế ngân hàng/chi nhánh (vd: 0100283873)
    short_name VARCHAR(50) NOT NULL,                        -- Tên viết tắt hiển thị (vd: MB, VietinBank, VPBank, TPBank...)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,                -- Trạng thái hoạt động
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_banks_code ON banks(bank_code);
CREATE INDEX idx_banks_short_name ON banks(short_name);

-- =============================================================================
-- 2. BẢNG NGÂN HÀNG & TÀI KHOẢN THANH TOÁN (BANK ACCOUNTS)
-- Lưu thông tin tài khoản doanh nghiệp (Khối 1) và tài khoản cá nhân CEO ủy quyền (Khối 2)
-- =============================================================================
CREATE TABLE bank_accounts (
    account_id BIGSERIAL PRIMARY KEY,
    bank_id BIGINT REFERENCES banks(bank_id) ON DELETE SET NULL,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,                         -- MBB, MBV, VPB, TPB, CTG, SHB, VCB, TCB...
    bank_name VARCHAR(100) NOT NULL,                        -- Tên ngân hàng đầy đủ
    account_number VARCHAR(50) NOT NULL UNIQUE,             -- Số tài khoản thanh toán
    account_holder VARCHAR(150) NOT NULL,                   -- Tên chủ tài khoản / Pháp nhân (Cty hoặc Bà Nguyễn Thị Lan Anh)
    tax_code VARCHAR(50),                                   -- Mã số thuế / Mã định danh Pháp nhân
    account_type VARCHAR(20) NOT NULL DEFAULT 'CORPORATE',  -- 'CORPORATE' (Khối 1: Cty) hoặc 'SPECIAL_CASH' (Khối 2: MBBank rút tiền mặt CEO)
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
CREATE INDEX idx_bank_accounts_entity ON bank_accounts(entity_id);

-- =============================================================================
-- 3. BẢNG QUẢN LÝ FILE SAO KÊ TÀI KHOẢN (BANK STATEMENT FILES)
-- Quản lý metadata, vị trí Object Storage, trạng thái đối soát và khoảng trống kỳ sao kê
-- =============================================================================
CREATE TABLE bank_statement_files (
    file_id BIGSERIAL PRIMARY KEY,
    file_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    account_id BIGINT REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    statement_type VARCHAR(30) NOT NULL DEFAULT 'CASA',     -- 'CASA' (Thanh toán), 'SPECIAL_CASH' (Ủy quyền CEO)
    template_code VARCHAR(50),                              -- MBB_CORP_XLSX, MBB_PERSONAL_XLSX, MBV_CORP_XLSX, VPB_CORP_XLSX, TPB_CORP_XLSX, CTG_EFAST_XLS, SHB_CORP_XLS...
    reconciliation_mode VARCHAR(50),                        -- MODE_1_FULL_HEADER_FOOTER .. MODE_5_CUTOFF_INTEREST_INCLUDED
    original_filename VARCHAR(255) NOT NULL,                -- Tên file gốc người dùng tải lên (.xlsx, .xls)
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
    
    -- Trạng thái đối soát số dư & Cảnh báo lệch kỳ (Data Gap Indicator)
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- 'PENDING' -> 'BALANCED' (Khớp 100%) -> 'DISCREPANCY' (Lệch số dư)
    discrepancy_amount DECIMAL(18, 2) DEFAULT 0.00,         -- Chênh lệch số dư nếu có (|header - calculated|)
    has_data_gap BOOLEAN NOT NULL DEFAULT FALSE,            -- TRUE nếu phát hiện lệch số dư ĐK - CK giữa các kỳ sao kê
    gap_discrepancy_amount DECIMAL(18, 2) DEFAULT 0.00,     -- Số tiền chênh lệch giữa cuối kỳ trước và đầu kỳ sau
    error_message TEXT,                                     -- Chi tiết lỗi nếu parsing thất bại
    
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',     -- Chị Nghiêm Lê Cẩm Nhung
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_account_id ON bank_statement_files(account_id);
CREATE INDEX idx_files_entity_id ON bank_statement_files(entity_id);
CREATE INDEX idx_files_status ON bank_statement_files(processing_status);
CREATE INDEX idx_files_reconciliation ON bank_statement_files(reconciliation_status);
CREATE INDEX idx_files_created_at ON bank_statement_files(created_at DESC);
CREATE INDEX idx_files_data_gap ON bank_statement_files(has_data_gap) WHERE has_data_gap = TRUE;

-- =============================================================================
-- 4. BẢNG DANH MỤC THU / CHI (CATEGORIES)
-- Người dùng (Chị Nhung) hoàn toàn tự tạo, chỉnh sửa và quản lý trên giao diện
-- =============================================================================
CREATE TABLE categories (
    category_id BIGSERIAL PRIMARY KEY,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL, -- NULL: Dùng chung toàn tập đoàn
    category_type VARCHAR(10) NOT NULL CHECK (category_type IN ('INCOME', 'EXPENSE')), -- THU hoặc CHI
    category_name VARCHAR(150) NOT NULL,                    -- Tên danh mục (Chi Nhà cung cấp, Chi Lương...)
    color_code VARCHAR(10) DEFAULT '#3B82F6',               -- Màu đại diện hiển thị trên biểu đồ Waterfall / Tag
    description VARCHAR(255),
    display_order INT DEFAULT 0,                            -- Thứ tự hiển thị trên báo cáo
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_type_name UNIQUE (category_type, category_name)
);

CREATE INDEX idx_categories_type ON categories(category_type);
CREATE INDEX idx_categories_entity ON categories(entity_id);

-- =============================================================================
-- 5. BẢNG QUY TẮC PHÂN LOẠI NÂNG CAO (CLASSIFICATION RULES)
-- Trình thiết lập luật phân loại từ khóa kết hợp điều kiện đa trường (AND/OR)
-- =============================================================================
CREATE TABLE classification_rules (
    rule_id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
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
CREATE INDEX idx_rules_entity ON classification_rules(entity_id);

-- =============================================================================
-- 6. BẢNG GIAO DỊCH CHI TIẾT (BANK TRANSACTIONS)
-- Lưu trữ từng dòng giao dịch làm sạch, kiểm soát điểm neo số dư và khóa ghi đè
-- =============================================================================
CREATE TABLE bank_transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    file_id BIGINT NOT NULL REFERENCES bank_statement_files(file_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES bank_accounts(account_id) ON DELETE RESTRICT,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    category_id BIGINT REFERENCES categories(category_id) ON DELETE SET NULL,
    
    -- Dữ liệu giao dịch chuẩn hóa
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,     -- Ngày giờ giao dịch chuẩn hóa ISO 8601
    value_date DATE,                                        -- Ngày hiệu lực / giá trị
    reference_number VARCHAR(100),                          -- Số tham chiếu / Mã bút toán ngân hàng
    counter_party VARCHAR(255),                             -- Đối tượng thụ hưởng hoặc đối tượng chuyển
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
    
    -- Điểm neo Số dư Lũy kế (Anchor Balance Point - US-04.9)
    is_anchor_point BOOLEAN NOT NULL DEFAULT FALSE,         -- TRUE nếu dòng này là mốc chuẩn do người dùng thiết lập
    anchor_adjusted_at TIMESTAMP WITH TIME ZONE,            -- Thời điểm thực hiện hiệu chỉnh điểm neo
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_transaction_dedup UNIQUE (account_id, dedup_hash),
    CONSTRAINT chk_trans_amounts_non_negative CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CONSTRAINT chk_trans_has_flow CHECK (debit_amount > 0 OR credit_amount > 0)
);

-- Chỉ mục tối ưu cho truy vấn báo cáo tốc độ cao (< 100ms)
CREATE INDEX idx_trans_file_id ON bank_transactions(file_id);
CREATE INDEX idx_trans_account_date ON bank_transactions(account_id, transaction_date DESC);
CREATE INDEX idx_trans_date ON bank_transactions(transaction_date DESC);
CREATE INDEX idx_trans_category ON bank_transactions(category_id);
CREATE INDEX idx_trans_counter_party ON bank_transactions(counter_party);
CREATE INDEX idx_trans_manual_override ON bank_transactions(is_manual_override);
CREATE INDEX idx_trans_search_desc ON bank_transactions USING gin(to_tsvector('simple', description));
CREATE INDEX idx_trans_uncategorized ON bank_transactions(account_id, transaction_date DESC) WHERE category_id IS NULL;
CREATE INDEX idx_trans_repayment_filter ON bank_transactions(account_id, transaction_date DESC) WHERE debit_amount > 0;
CREATE INDEX idx_trans_anchor ON bank_transactions(account_id) WHERE is_anchor_point = TRUE;

-- =============================================================================
-- 7. BẢNG LỊCH SỬ ĐIỂM NEO SỐ DƯ (STATEMENT ANCHOR POINTS)
-- Theo dõi vết kiểm toán của các lần can thiệp mốc neo số dư 2 chiều (US-04.9)
-- =============================================================================
CREATE TABLE statement_anchor_points (
    anchor_id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES bank_accounts(account_id) ON DELETE CASCADE,
    transaction_id BIGINT NOT NULL REFERENCES bank_transactions(transaction_id) ON DELETE CASCADE,
    anchor_balance DECIMAL(18, 2) NOT NULL,                 -- Số dư mốc chuẩn do người dùng nhập
    previous_balance DECIMAL(18, 2) NOT NULL,               -- Số dư ghi nhận trước khi hiệu chỉnh
    propagation_direction VARCHAR(20) NOT NULL DEFAULT 'BIDIRECTIONAL', -- 'FORWARD', 'BACKWARD', 'BIDIRECTIONAL'
    records_updated_count INT DEFAULT 0,                    -- Số lượng giao dịch được tính toán cập nhật lại
    reason TEXT,                                            -- Lý do điều chỉnh
    set_by VARCHAR(100) NOT NULL DEFAULT 'USER',            -- Người thực hiện hiệu chỉnh
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anchor_account ON statement_anchor_points(account_id);
CREATE INDEX idx_anchor_trans ON statement_anchor_points(transaction_id);

-- =============================================================================
-- 8. BẢNG SỔ QUỸ TIỀN MẶT ĐỐI ỨNG (CASH LEDGER)
-- Theo dõi luồng tiền mặt rút từ TK MBBank của bà Nguyễn Thị Lan Anh về quỹ
-- =============================================================================
CREATE TABLE cash_ledger (
    cash_entry_id BIGSERIAL PRIMARY KEY,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
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
CREATE INDEX idx_cash_entity ON cash_ledger(entity_id);

-- =============================================================================
-- 9. BẢNG NHẬT KÝ KIỂM TOÁN HỆ THỐNG (AUDIT LOGS)
-- Ghi nhận toàn bộ thao tác upload, đối soát, áp dụng luật và sửa đổi thủ công
-- =============================================================================
CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    actor VARCHAR(100) NOT NULL,                            -- User hoặc Background Worker
    action VARCHAR(50) NOT NULL,                            -- 'UPLOAD_FILE', 'PARSE_COMPLETED', 'MANUAL_TAG', 'RECALCULATE_ANCHOR'...
    target_entity VARCHAR(50) NOT NULL,                     -- 'STATEMENT_FILE', 'TRANSACTION', 'RULE', 'LOAN', 'REPAYMENT_RECORD'
    target_id VARCHAR(50) NOT NULL,
    details JSONB,                                          -- Lưu chi tiết thay đổi (Before/After)
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_target ON audit_logs(target_entity, target_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================================================
-- 10. BẢNG QUẢN LÝ FILE SAO KÊ TÍN DỤNG GỐC (CREDIT STATEMENT FILES)
-- =============================================================================
CREATE TABLE credit_statement_files (
    file_id BIGSERIAL PRIMARY KEY,
    file_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    bank_id BIGINT REFERENCES banks(bank_id) ON DELETE SET NULL,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,                         -- CTG, MBB...
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
CREATE INDEX idx_credit_files_entity ON credit_statement_files(entity_id);
CREATE INDEX idx_credit_files_status ON credit_statement_files(processing_status);
CREATE INDEX idx_credit_files_reconcile ON credit_statement_files(reconciliation_status);
CREATE INDEX idx_credit_files_created ON credit_statement_files(created_at DESC);

-- =============================================================================
-- 11. BẢNG DANH MỤC HỢP ĐỒNG VAY & KHẾ ƯỚC (CREDIT FACILITIES / LOANS)
-- Quản trị danh mục nợ vay hiện hành, phân tách 3 cột dư nợ và tính lãi TT14
-- =============================================================================
CREATE TABLE credit_facilities (
    loan_id BIGSERIAL PRIMARY KEY,
    bank_id BIGINT REFERENCES banks(bank_id) ON DELETE SET NULL,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,                         -- CTG, MBB...
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
    monthly_interest_due_day INT CHECK (monthly_interest_due_day IS NULL OR (monthly_interest_due_day >= 1 AND monthly_interest_due_day <= 31)), -- Ngày trả lãi trong tháng (1-31, VietinBank mặc định ngày 5)
    calculated_interest_due DECIMAL(18, 2) NOT NULL DEFAULT 0.00, -- Số lãi cần trả tính theo TT 14/2017/TT-NHNN Actual/365

    -- Mốc Snapshot Sao kê Tín dụng & Phân tách 3 Cột Dư nợ Gốc (US-07.11 & Pre/Post Snapshot)
    snapshot_date DATE,                                     -- Thời điểm xuất file sao kê tín dụng gần nhất (As-of Date)
    snapshot_principal_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00, -- Dư nợ gốc tại thời điểm xuất file (không phải gốc ban đầu giải ngân)
    original_principal_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00, -- 1. Dư nợ gốc ban đầu (snapshot + lũy kế trả gốc trước/tại ngày xuất file)
    total_repaid_principal DECIMAL(18, 2) NOT NULL DEFAULT 0.00,     -- 2. Đã trả gốc toàn bộ vòng đời (lũy kế từ đối soát sao kê)
    repaid_before_snapshot DECIMAL(18, 2) NOT NULL DEFAULT 0.00,     -- Lũy kế trả gốc trước/tại ngày xuất file (hoàn nguyên vào gốc ban đầu)
    repaid_after_snapshot DECIMAL(18, 2) NOT NULL DEFAULT 0.00,      -- Lũy kế trả gốc sau ngày xuất file (giảm trừ dư nợ hiện tại)
    current_principal_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,  -- 3. Dư nợ gốc hiện tại (snapshot - lũy kế trả gốc sau ngày xuất file)
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
CREATE INDEX idx_credit_facilities_entity ON credit_facilities(entity_id);
CREATE INDEX idx_credit_facilities_institution_type ON credit_facilities(institution_type);
CREATE INDEX idx_credit_facilities_is_manual ON credit_facilities(is_manual);
CREATE INDEX idx_credit_facilities_maturity ON credit_facilities(maturity_date);
CREATE INDEX idx_credit_facilities_next_repayment ON credit_facilities(next_repayment_date);
CREATE INDEX idx_credit_facilities_status ON credit_facilities(status);

-- =============================================================================
-- 12. BẢNG CHI TIẾT KHOẢN VAY THEO FILE SAO KÊ (CREDIT STATEMENT ITEMS)
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
-- =============================================================================
-- 13. KHO HÓA ĐƠN ĐỘC LẬP CỦA DOANH NGHIỆP (INVOICES REPOSITORY)
-- CSDL tách biệt lưu trữ thông tin hóa đơn điện tử từ file XML và liên kết file PDF
-- =============================================================================
CREATE TABLE invoices (
    invoice_id BIGSERIAL PRIMARY KEY,
    invoice_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    entity_id BIGINT REFERENCES corporate_entities(entity_id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) NOT NULL,                    -- Số hóa đơn (<SHDon>)
    invoice_series VARCHAR(20) NOT NULL,                    -- Ký hiệu hóa đơn (<KHHDon>)
    invoice_template VARCHAR(20) DEFAULT '1',               -- Ký hiệu mẫu số (<KHMSHDon>: 1 = GTGT)
    invoice_date DATE NOT NULL,                             -- Ngày lập hóa đơn (<NLap>)
    tax_authority_code VARCHAR(100),                        -- Mã của Cơ quan Thuế (<MCCQT>)
    
    -- Thông tin Bên bán & Bên mua
    seller_tax_code VARCHAR(50) NOT NULL,                   -- MST bên bán
    seller_name VARCHAR(255) NOT NULL,                      -- Tên bên bán
    seller_address TEXT,                                    -- Địa chỉ bên bán
    buyer_tax_code VARCHAR(50) NOT NULL,                    -- MST bên mua
    buyer_name VARCHAR(255) NOT NULL,                       -- Tên bên mua
    buyer_address TEXT,                                     -- Địa chỉ bên mua
    
    -- Giá trị tài chính
    currency VARCHAR(10) NOT NULL DEFAULT 'VND',            -- Đơn vị tiền tệ (<DVTTe>)
    exchange_rate DECIMAL(18, 4) NOT NULL DEFAULT 1.0000,   -- Tỷ giá (<TGia>)
    subtotal_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,   -- Tổng tiền chưa thuế (<TgTCThue>)
    tax_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,        -- Tiền thuế GTGT (<TgTThue>)
    total_amount DECIMAL(18, 2) NOT NULL,                   -- Tổng tiền thanh toán bằng số (<TgTTTBSo>)
    
    -- Quản lý Phân bổ Nhận nợ Khoản vay
    allocated_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,  -- Tổng số tiền đã được nhận nợ cho các khoản vay
    remaining_amount DECIMAL(18, 2) NOT NULL,               -- Số tiền còn lại có thể nhận nợ (= total_amount - allocated_amount)
    locked_bank_code VARCHAR(20),                           -- Ngân hàng/TCTD duy nhất đang được bảo đảm bởi hóa đơn này
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',        -- 'AVAILABLE' (Chưa dùng), 'PARTIALLY_ALLOCATED' (1 phần), 'FULLY_ALLOCATED' (Hết)
    
    -- Lưu trữ tệp XML và PDF tương ứng
    xml_file_name VARCHAR(255),                             -- Tên file XML gốc
    xml_storage_path VARCHAR(500),                          -- Đường dẫn lưu file XML
    xml_file_sha256 CHAR(64),                               -- SHA-256 file XML
    xml_file_size BIGINT,                                   -- Dung lượng XML (bytes)
    pdf_file_name VARCHAR(255),                             -- Tên file PDF liên kết
    pdf_storage_path VARCHAR(500),                          -- Đường dẫn lưu file PDF
    pdf_file_sha256 CHAR(64),                               -- SHA-256 file PDF
    pdf_file_size BIGINT,                                   -- Dung lượng PDF (bytes)
    has_pdf BOOLEAN NOT NULL DEFAULT FALSE,                 -- Cờ xác định đã có file PDF liên kết
    
    raw_xml_data JSONB,                                     -- Toàn bộ chi tiết payload XML lưu trữ JSON
    note TEXT,                                              -- Ghi chú bổ sung
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_invoice_seller_series_number UNIQUE (seller_tax_code, invoice_series, invoice_number),
    CONSTRAINT chk_invoice_allocated_amount CHECK (allocated_amount >= 0 AND allocated_amount <= total_amount),
    CONSTRAINT chk_invoice_remaining_amount CHECK (remaining_amount >= 0 AND remaining_amount <= total_amount)
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_series ON invoices(invoice_series);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_seller ON invoices(seller_tax_code);
CREATE INDEX idx_invoices_buyer ON invoices(buyer_tax_code);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_locked_bank ON invoices(locked_bank_code);

-- =============================================================================
-- 13.1 BẢNG CHI TIẾT HÀNG HÓA HÓA ĐƠN (INVOICE ITEMS)
-- =============================================================================
CREATE TABLE invoice_items (
    item_id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    line_number INT NOT NULL,                               -- STT dòng hàng hóa (<STT>)
    item_name VARCHAR(500) NOT NULL,                        -- Tên hàng hóa, dịch vụ (<THHDVu>)
    unit VARCHAR(50),                                       -- Đơn vị tính (<DVTinh>)
    quantity DECIMAL(18, 4),                                -- Số lượng (<SLuong>)
    unit_price DECIMAL(18, 4),                              -- Đơn giá (<DGia>)
    subtotal DECIMAL(18, 2) NOT NULL,                       -- Thành tiền (<ThTien>)
    tax_rate VARCHAR(20),                                   -- Thuế suất GTGT (<TSuat>: 8%, 10%...)
    tax_amount DECIMAL(18, 2) DEFAULT 0.00,                 -- Tiền thuế GTGT dòng hàng
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- =============================================================================
-- 13.2 BẢNG PHÂN BỔ HÓA ĐƠN BẢO ĐẢM NHẬN NỢ KHOẢN VAY (LOAN INVOICE ALLOCATIONS)
-- Quản lý mối quan hệ N-N giữa Khoản vay và Hóa đơn, kiểm soát ràng buộc cùng một TCTD
-- =============================================================================
CREATE TABLE loan_invoice_allocations (
    allocation_id BIGSERIAL PRIMARY KEY,
    allocation_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    loan_id BIGINT NOT NULL REFERENCES credit_facilities(loan_id) ON DELETE CASCADE,
    invoice_id BIGINT NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
    bank_code VARCHAR(20) NOT NULL,                         -- Mã ngân hàng của khoản vay (ràng buộc cùng TCTD)
    contract_number VARCHAR(50) NOT NULL,                   -- Số khế ước nhận nợ / hợp đồng tín dụng
    allocated_amount DECIMAL(18, 2) NOT NULL,               -- Số tiền nhận nợ trên hóa đơn này
    allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,     -- Ngày phân bổ nhận nợ
    notes TEXT,                                             -- Ghi chú phân bổ
    is_manual BOOLEAN NOT NULL DEFAULT FALSE,               -- Cờ đánh dấu người dùng đã sửa/gán thủ công (ưu tiên bảo vệ khi cuốn chiếu)
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_loan_invoice_allocation UNIQUE (loan_id, invoice_id),
    CONSTRAINT chk_allocation_positive_amount CHECK (allocated_amount > 0)
);

CREATE INDEX idx_alloc_loan_id ON loan_invoice_allocations(loan_id);
CREATE INDEX idx_alloc_invoice_id ON loan_invoice_allocations(invoice_id);
CREATE INDEX idx_alloc_bank_code ON loan_invoice_allocations(bank_code);

-- =============================================================================
-- 13.3 BẢNG HỒ SƠ GIẢI NGÂN CÁC LOẠI TÀI LIỆU KHÁC (DISBURSEMENT DOCUMENTS)
-- Quản lý các chứng từ phi hóa đơn (Hợp đồng, Khế ước, Biên bản giao nhận, Đề nghị giải ngân, UNC...)
-- =============================================================================
CREATE TABLE disbursement_documents (
    document_id BIGSERIAL PRIMARY KEY,
    document_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    loan_id BIGINT NOT NULL REFERENCES credit_facilities(loan_id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES invoices(invoice_id) ON DELETE SET NULL, -- Liên kết tùy chọn sang kho hóa đơn
    file_name VARCHAR(255) NOT NULL,                        -- Tên file tài liệu gốc (.pdf, .xml, .jpg, .docx...)
    storage_path VARCHAR(500) NOT NULL,                     -- Đường dẫn Object Storage: disbursement_dossiers/{bank}/{contract}/{uuid}_{name}
    file_size_bytes BIGINT NOT NULL,                        -- Kích thước file (bytes)
    file_sha256 CHAR(64) NOT NULL,                          -- Mã băm SHA-256 toàn vẹn tài liệu
    mime_type VARCHAR(100) NOT NULL,                        -- MIME type tài liệu
    document_type VARCHAR(50) NOT NULL DEFAULT 'DISBURSEMENT_RECORD',
    -- 'CONTRACT', 'DISBURSEMENT_RECORD', 'DEBT_NOTE', 'INVOICE', 'COLLATERAL', 'APPROVAL', 'OTHER'
    description TEXT,                                       -- Mô tả hoặc ghi chú chứng từ
    
    -- Đặc tả Siêu dữ liệu Hóa đơn Điện tử (nếu có)
    invoice_number VARCHAR(50),                             -- Số hóa đơn điện tử (<SHDon>)
    invoice_series VARCHAR(20),                             -- Ký hiệu hóa đơn điện tử (<KHHDon>)
    invoice_issue_date DATE,                                -- Ngày lập hóa đơn (<NLap>)
    seller_tax_code VARCHAR(50),                            -- MST bên bán
    seller_name VARCHAR(255),                               -- Tên bên bán
    buyer_tax_code VARCHAR(50),                             -- MST bên mua
    buyer_name VARCHAR(255),                                -- Tên bên mua
    invoice_total_amount DECIMAL(18, 2),                    -- Tổng số tiền thanh toán (<TgTTTBSo>)
    xml_raw_data JSONB,                                     -- Toàn bộ chi tiết mặt hàng, thuế suất từ file XML
    verification_status VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
    -- 'UNVERIFIED' -> 'VERIFIED_MATCH' -> 'DEFICIENT_AMOUNT' -> 'INVALID_SCHEMA'
    
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disburse_docs_loan_id ON disbursement_documents(loan_id);
CREATE INDEX idx_disburse_docs_uuid ON disbursement_documents(document_uuid);
CREATE INDEX idx_disburse_docs_invoice ON disbursement_documents(invoice_number);
CREATE INDEX idx_disburse_docs_status ON disbursement_documents(verification_status);
CREATE INDEX idx_disburse_docs_invoice_fk ON disbursement_documents(invoice_id);

-- =============================================================================
-- 14. BẢNG NHẬT KÝ ĐỐI SOÁT & LỊCH SỬ TRẢ NỢ (LOAN REPAYMENT HISTORY)
-- Lưu vết chi tiết từng lần trả nợ gốc/lãi từ sao kê ngân hàng đối chiếu với khế ước
-- =============================================================================
CREATE TABLE loan_repayment_history (
    repayment_id BIGSERIAL PRIMARY KEY,
    loan_id BIGINT NOT NULL REFERENCES credit_facilities(loan_id) ON DELETE RESTRICT,
    transaction_id BIGINT NOT NULL UNIQUE REFERENCES bank_transactions(transaction_id) ON DELETE RESTRICT,
    contract_number VARCHAR(50) NOT NULL,
    bank_code VARCHAR(20) NOT NULL,
    repayment_date TIMESTAMP WITH TIME ZONE NOT NULL,       -- Thời điểm trả nợ ĐÚNG BẰNG transaction_date trên sao kê
    repayment_timing VARCHAR(20) NOT NULL DEFAULT 'POST_SNAPSHOT' CHECK (repayment_timing IN ('PRE_SNAPSHOT', 'POST_SNAPSHOT')), -- 'PRE_SNAPSHOT' (trước/tại ngày xuất file) | 'POST_SNAPSHOT' (sau ngày xuất file)
    snapshot_date DATE,                                     -- Mốc snapshot của khế ước tại thời điểm đối soát
    principal_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,  -- Số tiền trả nợ gốc
    interest_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,   -- Số tiền trả nợ lãi
    total_amount DECIMAL(18, 2) NOT NULL,                  -- Tổng số tiền (principal_amount + interest_amount == debit_amount)
    previous_principal_balance DECIMAL(18, 2) NOT NULL,     -- Dư nợ gốc trước khi giảm trừ
    remaining_principal_balance DECIMAL(18, 2) NOT NULL,    -- Dư nợ gốc sau khi giảm trừ
    notes TEXT,                                             -- Ghi chú đối soát
    reconciled_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_repayment_split CHECK (principal_amount + interest_amount = total_amount),
    CONSTRAINT chk_repayment_principal_non_negative CHECK (principal_amount >= 0)
);

CREATE INDEX idx_repay_hist_loan ON loan_repayment_history(loan_id);
CREATE INDEX idx_repay_hist_trans ON loan_repayment_history(transaction_id);
CREATE INDEX idx_repay_hist_contract ON loan_repayment_history(contract_number);
CREATE INDEX idx_repay_hist_date ON loan_repayment_history(repayment_date DESC);

-- =============================================================================
-- 15. VIEW BÁO CÁO CFO (TỔNG TỒN QUỸ HỢP NHẤT HÔM NAY - TRƯỚC 9H SÁNG)
-- Phân tách 2 Khối nguồn tiền độc lập (Khối 1: Cty + Khối 2: Ủy quyền CEO), loại bỏ tiền mặt
-- =============================================================================
CREATE OR REPLACE VIEW v_cfo_daily_liquidity AS
WITH account_summary AS (
    SELECT 
        ba.account_id,
        ba.entity_id,
        ba.bank_code,
        ba.bank_name,
        ba.account_number,
        ba.account_holder,
        ba.account_type,
        ba.current_balance
    FROM bank_accounts ba
    WHERE ba.is_active = TRUE
)
SELECT 
    COALESCE(SUM(CASE WHEN account_type = 'CORPORATE' THEN current_balance ELSE 0.00 END), 0.00) AS corporate_bank_balance,
    COALESCE(SUM(CASE WHEN account_type = 'SPECIAL_CASH' THEN current_balance ELSE 0.00 END), 0.00) AS special_cash_balance,
    0.00::DECIMAL(18, 2) AS total_cash_on_hand,             -- Đã loại bỏ quỹ tiền mặt theo chuẩn BRD 1.3.0
    COALESCE(SUM(current_balance), 0.00) AS total_consolidated_liquidity, -- Khối 1 + Khối 2
    CURRENT_DATE AS report_date
FROM account_summary;

-- =============================================================================
-- 16. VIEW BÁO CÁO NGHĨA VỤ NỢ TÍN DỤNG THEO NGÂN HÀNG
-- =============================================================================
CREATE OR REPLACE VIEW v_cfo_debt_obligations AS
SELECT 
    cf.entity_id,
    cf.bank_code,
    cf.bank_name,
    COUNT(cf.loan_id) AS total_active_loans,
    SUM(cf.original_principal_balance) AS total_original_principal,
    SUM(cf.total_repaid_principal) AS total_repaid_principal,
    SUM(cf.current_principal_balance) AS total_principal_balance,
    SUM(cf.accrued_interest) AS total_accrued_interest,
    SUM(cf.next_principal_amount) AS upcoming_principal_due,
    SUM(cf.next_interest_amount) AS upcoming_interest_due,
    SUM(cf.next_principal_amount + cf.next_interest_amount) AS total_upcoming_debt_obligation,
    ROUND(SUM(cf.current_principal_balance * cf.interest_rate) / NULLIF(SUM(cf.current_principal_balance), 0), 4) AS weighted_avg_interest_rate
FROM credit_facilities cf
WHERE cf.is_active = TRUE AND cf.status = 'ACTIVE'
GROUP BY cf.entity_id, cf.bank_code, cf.bank_name;

-- =============================================================================
-- 17. VIEW BÁO CÁO THANH KHOẢN RÒNG HỢP NHẤT (NET LIQUIDITY POSITION)
-- Thanh khoản Ròng = Tổng tồn quỹ hợp nhất (2 khối) - Nghĩa vụ nợ đến hạn kỳ tới
-- =============================================================================
CREATE OR REPLACE VIEW v_cfo_net_liquidity_position AS
WITH liquidity AS (
    SELECT total_consolidated_liquidity FROM v_cfo_daily_liquidity
),
debt AS (
    SELECT COALESCE(SUM(total_upcoming_debt_obligation), 0.00) AS total_upcoming_debt
    FROM v_cfo_debt_obligations
)
SELECT 
    l.total_consolidated_liquidity,
    d.total_upcoming_debt,
    (l.total_consolidated_liquidity - d.total_upcoming_debt) AS net_liquidity_position,
    CURRENT_DATE AS as_of_date
FROM liquidity l CROSS JOIN debt d;

-- =============================================================================
-- 18. BẢNG CẤU HÌNH KẾ HOẠCH TẤT TOÁN & ĐẢO NỢ HẰNG THÁNG (DEBT ROLLOVER PLAN CONFIGS)
-- Lưu trữ cấu hình hạn mức dòng tiền HĐKD (OCF), kỳ hạn ngân hàng, lệnh khóa & tất toán đứt
-- =============================================================================
CREATE TABLE debt_rollover_plan_configs (
    config_id BIGSERIAL PRIMARY KEY,
    borrower_name VARCHAR(255) NOT NULL DEFAULT 'DEFAULT',
    horizon_months INTEGER NOT NULL DEFAULT 12,
    default_monthly_ocf DECIMAL(18, 2) NOT NULL DEFAULT 10000000000.00,
    default_rollover_term_months INTEGER NOT NULL DEFAULT 6,
    monthly_ocf_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    bank_term_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    payoff_contract_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
    locked_rollover_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_bank_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_debt_rollover_borrower UNIQUE (borrower_name)
);

CREATE INDEX idx_debt_rollover_borrower ON debt_rollover_plan_configs(borrower_name);

-- =============================================================================
-- 19. PHÂN HỆ QUẢN LÝ HẠN MỨC (HỢP ĐỒNG TÍN DỤNG, HỒ SƠ HẠN MỨC, TSĐB, CAM KẾT SAU VAY)
-- =============================================================================

CREATE TABLE credit_agreements (
    agreement_id BIGSERIAL PRIMARY KEY,
    agreement_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    bank_id BIGINT REFERENCES banks(bank_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    agreement_number VARCHAR(100) NOT NULL,
    agreement_name VARCHAR(255) NOT NULL,
    borrower_name VARCHAR(150) NOT NULL,
    total_credit_limit DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    loan_sublimit DECIMAL(18, 2),
    guarantee_sublimit DECIMAL(18, 2),
    lc_sublimit DECIMAL(18, 2),
    currency VARCHAR(5) NOT NULL DEFAULT 'VND',
    signed_date DATE,
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    interest_rate_framework VARCHAR(255),
    collateral_summary TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    parent_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    renewed_to_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_credit_agreement_bank_number UNIQUE (bank_code, agreement_number)
);

ALTER TABLE credit_facilities ADD COLUMN IF NOT EXISTS agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL;

CREATE TABLE credit_limit_dossiers (
    dossier_id BIGSERIAL PRIMARY KEY,
    dossier_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    borrower_name VARCHAR(150) NOT NULL,
    dossier_code VARCHAR(80) NOT NULL UNIQUE,
    dossier_title VARCHAR(255) NOT NULL,
    dossier_type VARCHAR(40) NOT NULL DEFAULT 'RENEWAL',
    proposed_limit_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    approved_limit_amount DECIMAL(18, 2),
    submission_date DATE,
    approval_date DATE,
    expiry_review_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'PREPARING',
    checklist_json TEXT NOT NULL DEFAULT '[]',
    responsible_person VARCHAR(120),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE credit_limit_dossier_files (
    file_id BIGSERIAL PRIMARY KEY,
    file_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    dossier_id BIGINT NOT NULL REFERENCES credit_limit_dossiers(dossier_id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL DEFAULT 'LEGAL',
    file_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    description TEXT,
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collateral_assets (
    asset_id BIGSERIAL PRIMARY KEY,
    asset_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    asset_code VARCHAR(80) NOT NULL UNIQUE,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL DEFAULT 'REAL_ESTATE_LAND',
    owner_name VARCHAR(200) NOT NULL,
    owner_id_or_tax_code VARCHAR(50),
    ownership_relation VARCHAR(50) NOT NULL DEFAULT 'BORROWER_OWNED',
    borrower_name VARCHAR(150),
    bank_code VARCHAR(20),
    bank_name VARCHAR(100),
    agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    appraised_value DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    ltv_ratio DECIMAL(6, 2) NOT NULL DEFAULT 70.00,
    max_secured_loan_value DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(5) NOT NULL DEFAULT 'VND',
    collateral_status VARCHAR(30) NOT NULL DEFAULT 'MORTGAGED',
    latest_valuation_date DATE,
    certificate_number VARCHAR(100),
    certificate_issue_date DATE,
    certificate_issued_by VARCHAR(200),
    address TEXT,
    land_area_m2 DECIMAL(14, 2),
    google_maps_url TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collateral_valuations (
    valuation_id BIGSERIAL PRIMARY KEY,
    valuation_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
    valuation_org VARCHAR(255) NOT NULL,
    valuation_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    valuation_date DATE NOT NULL,
    valuer_name VARCHAR(150),
    report_number VARCHAR(100),
    report_file_name VARCHAR(255),
    report_storage_path VARCHAR(500),
    report_file_size BIGINT,
    report_mime_type VARCHAR(100),
    notes TEXT,
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collateral_documents (
    doc_id BIGSERIAL PRIMARY KEY,
    doc_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
    doc_category VARCHAR(50) NOT NULL DEFAULT 'RED_BOOK',
    file_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    description TEXT,
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collateral_agreement_history (
    history_id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES collateral_assets(asset_id) ON DELETE CASCADE,
    from_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    from_agreement_number VARCHAR(100),
    to_agreement_id BIGINT REFERENCES credit_agreements(agreement_id) ON DELETE SET NULL,
    to_agreement_number VARCHAR(100),
    bank_code VARCHAR(20),
    action_type VARCHAR(40) NOT NULL DEFAULT 'INITIAL_MORTGAGE',
    effective_date DATE NOT NULL,
    notes TEXT,
    performed_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_loan_covenants (
    covenant_id BIGSERIAL PRIMARY KEY,
    covenant_uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    agreement_id BIGINT NOT NULL REFERENCES credit_agreements(agreement_id) ON DELETE CASCADE,
    loan_id BIGINT REFERENCES credit_facilities(loan_id) ON DELETE SET NULL,
    bank_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    borrower_name VARCHAR(150) NOT NULL,
    covenant_title VARCHAR(255) NOT NULL,
    covenant_category VARCHAR(50) NOT NULL DEFAULT 'CASHFLOW_TURNOVER',
    frequency VARCHAR(30) NOT NULL DEFAULT 'QUARTERLY',
    linked_account_id BIGINT REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    linked_account_number VARCHAR(50),
    period_start DATE,
    due_date DATE NOT NULL,
    target_value DECIMAL(18, 2),
    actual_value DECIMAL(18, 2),
    unit VARCHAR(30) NOT NULL DEFAULT 'VND',
    compliance_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
    evidence_file_name VARCHAR(255),
    evidence_storage_path VARCHAR(500),
    responsible_person VARCHAR(120),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
