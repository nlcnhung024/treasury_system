import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Table as TableIcon,
  BarChart3,
  Calendar,
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  X,
  Building2,
  Landmark,
} from 'lucide-react';
import { CreditFacility } from '../../types';
import { useCorporateEntity, PRESET_CORPORATE_ENTITIES } from '../../contexts/CorporateEntityContext';

interface MonthlyDueStackedChartProps {
  loans: CreditFacility[];
  formatVND: (val: number | undefined | null) => string;
}

interface LoanItemProcessed {
  loan_id: number;
  contract_number: string;
  bank_code: string;
  bank_name: string;
  borrower_name: string;
  borrower_short: string;
  due_date: string; // YYYY-MM-DD
  month_key: string; // YYYY-MM
  month_label: string; // Tháng MM/YYYY
  day_key: string; // DD/MM/YYYY
  day_short: string; // DD/MM
  obligation: number;
  principal: number;
  interest: number;
}

interface ColorDef {
  bg: string;
  hover: string;
  text: string;
  lightBg: string;
  border: string;
}

const BANK_COLOR_MAP: Record<string, ColorDef> = {
  BIDV: {
    bg: 'bg-blue-600',
    hover: 'hover:bg-blue-700',
    text: 'text-blue-700',
    lightBg: 'bg-blue-50',
    border: 'border-blue-300',
  },
  VCB: {
    bg: 'bg-emerald-600',
    hover: 'hover:bg-emerald-700',
    text: 'text-emerald-700',
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  VIETCOMBANK: {
    bg: 'bg-emerald-600',
    hover: 'hover:bg-emerald-700',
    text: 'text-emerald-700',
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  CTG: {
    bg: 'bg-teal-600',
    hover: 'hover:bg-teal-700',
    text: 'text-teal-700',
    lightBg: 'bg-teal-50',
    border: 'border-teal-300',
  },
  VIETINBANK: {
    bg: 'bg-teal-600',
    hover: 'hover:bg-teal-700',
    text: 'text-teal-700',
    lightBg: 'bg-teal-50',
    border: 'border-teal-300',
  },
  MBB: {
    bg: 'bg-indigo-600',
    hover: 'hover:bg-indigo-700',
    text: 'text-indigo-700',
    lightBg: 'bg-indigo-50',
    border: 'border-indigo-300',
  },
  MB: {
    bg: 'bg-indigo-600',
    hover: 'hover:bg-indigo-700',
    text: 'text-indigo-700',
    lightBg: 'bg-indigo-50',
    border: 'border-indigo-300',
  },
  TCB: {
    bg: 'bg-rose-600',
    hover: 'hover:bg-rose-700',
    text: 'text-rose-700',
    lightBg: 'bg-rose-50',
    border: 'border-rose-300',
  },
  TECHCOMBANK: {
    bg: 'bg-rose-600',
    hover: 'hover:bg-rose-700',
    text: 'text-rose-700',
    lightBg: 'bg-rose-50',
    border: 'border-rose-300',
  },
  VPB: {
    bg: 'bg-lime-600',
    hover: 'hover:bg-lime-700',
    text: 'text-lime-700',
    lightBg: 'bg-lime-50',
    border: 'border-lime-300',
  },
  VPBANK: {
    bg: 'bg-lime-600',
    hover: 'hover:bg-lime-700',
    text: 'text-lime-700',
    lightBg: 'bg-lime-50',
    border: 'border-lime-300',
  },
  TPB: {
    bg: 'bg-purple-600',
    hover: 'hover:bg-purple-700',
    text: 'text-purple-700',
    lightBg: 'bg-purple-50',
    border: 'border-purple-300',
  },
  TPBANK: {
    bg: 'bg-purple-600',
    hover: 'hover:bg-purple-700',
    text: 'text-purple-700',
    lightBg: 'bg-purple-50',
    border: 'border-purple-300',
  },
  ACB: {
    bg: 'bg-sky-600',
    hover: 'hover:bg-sky-700',
    text: 'text-sky-700',
    lightBg: 'bg-sky-50',
    border: 'border-sky-300',
  },
  HDB: {
    bg: 'bg-amber-600',
    hover: 'hover:bg-amber-700',
    text: 'text-amber-700',
    lightBg: 'bg-amber-50',
    border: 'border-amber-300',
  },
  HDBANK: {
    bg: 'bg-amber-600',
    hover: 'hover:bg-amber-700',
    text: 'text-amber-700',
    lightBg: 'bg-amber-50',
    border: 'border-amber-300',
  },
  SHB: {
    bg: 'bg-orange-600',
    hover: 'hover:bg-orange-700',
    text: 'text-orange-700',
    lightBg: 'bg-orange-50',
    border: 'border-orange-300',
  },
  MSB: {
    bg: 'bg-red-600',
    hover: 'hover:bg-red-700',
    text: 'text-red-700',
    lightBg: 'bg-red-50',
    border: 'border-red-300',
  },
  STB: {
    bg: 'bg-cyan-700',
    hover: 'hover:bg-cyan-800',
    text: 'text-cyan-800',
    lightBg: 'bg-cyan-50',
    border: 'border-cyan-300',
  },
  SACOMBANK: {
    bg: 'bg-cyan-700',
    hover: 'hover:bg-cyan-800',
    text: 'text-cyan-800',
    lightBg: 'bg-cyan-50',
    border: 'border-cyan-300',
  },
};

const BANK_FALLBACK_PALETTE: ColorDef[] = [
  { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', text: 'text-blue-700', lightBg: 'bg-blue-50', border: 'border-blue-300' },
  { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-700', text: 'text-emerald-700', lightBg: 'bg-emerald-50', border: 'border-emerald-300' },
  { bg: 'bg-teal-600', hover: 'hover:bg-teal-700', text: 'text-teal-700', lightBg: 'bg-teal-50', border: 'border-teal-300' },
  { bg: 'bg-indigo-600', hover: 'hover:bg-indigo-700', text: 'text-indigo-700', lightBg: 'bg-indigo-50', border: 'border-indigo-300' },
  { bg: 'bg-rose-600', hover: 'hover:bg-rose-700', text: 'text-rose-700', lightBg: 'bg-rose-50', border: 'border-rose-300' },
  { bg: 'bg-amber-600', hover: 'hover:bg-amber-700', text: 'text-amber-700', lightBg: 'bg-amber-50', border: 'border-amber-300' },
  { bg: 'bg-purple-600', hover: 'hover:bg-purple-700', text: 'text-purple-700', lightBg: 'bg-purple-50', border: 'border-purple-300' },
  { bg: 'bg-green-600', hover: 'hover:bg-green-700', text: 'text-green-700', lightBg: 'bg-green-50', border: 'border-green-300' },
  { bg: 'bg-sky-600', hover: 'hover:bg-sky-700', text: 'text-sky-700', lightBg: 'bg-sky-50', border: 'border-sky-300' },
];

const BORROWER_PALETTE: ColorDef[] = [
  { bg: 'bg-indigo-600', hover: 'hover:bg-indigo-700', text: 'text-indigo-700', lightBg: 'bg-indigo-50', border: 'border-indigo-300' },
  { bg: 'bg-amber-600', hover: 'hover:bg-amber-700', text: 'text-amber-700', lightBg: 'bg-amber-50', border: 'border-amber-300' },
  { bg: 'bg-pink-600', hover: 'hover:bg-pink-700', text: 'text-pink-700', lightBg: 'bg-pink-50', border: 'border-pink-300' },
  { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-700', text: 'text-emerald-700', lightBg: 'bg-emerald-50', border: 'border-emerald-300' },
  { bg: 'bg-sky-600', hover: 'hover:bg-sky-700', text: 'text-sky-700', lightBg: 'bg-sky-50', border: 'border-sky-300' },
  { bg: 'bg-purple-600', hover: 'hover:bg-purple-700', text: 'text-purple-700', lightBg: 'bg-purple-50', border: 'border-purple-300' },
  { bg: 'bg-teal-600', hover: 'hover:bg-teal-700', text: 'text-teal-700', lightBg: 'bg-teal-50', border: 'border-teal-300' },
  { bg: 'bg-orange-600', hover: 'hover:bg-orange-700', text: 'text-orange-700', lightBg: 'bg-orange-50', border: 'border-orange-300' },
  { bg: 'bg-rose-600', hover: 'hover:bg-rose-700', text: 'text-rose-700', lightBg: 'bg-rose-50', border: 'border-rose-300' },
];

export const MonthlyDueStackedChart: React.FC<MonthlyDueStackedChartProps> = ({
  loans,
  formatVND,
}) => {
  const { entities } = useCorporateEntity();

  // Rút gọn tên doanh nghiệp (ví dụ: CONG TY CO PHAN XI MANG SUNRISE -> Xi măng Sunrise)
  const formatShortCompanyName = (rawName: string | undefined | null): string => {
    if (!rawName) return 'Doanh nghiệp';
    const stripAccents = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toUpperCase()
        .trim();

    const norm = stripAccents(rawName);
    const allEntities = [...entities, ...PRESET_CORPORATE_ENTITIES];
    for (const ent of allEntities) {
      if (ent.id === 'ALL') continue;
      const entNorm = stripAccents(ent.name || '');
      const shortNorm = stripAccents(ent.shortName || '');
      if (
        (entNorm && (norm.includes(entNorm) || entNorm.includes(norm))) ||
        (shortNorm && norm.includes(shortNorm))
      ) {
        return ent.shortName;
      }
    }

    if (norm.includes('SUNRISE')) return 'Xi măng Sunrise';
    if (norm.includes('HUONG DUONG')) return 'TM & PT Hướng Dương';
    if (norm.includes('LAN ANH')) return 'Bà Lan Anh (CEO)';

    return rawName
      .replace(/^(CÔNG TY CỔ PHẦN|CONG TY CO PHAN|CTCP)\s+/i, 'CTCP ')
      .replace(/^(CÔNG TY TNHH|CONG TY TNHH)\s+/i, 'TNHH ')
      .trim();
  };

  // Dropdown open/close state for detail breakdown table (default open)
  const [isTableOpen, setIsTableOpen] = useState<boolean>(true);

  // Expanded months set: which months are currently expanded to show individual days as child rows
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Dropdown selection state:
  // - 'group:bank': Phân loại cột chồng theo Tổ chức tín dụng (Toàn bộ)
  // - 'group:borrower': Phân loại cột chồng theo Chủ thể nhận nợ / Công ty (Toàn bộ)
  // - 'group:contract': Theo từng khế ước đơn lẻ (Đơn sắc)
  // - 'filter:bank:<CODE>': Lọc chỉ hiển thị 1 Tổ chức tín dụng cụ thể
  // - 'filter:borrower:<NAME>': Lọc chỉ hiển thị 1 Chủ thể nhận nợ cụ thể
  const [dropdownSelection, setDropdownSelection] = useState<string>('group:bank');

  // Derived view mode & active filter
  const viewMode: 'bank' | 'borrower' | 'contract' = useMemo(() => {
    if (dropdownSelection === 'group:borrower' || dropdownSelection.startsWith('filter:borrower:')) {
      return 'borrower';
    }
    if (dropdownSelection === 'group:contract') {
      return 'contract';
    }
    return 'bank';
  }, [dropdownSelection]);

  const activeFilter = useMemo(() => {
    if (dropdownSelection.startsWith('filter:bank:')) {
      return { type: 'bank' as const, value: dropdownSelection.replace('filter:bank:', '') };
    }
    if (dropdownSelection.startsWith('filter:borrower:')) {
      return { type: 'borrower' as const, value: dropdownSelection.replace('filter:borrower:', '') };
    }
    return null;
  }, [dropdownSelection]);

  // Hovered item or segment for interactive tooltip
  const [hoveredInfo, setHoveredInfo] = useState<{
    type: 'contract' | 'bank' | 'borrower';
    title: string;
    subtitle?: string;
    amount: number;
    count?: number;
    contractNumber?: string;
    bankCode?: string;
    borrowerShort?: string;
    monthLabel?: string;
  } | null>(null);

  // Helper for compact money formatting (used on top of bar charts)
  const formatShortMoney = (val: number): string => {
    if (!val || val === 0) return '0 ₫';
    const absVal = Math.abs(val);
    if (absVal >= 1_000_000_000) {
      return `${(val / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
    }
    if (absVal >= 1_000_000) {
      return `${(val / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
    }
    return formatVND(val);
  };

  // Process and sort all active loans (CHỈ TÍNH TIỀN GỐC ĐẾN HẠN, LOẠI TRỪ LÃI)
  const processedLoans = useMemo<LoanItemProcessed[]>(() => {
    const list: LoanItemProcessed[] = [];
    loans.forEach((l) => {
      const nextP = Number(l.next_principal_amount) || 0;
      const curBal = Number(l.current_principal_balance) || 0;

      // CHỈ LẤY SỐ TIỀN GỐC ĐẾN HẠN (LOẠI BỎ SỐ TIỀN LÃI):
      const principalDue = nextP > 0 ? nextP : curBal;
      if (principalDue <= 0) return;

      // NGÀY ĐẾN HẠN GỐC:
      const dateStr = (nextP > 0 && l.next_repayment_date)
        ? l.next_repayment_date
        : (l.maturity_date || l.next_repayment_date);

      if (!dateStr) return;

      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const month_key = `${yyyy}-${mm}`;
      const month_label = `Tháng ${mm}/${yyyy}`;
      const day_key = `${dd}/${mm}/${yyyy}`;
      const day_short = `${dd}/${mm}`;

      list.push({
        loan_id: l.loan_id,
        contract_number: l.contract_number,
        bank_code: (l.bank_code || 'OTHER').trim().toUpperCase(),
        bank_name: l.bank_name || l.bank_code || 'Chưa rõ',
        borrower_name: l.borrower_name || 'Doanh nghiệp',
        borrower_short: formatShortCompanyName(l.borrower_name),
        due_date: dateStr,
        month_key,
        month_label,
        day_key,
        day_short,
        obligation: principalDue,
        principal: principalDue,
        interest: 0,
      });
    });
    return list;
  }, [loans, entities]);

  // Unique Banks list across ALL processed loans (sorted descending by total obligation)
  const allBanksList = useMemo(() => {
    const map = new Map<string, { bank_code: string; bank_name: string; total: number; count: number }>();
    processedLoans.forEach((l) => {
      if (!map.has(l.bank_code)) {
        map.set(l.bank_code, {
          bank_code: l.bank_code,
          bank_name: l.bank_name,
          total: 0,
          count: 0,
        });
      }
      const b = map.get(l.bank_code)!;
      b.total += l.obligation;
      b.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [processedLoans]);

  // Unique Borrowers list across ALL processed loans (sorted descending by total obligation)
  const allBorrowersList = useMemo(() => {
    const map = new Map<string, { shortName: string; fullName: string; total: number; count: number }>();
    processedLoans.forEach((l) => {
      const key = l.borrower_short;
      if (!map.has(key)) {
        map.set(key, {
          shortName: key,
          fullName: l.borrower_name,
          total: 0,
          count: 0,
        });
      }
      const item = map.get(key)!;
      item.total += l.obligation;
      item.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [processedLoans]);

  // Get color for Bank
  const getBankColor = (bankCode: string, fallbackIdx: number = 0): ColorDef => {
    const code = (bankCode || '').trim().toUpperCase();
    if (BANK_COLOR_MAP[code]) return BANK_COLOR_MAP[code];
    return BANK_FALLBACK_PALETTE[fallbackIdx % BANK_FALLBACK_PALETTE.length];
  };

  // Pre-calculate Borrower Color Map
  const borrowerColorMap = useMemo(() => {
    const map = new Map<string, ColorDef>();
    allBorrowersList.forEach((b, idx) => {
      const norm = b.fullName.toUpperCase();
      if (norm.includes('SUNRISE')) {
        map.set(b.shortName, BORROWER_PALETTE[0]); // Indigo
      } else if (norm.includes('HUONG DUONG') || b.shortName.includes('Hướng Dương')) {
        map.set(b.shortName, BORROWER_PALETTE[1]); // Amber
      } else if (norm.includes('LAN ANH') || b.shortName.includes('Lan Anh')) {
        map.set(b.shortName, BORROWER_PALETTE[2]); // Pink
      } else {
        map.set(b.shortName, BORROWER_PALETTE[idx % BORROWER_PALETTE.length]);
      }
    });
    return map;
  }, [allBorrowersList]);

  const getBorrowerColor = (borrowerShort: string, fallbackIdx: number = 0): ColorDef => {
    return borrowerColorMap.get(borrowerShort) || BORROWER_PALETTE[fallbackIdx % BORROWER_PALETTE.length];
  };

  // Filtered Loans based on activeFilter
  const displayLoans = useMemo(() => {
    if (!activeFilter) return processedLoans;
    if (activeFilter.type === 'bank') {
      return processedLoans.filter((l) => l.bank_code === activeFilter.value);
    }
    if (activeFilter.type === 'borrower') {
      return processedLoans.filter((l) => l.borrower_short === activeFilter.value);
    }
    return processedLoans;
  }, [processedLoans, activeFilter]);

  // Group by Month (sorted chronologically from left to right) based on displayLoans
  const monthsData = useMemo(() => {
    const map = new Map<
      string,
      {
        month_key: string;
        label: string;
        total: number;
        loans: LoanItemProcessed[];
        daysMap: Map<string, { day_key: string; day_short: string; total: number; loans: LoanItemProcessed[] }>;
      }
    >();

    displayLoans.forEach((l) => {
      if (!map.has(l.month_key)) {
        map.set(l.month_key, {
          month_key: l.month_key,
          label: l.month_label,
          total: 0,
          loans: [],
          daysMap: new Map(),
        });
      }
      const mEntry = map.get(l.month_key)!;
      mEntry.total += l.obligation;
      mEntry.loans.push(l);

      // Days within this month
      if (!mEntry.daysMap.has(l.day_key)) {
        mEntry.daysMap.set(l.day_key, {
          day_key: l.day_key,
          day_short: l.day_short,
          total: 0,
          loans: [],
        });
      }
      const dEntry = mEntry.daysMap.get(l.day_key)!;
      dEntry.total += l.obligation;
      dEntry.loans.push(l);
    });

    const sortedMonthKeys = Array.from(map.keys()).sort();
    return sortedMonthKeys.map((k) => {
      const item = map.get(k)!;
      // Sort days chronologically
      const sortedDays = Array.from(item.daysMap.values()).sort((a, b) => {
        const [d1, m1, y1] = a.day_key.split('/').map(Number);
        const [d2, m2, y2] = b.day_key.split('/').map(Number);
        return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
      });
      return {
        ...item,
        days: sortedDays,
      };
    });
  }, [displayLoans]);

  // Banks list for the detail table: if filtering by a single bank, only show that bank; otherwise show all relevant banks
  const tableBanksList = useMemo(() => {
    const map = new Map<string, { bank_code: string; bank_name: string; total: number; count: number }>();
    displayLoans.forEach((l) => {
      if (!map.has(l.bank_code)) {
        map.set(l.bank_code, {
          bank_code: l.bank_code,
          bank_name: l.bank_name,
          total: 0,
          count: 0,
        });
      }
      const b = map.get(l.bank_code)!;
      b.total += l.obligation;
      b.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [displayLoans]);

  // Max month total for stacked bar chart scaling
  const maxMonthTotal = useMemo(() => {
    if (monthsData.length === 0) return 1;
    return Math.max(...monthsData.map((m) => m.total));
  }, [monthsData]);

  // Total obligation of current view
  const currentTotal = useMemo(() => {
    return monthsData.reduce((sum, m) => sum + m.total, 0);
  }, [monthsData]);

  // Grand total obligation across all loans without filters
  const grandTotal = useMemo(() => {
    return processedLoans.reduce((sum, l) => sum + l.obligation, 0);
  }, [processedLoans]);

  // Toggle single month expansion
  const toggleMonthExpansion = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  // Expand all months
  const handleExpandAll = () => {
    setExpandedMonths(new Set(monthsData.map((m) => m.month_key)));
  };

  // Collapse all months
  const handleCollapseAll = () => {
    setExpandedMonths(new Set());
  };

  if (processedLoans.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
      {/* ========================================================================= */}
      {/* HEADER SECTION WITH MULTI-DIMENSIONAL DROPDOWN & FILTER                   */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>Dư Nợ Đến Hạn Theo Các Tháng (Maturity Timeline)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Biểu đồ cột chồng thể hiện phân bổ nghĩa vụ nợ đến hạn theo trình tự thời gian từ trái sang phải.
          </p>
        </div>

        {/* CONTROLS & DROPDOWN */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* THE DROPDOWN SELECTOR: PHÂN LOẠI & LỌC THEO TCTD / DOANH NGHIỆP */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 border border-slate-200 rounded-lg">
            <label
              htmlFor="timeline-dropdown-selector"
              className="text-xs font-semibold text-slate-600 pl-1.5 flex items-center gap-1 shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Hiển thị theo:</span>
            </label>
            <select
              id="timeline-dropdown-selector"
              value={dropdownSelection}
              onChange={(e) => setDropdownSelection(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <optgroup label="── CHẾ ĐỘ PHÂN TẦNG CỘT CHỒNG ──">
                <option value="group:bank">🏦 Theo Tổ chức tín dụng (Toàn bộ)</option>
                <option value="group:borrower">🏢 Theo Chủ thể nhận nợ / Công ty (Toàn bộ)</option>
                <option value="group:contract">📄 Theo Từng khế ước (Đơn sắc)</option>
              </optgroup>

              <optgroup label="── LỌC THEO TỪNG TỔ CHỨC TÍN DỤNG ──">
                {allBanksList.map((b) => (
                  <option key={`opt-bank-${b.bank_code}`} value={`filter:bank:${b.bank_code}`}>
                    TCTD: {b.bank_code} - {b.bank_name} ({b.count} HĐ • {formatShortMoney(b.total)})
                  </option>
                ))}
              </optgroup>

              <optgroup label="── LỌC THEO TỪNG CHỦ THỂ / CÔNG TY ──">
                {allBorrowersList.map((c) => (
                  <option key={`opt-borrower-${c.shortName}`} value={`filter:borrower:${c.shortName}`}>
                    Chủ thể: {c.shortName} ({c.count} HĐ • {formatShortMoney(c.total)})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* RESET FILTER BUTTON IF ACTIVE */}
          {activeFilter && (
            <button
              type="button"
              onClick={() => setDropdownSelection(viewMode === 'borrower' ? 'group:borrower' : 'group:bank')}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1.5 rounded transition-colors shadow-2xs"
              title="Hủy bộ lọc, xem toàn bộ khoản vay"
            >
              <X className="w-3.5 h-3.5" />
              <span>Xem toàn bộ</span>
            </button>
          )}

          {/* TOTAL OBLIGATION BADGE */}
          <div className="text-right pl-2 border-l border-slate-200">
            <span className="text-[11px] text-slate-500 block leading-tight">
              {activeFilter ? 'Gốc đến hạn (Đang lọc):' : 'Tổng gốc đến hạn:'}
            </span>
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {formatVND(currentTotal)}
            </span>
            {activeFilter && (
              <span className="text-[10px] text-slate-400 block leading-tight">
                (Toàn DM: {formatShortMoney(grandTotal)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. STACKED BAR CHART: INTERACTIVE MULTI-DIMENSIONAL STACKS                */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        {/* Main Chart Area */}
        <div className="relative h-[280px] bg-slate-50 border border-slate-200 p-4 sm:p-6 flex items-end justify-between gap-2 sm:gap-4 overflow-x-auto select-none">
          {/* Y-Axis Guideline Grid (Background lines) */}
          <div className="absolute inset-x-4 sm:inset-x-6 top-4 bottom-8 flex flex-col justify-between pointer-events-none opacity-40">
            <div className="border-b border-dashed border-slate-300 w-full" />
            <div className="border-b border-dashed border-slate-300 w-full" />
            <div className="border-b border-dashed border-slate-300 w-full" />
            <div className="border-b border-slate-300 w-full" />
          </div>

          {/* Render Columns for Each Month from Left to Right */}
          {monthsData.map((m) => {
            const columnHeightPct = Math.max(6, Math.round((m.total / maxMonthTotal) * 100));

            // Group loans in this month according to viewMode
            return (
              <div
                key={m.month_key}
                className="flex-1 min-w-[70px] h-full flex flex-col items-center justify-end z-10 group px-1 sm:px-2"
              >
                {/* Top Total Amount Label */}
                <div className="text-[11px] font-bold text-slate-700 mb-1.5 whitespace-nowrap text-center">
                  {formatShortMoney(m.total)}
                </div>

                {/* Stacked Bar Container */}
                <div
                  style={{ height: `${columnHeightPct}%` }}
                  className="w-full max-w-[110px] sm:max-w-[140px] flex flex-col-reverse justify-start border border-indigo-900/40 shadow-xs bg-indigo-50/20"
                >
                  {/* CASE A: GROUP BY CREDIT INSTITUTION (BANK) */}
                  {viewMode === 'bank' &&
                    (() => {
                      // Group loans in this month by bank_code
                      const bankMap = new Map<
                        string,
                        { bank_code: string; bank_name: string; total: number; loans: LoanItemProcessed[] }
                      >();
                      m.loans.forEach((l) => {
                        if (!bankMap.has(l.bank_code)) {
                          bankMap.set(l.bank_code, {
                            bank_code: l.bank_code,
                            bank_name: l.bank_name,
                            total: 0,
                            loans: [],
                          });
                        }
                        const b = bankMap.get(l.bank_code)!;
                        b.total += l.obligation;
                        b.loans.push(l);
                      });
                      const bankGroups = Array.from(bankMap.values()).sort((a, b) => b.total - a.total);

                      return bankGroups.map((bg, bIdx) => {
                        const bankSlicePct = (bg.total / m.total) * 100;
                        const color = getBankColor(bg.bank_code, bIdx);
                        const isHovered =
                          hoveredInfo?.type === 'bank' &&
                          hoveredInfo?.bankCode === bg.bank_code &&
                          hoveredInfo?.monthLabel === m.label;

                        return (
                          <div
                            key={`slice-bank-${m.month_key}-${bg.bank_code}`}
                            style={{ height: `${Math.max(4, bankSlicePct)}%` }}
                            className={`w-full ${color.bg} border-t border-white/70 transition-all cursor-pointer relative flex flex-col-reverse justify-start ${
                              isHovered ? 'ring-2 ring-amber-400 z-20 brightness-110' : color.hover
                            }`}
                            onMouseEnter={() =>
                              setHoveredInfo({
                                type: 'bank',
                                title: `TCTD: ${bg.bank_name} (${bg.bank_code})`,
                                subtitle: `${m.label} • ${bg.loans.length} HĐ`,
                                amount: bg.total,
                                count: bg.loans.length,
                                bankCode: bg.bank_code,
                                monthLabel: m.label,
                              })
                            }
                            onMouseLeave={() => setHoveredInfo(null)}
                            onClick={() => setDropdownSelection(`filter:bank:${bg.bank_code}`)}
                            title={`TCTD: ${bg.bank_name} (${bg.bank_code})\nĐến hạn: ${m.label}\nNghĩa vụ: ${formatVND(bg.total)} (${bg.loans.length} HĐ)\nBấm để lọc TCTD này`}
                          >
                            {/* Sub-slices for individual contracts inside this bank */}
                            {bg.loans.length > 1 &&
                              bg.loans.map((loan) => {
                                const subPct = (loan.obligation / bg.total) * 100;
                                return (
                                  <div
                                    key={`sub-${loan.contract_number}`}
                                    style={{ height: `${subPct}%` }}
                                    className="w-full border-t border-white/30"
                                  />
                                );
                              })}
                          </div>
                        );
                      });
                    })()}

                  {/* CASE B: GROUP BY BORROWER / COMPANY */}
                  {viewMode === 'borrower' &&
                    (() => {
                      // Group loans in this month by borrower_short
                      const borrowerMap = new Map<
                        string,
                        { shortName: string; fullName: string; total: number; loans: LoanItemProcessed[] }
                      >();
                      m.loans.forEach((l) => {
                        const key = l.borrower_short;
                        if (!borrowerMap.has(key)) {
                          borrowerMap.set(key, {
                            shortName: key,
                            fullName: l.borrower_name,
                            total: 0,
                            loans: [],
                          });
                        }
                        const item = borrowerMap.get(key)!;
                        item.total += l.obligation;
                        item.loans.push(l);
                      });
                      const borrowerGroups = Array.from(borrowerMap.values()).sort((a, b) => b.total - a.total);

                      return borrowerGroups.map((cg, cIdx) => {
                        const compSlicePct = (cg.total / m.total) * 100;
                        const color = getBorrowerColor(cg.shortName, cIdx);
                        const isHovered =
                          hoveredInfo?.type === 'borrower' &&
                          hoveredInfo?.borrowerShort === cg.shortName &&
                          hoveredInfo?.monthLabel === m.label;

                        return (
                          <div
                            key={`slice-comp-${m.month_key}-${cg.shortName}`}
                            style={{ height: `${Math.max(4, compSlicePct)}%` }}
                            className={`w-full ${color.bg} border-t border-white/70 transition-all cursor-pointer relative flex flex-col-reverse justify-start ${
                              isHovered ? 'ring-2 ring-amber-400 z-20 brightness-110' : color.hover
                            }`}
                            onMouseEnter={() =>
                              setHoveredInfo({
                                type: 'borrower',
                                title: `Chủ thể: ${cg.shortName}`,
                                subtitle: `${m.label} • ${cg.loans.length} HĐ`,
                                amount: cg.total,
                                count: cg.loans.length,
                                borrowerShort: cg.shortName,
                                monthLabel: m.label,
                              })
                            }
                            onMouseLeave={() => setHoveredInfo(null)}
                            onClick={() => setDropdownSelection(`filter:borrower:${cg.shortName}`)}
                            title={`Chủ thể: ${cg.shortName}\nĐến hạn: ${m.label}\nNghĩa vụ: ${formatVND(cg.total)} (${cg.loans.length} HĐ)\nBấm để lọc Doanh nghiệp này`}
                          >
                            {/* Sub-slices for individual contracts inside this company */}
                            {cg.loans.length > 1 &&
                              cg.loans.map((loan) => {
                                const subPct = (loan.obligation / cg.total) * 100;
                                return (
                                  <div
                                    key={`sub-${loan.contract_number}`}
                                    style={{ height: `${subPct}%` }}
                                    className="w-full border-t border-white/30"
                                  />
                                );
                              })}
                          </div>
                        );
                      });
                    })()}

                  {/* CASE C: INDIVIDUAL CONTRACTS (SOLID BLUE - ORIGINAL VIEW) */}
                  {viewMode === 'contract' &&
                    m.loans.map((loan) => {
                      const slicePct = (loan.obligation / m.total) * 100;
                      const isHovered =
                        hoveredInfo?.type === 'contract' &&
                        hoveredInfo?.contractNumber === loan.contract_number;

                      return (
                        <div
                          key={loan.contract_number}
                          onMouseEnter={() =>
                            setHoveredInfo({
                              type: 'contract',
                              title: `Khế ước: ${loan.contract_number} (${loan.bank_code})`,
                              subtitle: `Đến hạn: ${loan.day_key} • ${loan.borrower_short}`,
                              amount: loan.obligation,
                              count: 1,
                              contractNumber: loan.contract_number,
                              monthLabel: m.label,
                            })
                          }
                          onMouseLeave={() => setHoveredInfo(null)}
                          style={{ height: `${Math.max(3, slicePct)}%` }}
                          className={`w-full bg-indigo-600 border-t border-white/60 transition-colors cursor-pointer ${
                            isHovered
                              ? 'bg-indigo-900 ring-2 ring-amber-400 z-20'
                              : 'hover:bg-indigo-700'
                          }`}
                          title={`HĐ: ${loan.contract_number}\nNH: ${loan.bank_code}\nChủ thể: ${loan.borrower_short}\nĐến hạn: ${loan.day_key}\nSố tiền: ${formatVND(loan.obligation)}`}
                        />
                      );
                    })}
                </div>

                {/* Bottom Month Label */}
                <div className="mt-2 text-center w-full">
                  <span className="block text-xs font-bold text-slate-800">
                    {m.label.replace('Tháng ', 'T')}
                  </span>
                  <span className="block text-[10px] text-slate-500 font-medium">
                    {m.loans.length} HĐ
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hover Information Banner */}
        <div className="min-h-[28px] text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 px-1">
          {hoveredInfo ? (
            <div className="flex items-center gap-2 sm:gap-3 animate-in fade-in duration-150 flex-wrap">
              <span className="font-bold text-slate-900">{hoveredInfo.title}</span>
              {hoveredInfo.subtitle && (
                <>
                  <span>•</span>
                  <span className="text-slate-600 font-medium">{hoveredInfo.subtitle}</span>
                </>
              )}
              <span>•</span>
              <span>
                Nghĩa vụ: <strong className="text-emerald-600 font-bold">{formatVND(hoveredInfo.amount)}</strong>
              </span>
              {hoveredInfo.count && hoveredInfo.count > 1 && (
                <>
                  <span>•</span>
                  <span className="text-indigo-600 font-semibold">{hoveredInfo.count} khế ước</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-slate-400 italic">
              {viewMode === 'bank'
                ? 'Rê chuột vào các tầng để xem TCTD • Bấm vào lát cắt hoặc thẻ chú giải để lọc.'
                : viewMode === 'borrower'
                ? 'Rê chuột vào các tầng để xem Công ty • Bấm vào lát cắt hoặc thẻ chú giải để lọc.'
                : 'Rê chuột vào các đoạn cột chồng để xem chi tiết từng khế ước cụ thể.'}
            </span>
          )}

          {activeFilter && (
            <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
              Đang lọc:{' '}
              {activeFilter.type === 'bank'
                ? `TCTD ${activeFilter.value}`
                : `Chủ thể ${activeFilter.value}`}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* INTERACTIVE LEGEND / PALETTE BAR                                          */}
        {/* ========================================================================= */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] font-bold text-slate-600 mr-1 flex items-center gap-1">
            {viewMode === 'bank' ? (
              <>
                <Landmark className="w-3 h-3 text-indigo-600" />
                <span>Chú giải TCTD:</span>
              </>
            ) : viewMode === 'borrower' ? (
              <>
                <Building2 className="w-3 h-3 text-indigo-600" />
                <span>Chú giải Chủ thể:</span>
              </>
            ) : (
              <span>Chú giải:</span>
            )}
          </span>

          {/* BANK LEGEND BUTTONS */}
          {viewMode === 'bank' &&
            allBanksList.map((b, idx) => {
              const color = getBankColor(b.bank_code, idx);
              const isSelected = activeFilter?.type === 'bank' && activeFilter.value === b.bank_code;

              return (
                <button
                  key={`leg-bank-${b.bank_code}`}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setDropdownSelection('group:bank');
                    } else {
                      setDropdownSelection(`filter:bank:${b.bank_code}`);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border transition-all cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 bg-indigo-50/80 border-indigo-300 font-bold shadow-2xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                  title={`Bấm để ${isSelected ? 'bỏ lọc' : 'lọc xem riêng'} ${b.bank_name}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-xs ${color.bg} shrink-0`} />
                  <span className="font-semibold text-slate-900">{b.bank_code}</span>
                  <span className="text-slate-500 font-normal">({formatShortMoney(b.total)})</span>
                </button>
              );
            })}

          {/* BORROWER LEGEND BUTTONS */}
          {viewMode === 'borrower' &&
            allBorrowersList.map((c, idx) => {
              const color = getBorrowerColor(c.shortName, idx);
              const isSelected = activeFilter?.type === 'borrower' && activeFilter.value === c.shortName;

              return (
                <button
                  key={`leg-comp-${c.shortName}`}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setDropdownSelection('group:borrower');
                    } else {
                      setDropdownSelection(`filter:borrower:${c.shortName}`);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border transition-all cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 bg-indigo-50/80 border-indigo-300 font-bold shadow-2xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                  title={`Bấm để ${isSelected ? 'bỏ lọc' : 'lọc xem riêng'} ${c.shortName}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-xs ${color.bg} shrink-0`} />
                  <span className="font-semibold text-slate-900">{c.shortName}</span>
                  <span className="text-slate-500 font-normal">({formatShortMoney(c.total)})</span>
                </button>
              );
            })}

          {/* CONTRACT VIEW LEGEND */}
          {viewMode === 'contract' && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="w-3 h-3 bg-indigo-600 border border-slate-300 inline-block" />
              <span>Khoản vay đến hạn (Đơn sắc, phẳng)</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DROPDOWN ACCORDION BUTTON FOR DETAIL BREAKDOWN TABLE                   */}
      {/* ========================================================================= */}
      <div className="pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setIsTableOpen(!isTableOpen)}
          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 transition-all text-left"
        >
          <div className="flex items-center gap-2.5">
            <TableIcon className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-800">
              Bảng Chi Tiết Đáo Hạn Theo Tháng & Ngân Hàng
            </span>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 border border-indigo-200">
              {monthsData.length} Tháng (Hàng) × {tableBanksList.length} Ngân Hàng (Cột)
            </span>
            {activeFilter && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200">
                Đang lọc: {activeFilter.type === 'bank' ? activeFilter.value : activeFilter.value}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>{isTableOpen ? 'Thu gọn bảng' : 'Mở rộng bảng chi tiết'}</span>
            {isTableOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-600" />
            )}
          </div>
        </button>

        {/* ========================================================================= */}
        {/* 3. TRANSPOSED DETAIL TABLE: ROWS = MONTHS/DAYS, COLS = BANKS              */}
        {/* ========================================================================= */}
        {isTableOpen && (
          <div className="mt-3 border border-slate-200 bg-white shadow-xs animate-in fade-in duration-200">
            {/* Quick Action Toolbar */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Chức năng xem:</span>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs transition-all"
                  title="Thu gọn để xem tóm tắt theo các tháng"
                >
                  <ChevronsDownUp className="w-3.5 h-3.5 text-slate-600" />
                  <span>Thu gọn tất cả tháng</span>
                </button>
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs transition-all"
                  title="Mở rộng tất cả các ngày có phát sinh nợ đến hạn"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Mở rộng tất cả ngày</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>
                  Đang mở rộng: <strong className="text-indigo-600">{expandedMonths.size}/{monthsData.length}</strong> tháng
                </span>
                <span>•</span>
                <span>
                  Tổng số: <strong className="text-slate-800">{displayLoans.length}</strong> khế ước
                </span>
              </div>
            </div>

            {/* Transposed Table Container: Fixed Layout, Equal Bank Columns */}
            <div className="w-full overflow-x-hidden overflow-y-auto max-h-[640px]">
              <table className="w-full table-fixed border-collapse text-xs text-left">
                <colgroup>
                  {/* Cột 1: Kỳ Hạn Đáo Hạn */}
                  <col className="w-[155px]" />
                  {/* Cột 2..N: Các cột Ngân hàng */}
                  {tableBanksList.map((bank) => (
                    <col key={`col-${bank.bank_code}`} />
                  ))}
                  {/* Cột Cuối: Tổng Gốc Đến Hạn */}
                  <col className="w-[135px]" />
                </colgroup>

                {/* TABLE HEAD: COLUMNS = BANKS */}
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b-2 border-slate-300">
                    {/* Column 1: Time Dimension (Month / Day) */}
                    <th className="px-2.5 py-2.5 font-bold border-r border-slate-300 bg-slate-100 align-top">
                      <div className="flex items-center gap-1.5 text-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="leading-tight break-words">Kỳ Hạn Đáo Hạn</span>
                      </div>
                    </th>

                    {/* Columns 2..N: Bank Organizations */}
                    {tableBanksList.map((bank) => (
                      <th
                        key={bank.bank_code}
                        className="px-1.5 py-2.5 text-center font-bold border-r border-slate-200 bg-slate-100/90 align-top break-words"
                      >
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-white text-indigo-700 font-black text-[11px] border border-indigo-200 shadow-2xs shrink-0">
                            {bank.bank_code}
                          </span>
                          <span
                            className="text-slate-900 text-[11px] leading-tight whitespace-normal break-words"
                            title={bank.bank_name}
                          >
                            {bank.bank_name}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-700 mt-1 leading-tight break-words">
                          {formatVND(bank.total)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          ({bank.count} khế ước)
                        </div>
                      </th>
                    ))}

                    {/* Column Right: Row Total */}
                    <th className="px-2.5 py-2.5 font-bold text-right bg-slate-200 text-slate-900 align-top break-words">
                      Tổng Gốc Đến Hạn
                    </th>
                  </tr>
                </thead>

                {/* TABLE BODY: ROWS = MONTHS (GROUP) + DAYS (CHILD ROWS) */}
                <tbody className="divide-y divide-slate-200">
                  {monthsData.map((m) => {
                    const isExpanded = expandedMonths.has(m.month_key);

                    return (
                      <React.Fragment key={m.month_key}>
                        {/* MONTH ROW */}
                        <tr
                          className={`transition-colors border-b ${
                            isExpanded
                              ? 'bg-indigo-50/70 border-indigo-200'
                              : 'bg-white hover:bg-slate-50/80 border-slate-200'
                          }`}
                        >
                          {/* Column 1: Month Name & Expand/Collapse Toggle */}
                          <td
                            className={`px-2.5 py-2.5 font-bold border-r border-slate-200 cursor-pointer select-none align-top ${
                              isExpanded ? 'bg-indigo-100/80 text-indigo-950' : 'bg-white text-slate-900 hover:bg-slate-50'
                            }`}
                            onClick={() => toggleMonthExpansion(m.month_key)}
                          >
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMonthExpansion(m.month_key);
                                }}
                                className={`p-1 mt-0.5 rounded text-[11px] font-bold flex items-center justify-center border transition-all shrink-0 ${
                                  isExpanded
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                    : 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                                }`}
                                title={isExpanded ? 'Thu gọn xem tóm tắt tháng' : 'Mở rộng xem chi tiết từng ngày'}
                              >
                                {isExpanded ? (
                                  <Minus className="w-3 h-3" />
                                ) : (
                                  <Plus className="w-3 h-3" />
                                )}
                              </button>
                              <div className="min-w-0">
                                <span className="text-xs font-bold block text-slate-900 leading-tight">{m.label}</span>
                                <span className="text-[10px] font-normal text-slate-500 block leading-tight mt-0.5">
                                  {m.days.length} ngày • {m.loans.length} HĐ
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Bank Cells in Month Row */}
                          {tableBanksList.map((bank) => {
                            const bankMonthLoans = m.loans.filter((l) => l.bank_code === bank.bank_code);
                            const bankMonthTotal = bankMonthLoans.reduce((sum, l) => sum + l.obligation, 0);

                            // When month is COLLAPSED
                            if (!isExpanded) {
                              return (
                                <td
                                  key={`col-month-${bank.bank_code}-${m.month_key}`}
                                  className="px-1.5 py-2.5 border-r border-slate-100 align-top text-center break-words"
                                >
                                  {bankMonthTotal > 0 ? (
                                    <div className="space-y-0.5">
                                      <span className="text-[11px] font-bold text-slate-900 block leading-tight break-words">
                                        {formatVND(bankMonthTotal)}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-medium block">
                                        {bankMonthLoans.length} khế ước
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 font-light">-</span>
                                  )}
                                </td>
                              );
                            }

                            // When month is EXPANDED
                            return (
                              <td
                                key={`col-month-exp-${bank.bank_code}-${m.month_key}`}
                                className="px-1.5 py-2.5 border-r border-indigo-200/60 align-top text-center bg-indigo-50/40 break-words"
                              >
                                {bankMonthTotal > 0 ? (
                                  <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold text-indigo-950 block leading-tight break-words">
                                      {formatVND(bankMonthTotal)}
                                    </span>
                                    <span className="text-[10px] text-indigo-700 font-medium block">
                                      {bankMonthLoans.length} khế ước
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Column Right: Month Total */}
                          <td className="px-2.5 py-2.5 text-right font-black text-slate-900 bg-slate-100/70 align-top break-words">
                            <span className="text-[11px] block leading-tight">{formatVND(m.total)}</span>
                            <span className="text-[10px] text-slate-500 font-normal block">
                              {m.loans.length} HĐ
                            </span>
                          </td>
                        </tr>

                        {/* CHILD ROWS: INDIVIDUAL DAYS */}
                        {isExpanded &&
                          m.days.map((d) => (
                            <tr
                              key={`row-day-${d.day_key}`}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                            >
                              {/* Column 1: Indented Day Cell */}
                              <td className="bg-white hover:bg-slate-50 px-2.5 py-2 pl-5 border-r border-slate-200 align-top">
                                <div className="flex items-center gap-1 text-slate-800">
                                  <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="font-bold text-[11px] leading-tight">Ngày {d.day_key}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 block pl-4">
                                  {d.loans.length} HĐ đến hạn
                                </span>
                              </td>

                              {/* Bank Columns for this Day */}
                              {tableBanksList.map((bank) => {
                                const bankDayLoans = d.loans.filter((l) => l.bank_code === bank.bank_code);
                                const bankDayTotal = bankDayLoans.reduce((sum, l) => sum + l.obligation, 0);

                                return (
                                  <td
                                    key={`cell-day-${bank.bank_code}-${d.day_key}`}
                                    className="px-1.5 py-1.5 border-r border-slate-100 align-top text-center overflow-hidden"
                                  >
                                    {bankDayLoans.length === 0 ? (
                                      <span className="text-slate-300 font-light">-</span>
                                    ) : (
                                      <div className="space-y-1.5 text-left">
                                        {bankDayLoans.map((l) => (
                                          <div
                                            key={l.contract_number}
                                            className="p-1.5 bg-white hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 rounded transition-all text-left shadow-2xs group cursor-pointer break-words"
                                            title={`HĐ: ${l.contract_number}\nChủ thể: ${l.borrower_name}\nĐến hạn: ${l.day_key}\nNghĩa vụ: ${formatVND(l.obligation)}`}
                                          >
                                            <div className="text-[10px] font-bold text-indigo-950 font-mono leading-tight break-all">
                                              {l.contract_number}
                                            </div>
                                            <div className="text-[11px] font-bold text-slate-900 mt-0.5 leading-tight break-words">
                                              {formatVND(l.obligation)}
                                            </div>
                                            <div
                                              className="text-[10px] text-slate-500 mt-0.5 leading-tight whitespace-normal break-words"
                                              title={l.borrower_name}
                                            >
                                              {l.borrower_short}
                                            </div>
                                          </div>
                                        ))}

                                        {bankDayLoans.length > 1 && (
                                          <div className="text-[10px] font-bold text-indigo-900 text-right pt-0.5 border-t border-slate-200 break-words">
                                            Tổng: {formatVND(bankDayTotal)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Day Row Total */}
                              <td className="px-2.5 py-2 text-right font-bold text-slate-800 bg-slate-50 align-top break-words">
                                <span className="text-[11px] block leading-tight">{formatVND(d.total)}</span>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {d.loans.length} HĐ
                                </span>
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* TABLE FOOTER */}
                <tfoot>
                  <tr className="bg-slate-200 text-slate-900 font-bold border-t-2 border-slate-400">
                    <td className="bg-slate-200 px-2.5 py-2.5 border-r border-slate-300 align-top break-words">
                      <div className="font-black text-[11px] text-slate-900 leading-tight">TỔNG CỘNG NGÂN HÀNG</div>
                      <div className="text-[10px] text-slate-600 font-normal mt-0.5">
                        {displayLoans.length} khế ước đáo hạn
                      </div>
                    </td>

                    {/* Bank Totals */}
                    {tableBanksList.map((bank) => (
                      <td
                        key={`foot-${bank.bank_code}`}
                        className="px-1.5 py-2.5 text-center border-r border-slate-300 align-top break-words"
                      >
                        <span className="text-[11px] font-black text-slate-900 block leading-tight break-words">
                          {formatVND(bank.total)}
                        </span>
                        <span className="text-[10px] text-slate-600 font-normal">
                          {bank.count} khế ước
                        </span>
                      </td>
                    ))}

                    {/* Grand Total */}
                    <td className="px-2.5 py-2.5 text-right font-black text-xs text-indigo-950 bg-indigo-100/90 border-l border-slate-300 align-top break-words">
                      <span className="text-xs block leading-tight">{formatVND(currentTotal)}</span>
                      <span className="text-[10px] text-indigo-800 font-normal">
                        {activeFilter ? 'Dư nợ đang lọc' : '100% dư nợ gốc'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Hint footer */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>
                💡 Bảng chỉ theo dõi <strong>số tiền gốc đến hạn</strong> (đã loại trừ lãi), khớp 100% với tổng dư nợ thực tế của danh mục.
              </span>
              <span>
                Bấm vào nút <strong>[+]</strong> hoặc dòng tháng để mở rộng chi tiết các ngày đáo hạn.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
