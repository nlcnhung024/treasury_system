import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
  Search,
  DollarSign,
  Calendar,
  Percent,
  Layers,
  Building,
  RefreshCw,
  Clock,
  Plus,
  Edit2,
  X,
  CreditCard,
  Briefcase,
  FileText,
  Building2,
  Wallet,
  Download,
  FolderArchive,
  Shield,
  Receipt,
  Tag,
  File,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Table,
  Sparkles,
  Info,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
} from 'lucide-react';
import api from '../services/api';
import {
  CreditFacility,
  CreditStatementFile,
  CreditFacilitySummary,
  InstitutionType,
  InterestPaymentMethod,
  DisbursementDocument,
  CreditFacilityCreatePayload,
  CreditFacilityUpdatePayload,
} from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { SortDirection, sortList } from '../utils/sort';

interface PresetOrg {
  code: string;
  name: string;
  type: InstitutionType;
}

export const parseXmlInvoiceBrowser = async (
  file: File
): Promise<{ invoiceNumber: string | null; totalAmount: number | null }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return resolve({ invoiceNumber: null, totalAmount: null });
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');

        const getTagValue = (tagNames: string[]): string | null => {
          const upperTags = tagNames.map((t) => t.toUpperCase());
          const all = doc.getElementsByTagName('*');
          for (let i = 0; i < all.length; i++) {
            const local = (all[i].localName || all[i].nodeName).toUpperCase();
            if (upperTags.includes(local)) {
              const content = all[i].textContent?.trim();
              if (content) return content;
            }
          }
          return null;
        };

        const invoiceNumber = getTagValue(['SHDon', 'InvoiceNumber', 'SoHoaDon', 'InvNum', 'SHD', 'InvoiceNo']);
        let totalStr = getTagValue([
          'TgTTTBSo',
          'TotalPayment',
          'TgTToan',
          'TongTienThanhToan',
          'TotalAmount',
          'Amount',
          'SumAmount',
        ]);

        let totalAmount: number | null = null;
        if (totalStr) {
          let cleanStr = totalStr.replace(/\s+/g, '');
          if (cleanStr.includes(',') && cleanStr.includes('.')) {
            if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
              cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
            } else {
              cleanStr = cleanStr.replace(/,/g, '');
            }
          } else if (cleanStr.includes(',') && !cleanStr.includes('.')) {
            const parts = cleanStr.split(',');
            if (parts.length === 2 && (parts[1].length === 1 || parts[1].length === 2)) {
              cleanStr = cleanStr.replace(',', '.');
            } else {
              cleanStr = cleanStr.replace(/,/g, '');
            }
          }
          cleanStr = cleanStr.replace(/[^\d.-]/g, '');
          const parsed = parseFloat(cleanStr);
          if (!isNaN(parsed) && parsed > 0) {
            totalAmount = parsed;
          }
        }

        if (totalAmount === null) {
          const preTaxStr = getTagValue(['TgTCThue', 'TotalTaxableAmount', 'SubTotal']);
          const taxStr = getTagValue(['TgTThue', 'TotalVATAmount', 'TaxAmount']);
          if (preTaxStr) {
            const preTax = parseFloat(preTaxStr.replace(/[^\d.-]/g, '')) || 0;
            const tax = taxStr ? parseFloat(taxStr.replace(/[^\d.-]/g, '')) || 0 : 0;
            if (preTax > 0) totalAmount = preTax + tax;
          }
        }

        resolve({ invoiceNumber, totalAmount });
      } catch (err) {
        console.warn('Error parsing XML in browser:', err);
        resolve({ invoiceNumber: null, totalAmount: null });
      }
    };
    reader.onerror = () => resolve({ invoiceNumber: null, totalAmount: null });
    reader.readAsText(file, 'utf-8');
  });
};

interface StagedDossierFile {
  id: string;
  file: File;
  document_type: string;
  description: string;
  invoice_number?: string | null;
  invoice_total_amount?: number | null;
}

const PRESET_ORGANIZATIONS: PresetOrg[] = [
  // Ngân hàng thương mại
  { code: 'CTG', name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)', type: 'BANK' },
  { code: 'MBB', name: 'Ngân hàng TMCP Quân Đội (MBBank)', type: 'BANK' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)', type: 'BANK' },
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)', type: 'BANK' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)', type: 'BANK' },
  { code: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', type: 'BANK' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)', type: 'BANK' },
  { code: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', type: 'BANK' },
  { code: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', type: 'BANK' },

  // Công ty tài chính
  { code: 'FE_CREDIT', name: 'Công ty Tài chính TNHH MTV Ngân hàng Việt Nam Thịnh Vượng (FE Credit)', type: 'FINANCE_COMPANY' },
  { code: 'HOME_CREDIT', name: 'Công ty Tài chính TNHH MTV Home Credit Việt Nam', type: 'FINANCE_COMPANY' },
  { code: 'HD_SAISON', name: 'Công ty Tài chính TNHH HD SAISON', type: 'FINANCE_COMPANY' },
  { code: 'SHINHAN_FIN', name: 'Công ty Tài chính TNHH Một thành viên Shinhan Việt Nam', type: 'FINANCE_COMPANY' },
  { code: 'MCREDIT', name: 'Công ty Tài chính TNHH MB SHINSEI (Mcredit)', type: 'FINANCE_COMPANY' },
  { code: 'MIRAE_ASSET', name: 'Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)', type: 'FINANCE_COMPANY' },
  { code: 'LOTTE_FIN', name: 'Công ty Tài chính TNHH MTV Lotte Việt Nam', type: 'FINANCE_COMPANY' },

  // Cho thuê tài chính
  { code: 'CTG_LEASING', name: 'Công ty Cho thuê Tài chính VietinBank (VietinBank Leasing)', type: 'LEASING_COMPANY' },
  { code: 'BSL', name: 'Công ty Cho thuê Tài chính TNHH BIDV-SuMi TRUST (BSL)', type: 'LEASING_COMPANY' },
  { code: 'CHAILEASE', name: 'Công ty Cho thuê Tài chính TNHH Chailease Việt Nam', type: 'LEASING_COMPANY' },
  { code: 'ACB_LEASING', name: 'Công ty Cho thuê Tài chính Ngân hàng Á Châu (ACB Leasing)', type: 'LEASING_COMPANY' },
  { code: 'VCB_LEASING', name: 'Công ty Cho thuê Tài chính Vietcombank (VCBL)', type: 'LEASING_COMPANY' },
];

const CUSTOM_ORGS_STORAGE_KEY = 'custom_credit_organizations';

const loadSavedCustomOrgs = (): PresetOrg[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_ORGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load custom orgs from localStorage', e);
  }
  return [];
};

export interface DossierCategoryConfig {
  key: string;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  description: string;
  examples: string;
  colorName: 'indigo' | 'amber' | 'emerald' | 'cyan' | 'purple' | 'rose' | 'teal' | 'orange' | 'blue';
  isCustom?: boolean;
}

export const CUSTOM_DOSSIER_CATEGORIES_STORAGE_KEY = 'custom_dossier_categories';

export const loadSavedCustomCategories = (): DossierCategoryConfig[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_DOSSIER_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load custom dossier categories from localStorage', e);
  }
  return [];
};

export const DOSSIER_CATEGORIES: DossierCategoryConfig[] = [
  {
    key: 'CONTRACT',
    label: 'Hợp Đồng Tín Dụng & Thỏa Thuận Vay',
    shortLabel: 'Hợp đồng tín dụng',
    badgeLabel: 'HĐ Tín Dụng',
    description: 'Hợp đồng hạn mức tín dụng, thỏa thuận cho vay từng lần, phụ lục hợp đồng sửa đổi bổ sung',
    examples: 'HDTD_MBB_2026.pdf, Hop_dong_tin_dung_CTG.pdf',
    colorName: 'indigo',
  },
  {
    key: 'DEBT_NOTE',
    label: 'Khế Ước Nhận Nợ & Giấy Nhận Nợ (LD)',
    shortLabel: 'Khế ước nhận nợ',
    badgeLabel: 'Khế ước LD',
    description: 'Giấy đề nghị giải ngân kiêm khế ước nhận nợ (LD), thông báo giải ngân của ngân hàng',
    examples: 'Kheuoc_nhanno_LD01.pdf, Giay_nhan_no_CTG.pdf',
    colorName: 'amber',
  },
  {
    key: 'INVOICE',
    label: 'Chứng Từ Sử Dụng Vốn (Hóa Đơn & UNC)',
    shortLabel: 'Hóa đơn & UNC',
    badgeLabel: 'Hóa đơn / UNC',
    description: 'Hóa đơn GTGT, Hợp đồng kinh tế đầu vào, Biên bản giao nhận, UNC thanh toán cho bên thụ hưởng',
    examples: 'Hoa_don_GTGT_001.pdf, UNC_VietinBank_2ty.pdf, BB_Nghiem_thu.pdf',
    colorName: 'emerald',
  },
  {
    key: 'COLLATERAL',
    label: 'Tài Sản Bảo Đảm & Thế Chấp',
    shortLabel: 'Tài sản bảo đảm',
    badgeLabel: 'Tài sản BĐ',
    description: 'Hợp đồng thế chấp tài sản, biên bản định giá tài sản bảo đảm, đăng ký giao dịch bảo đảm',
    examples: 'Hop_dong_the_chap_QSDDat.pdf, BB_Dinh_gia_xe_bon.pdf',
    colorName: 'cyan',
  },
  {
    key: 'OTHER',
    label: 'Phê Duyệt Tín Dụng & Chứng Từ Khác',
    shortLabel: 'Phê duyệt & Khác',
    badgeLabel: 'Khác / Phê duyệt',
    description: 'Thông báo phê duyệt hạn mức, báo cáo kiểm tra định kỳ sau giải ngân, giấy tờ bổ sung',
    examples: 'Thong_bao_phe_duyet.pdf, Bien_ban_kiem_tra_sau_cho_vay.pdf',
    colorName: 'purple',
  },
];

export const mapDocTypeToCategoryKey = (docType: string): string => {
  if (!docType) return 'OTHER';
  if (docType === 'CONTRACT') return 'CONTRACT';
  if (docType === 'DEBT_NOTE' || docType === 'DISBURSEMENT_RECORD') return 'DEBT_NOTE';
  if (docType === 'INVOICE' || docType === 'INVOICE_PAYMENT') return 'INVOICE';
  if (docType === 'COLLATERAL') return 'COLLATERAL';
  if (docType === 'OTHER') return 'OTHER';
  return docType;
};

export const renderDossierBadge = (docType: string, allCategories?: DossierCategoryConfig[]) => {
  const catKey = mapDocTypeToCategoryKey(docType);
  switch (catKey) {
    case 'CONTRACT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <FileText className="w-3 h-3" /> HĐ Tín Dụng
        </span>
      );
    case 'DEBT_NOTE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Briefcase className="w-3 h-3" /> Khế ước LD
        </span>
      );
    case 'INVOICE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Receipt className="w-3 h-3" /> Hóa đơn / UNC
        </span>
      );
    case 'COLLATERAL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Shield className="w-3 h-3" /> Tài sản BĐ
        </span>
      );
    case 'OTHER':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <FolderArchive className="w-3 h-3" /> Chứng từ khác
        </span>
      );
    default: {
      const match = allCategories?.find((c) => c.key === catKey || c.key === docType);
      const label = match ? match.badgeLabel : docType;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Tag className="w-3 h-3" /> {label}
        </span>
      );
    }
  }
};


// ---------------------------------------------------------------------------
// PIVOT TABLE DEFINITIONS & HELPERS
// ---------------------------------------------------------------------------
export interface PivotDimDef {
  id: string;
  label: string;
  getValue: (loan: CreditFacility) => string;
}

export interface PivotMetricDef {
  id: string;
  label: string;
  shortLabel: string;
  format: (val: number) => string;
  unit: string;
  compute: (loans: CreditFacility[]) => number;
}

export const PIVOT_ROW_DIMENSIONS: PivotDimDef[] = [
  {
    id: 'bank_name',
    label: 'Ngân hàng / TCTD',
    getValue: (l) => l.bank_name || l.bank_code || 'Chưa xác định',
  },
  {
    id: 'institution_type',
    label: 'Loại tổ chức tín dụng',
    getValue: (l) => {
      if (l.institution_type === 'BANK') return 'Ngân hàng thương mại';
      if (l.institution_type === 'FINANCE_COMPANY') return 'Công ty tài chính';
      if (l.institution_type === 'LEASING_COMPANY') return 'Cho thuê tài chính';
      return 'Tổ chức khác';
    },
  },
  {
    id: 'debt_group',
    label: 'Phân loại nhóm nợ',
    getValue: (l) => `Nhóm ${l.debt_group || '1'}`,
  },
  {
    id: 'interest_payment_method',
    label: 'Hình thức trả lãi',
    getValue: (l) => {
      if (l.interest_payment_method === 'MONTHLY') return 'Hàng tháng';
      if (l.interest_payment_method === 'END_OF_TERM') return 'Cuối kỳ / Đáo hạn';
      return 'Định kỳ khác';
    },
  },
  {
    id: 'term',
    label: 'Thời hạn / Kỳ hạn',
    getValue: (l) => l.term || 'Không ghi kỳ hạn',
  },
  {
    id: 'disbursement_month',
    label: 'Tháng giải ngân',
    getValue: (l) => (l.disbursement_date ? l.disbursement_date.substring(0, 7) : 'Chưa có ngày'),
  },
  {
    id: 'maturity_month',
    label: 'Tháng đáo hạn',
    getValue: (l) => (l.maturity_date ? l.maturity_date.substring(0, 7) : 'Chưa có ngày'),
  },
  {
    id: 'is_manual',
    label: 'Nguồn dữ liệu',
    getValue: (l) => (l.is_manual ? 'Nhập nợ lẻ thủ công' : 'Bóc tách từ file sao kê'),
  },
  {
    id: 'has_dossier',
    label: 'Hồ sơ giải ngân',
    getValue: (l) => ((l.dossier_files_count || 0) > 0 ? 'Đã có hồ sơ' : 'Chưa có hồ sơ'),
  },
];

export const PIVOT_COL_DIMENSIONS: PivotDimDef[] = [
  {
    id: 'NONE',
    label: '(Không phân chia cột - Bảng 1 Chiều)',
    getValue: () => '__SINGLE__',
  },
  ...PIVOT_ROW_DIMENSIONS,
];

export const PIVOT_METRIC_DEFS: PivotMetricDef[] = [
  {
    id: 'current_principal_balance',
    label: 'Tổng Dư Nợ Gốc (VNĐ)',
    shortLabel: 'Dư Nợ Gốc',
    unit: 'VNĐ',
    format: (v) => `${Number(v).toLocaleString('vi-VN')} ₫`,
    compute: (list) => list.reduce((sum, l) => sum + Number(l.current_principal_balance || 0), 0),
  },
  {
    id: 'calculated_interest_due',
    label: 'Tổng Tiền Lãi Dự Trả TT14 (VNĐ)',
    shortLabel: 'Lãi Dự Trả',
    unit: 'VNĐ',
    format: (v) => `${Number(v).toLocaleString('vi-VN')} ₫`,
    compute: (list) =>
      list.reduce((sum, l) => sum + Number(l.calculated_interest_due ?? l.accrued_interest ?? 0), 0),
  },
  {
    id: 'next_principal_amount',
    label: 'Gốc Đến Hạn Kỳ Tới (VNĐ)',
    shortLabel: 'Gốc Đến Hạn',
    unit: 'VNĐ',
    format: (v) => `${Number(v).toLocaleString('vi-VN')} ₫`,
    compute: (list) => list.reduce((sum, l) => sum + Number(l.next_principal_amount || 0), 0),
  },
  {
    id: 'wair',
    label: 'Lãi Suất BQ Gia Quyền (WAIR %)',
    shortLabel: 'Lãi Suất WAIR',
    unit: '%/năm',
    format: (v) => `${Number(v).toFixed(2)} %`,
    compute: (list) => {
      const totalP = list.reduce((sum, l) => sum + Number(l.current_principal_balance || 0), 0);
      if (totalP <= 0) {
        if (list.length === 0) return 0;
        return list.reduce((sum, l) => sum + Number(l.interest_rate || 0), 0) / list.length;
      }
      const weightedSum = list.reduce(
        (sum, l) => sum + Number(l.current_principal_balance || 0) * Number(l.interest_rate || 0),
        0
      );
      return weightedSum / totalP;
    },
  },
  {
    id: 'count',
    label: 'Số Lượng Hợp Đồng / Khế Ước',
    shortLabel: 'Số Lượng HĐ',
    unit: 'HĐ',
    format: (v) => `${Number(v).toLocaleString('vi-VN')} HĐ`,
    compute: (list) => list.length,
  },
];

export const PIVOT_PRESETS = [
  {
    name: 'Ngân hàng × Nhóm nợ',
    row: 'bank_name',
    col: 'debt_group',
    metric: 'current_principal_balance',
  },
  {
    name: 'Ngân hàng × Hình thức trả lãi',
    row: 'bank_name',
    col: 'interest_payment_method',
    metric: 'calculated_interest_due',
  },
  {
    name: 'Loại TCTD × Kỳ hạn',
    row: 'institution_type',
    col: 'term',
    metric: 'current_principal_balance',
  },
  {
    name: 'Tháng đáo hạn × Ngân hàng',
    row: 'maturity_month',
    col: 'bank_name',
    metric: 'next_principal_amount',
  },
  {
    name: 'Ngân hàng × Hồ sơ giải ngân',
    row: 'bank_name',
    col: 'has_dossier',
    metric: 'count',
  },
  {
    name: 'Tổng hợp theo Ngân hàng (1D)',
    row: 'bank_name',
    col: 'NONE',
    metric: 'current_principal_balance',
  },
];

