import React, { useState, useEffect } from 'react';
import { Search, Download, Filter, Lock, Tag, Edit3 } from 'lucide-react';
import api from '../services/api';
import { Transaction } from '../types';

export const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [keyword, setKeyword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/transactions', { params: { keyword: keyword || undefined } });
      setTransactions(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    window.open(`${api.defaults.baseURL}/reports/export/excel`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Danh Sách Giao Dịch Chi Tiết</h1>
            <p className="text-sm text-slate-500">
              Phân loại dòng tiền, gắn tag danh mục thủ công (Inline Tagging) & Quản lý ghi chú nội bộ.
            </p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel An Toàn</span>
          </button>
        </div>

        {/* Toolbar Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm nội dung giao dịch, ghi chú (GIN Index)..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTransactions()}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Tìm kiếm
          </button>
        </div>

        {/* Transaction Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Ngày GD</th>
                <th className="px-4 py-3">Ngân hàng</th>
                <th className="px-4 py-3">Nội dung Diễn giải</th>
                <th className="px-4 py-3 text-right">Phát sinh Nợ (Chi)</th>
                <th className="px-4 py-3 text-right">Phát sinh Có (Thu)</th>
                <th className="px-4 py-3 text-right">Số dư Sau GD</th>
                <th className="px-4 py-3">Danh mục Phân loại</th>
                <th className="px-4 py-3">Ghi chú Nội bộ</th>
                <th className="px-4 py-3 text-center">Khóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu giao dịch. Vui lòng nạp file sao kê.'}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono">{tx.transaction_date.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{tx.bank_code || 'MBB'}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={tx.description}>
                      {tx.description}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">
                      {tx.debit_amount > 0 ? Number(tx.debit_amount).toLocaleString('vi-VN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">
                      {tx.credit_amount > 0 ? Number(tx.credit_amount).toLocaleString('vi-VN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                      {Number(tx.running_balance).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Tag className="w-3 h-3 mr-1" />
                        {tx.category_name || 'Chưa phân loại'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 italic max-w-xs truncate">
                      {tx.internal_note || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.is_manual_override && (
                        <span title="Dòng này đã phân loại tay, quy tắc tự động không được đè">
                          <Lock className="w-4 h-4 text-amber-500 mx-auto" />
                        </span>
                      )}
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

