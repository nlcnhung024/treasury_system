import api from './api';

export interface MasterBank {
  bank_id?: number;
  bank_code: string;
  bank_name: string;
  short_name: string;
  branch_name?: string | null;
  tax_code?: string | null;
  is_active?: boolean;
  category?: 'SYSTEM_ACTIVE' | 'COMMERCIAL' | 'FOREIGN_JV' | 'FINANCE_LEASING' | 'CUSTOM';
}

// Danh mục toàn bộ các ngân hàng & tổ chức tín dụng tại Việt Nam (49+ tổ chức)
export const ALL_VIETNAM_BANKS: MasterBank[] = [
  // Hệ thống đang có số liệu thực tế (Khế ước vay hoặc Tài khoản thanh toán)
  { bank_code: 'CTG', bank_name: 'Ngân hàng TMCP Công Thương Việt Nam', short_name: 'VietinBank', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'MBB', bank_name: 'Ngân hàng TMCP Quân Đội', short_name: 'MBBank', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'VPB', bank_name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', short_name: 'VPBank', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'TPB', bank_name: 'Ngân hàng TMCP Tiên Phong', short_name: 'TPBank', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'MBV', bank_name: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại', short_name: 'MBV', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'SHB', bank_name: 'Ngân hàng TMCP Sài Gòn - Hà Nội', short_name: 'SHB', category: 'SYSTEM_ACTIVE' },
  { bank_code: 'EVF', bank_name: 'Công ty Tài chính Cổ phần Điện lực', short_name: 'EVNFinance', category: 'SYSTEM_ACTIVE' },

  // Ngân hàng Thương mại Nhà nước & Cổ phần hàng đầu
  { bank_code: 'VCB', bank_name: 'Ngân hàng TMCP Ngoại Thương Việt Nam', short_name: 'Vietcombank', category: 'COMMERCIAL' },
  { bank_code: 'BIDV', bank_name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', short_name: 'BIDV', category: 'COMMERCIAL' },
  { bank_code: 'TCB', bank_name: 'Ngân hàng TMCP Kỹ Thương Việt Nam', short_name: 'Techcombank', category: 'COMMERCIAL' },
  { bank_code: 'VBA', bank_name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam', short_name: 'Agribank', category: 'COMMERCIAL' },
  { bank_code: 'ACB', bank_name: 'Ngân hàng TMCP Á Châu', short_name: 'ACB', category: 'COMMERCIAL' },
  { bank_code: 'STB', bank_name: 'Ngân hàng TMCP Sài Gòn Thương Tín', short_name: 'Sacombank', category: 'COMMERCIAL' },
  { bank_code: 'HDB', bank_name: 'Ngân hàng TMCP Phát triển TP.HCM', short_name: 'HDBank', category: 'COMMERCIAL' },
  { bank_code: 'VIB', bank_name: 'Ngân hàng TMCP Quốc Tế Việt Nam', short_name: 'VIB', category: 'COMMERCIAL' },
  { bank_code: 'MSB', bank_name: 'Ngân hàng TMCP Hàng Hải Việt Nam', short_name: 'MSB', category: 'COMMERCIAL' },
  { bank_code: 'OCB', bank_name: 'Ngân hàng TMCP Phương Đông', short_name: 'OCB', category: 'COMMERCIAL' },
  { bank_code: 'LPB', bank_name: 'Ngân hàng TMCP Lộc Phát Việt Nam', short_name: 'LPBank', category: 'COMMERCIAL' },
  { bank_code: 'SSB', bank_name: 'Ngân hàng TMCP Đông Nam Á', short_name: 'SeABank', category: 'COMMERCIAL' },
  { bank_code: 'BAB', bank_name: 'Ngân hàng TMCP Bắc Á', short_name: 'BacABank', category: 'COMMERCIAL' },
  { bank_code: 'NAB', bank_name: 'Ngân hàng TMCP Nam Á', short_name: 'NamABank', category: 'COMMERCIAL' },
  { bank_code: 'VIETBANK', bank_name: 'Ngân hàng TMCP Việt Nam Thương Tín', short_name: 'VietBank', category: 'COMMERCIAL' },
  { bank_code: 'VAB', bank_name: 'Ngân hàng TMCP Việt Á', short_name: 'VietABank', category: 'COMMERCIAL' },
  { bank_code: 'BVB', bank_name: 'Ngân hàng TMCP Bản Việt', short_name: 'BVBank', category: 'COMMERCIAL' },
  { bank_code: 'ABB', bank_name: 'Ngân hàng TMCP An Bình', short_name: 'ABBank', category: 'COMMERCIAL' },
  { bank_code: 'PGB', bank_name: 'Ngân hàng TMCP Thịnh vượng và Phát triển', short_name: 'PGBank', category: 'COMMERCIAL' },
  { bank_code: 'KLB', bank_name: 'Ngân hàng TMCP Kiên Long', short_name: 'KienlongBank', category: 'COMMERCIAL' },
  { bank_code: 'SGB', bank_name: 'Ngân hàng TMCP Sài Gòn Công Thương', short_name: 'Saigonbank', category: 'COMMERCIAL' },
  { bank_code: 'BAOVIETBANK', bank_name: 'Ngân hàng TMCP Bảo Việt', short_name: 'BaoViet Bank', category: 'COMMERCIAL' },

  // Ngân hàng Nước ngoài & Liên doanh
  { bank_code: 'SHINHAN', bank_name: 'Ngân hàng TNHH MTV Shinhan Việt Nam', short_name: 'Shinhan Bank', category: 'FOREIGN_JV' },
  { bank_code: 'HSBC', bank_name: 'Ngân hàng TNHH MTV HSBC Việt Nam', short_name: 'HSBC', category: 'FOREIGN_JV' },
  { bank_code: 'SCB_VN', bank_name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam', short_name: 'Standard Chartered', category: 'FOREIGN_JV' },
  { bank_code: 'WOORI', bank_name: 'Ngân hàng TNHH MTV Woori Việt Nam', short_name: 'Woori Bank', category: 'FOREIGN_JV' },
  { bank_code: 'PBVN', bank_name: 'Ngân hàng TNHH MTV Public Việt Nam', short_name: 'Public Bank', category: 'FOREIGN_JV' },
  { bank_code: 'UOB', bank_name: 'Ngân hàng United Overseas Bank Việt Nam', short_name: 'UOB', category: 'FOREIGN_JV' },
  { bank_code: 'IVB', bank_name: 'Ngân hàng TNHH Indovina', short_name: 'IVB', category: 'FOREIGN_JV' },
  { bank_code: 'VRB', bank_name: 'Ngân hàng Liên doanh Việt - Nga', short_name: 'VRB', category: 'FOREIGN_JV' },

  // Công ty Tài chính & Cho thuê Tài chính
  { bank_code: 'FE_CREDIT', bank_name: 'Công ty Tài chính TNHH MTV Ngân hàng VN Thịnh Vượng', short_name: 'FE Credit', category: 'FINANCE_LEASING' },
  { bank_code: 'HOME_CREDIT', bank_name: 'Công ty Tài chính TNHH MTV Home Credit Việt Nam', short_name: 'Home Credit', category: 'FINANCE_LEASING' },
  { bank_code: 'HD_SAISON', bank_name: 'Công ty Tài chính TNHH HD SAISON', short_name: 'HD SAISON', category: 'FINANCE_LEASING' },
  { bank_code: 'SHINHAN_FIN', bank_name: 'Công ty Tài chính TNHH MTV Shinhan Việt Nam', short_name: 'Shinhan Finance', category: 'FINANCE_LEASING' },
  { bank_code: 'MCREDIT', bank_name: 'Công ty Tài chính TNHH MB SHINSEI', short_name: 'Mcredit', category: 'FINANCE_LEASING' },
  { bank_code: 'MIRAE_ASSET', bank_name: 'Công ty Tài chính TNHH MTV Mirae Asset', short_name: 'Mirae Asset', category: 'FINANCE_LEASING' },
  { bank_code: 'LOTTE_FIN', bank_name: 'Công ty Tài chính TNHH MTV Lotte Việt Nam', short_name: 'Lotte Finance', category: 'FINANCE_LEASING' },
  { bank_code: 'CTG_LEASING', bank_name: 'Công ty Cho thuê Tài chính VietinBank', short_name: 'VietinBank Leasing', category: 'FINANCE_LEASING' },
  { bank_code: 'BSL', bank_name: 'Công ty Cho thuê Tài chính TNHH BIDV-SuMi TRUST', short_name: 'BSL', category: 'FINANCE_LEASING' },
  { bank_code: 'CHAILEASE', bank_name: 'Công ty Cho thuê Tài chính TNHH Chailease Việt Nam', short_name: 'Chailease', category: 'FINANCE_LEASING' },
  { bank_code: 'ACB_LEASING', bank_name: 'Công ty Cho thuê Tài chính Ngân hàng Á Châu', short_name: 'ACB Leasing', category: 'FINANCE_LEASING' },
  { bank_code: 'VCB_LEASING', bank_name: 'Công ty Cho thuê Tài chính Vietcombank', short_name: 'VCBL', category: 'FINANCE_LEASING' },
];

let cachedBanks: MasterBank[] | null = null;

export const fetchMasterBanks = async (): Promise<MasterBank[]> => {
  if (cachedBanks && cachedBanks.length > 0) return cachedBanks;
  try {
    const res = await api.get('/banks?active_only=true');
    if (Array.isArray(res.data) && res.data.length > 0) {
      const dbMap = new Map<string, MasterBank>();
      // Nạp từ database trước
      res.data.forEach((b: any) => {
        const code = (b.bank_code || '').trim().toUpperCase();
        if (code) {
          dbMap.set(code, {
            bank_id: b.bank_id,
            bank_code: code,
            bank_name: b.bank_name,
            short_name: b.short_name || code,
            branch_name: b.branch_name,
            tax_code: b.tax_code,
            is_active: b.is_active,
          });
        }
      });

      // Kết hợp với danh mục đầy đủ nếu còn thiếu
      ALL_VIETNAM_BANKS.forEach((b) => {
        if (!dbMap.has(b.bank_code)) {
          dbMap.set(b.bank_code, b);
        } else {
          // Gán category nếu chưa có
          const item = dbMap.get(b.bank_code)!;
          item.category = b.category;
          if (!item.short_name) item.short_name = b.short_name;
        }
      });

      cachedBanks = Array.from(dbMap.values());
      return cachedBanks;
    }
  } catch (err) {
    console.warn('Không thể tải /banks từ server, sử dụng danh mục dự phòng toàn diện', err);
  }
  cachedBanks = ALL_VIETNAM_BANKS;
  return cachedBanks;
};

export const getBankDisplayName = (bankCode: string, banks: MasterBank[] = ALL_VIETNAM_BANKS): string => {
  const norm = (bankCode || '').trim().toUpperCase();
  if (norm === 'BID') return 'BIDV';
  const found = banks.find((b) => b.bank_code.toUpperCase() === norm);
  return found ? `${found.short_name} (${found.bank_code})` : bankCode;
};

export const getBankShortName = (bankCode: string, banks: MasterBank[] = ALL_VIETNAM_BANKS): string => {
  const norm = (bankCode || '').trim().toUpperCase();
  if (norm === 'BID') return 'BIDV';
  const found = banks.find((b) => b.bank_code.toUpperCase() === norm);
  return found?.short_name || bankCode;
};

