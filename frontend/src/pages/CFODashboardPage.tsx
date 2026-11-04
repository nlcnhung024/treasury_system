import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Building2,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Layers,
  ShieldCheck,
  PieChart,
  UserCheck,
  CreditCard,
  Landmark,
  ArrowUpRight,
} from 'lucide-react';
import api from '../services/api';
import {
  CFOLiquidityData,
  CFOBankBreakdownItem,
  Transaction,
  CreditFacilitySummary,
} from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { SortDirection, sortList } from '../utils/sort';

type TimeframeType = 'TODAY' | 'YESTERDAY' | 'WTD' | 'MTD' | 'ALL' | 'CUSTOM';

export const CFODashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const [data, setData] = useState<CFOLiquidityData | null>(null);
  const [debtSummary, setDebtSummary] = useState<CreditFacilitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Bộ lọc Kỳ báo cáo & Điều kiện điều hành CFO
  const [timeframe, setTimeframe] = useState<TimeframeType>('MTD');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [excludeInternal, setExcludeInternal] = useState<boolean>(true);
  const [selectedBankCode, setSelectedBankCode] = useState<string>('');
  const [selectedHolder, setSelectedHolder] = useState<string>('');

  // Drill-down giao dịch chi tiết của từng tài khoản ngay trên bảng
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [drilldownTxs, setDrilldownTxs] = useState<Transaction[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState<boolean>(false);
  const [drilldownFlowFilter, setDrilldownFlowFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [drilldownSort, setDrilldownSort] = useState<'AMOUNT_DESC' | 'DATE_DESC'>('DATE_DESC');

  useEffect(() => {
    if (timeframe !== 'CUSTOM') {
      fetchAllData();
    }
  }, [timeframe, excludeInternal]);

  const fetchAllData = async (customFrom?: string, customTo?: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const fDate = customFrom !== undefined ? customFrom : fromDate;
      const tDate = customTo !== undefined ? customTo : toDate;

      const [liqRes, debtRes] = await Promise.all([
        api.get('/reports/cfo/daily-liquidity', {
          params: {
            timeframe,
            from_date: fDate || undefined,
            to_date: tDate || undefined,
            exclude_internal_transfers: excludeInternal,
          },
        }),
        api.get('/loans/summary').catch((e) => {
          console.warn('Không thể tải tổng quan nợ vay:', e);
          return { data: null };
        }),
      ]);
      setData(liqRes.data);
      if (debtRes?.data) {
        setDebtSummary(debtRes.data);
      }

      // Nếu đang mở drill-down của 1 tài khoản, làm mới luôn danh sách giao dịch kỳ đó
      if (expandedAccountId !== null) {
        fetchAccountDrilldown(
          expandedAccountId,
          liqRes.data.period_start,
          liqRes.data.period_end
        );
      }
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu CFO Dashboard:', err);
      setFetchError(
        err?.response?.data?.detail ||
          err?.message ||
          'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra dịch vụ và bấm Làm mới.'
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountDrilldown = async (
    accId: number,
    pStart?: string,
    pEnd?: string
  ) => {
    setLoadingDrilldown(true);
    try {
      const res = await api.get('/transactions', {
        params: {
          account_id: accId,
          from_date: pStart || data?.period_start || undefined,
          to_date: pEnd || data?.period_end || undefined,
          limit: 100,
          page: 1,
        },
      });
      setDrilldownTxs(res.data.data || []);
    } catch (err) {
      console.error(err);
      setDrilldownTxs([]);
    } finally {
      setLoadingDrilldown(false);
    }
  };

  const handleToggleAccountExpand = (accId?: number) => {
    if (!accId) return;
    if (expandedAccountId === accId) {
      setExpandedAccountId(null);
      setDrilldownTxs([]);
    } else {
      setExpandedAccountId(accId);
      setDrilldownFlowFilter('ALL');
      fetchAccountDrilldown(accId, data?.period_start, data?.period_end);
    }
  };

  const handleExportCFOExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get('/reports/cfo/export-excel', {
        params: {
          timeframe,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          exclude_internal_transfers: excludeInternal,
          bank_code: selectedBankCode || undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const dateSuffix = data?.period_end || new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Bao_Cao_Ton_Quy_CFO_${dateSuffix}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Không thể xuất file Excel Báo cáo Tồn quỹ lúc này.');
    } finally {
      setExporting(false);
    }
  };

  // Danh sách Ngân hàng và Chủ TK/Pháp nhân phục vụ lọc nhanh trên bảng
  const availableBanks = useMemo(() => {
    const codes = new Set<string>();
    (data?.bank_breakdown || []).forEach((b) => codes.add(b.bank_code));
    return Array.from(codes).sort();
  }, [data]);

  const availableHolders = useMemo(() => {
    const holders = new Set<string>();
    (data?.bank_breakdown || []).forEach((b) => {
      if (b.account_holder) holders.add(b.account_holder);
    });
    return Array.from(holders).sort();
  }, [data]);

  const filteredBankItems = useMemo(() => {
    return (data?.bank_breakdown || []).filter((item) => {
      if (selectedBankCode && item.bank_code !== selectedBankCode) return false;
      if (selectedHolder && item.account_holder !== selectedHolder) return false;
      return true;
    });
  }, [data, selectedBankCode, selectedHolder]);

  // Tách Khối 1 (TK Doanh nghiệp) và Khối 2 (TK Ủy quyền CEO)
  const corporateAccounts = useMemo(
    () => filteredBankItems.filter((b) => b.account_type !== 'SPECIAL_CASH'),
    [filteredBankItems]
  );
  const specialCashAccounts = useMemo(
    () => filteredBankItems.filter((b) => b.account_type === 'SPECIAL_CASH'),
    [filteredBankItems]
  );

  // Tính Tiểu tổng từng Khối
  const calcSubtotal = (items: CFOBankBreakdownItem[]) => {
    const open = items.reduce((s, i) => s + Number(i.opening_balance || 0), 0);
    const inflow = items.reduce((s, i) => s + Number(i.total_inflow || 0), 0);
    const outflow = items.reduce((s, i) => s + Number(i.total_outflow || 0), 0);
    const close = items.reduce((s, i) => s + Number(i.closing_balance ?? i.balance ?? 0), 0);
    const net = close - open;
    const share = items.reduce((s, i) => s + Number(i.share_pct || 0), 0);
    const txCount = items.reduce((s, i) => s + Number(i.period_tx_count || 0), 0);
    const pct = open !== 0 ? (net / Math.abs(open)) * 100 : null;
    return { open, inflow, outflow, close, net, pct, share, txCount };
  };

  const corpSub = useMemo(() => calcSubtotal(corporateAccounts), [corporateAccounts]);
  const specSub = useMemo(() => calcSubtotal(specialCashAccounts), [specialCashAccounts]);

  // Dữ liệu Biểu đồ 1: Phân bổ Tồn quỹ theo Ngân hàng (chỉ tính các Tài khoản Ngân hàng)
  const bankAllocationChart = useMemo(() => {
    const map = new Map<string, { label: string; balance: number; color: string }>();
    const palette: Record<string, string> = {
      MBB: '#2563EB',
      VPB: '#059669',
      CTG: '#0284C7',
      TPB: '#7C3AED',
      MBV: '#0D9488',
      SHB: '#EA580C',
      VCB: '#16A34A',
      TCB: '#DC2626',
    };
    filteredBankItems.forEach((b) => {
      const curr = map.get(b.bank_code) || {
        label: b.bank_code,
        balance: 0,
        color: palette[b.bank_code] || '#3B82F6',
      };
      curr.balance += Number(b.closing_balance ?? b.balance ?? 0);
      map.set(b.bank_code, curr);
    });
    const arr = Array.from(map.values()).sort((a, b) => b.balance - a.balance);
    const totalPos = arr.reduce((s, x) => s + Math.max(0, x.balance), 0);
    return arr.map((x) => ({
      ...x,
      pct: totalPos > 0 && x.balance > 0 ? (x.balance / totalPos) * 100 : 0,
    }));
  }, [filteredBankItems]);

  // Dữ liệu giao dịch trong Drill-down đã lọc và sắp xếp
  const [drillSortField, setDrillSortField] = useState<string>('transaction_date');
  const [drillSortDirection, setDrillSortDirection] = useState<SortDirection>('desc');
  const handleDrillSort = (field: string) => {
    if (drillSortField === field) {
      setDrillSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDrillSortField(field);
      setDrillSortDirection('asc');
    }
  };

  const displayedDrilldownTxs = useMemo(() => {
    let list = [...drilldownTxs];
    if (drilldownFlowFilter === 'CREDIT') {
      list = list.filter((t) => Number(t.credit_amount) > 0);
    } else if (drilldownFlowFilter === 'DEBIT') {
      list = list.filter((t) => Number(t.debit_amount) > 0);
    }
    return sortList(list, drillSortField, drillSortDirection, {
      amount: (t) => Math.max(Number(t.credit_amount || 0), Number(t.debit_amount || 0)),
    });
  }, [drilldownTxs, drilldownFlowFilter, drillSortField, drillSortDirection]);

  // Sắp xếp Bảng Thống kê Giao dịch (Table 2)
  const [summarySortField, setSummarySortField] = useState<string>('bank_code');
  const [summarySortDirection, setSummarySortDirection] = useState<SortDirection>('asc');
  const handleSummarySort = (field: string) => {
    if (summarySortField === field) {
      setSummarySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSummarySortField(field);
      setSummarySortDirection('asc');
    }
  };
  const sortedSummaryBankItems = useMemo(() => {
    return sortList(filteredBankItems, summarySortField, summarySortDirection, {
      account: (b) => `${b.bank_code || ''} ${b.account_number || ''}`,
      net_flow: (b) => (b.total_inflow || 0) - (b.total_outflow || 0),
    });
  }, [filteredBankItems, summarySortField, summarySortDirection]);

  // Sắp xếp Bảng Chi tiết Tồn quỹ Các Tài khoản (Table 3)
  const [cfoTableSortField, setCfoTableSortField] = useState<string>('closing_balance');
  const [cfoTableSortDirection, setCfoTableSortDirection] = useState<SortDirection>('desc');
  const handleCfoTableSort = (field: string) => {
    if (cfoTableSortField === field) {
      setCfoTableSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCfoTableSortField(field);
      setCfoTableSortDirection('asc');
    }
  };
  const sortedCorporateAccounts = useMemo(() => {
    return sortList(corporateAccounts, cfoTableSortField, cfoTableSortDirection, {
      account: (b) => `${b.bank_code || ''} ${b.account_number || ''}`,
      closing_balance: (b) => b.closing_balance ?? b.balance ?? 0,
    });
  }, [corporateAccounts, cfoTableSortField, cfoTableSortDirection]);

  const sortedSpecialCashAccounts = useMemo(() => {
    return sortList(specialCashAccounts, cfoTableSortField, cfoTableSortDirection, {
      account: (b) => `${b.bank_code || ''} ${b.account_number || ''}`,
      closing_balance: (b) => b.closing_balance ?? b.balance ?? 0,
    });
  }, [specialCashAccounts, cfoTableSortField, cfoTableSortDirection]);

  const formatMoney = (val?: number | null) => {
    const num = Number(val || 0);
    return num.toLocaleString('vi-VN');
  };

  const formatSignedMoney = (val?: number | null) => {
    const num = Number(val || 0);
    if (num > 0) return `+${num.toLocaleString('vi-VN')}`;
    return num.toLocaleString('vi-VN');
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return 'Chưa có GD';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const datePart = d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = d.getSeconds();
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return datePart;
    }
    const timePart = d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `${datePart} ${timePart}`;
  };

  const renderReconciliationBadge = (item: CFOBankBreakdownItem) => {
    if (item.reconciliation_status === 'DISCREPANCY') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300">
          <AlertTriangle className="w-3 h-3" />
          Lệch {formatMoney(item.discrepancy_amount)}
        </span>
      );
    }
    if (item.reconciliation_status === 'UNANCHORED') {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/transactions?account_id=${item.account_id}`);
          }}
          title="Mẫu sổ phụ cá nhân chưa có số dư gốc. Bấm để gán Điểm neo Số dư lũy kế."
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors"
        >
          <AlertTriangle className="w-3 h-3" />
          Cần neo số dư
        </button>
      );
    }
    if (item.reconciliation_status === 'NO_STATEMENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
          Chưa nạp sao kê
        </span>
      );
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          Khớp 100%
        </span>
        {item.has_data_gap && (
          <span
            title={item.data_gap_desc || 'Có khoảng trống trong dữ liệu sao kê'}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300"
          >
            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
            Khuyết sao kê
          </span>
        )}
      </div>
    );
  };

  const renderAccountRow = (b: CFOBankBreakdownItem) => {
    const isExpanded = expandedAccountId === b.account_id;
    const netVal = Number(b.net_change || 0);
    const closeVal = Number(b.closing_balance ?? b.balance ?? 0);
    const shareVal = Math.min(100, Math.max(0, Number(b.share_pct || 0)));

    return (
      <React.Fragment key={b.account_id || b.account_number}>
        <tr
          onClick={() => handleToggleAccountExpand(b.account_id)}
          className={`cursor-pointer transition-colors ${
            isExpanded ? 'bg-blue-50/70' : 'hover:bg-slate-50'
          }`}
        >
          {/* Cột 1: Ngân hàng & Tài khoản */}
          <td className="px-4 py-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="mt-0.5 p-0.5 rounded hover:bg-slate-200 text-slate-500"
                title="Bấm để xem chi tiết giao dịch trong kỳ"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-blue-600" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[11px]">
                    {b.bank_code}
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {b.account_number}
                  </span>
                  {b.has_data_gap && (
                    <span
                      title={b.data_gap_desc || 'Lệch số dư giữa số dư cuối kỳ trước và đầu kỳ sau'}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold border border-amber-300"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Lệch số dư ĐK/CK
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5 truncate max-w-[230px]" title={b.account_holder}>
                  {b.account_holder}
                </div>
                <div className="text-[10px] text-slate-400">{b.bank_name}</div>
              </div>
            </div>
          </td>

          {/* Cột 2: Số dư Đầu kỳ */}
          <td className="px-3 py-3 text-right font-mono text-slate-700">
            {formatMoney(b.opening_balance)}
          </td>

          {/* Cột 3: Tổng Thu trong kỳ */}
          <td className="px-3 py-3 text-right font-mono">
            <div className="text-emerald-700 font-semibold">
              +{formatMoney(b.total_inflow)}
            </div>
            {Number(b.internal_inflow) > 0 && (
              <div className="text-[10px] text-slate-400" title="Trong đó thu luân chuyển nội bộ">
                (Nội bộ: {formatMoney(b.internal_inflow)})
              </div>
            )}
          </td>

          {/* Cột 4: Tổng Chi trong kỳ */}
          <td className="px-3 py-3 text-right font-mono">
            <div className="text-rose-600 font-semibold">
              -{formatMoney(b.total_outflow)}
            </div>
            {Number(b.internal_outflow) > 0 && (
              <div className="text-[10px] text-slate-400" title="Trong đó chi luân chuyển nội bộ / rút TM">
                (Nội bộ: {formatMoney(b.internal_outflow)})
              </div>
            )}
          </td>

          {/* Cột 5: Số dư Cuối kỳ */}
          <td
            className={`px-3 py-3 text-right font-mono font-bold text-xs ${
              closeVal < 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatMoney(closeVal)}
          </td>

          {/* Cột 6: Biến động ròng (+/- và %) */}
          <td className="px-3 py-3 text-right font-mono">
            <div
              className={`font-semibold ${
                netVal > 0
                  ? 'text-emerald-700'
                  : netVal < 0
                  ? 'text-rose-600'
                  : 'text-slate-500'
              }`}
            >
              {formatSignedMoney(netVal)}
            </div>
            {b.net_change_pct !== null && b.net_change_pct !== undefined && (
              <div className="text-[10px] text-slate-400">
                ({Number(b.net_change_pct) > 0 ? '+' : ''}
                {Number(b.net_change_pct).toFixed(1)}%)
              </div>
            )}
          </td>

          {/* Cột 7: Tỷ trọng % */}
          <td className="px-3 py-3 w-28">
            <div className="flex items-center justify-end gap-1.5 font-mono text-xs font-semibold text-slate-700">
              <span>{Number(b.share_pct || 0).toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${shareVal}%` }}
              />
            </div>
          </td>

          {/* Cột 8: Đối soát & Độ tươi dữ liệu */}
          <td className="px-4 py-3">
            <div className="flex flex-col items-end gap-1">
              {renderReconciliationBadge(b)}
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" />
                <span>
                  {formatDateTime(b.latest_tx_date)} ({b.period_tx_count} GD)
                </span>
              </div>
            </div>
          </td>
        </tr>

        {/* Panel mở rộng Drill-down ngay dưới dòng tài khoản */}
        {isExpanded && (
          <tr className="bg-slate-50/90 border-b border-blue-200">
            <td colSpan={8} className="px-6 py-4">
              <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Truy vết Giao dịch trong kỳ — {b.bank_code} ({b.account_number})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
                        {data?.period_start} → {data?.period_end}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      File sao kê gần nhất: <span className="font-medium text-slate-700">{b.latest_filename || '—'}</span>
                    </p>
                    {b.has_data_gap && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-amber-950">Chỉ báo khoảng trống dữ liệu sao kê: </span>
                          <span className="font-medium">{b.data_gap_desc}</span>
                          <p className="mt-1 text-[11px] text-amber-800">
                            Hệ thống đã tự động chuẩn hóa Số dư đầu kỳ theo số dư mở sổ thực tế của sao kê ({formatMoney(b.opening_balance)} VND) để số dư cuối kỳ khớp chính xác 100% với ngân hàng. Vui lòng nạp bổ sung sao kê các tháng còn thiếu để chuỗi giao dịch được khép kín.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Bộ lọc nhanh Thu / Chi trong Drilldown */}
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setDrilldownFlowFilter('ALL')}
                        className={`px-2.5 py-1 rounded font-semibold ${
                          drilldownFlowFilter === 'ALL'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        Tất cả ({drilldownTxs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrilldownFlowFilter('CREDIT')}
                        className={`px-2.5 py-1 rounded font-semibold ${
                          drilldownFlowFilter === 'CREDIT'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-700'
                        }`}
                      >
                        Khoản Thu
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrilldownFlowFilter('DEBIT')}
                        className={`px-2.5 py-1 rounded font-semibold ${
                          drilldownFlowFilter === 'DEBIT'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-rose-700'
                        }`}
                      >
                        Khoản Chi
                      </button>
                    </div>

                    <select
                      value={drilldownSort}
                      onChange={(e) =>
                        setDrilldownSort(e.target.value as 'AMOUNT_DESC' | 'DATE_DESC')
                      }
                      className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 font-medium"
                    >
                      <option value="AMOUNT_DESC">Sắp xếp: Số tiền lớn nhất</option>
                      <option value="DATE_DESC">Sắp xếp: Mới nhất trước</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/transactions?account_id=${b.account_id}&from_date=${
                            data?.period_start || ''
                          }&to_date=${data?.period_end || ''}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-semibold transition-colors"
                    >
                      <span>Mở trong Sổ Giao Dịch</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {loadingDrilldown ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Đang tải danh sách giao dịch phát sinh của tài khoản...
                  </div>
                ) : displayedDrilldownTxs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Không có giao dịch nào phát sinh trong kỳ báo cáo đang chọn.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left text-[11px] text-slate-600">
                      <thead className="bg-slate-50 uppercase font-semibold text-slate-700 sticky top-0 border-b border-slate-200">
                        <tr>
                          <SortableTh field="transaction_date" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} className="px-3 py-2">
                            Ngày GD
                          </SortableTh>
                          <SortableTh field="reference_number" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} className="px-3 py-2">
                            Mã tham chiếu
                          </SortableTh>
                          <SortableTh field="description" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} className="px-3 py-2 min-w-[240px]">
                            Nội dung diễn giải
                          </SortableTh>
                          <SortableTh field="category_name" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} className="px-3 py-2">
                            Danh mục
                          </SortableTh>
                          <SortableTh field="credit_amount" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} align="right" className="px-3 py-2">
                            Thu (Có)
                          </SortableTh>
                          <SortableTh field="debit_amount" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} align="right" className="px-3 py-2">
                            Chi (Nợ)
                          </SortableTh>
                          <SortableTh field="running_balance" currentSortField={drillSortField} currentSortDirection={drillSortDirection} onSort={handleDrillSort} align="right" className="px-3 py-2">
                            Số dư sau GD
                          </SortableTh>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedDrilldownTxs.slice(0, 15).map((tx) => (
                          <tr key={tx.transaction_id} className="hover:bg-slate-50 align-top">
                            <td className="px-3 py-2 font-mono whitespace-nowrap">
                              {new Date(tx.transaction_date).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500">
                              {tx.reference_number || '—'}
                            </td>
                            <td className="px-3 py-2 min-w-[240px] max-w-lg whitespace-normal break-words leading-relaxed" title={tx.description}>
                              {tx.counter_party && (
                                <div className="text-[10px] font-semibold text-blue-700 mb-0.5">
                                  Đối tác: {tx.counter_party}
                                </div>
                              )}
                              {tx.description}
                            </td>
                            <td className="px-3 py-2">
                              {tx.category_name ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  {tx.category_name}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Chưa phân loại</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                              {Number(tx.credit_amount) > 0
                                ? `+${formatMoney(tx.credit_amount)}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-rose-600">
                              {Number(tx.debit_amount) > 0
                                ? `-${formatMoney(tx.debit_amount)}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                              {formatMoney(tx.running_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cảnh báo lỗi kết nối máy chủ */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div>
              <div className="text-xs font-bold text-rose-900">Không thể tải dữ liệu báo cáo từ máy chủ</div>
              <div className="text-xs text-rose-700">{fetchError}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchAllData()}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow transition-colors"
          >
            Thử lại ngay
          </button>
        </div>
      )}

      {/* 1. Header & Thanh Công Cụ Xuất Báo Cáo */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">
              Báo Cáo Tồn Quỹ & Điều Hành Thanh Khoản (CFO - Ông Trần Ngọc Tuấn)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" />
              Chuẩn SLA 09:00 AM
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Theo dõi biến động Đầu kỳ → Thu → Chi → Cuối kỳ hợp nhất hệ thống Tài khoản Ngân hàng (Khối 1 Doanh nghiệp & Khối 2 Ủy quyền CEO — Độ chính xác tuyệt đối Δ = 0 VND)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCFOExcel}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Đang kết xuất...' : 'Xuất Excel Báo Cáo Tồn Quỹ'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchAllData()}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Làm mới số liệu</span>
          </button>
        </div>
      </div>

      {/* 2. Thanh Điều Khiển Kỳ Báo Cáo & Lọc Luân Chuyển Nội Bộ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tabs chọn nhanh Kỳ báo cáo */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mr-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              Kỳ báo cáo:
            </span>
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              {(
                [
                  { id: 'TODAY', label: 'Ngày mới nhất' },
                  { id: 'YESTERDAY', label: 'Hôm trước' },
                  { id: 'WTD', label: 'Lũy kế Tuần (WTD)' },
                  { id: 'MTD', label: 'Lũy kế Tháng (MTD)' },
                  { id: 'ALL', label: 'Toàn kỳ' },
                ] as Array<{ id: TimeframeType; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setTimeframe(tab.id);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    timeframe === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 font-mono text-xs font-bold border border-blue-200">
              {data?.period_start || '—'} → {data?.period_end || '—'}
            </span>
          </div>

          {/* Công tắc Loại trừ luân chuyển nội bộ trên KPI Hợp nhất */}
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              checked={excludeInternal}
              onChange={(e) => setExcludeInternal(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Loại trừ luân chuyển nội bộ trên Tổng Thu/Chi hợp nhất</span>
            {data && data.internal_transfer_tx_count > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                {data.internal_transfer_tx_count} GD nội bộ
              </span>
            )}
          </label>
        </div>

        {/* Hàng 2: Chọn khoảng ngày tùy chỉnh + Lọc nhanh Ngân hàng & Chủ tài khoản */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 font-medium">Lọc bảng tồn quỹ:</span>
            <select
              value={selectedBankCode}
              onChange={(e) => setSelectedBankCode(e.target.value)}
              className="border border-slate-300 rounded-md px-2.5 py-1 bg-white text-slate-700 font-medium"
            >
              <option value="">Tất cả Ngân hàng ({availableBanks.length})</option>
              {availableBanks.map((code) => (
                <option key={code} value={code}>
                  Ngân hàng {code}
                </option>
              ))}
            </select>

            <select
              value={selectedHolder}
              onChange={(e) => setSelectedHolder(e.target.value)}
              className="border border-slate-300 rounded-md px-2.5 py-1 bg-white text-slate-700 font-medium max-w-xs"
            >
              <option value="">Tất cả Pháp nhân / Chủ TK ({availableHolders.length})</option>
              {availableHolders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            {(selectedBankCode || selectedHolder) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedBankCode('');
                  setSelectedHolder('');
                }}
                className="text-blue-600 hover:underline font-medium px-1"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Kỳ tùy chọn:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-slate-50 font-mono"
            />
            <span>→</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-slate-50 font-mono"
            />
            <button
              type="button"
              onClick={() => {
                if (fromDate && toDate) {
                  setTimeframe('CUSTOM');
                  fetchAllData(fromDate, toDate);
                } else {
                  alert('Vui lòng chọn đầy đủ Từ ngày và Đến ngày.');
                }
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded font-semibold transition-colors"
            >
              Áp dụng
            </button>
          </div>
        </div>
      </div>

      {/* 3. Cảnh báo Đối soát / Điểm neo Số dư (Nếu phát hiện TK chưa neo hoặc lệch hoặc hổng dữ liệu) */}
      {data && (data.discrepancy_accounts_count > 0 || data.unanchored_accounts_count > 0 || (data.data_gap_accounts_count || 0) > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Lưu ý Kiểm soát Độ tin cậy Số dư: </span>
              {data.discrepancy_accounts_count > 0 && (
                <span>
                  Có <strong>{data.discrepancy_accounts_count} tài khoản</strong> đang có cảnh báo lệch đối soát sao kê.{' '}
                </span>
              )}
              {data.unanchored_accounts_count > 0 && (
                <span>
                  Có <strong>{data.unanchored_accounts_count} tài khoản sổ phụ cá nhân (MODE_4)</strong> chưa được nhập Điểm neo Số dư thực tế nên đang tạm tính từ mốc 0 VND.{' '}
                </span>
              )}
              {(data.data_gap_accounts_count || 0) > 0 && (
                <span>
                  Có <strong>{data.data_gap_accounts_count} tài khoản</strong> phát hiện khoảng trống dữ liệu sao kê chưa liên tục (cần nạp bổ sung các tháng còn thiếu để khép kín chuỗi đối soát).
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            className="shrink-0 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-semibold transition-colors"
          >
            Kiểm tra & Neo số dư ngay
          </button>
        </div>
      )}

      {/* 4. Thanh Khoản Ròng Sau Nghĩa Vụ Nợ Tín Dụng Đến Hạn (Net Liquidity Position) */}
      {debtSummary && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 text-white shadow-lg border border-indigo-800/40">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5" />
                  Chỉ số Quản trị CFO
                </span>
                <span className="text-sm font-bold text-white">
                  Thanh Khoản Ròng Sau Nghĩa Vụ Nợ Tín Dụng (Net Liquidity Position)
                </span>
              </div>
              <p className="text-xs text-slate-300">
                = Tổng tồn quỹ 2 Khối ngân hàng ({formatMoney(data?.total_consolidated_liquidity)} VND) − Nghĩa vụ nợ gốc & lãi 30 ngày tới ({formatMoney(debtSummary.total_upcoming_due_30days)} VND)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <div className="text-[11px] text-slate-300 font-medium">Nợ đến hạn 30 ngày:</div>
                <div className="text-base font-bold font-mono text-rose-300">
                  {formatMoney(debtSummary.total_upcoming_due_30days)} <span className="text-[10px] font-normal">VND</span>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg px-3.5 py-2 border border-white/10">
                <div className="text-[11px] text-slate-300 font-medium">Thanh khoản ròng khả dụng:</div>
                <div className={`text-2xl font-bold font-mono ${((Number(data?.total_consolidated_liquidity || 0) - Number(debtSummary.total_upcoming_due_30days || 0)) >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatSignedMoney(Number(data?.total_consolidated_liquidity || 0) - Number(debtSummary.total_upcoming_due_30days || 0))} <span className="text-xs font-normal text-slate-300">VND</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/credit-statements')}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Khoản vay ({debtSummary.total_active_loans} HĐ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/loan-repayment-plan')}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition-colors flex items-center gap-1"
                >
                  <span>Kế hoạch trả nợ</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Hệ Thống 4 Thẻ KPI Điều Hành Hợp Nhất */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tổng Tồn Quỹ Hợp Nhất Cuối Kỳ */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 rounded-xl p-5 text-white shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between opacity-85 mb-1.5">
              <span className="text-[11px] uppercase font-bold tracking-wider">
                1. Tổng Tồn Quỹ Hợp Nhất (Cuối Kỳ)
              </span>
              <DollarSign className="w-5 h-5 text-blue-300" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {formatMoney(data?.total_consolidated_liquidity)}{' '}
              <span className="text-xs font-normal text-blue-200">VND</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 space-y-1 text-xs">
            <div className="flex items-center justify-between text-blue-100">
              <span>Đầu kỳ ({data?.period_start || '—'}):</span>
              <span className="font-mono font-semibold">
                {formatMoney(data?.opening_consolidated_liquidity)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-blue-200">Biến động ròng trong kỳ:</span>
              <span
                className={`font-mono font-bold inline-flex items-center gap-1 ${
                  Number(data?.net_change_consolidated || 0) >= 0
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }`}
              >
                {Number(data?.net_change_consolidated || 0) >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {formatSignedMoney(data?.net_change_consolidated)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Dòng Tiền Thu - Chi Trong Kỳ */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] uppercase font-bold tracking-wider">
                2. Lưu Chuyển Thu / Chi Trong Kỳ
              </span>
              <Layers className="w-4 h-4 text-blue-600" />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 font-medium">Tổng Thu:</span>
                <span className="text-base font-bold font-mono text-emerald-700">
                  +{formatMoney(data?.total_inflow_consolidated)} VND
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 font-medium">Tổng Chi:</span>
                <span className="text-base font-bold font-mono text-rose-600">
                  -{formatMoney(data?.total_outflow_consolidated)} VND
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
            {excludeInternal ? (
              <span>
                Đang hiện <strong>Thu/Chi thực với bên ngoài</strong> (Đã trừ{' '}
                {formatMoney(data?.internal_outflow_amount)} VND luân chuyển nội bộ)
              </span>
            ) : (
              <span>
                Đang hiện <strong>Tổng cộng ngang sổ sách</strong> (Gồm cả{' '}
                {formatMoney(data?.internal_outflow_amount)} VND luân chuyển nội bộ)
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Khối 1 - Tài Khoản Thanh Toán Doanh Nghiệp */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-[11px] uppercase font-bold tracking-wider">
                3. Khối 1: TK Doanh Nghiệp
              </span>
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              {formatMoney(data?.corporate_bank_balance)}{' '}
              <span className="text-xs font-normal text-slate-500">VND</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>• Số lượng tài khoản:</span>
              <span className="font-semibold text-slate-800">
                {corporateAccounts.length} tài khoản
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>• Tỷ trọng trên tổng quỹ:</span>
              <span className="font-mono font-semibold text-blue-700">
                {corpSub.share.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4: Khối 2 - Tài Khoản Ủy Quyền CEO (Bà Nguyễn Thị Lan Anh) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-[11px] uppercase font-bold tracking-wider">
                4. Khối 2: TK Ủy Quyền CEO
              </span>
              <UserCheck className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-800">
              {formatMoney(data?.special_cash_bank_balance)}{' '}
              <span className="text-xs font-normal text-slate-500">VND</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>• Chủ TK (Ủy quyền):</span>
              <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                Bà Nguyễn Thị Lan Anh
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>• Tỷ trọng trên tổng quỹ:</span>
              <span className="font-mono font-semibold text-amber-700">
                {specSub.share.toFixed(1)}% ({specialCashAccounts.length} TK)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Khu Vực Biểu Đồ Trực Quan Hóa Cơ Cấu Nguồn Tiền & Thu/Chi Theo Tài Khoản */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biểu đồ 1: Cơ cấu Phân bổ Tồn quỹ theo Ngân hàng */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Cơ Cấu Phân Bổ Tồn Quỹ Theo Ngân Hàng
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">Tỷ trọng trên Tổng số dư dương</span>
          </div>

          {/* Thanh Stacked Bar tổng quan */}
          <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex mb-4">
            {bankAllocationChart.map((item) =>
              item.pct > 0 ? (
                <div
                  key={item.label}
                  style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                  title={`${item.label}: ${formatMoney(item.balance)} VND (${item.pct.toFixed(1)}%)`}
                  className="h-full transition-all"
                />
              ) : null
            )}
          </div>

          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {bankAllocationChart.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-[110px]">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-bold text-slate-800">{item.label}</span>
                </div>
                <div className="flex-1 mx-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.pct))}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold text-slate-900">{formatMoney(item.balance)}</span>
                  <span className="text-slate-400 ml-1.5 text-[11px]">
                    ({item.pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bảng 2: Thống Kê Giao Dịch & Thời Điểm Giao Dịch Mới Nhất Theo Tài Khoản */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Thống Kê Giao Dịch
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Thời điểm GD mới nhất của mỗi tài khoản
            </span>
          </div>

          <div className="overflow-x-auto max-h-56 overflow-y-auto pr-1">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 text-[11px] font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <SortableTh field="account" currentSortField={summarySortField} currentSortDirection={summarySortDirection} onSort={handleSummarySort} className="px-2.5 py-2">
                    Tài khoản
                  </SortableTh>
                  <SortableTh field="period_tx_count" currentSortField={summarySortField} currentSortDirection={summarySortDirection} onSort={handleSummarySort} align="center" className="px-2 py-2">
                    Số GD kỳ
                  </SortableTh>
                  <SortableTh field="last_transaction_date" currentSortField={summarySortField} currentSortDirection={summarySortDirection} onSort={handleSummarySort} className="px-2.5 py-2">
                    GD Mới Nhất
                  </SortableTh>
                  <SortableTh field="net_flow" currentSortField={summarySortField} currentSortDirection={summarySortDirection} onSort={handleSummarySort} align="right" className="px-2.5 py-2">
                    Thu / Chi Kỳ
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedSummaryBankItems.map((b) => (
                  <tr
                    key={b.account_id || b.account_number}
                    onClick={() => handleToggleAccountExpand(b.account_id)}
                    className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                    title="Bấm để xem chi tiết giao dịch tài khoản này"
                  >
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                          {b.bank_code}
                        </span>
                        <span className="font-mono font-bold text-slate-800 text-[11px]">
                          {b.account_number}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[130px]" title={b.account_holder}>
                        {b.account_holder}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center font-mono">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        b.period_tx_count > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {b.period_tx_count}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      {b.latest_tx_date ? (
                        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 font-medium whitespace-nowrap">
                          <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>{formatDateTime(b.latest_tx_date)}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Chưa có GD</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-[11px] whitespace-nowrap">
                      <div>
                        <span className="text-emerald-700 font-semibold">
                          +{formatMoney(b.total_inflow)}
                        </span>
                      </div>
                      <div>
                        <span className="text-rose-600 font-semibold">
                          -{formatMoney(b.total_outflow)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 6. BẢNG TỔNG HỢP TỒN QUỸ HỢP NHẤT CÁC TÀI KHOẢN NGÂN HÀNG (KHỐI 1 & KHỐI 2) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Bảng Tổng Hợp Tồn Quỹ Hợp Nhất Hệ Thống Tài Khoản Ngân Hàng
            </h2>
            <p className="text-xs text-slate-500">
              Bấm trực tiếp vào bất kỳ dòng Tài khoản nào để mở rộng (Drill-down) xem danh sách các giao dịch phát sinh trong kỳ
            </p>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Đơn vị tính: <span className="font-bold text-slate-800">VND</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-800 text-white uppercase text-[11px] font-semibold">
              <tr>
                <SortableTh field="account" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" className="px-4 py-3">
                  Tài khoản Ngân hàng
                </SortableTh>
                <SortableTh field="opening_balance" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Số dư Đầu kỳ
                </SortableTh>
                <SortableTh field="total_inflow" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Tổng Thu (Tiền vào)
                </SortableTh>
                <SortableTh field="total_outflow" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Tổng Chi (Tiền ra)
                </SortableTh>
                <SortableTh field="closing_balance" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Số dư Cuối kỳ
                </SortableTh>
                <SortableTh field="net_change" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Biến động (+/-)
                </SortableTh>
                <SortableTh field="share_pct" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-3 py-3">
                  Tỷ trọng
                </SortableTh>
                <SortableTh field="reconciliation_status" currentSortField={cfoTableSortField} currentSortDirection={cfoTableSortDirection} onSort={handleCfoTableSort} theme="dark" align="right" className="px-4 py-3">
                  Đối soát & Cập nhật
                </SortableTh>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {/* ================= KHỐI 1: TÀI KHOẢN DOANH NGHIỆP ================= */}
              <tr className="bg-blue-50/80 border-y border-blue-200">
                <td colSpan={8} className="px-4 py-2 font-bold text-blue-900 text-xs uppercase tracking-wider">
                  Khối 1: Tài khoản Thanh toán Doanh nghiệp ({corporateAccounts.length} tài khoản)
                </td>
              </tr>

              {sortedCorporateAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400 italic">
                    Không có tài khoản doanh nghiệp nào khớp điều kiện lọc.
                  </td>
                </tr>
              ) : (
                sortedCorporateAccounts.map((b) => renderAccountRow(b))
              )}

              {/* Dòng Tiểu tổng Khối 1 */}
              <tr className="bg-slate-100/90 font-bold text-slate-900 border-t border-slate-300">
                <td className="px-4 py-2.5 text-slate-800">
                  Tiểu tổng Khối 1 (Tài khoản Doanh nghiệp)
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{formatMoney(corpSub.open)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700">
                  +{formatMoney(corpSub.inflow)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-rose-600">
                  -{formatMoney(corpSub.outflow)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-900">
                  {formatMoney(corpSub.close)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono ${
                    corpSub.net >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {formatSignedMoney(corpSub.net)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {corpSub.share.toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right text-[11px] font-normal text-slate-500">
                  {corpSub.txCount} GD trong kỳ
                </td>
              </tr>

              {/* ================= KHỐI 2: TÀI KHOẢN ỦY QUYỀN CEO ================= */}
              <tr className="bg-amber-50/80 border-y border-amber-200">
                <td colSpan={8} className="px-4 py-2 font-bold text-amber-900 text-xs uppercase tracking-wider">
                  Khối 2: Tài khoản Ủy quyền CEO — Bà Nguyễn Thị Lan Anh ({specialCashAccounts.length} tài khoản)
                </td>
              </tr>

              {sortedSpecialCashAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400 italic">
                    Chưa có tài khoản ủy quyền CEO.
                  </td>
                </tr>
              ) : (
                sortedSpecialCashAccounts.map((b) => renderAccountRow(b))
              )}

              {/* Dòng Tiểu tổng Khối 2 */}
              <tr className="bg-slate-100/90 font-bold text-slate-900 border-t border-slate-300">
                <td className="px-4 py-2.5 text-slate-800">
                  Tiểu tổng Khối 2 (TK Ủy quyền CEO)
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{formatMoney(specSub.open)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700">
                  +{formatMoney(specSub.inflow)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-rose-600">
                  -{formatMoney(specSub.outflow)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-amber-900">
                  {formatMoney(specSub.close)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono ${
                    specSub.net >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {formatSignedMoney(specSub.net)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {specSub.share.toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right text-[11px] font-normal text-slate-500">
                  {specSub.txCount} GD trong kỳ
                </td>
              </tr>

              {/* ================= DÒNG TỔNG CỘNG TỒN QUỸ HỢP NHẤT TOÀN HỆ THỐNG ================= */}
              <tr className="bg-slate-900 text-white font-bold text-xs">
                <td className="px-4 py-4">
                  <div>TỔNG CỘNG TỒN QUỸ HỢP NHẤT (KHỐI 1 + KHỐI 2)</div>
                  <div className="text-[11px] font-normal text-slate-300 mt-0.5">
                    {excludeInternal
                      ? 'Cột Thu/Chi hợp nhất đã loại trừ giao dịch luân chuyển nội bộ'
                      : 'Cột Thu/Chi hợp nhất đang cộng ngang toàn bộ phát sinh sổ sách'}
                  </div>
                </td>
                <td className="px-3 py-4 text-right font-mono text-slate-200">
                  {formatMoney(data?.opening_consolidated_liquidity)}
                </td>
                <td className="px-3 py-4 text-right font-mono text-emerald-400">
                  +{formatMoney(data?.total_inflow_consolidated)}
                </td>
                <td className="px-3 py-4 text-right font-mono text-rose-400">
                  -{formatMoney(data?.total_outflow_consolidated)}
                </td>
                <td className="px-3 py-4 text-right font-mono text-sm text-amber-300">
                  {formatMoney(data?.total_consolidated_liquidity)}
                </td>
                <td
                  className={`px-3 py-4 text-right font-mono ${
                    Number(data?.net_change_consolidated || 0) >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {formatSignedMoney(data?.net_change_consolidated)}
                </td>
                <td className="px-3 py-4 text-right font-mono text-slate-200">100.0%</td>
                <td className="px-4 py-4 text-right text-[11px] font-normal text-emerald-300">
                  ĐK + Thu - Chi = CK
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
