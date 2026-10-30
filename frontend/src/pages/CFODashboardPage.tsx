import React, { useState, useEffect } from 'react';
import { DollarSign, Building2, Wallet, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { CFOLiquidityData } from '../types';

export const CFODashboardPage: React.FC = () => {
  const [data, setData] = useState<CFOLiquidityData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchLiquidity();
  }, []);

  const fetchLiquidity = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/cfo/daily-liquidity');
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Báo Cáo Tồn Quỹ Hợp Nhất (CFO - Ông Trần Ngọc Tuấn)</h1>
          <p className="text-sm text-slate-500">Số liệu điều hành sẵn sàng trước 09h00 sáng • SLA truy vấn &le; 100ms</p>
        </div>
        <button
          onClick={fetchLiquidity}
          className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới số liệu</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white shadow-md">
          <div className="flex items-center justify-between opacity-80 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Tổng Tồn Quỹ Hợp Nhất</span>
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {data ? Number(data.total_consolidated_liquidity).toLocaleString('vi-VN') : '0'} <span className="text-sm font-normal">VND</span>
          </div>
          <div className="text-xs text-blue-200 mt-2">Đã bao gồm toàn bộ Ngân hàng & Sổ quỹ tiền mặt</div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Tồn Tiền Gửi Ngân Hàng</span>
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {data ? Number(data.total_bank_balance).toLocaleString('vi-VN') : '0'} <span className="text-sm font-normal text-slate-500">VND</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">Tổng hợp từ các tài khoản doanh nghiệp hoạt động</div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Tồn Quỹ Tiền Mặt</span>
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {data ? Number(data.total_cash_on_hand).toLocaleString('vi-VN') : '0'} <span className="text-sm font-normal text-slate-500">VND</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">Đối ứng dòng rút tiền mặt tài khoản MBBank cá nhân</div>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Chi Tiết Tồn Quỹ Từng Tài Khoản Ngân Hàng</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Ngân hàng</th>
                <th className="px-4 py-3">Tên Ngân hàng</th>
                <th className="px-4 py-3">Số tài khoản</th>
                <th className="px-4 py-3">Chủ tài khoản / Pháp nhân</th>
                <th className="px-4 py-3 text-right">Số dư khả dụng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!data || data.bank_breakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Chưa có tài khoản nào được nạp số dư.
                  </td>
                </tr>
              ) : (
                data.bank_breakdown.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-blue-700">{b.bank_code}</td>
                    <td className="px-4 py-3">{b.bank_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.account_number}</td>
                    <td className="px-4 py-3 text-slate-800">{b.account_holder}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {Number(b.balance).toLocaleString('vi-VN')} VND
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