export const CreditStatementsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'loans' | 'files' | 'banks' | 'pivot'>('loans');
  const [copiedContract, setCopiedContract] = useState<string | null>(null);

  const handleCopyContract = (e: React.MouseEvent, contractNumber: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractNumber);
    setCopiedContract(contractNumber);
    setTimeout(() => {
      setCopiedContract((prev) => (prev === contractNumber ? null : prev));
    }, 2000);
  };

  // Sorting State
  const [sortField, setSortField] = useState<string>('contract_number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Pivot Table State
  const [pivotRowDim, setPivotRowDim] = useState<string>('bank_name');
  const [pivotColDim, setPivotColDim] = useState<string>('debt_group');
  const [pivotMetric, setPivotMetric] = useState<string>('current_principal_balance');
  const [pivotSearch, setPivotSearch] = useState<string>('');
  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [files, setFiles] = useState<CreditStatementFile[]>([]);
  const [summary, setSummary] = useState<CreditFacilitySummary | null>(null);

  // Sorting State for Files Table (Tab 3)
  const [fileSortField, setFileSortField] = useState<string>('file_id');
  const [fileSortDirection, setFileSortDirection] = useState<SortDirection>('desc');
  const handleFileSort = (field: string) => {
    if (fileSortField === field) {
      setFileSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setFileSortField(field);
      setFileSortDirection('asc');
    }
  };
  const sortedFiles = useMemo(() => {
    return sortList(files, fileSortField, fileSortDirection);
  }, [files, fileSortField, fileSortDirection]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessages, setUploadMessages] = useState<
    Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }>
  >([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [institutionFilter, setInstitutionFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [dueFilter, setDueFilter] = useState<string>('ALL');

  // Danh sách tổ chức tín dụng (kết hợp preset và các tổ chức tự nhập đã lưu vào localStorage / DB)
  const [organizations, setOrganizations] = useState<PresetOrg[]>(() => {
    const saved = loadSavedCustomOrgs();
    const map = new Map<string, PresetOrg>();
    PRESET_ORGANIZATIONS.forEach((o) => map.set(o.code, o));
    saved.forEach((o) => {
      if (o.code && !map.has(o.code)) {
        map.set(o.code, o);
      }
    });
    return Array.from(map.values());
  });

  // Đăng ký và ghi nhớ tổ chức mới vào bộ nhớ client & localStorage
  const registerCustomOrg = (org: PresetOrg) => {
    if (!org.code || !org.name) return;
    const cleanCode = org.code.trim().toUpperCase();
    const cleanName = org.name.trim();
    setOrganizations((prev) => {
      const map = new Map<string, PresetOrg>();
      prev.forEach((o) => map.set(o.code, o));
      map.set(cleanCode, {
        code: cleanCode,
        name: cleanName,
        type: org.type,
      });
      const merged = Array.from(map.values());
      const customOnly = merged.filter(
        (m) => !PRESET_ORGANIZATIONS.some((p) => p.code === m.code && p.name === m.name)
      );
      try {
        localStorage.setItem(CUSTOM_ORGS_STORAGE_KEY, JSON.stringify(customOnly));
      } catch (e) {
        console.warn('Lỗi khi lưu tổ chức tùy chỉnh vào localStorage', e);
      }
      return merged;
    });
  };

  // Danh sách tổ chức cho bộ lọc danh sách khoản vay
  const filterBankOptions = useMemo(() => {
    const map = new Map<string, string>();
    loans.forEach((l) => {
      const code = (l.bank_code || '').trim().toUpperCase();
      if (code && !map.has(code)) {
        map.set(code, l.bank_name || code);
      }
    });
    organizations.forEach((o) => {
      if (!map.has(o.code)) {
        map.set(o.code, o.name);
      }
    });
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [loans, organizations]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingLoan, setEditingLoan] = useState<CreditFacility | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State
  const [formOrgPreset, setFormOrgPreset] = useState<string>('CTG');
  const [formData, setFormData] = useState({
    bank_code: 'CTG',
    bank_name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
    institution_type: 'BANK' as InstitutionType,
    contract_number: '',
    borrower_name: 'CONG TY CO PHAN XI MANG SUNRISE',
    cif_number: '',
    loan_purpose: '',
    currency: 'VND',
    disbursement_date: '',
    maturity_date: '',
    term: '',
    interest_rate: 8.5,
    debt_group: '1',
    loan_type: 'SHORT_TERM',
    interest_payment_method: 'MONTHLY' as InterestPaymentMethod,
    monthly_interest_due_day: 5 as number | null,
    original_principal_balance: 0,
    current_principal_balance: 0,
    accrued_interest: 0,
    next_repayment_date: '',
    next_principal_amount: 0,
    next_interest_amount: 0,
    total_repayment_amount: 0,
    status: 'ACTIVE',
    note: '',
  });

  // Staged dossier files inside the Create/Edit Loan form modal
  const [stagedFiles, setStagedFiles] = useState<StagedDossierFile[]>([]);
  const [stagedDocCategory, setStagedDocCategory] = useState<string>('CONTRACT');
  const [editModalDocs, setEditModalDocs] = useState<DisbursementDocument[]>([]);
  const [isEditModalDocsLoading, setIsEditModalDocsLoading] = useState<boolean>(false);

  // Dedicated Modal "Nhập Bộ Hồ Sơ Cho Các Khoản Vay Đã Nhập"
  const [isDossierEntryModalOpen, setIsDossierEntryModalOpen] = useState<boolean>(false);
  const [entrySelectedLoanId, setEntrySelectedLoanId] = useState<number | null>(null);
  const [entryDossierDocs, setEntryDossierDocs] = useState<DisbursementDocument[]>([]);
  const [isEntryDocsLoading, setIsEntryDocsLoading] = useState<boolean>(false);
  const [entryStagedFiles, setEntryStagedFiles] = useState<StagedDossierFile[]>([]);
  const [entryCategoryTab, setEntryCategoryTab] = useState<string>('CONTRACT');
  const [entryBatchNote, setEntryBatchNote] = useState<string>('');
  const [isEntrySubmitting, setIsEntrySubmitting] = useState<boolean>(false);
  const [entryModalMsg, setEntryModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Danh mục loại hồ sơ giải ngân (kết hợp mặc định + các loại người dùng tự bổ sung qua localStorage)
  const [dossierCategories, setDossierCategories] = useState<DossierCategoryConfig[]>(() => {
    const saved = loadSavedCustomCategories();
    const map = new Map<string, DossierCategoryConfig>();
    DOSSIER_CATEGORIES.forEach((c) => map.set(c.key, c));
    saved.forEach((c) => {
      if (c.key && !map.has(c.key)) {
        map.set(c.key, { ...c, isCustom: true });
      }
    });
    return Array.from(map.values());
  });

  // Đăng ký loại hồ sơ mới
  const registerCustomCategory = (cat: {
    label: string;
    shortLabel?: string;
    key?: string;
    description?: string;
    examples?: string;
  }) => {
    const cleanLabel = cat.label.trim();
    if (!cleanLabel) return null;

    let cleanKey = (cat.key || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!cleanKey) {
      cleanKey = cleanLabel
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }
    if (!cleanKey) {
      cleanKey = `CAT_${Date.now()}`;
    }

    const shortLabel = cat.shortLabel?.trim() || cleanLabel;
    const badgeLabel = shortLabel;
    const description = cat.description?.trim() || `Chứng từ, tài liệu thuộc nhóm ${cleanLabel}`;
    const examples = cat.examples?.trim() || `${cleanKey.toLowerCase()}_01.pdf`;

    const newCatItem: DossierCategoryConfig = {
      key: cleanKey,
      label: cleanLabel,
      shortLabel: shortLabel,
      badgeLabel: badgeLabel,
      description: description,
      examples: examples,
      colorName: 'purple',
      isCustom: true,
    };

    setDossierCategories((prev) => {
      const map = new Map<string, DossierCategoryConfig>();
      prev.forEach((c) => map.set(c.key, c));
      map.set(cleanKey, newCatItem);
      const merged = Array.from(map.values());
      const customOnly = merged.filter((m) => m.isCustom);
      try {
        localStorage.setItem(CUSTOM_DOSSIER_CATEGORIES_STORAGE_KEY, JSON.stringify(customOnly));
      } catch (e) {
        console.warn('Lỗi khi lưu loại hồ sơ tùy chỉnh vào localStorage', e);
      }
      return merged;
    });

    return cleanKey;
  };

  // Xóa loại hồ sơ tùy chỉnh
  const handleDeleteCustomCategory = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa loại hồ sơ này khỏi danh mục gợi ý?')) return;
    setDossierCategories((prev) => {
      const updated = prev.filter((c) => c.key !== key);
      const customOnly = updated.filter((m) => m.isCustom);
      try {
        localStorage.setItem(CUSTOM_DOSSIER_CATEGORIES_STORAGE_KEY, JSON.stringify(customOnly));
      } catch (err) {}
      return updated;
    });
    if (stagedDocCategory === key) {
      setStagedDocCategory('CONTRACT');
    }
    if (entryCategoryTab === key) {
      setEntryCategoryTab('CONTRACT');
    }
  };

  // Đồng bộ các loại hồ sơ từ danh sách tài liệu thực tế của khoản vay
  const syncDocumentTypesIntoCategories = (docs: DisbursementDocument[]) => {
    if (!Array.isArray(docs) || docs.length === 0) return;
    setDossierCategories((prev) => {
      const map = new Map<string, DossierCategoryConfig>();
      prev.forEach((c) => map.set(c.key, c));
      let hasNew = false;
      docs.forEach((d) => {
        const dtype = (d.document_type || '').trim().toUpperCase();
        if (dtype && !map.has(dtype)) {
          hasNew = true;
          map.set(dtype, {
            key: dtype,
            label: `Hồ sơ ${dtype}`,
            shortLabel: dtype,
            badgeLabel: dtype,
            description: `Chứng từ loại ${dtype}`,
            examples: `${dtype.toLowerCase()}.pdf`,
            colorName: 'purple',
            isCustom: true,
          });
        }
      });
      if (!hasNew) return prev;
      const merged = Array.from(map.values());
      const customOnly = merged.filter((m) => m.isCustom);
      try {
        localStorage.setItem(CUSTOM_DOSSIER_CATEGORIES_STORAGE_KEY, JSON.stringify(customOnly));
      } catch (e) {}
      return merged;
    });
  };

  // State Modal Thêm Loại Hồ Sơ
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState<boolean>(false);
  const [addCatContext, setAddCatContext] = useState<'createModal' | 'entryModal'>('createModal');
  const [newCatLabel, setNewCatLabel] = useState<string>('');
  const [newCatShortLabel, setNewCatShortLabel] = useState<string>('');
  const [newCatKey, setNewCatKey] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newCatExamples, setNewCatExamples] = useState<string>('');
  const [newCatError, setNewCatError] = useState<string | null>(null);

  const QUICK_CATEGORY_SUGGESTIONS = [
    {
      label: 'Thư Bảo Lãnh Thanh Toán & Thực Hiện HĐ',
      shortLabel: 'Thư bảo lãnh',
      key: 'GUARANTEE_LETTER',
      desc: 'Thư bảo lãnh phát hành bởi ngân hàng: bảo lãnh thanh toán, bảo lãnh dự thầu, bảo lãnh tạm ứng, bảo lãnh bảo hành',
      examples: 'Thu_bao_lanh_BIDV_5ty.pdf, Cam_ket_bao_lanh_VCB.pdf',
    },
    {
      label: 'Biên Bản Nghiệm Thu & Bàn Giao',
      shortLabel: 'Nghiệm thu',
      key: 'ACCEPTANCE_RECORD',
      desc: 'Biên bản nghiệm thu hoàn thành giai đoạn, biên bản bàn giao máy móc/công trình, xác nhận khối lượng hoàn thành',
      examples: 'BB_Nghiem_thu_GiaiDoan1.pdf, BB_Ban_giao_day_chuyen.pdf',
    },
    {
      label: 'Hồ Sơ Năng Lực & Pháp Lý Doanh Nghiệp',
      shortLabel: 'Hồ sơ pháp lý',
      key: 'LEGAL_DOSSIER',
      desc: 'Đăng ký kinh doanh, điều lệ công ty, giấy phép đầu tư, giấy phép khai thác mỏ/xây dựng, CCCD người đại diện',
      examples: 'GPKD_Sunrise_2026.pdf, Dieu_le_Cong_ty.pdf',
    },
    {
      label: 'Bảo Hiểm Công Trình & Tài Sản',
      shortLabel: 'Bảo hiểm',
      key: 'INSURANCE_POLICY',
      desc: 'Hợp đồng bảo hiểm cháy nổ bắt buộc, bảo hiểm mọi rủi ro xây dựng lắp đặt, biên lai nộp phí bảo hiểm',
      examples: 'Hop_dong_bao_hiem_PJICO.pdf, Giay_chung_nhan_BH.pdf',
    },
    {
      label: 'Phương Án Kinh Doanh & Kế Hoạch Trả Nợ',
      shortLabel: 'Phương án KD',
      key: 'BUSINESS_PLAN',
      desc: 'Thuyết minh phương án vay vốn, kế hoạch tài chính luân chuyển dòng tiền, báo cáo doanh thu dự kiến',
      examples: 'Phuong_an_kinh_doanh_2026.pdf, Du_toan_chi_phi_SXKD.pdf',
    },
  ];

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatLabel.trim()) {
      setNewCatError('Vui lòng nhập tên loại hồ sơ / chứng từ.');
      return;
    }
    const createdKey = registerCustomCategory({
      label: newCatLabel,
      shortLabel: newCatShortLabel,
      key: newCatKey,
      description: newCatDesc,
      examples: newCatExamples,
    });
    if (createdKey) {
      if (addCatContext === 'createModal') {
        setStagedDocCategory(createdKey);
      } else {
        setEntryCategoryTab(createdKey);
      }
    }
    setIsAddCatModalOpen(false);
    setNewCatLabel('');
    setNewCatShortLabel('');
    setNewCatKey('');
    setNewCatDesc('');
    setNewCatExamples('');
    setNewCatError(null);
  };

  // Helper tính lãi theo TT 14/2017/TT-NHNN preview & tự động tính lãi cộng dồn
  const computeInterestPreview = (
    principal: number,
    ratePercent: number,
    method: 'MONTHLY' | 'END_OF_TERM',
    dueDay: number | null,
    disbDateStr?: string,
    matDateStr?: string,
    bankCode?: string
  ): number => {
    if (!principal || principal <= 0 || !ratePercent || ratePercent <= 0) return 0;
    const rateFraction = ratePercent / 100.0;
    if (method === 'END_OF_TERM') {
      if (disbDateStr && matDateStr) {
        const d1 = new Date(disbDateStr).getTime();
        const d2 = new Date(matDateStr).getTime();
        if (d2 > d1) {
          const days = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
          return Math.round((principal * rateFraction * days) / 365.0);
        }
      }
      return Math.round((principal * rateFraction * 30) / 365.0);
    } else {
      const today = new Date();
      const clampedDay = Math.max(1, Math.min(dueDay || (bankCode === 'CTG' ? 5 : 25), 31));

      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const maxDaysCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const currDueDate = new Date(currentYear, currentMonth, Math.min(clampedDay, maxDaysCurrentMonth));

      let prevDueDate: Date;
      let nextDueDate: Date;

      if (today.getTime() > currDueDate.getTime()) {
        prevDueDate = currDueDate;
        const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        const maxDaysNext = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
        nextDueDate = new Date(nextMonthYear, nextMonth, Math.min(clampedDay, maxDaysNext));
      } else {
        nextDueDate = currDueDate;
        const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const maxDaysPrev = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
        prevDueDate = new Date(prevMonthYear, prevMonth, Math.min(clampedDay, maxDaysPrev));
      }

      let startDate = prevDueDate;
      if (disbDateStr) {
        const dDate = new Date(disbDateStr);
        if (!isNaN(dDate.getTime()) && dDate.getTime() > prevDueDate.getTime()) {
          startDate = dDate;
        }
      }

      const diffMs = nextDueDate.getTime() - startDate.getTime();
      const days = Math.max(1, Math.round(diffMs / (1000 * 3600 * 24)));
      return Math.round((principal * rateFraction * days) / 365.0);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [loansRes, filesRes, summaryRes, orgsRes] = await Promise.all([
        api.get('/loans', { params: { limit: 100 } }),
        api.get('/credit-statements', { params: { limit: 50 } }),
        api.get('/loans/summary'),
        api.get('/loans/organizations').catch(() => ({ data: [] })),
      ]);
      const fetchedLoans: CreditFacility[] = loansRes.data.data || [];
      setLoans(fetchedLoans);
      setFiles(filesRes.data.data || []);
      setSummary(summaryRes.data || null);

      // Tự động đồng bộ các tổ chức từ máy chủ & các khoản vay hiện có vào danh sách gợi ý
      setOrganizations((prev) => {
        const map = new Map<string, PresetOrg>();
        prev.forEach((o) => map.set(o.code, o));

        if (Array.isArray(orgsRes.data)) {
          orgsRes.data.forEach((item: any) => {
            const code = (item.bank_code || '').trim().toUpperCase();
            const name = (item.bank_name || '').trim();
            const itype = (item.institution_type as InstitutionType) || 'OTHER';
            if (code && !map.has(code)) {
              map.set(code, { code, name: name || code, type: itype });
            }
          });
        }

        fetchedLoans.forEach((l) => {
          const code = (l.bank_code || '').trim().toUpperCase();
          if (code && !map.has(code)) {
            map.set(code, {
              code,
              name: l.bank_name || code,
              type: (l.institution_type as InstitutionType) || 'OTHER',
            });
          }
        });

        const merged = Array.from(map.values());
        const customOnly = merged.filter(
          (m) => !PRESET_ORGANIZATIONS.some((p) => p.code === m.code && p.name === m.name)
        );
        try {
          localStorage.setItem(CUSTOM_ORGS_STORAGE_KEY, JSON.stringify(customOnly));
        } catch (e) {}
        return merged;
      });
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu sao kê tín dụng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const uploadFiles = async (fileList: File[]) => {
    setIsUploading(true);
    const results: Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }> = [];

    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) {
        results.push({
          filename: file.name,
          type: 'error',
          text: 'Dung lượng file vượt quá giới hạn 25MB.',
        });
        continue;
      }

      const formPayload = new FormData();
      formPayload.append('file', file);
      formPayload.append('uploaded_by', 'Chị Cẩm Nhung');

      try {
        const res = await api.post('/credit-statements/upload', formPayload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const d = res.data;
        results.push({
          filename: file.name,
          type: d.reconciliation_status === 'BALANCED' ? 'success' : 'warning',
          text: d.message || `Bóc tách thành công (${d.template_code})!`,
        });
      } catch (err: any) {
        results.push({
          filename: file.name,
          type: 'error',
          text: err.response?.data?.detail || err.message || 'Lỗi khi upload file.',
        });
      }
    }

    setUploadMessages(results);
    setIsUploading(false);
    await fetchData();
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file sao kê tín dụng #${fileId}?`)) return;
    try {
      await api.delete(`/credit-statements/${fileId}`);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa file.');
    }
  };

  const formatVND = (val: number | undefined | null) => {
    if (val === undefined || val === null) return '0 ₫';
    return `${Number(val).toLocaleString('vi-VN')} ₫`;
  };

  const renderInvoiceReconciliationCard = (
    principalBalance: number,
    existingDocs: DisbursementDocument[],
    stagedList: StagedDossierFile[]
  ) => {
    const validSavedInvoices = existingDocs.filter(
      (d) => (d.invoice_total_amount && Number(d.invoice_total_amount) > 0) || d.file_name.toLowerCase().endsWith('.xml')
    );
    const validStagedInvoices = stagedList.filter(
      (sf) => (sf.invoice_total_amount && Number(sf.invoice_total_amount) > 0) || sf.file.name.toLowerCase().endsWith('.xml')
    );

    const totalSavedAmount = validSavedInvoices.reduce(
      (sum, d) => sum + (Number(d.invoice_total_amount) || 0),
      0
    );
    const totalStagedAmount = validStagedInvoices.reduce(
      (sum, sf) => sum + (Number(sf.invoice_total_amount) || 0),
      0
    );
    const totalInvoiceAmount = totalSavedAmount + totalStagedAmount;
    const totalXmlCount = validSavedInvoices.length + validStagedInvoices.length;

    const isShortage = totalInvoiceAmount < principalBalance;
    const shortageAmount = principalBalance > totalInvoiceAmount ? principalBalance - totalInvoiceAmount : 0;
    const surplusAmount = totalInvoiceAmount > principalBalance ? totalInvoiceAmount - principalBalance : 0;
    const coveragePercent = principalBalance > 0 ? Math.min(100, Math.round((totalInvoiceAmount / principalBalance) * 100)) : 100;

    return (
      <div
        className={`p-4 rounded-xl border-2 shadow-xs transition-all ${
          totalXmlCount === 0
            ? 'bg-blue-50/70 border-blue-200 text-blue-950'
            : isShortage
            ? 'bg-rose-50/95 border-rose-300 text-rose-950 ring-2 ring-rose-200/50'
            : 'bg-emerald-50/95 border-emerald-300 text-emerald-950 ring-2 ring-emerald-200/50'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xl shadow-xs ${
              totalXmlCount === 0
                ? 'bg-blue-100 border border-blue-200 text-blue-700'
                : isShortage
                ? 'bg-rose-100 border border-rose-300 text-rose-700 animate-pulse'
                : 'bg-emerald-100 border border-emerald-300 text-emerald-700'
            }`}
          >
            {totalXmlCount === 0 ? (
              <Info className="w-5 h-5 text-blue-600" />
            ) : isShortage ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 animate-pulse" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`text-sm font-black tracking-tight uppercase ${
                    totalXmlCount === 0
                      ? 'text-blue-900'
                      : isShortage
                      ? 'text-rose-900'
                      : 'text-emerald-900'
                  }`}
                >
                  {totalXmlCount === 0
                    ? 'Đối Soát Hóa Đơn Điện Tử XML Với Dư Nợ Gốc'
                    : isShortage
                    ? 'CẢNH BÁO: THIẾU HÓA ĐƠN GIẢI NGÂN'
                    : 'ĐÃ ĐỦ HÓA ĐƠN GIẢI NGÂN HỢP LỆ'}
                </h4>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    totalXmlCount === 0
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : isShortage
                      ? 'bg-rose-200 text-rose-900 border-rose-300'
                      : 'bg-emerald-200 text-emerald-900 border-emerald-300'
                  }`}
                >
                  {totalXmlCount === 0
                    ? 'Chưa nạp XML'
                    : isShortage
                    ? `Đạt ${coveragePercent}% - Thiếu hóa đơn`
                    : 'Đạt 100% - Đầy đủ'}
                </span>
              </div>

              {isShortage && totalXmlCount > 0 && (
                <span className="text-xs font-black text-rose-800 bg-white/90 px-3 py-1 rounded-lg border border-rose-300 shadow-2xs">
                  Còn thiếu: {formatVND(shortageAmount)}
                </span>
              )}
              {!isShortage && totalXmlCount > 0 && surplusAmount > 0 && (
                <span className="text-xs font-bold text-emerald-800 bg-white/90 px-3 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                  Dư thừa: +{formatVND(surplusAmount)}
                </span>
              )}
            </div>

            {/* Dòng tóm tắt 3 cột đối soát */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2.5 pt-2 border-t border-slate-200/60 text-xs">
              <div className="bg-white/70 p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  Dư Nợ Gốc Cần Bù Đắp
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {formatVND(principalBalance)}
                </span>
              </div>
              <div className="bg-white/70 p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  Tổng Tiền Hóa Đơn XML ({totalXmlCount} HĐ)
                </span>
                <span
                  className={`font-bold text-sm ${
                    isShortage && totalXmlCount > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {formatVND(totalInvoiceAmount)}
                </span>
              </div>
              <div className="bg-white/70 p-2 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  Chênh Lệch / Trạng Thái
                </span>
                {totalXmlCount === 0 ? (
                  <span className="font-bold text-blue-700 text-xs">Cần nạp file XML</span>
                ) : isShortage ? (
                  <span className="font-bold text-rose-700 text-sm">
                    Thiếu -{formatVND(shortageAmount)}
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700 text-sm">Đã đủ 100%</span>
                )}
              </div>
            </div>

            {/* Thông điệp cảnh báo rõ ràng */}
            {isShortage && totalXmlCount > 0 && (
              <p className="text-xs text-rose-900 font-medium mt-2 bg-rose-100/70 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
                ⚠️ <strong>Cảnh báo:</strong> Tổng số tiền trên các hóa đơn điện tử XML (
                <strong>{formatVND(totalInvoiceAmount)}</strong>) <strong>bé hơn dư nợ gốc</strong> (
                <strong>{formatVND(principalBalance)}</strong>). Hệ thống cảnh báo{' '}
                <strong>thiếu hóa đơn</strong> giải ngân. Vui lòng bổ sung thêm tối thiểu{' '}
                <strong>{formatVND(shortageAmount)}</strong> hóa đơn XML để đảm bảo đủ tính pháp lý và hồ sơ sử dụng vốn tín dụng!
              </p>
            )}

            {!isShortage && totalXmlCount > 0 && (
              <p className="text-xs text-emerald-900 font-medium mt-2 bg-emerald-100/70 p-2.5 rounded-lg border border-emerald-200 leading-relaxed">
                ✅ <strong>Đã đảm bảo:</strong> Toàn bộ dư nợ gốc ({formatVND(principalBalance)}) đã
                được bao phủ đầy đủ bởi các hóa đơn điện tử XML hợp lệ ({formatVND(totalInvoiceAmount)}).
              </p>
            )}

            {totalXmlCount === 0 && (
              <p className="text-[11px] text-blue-800 mt-2">
                💡 <strong>Ghi chú:</strong> Hồ sơ dạng hóa đơn gồm cả file <code>XML</code> và <code>PDF</code>. Hệ thống sẽ tự động đọc nội dung file XML để cộng dồn số tiền thanh toán <code>&lt;TgTTTBSo&gt;</code> và đối chiếu với dư nợ gốc của khoản vay.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Mở modal tạo mới
  const handleOpenCreateModal = () => {
    setEditingLoan(null);
    setModalError(null);
    setStagedFiles([]);
    setEditModalDocs([]);
    setStagedDocCategory('CONTRACT');
    setFormOrgPreset('CTG');
    setFormData({
      bank_code: 'CTG',
      bank_name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
      institution_type: 'BANK',
      contract_number: '',
      borrower_name: 'CONG TY CO PHAN XI MANG SUNRISE',
      cif_number: '',
      loan_purpose: 'Vay bổ sung vốn lưu động phục vụ SXKD xi măng',
      currency: 'VND',
      disbursement_date: new Date().toISOString().split('T')[0],
      maturity_date: '',
      term: '6M',
      interest_rate: 8.5,
      debt_group: '1',
      loan_type: 'SHORT_TERM',
      interest_payment_method: 'MONTHLY' as InterestPaymentMethod,
      monthly_interest_due_day: 5,
      original_principal_balance: 0,
      current_principal_balance: 0,
      accrued_interest: 0,
      next_repayment_date: '',
      next_principal_amount: 0,
      next_interest_amount: 0,
      total_repayment_amount: 0,
      status: 'ACTIVE',
      note: '',
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (loan: CreditFacility) => {
    setEditingLoan(loan);
    setModalError(null);
    setStagedFiles([]);
    setEditModalDocs([]);
    setStagedDocCategory('CONTRACT');
    setIsEditModalDocsLoading(true);

    // Tải danh sách hồ sơ giải ngân đã có của khoản vay
    api.get(`/loans/${loan.loan_id}/dossier`)
      .then((res) => {
        setEditModalDocs(res.data || []);
        syncDocumentTypesIntoCategories(res.data || []);
      })
      .catch((err) => console.error('Lỗi khi tải hồ sơ giải ngân:', err))
      .finally(() => setIsEditModalDocsLoading(false));

    const matched = organizations.find((p) => p.code === loan.bank_code);
    if (matched) {
      setFormOrgPreset(matched.code);
    } else {
      const customOrg: PresetOrg = {
        code: loan.bank_code,
        name: loan.bank_name || loan.bank_code,
        type: (loan.institution_type as InstitutionType) || 'OTHER',
      };
      registerCustomOrg(customOrg);
      setFormOrgPreset(loan.bank_code);
    }
    setFormData({
      bank_code: loan.bank_code,
      bank_name: loan.bank_name,
      institution_type: loan.institution_type || 'BANK',
      contract_number: loan.contract_number,
      borrower_name: loan.borrower_name,
      cif_number: loan.cif_number || '',
      loan_purpose: loan.loan_purpose || '',
      currency: loan.currency || 'VND',
      disbursement_date: loan.disbursement_date || '',
      maturity_date: loan.maturity_date || '',
      term: loan.term || '',
      interest_rate: Number(loan.interest_rate) || 0,
      debt_group: loan.debt_group || '1',
      loan_type: loan.loan_type || 'SHORT_TERM',
      interest_payment_method: (loan.interest_payment_method || 'MONTHLY') as InterestPaymentMethod,
      monthly_interest_due_day: loan.monthly_interest_due_day || (loan.bank_code === 'CTG' ? 5 : 25),
      original_principal_balance: Number(loan.original_principal_balance || loan.current_principal_balance) || 0,
      current_principal_balance: Number(loan.current_principal_balance) || 0,
      accrued_interest: Number(loan.accrued_interest) || 0,
      next_repayment_date: loan.next_repayment_date || '',
      next_principal_amount: Number(loan.next_principal_amount) || 0,
      next_interest_amount: Number(loan.next_interest_amount) || 0,
      total_repayment_amount: Number(loan.total_repayment_amount) || 0,
      status: loan.status || 'ACTIVE',
      note: loan.note || '',
    });
    setIsModalOpen(true);
  };

  // Helper bóc tách hóa đơn XML và chuẩn bị tệp nạp
  const stageFilesWithInvoiceParsing = async (
    files: File[],
    catKey: string
  ): Promise<StagedDossierFile[]> => {
    const validFiles: StagedDossierFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng tối đa 50MB.`);
        continue;
      }
      let invoiceNumber: string | null = null;
      let invoiceTotalAmount: number | null = null;
      if (f.name.toLowerCase().endsWith('.xml') || f.type.includes('xml')) {
        const parsed = await parseXmlInvoiceBrowser(f);
        invoiceNumber = parsed.invoiceNumber;
        invoiceTotalAmount = parsed.totalAmount;
      }
      validFiles.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        document_type: catKey,
        description: '',
        invoice_number: invoiceNumber,
        invoice_total_amount: invoiceTotalAmount,
      });
    }
    return validFiles;
  };

  // Handlers quản lý file hồ sơ giải ngân đính kèm trong Form Modal theo loại chứng từ
  const handleAddStagedFilesForCategory = async (
    e: React.ChangeEvent<HTMLInputElement>,
    catKey: string
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    const validFiles = await stageFilesWithInvoiceParsing(files, catKey);
    setStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDropStagedFilesForCategory = async (
    e: React.DragEvent<HTMLDivElement>,
    catKey: string
  ) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);
    const validFiles = await stageFilesWithInvoiceParsing(files, catKey);
    setStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((sf) => sf.id !== id));
  };

  const handleUpdateStagedType = (id: string, type: string) => {
    setStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, document_type: type } : sf))
    );
  };

  const handleUpdateStagedDesc = (id: string, desc: string) => {
    setStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, description: desc } : sf))
    );
  };

  const handleDeleteEditModalDoc = async (documentId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;
    try {
      await api.delete(`/loans/dossier/${documentId}`);
      if (editingLoan) {
        const res = await api.get(`/loans/${editingLoan.loan_id}/dossier`);
        setEditModalDocs(res.data || []);
        fetchData();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa tài liệu.');
    }
  };

  const handleDownloadDossierDoc = async (doc: DisbursementDocument) => {
    try {
      const res = await api.get(`/loans/dossier/${doc.document_id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi tải file tài liệu.');
    }
  };

  // =========================================================================
  // GIAO DIỆN NHẬP BỘ HỒ SƠ CHO CÁC KHOẢN VAY ĐÃ NHẬP (CẤU TRÚC FORM CHUẨN)
  // =========================================================================
  const handleOpenDossierEntryModal = async (targetLoan?: CreditFacility) => {
    const loanToSelect = targetLoan || (loans.length > 0 ? loans[0] : null);
    const loanId = loanToSelect ? loanToSelect.loan_id : null;

    setEntrySelectedLoanId(loanId);
    setEntryStagedFiles([]);
    setEntryCategoryTab('CONTRACT');
    setEntryBatchNote('');
    setEntryModalMsg(null);
    setIsDossierEntryModalOpen(true);

    if (loanId) {
      setIsEntryDocsLoading(true);
      try {
        const res = await api.get(`/loans/${loanId}/dossier`);
        const docs = res.data || [];
        setEntryDossierDocs(docs);
        syncDocumentTypesIntoCategories(docs);
      } catch (err: any) {
        console.error('Lỗi khi tải hồ sơ giải ngân:', err);
        setEntryDossierDocs([]);
      } finally {
        setIsEntryDocsLoading(false);
      }
    } else {
      setEntryDossierDocs([]);
    }
  };

  const handleSelectEntryLoan = async (loanId: number) => {
    setEntrySelectedLoanId(loanId);
    setEntryModalMsg(null);
    setIsEntryDocsLoading(true);
    try {
      const res = await api.get(`/loans/${loanId}/dossier`);
      const docs = res.data || [];
      setEntryDossierDocs(docs);
      syncDocumentTypesIntoCategories(docs);
    } catch (err: any) {
      console.error('Lỗi khi tải hồ sơ giải ngân của khoản vay:', err);
      setEntryDossierDocs([]);
    } finally {
      setIsEntryDocsLoading(false);
    }
  };

  const handleAddEntryStagedFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    catKey: string
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    const validFiles = await stageFilesWithInvoiceParsing(files, catKey);
    setEntryStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDropEntryStagedFiles = async (
    e: React.DragEvent<HTMLDivElement>,
    catKey: string
  ) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);
    const validFiles = await stageFilesWithInvoiceParsing(files, catKey);
    setEntryStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveEntryStagedFile = (id: string) => {
    setEntryStagedFiles((prev) => prev.filter((sf) => sf.id !== id));
  };

  const handleUpdateEntryStagedType = (id: string, type: string) => {
    setEntryStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, document_type: type } : sf))
    );
  };

  const handleUpdateEntryStagedDesc = (id: string, desc: string) => {
    setEntryStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, description: desc } : sf))
    );
  };

  const handleDeleteEntrySavedDoc = async (documentId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;
    try {
      await api.delete(`/loans/dossier/${documentId}`);
      if (entrySelectedLoanId) {
        const res = await api.get(`/loans/${entrySelectedLoanId}/dossier`);
        const docs = res.data || [];
        setEntryDossierDocs(docs);
        syncDocumentTypesIntoCategories(docs);
      }
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa tài liệu.');
    }
  };

  const handleSubmitEntryDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entrySelectedLoanId) {
      setEntryModalMsg({ type: 'error', text: 'Vui lòng chọn một khoản vay đã nhập trong hệ thống.' });
      return;
    }
    if (entryStagedFiles.length === 0) {
      setEntryModalMsg({ type: 'error', text: 'Vui lòng chọn ít nhất một tệp tài liệu để lưu vào bộ hồ sơ.' });
      return;
    }

    setIsEntrySubmitting(true);
    setEntryModalMsg(null);

    let successCount = 0;
    let failCount = 0;

    for (const sf of entryStagedFiles) {
      try {
        const fd = new FormData();
        fd.append('file', sf.file);
        fd.append('document_type', sf.document_type);
        const descCombined = [sf.description.trim(), entryBatchNote.trim()].filter(Boolean).join(' | ');
        if (descCombined) {
          fd.append('description', descCombined);
        }
        fd.append('uploaded_by', 'Chị Cẩm Nhung');

        await api.post(`/loans/${entrySelectedLoanId}/dossier/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch (uploadErr) {
        console.error('Lỗi khi tải file hồ sơ giải ngân lên Object Storage:', sf.file.name, uploadErr);
        failCount++;
      }
    }

    setIsEntrySubmitting(false);

    if (successCount > 0) {
      setEntryModalMsg({
        type: 'success',
        text: `Đã lưu thành công ${successCount} tệp vào Object Storage cho khoản vay!${failCount > 0 ? ` (${failCount} tệp lỗi)` : ''
          }`,
      });
      setEntryStagedFiles([]);
      const res = await api.get(`/loans/${entrySelectedLoanId}/dossier`);
      const docs = res.data || [];
      setEntryDossierDocs(docs);
      syncDocumentTypesIntoCategories(docs);
      await fetchData();
    } else {
      setEntryModalMsg({
        type: 'error',
        text: 'Không thể tải lên các tệp tài liệu. Vui lòng kiểm tra lại.',
      });
    }
  };

  // Thay đổi tổ chức cấp tín dụng
  const handleOrgPresetChange = (presetCode: string) => {
    setFormOrgPreset(presetCode);
    if (presetCode === 'CUSTOM') {
      setFormData((prev) => ({
        ...prev,
        bank_code: '',
        bank_name: '',
        institution_type: 'OTHER',
      }));
    } else {
      const org = organizations.find((o) => o.code === presetCode);
      if (org) {
        setFormData((prev) => ({
          ...prev,
          bank_code: org.code,
          bank_name: org.name,
          institution_type: org.type,
          loan_type: org.type === 'LEASING_COMPANY' ? 'FINANCIAL_LEASE' : prev.loan_type,
          monthly_interest_due_day: org.code === 'CTG' || org.code === 'CTG_LEASING' ? 5 : (prev.monthly_interest_due_day || 25),
        }));
      }
    }
  };

  // Tự động tính toán lại total_repayment_amount khi đổi gốc hoặc lãi kỳ tới
  const handlePrincipalInterestChange = (
    field: 'next_principal_amount' | 'next_interest_amount',
    value: number
  ) => {
    setFormData((prev) => {
      const nextPrincipal = field === 'next_principal_amount' ? value : prev.next_principal_amount;
      const nextInterest = field === 'next_interest_amount' ? value : prev.next_interest_amount;
      return {
        ...prev,
        [field]: value,
        total_repayment_amount: nextPrincipal + nextInterest,
      };
    });
  };

  // Xử lý submit form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // Validation cơ bản
    if (!formData.bank_code.trim()) {
      setModalError('Vui lòng nhập mã tổ chức cấp tín dụng (Mã ngân hàng / Cty TC).');
      return;
    }
    if (!formData.bank_name.trim()) {
      setModalError('Vui lòng nhập tên đầy đủ của đơn vị cấp tín dụng.');
      return;
    }
    if (!formData.contract_number.trim()) {
      setModalError('Vui lòng nhập Số hợp đồng / Số khế ước nhận nợ.');
      return;
    }
    if (!formData.borrower_name.trim()) {
      setModalError('Vui lòng nhập Tên đơn vị / người đi vay.');
      return;
    }
    if (formData.current_principal_balance <= 0) {
      setModalError('Dư nợ gốc hiện tại phải lớn hơn 0.');
      return;
    }

    setModalSubmitting(true);
    try {
      const calculatedAccrued = computeInterestPreview(
        formData.current_principal_balance,
        formData.interest_rate,
        formData.interest_payment_method,
        formData.monthly_interest_due_day,
        formData.disbursement_date,
        formData.maturity_date,
        formData.bank_code
      );
      const finalAccruedInterest = calculatedAccrued || formData.accrued_interest || 0;

      let targetLoanId: number | null = editingLoan ? editingLoan.loan_id : null;
      if (editingLoan) {
        // Cập nhật khoản vay
        const updatePayload: CreditFacilityUpdatePayload = {
          bank_code: formData.bank_code.trim().toUpperCase(),
          bank_name: formData.bank_name.trim(),
          institution_type: formData.institution_type,
          contract_number: formData.contract_number.trim(),
          borrower_name: formData.borrower_name.trim(),
          cif_number: formData.cif_number.trim() || null,
          loan_purpose: formData.loan_purpose.trim() || null,
          currency: formData.currency,
          disbursement_date: formData.disbursement_date || null,
          maturity_date: formData.maturity_date || null,
          term: formData.term.trim() || null,
          interest_rate: formData.interest_rate,
          debt_group: formData.debt_group,
          loan_type: formData.loan_type,
          interest_payment_method: formData.interest_payment_method,
          monthly_interest_due_day: formData.interest_payment_method === 'MONTHLY' ? formData.monthly_interest_due_day : null,
          original_principal_balance: formData.original_principal_balance || formData.current_principal_balance,
          current_principal_balance: formData.current_principal_balance,
          accrued_interest: finalAccruedInterest,
          next_repayment_date: formData.next_repayment_date || null,
          next_principal_amount: formData.next_principal_amount,
          next_interest_amount: formData.next_interest_amount,
          total_repayment_amount: formData.total_repayment_amount,
          status: formData.status,
          note: formData.note.trim() || null,
        };
        await api.put(`/loans/${editingLoan.loan_id}`, updatePayload);
      } else {
        // Tạo mới khoản vay lẻ thủ công
        const createPayload: CreditFacilityCreatePayload = {
          bank_code: formData.bank_code.trim().toUpperCase(),
          bank_name: formData.bank_name.trim(),
          institution_type: formData.institution_type,
          contract_number: formData.contract_number.trim(),
          borrower_name: formData.borrower_name.trim(),
          cif_number: formData.cif_number.trim() || null,
          loan_purpose: formData.loan_purpose.trim() || null,
          currency: formData.currency,
          disbursement_date: formData.disbursement_date || null,
          maturity_date: formData.maturity_date || null,
          term: formData.term.trim() || null,
          interest_rate: formData.interest_rate,
          debt_group: formData.debt_group,
          loan_type: formData.loan_type,
          interest_payment_method: formData.interest_payment_method,
          monthly_interest_due_day: formData.interest_payment_method === 'MONTHLY' ? formData.monthly_interest_due_day : null,
          original_principal_balance: formData.original_principal_balance || formData.current_principal_balance,
          current_principal_balance: formData.current_principal_balance,
          accrued_interest: finalAccruedInterest,
          next_repayment_date: formData.next_repayment_date || null,
          next_principal_amount: formData.next_principal_amount,
          next_interest_amount: formData.next_interest_amount,
          total_repayment_amount: formData.total_repayment_amount,
          status: formData.status,
          note: formData.note.trim() || null,
        };
        const res = await api.post('/loans', createPayload);
        targetLoanId = res.data?.loan_id;
      }

      // Tự động đẩy các file hồ sơ giải ngân đính kèm lên Object Storage
      if (targetLoanId && stagedFiles.length > 0) {
        for (const sf of stagedFiles) {
          try {
            const fd = new FormData();
            fd.append('file', sf.file);
            fd.append('document_type', sf.document_type);
            if (sf.description.trim()) {
              fd.append('description', sf.description.trim());
            }
            fd.append('uploaded_by', 'Chị Cẩm Nhung');
            await api.post(`/loans/${targetLoanId}/dossier/upload`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          } catch (uploadErr) {
            console.error('Lỗi khi tải file hồ sơ giải ngân lên Object Storage:', sf.file.name, uploadErr);
          }
        }
      }

      // Tự động bổ sung và ghi nhớ tổ chức vừa nhập vào danh mục gợi ý cho các lần sau
      registerCustomOrg({
        code: formData.bank_code.trim().toUpperCase(),
        name: formData.bank_name.trim(),
        type: formData.institution_type,
      });

      setStagedFiles([]);
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Lỗi khi lưu khoản vay:', err);
      setModalError(err.response?.data?.detail || err.message || 'Lỗi khi lưu thông tin khoản vay.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Xóa khoản vay
  const handleDeleteLoan = async (loan: CreditFacility) => {
    const isManual = loan.is_manual;
    const confirmMsg = isManual
      ? `Bạn có chắc chắn muốn xóa hoàn toàn khoản nợ/khoản vay lẻ #${loan.contract_number} (${loan.bank_name})?`
      : `Khoản vay #${loan.contract_number} có nguồn từ file sao kê. Bạn có chắc chắn muốn chuyển sang trạng thái tất toán (SETTLED)?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/loans/${loan.loan_id}`);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Lỗi khi xóa khoản vay.');
    }
  };

  // Filter loans
  const filteredLoans = loans.filter((loan) => {
    // Lọc theo ngân hàng
    if (bankFilter !== 'ALL') {
      if (bankFilter === 'MBB') {
        if (loan.bank_code !== 'MBB' && loan.bank_code !== 'MB') return false;
      } else if (loan.bank_code !== bankFilter) {
        return false;
      }
    }

    // Lọc theo loại tổ chức
    if (institutionFilter !== 'ALL') {
      const type = loan.institution_type || 'BANK';
      if (type !== institutionFilter) return false;
    }

    // Lọc theo nguồn gốc (Nhập lẻ vs Sao kê)
    if (sourceFilter !== 'ALL') {
      if (sourceFilter === 'MANUAL' && !loan.is_manual) return false;
      if (sourceFilter === 'AUTO' && loan.is_manual) return false;
    }

    // Lọc từ khóa tìm kiếm
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchNo = loan.contract_number.toLowerCase().includes(q);
      const matchPurpose = loan.loan_purpose?.toLowerCase().includes(q) || false;
      const matchHolder = loan.borrower_name.toLowerCase().includes(q);
      const matchBank = loan.bank_name.toLowerCase().includes(q) || loan.bank_code.toLowerCase().includes(q);
      if (!matchNo && !matchPurpose && !matchHolder && !matchBank) return false;
    }

    // Lọc hạn trả
    if (dueFilter === '7DAYS') {
      if (!loan.next_repayment_date) return false;
      const due = new Date(loan.next_repayment_date).getTime();
      const now = new Date().getTime();
      const diffDays = (due - now) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 7) return false;
    }
    if (dueFilter === '30DAYS') {
      if (!loan.next_repayment_date) return false;
      const due = new Date(loan.next_repayment_date).getTime();
      const now = new Date().getTime();
      const diffDays = (due - now) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 30) return false;
    }
    return true;
  });

  // Sắp xếp danh sách khoản vay theo cột đang chọn (Sort tính năng theo yêu cầu)
  const sortedLoans = useMemo(() => {
    return [...filteredLoans].sort((a: any, b: any) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'original_principal_balance') {
        aVal = Number(a.original_principal_balance || a.current_principal_balance || 0);
        bVal = Number(b.original_principal_balance || b.current_principal_balance || 0);
      } else if (sortField === 'total_repaid_principal') {
        aVal = Number(a.total_repaid_principal || 0);
        bVal = Number(b.total_repaid_principal || 0);
      }

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Số học
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Chuỗi ký tự (tiếng Việt có dấu và số)
      const strA = String(aVal);
      const strB = String(bVal);
      const cmp = strA.localeCompare(strB, 'vi', { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredLoans, sortField, sortDirection]);

  // Phân trang danh sách khoản vay (Đảm bảo bảng chỉ dài đúng 1 trang màn hình)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, bankFilter, institutionFilter, sourceFilter, dueFilter, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedLoans.length / (pageSize >= 9999 ? 1 : pageSize)));
  const paginatedLoans = useMemo(() => {
    if (pageSize >= 9999) return sortedLoans;
    const start = (currentPage - 1) * pageSize;
    return sortedLoans.slice(start, start + pageSize);
  }, [sortedLoans, currentPage, pageSize]);

  const renderSortHeader = (field: string, label: string, align: 'left' | 'center' | 'right' = 'left') => {
    const isActive = sortField === field;
    const isFirstCol = field === 'contract_number';
    return (
      <th
        onClick={() => handleSort(field)}
        className={`py-3 px-3 cursor-pointer select-none transition-colors whitespace-nowrap group hover:bg-slate-200/80 ${
          isActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-slate-600'
        } ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${
          isFirstCol
            ? 'sticky left-0 bg-slate-100 z-30 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] border-r border-slate-200'
            : ''
        }`}
        title={`Click để sắp xếp theo ${label} (${isActive && sortDirection === 'asc' ? 'Giảm dần' : 'Tăng dần'})`}
      >
        <div
          className={`inline-flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 opacity-60 group-hover:opacity-100 flex-shrink-0" />
          )}
        </div>
      </th>
    );
  };

  // ---------------------------------------------------------------------------
  // PIVOT MATRIX COMPUTATION
  // ---------------------------------------------------------------------------
  const pivotResult = useMemo(() => {
    const rowDef = PIVOT_ROW_DIMENSIONS.find((d) => d.id === pivotRowDim) || PIVOT_ROW_DIMENSIONS[0];
    const is2D = pivotColDim !== 'NONE';
    const colDef = is2D ? PIVOT_COL_DIMENSIONS.find((d) => d.id === pivotColDim) : null;
    const metricDef = PIVOT_METRIC_DEFS.find((m) => m.id === pivotMetric) || PIVOT_METRIC_DEFS[0];

    const loansToPivot = filteredLoans.filter((l) => {
      if (!pivotSearch.trim()) return true;
      const q = pivotSearch.toLowerCase();
      return (
        (l.bank_name && l.bank_name.toLowerCase().includes(q)) ||
        (l.bank_code && l.bank_code.toLowerCase().includes(q)) ||
        (l.contract_number && l.contract_number.toLowerCase().includes(q)) ||
        (l.borrower_name && l.borrower_name.toLowerCase().includes(q)) ||
        (l.loan_purpose && l.loan_purpose.toLowerCase().includes(q))
      );
    });

    const rowKeysSet = new Set<string>();
    const colKeysSet = new Set<string>();
    const grid: Record<string, Record<string, CreditFacility[]>> = {};

    loansToPivot.forEach((loan) => {
      const rKey = rowDef.getValue(loan);
      const cKey = colDef ? colDef.getValue(loan) : '__SINGLE__';

      rowKeysSet.add(rKey);
      if (colDef) colKeysSet.add(cKey);

      if (!grid[rKey]) grid[rKey] = {};
      if (!grid[rKey][cKey]) grid[rKey][cKey] = [];
      grid[rKey][cKey].push(loan);
    });

    const sortedRowKeys = Array.from(rowKeysSet).sort((a, b) =>
      a.localeCompare(b, 'vi', { numeric: true })
    );
    const sortedColKeys = colDef
      ? Array.from(colKeysSet).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
      : ['__SINGLE__'];

    const matrix: Record<string, Record<string, number>> = {};
    const matrixCounts: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const rowCounts: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    const colCounts: Record<string, number> = {};
    let grandMax = 0;

    sortedRowKeys.forEach((rKey) => {
      matrix[rKey] = {};
      matrixCounts[rKey] = {};
      const allRowLoans: CreditFacility[] = [];

      sortedColKeys.forEach((cKey) => {
        const cellLoans = grid[rKey]?.[cKey] || [];
        const val = metricDef.compute(cellLoans);
        matrix[rKey][cKey] = val;
        matrixCounts[rKey][cKey] = cellLoans.length;
        if (val > grandMax) grandMax = val;
        allRowLoans.push(...cellLoans);
      });

      rowTotals[rKey] = metricDef.compute(allRowLoans);
      rowCounts[rKey] = allRowLoans.length;
    });

    sortedColKeys.forEach((cKey) => {
      const allColLoans: CreditFacility[] = [];
      sortedRowKeys.forEach((rKey) => {
        const cellLoans = grid[rKey]?.[cKey] || [];
        allColLoans.push(...cellLoans);
      });
      colTotals[cKey] = metricDef.compute(allColLoans);
      colCounts[cKey] = allColLoans.length;
    });

    const grandTotal = metricDef.compute(loansToPivot);

    // Summary KPIs for current pivot subset
    const totalPrincipal = loansToPivot.reduce((s, l) => s + Number(l.current_principal_balance || 0), 0);
    const totalInterest = loansToPivot.reduce(
      (s, l) => s + Number(l.calculated_interest_due ?? l.accrued_interest ?? 0),
      0
    );
    const totalNextPrincipal = loansToPivot.reduce((s, l) => s + Number(l.next_principal_amount || 0), 0);
    const avgWair =
      totalPrincipal > 0
        ? loansToPivot.reduce(
            (s, l) => s + Number(l.current_principal_balance || 0) * Number(l.interest_rate || 0),
            0
          ) / totalPrincipal
        : 0;

    return {
      rowDef,
      colDef,
      is2D,
      metricDef,
      loansCount: loansToPivot.length,
      sortedRowKeys,
      sortedColKeys,
      matrix,
      matrixCounts,
      rowTotals,
      rowCounts,
      colTotals,
      colCounts,
      grandTotal,
      grandMax,
      kpis: {
        totalPrincipal,
        totalInterest,
        totalNextPrincipal,
        avgWair,
        totalLoans: loansToPivot.length,
      },
    };
  }, [filteredLoans, pivotRowDim, pivotColDim, pivotMetric, pivotSearch]);

  const handleExportPivotCSV = () => {
    if (!pivotResult) return;
    const {
      rowDef,
      colDef,
      is2D,
      metricDef,
      sortedRowKeys,
      sortedColKeys,
      matrix,
      rowTotals,
      colTotals,
      grandTotal,
    } = pivotResult;

    const rows: string[][] = [];

    if (is2D && colDef) {
      rows.push([`${rowDef.label} \\ ${colDef.label}`, ...sortedColKeys, 'Tổng Cộng']);
    } else {
      rows.push([rowDef.label, metricDef.label]);
    }

    sortedRowKeys.forEach((rKey) => {
      if (is2D && colDef) {
        const colVals = sortedColKeys.map((cKey) => {
          const v = matrix[rKey]?.[cKey] || 0;
          return metricDef.format(v);
        });
        rows.push([rKey, ...colVals, metricDef.format(rowTotals[rKey] || 0)]);
      } else {
        rows.push([rKey, metricDef.format(matrix[rKey]?.['__SINGLE__'] || 0)]);
      }
    });

    if (is2D && colDef) {
      const colTotalVals = sortedColKeys.map((cKey) => metricDef.format(colTotals[cKey] || 0));
      rows.push(['TỔNG TẤT CẢ', ...colTotalVals, metricDef.format(grandTotal)]);
    } else {
      rows.push(['TỔNG TẤT CẢ', metricDef.format(grandTotal)]);
    }

    const csvContent =
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((cell) => {
              const str = String(cell ?? '').replace(/"/g, '""');
              return `"${str}"`;
            })
            .join(',')
        )
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pivot_khoan_vay_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building className="w-7 h-7 text-indigo-600" />
            Quản Lý & Đối Soát Sao Kê Tín Dụng
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi hợp đồng vay, khế ước nhận nợ LD từ ngân hàng & các khoản nợ lẻ từ công ty tài chính, thuê tài chính
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleOpenDossierEntryModal()}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-semibold shadow-2xs hover:shadow-xs transition-all"
            title="Đính kèm bộ hồ sơ chứng từ giải ngân cho khoản vay đã có trong hệ thống"
          >
            <FolderArchive className="w-4 h-4 text-indigo-600" />
            <span>Nhập Bộ Hồ Sơ Cho Khoản Vay</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nhập Lẻ Khoản Vay</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Tổng Dư Nợ Vay</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatVND(summary?.total_principal_balance)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary?.total_active_loans || 0} khoản vay đang theo dõi
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Lãi Dự Trả / Lũy Kế</span>
            <Percent className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600">
            {formatVND((summary?.total_accrued_interest || 0) + (summary?.total_upcoming_interest_due || 0))}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Đến hạn gần nhất: {formatVND(summary?.total_upcoming_interest_due)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Đến Hạn Trong 7 Ngày</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600">
            {formatVND(summary?.total_upcoming_due_7days)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Gốc & lãi cần thanh toán tuần tới</div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Đến Hạn Trong 30 Ngày</span>
            <Calendar className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-600">
            {formatVND(summary?.total_upcoming_due_30days)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Gốc & lãi trong tháng tới</div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Lãi Suất BQ (WAIR)</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-purple-600">
            {summary?.weighted_avg_interest_rate ? `${Number(summary.weighted_avg_interest_rate).toFixed(2)} %` : '0.00 %'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Weighted Average Interest Rate</div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-600" />
          Nạp File Sao Kê Danh Sách Khoản Vay & Khế Ước LD
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Hỗ trợ bóc tách tự động: <strong>VietinBank eFAST</strong> (Báo cáo danh sách khoản vay .xls) và <strong>MB (MBBank)</strong> (Báo cáo số dư tài khoản Vay/LD .xlsx). Đối với các khoản nợ từ tổ chức khác hoặc công ty tài chính, sử dụng tính năng <strong>Nhập Lẻ Khoản Vay</strong>.
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-xl p-8 text-center transition-all cursor-pointer relative"
        >
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-medium text-slate-700">
              {isUploading ? 'Đang phân tích và đối soát file...' : 'Kéo thả file sao kê tín dụng vào đây, hoặc click để chọn file'}
            </div>
            <div className="text-xs text-slate-400">
              Chấp nhận định dạng .xlsx, .xls (Tối đa 25MB)
            </div>
          </div>
        </div>

        {uploadMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${msg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : msg.type === 'warning'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
              >
                {msg.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <span className="font-semibold">{msg.filename}: </span>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('loans')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'loans'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <Layers className="w-4 h-4" />
            <span>Danh Mục Khoản Vay & Nợ ({filteredLoans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('banks')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'banks'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <Building className="w-4 h-4" />
            <span>Phân Bổ Theo Tổ Chức Tín Dụng ({summary?.by_bank.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'files'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Lịch Sử File Sao Kê Đã Nạp ({files.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pivot')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'pivot'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Phân Tích Đa Chiều (Pivot)</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Danh Mục Khoản Vay & Khế Ước */}
      {activeTab === 'loans' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm số hợp đồng, mục đích, đơn vị..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Lọc loại tổ chức */}
              <select
                aria-label="Lọc theo loại tổ chức"
                value={institutionFilter}
                onChange={(e) => setInstitutionFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả loại tổ chức</option>
                <option value="BANK">Ngân hàng thương mại</option>
                <option value="FINANCE_COMPANY">Công ty tài chính</option>
                <option value="LEASING_COMPANY">Cho thuê tài chính</option>
                <option value="OTHER">Tổ chức khác</option>
              </select>

              {/* Lọc nguồn gốc */}
              <select
                aria-label="Lọc theo nguồn dữ liệu"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả nguồn</option>
                <option value="MANUAL">Chỉ khoản nợ nhập lẻ</option>
                <option value="AUTO">Bóc tách từ file sao kê</option>
              </select>

              {/* Lọc ngân hàng cụ thể */}
              <select
                aria-label="Lọc theo ngân hàng"
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] truncate"
              >
                <option value="ALL">Tất cả tổ chức tín dụng</option>
                {filterBankOptions.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>

              {/* Lọc hạn thanh toán */}
              <select
                aria-label="Lọc theo ngày đến hạn"
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả kỳ hạn</option>
                <option value="7DAYS">Đến hạn trong 7 ngày</option>
                <option value="30DAYS">Đến hạn trong 30 ngày</option>
              </select>

              <button
                onClick={handleOpenCreateModal}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm nợ lẻ</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] min-h-[380px] overflow-y-auto">
            <table className="w-full min-w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-20 shadow-xs">
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  {renderSortHeader('contract_number', 'Số HĐ / Khế Ước', 'left')}
                  {renderSortHeader('bank_name', 'Tổ Chức Cấp Tín Dụng', 'left')}
                  {renderSortHeader('institution_type', 'Loại Tổ Chức & Nguồn', 'left')}
                  {renderSortHeader('loan_purpose', 'Mục Đích Khoản Vay', 'left')}
                  {renderSortHeader('original_principal_balance', 'Dư Nợ Gốc Ban Đầu', 'right')}
                  {renderSortHeader('total_repaid_principal', 'Đã Trả Gốc', 'right')}
                  {renderSortHeader('current_principal_balance', 'Dư Nợ Gốc Hiện Tại (Tính Lãi)', 'right')}
                  {renderSortHeader('interest_rate', 'Lãi Suất', 'center')}
                  {renderSortHeader('interest_payment_method', 'Hình Thức Trả Lãi', 'center')}
                  {renderSortHeader('calculated_interest_due', 'Lãi Cần Trả (TT14)', 'right')}
                  {renderSortHeader('disbursement_date', 'Ngày Giải Ngân', 'center')}
                  {renderSortHeader('maturity_date', 'Thời Hạn / Đáo Hạn', 'left')}
                  {renderSortHeader('next_principal_amount', 'Gốc Đến Hạn', 'right')}
                  {renderSortHeader('next_repayment_date', 'Ngày Trả Nợ', 'center')}
                  {renderSortHeader('dossier_files_count', 'Hồ Sơ Giải Ngân', 'center')}
                  {renderSortHeader('debt_group', 'Nhóm Nợ', 'center')}
                  <th className="py-3 px-3 text-center min-w-[80px] sticky right-0 bg-slate-100 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-slate-200">
                    Thao Tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="py-8 text-center text-slate-400">
                      Chưa có khoản vay hoặc khoản nợ lẻ nào phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                ) : (
                  paginatedLoans.map((loan) => {
                    const instType = loan.institution_type || 'BANK';
                    const hasDossier = (loan.dossier_files_count || 0) > 0;
                    return (
                      <tr key={loan.loan_id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-3 font-semibold text-indigo-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            {hasDossier ? (
                              <span
                                className="cursor-pointer"
                                title="Khoản vay ĐÃ CÓ hồ sơ/sao kê lưu trữ"
                                onClick={() => handleOpenEditModal(loan)}
                              >
                                <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0 hover:text-indigo-800" />
                              </span>
                            ) : (
                              <span
                                className="cursor-pointer"
                                title="Khoản vay CHƯA CÓ hồ sơ/sao kê lưu trữ"
                                onClick={() => handleOpenEditModal(loan)}
                              >
                                <File className="w-4 h-4 text-slate-400 flex-shrink-0 hover:text-slate-600" />
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 group">
                              <span>{loan.contract_number}</span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyContract(e, loan.contract_number)}
                                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-colors opacity-70 group-hover:opacity-100 focus:opacity-100"
                                title={copiedContract === loan.contract_number ? 'Đã sao chép!' : 'Sao chép số khế ước'}
                                aria-label={`Sao chép số khế ước ${loan.contract_number}`}
                              >
                                {copiedContract === loan.contract_number ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {loan.term && <span className="text-slate-400 font-normal text-xs">({loan.term})</span>}
                            </div>
                          </div>
                          {loan.note && (
                            <p className="text-[10px] text-slate-400 font-normal truncate max-w-[200px] pl-6 mt-0.5" title={loan.note}>
                              {loan.note}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 min-w-[220px] max-w-[340px]">
                          <div className="font-semibold text-slate-800 leading-snug">{loan.bank_name}</div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">{loan.bank_code}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            {/* Badge loại tổ chức */}
                            {instType === 'BANK' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                <Building2 className="w-2.5 h-2.5" />
                                Ngân hàng
                              </span>
                            )}
                            {instType === 'FINANCE_COMPANY' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <Wallet className="w-2.5 h-2.5" />
                                Cty Tài chính
                              </span>
                            )}
                            {instType === 'LEASING_COMPANY' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Briefcase className="w-2.5 h-2.5" />
                                Cho thuê TC
                              </span>
                            )}
                            {instType === 'OTHER' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <CreditCard className="w-2.5 h-2.5" />
                                Khác
                              </span>
                            )}

                            {/* Badge nguồn */}
                            {loan.is_manual ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Edit2 className="w-2.5 h-2.5" />
                                Nhập lẻ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <FileSpreadsheet className="w-2.5 h-2.5" />
                                Sao kê file
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 min-w-[200px] max-w-sm text-slate-600 leading-snug" title={loan.loan_purpose || ''}>
                          {loan.loan_purpose || 'Vay vốn phục vụ SXKD'}
                        </td>
                        {/* 1. Dư nợ gốc ban đầu (Cố định không đổi sau giải ngân) */}
                        <td className="py-3 px-3 text-right font-medium text-slate-700 whitespace-nowrap" title="Dư nợ gốc giải ngân ban đầu ghi nhận trên hợp đồng tín dụng/khế ước (Giá trị cố định không đổi)">
                          {Number(loan.original_principal_balance || loan.current_principal_balance).toLocaleString('vi-VN')} ₫
                        </td>

                        {/* 2. Đã trả gốc (Tổng nợ gốc đã trả từ sao kê) */}
                        <td className="py-3 px-3 text-right whitespace-nowrap" title="Tổng số tiền nợ gốc đã trả">
                          {Number(loan.total_repaid_principal || 0) > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              -{Number(loan.total_repaid_principal).toLocaleString('vi-VN')} ₫
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">-</span>
                          )}
                        </td>

                        {/* 3. Dư nợ gốc hiện tại (Mốc tính lãi = Gốc ban đầu - Đã trả gốc) */}
                        <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap" title="Dư nợ gốc hiện tại (Sau khi trừ nợ gốc đã trả - Mốc để tính tiền lãi theo thời gian)">
                          <div>
                            <span>{Number(loan.current_principal_balance).toLocaleString('vi-VN')} ₫</span>
                            {Number(loan.total_repaid_principal || 0) > 0 && Number(loan.original_principal_balance || 0) > 0 && (
                              <span className="block text-[10px] text-emerald-600 font-medium">
                                (Còn {((Number(loan.current_principal_balance) / Number(loan.original_principal_balance)) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-medium text-slate-700 whitespace-nowrap">
                          {Number(loan.interest_rate).toFixed(2)}%
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {loan.interest_payment_method === 'END_OF_TERM' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              Cuối kỳ
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                              title={`Trả lãi định kỳ ngày ${loan.monthly_interest_due_day || (loan.bank_code === 'CTG' ? 5 : 25)} hằng tháng`}
                            >
                              Hằng tháng (ngày {loan.monthly_interest_due_day || (loan.bank_code === 'CTG' ? 5 : 25)})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap" title="Số lãi cần trả tính theo Thông tư 14/2017/TT-NHNN (Cơ sở 365 ngày)">
                          {Number(loan.calculated_interest_due || 0).toLocaleString('vi-VN')} ₫
                        </td>
                        {/* Cột Ngày Giải Ngân */}
                        <td className="py-3 px-3 text-center text-slate-700 whitespace-nowrap font-mono text-[11px]">
                          {loan.disbursement_date || '-'}
                        </td>
                        {/* Cột Thời Hạn / Đáo Hạn */}
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {loan.maturity_date ? (
                            <span>{loan.maturity_date}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-slate-700 whitespace-nowrap">
                          {loan.next_principal_amount > 0
                            ? `${Number(loan.next_principal_amount).toLocaleString('vi-VN')} ₫`
                            : '-'}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-600 whitespace-nowrap">
                          {loan.next_repayment_date ? (
                            <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                              <Calendar className="w-3.5 h-3.5" />
                              {loan.next_repayment_date}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            {(loan.dossier_files_count || 0) > 0 ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors"
                                title={`${loan.dossier_files_count} chứng từ giải ngân đã lưu trữ. Bấm để xem và quản lý hồ sơ.`}
                                onClick={() => handleOpenDossierEntryModal(loan)}
                              >
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>{loan.dossier_files_count} chứng từ</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenDossierEntryModal(loan)}
                                className="text-slate-400 hover:text-indigo-600 text-xs hover:underline cursor-pointer"
                                title="Bấm để nạp hồ sơ giải ngân"
                              >
                                Chưa có hồ sơ
                              </button>
                            )}

                            {/* Cảnh báo thiếu hóa đơn hoặc thông báo đủ hóa đơn XML */}
                            {loan.invoice_reconciliation_status === 'DEFICIENT' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse cursor-pointer hover:bg-rose-200 transition-colors shadow-2xs"
                                title={`⚠️ Thiếu hóa đơn giải ngân! Tổng HĐ: ${formatVND(loan.total_invoices_amount)} < Dư nợ gốc: ${formatVND(loan.current_principal_balance)} (Còn thiếu ${formatVND(loan.invoice_shortage_amount)})`}
                                onClick={() => handleOpenDossierEntryModal(loan)}
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-600 flex-shrink-0" />
                                <span>Thiếu HĐ (-{formatVND(loan.invoice_shortage_amount)})</span>
                              </span>
                            )}
                            {loan.invoice_reconciliation_status === 'SUFFICIENT' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer hover:bg-emerald-200 transition-colors"
                                title={`✅ Đã đủ hóa đơn giải ngân: ${formatVND(loan.total_invoices_amount)} >= Dư nợ gốc: ${formatVND(loan.current_principal_balance)}`}
                                onClick={() => handleOpenDossierEntryModal(loan)}
                              >
                                <span>Đủ HĐ XML</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Nhóm {loan.debt_group}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-slate-100">
                          <button
                            onClick={() => handleOpenEditModal(loan)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-xs font-semibold shadow-2xs transition-all"
                            title="Chỉnh sửa thông tin khoản vay & Quản lý bộ hồ sơ giải ngân"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Thanh Phân Trang (Đảm bảo bảng chỉ dài đúng 1 trang) */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none">
            {/* Trái: Thống kê số lượng bản ghi hiển thị */}
            <div className="flex items-center gap-1.5">
              <span>Hiển thị</span>
              <span className="font-bold text-slate-900">
                {sortedLoans.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </span>
              <span>-</span>
              <span className="font-bold text-slate-900">
                {Math.min(sortedLoans.length, currentPage * pageSize)}
              </span>
              <span>trên tổng số</span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                {sortedLoans.length}
              </span>
              <span>khoản vay</span>
            </div>

            {/* Giữa: Lựa chọn số dòng mỗi trang */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                <option value={10}>10 dòng / trang (Chuẩn 1 trang)</option>
                <option value={15}>15 dòng / trang</option>
                <option value={20}>20 dòng / trang</option>
                <option value={50}>50 dòng / trang</option>
                <option value={9999}>Tất cả ({sortedLoans.length})</option>
              </select>
            </div>

            {/* Phải: Các nút chuyển trang */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1}
                className="p-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-slate-700 transition-colors shadow-2xs"
                title="Về trang đầu tiên"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-slate-700 transition-colors font-medium shadow-2xs"
                title="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>

              <div className="px-2 font-semibold text-slate-700">
                Trang <span className="text-indigo-600 font-bold">{currentPage}</span> / {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-slate-700 transition-colors font-medium shadow-2xs"
                title="Trang tiếp theo"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="p-1.5 border border-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-slate-700 transition-colors shadow-2xs"
                title="Đến trang cuối cùng"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Phân Bổ Ngân Hàng / Tổ Chức Tín Dụng */}
      {activeTab === 'banks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary?.by_bank.map((b) => (
            <div key={b.bank_code} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow ${b.bank_code === 'CTG'
                      ? 'bg-sky-600'
                      : b.bank_code === 'MBB' || b.bank_code === 'MB'
                        ? 'bg-indigo-600'
                        : b.bank_code.includes('LEASING') || b.bank_code === 'CHAILEASE' || b.bank_code === 'BSL'
                          ? 'bg-amber-600'
                          : b.bank_code.includes('CREDIT') || b.bank_code.includes('FIN')
                            ? 'bg-purple-600'
                            : 'bg-emerald-600'
                      }`}
                  >
                    {b.bank_code.length > 4 ? b.bank_code.substring(0, 3) : b.bank_code}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm truncate max-w-[200px]" title={b.bank_name}>
                      {b.bank_name}
                    </h3>
                    <p className="text-xs text-slate-500">{b.loans_count} khoản vay / nợ đang quản lý</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Lãi suất bình quân (WAIR):</span>
                <span className="text-sm font-bold text-indigo-600">
                  {Number(b.weighted_avg_interest_rate).toFixed(2)} %/năm
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Dư nợ gốc hiện tại</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{formatVND(b.total_principal_balance)}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Lãi cộng dồn / dự trả</div>
                  <div className="font-bold text-emerald-600 text-sm mt-0.5">
                    {formatVND(b.total_accrued_interest || b.upcoming_interest_due)}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Gốc đến hạn gần nhất</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{formatVND(b.upcoming_principal_due)}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Lãi phải trả gần nhất</div>
                  <div className="font-bold text-amber-600 text-xs mt-0.5">{formatVND(b.upcoming_interest_due)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Lịch Sử File Đã Nạp */}
      {activeTab === 'files' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  <SortableTh field="file_id" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    File ID
                  </SortableTh>
                  <SortableTh field="bank_code" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    Ngân Hàng
                  </SortableTh>
                  <SortableTh field="original_filename" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    Tên File Gốc
                  </SortableTh>
                  <SortableTh field="template_code" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    Mã Mẫu
                  </SortableTh>
                  <SortableTh field="statement_date" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    Ngày Số Liệu
                  </SortableTh>
                  <SortableTh field="total_principal_amount" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} align="right" className="py-3 px-3">
                    Tổng Dư Nợ
                  </SortableTh>
                  <SortableTh field="total_contracts_count" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} align="center" className="py-3 px-3">
                    Số Khoản Vay
                  </SortableTh>
                  <SortableTh field="reconciliation_status" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} align="center" className="py-3 px-3">
                    Đối Soát Cân Bằng
                  </SortableTh>
                  <SortableTh field="created_at" currentSortField={fileSortField} currentSortDirection={fileSortDirection} onSort={handleFileSort} className="py-3 px-3">
                    Ngày Tải Lên
                  </SortableTh>
                  <th className="py-3 px-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFiles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Chưa có file sao kê tín dụng nào được nạp vào hệ thống.
                    </td>
                  </tr>
                ) : (
                  sortedFiles.map((file) => (
                    <tr key={file.file_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-500">#{file.file_id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{file.bank_code}</td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={file.original_filename}>
                        {file.original_filename}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{file.template_code}</td>
                      <td className="py-2.5 px-3 text-slate-600">{file.statement_date || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {Number(file.total_principal_amount).toLocaleString('vi-VN')} ₫
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                        {file.total_contracts_count}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {file.reconciliation_status === 'BALANCED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Khớp 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Lệch số dư
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(file.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleDeleteFile(file.file_id)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          title="Xóa file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PHÂN TÍCH ĐA CHIỀU (PIVOT TABLE) CHO DANH MỤC KHOẢN VAY            */}
      {/* ========================================================================= */}
      {activeTab === 'pivot' && (
        <div className="space-y-5">
          {/* Top Card: Title, Subtitle, Quick Presets & Export */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                  <span>Ma Trận Xoay & Phân Tích Đa Chiều (Pivot Table)</span>
                  <span className="text-xs font-normal text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {pivotResult.loansCount} khoản vay đang khảo sát
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Khảo sát danh mục tín dụng linh hoạt theo 2 chiều (Dòng × Cột) kết hợp các chỉ số tài chính trọng yếu. Tự động liên kết với bộ lọc toàn cục ở phía trên.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPivotCSV}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  title="Xuất ma trận Pivot hiện tại ra file CSV tương thích Excel (UTF-8 BOM)"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất File CSV / Excel</span>
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mr-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Mẫu xem nhanh (Presets):</span>
                </span>
                {PIVOT_PRESETS.map((preset, idx) => {
                  const isActive =
                    pivotRowDim === preset.row &&
                    pivotColDim === preset.col &&
                    pivotMetric === preset.metric;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setPivotRowDim(preset.row);
                        setPivotColDim(preset.col);
                        setPivotMetric(preset.metric);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Controls Bar: Select Row Dim, Col Dim, Metric, Search */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Row Dimension */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  1. Chiều Dòng (Row Group)
                </label>
                <select
                  value={pivotRowDim}
                  onChange={(e) => setPivotRowDim(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                >
                  {PIVOT_ROW_DIMENSIONS.map((dim) => (
                    <option key={dim.id} value={dim.id}>
                      {dim.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Column Dimension */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  2. Chiều Cột (Column Pivot)
                </label>
                <select
                  value={pivotColDim}
                  onChange={(e) => setPivotColDim(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                >
                  {PIVOT_COL_DIMENSIONS.map((dim) => (
                    <option key={dim.id} value={dim.id}>
                      {dim.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aggregation Metric */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  3. Chỉ Số Tổng Hợp (Metric)
                </label>
                <select
                  value={pivotMetric}
                  onChange={(e) => setPivotMetric(e.target.value)}
                  className="w-full text-xs bg-indigo-50 border border-indigo-300 rounded-lg px-3 py-2 text-indigo-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                >
                  {PIVOT_METRIC_DEFS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search in Pivot */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  4. Lọc Nhanh Nội Bộ
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Lọc dòng / cột..."
                    value={pivotSearch}
                    onChange={(e) => setPivotSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  {pivotSearch && (
                    <button
                      onClick={() => setPivotSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sub-KPI Badges for the filtered pivot dataset */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span>Tổng Dư Nợ Gốc</span>
                <DollarSign className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-base font-bold text-slate-900 mt-1">
                {formatVND(pivotResult.kpis.totalPrincipal)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Dư nợ theo bộ lọc hiện tại</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span>Lãi Dự Trả TT14</span>
                <Percent className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-base font-bold text-emerald-600 mt-1">
                {formatVND(pivotResult.kpis.totalInterest)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Lãi tích lũy đến hạn</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span>Lãi Suất BQ (WAIR)</span>
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-base font-bold text-purple-600 mt-1">
                {pivotResult.kpis.avgWair.toFixed(2)} %/năm
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Bình quân gia quyền dư nợ</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span>Số Khoản Vay / Khế Ước</span>
                <Table className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-base font-bold text-indigo-600 mt-1">
                {pivotResult.kpis.totalLoans.toLocaleString('vi-VN')} HĐ
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Khoản nợ nằm trong ma trận</div>
            </div>
          </div>

          {/* Pivot Table Main View */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider">
                    {/* Top-left cell: Row label \ Col label */}
                    <th className="py-3 px-4 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[220px]">
                      <div className="flex items-center gap-1.5 text-indigo-900">
                        <span className="font-bold">{pivotResult.rowDef.label}</span>
                        {pivotResult.is2D && pivotResult.colDef && (
                          <>
                            <span className="text-slate-400">/</span>
                            <span className="text-slate-500 text-[11px] font-normal">
                              {pivotResult.colDef.label}
                            </span>
                          </>
                        )}
                      </div>
                    </th>

                    {/* Column Headers */}
                    {pivotResult.is2D ? (
                      <>
                        {pivotResult.sortedColKeys.map((cKey) => (
                          <th
                            key={cKey}
                            className="py-3 px-3 text-right whitespace-nowrap min-w-[130px] border-r border-slate-200"
                          >
                            <div className="text-slate-800 font-bold">{cKey}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {pivotResult.colCounts[cKey] || 0} HĐ
                            </div>
                          </th>
                        ))}
                        {/* Grand Total Column Header */}
                        <th className="py-3 px-4 text-right whitespace-nowrap min-w-[140px] bg-indigo-50/70 text-indigo-950 font-bold">
                          <div>Tổng Cộng</div>
                          <div className="text-[10px] text-indigo-600 font-normal">
                            {pivotResult.loansCount} HĐ
                          </div>
                        </th>
                      </>
                    ) : (
                      <th className="py-3 px-4 text-right whitespace-nowrap min-w-[180px] bg-indigo-50/70 text-indigo-950 font-bold">
                        <div>{pivotResult.metricDef.label}</div>
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {pivotResult.sortedRowKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={pivotResult.is2D ? pivotResult.sortedColKeys.length + 2 : 2}
                        className="py-12 text-center text-slate-400"
                      >
                        Không có dữ liệu thỏa mãn điều kiện lọc. Vui lòng thử nới lỏng bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    pivotResult.sortedRowKeys.map((rKey) => {
                      const rowTotal = pivotResult.rowTotals[rKey] || 0;
                      const rowCount = pivotResult.rowCounts[rKey] || 0;

                      return (
                        <tr key={rKey} className="hover:bg-slate-50/80 transition-colors group">
                          {/* Row Header cell */}
                          <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-slate-50/80 z-10 border-r border-slate-200 font-medium text-slate-800">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate max-w-[260px]" title={rKey}>
                                {rKey}
                              </span>
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                {rowCount}
                              </span>
                            </div>
                          </td>

                          {/* 2D Data Cells */}
                          {pivotResult.is2D ? (
                            <>
                              {pivotResult.sortedColKeys.map((cKey) => {
                                const val = pivotResult.matrix[rKey]?.[cKey] || 0;
                                const count = pivotResult.matrixCounts[rKey]?.[cKey] || 0;
                                const heatRatio =
                                  pivotResult.grandMax > 0 && val > 0
                                    ? Math.min(100, Math.round((val / pivotResult.grandMax) * 100))
                                    : 0;

                                return (
                                  <td
                                    key={cKey}
                                    className="py-2 px-3 text-right whitespace-nowrap border-r border-slate-100 relative group/cell"
                                  >
                                    {val > 0 ? (
                                      <div>
                                        <div className="font-semibold text-slate-800">
                                          {pivotResult.metricDef.format(val)}
                                        </div>
                                        {pivotResult.metricDef.id !== 'count' && (
                                          <div className="text-[10px] text-slate-400">
                                            {count} HĐ
                                          </div>
                                        )}
                                        {/* Subtle heat bar */}
                                        <div className="w-full bg-slate-100 h-1 rounded-full mt-1 overflow-hidden">
                                          <div
                                            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                                            style={{ width: `${heatRatio}%` }}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Row Total Cell */}
                              <td className="py-2.5 px-4 text-right whitespace-nowrap bg-indigo-50/30 font-bold text-indigo-900 border-l border-indigo-100">
                                <div>{pivotResult.metricDef.format(rowTotal)}</div>
                                {pivotResult.metricDef.id !== 'count' && (
                                  <div className="text-[10px] text-indigo-500 font-normal">
                                    {rowCount} HĐ
                                  </div>
                                )}
                              </td>
                            </>
                          ) : (
                            /* 1D Data Cell */
                            <td className="py-2.5 px-4 text-right whitespace-nowrap font-bold text-slate-900">
                              <div className="flex items-center justify-end gap-3">
                                <span>
                                  {pivotResult.metricDef.format(
                                    pivotResult.matrix[rKey]?.['__SINGLE__'] || 0
                                  )}
                                </span>
                                {pivotResult.grandTotal > 0 && (
                                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {(
                                      ((pivotResult.matrix[rKey]?.['__SINGLE__'] || 0) /
                                        pivotResult.grandTotal) *
                                      100
                                    ).toFixed(1)}
                                    %
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Grand Total Row */}
                {pivotResult.sortedRowKeys.length > 0 && (
                  <tfoot>
                    <tr className="bg-indigo-50/70 border-t-2 border-indigo-200 font-bold text-slate-900 text-xs">
                      <td className="py-3 px-4 sticky left-0 bg-indigo-50/90 z-10 border-r border-indigo-200 text-indigo-950">
                        <div className="flex items-center justify-between">
                          <span>TỔNG CỘNG TOÀN BỘ</span>
                          <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-100 px-2 py-0.5 rounded-full">
                            {pivotResult.loansCount} HĐ
                          </span>
                        </div>
                      </td>

                      {pivotResult.is2D ? (
                        <>
                          {pivotResult.sortedColKeys.map((cKey) => (
                            <td
                              key={cKey}
                              className="py-3 px-3 text-right whitespace-nowrap border-r border-indigo-100 text-slate-900"
                            >
                              <div>
                                {pivotResult.metricDef.format(pivotResult.colTotals[cKey] || 0)}
                              </div>
                              {pivotResult.metricDef.id !== 'count' && (
                                <div className="text-[10px] text-slate-500 font-normal">
                                  {pivotResult.colCounts[cKey] || 0} HĐ
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right whitespace-nowrap bg-indigo-100/80 text-indigo-950 font-black text-sm">
                            <div>{pivotResult.metricDef.format(pivotResult.grandTotal)}</div>
                            {pivotResult.metricDef.id !== 'count' && (
                              <div className="text-[10px] text-indigo-700 font-normal">
                                {pivotResult.loansCount} HĐ
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                        <td className="py-3 px-4 text-right whitespace-nowrap text-indigo-950 font-black text-sm">
                          {pivotResult.metricDef.format(pivotResult.grandTotal)}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NHẬP BỘ HỒ SƠ CHO CÁC KHOẢN VAY ĐÃ NHẬP (CẤU TRÚC FORM CHUẨN)       */}
      {/* ========================================================================= */}
      {isDossierEntryModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <span>Nhập Bộ Hồ Sơ Giải Ngân Cho Khoản Vay</span>
                    <span className="text-xs font-normal text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-400/30">
                      Object Storage S3
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Đính kèm tài liệu chứng từ phân loại theo 5 danh mục nghiệp vụ cho các khoản vay đã có trong hệ thống
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDossierEntryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitEntryDossier} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Alert message */}
              {entryModalMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${entryModalMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                >
                  {entryModalMsg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span className="font-medium">{entryModalMsg.text}</span>
                </div>
              )}

              {/* 1. KHỐI CHỌN KHOẢN VAY / KHẾ ƯỚC */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-indigo-600" />
                    1. Chọn Khoản Vay / Khế Ước Cần Đính Kèm Hồ Sơ
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    Tổng số {loans.length} khoản vay đang theo dõi
                  </span>
                </div>

                <select
                  value={entrySelectedLoanId || ''}
                  onChange={(e) => handleSelectEntryLoan(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  {loans.map((l) => (
                    <option key={l.loan_id} value={l.loan_id}>
                      [{l.bank_code}] HĐ: {l.contract_number} — Dư nợ: {Number(l.current_principal_balance).toLocaleString('vi-VN')} ₫ — {l.bank_name} {l.term ? `(${l.term})` : ''}
                    </option>
                  ))}
                </select>

                {/* Card tóm tắt khoản vay được chọn */}
                {(() => {
                  const targetLoan = loans.find((l) => l.loan_id === entrySelectedLoanId);
                  if (!targetLoan) return null;
                  return (
                    <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-purple-50/50 rounded-xl border border-indigo-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Tổ chức cấp tín dụng</span>
                        <span className="font-bold text-indigo-900 truncate block" title={targetLoan.bank_name}>
                          {targetLoan.bank_code} - {targetLoan.bank_name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Loại: {targetLoan.institution_type === 'FINANCE_COMPANY' ? 'Công ty tài chính' : targetLoan.institution_type === 'LEASING_COMPANY' ? 'Thuê tài chính' : 'Ngân hàng TM'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Số HĐ / Khế ước</span>
                        <span className="font-bold text-slate-900 font-mono block">
                          {targetLoan.contract_number}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Thời hạn: {targetLoan.term || 'Chưa rõ'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Dư nợ gốc hiện tại</span>
                        <span className="font-bold text-indigo-700 block">
                          {formatVND(targetLoan.current_principal_balance)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Lãi suất: {targetLoan.interest_rate}%/năm
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Ngày đáo hạn</span>
                        <span className="font-semibold text-slate-800 block">
                          {targetLoan.maturity_date || 'Không có'}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700">
                          Đã có: {entryDossierDocs.length} tài liệu trong CSDL
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 2. KHỐI BỘ HỒ SƠ GIẢI NGÂN PHÂN THEO LOẠI CHỨNG TỪ (CẤU TRÚC FORM NHẬP LẺ) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        2. Bộ Hồ Sơ Giải Ngân (Phân Chia Theo Loại Chứng Từ)
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Chọn loại chứng từ cần đính kèm. Tệp tải lên sẽ tự động lưu trữ tại MinIO/Object Storage.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {entryStagedFiles.length + entryDossierDocs.length} tệp trong hồ sơ
                  </span>
                </div>

                {/* Thanh Tab chọn Loại chứng từ */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                  {dossierCategories.map((cat) => {
                    const stagedCount = entryStagedFiles.filter(
                      (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                    ).length;
                    const existingCount = entryDossierDocs.filter(
                      (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                    ).length;
                    const totalCount = stagedCount + existingCount;
                    const isActive = entryCategoryTab === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setEntryCategoryTab(cat.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                      >
                        {cat.key === 'CONTRACT' && <FileText className="w-3.5 h-3.5" />}
                        {cat.key === 'DEBT_NOTE' && <Briefcase className="w-3.5 h-3.5" />}
                        {cat.key === 'INVOICE' && <Receipt className="w-3.5 h-3.5" />}
                        {cat.key === 'COLLATERAL' && <Shield className="w-3.5 h-3.5" />}
                        {cat.key === 'OTHER' && <FolderArchive className="w-3.5 h-3.5" />}
                        {!['CONTRACT', 'DEBT_NOTE', 'INVOICE', 'COLLATERAL', 'OTHER'].includes(cat.key) && (
                          <Tag className="w-3.5 h-3.5 text-purple-300" />
                        )}
                        <span>{cat.shortLabel}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                              ? 'bg-white/20 text-white'
                              : totalCount > 0
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                        >
                          {totalCount}
                        </span>
                        {cat.isCustom && totalCount === 0 && (
                          <span
                            onClick={(e) => handleDeleteCustomCategory(cat.key, e)}
                            className="ml-0.5 text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded hover:bg-slate-200"
                            title="Xóa loại hồ sơ tùy chỉnh này"
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setEntryCategoryTab('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${entryCategoryTab === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Tất cả</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${entryCategoryTab === 'ALL'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {entryStagedFiles.length + entryDossierDocs.length}
                    </span>
                  </button>

                  {/* Nút bổ sung loại hồ sơ mới */}
                  <button
                    type="button"
                    onClick={() => {
                      setAddCatContext('entryModal');
                      setIsAddCatModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 border border-dashed border-indigo-300 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 hover:border-indigo-400 cursor-pointer shadow-2xs ml-auto"
                    title="Bổ sung thêm loại hồ sơ / chứng từ mới"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>+ Thêm loại hồ sơ</span>
                  </button>
                </div>

                {/* Nội dung Tab cụ thể */}
                {entryCategoryTab !== 'ALL' && (() => {
                  const targetLoan = loans.find((l) => l.loan_id === entrySelectedLoanId);
                  const currentCategory = dossierCategories.find((c) => c.key === entryCategoryTab) || dossierCategories[0];
                  const catStagedFiles = entryStagedFiles.filter(
                    (sf) => mapDocTypeToCategoryKey(sf.document_type) === entryCategoryTab
                  );
                  const catExistingDocs = entryDossierDocs.filter(
                    (d) => mapDocTypeToCategoryKey(d.document_type) === entryCategoryTab
                  );

                  return (
                    <div className="space-y-3">
                      {/* Bảng đối soát hóa đơn XML & Dư nợ gốc (nếu là tab Hóa đơn & UNC) */}
                      {entryCategoryTab === 'INVOICE' &&
                        renderInvoiceReconciliationCard(
                          targetLoan?.current_principal_balance || 0,
                          catExistingDocs,
                          catStagedFiles
                        )}

                      {/* Banner thông tin loại chứng từ */}
                      <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0 mt-0.5">
                          {currentCategory.key === 'CONTRACT' && <FileText className="w-4 h-4" />}
                          {currentCategory.key === 'DEBT_NOTE' && <Briefcase className="w-4 h-4" />}
                          {currentCategory.key === 'INVOICE' && <Receipt className="w-4 h-4" />}
                          {currentCategory.key === 'COLLATERAL' && <Shield className="w-4 h-4" />}
                          {currentCategory.key === 'OTHER' && <FolderArchive className="w-4 h-4" />}
                          {!['CONTRACT', 'DEBT_NOTE', 'INVOICE', 'COLLATERAL', 'OTHER'].includes(currentCategory.key) && (
                            <Tag className="w-4 h-4 text-purple-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{currentCategory.label}</span>
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200">
                              Mục: {currentCategory.badgeLabel}
                            </span>
                            {currentCategory.isCustom && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.2 rounded-full border border-purple-200">
                                Tự định nghĩa
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {currentCategory.description}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 italic">
                            Ví dụ tệp: {currentCategory.examples}
                          </p>
                        </div>
                      </div>

                      {/* Khung tải lên chuyên biệt cho loại chứng từ này */}
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropEntryStagedFiles(e, entryCategoryTab)}
                      >
                        <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-indigo-50/40 transition-all group">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.xml,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar"
                            onChange={(e) => handleAddEntryStagedFiles(e, entryCategoryTab)}
                            className="hidden"
                          />
                          <div className="w-8 h-8 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 mb-1.5 transition-colors">
                            <Upload className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-semibold text-slate-800 text-center">
                            Bấm để chọn tệp hoặc kéo thả {currentCategory.shortLabel} vào đây
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 text-center">
                            Tệp tải vào mục này sẽ tự động gán loại "{currentCategory.badgeLabel}" (Hỗ trợ PDF, XML hóa đơn... Tối đa 50MB/file)
                          </p>
                        </label>
                      </div>

                      {/* Danh sách tệp chuẩn bị nạp (staged) của mục này */}
                      {catStagedFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Tệp chuẩn bị lưu vào mục này ({catStagedFiles.length}):</span>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {catStagedFiles.map((sf) => (
                              <div
                                key={sf.id}
                                className="p-2.5 bg-white rounded-lg border border-indigo-200 shadow-2xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <span className="font-semibold text-xs text-slate-900 truncate max-w-xs" title={sf.file.name}>
                                      {sf.file.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      ({(sf.file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEntryStagedFile(sf.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Bỏ tệp này"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {(sf.invoice_number || sf.invoice_total_amount) && (
                                  <div className="flex items-center gap-2 text-[11px] bg-indigo-50/80 p-1.5 rounded-md border border-indigo-100">
                                    {sf.invoice_number && (
                                      <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                                        HĐ #{sf.invoice_number}
                                      </span>
                                    )}
                                    {sf.invoice_total_amount && (
                                      <span className="font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                        Tiền HĐ: {formatVND(sf.invoice_total_amount)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Chuyển sang loại chứng từ khác:
                                    </label>
                                    <select
                                      value={sf.document_type}
                                      onChange={(e) => handleUpdateEntryStagedType(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      {dossierCategories.map((c) => (
                                        <option key={c.key} value={c.key}>
                                          {c.shortLabel}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Ghi chú chứng từ (tùy chọn):
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="VD: Số HĐ, ngày ký, số UNC..."
                                      value={sf.description}
                                      onChange={(e) => handleUpdateEntryStagedDesc(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Danh sách tệp đã lưu trong CSDL của mục này */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-200">
                        <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                          <span>Tài liệu đã lưu trong mục này ({catExistingDocs.length}):</span>
                          {isEntryDocsLoading && (
                            <span className="text-slate-400 text-[11px] flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Đang đồng bộ...
                            </span>
                          )}
                        </div>
                        {catExistingDocs.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center">
                            Chưa có tài liệu nào thuộc danh mục này trong CSDL.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {catExistingDocs.map((doc) => (
                              <div
                                key={doc.document_id}
                                className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-2xs"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-900 truncate max-w-xs block" title={doc.file_name}>
                                      {doc.file_name}
                                    </span>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                                      <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                                      <span>•</span>
                                      <span>{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>
                                      {doc.invoice_number && (
                                        <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                          Số HĐ: {doc.invoice_number}
                                        </span>
                                      )}
                                      {doc.invoice_series && (
                                        <span className="font-medium text-slate-700 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                                          Ký hiệu: {doc.invoice_series}
                                        </span>
                                      )}
                                      {doc.invoice_issue_date && (
                                        <span className="text-slate-500">
                                          Ngày: {new Date(doc.invoice_issue_date).toLocaleDateString('vi-VN')}
                                        </span>
                                      )}
                                      {doc.invoice_total_amount && (
                                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                          {formatVND(Number(doc.invoice_total_amount))}
                                        </span>
                                      )}
                                      {doc.verification_status && doc.verification_status !== 'UNVERIFIED' && (
                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                          doc.verification_status === 'VERIFIED_MATCH'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}>
                                          {doc.verification_status === 'VERIFIED_MATCH' ? 'Khớp HĐĐT' : 'Chưa đủ'}
                                        </span>
                                      )}
                                      {doc.description && (
                                        <>
                                          <span>•</span>
                                          <span className="text-slate-600 italic truncate max-w-[150px]" title={doc.description}>
                                            {doc.description}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadDossierDoc(doc)}
                                    className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                    title="Tải xuống tài liệu"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEntrySavedDoc(doc.document_id)}
                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                    title="Xóa tài liệu khỏi hồ sơ"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Nội dung Tab TẤT CẢ (Tổng hợp bảng danh mục) */}
                {entryCategoryTab === 'ALL' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {dossierCategories.map((cat) => {
                        const sCount = entryStagedFiles.filter(
                          (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                        ).length;
                        const eCount = entryDossierDocs.filter(
                          (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                        ).length;
                        const total = sCount + eCount;
                        return (
                          <div
                            key={cat.key}
                            onClick={() => setEntryCategoryTab(cat.key)}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-2xs cursor-pointer transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800 truncate">{cat.shortLabel}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${total > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                  }`}
                              >
                                {total} tệp
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{cat.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Danh sách hợp nhất tất cả tệp */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        <span>Tổng hợp toàn bộ tài liệu hồ sơ ({entryStagedFiles.length + entryDossierDocs.length}):</span>
                        {entryStagedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEntryStagedFiles([])}
                            className="text-[11px] text-rose-500 hover:underline"
                          >
                            Xóa tất cả {entryStagedFiles.length} tệp chuẩn bị nạp
                          </button>
                        )}
                      </div>

                      {entryStagedFiles.length === 0 && entryDossierDocs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có tài liệu nào trong bộ hồ sơ. Vui lòng chọn một danh mục chứng từ ở trên để tải tệp.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {/* Staged files */}
                          {entryStagedFiles.map((sf) => (
                            <div
                              key={sf.id}
                              className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-200 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{sf.file.name}</span>
                                {renderDossierBadge(sf.document_type, dossierCategories)}
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Chờ lưu
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveEntryStagedFile(sf.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {/* Saved docs */}
                          {entryDossierDocs.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{doc.file_name}</span>
                                {renderDossierBadge(doc.document_type, dossierCategories)}
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Đã lưu
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDossierDoc(doc)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 rounded"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntrySavedDoc(doc.document_id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. KHỐI GHI CHÚ ĐỢT NỘP HỒ SƠ */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  3. Ghi Chú Đợt Nhập Hồ Sơ (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm về đợt bổ sung hồ sơ chứng từ này (VD: Bổ sung hóa đơn than đợt 2 theo yêu cầu VietinBank...)"
                  value={entryBatchNote}
                  onChange={(e) => setEntryBatchNote(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsDossierEntryModalOpen(false)}
                  disabled={isEntrySubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isEntrySubmitting || entryStagedFiles.length === 0}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center space-x-1.5 ${entryStagedFiles.length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                >
                  {isEntrySubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu & tải lên {entryStagedFiles.length} tệp...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>
                        {entryStagedFiles.length > 0
                          ? `Lưu & Tải Lên ${entryStagedFiles.length} Tệp Hồ Sơ Vào Object Storage`
                          : 'Chọn Tệp Để Lưu'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL FORM: NHẬP LẺ & CHỈNH SỬA KHOẢN VAY / NỢ TÍN DỤNG                   */}
      {/* ========================================================================= */}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  {editingLoan ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {editingLoan ? `Chỉnh Sửa Khoản Vay #${editingLoan.contract_number}` : 'Nhập Lẻ Khoản Vay / Nợ Tín Dụng'}
                  </h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Hỗ trợ nhập nợ ngân hàng, công ty tài chính, thuê tài chính ngoài các file sao kê tự động
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Scrollable Form */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. KHỐI TỔ CHỨC CẤP TÍN DỤNG */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    1. Đơn Vị Cấp Tín Dụng / Cho Vay / Thuê Tài Chính
                  </label>
                  <span className="text-[11px] text-slate-500">Chọn nhanh hoặc tự nhập</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Danh sách đơn vị gợi ý <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formOrgPreset}
                      onChange={(e) => handleOrgPresetChange(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <optgroup label="🏦 Ngân Hàng Thương Mại">
                        {organizations.filter((o) => o.type === 'BANK').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🏢 Công Ty Tài Chính">
                        {organizations.filter((o) => o.type === 'FINANCE_COMPANY').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🚜 Công Ty Cho Thuê Tài Chính (Leasing)">
                        {organizations.filter((o) => o.type === 'LEASING_COMPANY').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      {organizations.some((o) => o.type === 'OTHER' || !['BANK', 'FINANCE_COMPANY', 'LEASING_COMPANY'].includes(o.type)) && (
                        <optgroup label="🌐 Tổ Chức Tín Dụng / Quỹ / Đối Tác Đã Nhập">
                          {organizations
                            .filter((o) => o.type === 'OTHER' || !['BANK', 'FINANCE_COMPANY', 'LEASING_COMPANY'].includes(o.type))
                            .map((o) => (
                              <option key={o.code} value={o.code}>
                                {o.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      <option value="CUSTOM">➕ Tổ chức / Đối tác khác (Tự nhập tên và mã mới)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phân loại tổ chức <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.institution_type}
                      onChange={(e) =>
                        setFormData({ ...formData, institution_type: e.target.value as InstitutionType })
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="BANK">Ngân hàng thương mại (Commercial Bank)</option>
                      <option value="FINANCE_COMPANY">Công ty tài chính (Finance Company)</option>
                      <option value="LEASING_COMPANY">Công ty cho thuê tài chính (Leasing Company)</option>
                      <option value="OTHER">Tổ chức tín dụng khác (Other)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mã viết tắt (Bank/Org Code) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: CTG, FE_CREDIT, CHAILEASE..."
                      value={formData.bank_code}
                      onChange={(e) => setFormData({ ...formData, bank_code: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tên đầy đủ của đơn vị <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Ngân hàng TMCP..., Công ty Tài chính..."
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. KHỐI THÔNG TIN HỢP ĐỒNG & PHÁP LÝ */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  2. Thông Tin Hợp Đồng & Khế Ước
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Số HĐ / Số Khế Ước LD <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 108003668812, HDTD-2026/01..."
                      value={formData.contract_number}
                      onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Đơn vị vay / Bên thuê <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Tên công ty hoặc người vay"
                      value={formData.borrower_name}
                      onChange={(e) => setFormData({ ...formData, borrower_name: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mã CIF / Mã khách hàng
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 80145293 (tùy chọn)"
                      value={formData.cif_number}
                      onChange={(e) => setFormData({ ...formData, cif_number: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Loại khoản vay / Nợ
                    </label>
                    <select
                      value={formData.loan_type}
                      onChange={(e) => setFormData({ ...formData, loan_type: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="SHORT_TERM">Vay ngắn hạn (&lt; 1 năm)</option>
                      <option value="MEDIUM_TERM">Vay trung hạn (1 - 5 năm)</option>
                      <option value="LONG_TERM">Vay dài hạn (&gt; 5 năm)</option>
                      <option value="FINANCIAL_LEASE">Thuê tài chính (Financial Lease)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phân loại Nhóm Nợ
                    </label>
                    <select
                      value={formData.debt_group}
                      onChange={(e) => setFormData({ ...formData, debt_group: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="1">Nhóm 1 - Nợ đủ tiêu chuẩn</option>
                      <option value="2">Nhóm 2 - Nợ cần chú ý</option>
                      <option value="3">Nhóm 3 - Nợ dưới tiêu chuẩn</option>
                      <option value="4">Nhóm 4 - Nợ nghi ngờ</option>
                      <option value="5">Nhóm 5 - Nợ có khả năng mất vốn</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mục đích vay / Thuê tài sản
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Thanh toán tiền hàng, thuê xe bồn..."
                      value={formData.loan_purpose}
                      onChange={(e) => setFormData({ ...formData, loan_purpose: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. KHỐI SỐ DƯ GỐC & LÃI SUẤT */}
              <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3">
                <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  3. Số Dư Nợ Gốc & Lãi Suất
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" title="Số tiền giải ngân ban đầu ghi nhận trên Hợp đồng / Khế ước - Giá trị cố định không đổi">
                      Dư Nợ Gốc Ban Đầu (VND) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.original_principal_balance || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData((prev) => ({
                          ...prev,
                          original_principal_balance: val,
                          current_principal_balance:
                            !editingLoan && (prev.current_principal_balance === 0 || prev.current_principal_balance === prev.original_principal_balance)
                              ? val
                              : prev.current_principal_balance,
                        }));
                      }}
                      placeholder="VD: 5000000000"
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      {formatVND(formData.original_principal_balance)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" title="Dư nợ gốc còn lại sau khi trừ tiền nợ gốc đã trả - Đây là mốc để tính tiền lãi theo thời gian">
                      Dư Nợ Gốc Hiện Tại (VND) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.current_principal_balance || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          current_principal_balance: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-indigo-700 font-medium mt-1">
                      {formatVND(formData.current_principal_balance)}
                      {formData.original_principal_balance > formData.current_principal_balance && (
                        <span className="text-emerald-600 block text-[10px]">
                          (Đã trả: {formatVND(formData.original_principal_balance - formData.current_principal_balance)})
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lãi Suất (%/năm) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.interest_rate}
                      onChange={(e) =>
                        setFormData({ ...formData, interest_rate: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Lãi suất hợp đồng hiện hành</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700" title="Lãi cộng dồn tự động tính bằng hệ thống theo Thông tư 14/2017/TT-NHNN, không yêu cầu người dùng nhập">
                        Lãi Cộng Dồn / Dự Trả (VND)
                      </label>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Hệ thống tự tính
                      </span>
                    </div>
                    <div
                      className="w-full text-sm font-bold bg-slate-100/90 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 flex items-center justify-between cursor-not-allowed select-none"
                      title="Lãi cộng dồn được hệ thống tính tự động, không yêu cầu người dùng điền"
                    >
                      <span>
                        {formatVND(
                          computeInterestPreview(
                            formData.current_principal_balance,
                            formData.interest_rate,
                            formData.interest_payment_method,
                            formData.monthly_interest_due_day,
                            formData.disbursement_date,
                            formData.maturity_date,
                            formData.bank_code
                          ) || formData.accrued_interest || 0
                        )}
                      </span>
                      <Calculator className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Căn cứ TT 14/2017/TT-NHNN (Actual/365)
                    </p>
                  </div>
                </div>
              </div>

              {/* 3B. KHỐI HÌNH THỨC TRẢ LÃI & TÍNH LÃI THEO LUẬT ĐỊNH (THÔNG TƯ 14/2017/TT-NHNN) */}
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-3">
                <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-emerald-600" />
                  Phương Thức Trả Lãi & Tính Số Lãi Phải Trả (Thông tư 14/2017/TT-NHNN)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hình Thức Trả Lãi <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.interest_payment_method}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          interest_payment_method: e.target.value as InterestPaymentMethod,
                        })
                      }
                      className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="MONTHLY">Hằng tháng (Định kỳ hàng tháng)</option>
                      <option value="END_OF_TERM">Cuối kỳ (Trả toàn bộ khi đáo hạn)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formData.interest_payment_method === 'MONTHLY'
                        ? 'Lãi thanh toán định kỳ từng tháng theo ngày chốt'
                        : 'Lãi thanh toán một lần cùng tiền gốc khi khoản vay đáo hạn'}
                    </p>
                  </div>

                  {formData.interest_payment_method === 'MONTHLY' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ngày Trả Lãi Hằng Tháng (1 - 31) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.monthly_interest_due_day ?? (formData.bank_code === 'CTG' ? 5 : 25)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            monthly_interest_due_day: parseInt(e.target.value) || (formData.bank_code === 'CTG' ? 5 : 25),
                          })
                        }
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ví dụ: Ngày {formData.monthly_interest_due_day ?? (formData.bank_code === 'CTG' ? 5 : 25)} hằng tháng
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Ngày Trả Lãi
                      </label>
                      <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 italic">
                        Thanh toán toàn bộ vào ngày đáo hạn ({formData.maturity_date || 'Chưa chọn'})
                      </div>
                    </div>
                  )}
                </div>

                {/* Live calculation banner according to circular 14 */}
                <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">
                      Số lãi cần trả tính theo TT 14/2017/TT-NHNN ({formData.interest_payment_method === 'MONTHLY' ? 'Kỳ tháng này' : 'Toàn kỳ hạn'}):
                    </span>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatVND(
                        computeInterestPreview(
                          formData.current_principal_balance,
                          formData.interest_rate,
                          formData.interest_payment_method,
                          formData.monthly_interest_due_day,
                          formData.disbursement_date,
                          formData.maturity_date,
                          formData.bank_code
                        )
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Căn cứ: Số dư thực tế × Lãi suất năm × Số ngày tính lãi (Actual) / 365 ngày (Tính ngày đầu, bỏ ngày cuối).
                  </div>
                </div>
              </div>

              {/* 4. KHỐI THỜI HẠN & NGHĨA VỤ TRẢ NỢ */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  4. Thời Hạn & Lịch Trả Nợ Kỳ Tới
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Giải Ngân / Bắt Đầu
                    </label>
                    <input
                      type="date"
                      value={formData.disbursement_date}
                      onChange={(e) => setFormData({ ...formData, disbursement_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Đáo Hạn Hợp Đồng
                    </label>
                    <input
                      type="date"
                      value={formData.maturity_date}
                      onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Kỳ Hạn (Term)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 3M, 6M, 12M, 36 tháng..."
                      value={formData.term}
                      onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Thu Nợ / Trả Nợ Kế Tiếp
                    </label>
                    <input
                      type="date"
                      value={formData.next_repayment_date}
                      onChange={(e) => setFormData({ ...formData, next_repayment_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Gốc Đến Hạn Kỳ Tới (VND)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.next_principal_amount || ''}
                      onChange={(e) =>
                        handlePrincipalInterestChange('next_principal_amount', parseFloat(e.target.value) || 0)
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{formatVND(formData.next_principal_amount)}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Lãi Đến Hạn Kỳ Tới (VND)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.next_interest_amount || ''}
                      onChange={(e) =>
                        handlePrincipalInterestChange('next_interest_amount', parseFloat(e.target.value) || 0)
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{formatVND(formData.next_interest_amount)}</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-900">
                      Tổng Nghĩa Vụ Phải Trả Kỳ Tới:
                    </div>
                    <div className="text-[11px] text-amber-700">
                      Tự động tính = Gốc đến hạn ({formatVND(formData.next_principal_amount)}) + Lãi đến hạn ({formatVND(formData.next_interest_amount)})
                    </div>
                  </div>
                  <div className="text-base font-bold text-amber-900">
                    {formatVND(formData.total_repayment_amount)}
                  </div>
                </div>
              </div>

              {/* 5. KHỐI BỘ HỒ SƠ GIẢI NGÂN PHÂN THEO LOẠI CHỨNG TỪ (LƯU TRỮ OBJECT STORAGE) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        5. Bộ Hồ Sơ Giải Ngân (Phân Chia Theo Loại Chứng Từ)
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Phân tách rành mạch theo 5 loại chứng từ ngân hàng. Tệp tải lên sẽ tự động lưu vào MinIO/Object Storage.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {stagedFiles.length + editModalDocs.length} tệp đính kèm
                  </span>
                </div>

                {/* Thanh Tab chọn Loại chứng từ */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                  {dossierCategories.map((cat) => {
                    const stagedCount = stagedFiles.filter(
                      (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                    ).length;
                    const existingCount = editModalDocs.filter(
                      (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                    ).length;
                    const totalCount = stagedCount + existingCount;
                    const isActive = stagedDocCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setStagedDocCategory(cat.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                      >
                        {cat.key === 'CONTRACT' && <FileText className="w-3.5 h-3.5" />}
                        {cat.key === 'DEBT_NOTE' && <Briefcase className="w-3.5 h-3.5" />}
                        {cat.key === 'INVOICE' && <Receipt className="w-3.5 h-3.5" />}
                        {cat.key === 'COLLATERAL' && <Shield className="w-3.5 h-3.5" />}
                        {cat.key === 'OTHER' && <FolderArchive className="w-3.5 h-3.5" />}
                        {!['CONTRACT', 'DEBT_NOTE', 'INVOICE', 'COLLATERAL', 'OTHER'].includes(cat.key) && (
                          <Tag className="w-3.5 h-3.5 text-purple-300" />
                        )}
                        <span>{cat.shortLabel}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                              ? 'bg-white/20 text-white'
                              : totalCount > 0
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                        >
                          {totalCount}
                        </span>
                        {cat.isCustom && totalCount === 0 && (
                          <span
                            onClick={(e) => handleDeleteCustomCategory(cat.key, e)}
                            className="ml-0.5 text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded hover:bg-slate-200"
                            title="Xóa loại hồ sơ tùy chỉnh này"
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setStagedDocCategory('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${stagedDocCategory === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Tất cả</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${stagedDocCategory === 'ALL'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {stagedFiles.length + editModalDocs.length}
                    </span>
                  </button>

                  {/* Nút bổ sung loại hồ sơ mới */}
                  <button
                    type="button"
                    onClick={() => {
                      setAddCatContext('createModal');
                      setIsAddCatModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 border border-dashed border-indigo-300 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 hover:border-indigo-400 cursor-pointer shadow-2xs ml-auto"
                    title="Bổ sung thêm loại hồ sơ / chứng từ mới"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>+ Thêm loại hồ sơ</span>
                  </button>
                </div>

                {/* Nội dung Tab cụ thể */}
                {stagedDocCategory !== 'ALL' && (() => {
                  const currentCategory = dossierCategories.find((c) => c.key === stagedDocCategory) || dossierCategories[0];
                  const catStagedFiles = stagedFiles.filter(
                    (sf) => mapDocTypeToCategoryKey(sf.document_type) === stagedDocCategory
                  );
                  const catExistingDocs = editModalDocs.filter(
                    (d) => mapDocTypeToCategoryKey(d.document_type) === stagedDocCategory
                  );
                  const loanPrincipal = Number(formData.current_principal_balance) || editingLoan?.current_principal_balance || 0;

                  return (
                    <div className="space-y-3">
                      {/* Bảng đối soát hóa đơn XML & Dư nợ gốc (nếu là tab Hóa đơn & UNC) */}
                      {stagedDocCategory === 'INVOICE' &&
                        renderInvoiceReconciliationCard(
                          loanPrincipal,
                          catExistingDocs,
                          catStagedFiles
                        )}

                      {/* Banner thông tin loại chứng từ */}
                      <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0 mt-0.5">
                          {currentCategory.key === 'CONTRACT' && <FileText className="w-4 h-4" />}
                          {currentCategory.key === 'DEBT_NOTE' && <Briefcase className="w-4 h-4" />}
                          {currentCategory.key === 'INVOICE' && <Receipt className="w-4 h-4" />}
                          {currentCategory.key === 'COLLATERAL' && <Shield className="w-4 h-4" />}
                          {currentCategory.key === 'OTHER' && <FolderArchive className="w-4 h-4" />}
                          {!['CONTRACT', 'DEBT_NOTE', 'INVOICE', 'COLLATERAL', 'OTHER'].includes(currentCategory.key) && (
                            <Tag className="w-4 h-4 text-purple-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{currentCategory.label}</span>
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200">
                              Mục: {currentCategory.badgeLabel}
                            </span>
                            {currentCategory.isCustom && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.2 rounded-full border border-purple-200">
                                Tự định nghĩa
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {currentCategory.description}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 italic">
                            Ví dụ tệp: {currentCategory.examples}
                          </p>
                        </div>
                      </div>

                      {/* Khung tải lên chuyên biệt cho loại chứng từ này */}
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropStagedFilesForCategory(e, stagedDocCategory)}
                      >
                        <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-indigo-50/40 transition-all group">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.xml,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar"
                            onChange={(e) => handleAddStagedFilesForCategory(e, stagedDocCategory)}
                            className="hidden"
                          />
                          <div className="w-8 h-8 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 mb-1.5 transition-colors">
                            <Upload className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-semibold text-slate-800 text-center">
                            Bấm để chọn tệp hoặc kéo thả {currentCategory.shortLabel} vào đây
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 text-center">
                            Tệp tải vào mục này sẽ tự động gán loại "{currentCategory.badgeLabel}" (Hỗ trợ PDF, XML hóa đơn... Tối đa 50MB/file)
                          </p>
                        </label>
                      </div>

                      {/* Danh sách tệp chuẩn bị nạp (staged) của mục này */}
                      {catStagedFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Tệp chuẩn bị lưu vào mục này ({catStagedFiles.length}):</span>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {catStagedFiles.map((sf) => (
                              <div
                                key={sf.id}
                                className="p-2.5 bg-white rounded-lg border border-indigo-200 shadow-2xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <span className="font-semibold text-xs text-slate-900 truncate max-w-xs" title={sf.file.name}>
                                      {sf.file.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      ({(sf.file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStagedFile(sf.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Bỏ tệp này"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {(sf.invoice_number || sf.invoice_total_amount) && (
                                  <div className="flex items-center gap-2 text-[11px] bg-indigo-50/80 p-1.5 rounded-md border border-indigo-100">
                                    {sf.invoice_number && (
                                      <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                                        HĐ #{sf.invoice_number}
                                      </span>
                                    )}
                                    {sf.invoice_total_amount && (
                                      <span className="font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                        Tiền HĐ: {formatVND(sf.invoice_total_amount)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Chuyển sang loại chứng từ khác:
                                    </label>
                                    <select
                                      value={sf.document_type}
                                      onChange={(e) => handleUpdateStagedType(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      {dossierCategories.map((c) => (
                                        <option key={c.key} value={c.key}>
                                          {c.shortLabel}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Ghi chú chứng từ (tùy chọn):
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="VD: Số HĐ, ngày ký, số UNC..."
                                      value={sf.description}
                                      onChange={(e) => handleUpdateStagedDesc(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Danh sách tệp đã lưu trong CSDL của mục này (chế độ sửa) */}
                      {editingLoan && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>Tài liệu đã lưu trong mục này ({catExistingDocs.length}):</span>
                            {isEditModalDocsLoading && (
                              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Đang đồng bộ...
                              </span>
                            )}
                          </div>
                          {catExistingDocs.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center">
                              Chưa có tài liệu nào thuộc danh mục này trong CSDL.
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              {catExistingDocs.map((doc) => (
                                <div
                                  key={doc.document_id}
                                  className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-2xs"
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <span className="font-semibold text-slate-900 truncate max-w-xs block" title={doc.file_name}>
                                        {doc.file_name}
                                      </span>
                                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                                        <span>•</span>
                                        <span>{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>
                                        {doc.invoice_number && (
                                          <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                            Số HĐ: {doc.invoice_number}
                                          </span>
                                        )}
                                        {doc.invoice_series && (
                                          <span className="font-medium text-slate-700 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                                            Ký hiệu: {doc.invoice_series}
                                          </span>
                                        )}
                                        {doc.invoice_issue_date && (
                                          <span className="text-slate-500">
                                            Ngày: {new Date(doc.invoice_issue_date).toLocaleDateString('vi-VN')}
                                          </span>
                                        )}
                                        {doc.invoice_total_amount && (
                                          <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                            {formatVND(Number(doc.invoice_total_amount))}
                                          </span>
                                        )}
                                        {doc.verification_status && doc.verification_status !== 'UNVERIFIED' && (
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                            doc.verification_status === 'VERIFIED_MATCH'
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                                          }`}>
                                            {doc.verification_status === 'VERIFIED_MATCH' ? 'Khớp HĐĐT' : 'Chưa đủ'}
                                          </span>
                                        )}
                                        {doc.description && (
                                          <>
                                            <span>•</span>
                                            <span className="text-slate-600 italic truncate max-w-[150px]" title={doc.description}>
                                              {doc.description}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadDossierDoc(doc)}
                                      className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                      title="Tải xuống tài liệu"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEditModalDoc(doc.document_id)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                      title="Xóa tài liệu khỏi hồ sơ"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Nội dung Tab TẤT CẢ (Tổng hợp bảng danh mục) */}
                {stagedDocCategory === 'ALL' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {dossierCategories.map((cat) => {
                        const sCount = stagedFiles.filter(
                          (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                        ).length;
                        const eCount = editModalDocs.filter(
                          (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                        ).length;
                        const total = sCount + eCount;
                        return (
                          <div
                            key={cat.key}
                            onClick={() => setStagedDocCategory(cat.key)}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-2xs cursor-pointer transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800 truncate">{cat.shortLabel}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${total > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                  }`}
                              >
                                {total} tệp
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{cat.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Danh sách hợp nhất tất cả tệp */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        <span>Tổng hợp toàn bộ tài liệu hồ sơ ({stagedFiles.length + editModalDocs.length}):</span>
                        {stagedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setStagedFiles([])}
                            className="text-[11px] text-rose-500 hover:underline"
                          >
                            Xóa tất cả {stagedFiles.length} tệp chuẩn bị nạp
                          </button>
                        )}
                      </div>

                      {stagedFiles.length === 0 && editModalDocs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có tài liệu nào trong bộ hồ sơ. Vui lòng chọn một danh mục chứng từ ở trên để tải tệp.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {/* Staged files */}
                          {stagedFiles.map((sf) => (
                            <div
                              key={sf.id}
                              className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-200 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{sf.file.name}</span>
                                {renderDossierBadge(sf.document_type, dossierCategories)}
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Chờ lưu
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveStagedFile(sf.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {/* Saved docs */}
                          {editModalDocs.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{doc.file_name}</span>
                                {renderDossierBadge(doc.document_type, dossierCategories)}
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Đã lưu
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDossierDoc(doc)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 rounded"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEditModalDoc(doc.document_id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* KHỐI GHI CHÚ NỘI BỘ */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ghi Chú Nội Bộ
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm về điều kiện tín dụng, tài sản thế chấp hoặc thỏa thuận thuê mua..."
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                {editingLoan ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingLoan) {
                        const target = editingLoan;
                        setIsModalOpen(false);
                        handleDeleteLoan(target);
                      }
                    }}
                    className="px-3 py-2 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5"
                    title="Xóa hoặc chuyển trạng thái tất toán cho khoản vay này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa khoản vay</span>
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={modalSubmitting}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {stagedFiles.length > 0
                          ? `Đang lưu & tải lên ${stagedFiles.length} tệp...`
                          : 'Đang lưu...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>
                        {editingLoan
                          ? (stagedFiles.length > 0 ? `Cập Nhật & Tải Lên ${stagedFiles.length} Tệp` : 'Cập Nhật Khoản Vay')
                          : (stagedFiles.length > 0 ? `Lưu & Tải Lên ${stagedFiles.length} Tệp Hồ Sơ` : 'Lưu Khoản Vay Mới')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL BỔ SUNG LOẠI HỒ SƠ / CHỨNG TỪ MỚI */}
      {/* ========================================================================= */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                  <Tag className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Bổ Sung Loại Hồ Sơ / Chứng Từ Mới</h3>
                  <p className="text-[11px] text-indigo-200/90 mt-0.5">
                    Thêm danh mục hồ sơ giải ngân tùy biến theo đặc thù hợp đồng tín dụng
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCatModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateCategorySubmit} className="p-5 space-y-4">
              {newCatError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{newCatError}</span>
                </div>
              )}

              {/* Quick suggestions pills */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Gợi ý nhanh loại hồ sơ phổ biến:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CATEGORY_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug.key}
                      type="button"
                      onClick={() => {
                        setNewCatLabel(sug.label);
                        setNewCatShortLabel(sug.shortLabel);
                        setNewCatKey(sug.key);
                        setNewCatDesc(sug.desc);
                        setNewCatExamples(sug.examples);
                        setNewCatError(null);
                      }}
                      className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 transition-all text-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-slate-400" />
                      <span>{sug.shortLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tên đầy đủ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên đầy đủ của loại chứng từ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Thư Bảo Lãnh Thanh Toán, Biên Bản Nghiệm Thu Khối Lượng..."
                  value={newCatLabel}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCatLabel(val);
                    if (!newCatShortLabel) {
                      setNewCatShortLabel(val);
                    }
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Tên ngắn gọn & Mã định danh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên hiển thị trên Tab & Badge
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Thư bảo lãnh, Nghiệm thu..."
                    value={newCatShortLabel}
                    onChange={(e) => setNewCatShortLabel(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã định danh (Key/Code)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: GUARANTEE, ACCEPTANCE..."
                    value={newCatKey}
                    onChange={(e) => setNewCatKey(e.target.value.toUpperCase())}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Mô tả loại chứng từ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả & Hướng dẫn chứng từ
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả các tài liệu thuộc nhóm này, điều kiện giải ngân..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Ví dụ tệp */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ví dụ tên file mẫu
                </label>
                <input
                  type="text"
                  placeholder="VD: Bao_lanh_thanh_toan_CTG.pdf, BB_Nghiem_thu_giai_doan_1.pdf"
                  value={newCatExamples}
                  onChange={(e) => setNewCatExamples(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddCatModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo loại hồ sơ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
