import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarClock,
  TrendingDown,
  ShieldCheck,
  Sliders,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Search,
  Layers,
  Repeat,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import {
  DebtRepaymentPlanResponse,
  CapacityMode,
  RepaymentStrategy,
  ReborrowMode,
} from '../types';

export const LoanRepaymentPlanPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [planData, setPlanData] = useState<DebtRepaymentPlanResponse | null>(null);

  // Controller states
  const [capacityMode, setCapacityMode] = useState<CapacityMode>('UNIFORM');
  const [uniformCapacity, setUniformCapacity] = useState<number>(14000000000); // 14 tỷ mặc định
  const [strategy, setStrategy] = useState<RepaymentStrategy>('SPLIT_LARGE_LOANS');
  const [penaltyRate, setPenaltyRate] = useState<number>(0.0);
  const [mbTenor, setMbTenor] = useState<number>(6);
  const [ctgTenor, setCtgTenor] = useState<number>(4);

  // New Re-borrowing States
  const [reborrowRate, setReborrowRate] = useState<number>(100); // 100% mặc định
  const [reborrowMode, setReborrowMode] = useState<ReborrowMode>('STAGGERED_SMOOTHING');

  // Seasonal capacities dictionary
  const [seasonalCapacities, setSeasonalCapacities] = useState<Record<string, number>>({
    '2026-11': 14000000000,
    '2026-12': 16000000000,
    '2027-01': 18000000000,
    '2027-02': 10000000000,
    '2027-03': 14000000000,
    '2027-04': 14000000000,
    '2027-05': 12000000000,
  });

  // Action table filter
  const [searchContract, setSearchContract] = useState<string>('');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const fetchRepaymentPlan = async () => {
    setLoading(true);
    try {
      const payload = {
        capacity_mode: capacityMode,
        uniform_monthly_capacity: uniformCapacity,
        seasonal_capacities: capacityMode === 'SEASONAL' ? seasonalCapacities : undefined,
        prepayment_penalty_rate: penaltyRate,
        strategy: strategy,
        mb_tenor_months: mbTenor,
        ctg_tenor_months: ctgTenor,
        reborrow_rate: reborrowRate,
        reborrow_mode: reborrowMode,
      };

      const res = await api.post('/loans/repayment-plan/simulate', payload);
      setPlanData(res.data);
    } catch (err) {
      console.error('Lỗi khi tải kế hoạch trả nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepaymentPlan();
  }, [capacityMode, uniformCapacity, strategy, penaltyRate, mbTenor, ctgTenor, reborrowRate, reborrowMode]);

  const handleSeasonalChange = (monthKey: string, val: number) => {
    setSeasonalCapacities((prev) => ({
      ...prev,
      [monthKey]: val,
    }));
  };

  const handleApplySeasonal = () => {
    fetchRepaymentPlan();
  };

  const handleResetDefaults = () => {
    setCapacityMode('UNIFORM');
    setUniformCapacity(14000000000);
    setStrategy('SPLIT_LARGE_LOANS');
    setPenaltyRate(0.0);
    setMbTenor(6);
    setCtgTenor(4);
    setReborrowRate(100);
    setReborrowMode('STAGGERED_SMOOTHING');
    setSeasonalCapacities({
      '2026-11': 14000000000,
      '2026-12': 16000000000,
      '2027-01': 18000000000,
      '2027-02': 10000000000,
      '2027-03': 14000000000,
      '2027-04': 14000000000,
      '2027-05': 12000000000,
    });
  };

  const formatVND = (num?: number) => {
    if (num === undefined || num === null) return '0 ₫';
    return `${Number(num).toLocaleString('vi-VN')} ₫`;
  };

  const formatBillion = (num?: number) => {
    if (!num) return '0.00 tỷ';
    return `${(Number(num) / 1000000000).toFixed(2)} tỷ`;
  };

  // Filtered allocations
  const filteredAllocations = useMemo(() => {
    if (!planData?.allocations) return [];
    return planData.allocations.filter((item) => {
      const matchSearch =
        searchContract.trim() === '' ||
        item.contract_number.toLowerCase().includes(searchContract.toLowerCase()) ||
        item.note.toLowerCase().includes(searchContract.toLowerCase());

      const matchBank = bankFilter === 'ALL' || item.bank_code === bankFilter;

      const matchAction =
        actionFilter === 'ALL' ||
        (actionFilter === 'PREPAYMENT' && (item.action_type === 'PARTIAL_PREPAYMENT' || item.action_type === 'FULL_PREPAYMENT')) ||
        (actionFilter === 'ROLLOVER' && item.action_type === 'ROLLOVER_REFINANCE') ||
        (actionFilter === 'REBORROW' && item.action_type === 'NEW_REBORROW_DRAWDOWN') ||
        (actionFilter === 'REGULAR' && item.action_type === 'PAY_ON_DUE');

      return matchSearch && matchBank && matchAction;
    });
  }, [planData?.allocations, searchContract, bankFilter, actionFilter]);

  // Max value for bar chart height scaling
  const maxChartValue = useMemo(() => {
    if (!planData?.monthly_schedule || planData.monthly_schedule.length === 0) return 55000000000;
    const values = planData.monthly_schedule.flatMap((m) => [
      Number(m.natural_due_amount),
      Number(m.allocated_payment_amount),
      Number(m.monthly_capacity),
    ]);
    return Math.max(...values, 55000000000);
  }, [planData?.monthly_schedule]);

  return (
    <div className="space-y-6">
      {/* 1. Header Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <CalendarClock className="w-4 h-4" />
            <span>Phân hệ Quản Trị Khoản Vay & Thanh Khoản</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Kế Hoạch Trả Nợ & Vay Lại Tuần Hoàn (Revolving Smoothing)
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Mô phỏng 2 kịch bản vay lại: <strong>Vay lại nguyên khối chuẩn 4T</strong> (cảnh báo dồn nợ vào Tháng 3) vs{' '}
            <strong>Vay lại phân kỳ lệch pha</strong> (chia nhỏ khế ước né đỉnh nợ), đảm bảo nghĩa vụ trả nợ luôn dưới khả năng chi trả.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchRepaymentPlan}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
            title="Tải lại dữ liệu mô phỏng"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Cập nhật</span>
          </button>
          <button
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors"
            title="Khôi phục thông số chuẩn mặc định"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>
        </div>
      </div>

      {/* 2. Scenario Comparison Switcher Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 rounded-2xl text-white shadow-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300 flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-indigo-400" />
              So Sánh 2 Phương Án Tái Vay Tuần Hoàn (Đáo Hạn & Vay Lại)
            </span>
            <h3 className="text-sm font-bold text-white">
              Lựa chọn Mô hình Vay Lại sau khi Trả Nợ Tháng 11
            </h3>
          </div>

          {/* Toggle 2 Reborrow Scenarios */}
          <div className="inline-flex p-1 bg-slate-800/90 rounded-xl border border-slate-700 self-start md:self-auto">
            <button
              onClick={() => setReborrowMode('LUMP_SUM_STANDARD')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${reborrowMode === 'LUMP_SUM_STANDARD'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
                }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Kịch bản 1: Vay lại nguyên khối 4T (Nguy cơ dồn nợ T03)</span>
            </button>
            <button
              onClick={() => setReborrowMode('STAGGERED_SMOOTHING')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${reborrowMode === 'STAGGERED_SMOOTHING'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Kịch bản 2: Vay lại phân kỳ lệch pha (Khuyến nghị)</span>
            </button>
          </div>
        </div>

        {/* Dynamic Scenario Explanation Banner */}
        <div className="p-3.5 rounded-xl text-xs leading-relaxed border transition-colors bg-white/5 border-white/10">
          {reborrowMode === 'LUMP_SUM_STANDARD' ? (
            <div className="text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>Cảnh báo Kịch bản 1 (Vay lại nguyên khối 4 tháng):</strong> Khoản nợ CTG trả ở Tháng 11 khi được vay lại nguyên cục 14 tỷ sẽ đáo hạn đúng 4 tháng sau vào <strong>Tháng 03/2027</strong>.
                Hệ quả: Nợ tự nhiên Tháng 03/2027 vọt lên tới <strong>{formatBillion(planData?.monthly_schedule.find(m => m.month === '2027-03')?.natural_due_amount)}</strong> (đè thêm nợ lên 40.4 tỷ của MB).
                Công ty sẽ phải tận dụng tối đa tiền trả sớm ở T12, T01, T02 để cứu nguy dòng tiền Tháng 3!
              </div>
            </div>
          ) : (
            <div className="text-emerald-200 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>Giải pháp Kịch bản 2 (Vay lại phân kỳ lệch pha thông minh):</strong> Thay vì dồn cả cục vay lại vào Tháng 3, thuật toán đề xuất <strong>chia nhỏ các khế ước vay lại và phân kỳ giải ngân</strong> để ngày đáo hạn rải đều vào các tháng trống (T01, T02, T04, T05).
                Hệ quả: <strong>Né hoàn toàn đỉnh nợ Tháng 03/2027</strong>, giúp mọi tháng đều giữ mức thanh toán an toàn dưới 14 tỷ!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng Dư Nợ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng Dư Nợ Tín Dụng</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatBillion(planData?.total_principal_debt)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{planData?.total_loans_count || 0} khoản vay hiện có</span>
            <span className="font-semibold text-blue-600">MBB & CTG</span>
          </div>
        </div>

        {/* Card 2: Quy mô Tái Vay Tuần Hoàn */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Tái Giải Ngân Vay Lại</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Repeat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-600 tracking-tight">
            {formatBillion(planData?.total_reborrowed_amount)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Tỷ lệ vay lại: {planData?.reborrow_rate}%</span>
            <span className="font-semibold text-purple-700">Duy trì vốn LĐ</span>
          </div>
        </div>

        {/* Card 3: Đỉnh Nợ Sau Phân Bổ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Đỉnh Nợ Sau Phân Bổ</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 tracking-tight">
              {formatBillion(planData?.peak_debt_after)}
            </span>
            <span className="text-xs font-bold text-slate-400 line-through">
              {formatBillion(planData?.peak_debt_before)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Giảm áp lực đỉnh:</span>
            <span className="font-bold text-emerald-600">-{planData?.peak_reduction_percent}%</span>
          </div>
        </div>

        {/* Card 4: Kiểm Soát An Toàn Thanh Khoản */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Chuẩn An Toàn Chi Trả</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-600 tracking-tight flex items-center gap-1.5">
            <span>100% ĐẠT</span>
            <CheckCircle2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Dư nợ mọi tháng</span>
            <span className="font-bold text-indigo-700">≤ Khả năng chi trả</span>
          </div>
        </div>
      </div>

      {/* 4. Scenario & Budget Controller */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Thiết Lập Kịch Bản & Khả Năng Chi Trả</h2>
              <p className="text-xs text-slate-500">Mô phỏng động dòng tiền theo ngân sách cố định hoặc chu kỳ mùa vụ</p>
            </div>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 self-start md:self-auto">
            <button
              onClick={() => setCapacityMode('UNIFORM')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${capacityMode === 'UNIFORM'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              Cố định đều các tháng
            </button>
            <button
              onClick={() => setCapacityMode('SEASONAL')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${capacityMode === 'SEASONAL'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              Tùy chỉnh theo mùa vụ
            </button>
          </div>
        </div>

        {/* Content based on Mode */}
        {capacityMode === 'UNIFORM' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Khả năng chi trả tối đa hàng tháng:</span>
                <span className="text-base font-black text-indigo-600">
                  {formatBillion(uniformCapacity)} ({formatVND(uniformCapacity)})
                </span>
              </div>
              <input
                type="range"
                min="10000000000"
                max="30000000000"
                step="500000000"
                value={uniformCapacity}
                onChange={(e) => setUniformCapacity(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>10 tỷ (Tối thiểu)</span>
                <span>14 tỷ (Mặc định chuẩn)</span>
                <span>20 tỷ (Dồi dào)</span>
                <span>30 tỷ (Tối đa)</span>
              </div>
            </div>

            {/* Reborrow Rate Slider */}
            <div className="p-3.5 bg-purple-50/60 border border-purple-100 rounded-xl text-xs text-purple-900 space-y-2">
              <div className="flex items-center justify-between font-bold text-purple-800">
                <span className="flex items-center gap-1">
                  <Repeat className="w-3.5 h-3.5" />
                  Tỷ lệ Vay Lại (Re-borrow Rate):
                </span>
                <span className="text-sm font-black text-purple-700">{reborrowRate}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={reborrowRate}
                onChange={(e) => setReborrowRate(Number(e.target.value))}
                className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-[9px] text-purple-600">
                <span>0% (Tất toán hẳn)</span>
                <span>50%</span>
                <span>100% (Duy trì nguyên hạn mức)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600 font-medium">
                Nhập dự phóng khả năng chi trả riêng của từng tháng theo đặc thù chu kỳ kinh doanh & bán hàng:
              </p>
              <button
                onClick={handleApplySeasonal}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                Áp dụng kịch bản mùa vụ
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.keys(seasonalCapacities).map((mStr) => {
                const val = seasonalCapacities[mStr];
                return (
                  <div key={mStr} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase">{mStr}</div>
                    <div className="text-xs font-black text-indigo-700">{formatBillion(val)}</div>
                    <input
                      type="number"
                      step="500000000"
                      min="5000000000"
                      max="35000000000"
                      value={val}
                      onChange={(e) => handleSeasonalChange(mStr, Number(e.target.value))}
                      className="w-full text-[11px] px-2 py-1 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 text-slate-800 font-semibold"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategy and Tenor Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          {/* Strategy Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Chiến lược Ưu tiên Phân bổ:
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as RepaymentStrategy)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800"
            >
              <option value="SPLIT_LARGE_LOANS">⭐ Chia nhỏ các khoản nợ lớn (Ưu tiên)</option>
              <option value="AVALANCHE">⚡ Tối ưu lãi suất cao trước (Avalanche)</option>
              <option value="SNOWBALL">🎯 Tất toán dứt điểm nợ nhỏ trước (Snowball)</option>
              <option value="BALANCED">⚖️ Làm phẳng theo tỷ trọng đều (Balanced)</option>
            </select>
          </div>

          {/* Max Tenor on Rollover */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Kỳ hạn Tối đa khi Đảo Nợ:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                <span className="text-slate-600">MBBank:</span>
                <span className="font-bold text-indigo-700">{mbTenor} tháng</span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                <span className="text-slate-600">VietinBank:</span>
                <span className="font-bold text-indigo-700">{ctgTenor} tháng</span>
              </div>
            </div>
          </div>

          {/* Prepayment Penalty Rate */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Phí phạt Trả nợ Trước hạn:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={penaltyRate}
                onChange={(e) => setPenaltyRate(Number(e.target.value))}
                className="w-24 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
              <span className="text-xs font-bold text-slate-600">% / số tiền trả sớm</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                Mặc định: 0%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Grouped Bar Chart: Before vs After & Debt Ceiling */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Biểu Đồ So Sánh Dòng Tiền & Đường Trần Khả Năng Chi Trả
            </h2>
            <p className="text-xs text-slate-500">
              {reborrowMode === 'LUMP_SUM_STANDARD'
                ? '🔴 Kịch bản 1: Cảnh báo nợ dồn cục vào Tháng 03/2027 do khoản CTG vay lại 4 tháng đáo hạn cùng thời điểm'
                : '🟢 Kịch bản 2: Vay lại phân kỳ lệch pha giúp né đỉnh nợ Tháng 03, dàn đều dòng tiền hoàn hảo'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span className="text-slate-600">Nợ đến hạn tự nhiên</span>
            </div>
            {reborrowRate > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-purple-500" />
                <span className="text-purple-700 font-semibold">Khoản Vay Lại Mới Đến Hạn</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-indigo-600" />
              <span className="text-indigo-700 font-bold">Thanh toán đề xuất</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-rose-500 border-t-2 border-rose-500 border-dashed" />
              <span className="text-rose-600 font-bold">Trần Chi Trả</span>
            </div>
          </div>
        </div>

        {/* Visual Chart Bars Area */}
        <div className="pt-6 pb-2">
          <div className="grid grid-cols-7 gap-3 sm:gap-6 items-end h-64 border-b border-slate-200 px-2 relative">
            {/* Grid background reference line for uniform capacity */}
            <div
              className="absolute left-0 right-0 border-b border-dashed border-rose-300 pointer-events-none z-0"
              style={{
                bottom: `${(uniformCapacity / maxChartValue) * 100}%`,
              }}
            >
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1 rounded absolute -top-4 right-2">
                Trần an toàn: {formatBillion(uniformCapacity)}
              </span>
            </div>

            {planData?.monthly_schedule.map((item) => {
              const totalNatural = Number(item.natural_due_amount);
              const reborrowPart = Number(item.reborrowed_new_due_amount || 0);
              const oldNaturalPart = Math.max(0, totalNatural - reborrowPart);

              const totalNaturalHeight = (totalNatural / maxChartValue) * 100;
              const allocatedHeight = (Number(item.allocated_payment_amount) / maxChartValue) * 100;
              const isOver = totalNatural > Number(item.monthly_capacity);
              const hasNewReborrow = reborrowPart > 0;

              return (
                <div key={item.month} className="flex flex-col items-center h-full justify-end group relative z-10">
                  {/* Hover Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-28 bg-slate-900 text-white text-[11px] p-3 rounded-xl shadow-2xl whitespace-nowrap pointer-events-none z-30 space-y-1">
                    <div className="font-bold text-amber-300 pb-1 border-b border-slate-700 flex items-center justify-between gap-3">
                      <span>Tháng: {item.month}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {item.status_label === 'REFINANCED' ? 'Đảo nợ' : 'An toàn'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0"></span>
                      <span>Nợ gốc tự nhiên cũ: {formatBillion(oldNaturalPart)}</span>
                    </div>
                    {hasNewReborrow && (
                      <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-purple-400 inline-block shrink-0"></span>
                        <span>Nợ tái vay mới: {formatBillion(reborrowPart)}</span>
                      </div>
                    )}
                    <div className="font-bold text-amber-200">
                      Tổng nợ đến hạn: {formatBillion(totalNatural)}
                    </div>
                    <div className="pt-1 border-t border-slate-800 text-indigo-300 flex items-center gap-1.5 font-bold">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block shrink-0"></span>
                      <span>Đề xuất thanh toán: {formatBillion(item.allocated_payment_amount)}</span>
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      Trần khả năng chi trả: {formatBillion(item.monthly_capacity)}
                    </div>
                  </div>

                  {/* Dual Bar Container */}
                  <div className="flex items-end gap-1.5 w-full justify-center h-full">
                    {/* Bar 1: Stacked Bar (Gốc cũ ở dưới, Nợ vay lại mới chồng lên trên) */}
                    <div className="w-1/2 flex flex-col items-center justify-end h-full">
                      <span className="text-[9px] font-bold text-slate-700 mb-1 hidden sm:block whitespace-nowrap">
                        {totalNatural > 0 ? formatBillion(totalNatural) : ''}
                      </span>
                      <div
                        style={{ height: `${Math.max(totalNaturalHeight, 2)}%` }}
                        className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden transition-all shadow-sm"
                      >
                        {/* Tầng trên: Khoản vay lại mới đến hạn (Màu tím) */}
                        {hasNewReborrow && totalNatural > 0 && (
                          <div
                            style={{ height: `${(reborrowPart / totalNatural) * 100}%` }}
                            className="w-full bg-purple-600 hover:bg-purple-700 transition-colors"
                            title={`Nợ vay lại mới: ${formatBillion(reborrowPart)}`}
                          />
                        )}
                        {/* Tầng dưới: Nợ gốc tự nhiên cũ (Cam nếu vượt trần, Xám nếu an toàn) */}
                        {oldNaturalPart > 0 && totalNatural > 0 && (
                          <div
                            style={{ height: `${(oldNaturalPart / totalNatural) * 100}%` }}
                            className={`w-full transition-colors ${isOver
                                ? 'bg-amber-500 hover:bg-amber-600'
                                : 'bg-slate-300 hover:bg-slate-400'
                              }`}
                            title={`Nợ gốc cũ: ${formatBillion(oldNaturalPart)}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Bar 2: Allocated Payment */}
                    <div className="w-1/2 flex flex-col items-center justify-end h-full">
                      <span className="text-[9px] font-black text-indigo-700 mb-1 hidden sm:block whitespace-nowrap">
                        {item.allocated_payment_amount > 0 ? formatBillion(item.allocated_payment_amount) : ''}
                      </span>
                      <div
                        style={{ height: `${Math.max(allocatedHeight, 2)}%` }}
                        className="w-full rounded-t-lg bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                      />
                    </div>
                  </div>

                  {/* X Axis Label */}
                  <div className="mt-2 text-center">
                    <span className="text-xs font-bold text-slate-700 block">{item.month}</span>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full inline-block mt-0.5 ${item.status_label === 'REFINANCED'
                          ? 'bg-blue-100 text-blue-700'
                          : item.status_label === 'SAFE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                    >
                      {item.status_label === 'REFINANCED' ? 'Đảo nợ' : 'An toàn'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. Monthly Execution Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Bảng Tổng Hợp Dòng Tiền & Kế Hoạch Thanh Toán Hàng Tháng</h2>
            <p className="text-xs text-slate-500">Chi tiết số tiền nợ định kỳ và các khoản nợ tái vay đến hạn</p>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg">
            7 Tháng Kế Hoạch (11/2026 – 05/2027)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Tháng</th>
                <th className="py-3 px-4 text-right">Tổng Nợ Đến Hạn</th>
                <th className="py-3 px-4 text-right text-purple-700">Trong Đó Nợ Tái Vay</th>
                <th className="py-3 px-4 text-right">Trả Đúng Hạn</th>
                <th className="py-3 px-4 text-right">Trả Trước Hạn (Gom nợ)</th>
                <th className="py-3 px-4 text-right text-indigo-700">Tổng Trả Đề Xuất</th>
                <th className="py-3 px-4 text-right">Khả Năng Chi Trả</th>
                <th className="py-3 px-4 text-center">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {planData?.monthly_schedule.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">{m.month}</td>
                  <td className="py-3 px-4 text-right font-medium text-slate-700">
                    {formatVND(m.natural_due_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-purple-700">
                    {(m.reborrowed_new_due_amount || 0) > 0 ? `+${formatVND(m.reborrowed_new_due_amount)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-slate-700">
                    {formatVND(m.regular_principal_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-amber-600">
                    {m.prepaid_principal_amount > 0 ? `+${formatVND(m.prepaid_principal_amount)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-black text-indigo-600 text-sm">
                    {formatVND(m.allocated_payment_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">
                    {formatVND(m.monthly_capacity)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${m.is_safe
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{m.status_label === 'REFINANCED' ? 'Đã Đảo Nợ' : 'Kiểm Soát Tốt'}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Detailed Action Plan for Each Loan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Lịch Trình Chi Tiết Từng Hợp Đồng Vay ({filteredAllocations.length} lệnh thực thi)
            </h2>
            <p className="text-xs text-slate-500">
              Bao gồm trả đúng hạn, trả trước hạn, đảo nợ và lệnh giải ngân tái vay mới
            </p>
          </div>

          {/* Table Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Tìm số hợp đồng, ghi chú..."
                value={searchContract}
                onChange={(e) => setSearchContract(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
            >
              <option value="ALL">Tất cả ngân hàng</option>
              <option value="MBB">MBBank (MBB)</option>
              <option value="CTG">VietinBank (CTG)</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
            >
              <option value="ALL">Tất cả hành động</option>
              <option value="REBORROW">Tái giải ngân vay lại mới</option>
              <option value="PREPAYMENT">Trả trước hạn (Tất toán & Chia nhỏ)</option>
              <option value="ROLLOVER">Đảo nợ (Gia hạn tối đa)</option>
              <option value="REGULAR">Thanh toán đúng hạn</option>
            </select>
          </div>
        </div>

        {/* Allocations Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Ngân Hàng</th>
                <th className="py-3 px-3">Số Hợp Đồng</th>
                <th className="py-3 px-3 text-right">Dư Nợ Gốc</th>
                <th className="py-3 px-3 text-center">Lãi Suất</th>
                <th className="py-3 px-3 text-center">Hạn Gốc</th>
                <th className="py-3 px-3 text-center">Hành Động</th>
                <th className="py-3 px-3 text-center">Tháng Thực Thi</th>
                <th className="py-3 px-3 text-right text-indigo-700">Số Tiền</th>
                <th className="py-3 px-3 text-right">Còn Lại</th>
                <th className="py-3 px-3 text-right text-emerald-600">Tiết Kiệm Lãi</th>
                <th className="py-3 px-4">Ghi Chú Nghiệp Vụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAllocations.map((alc, idx) => {
                const isRollover = alc.action_type === 'ROLLOVER_REFINANCE';
                const isReborrow = alc.action_type === 'NEW_REBORROW_DRAWDOWN';

                return (
                  <tr key={`${alc.loan_id}-${alc.action_type}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${alc.bank_code === 'MBB' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                      >
                        {alc.bank_code}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">{alc.contract_number}</td>
                    <td className="py-3 px-3 text-right font-medium text-slate-600">
                      {formatVND(alc.original_balance)}
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-700">
                      {alc.interest_rate}%
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500 font-medium">
                      {alc.original_due_date || '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isReborrow
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : alc.action_type === 'FULL_PREPAYMENT'
                              ? 'bg-purple-100 text-purple-700'
                              : alc.action_type === 'PARTIAL_PREPAYMENT'
                                ? 'bg-amber-100 text-amber-800'
                                : isRollover
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                          }`}
                      >
                        {isReborrow && 'Tái giải ngân vay lại'}
                        {alc.action_type === 'FULL_PREPAYMENT' && 'Tất toán sớm'}
                        {alc.action_type === 'PARTIAL_PREPAYMENT' && 'Trả trước một phần'}
                        {alc.action_type === 'PAY_ON_DUE' && 'Trả đúng hạn'}
                        {isRollover && 'Đảo nợ tối đa'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {alc.payment_month}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-indigo-700">
                      {alc.payment_amount > 0 ? formatVND(alc.payment_amount) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-500">
                      {formatVND(alc.remaining_balance_after)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-600">
                      {alc.estimated_interest_saved > 0 ? `+${formatVND(alc.estimated_interest_saved)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs truncate" title={alc.note}>
                      {alc.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
