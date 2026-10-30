import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import api from '../services/api';
import { CEOWaterfallData } from '../types';

export const CEOWaterfallPage: React.FC = () => {
  const [timeframe, setTimeframe] = useState<'WTD' | 'MTD'>('MTD');
  const [data, setData] = useState<CEOWaterfallData | null>(null);

  useEffect(() => {
    fetchWaterfall();
  }, [timeframe]);

  const fetchWaterfall = async () => {
    try {
      const res = await api.get('/reports/ceo/waterfall', { params: { timeframe } });
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Báo Cáo Thác Nước Thu / Chi (CEO - Bà Nguyễn Thị Lan Anh)</h1>
          <p className="text-sm text-slate-500">
            Phân rã biến động dòng tiền từ Số dư Đầu kỳ đến Số dư Cuối kỳ theo cấu phần danh mục
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          <button
            onClick={() => setTimeframe('WTD')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              timeframe === 'WTD' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lũy kế Tuần (WTD)
          </button>
          <button
            onClick={() => setTimeframe('MTD')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              timeframe === 'MTD' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lũy kế Tháng (MTD)
          </button>
        </div>
      </div>

      {/* Waterfall Visualization Simulation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-6">Mô Hình Biến Động Dòng Tiền ({timeframe})</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs uppercase text-slate-500 font-semibold mb-1">Số dư Đầu kỳ</div>
            <div className="text-xl font-bold font-mono text-slate-800">
              {data ? Number(data.opening_balance).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-xs uppercase text-emerald-700 font-semibold mb-1 flex items-center">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              Tổng Dòng Tiền Thu (+)
            </div>
            <div className="text-xl font-bold font-mono text-emerald-700">
              {data && data.income_components[0] ? Number(data.income_components[0].amount).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
          <div className="p-4 rounded-lg bg-red-50 border border-red-200">
            <div className="text-xs uppercase text-red-700 font-semibold mb-1 flex items-center">
              <ArrowDownRight className="w-4 h-4 mr-1" />
              Tổng Dòng Tiền Chi (-)
            </div>
            <div className="text-xl font-bold font-mono text-red-700">
              {data && data.expense_components[0] ? Number(data.expense_components[0].amount).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-xs uppercase text-blue-700 font-semibold mb-1">Số dư Cuối kỳ</div>
            <div className="text-xl font-bold font-mono text-blue-800">
              {data ? Number(data.closing_balance).toLocaleString('vi-VN') : '0'} VND
            </div>
          </div>
        </div>

        {/* Steps List */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
          <div className="text-sm font-semibold text-slate-700 mb-3">Tuần tự các bước biến động:</div>
          <div className="space-y-2">
            {data?.steps.map((st, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-sm">
                <span className="font-medium text-slate-800">{st.name}</span>
                <span className={`font-mono font-bold ${
                  st.type === 'INCOME' ? 'text-emerald-600' : st.type === 'EXPENSE' ? 'text-red-600' : 'text-slate-900'
                }`}>
                  {st.type === 'EXPENSE' ? '-' : st.type === 'INCOME' ? '+' : ''}
                  {Number(st.value).toLocaleString('vi-VN')} VND
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

