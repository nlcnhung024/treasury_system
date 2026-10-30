import React, { useState, useEffect } from 'react';
import { DollarSign, Building2, Wallet, RefreshCw, PlusCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../services/api';
import { CFOLiquidityData, CashLedgerEntry } from '../types';

export const CFODashboardPage: React.FC = () => {
  const [data, setData] = useState<CFOLiquidityData | null>(null);
  const [cashEntries, setCashEntries] = useState<CashLedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form thêm phiếu thu/chi tiền mặt trực tiếp
  const [entryType, setEntryType] = useState<'INFLOW' | 'OUTFLOW'>('INFLOW');
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>('');
  const [receiverPayer, setReceiverPayer] = useState<string>('NGUYEN THI LAN ANH');
  const [reason, setReason] = useState<string>('');
  const [submittingCash, setSubmittingCash] = useState<boolean>(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [liqRes, cashRes] = await Promise.all([
        api.get('/reports/cfo/daily-liquidity'),
        api.get('/cash-ledger', { params: { limit: 30 } }),
      ]);
      setData(liqRes.data);
      setCashEntries(cashRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount.replace(/,/g, ''));
    if (!numAmt || numAmt <= 0 || !reason.trim()) {
      alert('Vui lòng nhập số tiền hợp lệ (> 0) và lý do thu/chi tiền mặt.');
      return;
    }
    setSubmittingCash(true);
    try {
      await api.post('/cash-ledger', {
        entry_date: entryDate,
        entry_type: entryType,
        amount: numAmt,
        receiver_payer: receiverPayer.trim() || null,
        reason: reason.trim(),
      });
      setAmount('');
      setReason('');
      await fetchAllData();
    } catch (err: any) {
      alert(`Lỗi ghi sổ quỹ tiền mặt: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSubmittingCash(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Báo Cáo Tồn Quỹ Hợp Nhất Đầu Ngày (CFO - Ông Trần Ngọc Tuấn)
          </h1>
          <p className="text-sm text-slate-500">
            Số liệu điều hành sẵn sàng trước 09h00 sáng • Hợp nhất Tồn Ngân hàng + Sổ quỹ Tiền mặt đối ứng
          </p>
        </div>
        <button
          onClick={fetchAllData}
          className="flex items-center space-x-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
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
            {data ? Number(data.total_consolidated_liquidity).toLocaleString('vi-VN') : '0'}{' '}
            <span className="text-sm font-normal">VND</span>
          </div>
          <div className="text-xs text-blue-200 mt-2">
            Tồn Ngân hàng + Tồn Quỹ Tiền mặt (Ngày báo cáo: {data?.report_date || '—'})
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Tồn Tiền Gửi Ngân Hàng</span>
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {data ? Number(data.total_bank_balance).toLocaleString('vi-VN') : '0'}{' '}
            <span className="text-sm font-normal text-slate-500">VND</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Tổng hợp từ {data?.bank_breakdown.length || 0} tài khoản ngân hàng đang hoạt động
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs uppercase font-semibold tracking-wider">Tồn Quỹ Tiền Mặt Tại Quỹ</span>
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            {data ? Number(data.total_cash_on_hand).toLocaleString('vi-VN') : '0'}{' '}
            <span className="text-sm font-normal text-slate-500">VND</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Tự động đối ứng các bút toán "RUT TIEN" & Phiếu thu/chi tiền mặt
          </div>
        </div>
      </div>

      {/* Chi Tiết Tồn Quỹ Từng Tài Khoản Ngân Hàng */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Chi Tiết Số Dư Từng Tài Khoản Ngân Hàng & TK Ủy Quyền CEO
        </h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Mã NH</th>
                <th className="px-4 py-3">Tên Ngân hàng</th>
                <th className="px-4 py-3">Số tài khoản</th>
                <th className="px-4 py-3">Chủ tài khoản / Pháp nhân</th>
                <th className="px-4 py-3">Phân loại Tài khoản</th>
                <th className="px-4 py-3 text-right">Số dư Khả dụng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!data || data.bank_breakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">
                    Chưa có tài khoản nào được nạp số dư. Vui lòng tải file sao kê tại màn hình Nạp Sao Kê.
                  </td>
                </tr>
              ) : (
                data.bank_breakdown.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-blue-700">{b.bank_code}</td>
                    <td className="px-4 py-3">{b.bank_name}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{b.account_number}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{b.account_holder}</td>
                    <td className="px-4 py-3">
                      {b.account_type === 'SPECIAL_CASH' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          TK Ủy quyền Tiền mặt CEO (SPECIAL_CASH)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                          TK Doanh nghiệp (CORPORATE)
                        </span>
                      )}
                    </td>
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

      {/* Sổ Quỹ Tiền Mặt Đối Ứng (cash_ledger) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">
            Sổ Quỹ Tiền Mặt Đối Ứng (`cash_ledger`) — Tự Động Từ Sao Kê & Nhập Phiếu Thu/Chi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Các lệnh rút tiền mặt ("RUT TIEN") từ sao kê tự động sinh bút toán NHẬP QUỸ (INFLOW). Kế toán có thể lập thêm phiếu Thu/Chi tiền mặt trực tiếp bên dưới.
          </p>
        </div>

        {/* Form lập phiếu Thu/Chi tiền mặt */}
        <form
          onSubmit={handleAddCashEntry}
          className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg mb-4 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Loại phiếu</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as 'INFLOW' | 'OUTFLOW')}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-medium"
            >
              <option value="INFLOW">➕ Nhập quỹ (INFLOW)</option>
              <option value="OUTFLOW">➖ Xuất quỹ (OUTFLOW)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ngày ghi sổ</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số tiền (VND)</label>
            <input
              type="number"
              min="1"
              step="any"
              placeholder="VD: 50000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Người nộp / nhận</label>
            <input
              type="text"
              value={receiverPayer}
              onChange={(e) => setReceiverPayer(e.target.value)}
              placeholder="Tên người giao dịch..."
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lý do thu / chi tiền mặt</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Chi tiền mặt công tác phí..."
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submittingCash}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Ghi Sổ Quỹ</span>
            </button>
          </div>
        </form>

        {/* Bảng Sổ Quỹ Tiền Mặt */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Ngày ghi sổ</th>
                <th className="px-3 py-2.5">Loại bút toán</th>
                <th className="px-3 py-2.5">Người nhận / nộp</th>
                <th className="px-3 py-2.5">Lý do / Diễn giải</th>
                <th className="px-3 py-2.5 text-right">Số tiền phát sinh</th>
                <th className="px-3 py-2.5 text-right">Tồn quỹ lũy kế</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cashEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Chưa có bút toán tiền mặt nào trong sổ quỹ.
                  </td>
                </tr>
              ) : (
                cashEntries.map((ce) => (
                  <tr key={ce.cash_entry_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono">{ce.entry_date}</td>
                    <td className="px-3 py-2.5">
                      {ce.entry_type === 'INFLOW' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          <ArrowDownLeft className="w-3 h-3" /> NHẬP QUỸ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          <ArrowUpRight className="w-3 h-3" /> XUẤT QUỸ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{ce.receiver_payer || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-800">{ce.reason}</div>
                      {ce.internal_note && <div className="text-[11px] text-slate-400 italic">{ce.internal_note}</div>}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono font-semibold ${
                        ce.entry_type === 'INFLOW' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {ce.entry_type === 'INFLOW' ? '+' : '-'}
                      {Number(ce.amount).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                      {Number(ce.running_cash_balance).toLocaleString('vi-VN')} VND
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
