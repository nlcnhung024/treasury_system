import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  DollarSign,
  Percent,
  Clock,
  Calendar,
  Layers,
  Building2,
  Table,
  SlidersHorizontal,
  Sparkles,
  Download,
  Search,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Building,
  Save,
  Trash2,
  TrendingUp,
  Landmark,
  Bookmark,
  LayoutGrid,
  List,
} from 'lucide-react';
import api from '../services/api';
import {
  CreditFacility,
  CreditFacilitySummary,
} from '../types';
import { TreemapChart, TreemapItem } from '../components/common/TreemapChart';
import { MonthlyDueStackedChart } from '../components/common/MonthlyDueStackedChart';
import { SortableTh } from '../components/common/SortableTh';
import { TableGridToolbar } from '../components/common/TableGridToolbar';
import { useTableGrid } from '../hooks/useTableGrid';
import { ColumnConfig } from '../types/grid';

const LOAN_REPORT_COLUMNS: ColumnConfig[] = [
  { field: 'contract_number', label: 'Số HĐ / Khế Ước', type: 'text', defaultWidth: 160 },
  { field: 'borrower_name', label: 'Chủ Thể Vay', type: 'text', defaultWidth: 180 },
  { field: 'bank_name', label: 'Tổ Chức Tín Dụng', type: 'text', defaultWidth: 160 },
  { field: 'loan_purpose', label: 'Mục Đích Khoản Vay', type: 'text', defaultWidth: 170 },
  { field: 'original_principal_balance', label: 'Dư Nợ Ban Đầu', type: 'number', align: 'right', defaultWidth: 140 },
  { field: 'total_repaid_principal', label: 'Đã Trả Gốc', type: 'number', align: 'right', defaultWidth: 130 },
  { field: 'current_principal_balance', label: 'Dư Nợ Hiện Tại', type: 'number', align: 'right', defaultWidth: 140 },
  { field: 'interest_rate', label: 'Lãi Suất', type: 'number', align: 'center', defaultWidth: 100 },
  { field: 'maturity_date', label: 'Ngày Đáo Hạn', type: 'date', align: 'center', defaultWidth: 130 },
  { field: 'status', label: 'Trạng Thái', type: 'text', align: 'center', defaultWidth: 110 },
];

// =============================================================================
// STORAGE KEYS FOR AUTO-PERSISTENCE & CUSTOM TEMPLATES
// =============================================================================
const ACTIVE_STATE_STORAGE_KEY = 'loan_report_pivot_active_state';
const CUSTOM_TEMPLATES_STORAGE_KEY = 'loan_report_pivot_custom_presets';

export interface SavedPivotTemplate {
  id: string;
  name: string;
  rowDim: string;
  colDim: string;
  metric: string;
  createdAt: string;
}

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

// 1. DIMENSIONS
export const PIVOT_ROW_DIMENSIONS: PivotDimDef[] = [
  {
    id: 'borrower_name',
    label: 'Chủ thể vay (Doanh nghiệp)',
    getValue: (l) => l.borrower_name || 'Chưa định danh chủ thể',
  },
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
];

export const PIVOT_COL_DIMENSIONS: PivotDimDef[] = [
  {
    id: 'NONE',
    label: '(Không phân chia cột - Bảng 1 Chiều)',
    getValue: () => '__SINGLE__',
  },
  ...PIVOT_ROW_DIMENSIONS,
];

// 2. METRICS
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

// 3. DEFAULT PRESETS
export const DEFAULT_PIVOT_PRESETS = [
  {
    name: 'Chủ thể vay × Ngân hàng',
    row: 'borrower_name',
    col: 'bank_name',
    metric: 'current_principal_balance',
  },
  {
    name: 'Ngân hàng × Phân loại nhóm nợ',
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
    name: 'Tổng hợp theo Chủ thể vay (1D)',
    row: 'borrower_name',
    col: 'NONE',
    metric: 'current_principal_balance',
  },
  {
    name: 'Tổng hợp theo Ngân hàng (1D)',
    row: 'bank_name',
    col: 'NONE',
    metric: 'current_principal_balance',
  },
];

