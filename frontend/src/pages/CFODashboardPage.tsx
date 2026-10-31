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
  BarChart3,
  UserCheck,
  Landmark,
} from 'lucide-react';
import api from '../services/api';
import {
  CFOLiquidityData,
  CFOBankBreakdownItem,
  Transaction,
  CreditFacilitySummary,
} from '../types';

type TimeframeType = 'TODAY' | 'YESTERDAY' | 'WTD' | 'MTD' | 'ALL' | 'CUSTOM';

export const CFODashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const [data, setData] = useState<CFOLiquidityData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  // Bộ lọc Kỳ báo cáo & Điều kiện điều hành CFO
  const [timeframe, setTimeframe] = useState<TimeframeType>('MTD');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [excludeInternal, setExcludeInternal] = useState<boolean>(true);
  const [selectedBankCode, setSelectedBankCode] = useState<string>('');
  const [selectedHolder, setSelectedHolder] = useState<string>('');
  const [creditSummary, setCreditSummary] = useState<CreditFacilitySummary | null>(null);

  // Drill-down giao dịch chi tiết của từng tài khoản ngay trên bảng
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [drilldownTxs, setDrilldownTxs] = useState<Transaction[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState<boolean>(false);
  const [drilldownFlowFilter, setDrilldownFlowFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [drilldownSort, setDrilldownSort] = useState<'AMOUNT_DESC' | 'DATE_DESC'>('AMOUNT_DESC');

  useEffect(() => {
    if (timeframe !== 'CUSTOM') {
      fetchAllData();
    }
  }, [timeframe, excludeInternal]);

  const fetchAllData = async (customFrom?: string, customTo?: string) => {
    setLoading(true);
    try {
      const fDate = customFrom !== undefined ? customFrom : fromDate;
      const tDate = customTo !== undefined ? customTo : toDate;

      const liqRes = await api.get('/reports/cfo/daily-liquidity', {
        params: {
          timeframe,
          from_date: fDate || undefined,
          to_date: tDate || undefined,
          exclude_internal_transfers: excludeInternal,
        },
      });
      setData(liqRes.data);

      try {
        const creditRes = await api.get('/loans/summary');
        setCreditSummary(creditRes.data);
      } catch (e) {
        console.warn('Lỗi khi tải tóm tắt tín dụng:', e);
      }

      // Nếu đang mở drill-down của 1 tài khoản, làm mới luôn danh sách giao dịch kỳ đó
      if (expandedAccountId !== null) {
        fetchAccountDrilldown(
          expandedAccountId,
          liqRes.data.period_start,
          liqRes.data.period_end
        );
      }
    } catch (err) {
      console.error(err);
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
  const displayedDrilldownTxs = useMemo(() => {
    let list = [...drilldownTxs];
    if (drilldownFlowFilter === 'CREDIT') {
      list = list.filter((t) => Number(t.credit_amount) > 0);
    } else if (drilldownFlowFilter === 'DEBIT') {
      list = list.filter((t) => Number(t.debit_amount) > 0);
    }
    if (drilldownSort === 'AMOUNT_DESC') {
      list.sort(
        (a, b) =>
          Math.max(Number(b.credit_amount), Number(b.debit_amount)) -
          Math.max(Number(a.credit_amount), Number(a.debit_amount))
      );
    } else {
      list.sort(
        (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
      );
    }
    return list;
  }, [drilldownTxs, drilldownFlowFilter, drilldownSort]);

  const formatMoney = (val?: number | null) => {
    const num = Number(val || 0);
    return num.toLocaleString('vi-VN');
  };

  const formatSignedMoney = (val?: number | null) => {
    const num = Number(val || 0);
    if (num > 0) return `+${num.toLocaleString('vi-VN')}`;
    return num.toLocaleString('vi-VN');
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Khớp 100%
      </span>
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
                  {b.latest_tx_date
                    ? new Date(b.latest_tx_date).toLocaleDateString('vi-VN')
                    : 'Chưa có GD'}{' '}
                  ({b.period_tx_count} GD)
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
                          <th className="px-3 py-2">Ngày GD</th>
                          <th className="px-3 py-2">Mã tham chiếu</th>
                          <th className="px-3 py-2">Nội dung diễn giải</th>
                          <th className="px-3 py-2">Danh mục</th>
                          <th className="px-3 py-2 text-right">Thu (Có)</th>
                          <th className="px-3 py-2 text-right">Chi (Nợ)</th>
                          <th className="px-3 py-2 text-right">Số dư sau GD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedDrilldownTxs.slice(0, 15).map((tx) => (
                          <tr key={tx.transaction_id} className="hover:bg-slate-50">
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
                            <td className="px-3 py-2 max-w-md truncate" title={tx.description}>
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

      {/* 3. Cảnh báo Đối soát / Điểm neo Số dư (Nếu phát hiện TK chưa neo hoặc lệch) */}
      {data && (data.discrepancy_accounts_count > 0 || data.unanchored_accounts_count > 0) && (
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
                  Có <strong>{data.unanchored_accounts_count} tài khoản sổ phụ cá nhân (MODE_4)</strong> chưa được nhập Điểm neo Số dư thực tế nên đang tạm tính từ mốc 0 VND.
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

      {/* 4. Hệ Thống 4 Thẻ KPI Điều Hành Hợp Nhất */}
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

      {/* 4.5. Giám Sát Dư Nợ Tín Dụng & Nghĩa Vụ Trả Nợ (CFO Credit & Net Liquidity Card) */}
      {creditSummary && creditSummary.total_active_loans > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 text-white shadow-md border border-indigo-900/50">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                <Landmark className="w-4 h-4 text-indigo-400" />
                <span>Giám Sát Dư Nợ Khoản Vay Tín Dụng & Thanh Khoản Ròng</span>
              </div>
              <div className="text-sm text-slate-300">
                Hệ thống đang quản lý <strong>{creditSummary.total_active_loans} khoản vay/khế ước LD</strong> tại{' '}
                {creditSummary.by_bank.map((b) => b.bank_code).join(', ')} với lãi suất bình quân{' '}
                <strong>{Number(creditSummary.weighted_avg_interest_rate).toFixed(2)} %/năm</strong>.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="text-left">
                <div className="text-[11px] text-slate-400 uppercase font-medium">Tổng Dư Nợ Vay Gốc</div>
                <div className="text-xl font-bold font-mono text-indigo-300">
                  {formatMoney(creditSummary.total_principal_balance)} <span className="text-xs font-normal">VND</span>
                </div>
              </div>

              <div className="text-left">
                <div className="text-[11px] text-slate-400 uppercase font-medium">Gốc & Lãi Đến Hạn (7 Ngày)</div>
                <div className="text-xl font-bold font-mono text-amber-300">
                  {formatMoney(creditSummary.total_upcoming_due_7days)} <span className="text-xs font-normal">VND</span>
                </div>
              </div>

              <div className="text-left">
                <div className="text-[11px] text-slate-400 uppercase font-medium">Thanh Khoản Ròng (Sau 7 Ngày)</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    Number(data?.total_consolidated_liquidity || 0) - Number(creditSummary.total_upcoming_due_7days) >= 0
                      ? 'text-emerald-300'
                      : 'text-rose-400'
                  }`}
                >
                  {formatMoney(
                    Number(data?.total_consolidated_liquidity || 0) - Number(creditSummary.total_upcoming_due_7days)
                  )}{' '}
                  <span className="text-xs font-normal">VND</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/credit-statements')}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
              >
                <span>Xem chi tiết khoản vay</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Biểu đồ 2: So sánh Cường độ Thu - Chi theo Tài khoản trong kỳ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Biến Động Dòng Tiền Thu / Chi Theo Tài Khoản Trong Kỳ
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Thu (Có)
              </span>
              <span className="flex items-center gap-1 text-rose-600 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Chi (Nợ)
              </span>
            </div>
          </div>

          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {(() => {
              const maxFlow = Math.max(
                1,
                ...filteredBankItems.map((b) =>
                  Math.max(Number(b.total_inflow || 0), Number(b.total_outflow || 0))
                )
              );
              return filteredBankItems.map((b) => {
                const inPct = (Number(b.total_inflow || 0) / maxFlow) * 100;
                const outPct = (Number(b.total_outflow || 0) / maxFlow) * 100;
                return (
                  <div
                    key={b.account_id || b.account_number}
                    onClick={() => handleToggleAccountExpand(b.account_id)}
                    className="text-xs cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-800">
                        {b.bank_code} • <span className="font-mono">{b.account_number}</span>
                      </span>
                      <span className="font-mono text-[11px]">
                        <span className="text-emerald-700 font-semibold">
                          +{formatMoney(b.total_inflow)}
                        </span>{' '}
                        /{' '}
                        <span className="text-rose-600 font-semibold">
                          -{formatMoney(b.total_outflow)}
                        </span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${inPct}%` }}
                        />
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{ width: `${outPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
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
                <th className="px-4 py-3">Tài khoản Ngân hàng</th>
                <th className="px-3 py-3 text-right">Số dư Đầu kỳ</th>
                <th className="px-3 py-3 text-right">Tổng Thu (Tiền vào)</th>
                <th className="px-3 py-3 text-right">Tổng Chi (Tiền ra)</th>
                <th className="px-3 py-3 text-right">Số dư Cuối kỳ</th>
                <th className="px-3 py-3 text-right">Biến động (+/-)</th>
                <th className="px-3 py-3 text-right">Tỷ trọng</th>
                <th className="px-4 py-3 text-right">Đối soát & Cập nhật</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {/* ================= KHỐI 1: TÀI KHOẢN DOANH NGHIỆP ================= */}
              <tr className="bg-blue-50/80 border-y border-blue-200">
                <td colSpan={8} className="px-4 py-2 font-bold text-blue-900 text-xs uppercase tracking-wider">
                  Khối 1: Tài khoản Thanh toán Doanh nghiệp ({corporateAccounts.length} tài khoản)
                </td>
              </tr>

              {corporateAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400 italic">
                    Không có tài khoản doanh nghiệp nào khớp điều kiện lọc.
                  </td>
                </tr>
              ) : (
                corporateAccounts.map((b) => renderAccountRow(b))
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

              {specialCashAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400 italic">
                    Chưa có tài khoản ủy quyền CEO.
                  </td>
                </tr>
              ) : (
                specialCashAccounts.map((b) => renderAccountRow(b))
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
