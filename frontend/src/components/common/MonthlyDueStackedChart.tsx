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
} from 'lucide-react';
import { CreditFacility } from '../../types';

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
  due_date: string; // YYYY-MM-DD
  month_key: string; // YYYY-MM
  month_label: string; // Tháng MM/YYYY
  day_key: string; // DD/MM/YYYY
  day_short: string; // DD/MM
  obligation: number;
  principal: number;
  interest: number;
}

export const MonthlyDueStackedChart: React.FC<MonthlyDueStackedChartProps> = ({
  loans,
  formatVND,
}) => {
  // Dropdown open/close state for detail breakdown table (default open)
  const [isTableOpen, setIsTableOpen] = useState<boolean>(true);

  // Expanded months set: which months are currently expanded to show individual days as child rows
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Hovered loan in stacked bar for interactive tooltip
  const [hoveredLoan, setHoveredLoan] = useState<LoanItemProcessed | null>(null);

  // Helper for compact money formatting (used exclusively on top of bar charts)
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
      // - Nếu có kỳ trả gốc cụ thể: lấy next_principal_amount
      // - Nếu khoản vay đáo hạn trả gốc một lần cuối kỳ: lấy dư nợ gốc hiện tại curBal
      const principalDue = nextP > 0 ? nextP : curBal;
      if (principalDue <= 0) return;

      // NGÀY ĐẾN HẠN GỐC:
      // Nếu có next_principal_amount > 0 thì dùng next_repayment_date, nếu trả gốc cuối kỳ thì lấy maturity_date
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
        due_date: dateStr,
        month_key,
        month_label,
        day_key,
        day_short,
        obligation: principalDue, // Số tiền gốc đến hạn (không tính lãi)
        principal: principalDue,
        interest: 0,
      });
    });
    return list;
  }, [loans]);

  // Group by Month (sorted chronologically from left to right)
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

    processedLoans.forEach((l) => {
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
  }, [processedLoans]);

  // Unique Banks list (Columns in Transposed Table), sorted descending by total obligation
  const banksList = useMemo(() => {
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

  // Max month total for stacked bar chart scaling
  const maxMonthTotal = useMemo(() => {
    if (monthsData.length === 0) return 1;
    return Math.max(...monthsData.map((m) => m.total));
  }, [monthsData]);

  // Grand total obligation
  const grandTotal = useMemo(() => {
    return monthsData.reduce((sum, m) => sum + m.total, 0);
  }, [monthsData]);

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
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>Dư Nợ Đến Hạn Theo Các Tháng (Maturity Timeline)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Biểu đồ cột chồng thể hiện phân bổ nghĩa vụ nợ đến hạn theo trình tự thời gian từ trái sang phải.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500">Tổng gốc đến hạn:</span>
          <span className="ml-2 text-sm font-bold text-slate-900">
            {formatVND(grandTotal)}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. STACKED BAR CHART: EXACT 1 SOLID COLOR, NO ROUNDED, NO GRADIENT        */}
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

          {/* Render Columns for Each Month from Left to Right (Distributed evenly across full width) */}
          {monthsData.map((m) => {
            const columnHeightPct = Math.max(6, Math.round((m.total / maxMonthTotal) * 100));

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
                  className="w-full max-w-[110px] sm:max-w-[140px] flex flex-col-reverse justify-start border border-indigo-900/40 shadow-xs bg-indigo-50/30"
                >
                  {/* Each Loan Slice: 1 SOLID COLOR (bg-indigo-600), NO ROUNDED, NO GRADIENT */}
                  {m.loans.map((loan) => {
                    const slicePct = (loan.obligation / m.total) * 100;
                    const isHovered = hoveredLoan?.contract_number === loan.contract_number;

                    return (
                      <div
                        key={loan.contract_number}
                        onMouseEnter={() => setHoveredLoan(loan)}
                        onMouseLeave={() => setHoveredLoan(null)}
                        style={{ height: `${Math.max(3, slicePct)}%` }}
                        className={`w-full bg-indigo-600 border-t border-white/60 transition-colors cursor-pointer ${
                          isHovered
                            ? 'bg-indigo-900 ring-2 ring-amber-400 z-20'
                            : 'hover:bg-indigo-700'
                        }`}
                        title={`HĐ: ${loan.contract_number}\nNH: ${loan.bank_code}\nĐến hạn: ${loan.day_key}\nSố tiền: ${formatVND(loan.obligation)}`}
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

        {/* Hover Information Banner / Legend */}
        <div className="min-h-[28px] text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 px-1">
          {hoveredLoan ? (
            <div className="flex items-center gap-3 animate-in fade-in duration-150">
              <span className="font-semibold text-slate-900">
                Khế ước: <strong className="text-indigo-600">{hoveredLoan.contract_number}</strong> ({hoveredLoan.bank_code})
              </span>
              <span>•</span>
              <span>
                Đến hạn: <strong>{hoveredLoan.day_key}</strong>
              </span>
              <span>•</span>
              <span>
                Nghĩa vụ: <strong className="text-emerald-600">{formatVND(hoveredLoan.obligation)}</strong>
              </span>
              <span>•</span>
              <span className="text-slate-500 italic truncate max-w-xs" title={hoveredLoan.borrower_name}>
                {hoveredLoan.borrower_name}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">
              Rê chuột vào các đoạn cột chồng để xem chi tiết từng khế ước cụ thể.
            </span>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-3 h-3 bg-indigo-600 border border-slate-300 inline-block" />
            <span>Khoản vay đến hạn (Đơn sắc, phẳng)</span>
          </div>
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
              {monthsData.length} Tháng (Hàng) × {banksList.length} Ngân Hàng (Cột)
            </span>
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
                  Tổng số: <strong className="text-slate-800">{processedLoans.length}</strong> khế ước
                </span>
              </div>
            </div>

            {/* Scrollable Transposed Table Container */}
            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full border-collapse text-xs text-left min-w-[1000px]">
                {/* TABLE HEAD: COLUMNS = BANKS */}
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b-2 border-slate-300">
                    {/* Column 1: Time Dimension (Month / Day) */}
                    <th className="sticky left-0 z-20 bg-slate-100 px-3.5 py-3 font-bold border-r border-slate-300 min-w-[220px] shadow-xs">
                      <div className="flex items-center gap-1.5 text-slate-800">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Kỳ Hạn Đáo Hạn</span>
                      </div>
                    </th>

                    {/* Columns 2..N: Bank Organizations */}
                    {banksList.map((bank) => (
                      <th
                        key={bank.bank_code}
                        className="px-3 py-3 text-center font-bold border-r border-slate-200 min-w-[190px] bg-slate-100/90"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-white text-indigo-700 font-black text-xs border border-indigo-200 shadow-2xs">
                            {bank.bank_code}
                          </span>
                          <span className="truncate max-w-[120px] text-slate-900" title={bank.bank_name}>
                            {bank.bank_name}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-600 mt-1">
                          {formatVND(bank.total)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          ({bank.count} khế ước)
                        </div>
                      </th>
                    ))}

                    {/* Column Right: Row Total (All banks in this period) */}
                    <th className="px-3.5 py-3 font-bold text-right bg-slate-200 text-slate-900 min-w-[180px]">
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
                        {/* ======================================================= */}
                        {/* MONTH ROW (Parent / Group Row)                          */}
                        {/* ======================================================= */}
                        <tr
                          className={`transition-colors border-b ${
                            isExpanded
                              ? 'bg-indigo-50/70 border-indigo-200'
                              : 'bg-white hover:bg-slate-50/80 border-slate-200'
                          }`}
                        >
                          {/* Column 1: Month Name & Expand/Collapse Toggle */}
                          <td
                            className={`sticky left-0 z-10 px-3.5 py-3 font-bold border-r border-slate-200 shadow-xs cursor-pointer select-none align-top ${
                              isExpanded ? 'bg-indigo-100/80 text-indigo-950' : 'bg-white text-slate-900 hover:bg-slate-50'
                            }`}
                            onClick={() => toggleMonthExpansion(m.month_key)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMonthExpansion(m.month_key);
                                  }}
                                  className={`p-1 mt-0.5 rounded text-[11px] font-bold flex items-center justify-center border transition-all ${
                                    isExpanded
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                      : 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                                  }`}
                                  title={isExpanded ? 'Thu gọn xem tóm tắt tháng' : 'Mở rộng xem chi tiết từng ngày'}
                                >
                                  {isExpanded ? (
                                    <Minus className="w-3.5 h-3.5" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <div>
                                  <span className="text-sm font-bold block text-slate-900">{m.label}</span>
                                  <span className="text-[10px] font-normal text-slate-500 block">
                                    {m.days.length} ngày phát sinh • {m.loans.length} HĐ
                                  </span>
                                </div>
                              </div>

                              <span className="text-[10px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">
                                {isExpanded ? 'Đang mở' : 'Bấm để mở'}
                              </span>
                            </div>
                          </td>

                          {/* Bank Cells in Month Row */}
                          {banksList.map((bank) => {
                            const bankMonthLoans = m.loans.filter((l) => l.bank_code === bank.bank_code);
                            const bankMonthTotal = bankMonthLoans.reduce((sum, l) => sum + l.obligation, 0);

                            // When month is COLLAPSED: ONLY SHOW SUMMARY TOTAL (SỐ TỔNG), NO INDIVIDUAL CARDS
                            if (!isExpanded) {
                              return (
                                <td
                                  key={`col-month-${bank.bank_code}-${m.month_key}`}
                                  className="px-3 py-3 border-r border-slate-100 align-top text-center"
                                >
                                  {bankMonthTotal > 0 ? (
                                    <div className="space-y-0.5">
                                      <span className="text-xs font-bold text-slate-900 block">
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

                            // When month is EXPANDED: Month Row acts as a group summary bar
                            return (
                              <td
                                key={`col-month-exp-${bank.bank_code}-${m.month_key}`}
                                className="px-3 py-3 border-r border-indigo-200/60 align-top text-center bg-indigo-50/40"
                              >
                                {bankMonthTotal > 0 ? (
                                  <div className="space-y-0.5">
                                    <span className="text-xs font-bold text-indigo-950 block">
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
                          <td className="px-3.5 py-3 text-right font-black text-slate-900 bg-slate-100/70 align-top">
                            <span className="text-xs block">{formatVND(m.total)}</span>
                            <span className="text-[10px] text-slate-500 font-normal block">
                              {m.loans.length} HĐ
                            </span>
                          </td>
                        </tr>

                        {/* ======================================================= */}
                        {/* CHILD ROWS: INDIVIDUAL DAYS (ONLY WHEN EXPANDED)        */}
                        {/* ======================================================= */}
                        {isExpanded &&
                          m.days.map((d) => (
                            <tr
                              key={`row-day-${d.day_key}`}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                            >
                              {/* Column 1: Indented Day Cell */}
                              <td className="sticky left-0 z-10 bg-white hover:bg-slate-50 px-3.5 py-2 pl-9 border-r border-slate-200 shadow-xs">
                                <div className="flex items-center gap-1.5 text-slate-800">
                                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                  <span className="font-bold text-xs">Ngày {d.day_key}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 block pl-5">
                                  {d.loans.length} HĐ đến hạn
                                </span>
                              </td>

                              {/* Bank Columns for this Day */}
                              {banksList.map((bank) => {
                                const bankDayLoans = d.loans.filter((l) => l.bank_code === bank.bank_code);
                                const bankDayTotal = bankDayLoans.reduce((sum, l) => sum + l.obligation, 0);

                                return (
                                  <td
                                    key={`cell-day-${bank.bank_code}-${d.day_key}`}
                                    className="px-2.5 py-2 border-r border-slate-100 align-top text-center"
                                  >
                                    {bankDayLoans.length === 0 ? (
                                      <span className="text-slate-300 font-light">-</span>
                                    ) : (
                                      <div className="space-y-1.5 text-left">
                                        {/* THẺ CON TỪNG KHẾ ƯỚC TRONG NGÀY: SỐ TIỀN ĐẦY ĐỦ KHÔNG RÚT GỌN */}
                                        {bankDayLoans.map((l) => (
                                          <div
                                            key={l.contract_number}
                                            className="p-2 bg-white hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 rounded transition-all text-left shadow-2xs group cursor-pointer"
                                            title={`HĐ: ${l.contract_number}\nChủ thể: ${l.borrower_name}\nĐến hạn: ${l.day_key}\nNghĩa vụ: ${formatVND(l.obligation)}`}
                                          >
                                            <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-indigo-950">
                                              <span className="font-mono tracking-tight">{l.contract_number}</span>
                                            </div>
                                            {/* SỐ TIỀN ĐẦY ĐỦ KHÔNG RÚT GỌN */}
                                            <div className="text-xs font-bold text-slate-900 mt-1">
                                              {formatVND(l.obligation)}
                                            </div>
                                            <div className="text-[10px] text-slate-500 truncate mt-0.5" title={l.borrower_name}>
                                              {l.borrower_name}
                                            </div>
                                          </div>
                                        ))}

                                        {/* Subtotal if multiple loans on same day */}
                                        {bankDayLoans.length > 1 && (
                                          <div className="text-[10px] font-bold text-indigo-900 text-right pt-0.5 border-t border-slate-200">
                                            Tổng: {formatVND(bankDayTotal)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Day Row Total */}
                              <td className="px-3.5 py-2 text-right font-bold text-slate-800 bg-slate-50">
                                <span className="text-xs block">{formatVND(d.total)}</span>
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

                {/* TABLE FOOTER: SUMMARY ROW ACROSS ALL BANKS */}
                <tfoot>
                  <tr className="bg-slate-200 text-slate-900 font-bold border-t-2 border-slate-400">
                    <td className="sticky left-0 z-10 bg-slate-200 px-3.5 py-3 border-r border-slate-300 shadow-xs">
                      <div className="font-black text-xs text-slate-900">TỔNG CỘNG THEO NGÂN HÀNG</div>
                      <div className="text-[10px] text-slate-600 font-normal">
                        Toàn bộ {processedLoans.length} khế ước đáo hạn
                      </div>
                    </td>

                    {/* Bank Totals */}
                    {banksList.map((bank) => (
                      <td
                        key={`foot-${bank.bank_code}`}
                        className="px-3 py-3 text-right border-r border-slate-300"
                      >
                        <span className="text-xs font-black text-slate-900 block">
                          {formatVND(bank.total)}
                        </span>
                        <span className="text-[10px] text-slate-600 font-normal">
                          {bank.count} khế ước
                        </span>
                      </td>
                    ))}

                    {/* Grand Total */}
                    <td className="px-3.5 py-3 text-right font-black text-xs text-indigo-950 bg-indigo-100/90 border-l border-slate-300">
                      <span className="text-sm block">{formatVND(grandTotal)}</span>
                      <span className="text-[10px] text-indigo-800 font-normal">
                        100% dư nợ gốc
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