export const LoanReportsPage: React.FC = () => {
  // Main Tab: 'insights' (Tab 1: Báo Cáo Insight & Dòng Tiền Đáo Hạn) | 'portfolio' (Tab 2: Danh Mục Khế Ước & Phân Tích Đa Chiều)
  const [activeMainTab, setActiveMainTab] = useState<'insights' | 'portfolio'>('insights');
  // Sub Tab in Tab 2: 'list' (Danh mục khế ước) | 'pivot' (Ma trận Pivot)
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'pivot'>('list');

  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [summary, setSummary] = useState<CreditFacilitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedContract, setCopiedContract] = useState<string | null>(null);

  // View mode for structure charts: 'treemap' (Biểu đồ Treemap) | 'list' (Danh sách)
  const [borrowerViewMode, setBorrowerViewMode] = useState<'treemap' | 'list'>('treemap');
  const [bankViewMode, setBankViewMode] = useState<'treemap' | 'list'>('treemap');

  // Table Grid Capabilities (Sort, Filter, Visibility, Resizing)
  const {
    sortField,
    sortDirection,
    handleSort,
    filters,
    setFilter,
    clearAllFilters,
    activeFilterCount,
    visibleColumns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    isColumnVisible,
    columnWidths,
    handleResize,
    filterAndSort,
  } = useTableGrid<CreditFacility>({
    tableId: 'loan_reports_table',
    columns: LOAN_REPORT_COLUMNS,
    defaultSortField: 'contract_number',
    defaultSortDirection: 'asc',
  });

  // Filters for Tab 2 List
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [borrowerFilter, setBorrowerFilter] = useState<string>('ALL');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [debtGroupFilter, setDebtGroupFilter] = useState<string>('ALL');
  const [termFilter, setTermFilter] = useState<string>('ALL');

  // Pivot Table State with initial load from localStorage
  const [pivotRowDim, setPivotRowDim] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STATE_STORAGE_KEY);
      if (saved) return JSON.parse(saved).pivotRowDim || 'borrower_name';
    } catch {}
    return 'borrower_name';
  });

  const [pivotColDim, setPivotColDim] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STATE_STORAGE_KEY);
      if (saved) return JSON.parse(saved).pivotColDim || 'bank_name';
    } catch {}
    return 'bank_name';
  });

  const [pivotMetric, setPivotMetric] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STATE_STORAGE_KEY);
      if (saved) return JSON.parse(saved).pivotMetric || 'current_principal_balance';
    } catch {}
    return 'current_principal_balance';
  });

  const [pivotSearch, setPivotSearch] = useState<string>('');

  // Custom Saved Presets list from localStorage
  const [customTemplates, setCustomTemplates] = useState<SavedPivotTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState<boolean>(false);

  // Auto-persist active state to localStorage whenever changed
  useEffect(() => {
    try {
      const stateToSave = {
        pivotRowDim,
        pivotColDim,
        pivotMetric,
        activeMainTab,
        activeSubTab,
      };
      localStorage.setItem(ACTIVE_STATE_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Failed to save pivot state to localStorage', e);
    }
  }, [pivotRowDim, pivotColDim, pivotMetric, activeMainTab, activeSubTab]);

  const handleSaveCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTemplateName.trim();
    if (!cleanName) return;

    const newTemplate: SavedPivotTemplate = {
      id: `tmpl_${Date.now()}`,
      name: cleanName,
      rowDim: pivotRowDim,
      colDim: pivotColDim,
      metric: pivotMetric,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...customTemplates];
    setCustomTemplates(updated);
    try {
      localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save custom template to localStorage', e);
    }

    setNewTemplateName('');
    setTemplateSaveSuccess(true);
    setTimeout(() => setTemplateSaveSuccess(false), 2500);
  };

  const handleDeleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa mẫu phân tích đã lưu này?')) return;
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    try {
      localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete custom template', e);
    }
  };

  const handleApplyTemplate = (tmpl: { rowDim: string; colDim: string; metric: string }) => {
    setPivotRowDim(tmpl.rowDim);
    setPivotColDim(tmpl.colDim);
    setPivotMetric(tmpl.metric);
  };

  // Fetch Loans & Summary from Backend
  const fetchData = async () => {
    setLoading(true);
    try {
      const [loansRes, summaryRes] = await Promise.all([
        api.get('/loans', { params: { limit: 500 } }),
        api.get('/loans/summary'),
      ]);
      setLoans(loansRes.data.data || []);
      setSummary(summaryRes.data || null);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu báo cáo khoản nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatVND = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0 ₫';
    return `${Number(val).toLocaleString('vi-VN')} ₫`;
  };

  const handleCopyContract = (e: React.MouseEvent, contractNumber: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractNumber);
    setCopiedContract(contractNumber);
    setTimeout(() => {
      setCopiedContract((prev) => (prev === contractNumber ? null : prev));
    }, 2000);
  };

  // Safe calculated metrics for KPIs (Never display NaN đ!)
  const totalPrincipalBalance = useMemo(() => {
    if (summary?.total_principal_balance && !isNaN(Number(summary.total_principal_balance))) {
      return Number(summary.total_principal_balance);
    }
    return loans.reduce((sum, l) => sum + (Number(l.current_principal_balance) || 0), 0);
  }, [summary, loans]);

  const totalInterestDue = useMemo(() => {
    const fromSummaryAccrued = Number(summary?.total_accrued_interest) || 0;
    const fromSummaryUpcoming = Number(summary?.total_upcoming_interest_due) || 0;
    if (fromSummaryAccrued + fromSummaryUpcoming > 0) {
      return fromSummaryAccrued + fromSummaryUpcoming;
    }
    return loans.reduce(
      (sum, l) => sum + (Number(l.calculated_interest_due ?? l.accrued_interest) || 0),
      0
    );
  }, [summary, loans]);

  const weightedAverageRate = useMemo(() => {
    if (summary?.weighted_avg_interest_rate && !isNaN(Number(summary.weighted_avg_interest_rate))) {
      return Number(summary.weighted_avg_interest_rate).toFixed(2);
    }
    if (totalPrincipalBalance <= 0) return '0.00';
    const weightedSum = loans.reduce(
      (sum, l) => sum + (Number(l.current_principal_balance) || 0) * (Number(l.interest_rate) || 0),
      0
    );
    return (weightedSum / totalPrincipalBalance).toFixed(2);
  }, [summary, loans, totalPrincipalBalance]);

  // Unique Borrower and Bank lists for dropdown filters
  const uniqueBorrowers = useMemo(() => {
    const set = new Set<string>();
    loans.forEach((l) => {
      if (l.borrower_name) set.add(l.borrower_name.trim());
    });
    return Array.from(set).sort();
  }, [loans]);

  const uniqueBanks = useMemo(() => {
    const map = new Map<string, string>();
    loans.forEach((l) => {
      const code = (l.bank_code || '').trim().toUpperCase();
      if (code && !map.has(code)) {
        map.set(code, l.bank_name || code);
      }
    });
    return Array.from(map.entries());
  }, [loans]);

  // =============================================================================
  // TAB 1 COMPUTATIONS: MATURITY LADDER, BORROWER STRUCTURE, BANK ALLOCATION
  // =============================================================================

  // 1. Maturity Ladder Buckets (<7d, 8-30d, 31-90d, 91-180d, >180d)
  const maturityLadder = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const buckets = [
      { id: 'le7', label: 'Đến hạn ≤ 7 ngày (Tuần tới)', minDays: -9999, maxDays: 7, count: 0, amount: 0, color: 'bg-rose-500', textColor: 'text-rose-700', bgLight: 'bg-rose-50 border-rose-200' },
      { id: '8to30', label: 'Đến hạn 8 - 30 ngày (Tháng này)', minDays: 8, maxDays: 30, count: 0, amount: 0, color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50 border-amber-200' },
      { id: '31to90', label: 'Đến hạn 31 - 90 ngày (Quý tới)', minDays: 31, maxDays: 90, count: 0, amount: 0, color: 'bg-sky-500', textColor: 'text-sky-700', bgLight: 'bg-sky-50 border-sky-200' },
      { id: '91to180', label: 'Đến hạn 91 - 180 ngày (Nửa năm)', minDays: 91, maxDays: 180, count: 0, amount: 0, color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50 border-indigo-200' },
      { id: 'gt180', label: 'Đến hạn > 180 ngày (Dài hạn)', minDays: 181, maxDays: 99999, count: 0, amount: 0, color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50 border-emerald-200' },
    ];

    loans.forEach((l) => {
      // Find target due date: next repayment date or maturity date
      const dateStr = l.next_repayment_date || l.maturity_date;
      if (!dateStr) {
        buckets[4].count += 1;
        buckets[4].amount += Number(l.current_principal_balance) || 0;
        return;
      }
      const dueDate = new Date(dateStr);
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Obligation amount: next payment obligation if set, else current balance
      const obligation = Number(l.total_repayment_amount) > 0
        ? Number(l.total_repayment_amount)
        : (Number(l.next_principal_amount) || 0) + (Number(l.next_interest_amount) || 0) || Number(l.current_principal_balance) || 0;

      for (const b of buckets) {
        if (diffDays <= b.maxDays && diffDays >= b.minDays) {
          b.count += 1;
          b.amount += obligation;
          break;
        }
      }
    });

    const totalLadderAmount = buckets.reduce((s, b) => s + b.amount, 0);

    return {
      buckets,
      totalLadderAmount,
    };
  }, [loans]);

  // 2. Borrower Structure (Cơ cấu vay theo chủ thể)
  const borrowerStructure = useMemo(() => {
    const map = new Map<string, { borrower: string; totalPrincipal: number; loansCount: number; weightedRateSum: number }>();

    loans.forEach((l) => {
      const bName = l.borrower_name?.trim() || 'Doanh nghiệp chưa xác định';
      const principal = Number(l.current_principal_balance) || 0;
      const rate = Number(l.interest_rate) || 0;

      if (!map.has(bName)) {
        map.set(bName, { borrower: bName, totalPrincipal: 0, loansCount: 0, weightedRateSum: 0 });
      }
      const item = map.get(bName)!;
      item.totalPrincipal += principal;
      item.loansCount += 1;
      item.weightedRateSum += principal * rate;
    });

    const list = Array.from(map.values()).map((item) => ({
      ...item,
      percentage: totalPrincipalBalance > 0 ? (item.totalPrincipal / totalPrincipalBalance) * 100 : 0,
      wair: item.totalPrincipal > 0 ? item.weightedRateSum / item.totalPrincipal : 0,
    }));

    return list.sort((a, b) => b.totalPrincipal - a.totalPrincipal);
  }, [loans, totalPrincipalBalance]);

  // 3. Bank Structure (Phân bổ theo TCTD)
  const bankStructure = useMemo(() => {
    const map = new Map<string, { bankCode: string; bankName: string; totalPrincipal: number; loansCount: number; weightedRateSum: number }>();

    loans.forEach((l) => {
      const code = (l.bank_code || 'OTHER').trim().toUpperCase();
      const name = l.bank_name || code;
      const principal = Number(l.current_principal_balance) || 0;
      const rate = Number(l.interest_rate) || 0;

      if (!map.has(code)) {
        map.set(code, { bankCode: code, bankName: name, totalPrincipal: 0, loansCount: 0, weightedRateSum: 0 });
      }
      const item = map.get(code)!;
      item.totalPrincipal += principal;
      item.loansCount += 1;
      item.weightedRateSum += principal * rate;
    });

    const list = Array.from(map.values()).map((item) => ({
      ...item,
      percentage: totalPrincipalBalance > 0 ? (item.totalPrincipal / totalPrincipalBalance) * 100 : 0,
      wair: item.totalPrincipal > 0 ? item.weightedRateSum / item.totalPrincipal : 0,
    }));

    return list.sort((a, b) => b.totalPrincipal - a.totalPrincipal);
  }, [loans, totalPrincipalBalance]);

  // Transform Borrower Structure for Treemap Chart
  const borrowerTreemapItems = useMemo<TreemapItem[]>(() => {
    const gradients = [
      'bg-gradient-to-br from-indigo-600 to-indigo-800',
      'bg-gradient-to-br from-violet-600 to-purple-800',
      'bg-gradient-to-br from-blue-600 to-sky-800',
      'bg-gradient-to-br from-cyan-600 to-teal-800',
      'bg-gradient-to-br from-slate-600 to-slate-800',
    ];

    return borrowerStructure.map((item, idx) => ({
      id: `borrower-${idx}`,
      name: item.borrower,
      shortName: item.borrower.length > 20 ? item.borrower.substring(0, 18) + '...' : item.borrower,
      value: item.totalPrincipal,
      percentage: item.percentage,
      loansCount: item.loansCount,
      wair: item.wair,
      colorGradient: gradients[idx % gradients.length],
      badge: `#${idx + 1}`,
    }));
  }, [borrowerStructure]);

  // Transform Bank Structure for Treemap Chart
  const bankTreemapItems = useMemo<TreemapItem[]>(() => {
    const bankColors: Record<string, string> = {
      MBB: 'bg-gradient-to-br from-blue-600 to-indigo-800',
      MB: 'bg-gradient-to-br from-blue-600 to-indigo-800',
      CTG: 'bg-gradient-to-br from-teal-600 to-emerald-800',
      VIETINBANK: 'bg-gradient-to-br from-teal-600 to-emerald-800',
      VPB: 'bg-gradient-to-br from-emerald-500 to-green-700',
      VPBANK: 'bg-gradient-to-br from-emerald-500 to-green-700',
      MBV: 'bg-gradient-to-br from-cyan-600 to-blue-700',
      TPB: 'bg-gradient-to-br from-purple-600 to-indigo-700',
      TPBANK: 'bg-gradient-to-br from-purple-600 to-indigo-700',
      EVF: 'bg-gradient-to-br from-amber-500 to-orange-700',
      EVNFINANCE: 'bg-gradient-to-br from-amber-500 to-orange-700',
    };

    const defaultGradients = [
      'bg-gradient-to-br from-blue-600 to-indigo-800',
      'bg-gradient-to-br from-teal-600 to-emerald-800',
      'bg-gradient-to-br from-emerald-500 to-green-700',
      'bg-gradient-to-br from-cyan-600 to-blue-700',
      'bg-gradient-to-br from-purple-600 to-indigo-700',
      'bg-gradient-to-br from-amber-500 to-orange-700',
    ];

    return bankStructure.map((item, idx) => {
      const codeKey = item.bankCode.toUpperCase();
      const colorGradient = bankColors[codeKey] || defaultGradients[idx % defaultGradients.length];
      const fullName = item.bankName && item.bankName !== item.bankCode
        ? `${item.bankCode} - ${item.bankName}`
        : item.bankName || item.bankCode;

      return {
        id: `bank-${item.bankCode}-${idx}`,
        name: fullName,
        shortName: item.bankCode,
        value: item.totalPrincipal,
        percentage: item.percentage,
        loansCount: item.loansCount,
        wair: item.wair,
        colorGradient,
        badge: item.bankCode,
      };
    });
  }, [bankStructure]);

  // 4. Upcoming Due Warnings (Cảnh báo khế ước sắp đến hạn trong 14 ngày)
  const upcomingWarnings = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return loans
      .filter((l) => {
        const dateStr = l.next_repayment_date || l.maturity_date;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 14;
      })
      .map((l) => {
        const dateStr = (l.next_repayment_date || l.maturity_date)!;
        const d = new Date(dateStr);
        const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(l.total_repayment_amount) > 0
          ? Number(l.total_repayment_amount)
          : (Number(l.next_principal_amount) || 0) + (Number(l.next_interest_amount) || 0) || Number(l.current_principal_balance) || 0;

        return {
          loan: l,
          daysLeft,
          dateStr,
          amount,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [loans]);

  // =============================================================================
  // TAB 2 COMPUTATIONS: FILTERED LIST (READ-ONLY) & PIVOT GRID
  // =============================================================================

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      // Search term
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchContract = l.contract_number?.toLowerCase().includes(lower);
        const matchBorrower = l.borrower_name?.toLowerCase().includes(lower);
        const matchBank = l.bank_name?.toLowerCase().includes(lower) || l.bank_code?.toLowerCase().includes(lower);
        const matchPurpose = l.loan_purpose?.toLowerCase().includes(lower);
        if (!matchContract && !matchBorrower && !matchBank && !matchPurpose) return false;
      }
      // Borrower filter
      if (borrowerFilter !== 'ALL' && l.borrower_name?.trim() !== borrowerFilter) {
        return false;
      }
      // Bank filter
      if (bankFilter !== 'ALL' && l.bank_code?.toUpperCase() !== bankFilter) {
        return false;
      }
      // Debt group filter
      if (debtGroupFilter !== 'ALL' && String(l.debt_group) !== debtGroupFilter) {
        return false;
      }
      // Term filter
      if (termFilter !== 'ALL' && l.term !== termFilter) {
        return false;
      }
      return true;
    });
  }, [loans, searchTerm, borrowerFilter, bankFilter, debtGroupFilter, termFilter]);

  const sortedLoans = useMemo(() => {
    return filterAndSort(filteredLoans, {
      loan_purpose: (l) => l.loan_purpose || 'Vay vốn lưu động / SXKD',
      status: () => 'Hiệu lực',
    });
  }, [filteredLoans, filterAndSort]);

  // Pivot Table Computation
  const pivotResult = useMemo(() => {
    const rowDef = PIVOT_ROW_DIMENSIONS.find((d) => d.id === pivotRowDim) || PIVOT_ROW_DIMENSIONS[0];
    const colDef = PIVOT_COL_DIMENSIONS.find((d) => d.id === pivotColDim) || PIVOT_COL_DIMENSIONS[0];
    const metricDef = PIVOT_METRIC_DEFS.find((m) => m.id === pivotMetric) || PIVOT_METRIC_DEFS[0];

    const is2D = colDef.id !== 'NONE';

    // Unique Row Keys
    const rowMap = new Map<string, CreditFacility[]>();
    // Unique Col Keys
    const colMap = new Map<string, CreditFacility[]>();
    // Matrix cell key: `${rowKey}:::${colKey}`
    const cellMap = new Map<string, CreditFacility[]>();

    filteredLoans.forEach((loan) => {
      const rKey = rowDef.getValue(loan);
      const cKey = is2D ? colDef.getValue(loan) : '__SINGLE__';

      if (!rowMap.has(rKey)) rowMap.set(rKey, []);
      rowMap.get(rKey)!.push(loan);

      if (is2D) {
        if (!colMap.has(cKey)) colMap.set(cKey, []);
        colMap.get(cKey)!.push(loan);
      }

      const cellKey = `${rKey}:::${cKey}`;
      if (!cellMap.has(cellKey)) cellMap.set(cellKey, []);
      cellMap.get(cellKey)!.push(loan);
    });

    let rowKeys = Array.from(rowMap.keys()).sort();
    let colKeys = is2D ? Array.from(colMap.keys()).sort() : ['__SINGLE__'];

    // Pivot search filter
    if (pivotSearch.trim()) {
      const q = pivotSearch.toLowerCase().trim();
      rowKeys = rowKeys.filter((k) => k.toLowerCase().includes(q));
    }

    const rowTotals: Record<string, number> = {};
    rowKeys.forEach((r) => {
      rowTotals[r] = metricDef.compute(rowMap.get(r) || []);
    });

    const colTotals: Record<string, number> = {};
    colKeys.forEach((c) => {
      if (is2D) {
        colTotals[c] = metricDef.compute(colMap.get(c) || []);
      }
    });

    const grandTotal = metricDef.compute(filteredLoans);

    return {
      rowDef,
      colDef,
      metricDef,
      is2D,
      rowKeys,
      colKeys,
      cellMap,
      rowTotals,
      colTotals,
      grandTotal,
      loansCount: filteredLoans.length,
    };
  }, [filteredLoans, pivotRowDim, pivotColDim, pivotMetric, pivotSearch]);

  // Export Pivot CSV (UTF-8 BOM for Excel)
  const handleExportPivotCSV = () => {
    const { rowDef, colDef, metricDef, is2D, rowKeys, colKeys, cellMap, rowTotals, colTotals, grandTotal } = pivotResult;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    // Header Row
    if (is2D) {
      csvContent += `"${rowDef.label} \\ ${colDef.label}",`;
      colKeys.forEach((c) => {
        csvContent += `"${c}",`;
      });
      csvContent += '"TỔNG DÒNG"\n';
    } else {
      csvContent += `"${rowDef.label}","${metricDef.label} (${metricDef.unit})"\n`;
    }

    // Body Rows
    rowKeys.forEach((r) => {
      csvContent += `"${r}",`;
      if (is2D) {
        colKeys.forEach((c) => {
          const list = cellMap.get(`${r}:::${c}`) || [];
          const val = list.length > 0 ? metricDef.compute(list) : 0;
          csvContent += `"${val}",`;
        });
        csvContent += `"${rowTotals[r] || 0}"\n`;
      } else {
        csvContent += `"${rowTotals[r] || 0}"\n`;
      }
    });

    // Grand Total Row
    if (is2D) {
      csvContent += '"TỔNG CỘT",';
      colKeys.forEach((c) => {
        csvContent += `"${colTotals[c] || 0}",`;
      });
      csvContent += `"${grandTotal}"\n`;
    } else {
      csvContent += `"TỔNG CỘNG","${grandTotal}"\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bao_Cao_Pivot_Du_No_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & NAVIGATION                                                */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Trung Tâm Phân Tích & Báo Cáo Tín Dụng</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Thống Kê Dư Nợ Tín Dụng & Dòng Tiền Đáo Hạn
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Báo cáo insight chuyên sâu về áp lực dòng tiền trả nợ, cơ cấu dư nợ theo chủ thể vay & ma trận phân tích đa chiều.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/credit-statements"
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-semibold transition-all shadow-xs"
            title="Chuyển đến màn hình nạp file sao kê tín dụng"
          >
            <Landmark className="w-4 h-4 text-indigo-600" />
            <span>Nạp Sao Kê Tín Dụng</span>
          </Link>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Làm mới số liệu</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN TABS SWITCHER                                                     */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveMainTab('insights')}
            className={`py-3.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2.5 ${
              activeMainTab === 'insights'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Tab 1: Báo Cáo Insight & Dòng Tiền Đáo Hạn</span>
          </button>

          <button
            onClick={() => setActiveMainTab('portfolio')}
            className={`py-3.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2.5 ${
              activeMainTab === 'portfolio'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Tab 2: Danh Mục Khế Ước & Phân Tích Đa Chiều</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 font-bold">
              {loans.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BÁO CÁO INSIGHT & DÒNG TIỀN ĐÁO HẠN                                 */}
      {/* ========================================================================= */}
      {activeMainTab === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top 5 Financial KPI Cards (Sửa triệt để lỗi NaN tiền lãi) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Tổng Dư Nợ Hiện Tại</span>
                <DollarSign className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {formatVND(totalPrincipalBalance)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {loans.length} khoản nợ đang theo dõi
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Lãi Dự Trả / Lũy Kế</span>
                <Percent className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-emerald-600">
                {formatVND(totalInterestDue)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Tính toán theo lãi suất thực tế TT14
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Đến Hạn Trong 7 Ngày</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-amber-600">
                {formatVND(summary?.total_upcoming_due_7days || maturityLadder.buckets[0].amount)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Áp lực thanh khoản tuần tới</div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Đến Hạn Trong 30 Ngày</span>
                <Calendar className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-rose-600">
                {formatVND(summary?.total_upcoming_due_30days || (maturityLadder.buckets[0].amount + maturityLadder.buckets[1].amount))}
              </div>
              <div className="text-xs text-slate-500 mt-1">Gốc & lãi đến hạn tháng này</div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Lãi Suất BQ (WAIR)</span>
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-purple-600">
                {weightedAverageRate} %
              </div>
              <div className="text-xs text-slate-500 mt-1">Bình quân gia quyền dư nợ</div>
            </div>
          </div>

          {/* DƯ NỢ ĐẾN HẠN THEO CÁC THÁNG & BẢNG CHI TIẾT THEO NGÂN HÀNG (STACKED BAR & ACCORDION) */}
          <MonthlyDueStackedChart loans={loans} formatVND={formatVND} />

          {/* TWO MAIN INSIGHT CARDS: CƠ CẤU THEO CHỦ THỂ & PHÂN BỔ THEO NGÂN HÀNG */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CARD 1: CƠ CẤU VAY THEO CHỦ THỂ (Doanh nghiệp vay) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    <span>Cơ Cấu Dư Nợ Theo Chủ Thể Vay</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tỷ trọng dư nợ và lãi suất bình quân của từng đơn vị/pháp nhân trong tập đoàn.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200">
                    {borrowerStructure.length} chủ thể
                  </span>
                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setBorrowerViewMode('treemap')}
                      className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                        borrowerViewMode === 'treemap'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Biểu đồ Treemap"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Treemap</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorrowerViewMode('list')}
                      className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                        borrowerViewMode === 'list'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Danh sách chi tiết"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Danh sách</span>
                    </button>
                  </div>
                </div>
              </div>

              {borrowerViewMode === 'treemap' ? (
                <TreemapChart
                  items={borrowerTreemapItems}
                  height={340}
                  formatValue={formatVND}
                  emptyMessage="Chưa có thông tin chủ thể vay trong danh mục."
                />
              ) : (
                <div className="space-y-3">
                  {borrowerStructure.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Chưa có thông tin chủ thể vay trong danh mục.
                    </div>
                  ) : (
                    borrowerStructure.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-semibold text-slate-800">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="max-w-xs truncate" title={item.borrower}>
                              {item.borrower}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{formatVND(item.totalPrincipal)}</span>
                            <span className="ml-2 text-indigo-600 font-semibold">({item.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>

                        {/* Percentage Bar */}
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(2, item.percentage))}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                          <span>Số hợp đồng: <strong className="text-slate-700">{item.loansCount} HĐ</strong></span>
                          <span>Lãi suất BQ (WAIR): <strong className="text-purple-600">{item.wair.toFixed(2)} %/năm</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* CARD 2: PHÂN BỔ THEO TỔ CHỨC TÍN DỤNG (Ngân Hàng) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building className="w-5 h-5 text-emerald-600" />
                    <span>Phân Bổ Dư Nợ Theo Tổ Chức Tín Dụng</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hạn mức dư nợ thực tế đang vay tại từng Ngân hàng và Tổ chức tài chính.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                    {bankStructure.length} tổ chức
                  </span>
                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setBankViewMode('treemap')}
                      className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                        bankViewMode === 'treemap'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Biểu đồ Treemap"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Treemap</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBankViewMode('list')}
                      className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                        bankViewMode === 'list'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="Danh sách chi tiết"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Danh sách</span>
                    </button>
                  </div>
                </div>
              </div>

              {bankViewMode === 'treemap' ? (
                <TreemapChart
                  items={bankTreemapItems}
                  height={340}
                  formatValue={formatVND}
                  emptyMessage="Chưa có số liệu phân bổ ngân hàng."
                />
              ) : (
                <div className="space-y-3">
                  {bankStructure.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Chưa có số liệu phân bổ ngân hàng.
                    </div>
                  ) : (
                    bankStructure.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-semibold text-slate-800">
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              {item.bankCode}
                            </span>
                            <span className="max-w-xs truncate" title={item.bankName}>
                              {item.bankName}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{formatVND(item.totalPrincipal)}</span>
                            <span className="ml-2 text-emerald-600 font-semibold">({item.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>

                        {/* Percentage Bar */}
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(2, item.percentage))}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                          <span>Số khoản vay: <strong className="text-slate-700">{item.loansCount} khoản</strong></span>
                          <span>Lãi suất BQ: <strong className="text-purple-600">{item.wair.toFixed(2)} %/năm</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CẢNH BÁO KHẾ ƯỚC CẬN ĐÁO HẠN TRONG 14 NGÀY */}
          <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold">
                  Cảnh Báo Khế Ước Cận Đáo Hạn (Trong 14 Ngày Tới)
                </h3>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                {upcomingWarnings.length} khế ước cần lưu ý thanh khoản
              </span>
            </div>

            {upcomingWarnings.length === 0 ? (
              <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs text-emerald-800 font-medium flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Không có khoản vay nào đến hạn thanh toán trong 14 ngày tới. An toàn dòng tiền ngắn hạn!</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-amber-50 text-amber-900 font-semibold border-b border-amber-200">
                      <th className="py-2.5 px-3">Số HĐ / Khế Ước</th>
                      <th className="py-2.5 px-3">Chủ Thể Vay</th>
                      <th className="py-2.5 px-3">Ngân Hàng</th>
                      <th className="py-2.5 px-3">Ngày Đến Hạn</th>
                      <th className="py-2.5 px-3 text-center">Thời Gian Còn Lại</th>
                      <th className="py-2.5 px-3 text-right">Nghĩa Vụ Cần Trả (Gốc+Lãi)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {upcomingWarnings.map((item, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/50 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-800 font-mono">
                          {item.loan.contract_number}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{item.loan.borrower_name}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{item.loan.bank_name || item.loan.bank_code}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{item.dateStr}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            item.daysLeft <= 3
                              ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {item.daysLeft === 0 ? 'HÔM NAY' : `Còn ${item.daysLeft} ngày`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          {formatVND(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DANH MỤC KHẾ ƯỚC & PHÂN TÍCH ĐA CHIỀU                              */}
      {/* ========================================================================= */}
      {activeMainTab === 'portfolio' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Sub Tab Switcher: Mode 1 (Danh Mục Chi Tiết) vs Mode 2 (Pivot Grid) */}
          <div className="bg-slate-100 p-1.5 rounded-xl flex items-center space-x-2 max-w-fit border border-slate-200">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                activeSubTab === 'list'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Chế độ 1: Danh Mục Khế Ước Chi Tiết (Báo Cáo)</span>
            </button>
            <button
              onClick={() => setActiveSubTab('pivot')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                activeSubTab === 'pivot'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Chế độ 2: Bàn Làm Việc Phân Tích Đa Chiều (Pivot Grid)</span>
            </button>
          </div>

          {/* ======================================================================= */}
          {/* SUB-VIEW 1: DANH MỤC KHẾ ƯỚC CHI TIẾT (READ-ONLY REPORTING TABLE)        */}
          {/* ======================================================================= */}
          {activeSubTab === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Table className="w-5 h-5 text-indigo-600" />
                    <span>Danh Mục Chi Tiết Hợp Đồng Vay & Khế Ước</span>
                    <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-semibold">
                      {filteredLoans.length} / {loans.length} khoản nợ
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Bảng tra cứu số liệu đối soát dư nợ gốc, tỷ lệ hoàn trả và kỳ hạn. Màn hình báo cáo chỉ đọc (read-only) để bảo toàn tính toàn vẹn dữ liệu.
                  </p>
                </div>
              </div>

              {/* Multi-Filter Controls Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {/* Search Term */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm số HĐ, mục đích..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Filter by Borrower */}
                <div>
                  <select
                    value={borrowerFilter}
                    onChange={(e) => setBorrowerFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Tất cả chủ thể vay</option>
                    {uniqueBorrowers.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter by Bank */}
                <div>
                  <select
                    value={bankFilter}
                    onChange={(e) => setBankFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Tất cả ngân hàng / TCTD</option>
                    {uniqueBanks.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter by Debt Group */}
                <div>
                  <select
                    value={debtGroupFilter}
                    onChange={(e) => setDebtGroupFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">Tất cả nhóm nợ</option>
                    <option value="1">Nhóm 1 (Đủ tiêu chuẩn)</option>
                    <option value="2">Nhóm 2 (Cần chú ý)</option>
                    <option value="3">Nhóm 3 (Dưới tiêu chuẩn)</option>
                    <option value="4">Nhóm 4 (Nghi ngờ)</option>
                    <option value="5">Nhóm 5 (Có khả năng mất vốn)</option>
                  </select>
                </div>

                {/* Reset Filters */}
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setBorrowerFilter('ALL');
                      setBankFilter('ALL');
                      setDebtGroupFilter('ALL');
                      setTermFilter('ALL');
                    }}
                    className="w-full py-2 px-3 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors text-center"
                  >
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              </div>

              {/* Table Grid Toolbar */}
              <TableGridToolbar
                columns={LOAN_REPORT_COLUMNS}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumn}
                onShowAllColumns={showAllColumns}
                onResetColumns={resetColumns}
                filteredCount={sortedLoans.length}
                totalCount={filteredLoans.length}
                activeFilterCount={activeFilterCount}
                onClearAllFilters={clearAllFilters}
              />

              {/* Data Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full min-w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider">
                      {isColumnVisible('contract_number') && (
                        <SortableTh
                          field="contract_number"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          filterType="text"
                          filterValue={filters['contract_number']}
                          onFilterChange={(v) => setFilter('contract_number', v)}
                          width={columnWidths['contract_number']}
                          onResize={(w) => handleResize('contract_number', w)}
                          className="py-3 px-3"
                        >
                          Số HĐ / Khế Ước
                        </SortableTh>
                      )}
                      {isColumnVisible('borrower_name') && (
                        <SortableTh
                          field="borrower_name"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          filterType="text"
                          filterValue={filters['borrower_name']}
                          onFilterChange={(v) => setFilter('borrower_name', v)}
                          width={columnWidths['borrower_name']}
                          onResize={(w) => handleResize('borrower_name', w)}
                          className="py-3 px-3"
                        >
                          Chủ Thể Vay
                        </SortableTh>
                      )}
                      {isColumnVisible('bank_name') && (
                        <SortableTh
                          field="bank_name"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          filterType="text"
                          filterValue={filters['bank_name']}
                          onFilterChange={(v) => setFilter('bank_name', v)}
                          width={columnWidths['bank_name']}
                          onResize={(w) => handleResize('bank_name', w)}
                          className="py-3 px-3"
                        >
                          Tổ Chức Tín Dụng
                        </SortableTh>
                      )}
                      {isColumnVisible('loan_purpose') && (
                        <SortableTh
                          field="loan_purpose"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          filterType="text"
                          filterValue={filters['loan_purpose']}
                          onFilterChange={(v) => setFilter('loan_purpose', v)}
                          width={columnWidths['loan_purpose']}
                          onResize={(w) => handleResize('loan_purpose', w)}
                          className="py-3 px-3"
                        >
                          Mục Đích Khoản Vay
                        </SortableTh>
                      )}
                      {isColumnVisible('original_principal_balance') && (
                        <SortableTh
                          field="original_principal_balance"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="right"
                          filterType="number"
                          filterValue={filters['original_principal_balance']}
                          onFilterChange={(v) => setFilter('original_principal_balance', v)}
                          width={columnWidths['original_principal_balance']}
                          onResize={(w) => handleResize('original_principal_balance', w)}
                          className="py-3 px-3"
                        >
                          Dư Nợ Ban Đầu
                        </SortableTh>
                      )}
                      {isColumnVisible('total_repaid_principal') && (
                        <SortableTh
                          field="total_repaid_principal"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="right"
                          filterType="number"
                          filterValue={filters['total_repaid_principal']}
                          onFilterChange={(v) => setFilter('total_repaid_principal', v)}
                          width={columnWidths['total_repaid_principal']}
                          onResize={(w) => handleResize('total_repaid_principal', w)}
                          className="py-3 px-3"
                        >
                          Đã Trả Gốc
                        </SortableTh>
                      )}
                      {isColumnVisible('current_principal_balance') && (
                        <SortableTh
                          field="current_principal_balance"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="right"
                          filterType="number"
                          filterValue={filters['current_principal_balance']}
                          onFilterChange={(v) => setFilter('current_principal_balance', v)}
                          width={columnWidths['current_principal_balance']}
                          onResize={(w) => handleResize('current_principal_balance', w)}
                          className="py-3 px-3"
                        >
                          Dư Nợ Hiện Tại
                        </SortableTh>
                      )}
                      {isColumnVisible('interest_rate') && (
                        <SortableTh
                          field="interest_rate"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="center"
                          filterType="number"
                          filterValue={filters['interest_rate']}
                          onFilterChange={(v) => setFilter('interest_rate', v)}
                          width={columnWidths['interest_rate']}
                          onResize={(w) => handleResize('interest_rate', w)}
                          className="py-3 px-3"
                        >
                          Lãi Suất
                        </SortableTh>
                      )}
                      {isColumnVisible('maturity_date') && (
                        <SortableTh
                          field="maturity_date"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="center"
                          filterType="date"
                          filterValue={filters['maturity_date']}
                          onFilterChange={(v) => setFilter('maturity_date', v)}
                          width={columnWidths['maturity_date']}
                          onResize={(w) => handleResize('maturity_date', w)}
                          className="py-3 px-3"
                        >
                          Ngày Đáo Hạn
                        </SortableTh>
                      )}
                      {isColumnVisible('status') && (
                        <SortableTh
                          field="status"
                          currentSortField={sortField}
                          currentSortDirection={sortDirection}
                          onSort={handleSort}
                          align="center"
                          filterType="text"
                          filterValue={filters['status']}
                          onFilterChange={(v) => setFilter('status', v)}
                          width={columnWidths['status']}
                          onResize={(w) => handleResize('status', w)}
                          className="py-3 px-3"
                        >
                          Trạng Thái
                        </SortableTh>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedLoans.length === 0 ? (
                      <tr>
                        <td
                          colSpan={LOAN_REPORT_COLUMNS.filter((c) => isColumnVisible(c.field)).length}
                          className="py-12 text-center text-slate-400"
                        >
                          Không tìm thấy khoản vay nào phù hợp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      sortedLoans.map((loan) => (
                        <tr key={loan.loan_id} className="hover:bg-slate-50 transition-colors">
                          {/* Số HĐ / Khế ước */}
                          {isColumnVisible('contract_number') && (
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-1.5 font-mono font-semibold text-slate-800">
                                <span>{loan.contract_number}</span>
                                <button
                                  onClick={(e) => handleCopyContract(e, loan.contract_number)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                  title="Sao chép số HĐ"
                                >
                                  {copiedContract === loan.contract_number ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                              {loan.term && (
                                <div className="text-[10px] text-slate-400 mt-0.5">Kỳ hạn: {loan.term}</div>
                              )}
                            </td>
                          )}

                          {/* Chủ thể vay */}
                          {isColumnVisible('borrower_name') && (
                            <td className="py-3 px-3 font-medium text-slate-800 max-w-[180px] truncate" title={loan.borrower_name}>
                              {loan.borrower_name || '-'}
                            </td>
                          )}

                          {/* Ngân hàng */}
                          {isColumnVisible('bank_name') && (
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-800">{loan.bank_name || loan.bank_code}</div>
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {loan.bank_code}
                              </span>
                            </td>
                          )}

                          {/* Mục đích vay */}
                          {isColumnVisible('loan_purpose') && (
                            <td className="py-3 px-3 text-slate-600 max-w-[200px] truncate" title={loan.loan_purpose || ''}>
                              {loan.loan_purpose || 'Vay vốn lưu động / SXKD'}
                            </td>
                          )}

                          {/* Dư nợ ban đầu */}
                          {isColumnVisible('original_principal_balance') && (
                            <td className="py-3 px-3 text-right font-medium text-slate-700">
                              {formatVND(loan.original_principal_balance)}
                            </td>
                          )}

                          {/* Đã trả gốc */}
                          {isColumnVisible('total_repaid_principal') && (
                            <td className="py-3 px-3 text-right font-medium text-emerald-600">
                              {formatVND(loan.total_repaid_principal)}
                            </td>
                          )}

                          {/* Dư nợ hiện tại */}
                          {isColumnVisible('current_principal_balance') && (
                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                              {formatVND(loan.current_principal_balance)}
                            </td>
                          )}

                          {/* Lãi suất */}
                          {isColumnVisible('interest_rate') && (
                            <td className="py-3 px-3 text-center font-bold text-purple-600">
                              {Number(loan.interest_rate).toFixed(2)} %
                            </td>
                          )}

                          {/* Ngày đáo hạn */}
                          {isColumnVisible('maturity_date') && (
                            <td className="py-3 px-3 text-center text-slate-600 font-medium">
                              {loan.maturity_date || '-'}
                            </td>
                          )}

                          {/* Trạng thái */}
                          {isColumnVisible('status') && (
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Hiệu lực
                              </span>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================================= */}
          {/* SUB-VIEW 2: BÀN LÀM VIỆC PHÂN TÍCH ĐA CHIỀU (PIVOT GRID WORKSPACE)       */}
          {/* ======================================================================= */}
          {activeSubTab === 'pivot' && (
            <div className="space-y-5">
              {/* Top Controls Card: Mẫu phân tích có sẵn & Lưu Mẫu Mới (Persisted) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                      <span>Ma Trận Xoay & Phân Tích Đa Chiều (Pivot Grid)</span>
                      <span className="text-xs font-normal text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                        {pivotResult.loansCount} khoản vay đang khảo sát
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Khảo sát danh mục tín dụng theo 2 chiều (Dòng × Cột). Tự động lưu cấu hình và khôi phục khi reload trang.
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

                {/* Quick Presets (Default + Custom Saved) */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  {/* Default Presets */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mr-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Mẫu có sẵn:</span>
                    </span>
                    {DEFAULT_PIVOT_PRESETS.map((preset, idx) => {
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

                  {/* Custom Saved Templates List */}
                  {customTemplates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                      <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5 mr-1">
                        <Bookmark className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Mẫu của bạn đã lưu:</span>
                      </span>
                      {customTemplates.map((tmpl) => {
                        const isActive =
                          pivotRowDim === tmpl.rowDim &&
                          pivotColDim === tmpl.colDim &&
                          pivotMetric === tmpl.metric;
                        return (
                          <div
                            key={tmpl.id}
                            className={`inline-flex items-center rounded-lg border text-xs overflow-hidden transition-all ${
                              isActive
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <button
                              onClick={() => handleApplyTemplate(tmpl)}
                              className="px-2.5 py-1 text-left"
                            >
                              {tmpl.name}
                            </button>
                            <button
                              onClick={(e) => handleDeleteCustomTemplate(tmpl.id, e)}
                              className="px-1.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Xóa mẫu này"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Save Current Layout as New Template Form */}
                  <form
                    onSubmit={handleSaveCustomTemplate}
                    className="flex flex-wrap items-center gap-2 pt-2 text-xs"
                  >
                    <span className="text-slate-600 font-medium">Lưu cấu hình hiện tại thành mẫu:</span>
                    <input
                      type="text"
                      placeholder="Nhập tên mẫu (VD: Nợ theo Chủ thể x Kỳ hạn)..."
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!newTemplateName.trim()}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu Mẫu Này</span>
                    </button>
                    {templateSaveSuccess && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold animate-in fade-in">
                        <Check className="w-3.5 h-3.5" />
                        Đã lưu mẫu thành công!
                      </span>
                    )}
                  </form>
                </div>
              </div>

              {/* Controls Bar: Select Row Dim, Col Dim, Metric, Search */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
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
                      4. Lọc Nhanh Tên Dòng
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Lọc dòng..."
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

              {/* Pivot Table Main View */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider">
                        <th className="py-3 px-4 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[220px]">
                          <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
                            <span>{pivotResult.rowDef.label}</span>
                            {pivotResult.is2D && (
                              <>
                                <span className="text-slate-400">/</span>
                                <span className="text-slate-500 text-[11px] font-normal">
                                  {pivotResult.colDef.label}
                                </span>
                              </>
                            )}
                          </div>
                        </th>

                        {pivotResult.is2D ? (
                          <>
                            {pivotResult.colKeys.map((cKey) => (
                              <th
                                key={cKey}
                                className="py-3 px-3 text-right border-r border-slate-200 min-w-[140px] text-slate-800"
                              >
                                {cKey}
                              </th>
                            ))}
                            <th className="py-3 px-4 text-right bg-indigo-50/70 text-indigo-900 font-bold min-w-[150px]">
                              TỔNG DÒNG
                            </th>
                          </>
                        ) : (
                          <th className="py-3 px-4 text-right bg-indigo-50/70 text-indigo-900 font-bold min-w-[200px]">
                            {pivotResult.metricDef.label}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pivotResult.rowKeys.length === 0 ? (
                        <tr>
                          <td
                            colSpan={pivotResult.is2D ? pivotResult.colKeys.length + 2 : 2}
                            className="py-12 text-center text-slate-400"
                          >
                            Không có dữ liệu phù hợp với điều kiện phân tích.
                          </td>
                        </tr>
                      ) : (
                        pivotResult.rowKeys.map((rKey) => (
                          <tr key={rKey} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-800 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-200">
                              {rKey}
                            </td>

                            {pivotResult.is2D ? (
                              <>
                                {pivotResult.colKeys.map((cKey) => {
                                  const cellList = pivotResult.cellMap.get(`${rKey}:::${cKey}`) || [];
                                  const cellVal = cellList.length > 0 ? pivotResult.metricDef.compute(cellList) : 0;
                                  return (
                                    <td
                                      key={cKey}
                                      className={`py-3 px-3 text-right border-r border-slate-100 font-medium ${
                                        cellVal > 0 ? 'text-slate-900' : 'text-slate-300'
                                      }`}
                                    >
                                      {cellVal > 0 ? pivotResult.metricDef.format(cellVal) : '-'}
                                    </td>
                                  );
                                })}
                                <td className="py-3 px-4 text-right font-bold text-indigo-900 bg-indigo-50/40">
                                  {pivotResult.metricDef.format(pivotResult.rowTotals[rKey] || 0)}
                                </td>
                              </>
                            ) : (
                              <td className="py-3 px-4 text-right font-bold text-indigo-900 bg-indigo-50/40">
                                {pivotResult.metricDef.format(pivotResult.rowTotals[rKey] || 0)}
                              </td>
                            )}
                          </tr>
                        ))
                      )}

                      {/* Grand Total Row */}
                      {pivotResult.rowKeys.length > 0 && (
                        <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                          <td className="py-3 px-4 sticky left-0 bg-slate-100 z-10 border-r border-slate-300">
                            TỔNG CỘNG
                          </td>
                          {pivotResult.is2D ? (
                            <>
                              {pivotResult.colKeys.map((cKey) => (
                                <td
                                  key={cKey}
                                  className="py-3 px-3 text-right border-r border-slate-300 text-slate-900"
                                >
                                  {pivotResult.metricDef.format(pivotResult.colTotals[cKey] || 0)}
                                </td>
                              ))}
                              <td className="py-3 px-4 text-right bg-indigo-100 text-indigo-950 font-extrabold">
                                {pivotResult.metricDef.format(pivotResult.grandTotal)}
                              </td>
                            </>
                          ) : (
                            <td className="py-3 px-4 text-right bg-indigo-100 text-indigo-950 font-extrabold">
                              {pivotResult.metricDef.format(pivotResult.grandTotal)}
                            </td>
                          )}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
