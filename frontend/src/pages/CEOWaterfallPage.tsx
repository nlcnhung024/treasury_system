import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Filter, Calendar, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { CEOWaterfallData } from '../types';

export const CEOWaterfallPage: React.FC = () => {
  const [timeframe, setTimeframe] = useState<'WTD' | 'MTD' | 'CUSTOM'>('MTD');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [excludeInternal, setExcludeInternal] = useState<boolean>(false);
  const [data, setData] = useState<CEOWaterfallData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchWaterfall();
  }, [timeframe, excludeInternal]);

  const fetchWaterfall = async (customFrom?: string, customTo?: string) => {
    setLoading(true);
    try {
      const fDate = customFrom !== undefined ? customFrom : fromDate;
      const tDate = customTo !== undefined ? customTo : toDate;
      const res = await api.get('/reports/ceo/waterfall', {
        params: {
          timeframe,
          from_date: fDate || undefined,
          to_date: tDate || undefined,
          exclude_internal_transfers: excludeInternal,
        },
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalIncome =
    data?.total_income !== undefined
      ? Number(data.total_income)
      : (data?.income_components || []).reduce((acc, item) => acc + Number(item.amount), 0);

  const totalExpense =
    data?.total_expense !== undefined
      ? Number(data.total_expense)
      : (data?.expense_components || []).reduce((acc, item) => acc + Number(item.amount), 0);

  const maxStepValue = Math.max(
    1,
    ...(data?.steps || []).map((s) => Math.abs(Number(s.value)))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Báo Cáo Thác Nước Thu / Chi (CEO - Bà Nguyễn Thị Lan Anh)
          </h1>
          <p className="text-sm text-slate-500">
            Phân rã biến động dòng tiền thực tế từ Số dư Đầu kỳ → Các cấu phần Thu/Chi → Số dư Cuối kỳ (Khớp 100% Δ=0)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Công tắc lọc giao dịch chuyển khoản nội bộ */}
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeInternal}
              onChange={(e) => setExcludeInternal(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Loại trừ chuyển khoản nội bộ (`CTNB` / `nop tk`)</span>
          </label>

          {/* Chuyển đổi WTD / MTD */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
                setTimeframe('WTD');
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeframe === 'WTD' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lũy kế Tuần (WTD)
            </button>
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
                setTimeframe('MTD');
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeframe === 'MTD' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lũy kế Tháng (MTD)
            </button>
          </div>
        </div>
      </div>

      {/* Bộ chọn khoảng ngày tùy chỉnh */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="font-semibold">Kỳ phân tích thực tế:</span>
          <span className="px-2.5 py-1 rounded bg-blue-50 text-blue-800 font-mono font-bold">
            {data?.period_start || '—'} → {data?.period_end || '—'}
          </span>
          {excludeInternal && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              Đã ẩn {data?.excluded_internal_transfers_count || 0} bút toán nội bộ
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span>Từ ngày:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 bg-slate-50"
          />
          <span>Đến ngày:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 bg-slate-50"
          />
          <button
            onClick={() => {
              if (fromDate && toDate) {
                setTimeframe('CUSTOM');
                fetchWaterfall(fromDate, toDate);
              }
            }}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded font-semibold"
          >
            Áp dụng kỳ tùy chỉnh
          </button>
        </div>
      </div>

      {/* Thẻ tổng hợp phương trình cân bằng */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-slate-900">
            Mô Hình Biến Động Dòng Tiền Hợp Nhất ({timeframe})
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
            <CheckCircle2 className="w-4 h-4" />
            <span>Phương trình ĐK + Thu - Chi = CK cân bằng tuyệt đối</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs uppercase text-slate-500 font-semibold mb-1">1. Số dư Đầu kỳ</div>
            <div className="text-lg font-bold font-mono text-slate-800">
              {data ? Number(data.opening_balance).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-xs uppercase text-emerald-700 font-semibold mb-1 flex items-center">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              2. Tổng Dòng Tiền Thu (+)
            </div>
            <div className="text-lg font-bold font-mono text-emerald-700">
              +{totalIncome.toLocaleString('vi-VN')} VND
            </div>
            <div className="text-[11px] text-emerald-600 mt-1">
              {data?.income_components.length || 0} cấu phần thu
            </div>
          </div>
          <div className="p-4 rounded-lg bg-red-50 border border-red-200">
            <div className="text-xs uppercase text-red-700 font-semibold mb-1 flex items-center">
              <ArrowDownRight className="w-4 h-4 mr-1" />
              3. Tổng Dòng Tiền Chi (-)
            </div>
            <div className="text-lg font-bold font-mono text-red-700">
              -{totalExpense.toLocaleString('vi-VN')} VND
            </div>
            <div className="text-[11px] text-red-600 mt-1">
              {data?.expense_components.length || 0} cấu phần chi
            </div>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-xs uppercase text-blue-700 font-semibold mb-1">4. Số dư Cuối kỳ</div>
            <div className="text-lg font-bold font-mono text-blue-800">
              {data ? Number(data.closing_balance).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
        </div>

        {/* Biểu đồ Thác nước trực quan (Horizontal Waterfall Bars) */}
        <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/70">
          <div className="text-sm font-bold text-slate-800 mb-4">
            Chi tiết Thác nước Phân rã theo từng Danh mục Thu / Chi:
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">Đang tổng hợp biểu đồ Waterfall...</div>
          ) : (
            <div className="space-y-3">
              {data?.steps.map((st, i) => {
                const absVal = Math.abs(Number(st.value));
                const widthPct = Math.max(4, Math.min(100, Math.round((absVal / maxStepValue) * 100)));
                const barColor =
                  st.type === 'INCOME'
                    ? st.color_code || '#10B981'
                    : st.type === 'EXPENSE'
                    ? st.color_code || '#EF4444'
                    : st.type === 'CLOSING'
                    ? '#2563EB'
                    : '#475569';

                return (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-white border border-slate-200 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: barColor }}
                        />
                        <span className="font-semibold text-slate-800">{st.name}</span>
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                          {st.type}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold text-sm ${
                          st.type === 'INCOME'
                            ? 'text-emerald-600'
                            : st.type === 'EXPENSE'
                            ? 'text-red-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {st.type === 'EXPENSE' ? '-' : st.type === 'INCOME' ? '+' : ''}
                        {Number(st.value).toLocaleString('vi-VN')} VND
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
