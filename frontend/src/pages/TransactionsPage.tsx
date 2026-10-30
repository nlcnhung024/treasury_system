import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  Lock,
  Unlock,
  Tag,
  Edit3,
  Check,
  X,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { Transaction, Category } from '../types';

export const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Bộ lọc đa chiều
  const [keyword, setKeyword] = useState<string>('');
  const [bankCode, setBankCode] = useState<string>('');
  const [flowType, setFlowType] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);

  // Bulk Tagging
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('');

  // Inline Note Editing
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  // Inline Running Balance Anchor Editing
  const [editingBalanceId, setEditingBalanceId] = useState<number | null>(null);
  const [balanceDraft, setBalanceDraft] = useState<string>('');
  const [savingBalance, setSavingBalance] = useState<boolean>(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page, bankCode, flowType, categoryFilter, fromDate, toDate]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/transactions', {
        params: {
          page,
          limit: 50,
          keyword: keyword || undefined,
          bank_code: bankCode || undefined,
          flow_type: flowType || undefined,
          category_id: categoryFilter !== '' ? Number(categoryFilter) : undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
      });
      setTransactions(res.data.data || []);
      setTotalPages(res.data.pagination?.total_pages || 1);
      setTotalRecords(res.data.pagination?.total_records || 0);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInlineCategoryChange = async (txId: number, newCatVal: string) => {
    try {
      if (newCatVal === '') {
        await api.patch(`/transactions/${txId}`, { clear_category: true });
      } else {
        await api.patch(`/transactions/${txId}`, {
          category_id: Number(newCatVal),
          is_manual_override: true,
        });
      }
      await fetchTransactions();
    } catch (err: any) {
      alert(`Không thể cập nhật danh mục: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleToggleLock = async (tx: Transaction) => {
    try {
      await api.patch(`/transactions/${tx.transaction_id}`, {
        is_manual_override: !tx.is_manual_override,
      });
      await fetchTransactions();
    } catch (err: any) {
      alert(`Lỗi khóa/mở khóa: ${err.message}`);
    }
  };

  const handleSaveNote = async (txId: number) => {
    try {
      await api.patch(`/transactions/${txId}`, {
        internal_note: noteDraft,
      });
      setEditingNoteId(null);
      await fetchTransactions();
    } catch (err: any) {
      alert(`Lỗi lưu ghi chú: ${err.message}`);
    }
  };

  const handleSaveRunningBalance = async (txId: number) => {
    const cleaned = balanceDraft.replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
    const numericVal = Number(cleaned);
    if (isNaN(numericVal)) {
      alert('Số dư lũy kế không hợp lệ. Vui lòng nhập số (VD: 50000000 hoặc 50.000.000)!');
      return;
    }
    setSavingBalance(true);
    try {
      await api.patch(`/transactions/${txId}`, {
        running_balance: cleaned,
      });
      setEditingBalanceId(null);
      await fetchTransactions();
    } catch (err: any) {
      alert(`Lỗi cập nhật số dư lũy kế: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingBalance(false);
    }
  };

  const handleBulkTag = async () => {
    if (selectedIds.length === 0) return;
    if (bulkCategoryId === '') {
      alert('Vui lòng chọn một danh mục để gán nhãn hàng loạt!');
      return;
    }
    try {
      const catId = bulkCategoryId === 'CLEAR' ? null : Number(bulkCategoryId);
      await api.post('/transactions/bulk-tag', {
        transaction_ids: selectedIds,
        category_id: catId,
        is_manual_override: catId !== null,
      });
      setBulkCategoryId('');
      await fetchTransactions();
    } catch (err: any) {
      alert(`Lỗi gán nhãn hàng loạt: ${err.response?.data?.detail || err.message}`);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map((t) => t.transaction_id));
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (bankCode) params.set('bank_code', bankCode);
    if (categoryFilter !== '') params.set('category_id', categoryFilter);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (keyword) params.set('keyword', keyword);
    const qs = params.toString();
    const baseUrl = api.defaults.baseURL || '/api/v1';
    window.open(`${baseUrl}/reports/export/excel${qs ? `?${qs}` : ''}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Danh Sách Giao Dịch Chi Tiết ({totalRecords.toLocaleString('vi-VN')} dòng)
            </h1>
            <p className="text-sm text-slate-500">
              Bộ lọc đa chiều • Chọn gán danh mục trực tiếp (Inline Tagging) • Gán nhãn hàng loạt • Ghi chú nội bộ & Khóa bảo vệ
            </p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Báo Cáo Excel Chuẩn Kế Toán</span>
          </button>
        </div>

        {/* Bộ lọc đa chiều */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nội dung, số bút toán, ghi chú..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  fetchTransactions();
                }
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={bankCode}
            onChange={(e) => {
              setBankCode(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả Ngân hàng</option>
            <option value="MBB">MBBank (MBB)</option>
            <option value="MBV">MBV Business (MBV)</option>
            <option value="VPB">VPBank (VPB)</option>
            <option value="TPB">TPBank (TPB)</option>
            <option value="CTG">VietinBank (CTG)</option>
            <option value="SHB">SHB</option>
          </select>

          <select
            value={flowType}
            onChange={(e) => {
              setFlowType(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả Luồng Thu/Chi</option>
            <option value="CREDIT">Phát sinh Có (Thu vào +)</option>
            <option value="DEBIT">Phát sinh Nợ (Chi ra -)</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả Danh mục</option>
            <option value="-1">⚠️ Chưa phân loại</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                [{c.category_type === 'INCOME' ? 'THU' : 'CHI'}] {c.category_name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setPage(1);
              fetchTransactions();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Lọc dữ liệu
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Từ ngày:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
            />
            <span>Đến ngày:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
            />
            {(fromDate || toDate || bankCode || flowType || categoryFilter || keyword) && (
              <button
                onClick={() => {
                  setKeyword('');
                  setBankCode('');
                  setFlowType('');
                  setCategoryFilter('');
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
                className="text-blue-600 hover:underline ml-2"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          {/* Thanh công cụ Gán nhãn Hàng loạt (Bulk Tagging) */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-blue-900">Đã chọn {selectedIds.length} dòng:</span>
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="bg-white border border-blue-300 rounded px-2 py-1 text-xs"
              >
                <option value="">-- Chọn danh mục gán hàng loạt --</option>
                <option value="CLEAR">Bỏ phân loại (Xóa nhãn)</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    [{c.category_type === 'INCOME' ? 'THU' : 'CHI'}] {c.category_name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkTag}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
              >
                Áp dụng & Khóa
              </button>
            </div>
          )}
        </div>

        {/* Bảng Giao dịch */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={transactions.length > 0 && selectedIds.length === transactions.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-3">Ngày giờ GD</th>
                <th className="px-3 py-3">NH / Số TK</th>
                <th className="px-3 py-3">Nội dung Diễn giải</th>
                <th className="px-3 py-3 text-right">Phát sinh Nợ (-)</th>
                <th className="px-3 py-3 text-right">Phát sinh Có (+)</th>
                <th className="px-3 py-3 text-right">Số dư Lũy kế</th>
                <th className="px-3 py-3">Danh mục (Inline Tagging)</th>
                <th className="px-3 py-3">Ghi chú Nội bộ</th>
                <th className="px-3 py-3 text-center">Khóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">
                    {loading ? 'Đang tải dữ liệu...' : 'Không có giao dịch nào khớp điều kiện lọc.'}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(tx.transaction_id)}
                        onChange={() => toggleSelectRow(tx.transaction_id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px]">
                      <div>{tx.transaction_date.slice(0, 10)}</div>
                      <div className="text-slate-400">{tx.transaction_date.slice(11, 19)}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{tx.bank_code || 'MBB'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{tx.account_number}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="text-slate-800 line-clamp-2" title={tx.description}>
                        {tx.description}
                      </div>
                      {tx.reference_number && (
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          Mã GD: {tx.reference_number}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-600 font-medium whitespace-nowrap">
                      {Number(tx.debit_amount) > 0 ? Number(tx.debit_amount).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600 font-medium whitespace-nowrap">
                      {Number(tx.credit_amount) > 0 ? Number(tx.credit_amount).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap min-w-[155px]">
                      {editingBalanceId === tx.transaction_id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            value={balanceDraft}
                            onChange={(e) => setBalanceDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRunningBalance(tx.transaction_id);
                              if (e.key === 'Escape') setEditingBalanceId(null);
                            }}
                            disabled={savingBalance}
                            placeholder="Nhập số dư..."
                            className="w-28 border border-blue-500 rounded px-2 py-1 text-right text-xs font-mono focus:outline-none bg-white"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRunningBalance(tx.transaction_id)}
                            disabled={savingBalance}
                            title="Lưu & tự động tính lại toàn bộ số dư lũy kế của tài khoản này"
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingBalanceId(null)}
                            disabled={savingBalance}
                            title="Hủy"
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingBalanceId(tx.transaction_id);
                            setBalanceDraft(String(Math.round(Number(tx.running_balance))));
                          }}
                          title="Bấm để sửa số dư lũy kế tại dòng này (Hệ thống sẽ lấy làm mốc căn cứ để tính lại toàn bộ số dư lũy kế của tài khoản)"
                          className="group inline-flex items-center justify-end gap-1.5 cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-2 py-1 rounded transition-colors"
                        >
                          <span>{Number(tx.running_balance).toLocaleString('vi-VN')}</span>
                          <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <Tag
                          className="w-3.5 h-3.5 flex-shrink-0"
                          style={{ color: tx.category_color || '#64748B' }}
                        />
                        <select
                          value={tx.category_id ?? ''}
                          onChange={(e) => handleInlineCategoryChange(tx.transaction_id, e.target.value)}
                          className={`w-full border rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            tx.category_id
                              ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <option value="">-- Chưa phân loại --</option>
                          {categories.map((c) => (
                            <option key={c.category_id} value={c.category_id}>
                              [{c.category_type === 'INCOME' ? 'THU' : 'CHI'}] {c.category_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 min-w-[170px]">
                      {editingNoteId === tx.transaction_id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Nhập ghi chú nội bộ..."
                            className="w-full border border-blue-400 rounded px-2 py-1 text-xs focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveNote(tx.transaction_id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingNoteId(tx.transaction_id);
                            setNoteDraft(tx.internal_note || '');
                          }}
                          className="group flex items-center justify-between gap-1 cursor-pointer hover:bg-slate-100 px-2 py-1 rounded"
                        >
                          <span className="text-slate-600 italic truncate max-w-[140px]">
                            {tx.internal_note || 'Thêm ghi chú...'}
                          </span>
                          <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleLock(tx)}
                        title={
                          tx.is_manual_override
                            ? 'Đang khóa bảo vệ thủ công (Bấm để mở khóa cho phép Rule tự động ghi đè)'
                            : 'Bấm để khóa bảo vệ dòng này'
                        }
                        className="p-1 rounded hover:bg-slate-100"
                      >
                        {tx.is_manual_override ? (
                          <Lock className="w-4 h-4 text-amber-500 mx-auto" />
                        ) : (
                          <Unlock className="w-4 h-4 text-slate-300 mx-auto" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-xs text-slate-600">
            <div>
              Trang <span className="font-bold">{page}</span> / <span className="font-bold">{totalPages}</span> (Tổng{' '}
              {totalRecords.toLocaleString('vi-VN')} giao dịch)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              >
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
