import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCheck,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Undo2,
  Landmark,
  TrendingDown,
  Calendar,
  Sparkles,
  Layers,
  Percent,
  Check,
} from 'lucide-react';
import api from '../services/api';
import {
  UnreconciledDebtTransaction,
  LoanRepaymentHistoryRecord,
  CreditFacility,
} from '../types';

export const LoanRepaymentReconcilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'unreconciled' | 'history'>('unreconciled');
  const [unreconciledList, setUnreconciledList] = useState<UnreconciledDebtTransaction[]>([]);
  const [historyList, setHistoryList] = useState<LoanRepaymentHistoryRecord[]>([]);
  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Filters
  const [bankFilter, setBankFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [selectedTx, setSelectedTx] = useState<UnreconciledDebtTransaction | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<number | ''>('');
  const [modalLoanSearch, setModalLoanSearch] = useState<string>('');
  const [principalAmount, setPrincipalAmount] = useState<number>(0);
  const [interestAmount, setInterestAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');

  // Rollback confirmation
  const [rollbackItem, setRollbackItem] = useState<LoanRepaymentHistoryRecord | null>(null);

  // 1. Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [unrecRes, histRes, loansRes] = await Promise.all([
        api.get('/loans/repayment-reconciliations/unreconciled', {
          params: { bank_code: bankFilter || undefined, keyword: searchTerm || undefined, limit: 150 },
        }),
        api.get('/loans/repayment-reconciliations/history', {
          params: { bank_code: bankFilter || undefined, limit: 150 },
        }),
        api.get('/loans', { params: { limit: 500, status_filter: '' } }),
      ]);

      setUnreconciledList(unrecRes.data?.items || []);
      setHistoryList(histRes.data?.items || []);
      setLoans(loansRes.data?.data || loansRes.data?.items || []);
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu đối soát trả nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [bankFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // KPIs
  const totalUnreconciledCount = unreconciledList.length;
  const totalUnreconciledAmount = useMemo(
    () => unreconciledList.reduce((acc, it) => acc + (Number(it.debit_amount) || 0), 0),
    [unreconciledList]
  );
  const totalPrincipalRepaid = useMemo(
    () => historyList.reduce((acc, it) => acc + (Number(it.principal_amount) || 0), 0),
    [historyList]
  );
  const totalInterestRepaid = useMemo(
    () => historyList.reduce((acc, it) => acc + (Number(it.interest_amount) || 0), 0),
    [historyList]
  );

  // Open modal for transaction
  const handleOpenReconcileModal = (tx: UnreconciledDebtTransaction) => {
    setSelectedTx(tx);
    setModalError('');
    setNotes('');
    setModalLoanSearch('');

    // Pre-select loan if auto-suggested or match by contract number
    let matchedId: number | '' = '';
    if (tx.suggested_loan_id) {
      matchedId = tx.suggested_loan_id;
    } else if (tx.suggested_contract_number) {
      const found = loans.find(
        (l) => l.contract_number.toUpperCase() === tx.suggested_contract_number?.toUpperCase()
      );
      if (found) matchedId = found.loan_id;
    }
    setSelectedLoanId(matchedId);

    // Pre-fill amounts
    const debit = Number(tx.debit_amount) || 0;
    if (tx.suggested_principal_amount !== undefined && tx.suggested_interest_amount !== undefined) {
      setPrincipalAmount(Number(tx.suggested_principal_amount));
      setInterestAmount(Number(tx.suggested_interest_amount));
    } else {
      // Default: 100% Principal as requested
      setPrincipalAmount(debit);
      setInterestAmount(0);
    }
  };

  // Quick button: 100% Principal
  const handleSet100PercentPrincipal = () => {
    if (!selectedTx) return;
    const total = Number(selectedTx.debit_amount) || 0;
    setPrincipalAmount(total);
    setInterestAmount(0);
    setModalError('');
  };

  // Quick button: 100% Interest
  const handleSet100PercentInterest = () => {
    if (!selectedTx) return;
    const total = Number(selectedTx.debit_amount) || 0;
    setPrincipalAmount(0);
    setInterestAmount(total);
    setModalError('');
  };

  // Input changes with auto-balance
  const handlePrincipalChange = (valStr: string) => {
    if (!selectedTx) return;
    const val = Number(valStr) || 0;
    const total = Number(selectedTx.debit_amount) || 0;
    setPrincipalAmount(val);
    setInterestAmount(Math.max(0, total - val));
    setModalError('');
  };

  const handleInterestChange = (valStr: string) => {
    if (!selectedTx) return;
    const val = Number(valStr) || 0;
    const total = Number(selectedTx.debit_amount) || 0;
    setInterestAmount(val);
    setPrincipalAmount(Math.max(0, total - val));
    setModalError('');
  };

  // Currently selected loan object
  const currentLoan = useMemo(() => {
    if (!selectedLoanId) return null;
    return loans.find((l) => l.loan_id === Number(selectedLoanId)) || null;
  }, [selectedLoanId, loans]);

  // Filtered loans list inside modal for searching
  const filteredModalLoans = useMemo(() => {
    if (!modalLoanSearch.trim()) return loans;
    const s = modalLoanSearch.toLowerCase();
    return loans.filter(
      (l) =>
        l.contract_number.toLowerCase().includes(s) ||
        (l.bank_code && l.bank_code.toLowerCase().includes(s)) ||
        (l.bank_name && l.bank_name.toLowerCase().includes(s)) ||
        (l.borrower_name && l.borrower_name.toLowerCase().includes(s))
    );
  }, [loans, modalLoanSearch]);

  // Validation state in modal
  const isSplitValid = useMemo(() => {
    if (!selectedTx) return false;
    const total = Number(selectedTx.debit_amount) || 0;
    return Math.abs(principalAmount + interestAmount - total) < 0.01;
  }, [selectedTx, principalAmount, interestAmount]);

  const isOverpayment = useMemo(() => {
    if (!currentLoan) return false;
    const curBal = Number(currentLoan.current_principal_balance) || 0;
    return principalAmount > curBal;
  }, [currentLoan, principalAmount]);

  // Submit Reconcile
  const handleConfirmReconcile = async () => {
    if (!selectedTx || !selectedLoanId) {
      setModalError('Vui lòng chọn khoản vay / số khế ước đối ứng.');
      return;
    }
    if (!isSplitValid) {
      setModalError('Tổng số tiền trả gốc và trả lãi phải đúng bằng tổng giá trị giao dịch.');
      return;
    }
    if (isOverpayment) {
      setModalError('Số tiền trả gốc không được vượt quá dư nợ gốc hiện tại của khoản vay.');
      return;
    }

    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.post('/loans/repayment-reconciliations/reconcile', {
        transaction_id: selectedTx.transaction_id,
        loan_id: Number(selectedLoanId),
        principal_amount: principalAmount,
        interest_amount: interestAmount,
        notes: notes || undefined,
      });

      setSuccessToast(res.data?.message || 'Đối soát và giảm trừ nợ gốc thành công!');
      setSelectedTx(null);
      fetchData();
      setTimeout(() => setSuccessToast(''), 6000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi đối soát giao dịch.';
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Rollback
  const handleConfirmRollback = async () => {
    if (!rollbackItem) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/loans/repayment-reconciliations/${rollbackItem.repayment_id}/rollback`);
      setSuccessToast(res.data?.message || 'Hoàn tác đối soát thành công!');
      setRollbackItem(null);
      fetchData();
      setTimeout(() => setSuccessToast(''), 6000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi hủy đối soát.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-20 right-8 z-50 flex items-center space-x-3 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div className="text-sm font-medium">{successToast}</div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Đối Soát Chi Trả Nợ & Giảm Trừ Nợ Gốc
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động lọc giao dịch chi từ sao kê ngân hàng • Khung chia Gốc & Lãi trực quan • Ghi vết lịch sử theo đúng thời điểm giao dịch
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center justify-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Chờ đối soát
            </span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <div className="text-2xl font-black text-amber-600">
              {totalUnreconciledCount}
            </div>
            <span className="text-xs text-slate-500">giao dịch chi</span>
          </div>
          <div className="text-xs text-slate-600 mt-1 font-semibold">
            Tổng tiền: {totalUnreconciledAmount.toLocaleString('vi-VN')} đ
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Gốc đã giảm trừ
            </span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <div className="text-2xl font-black text-blue-600">
              {(totalPrincipalRepaid / 1e9).toFixed(2)}
            </div>
            <span className="text-xs text-slate-500">tỷ VND</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Đã trừ trực tiếp vào dư nợ các khế ước
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Lãi đã đối soát
            </span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Percent className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <div className="text-2xl font-black text-emerald-600">
              {totalInterestRepaid.toLocaleString('vi-VN')}
            </div>
            <span className="text-xs text-slate-500">đ</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Số tiền lãi ghi nhận theo sao kê
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Lịch sử đối soát
            </span>
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <CheckCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <div className="text-2xl font-black text-purple-600">
              {historyList.length}
            </div>
            <span className="text-xs text-slate-500">lần ghi nhận</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Chuẩn kiểm toán thời điểm giao dịch
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>
      </div>

      {/* Tabs & Search Filter Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('unreconciled')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'unreconciled'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Chờ đối soát</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'unreconciled'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {unreconciledList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Nhật ký lịch sử trả nợ</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'history'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {historyList.length}
              </span>
            </button>
          </div>

          {/* Filters */}
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-3">
            {/* Bank dropdown */}
            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Tất cả ngân hàng</option>
              <option value="CTG">VietinBank (CTG)</option>
              <option value="MBB">MBBank (MBB)</option>
              <option value="BIDV">BIDV</option>
              <option value="VPB">VPBank</option>
            </select>

            {/* Keyword Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm khế ước, diễn giải..."
                className="text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
              />
            </div>

            <button
              type="submit"
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
            >
              Lọc
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'unreconciled' ? (
        /* ================= TAB 1: DANH SÁCH CHỜ ĐỐI SOÁT ================= */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-slate-800">
                Giao Dịch Chi Trả Nợ Chờ Đối Soát
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Hiển thị {unreconciledList.length} giao dịch chi
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Đang tải danh sách giao dịch...</span>
            </div>
          ) : unreconciledList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <div className="font-semibold text-slate-700 text-base">
                Không có giao dịch trả nợ nào chờ đối soát!
              </div>
              <p className="text-xs text-slate-500 max-w-md">
                Tất cả các khoản chi trả nợ từ sao kê ngân hàng đã được đối soát và ghi nhận giảm nợ gốc đầy đủ.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Thời Gian Giao Dịch</th>
                    <th className="py-3 px-4">Tài Khoản / Ngân Hàng</th>
                    <th className="py-3 px-4 text-right">Số Tiền Chi Ra</th>
                    <th className="py-3 px-4">Nội Dung Sao Kê Ngân Hàng</th>
                    <th className="py-3 px-4">Gợi Ý Khế Ước Tự Động</th>
                    <th className="py-3 px-4 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {unreconciledList.map((tx) => (
                    <tr key={tx.transaction_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Thời gian */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(tx.transaction_date).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Tài khoản & Ngân hàng */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 mr-1.5">
                          {tx.bank_code}
                        </span>
                        <span className="font-mono text-slate-800 text-[11px]">
                          {tx.account_number || 'N/A'}
                        </span>
                        {tx.account_holder && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                            {tx.account_holder}
                          </div>
                        )}
                      </td>

                      {/* Số tiền chi */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-sm text-red-600">
                          -{Number(tx.debit_amount).toLocaleString('vi-VN')} đ
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {tx.category_name || 'Trả nợ'}
                        </span>
                      </td>

                      {/* Diễn giải */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-slate-800 line-clamp-2 leading-relaxed" title={tx.description}>
                          {tx.description}
                        </div>
                        {tx.reference_number && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Ref: {tx.reference_number}
                          </span>
                        )}
                      </td>

                      {/* Gợi ý Khế ước tự động */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {tx.suggested_contract_number ? (
                          <div className="space-y-1">
                            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Landmark className="w-3.5 h-3.5" />
                              <span>{tx.suggested_contract_number}</span>
                            </div>
                            {tx.suggested_principal_balance !== undefined && (
                              <div className="text-[11px] text-slate-500">
                                Dư nợ: <span className="font-semibold text-slate-700">{Number(tx.suggested_principal_balance).toLocaleString('vi-VN')} đ</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-slate-400 bg-slate-100">
                            Chưa tìm thấy khế ước
                          </span>
                        )}
                      </td>

                      {/* Nút thao tác */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenReconcileModal(tx)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm hover:shadow transition-all"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Đối soát ngay</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ================= TAB 2: LỊCH SỬ ĐÃ ĐỐI SOÁT ================= */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCheck className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-bold text-slate-800">
                Nhật Ký Lịch Sử Giảm Trừ Nợ Chuẩn Kiểm Toán
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Tổng cộng {historyList.length} giao dịch đã đối soát
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
              <span>Đang tải lịch sử trả nợ...</span>
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Chưa có lịch sử đối soát nào được ghi nhận.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Thời Điểm Trả Nợ (Sao kê)</th>
                    <th className="py-3 px-4">Khế Ước / Ngân Hàng</th>
                    <th className="py-3 px-4 text-right">Số Tiền Trả Gốc</th>
                    <th className="py-3 px-4 text-right">Số Tiền Trả Lãi</th>
                    <th className="py-3 px-4 text-right">Dư Nợ Còn Lại</th>
                    <th className="py-3 px-4">Nội Dung Diễn Giải</th>
                    <th className="py-3 px-4">Người Thực Hiện</th>
                    <th className="py-3 px-4 text-center">Hoàn Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {historyList.map((hist) => (
                    <tr key={hist.repayment_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Thời điểm trả nợ đúng bằng thời điểm giao dịch */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {new Date(hist.repayment_date).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-emerald-600 font-semibold flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(hist.repayment_date).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Khế ước */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 flex items-center space-x-1">
                          <span>{hist.contract_number}</span>
                        </div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 mt-0.5">
                          {hist.bank_code}
                        </span>
                      </td>

                      {/* Tiền gốc */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-600 whitespace-nowrap">
                        {Number(hist.principal_amount).toLocaleString('vi-VN')} đ
                      </td>

                      {/* Tiền lãi */}
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 whitespace-nowrap">
                        {Number(hist.interest_amount).toLocaleString('vi-VN')} đ
                      </td>

                      {/* Dư nợ còn lại sau trừ */}
                      <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {Number(hist.remaining_principal_balance).toLocaleString('vi-VN')} đ
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Trước: {Number(hist.previous_principal_balance).toLocaleString('vi-VN')} đ
                        </div>
                      </td>

                      {/* Diễn giải */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-slate-700 line-clamp-1" title={hist.transaction_description}>
                          {hist.transaction_description || 'Không có mô tả'}
                        </div>
                        {hist.notes && (
                          <div className="text-[11px] text-indigo-600 font-normal">
                            Note: {hist.notes}
                          </div>
                        )}
                      </td>

                      {/* Người thực hiện */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                        {hist.reconciled_by}
                      </td>

                      {/* Rollback */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => setRollbackItem(hist)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-colors"
                        >
                          <Undo2 className="w-3 h-3" />
                          <span>Hủy đối soát</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL ĐỐI SOÁT & KHUNG CHIA GỐC - LÃI ================= */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-indigo-600 text-white">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Đối Soát Khoản Chi & Giảm Trừ Nợ Gốc
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Phân bổ số tiền Gốc & Lãi • Ràng buộc tổng tiền tuyệt đối
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Error Alert */}
              {modalError && (
                <div className="flex items-start space-x-3 bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. THÔNG TIN GIAO DỊCH SAO KÊ */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Giao dịch sao kê ngân hàng
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                      {selectedTx.bank_code}
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      TK: {selectedTx.account_number}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-black text-red-600">
                      {Number(selectedTx.debit_amount).toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed">
                  <span className="font-semibold text-slate-900">Diễn giải: </span>
                  {selectedTx.description}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Ngày giao dịch:{' '}
                    <strong>{new Date(selectedTx.transaction_date).toLocaleString('vi-VN')}</strong>{' '}
                    (Sẽ được ghi nhận làm thời điểm trả nợ)
                  </span>
                </div>
              </div>

              {/* 2. CHỌN KHẾ ƯỚC KHOẢN VAY ĐỐI ỨNG */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Khoản vay / Khế ước nhận nợ đối ứng *
                  </label>
                  {selectedTx.suggested_contract_number && (
                    <span className="text-[11px] text-indigo-600 font-semibold flex items-center space-x-1 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span>Đã gợi ý qua số khế ước ({selectedTx.suggested_contract_number})</span>
                    </span>
                  )}
                </div>

                {/* Ô tìm kiếm nhanh khế ước */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={modalLoanSearch}
                    onChange={(e) => setModalLoanSearch(e.target.value)}
                    placeholder="Tìm nhanh khế ước (nhập số khế ước, ngân hàng, tên đơn vị)..."
                    className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                  />
                </div>

                <select
                  value={selectedLoanId}
                  onChange={(e) => setSelectedLoanId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">
                    -- Chọn một khế ước trong danh mục ({filteredModalLoans.length}/{loans.length} khoản vay) --
                  </option>
                  {/* Luôn đảm bảo khoản vay đang chọn được hiển thị */}
                  {currentLoan && !filteredModalLoans.some((l) => l.loan_id === currentLoan.loan_id) && (
                    <option key={currentLoan.loan_id} value={currentLoan.loan_id}>
                      [{currentLoan.bank_code}] Khế ước: {currentLoan.contract_number} • Dư nợ:{' '}
                      {Number(currentLoan.current_principal_balance).toLocaleString('vi-VN')} đ ({currentLoan.status})
                    </option>
                  )}
                  {filteredModalLoans.map((l) => (
                    <option key={l.loan_id} value={l.loan_id}>
                      [{l.bank_code}] Khế ước: {l.contract_number} • Dư nợ:{' '}
                      {Number(l.current_principal_balance).toLocaleString('vi-VN')} đ (
                      {l.status === 'ACTIVE' ? 'Đang vay' : l.status}) • {l.borrower_name || l.bank_name}
                    </option>
                  ))}
                </select>

                {/* Thẻ tóm tắt khoản vay đang chọn */}
                {currentLoan && (
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Đơn vị vay / Bên vay:</span>
                      <span className="font-semibold text-slate-800">{currentLoan.borrower_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Dư nợ gốc hiện tại:</span>
                      <span className="font-mono font-bold text-sm text-indigo-700">
                        {Number(currentLoan.current_principal_balance).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Lãi suất & Ngày đáo hạn:</span>
                      <span className="text-slate-700">
                        {(Number(currentLoan.interest_rate) * 100).toFixed(2)}%/năm • Đến{' '}
                        {currentLoan.maturity_date || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. KHUNG CHIA GỐC & LÃI (SPLIT BOX) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Khung chia Số tiền Trả Gốc & Trả Lãi
                  </div>

                  {/* Nút bấm nhanh 100% Gốc và 100% Lãi */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleSet100PercentPrincipal}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                    >
                      100% Trả Gốc
                    </button>
                    <button
                      type="button"
                      onClick={handleSet100PercentInterest}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all"
                    >
                      100% Trả Lãi
                    </button>
                  </div>
                </div>

                {/* Thanh tiến trình trực quan phân bổ */}
                <div className="space-y-1">
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (principalAmount / (Number(selectedTx.debit_amount) || 1)) * 100
                          )
                        )}%`,
                      }}
                      className="bg-blue-600 h-full transition-all duration-300"
                    />
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (interestAmount / (Number(selectedTx.debit_amount) || 1)) * 100
                          )
                        )}%`,
                      }}
                      className="bg-amber-500 h-full transition-all duration-300"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 px-0.5">
                    <span className="text-blue-600 font-semibold">
                      Gốc:{' '}
                      {(
                        (principalAmount / (Number(selectedTx.debit_amount) || 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                    <span className="text-amber-600 font-semibold">
                      Lãi:{' '}
                      {(
                        (interestAmount / (Number(selectedTx.debit_amount) || 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>

                {/* 2 Ô nhập liệu song song */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Số tiền trả gốc */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Tiền Trả Nợ Gốc (VNĐ)</span>
                      <span className="text-[10px] text-blue-600 font-bold">Trừ dư nợ</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={principalAmount}
                      onChange={(e) => handlePrincipalChange(e.target.value)}
                      className="w-full text-sm font-mono font-bold bg-white border border-slate-300 rounded-xl px-3 py-2 text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-[11px] text-slate-400 font-mono">
                      {principalAmount.toLocaleString('vi-VN')} đ
                    </div>
                  </div>

                  {/* Số tiền trả lãi */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Tiền Trả Lãi (VNĐ)</span>
                      <span className="text-[10px] text-amber-600 font-bold">Chi phí lãi</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={interestAmount}
                      onChange={(e) => handleInterestChange(e.target.value)}
                      className="w-full text-sm font-mono font-bold bg-white border border-slate-300 rounded-xl px-3 py-2 text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="text-[11px] text-slate-400 font-mono">
                      {interestAmount.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                </div>

                {/* Kiểm tra và Cảnh báo Dự báo Dư Nợ */}
                {currentLoan && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Dư nợ gốc sau khi giảm trừ:</span>
                      <span
                        className={`font-mono font-bold ${
                          isOverpayment ? 'text-rose-600' : 'text-slate-900'
                        }`}
                      >
                        {Math.max(
                          0,
                          Number(currentLoan.current_principal_balance) - principalAmount
                        ).toLocaleString('vi-VN')}{' '}
                        đ
                      </span>
                    </div>

                    {/* Huy hiệu tất toán khi về 0 */}
                    {Number(currentLoan.current_principal_balance) - principalAmount === 0 && (
                      <div className="mt-1 flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 p-2 rounded-lg font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Khoản vay sẽ được chuyển sang trạng thái TẤT TOÁN (SETTLED)!</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Ghi chú */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Ghi chú đối soát</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nhập lý do hoặc thông tin đối soát bổ sung..."
                    className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmReconcile}
                disabled={submitting || !selectedLoanId || !isSplitValid || isOverpayment}
                className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-md shadow-indigo-600/30 transition-all"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Xác nhận đối soát & Giảm nợ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL XÁC NHẬN HỦY ĐỐI SOÁT (ROLLBACK) ================= */}
      {rollbackItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-xl">
                <Undo2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900">
                Xác Nhận Hủy Đối Soát Trả Nợ
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn hủy đối soát lần trả nợ cho khế ước{' '}
              <strong>{rollbackItem.contract_number}</strong>?
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 text-slate-700">
              <div>
                Số tiền nợ gốc sẽ hoàn trả lại:{' '}
                <strong className="text-blue-600">
                  +{Number(rollbackItem.principal_amount).toLocaleString('vi-VN')} đ
                </strong>
              </div>
              <div>
                Dư nợ gốc của khế ước sẽ được khôi phục về trạng thái ban đầu.
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRollbackItem(null)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                {submitting ? 'Đang hoàn tác...' : 'Xác nhận hủy đối soát'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
