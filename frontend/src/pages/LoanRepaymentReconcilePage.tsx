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
  Sliders,
  X,
} from 'lucide-react';
import api from '../services/api';
import {
  UnreconciledDebtTransaction,
  LoanRepaymentHistoryRecord,
  CreditFacility,
} from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { SortDirection, sortList } from '../utils/sort';

const BANK_LABELS: Record<string, string> = {
  CTG: 'VietinBank (CTG)',
  MBB: 'MBBank (MBB)',
  TPB: 'TPBank (TPB)',
  VPB: 'VPBank (VPB)',
  MBV: 'MBV (Việt Nam Hiện Đại)',
  SHB: 'SHB',
  BIDV: 'BIDV',
  VCB: 'Vietcombank (VCB)',
  EVF: 'Tài chính EVF',
  TCB: 'Techcombank (TCB)',
  ACB: 'ACB',
  MSB: 'MSB',
  HDB: 'HDBank (HDB)',
};

export const LoanRepaymentReconcilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'unreconciled' | 'history'>('unreconciled');
  const [unreconciledList, setUnreconciledList] = useState<UnreconciledDebtTransaction[]>([]);
  const [historyList, setHistoryList] = useState<LoanRepaymentHistoryRecord[]>([]);
  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
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

  // Sorting State for Unreconciled
  const [unrecSortField, setUnrecSortField] = useState<string>('transaction_date');
  const [unrecSortDirection, setUnrecSortDirection] = useState<SortDirection>('desc');
  const handleUnrecSort = (field: string) => {
    if (unrecSortField === field) {
      setUnrecSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUnrecSortField(field);
      setUnrecSortDirection('asc');
    }
  };
  const sortedUnreconciledList = useMemo(() => {
    let list = unreconciledList;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((tx) =>
        (tx.suggested_contract_number && tx.suggested_contract_number.toLowerCase().includes(q)) ||
        (tx.description && tx.description.toLowerCase().includes(q)) ||
        (tx.bank_code && tx.bank_code.toLowerCase().includes(q)) ||
        (tx.account_number && tx.account_number.toLowerCase().includes(q)) ||
        (tx.reference_number && tx.reference_number.toLowerCase().includes(q)) ||
        (tx.counter_party && tx.counter_party.toLowerCase().includes(q))
      );
    }
    return sortList(list, unrecSortField, unrecSortDirection, {
      account: (tx) => `${tx.bank_code || ''} ${tx.account_number || ''}`,
    });
  }, [unreconciledList, unrecSortField, unrecSortDirection, searchTerm]);

  // Sorting State for History
  const [histSortField, setHistSortField] = useState<string>('repayment_date');
  const [histSortDirection, setHistSortDirection] = useState<SortDirection>('desc');
  const handleHistSort = (field: string) => {
    if (histSortField === field) {
      setHistSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setHistSortField(field);
      setHistSortDirection('asc');
    }
  };
  const sortedHistoryList = useMemo(() => {
    let list = historyList;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((h) =>
        (h.contract_number && h.contract_number.toLowerCase().includes(q)) ||
        (h.transaction_description && h.transaction_description.toLowerCase().includes(q)) ||
        (h.bank_code && h.bank_code.toLowerCase().includes(q)) ||
        (h.notes && h.notes.toLowerCase().includes(q)) ||
        (h.reference_number && h.reference_number.toLowerCase().includes(q)) ||
        (h.reconciled_by && h.reconciled_by.toLowerCase().includes(q))
      );
    }
    return sortList(list, histSortField, histSortDirection, {
      contract: (hist) => `${hist.contract_number || ''} ${hist.bank_code || ''}`,
    });
  }, [historyList, histSortField, histSortDirection, searchTerm]);

  // 1. Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [unrecRes, histRes, loansRes, accRes] = await Promise.all([
        api.get('/loans/repayment-reconciliations/unreconciled', {
          params: { bank_code: bankFilter || undefined, keyword: searchTerm || undefined, limit: 150 },
        }),
        api.get('/loans/repayment-reconciliations/history', {
          params: { bank_code: bankFilter || undefined, keyword: searchTerm || undefined, limit: 150 },
        }),
        api.get('/loans', { params: { limit: 500, status_filter: '' } }),
        api.get('/accounts').catch(() => ({ data: [] })),
      ]);

      setUnreconciledList(unrecRes.data?.items || []);
      setHistoryList(histRes.data?.items || []);
      setLoans(loansRes.data?.data || loansRes.data?.items || []);
      setBankAccounts(accRes.data || []);
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

  // Danh sách ngân hàng khả dụng được tự động tổng hợp từ tài khoản ngân hàng, khế ước và giao dịch
  const bankOptions = useMemo(() => {
    const map = new Map<string, string>();

    // 1. Thêm từ tài khoản ngân hàng thực tế
    bankAccounts.forEach((acc) => {
      if (acc.bank_code) {
        const code = acc.bank_code.trim().toUpperCase();
        const label = BANK_LABELS[code] || acc.bank_name || code;
        map.set(code, label);
      }
    });

    // 2. Thêm từ danh mục khế ước / khoản vay
    loans.forEach((l) => {
      if (l.bank_code) {
        const code = l.bank_code.trim().toUpperCase();
        if (!map.has(code)) {
          map.set(code, BANK_LABELS[code] || l.bank_name || code);
        }
      }
    });

    // 3. Thêm từ các giao dịch chờ đối soát
    unreconciledList.forEach((tx) => {
      if (tx.bank_code) {
        const code = tx.bank_code.trim().toUpperCase();
        if (!map.has(code)) {
          map.set(code, BANK_LABELS[code] || code);
        }
      }
    });

    // 4. Thêm từ lịch sử đối soát
    historyList.forEach((h) => {
      if (h.bank_code) {
        const code = h.bank_code.trim().toUpperCase();
        if (!map.has(code)) {
          map.set(code, BANK_LABELS[code] || code);
        }
      }
    });

    // 5. Đảm bảo các ngân hàng chuẩn của dự án luôn có mặt
    ['CTG', 'MBB', 'TPB', 'VPB', 'MBV', 'SHB', 'BIDV', 'EVF', 'VCB'].forEach((code) => {
      if (!map.has(code)) {
        map.set(code, BANK_LABELS[code] || code);
      }
    });

    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [bankAccounts, loans, unreconciledList, historyList]);

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

  // Inline Reconcile States
  const [inlineReconcilingTxId, setInlineReconcilingTxId] = useState<number | null>(null);
  const [batchReconciling, setBatchReconciling] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Helper tìm khoản vay khớp với transaction
  const findMatchedLoan = (tx: UnreconciledDebtTransaction): CreditFacility | null => {
    if (tx.suggested_loan_id) {
      const found = loans.find((l) => l.loan_id === tx.suggested_loan_id);
      if (found) return found;
    }
    if (tx.suggested_contract_number) {
      const s = tx.suggested_contract_number.trim().toUpperCase();
      const found = loans.find((l) => l.contract_number.trim().toUpperCase() === s);
      if (found) return found;
    }
    return null;
  };

  // Tính toán phân bổ Gốc / Lãi an toàn không vượt trần dư nợ
  const calculateSafeSplit = (tx: UnreconciledDebtTransaction, loan: CreditFacility) => {
    const debit = Number(tx.debit_amount) || 0;
    const curBal = Number(loan.current_principal_balance) || 0;
    const isThuLai =
      (tx.description || '').toUpperCase().includes('THU LAI') ||
      (tx.category_name || '').toUpperCase().includes('LÃI');

    if (isThuLai) {
      return { principal: 0, interest: debit };
    }

    const txDateStr = (tx.transaction_date || '').slice(0, 10);
    const snapDateStr = (loan.snapshot_date || tx.suggested_snapshot_date || '').slice(0, 10);
    const isPreSnap = Boolean(
      (snapDateStr && txDateStr <= snapDateStr) || tx.timing_prediction === 'PRE_SNAPSHOT'
    );

    // Giao dịch trước ngày xuất file: cho phép nhận gốc đầy đủ để hoàn nguyên Dư nợ ban đầu
    if (isPreSnap) {
      if (tx.suggested_principal_amount !== undefined && tx.suggested_interest_amount !== undefined) {
        const sugP = Number(tx.suggested_principal_amount);
        const p = Math.min(sugP, debit);
        return { principal: p, interest: debit - p };
      }
      return { principal: debit, interest: 0 };
    }

    // Giao dịch sau ngày xuất file: kẹp trần theo dư nợ hiện tại
    if (curBal <= 0) {
      return { principal: 0, interest: debit };
    }
    if (tx.suggested_principal_amount !== undefined && tx.suggested_interest_amount !== undefined) {
      const sugP = Number(tx.suggested_principal_amount);
      const sugI = Number(tx.suggested_interest_amount);
      if (Math.abs(sugP + sugI - debit) < 0.01) {
        const p = Math.min(sugP, curBal);
        return { principal: p, interest: debit - p };
      }
      const p = Math.min(sugP, curBal);
      return { principal: p, interest: debit - p };
    }

    // Nếu giao dịch là tất toán và dư nợ gần bằng debit (chênh lệch hoàn lãi âm)
    const isTatToan = (tx.description || '').toUpperCase().includes('TAT TOAN');
    if (isTatToan && curBal > 0 && Math.abs(curBal - debit) < 10000000) {
      return { principal: curBal, interest: debit - curBal };
    }

    const p = Math.min(debit, curBal);
    return { principal: p, interest: debit - p };
  };

  // Danh sách các giao dịch đã nhận diện được khế ước
  const matchedTransactions = useMemo(() => {
    return unreconciledList.filter((tx) => findMatchedLoan(tx) !== null);
  }, [unreconciledList, loans]);

  // Đối soát 1-chạm trực tiếp trên bảng không cần mở cửa sổ phụ
  const handleDirectReconcile = async (tx: UnreconciledDebtTransaction) => {
    const targetLoan = findMatchedLoan(tx);
    if (!targetLoan) {
      handleToggleInlineEditor(tx);
      return;
    }

    const { principal, interest } = calculateSafeSplit(tx, targetLoan);
    const txDateStr = (tx.transaction_date || '').slice(0, 10);
    const snapDateStr = (targetLoan.snapshot_date || tx.suggested_snapshot_date || '').slice(0, 10);
    const isPreSnap = Boolean((snapDateStr && txDateStr <= snapDateStr) || tx.timing_prediction === 'PRE_SNAPSHOT');

    setInlineReconcilingTxId(tx.transaction_id);
    setModalError('');
    try {
      const res = await api.post('/loans/repayment-reconciliations/reconcile', {
        transaction_id: tx.transaction_id,
        loan_id: targetLoan.loan_id,
        principal_amount: principal,
        interest_amount: interest,
        repayment_timing: isPreSnap ? 'PRE_SNAPSHOT' : 'POST_SNAPSHOT',
        notes: 'Đối soát trực tiếp trên bảng',
      });

      setSuccessToast(
        res.data?.message ||
        `Đã đối soát thành công ${targetLoan.contract_number}: Gốc ${principal.toLocaleString('vi-VN')} đ, Lãi ${interest.toLocaleString('vi-VN')} đ!`
      );
      if (selectedTx?.transaction_id === tx.transaction_id) {
        setSelectedTx(null);
      }
      setUnreconciledList((prev) => prev.filter((item) => item.transaction_id !== tx.transaction_id));
      fetchData();
      setTimeout(() => setSuccessToast(''), 5000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi đối soát giao dịch.';
      handleToggleInlineEditor(tx);
      setModalError(msg);
    } finally {
      setInlineReconcilingTxId(null);
    }
  };

  // Đối soát tự động tất cả các dòng đã khớp khế ước
  const handleBatchReconcileAllMatched = async () => {
    if (matchedTransactions.length === 0) return;
    if (
      !window.confirm(
        `Xác nhận đối soát tự động trực tiếp trên bảng cho toàn bộ ${matchedTransactions.length} giao dịch đã khớp khế ước?`
      )
    ) {
      return;
    }

    setBatchReconciling(true);
    setBatchProgress({ current: 0, total: matchedTransactions.length });
    let successCount = 0;

    for (let i = 0; i < matchedTransactions.length; i++) {
      const tx = matchedTransactions[i];
      const targetLoan = findMatchedLoan(tx);
      if (!targetLoan) continue;
      const { principal, interest } = calculateSafeSplit(tx, targetLoan);
      const txDateStr = (tx.transaction_date || '').slice(0, 10);
      const snapDateStr = (targetLoan.snapshot_date || tx.suggested_snapshot_date || '').slice(0, 10);
      const isPreSnap = Boolean((snapDateStr && txDateStr <= snapDateStr) || tx.timing_prediction === 'PRE_SNAPSHOT');

      try {
        await api.post('/loans/repayment-reconciliations/reconcile', {
          transaction_id: tx.transaction_id,
          loan_id: targetLoan.loan_id,
          principal_amount: principal,
          interest_amount: interest,
          repayment_timing: isPreSnap ? 'PRE_SNAPSHOT' : 'POST_SNAPSHOT',
          notes: 'Đối soát tự động hàng loạt trên bảng',
        });
        successCount++;
      } catch (err) {
        console.error('Lỗi khi đối soát batch:', err);
      }
      setBatchProgress({ current: i + 1, total: matchedTransactions.length });
    }

    setBatchReconciling(false);
    setSuccessToast(`Đã đối soát tự động thành công ${successCount}/${matchedTransactions.length} giao dịch!`);
    fetchData();
    setTimeout(() => setSuccessToast(''), 6000);
  };

  // State cho phép người dùng tùy chọn/đảo cờ Pre-Snapshot bằng tay nếu cần
  const [manualPreSnapshot, setManualPreSnapshot] = useState<boolean | null>(null);

  // Bật/tắt thanh chỉnh sửa inline ngay trên bảng
  const handleToggleInlineEditor = (tx: UnreconciledDebtTransaction) => {
    if (selectedTx?.transaction_id === tx.transaction_id) {
      setSelectedTx(null);
      return;
    }
    setSelectedTx(tx);
    setManualPreSnapshot(null);
    setModalError('');
    setNotes('');
    setModalLoanSearch('');

    const targetLoan = findMatchedLoan(tx);
    setSelectedLoanId(targetLoan ? targetLoan.loan_id : '');

    const debit = Number(tx.debit_amount) || 0;
    if (targetLoan) {
      const { principal, interest } = calculateSafeSplit(tx, targetLoan);
      setPrincipalAmount(principal);
      setInterestAmount(interest);
    } else {
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

  // Quick button: Tất toán nợ gốc hiện tại (kể cả hoàn lãi âm)
  const handleSetPayoffPrincipal = () => {
    if (!selectedTx || !currentLoan) return;
    const total = Number(selectedTx.debit_amount) || 0;
    const curBal = Number(currentLoan.current_principal_balance) || 0;
    setPrincipalAmount(curBal);
    setInterestAmount(total - curBal);
    setModalError('');
  };

  // Input changes with auto-balance
  const handlePrincipalChange = (valStr: string) => {
    if (!selectedTx) return;
    const val = Number(valStr) || 0;
    const total = Number(selectedTx.debit_amount) || 0;
    setPrincipalAmount(val);
    setInterestAmount(total - val); // Cho phép lãi âm khi gốc > total (ví dụ tất toán hoàn lãi)
    setModalError('');
  };

  const handleInterestChange = (valStr: string) => {
    if (!selectedTx) return;
    const val = Number(valStr) || 0;
    const total = Number(selectedTx.debit_amount) || 0;
    setInterestAmount(val);
    setPrincipalAmount(Math.max(0, total - val)); // Gốc không được âm
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

  const isPreSnapshot = useMemo(() => {
    if (manualPreSnapshot !== null) return manualPreSnapshot;
    if (!selectedTx) return false;
    const snapDate = currentLoan?.snapshot_date || selectedTx.suggested_snapshot_date;
    if (snapDate) {
      const txDateStr = (selectedTx.transaction_date || '').slice(0, 10);
      const snapDateStr = snapDate.slice(0, 10);
      return txDateStr <= snapDateStr;
    }
    return selectedTx.timing_prediction === 'PRE_SNAPSHOT';
  }, [manualPreSnapshot, selectedTx, currentLoan]);

  const isOverpayment = useMemo(() => {
    if (!currentLoan) return false;
    // Không chặn overpayment với giao dịch trả nợ trước ngày xuất file
    if (isPreSnapshot) return false;
    const curBal = Number(currentLoan.current_principal_balance) || 0;
    return principalAmount > curBal;
  }, [currentLoan, principalAmount, isPreSnapshot]);

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
      setModalError('Số tiền trả gốc không được vượt quá dư nợ gốc hiện tại của khoản vay (đối với giao dịch sau ngày xuất file).');
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
        repayment_timing: isPreSnapshot ? 'PRE_SNAPSHOT' : 'POST_SNAPSHOT',
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
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'unreconciled'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>Chờ đối soát</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${activeTab === 'unreconciled'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-700'
                  }`}
              >
                {unreconciledList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'history'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>Nhật ký lịch sử trả nợ</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${activeTab === 'history'
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
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Tất cả ngân hàng</option>
              {bankOptions.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
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
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-slate-800">
                Giao Dịch Chi Trả Nợ Chờ Đối Soát
              </span>
              <span className="text-xs text-slate-400">
                ({unreconciledList.length} giao dịch chi)
              </span>
            </div>

            {matchedTransactions.length > 0 && (
              <button
                type="button"
                onClick={handleBatchReconcileAllMatched}
                disabled={batchReconciling}
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                title="Tự động đối soát tất cả các giao dịch đã nhận diện được khế ước trực tiếp trên bảng"
              >
                {batchReconciling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang đối soát hàng loạt ({batchProgress.current}/{batchProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Đối soát tự động tất cả ({matchedTransactions.length} GD đã khớp)</span>
                  </>
                )}
              </button>
            )}
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
                    <SortableTh field="transaction_date" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} className="py-3 px-4">
                      Thời Gian Giao Dịch
                    </SortableTh>
                    <SortableTh field="account" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} className="py-3 px-4">
                      Tài Khoản / Ngân Hàng
                    </SortableTh>
                    <SortableTh field="debit_amount" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} align="right" className="py-3 px-4">
                      Số Tiền Chi Ra
                    </SortableTh>
                    <SortableTh field="suggested_principal_amount" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} align="right" className="py-3 px-4">
                      Trả Gốc
                    </SortableTh>
                    <SortableTh field="suggested_interest_amount" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} align="right" className="py-3 px-4">
                      Trả Lãi
                    </SortableTh>
                    <SortableTh field="description" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} className="py-3 px-4">
                      Nội Dung Sao Kê Ngân Hàng
                    </SortableTh>
                    <SortableTh field="suggested_contract_number" currentSortField={unrecSortField} currentSortDirection={unrecSortDirection} onSort={handleUnrecSort} className="py-3 px-4">
                      Gợi Ý Khế Ước Tự Động
                    </SortableTh>
                    <th className="py-3 px-4 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {sortedUnreconciledList.map((tx) => {
                    const matchedLoan = findMatchedLoan(tx);
                    const isInlineOpen = selectedTx?.transaction_id === tx.transaction_id;
                    const isReconcilingThis = inlineReconcilingTxId === tx.transaction_id;

                    return (
                      <React.Fragment key={tx.transaction_id}>
                        <tr className={`hover:bg-slate-50/80 transition-colors ${isInlineOpen ? 'bg-indigo-50/50' : ''}`}>
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

                          {/* Gợi ý Trả gốc từ nội dung giao dịch */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {tx.suggested_principal_amount !== undefined && tx.suggested_principal_amount !== null ? (
                              <div className={`font-mono text-xs ${Number(tx.suggested_principal_amount) > 0 ? 'font-bold text-slate-900' : 'text-slate-400 font-medium'}`}>
                                {Number(tx.suggested_principal_amount).toLocaleString('vi-VN')} đ
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Gợi ý Trả lãi từ nội dung giao dịch */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {tx.suggested_interest_amount !== undefined && tx.suggested_interest_amount !== null ? (
                              Number(tx.suggested_interest_amount) < 0 ? (
                                <div
                                  className="font-mono font-bold text-xs text-emerald-600"
                                  title="Ngân hàng hoàn lãi / giảm trừ lãi khi tất toán"
                                >
                                  {Number(tx.suggested_interest_amount).toLocaleString('vi-VN')} đ
                                </div>
                              ) : Number(tx.suggested_interest_amount) > 0 ? (
                                <div className="font-mono font-bold text-xs text-indigo-600">
                                  {Number(tx.suggested_interest_amount).toLocaleString('vi-VN')} đ
                                </div>
                              ) : (
                                <div className="font-mono text-xs text-slate-400 font-medium">0 đ</div>
                              )
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
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

                          {/* Gợi ý Khế ước tự động - Chỉ gợi ý những khế ước có trong danh mục đã nạp, không có thì để trống */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {tx.suggested_contract_number && (tx.suggested_loan_id || findMatchedLoan(tx)) ? (
                              <div className="space-y-1">
                                <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  <Landmark className="w-3.5 h-3.5" />
                                  <span>{tx.suggested_contract_number}</span>
                                </div>
                                {tx.timing_prediction === 'PRE_SNAPSHOT' && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 ml-1.5" title="Giao dịch xảy ra trước ngày xuất file sao kê tín dụng (Hoàn nguyên gốc)">
                                    Trước ngày xuất file
                                  </span>
                                )}
                                {tx.timing_prediction === 'POST_SNAPSHOT' && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 ml-1.5" title="Giao dịch xảy ra sau ngày xuất file sao kê tín dụng (Giảm trừ hiện tại)">
                                    Sau ngày xuất file
                                  </span>
                                )}
                                {tx.suggested_principal_balance !== undefined && tx.suggested_principal_balance !== null && (
                                  <div className="text-[11px] text-slate-500">
                                    Dư nợ: <span className="font-semibold text-slate-700">{Number(tx.suggested_principal_balance).toLocaleString('vi-VN')} đ</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Nút thao tác: Đối soát trực tiếp không mở cửa sổ phụ */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handleDirectReconcile(tx)}
                                disabled={isReconcilingThis || batchReconciling}
                                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs shadow-sm hover:shadow transition-all ${matchedLoan
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                  } disabled:opacity-50`}
                                title={
                                  matchedLoan
                                    ? 'Đối soát ngay lập tức trên bảng với khế ước đã khớp (Không mở cửa sổ phụ)'
                                    : 'Bấm để chọn khế ước và đối soát trực tiếp trên bảng'
                                }
                              >
                                {isReconcilingThis ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang xử lý...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCheck className="w-3.5 h-3.5" />
                                    <span>Đối soát ngay</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleInlineEditor(tx)}
                                className={`p-1.5 rounded-lg border transition-colors ${isInlineOpen
                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                    : 'hover:bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                title="Tùy chỉnh phân bổ Gốc / Lãi hoặc đổi khế ước trực tiếp trên bảng"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ================= KHUNG CHỈNH SỬA TRỰC TIẾP TRÊN BẢNG (INLINE) ================= */}
                        {isInlineOpen && (
                          <tr className="bg-slate-50/95 border-y-2 border-indigo-300 animate-in fade-in duration-200">
                            <td colSpan={8} className="p-4 sm:p-5">
                              <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm space-y-4">
                                {/* Header inline */}
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                  <div className="flex items-center space-x-2">
                                    <Sliders className="w-4 h-4 text-indigo-600" />
                                    <span className="font-bold text-slate-800 text-sm">
                                      Tùy chỉnh phân bổ Gốc / Lãi trực tiếp trên bảng
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">
                                      (Tổng tiền GD: {Number(tx.debit_amount).toLocaleString('vi-VN')} đ)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTx(null)}
                                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Báo lỗi nếu có */}
                                {modalError && (
                                  <div className="flex items-start space-x-2 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
                                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                    <span>{modalError}</span>
                                  </div>
                                )}

                                {/* Chọn khế ước */}
                                <div className="space-y-1.5">
                                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                                    <span>Chọn Khế Ước / Khoản Vay Đối Ứng</span>
                                    {currentLoan && (
                                      <span className="text-[11px] font-normal text-indigo-600">
                                        Dư nợ gốc hiện tại: <strong>{Number(currentLoan.current_principal_balance).toLocaleString('vi-VN')} đ</strong>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                                      <input
                                        type="text"
                                        value={modalLoanSearch}
                                        onChange={(e) => setModalLoanSearch(e.target.value)}
                                        placeholder="Tìm nhanh khế ước theo số HĐ, ngân hàng..."
                                        className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                      />
                                    </div>
                                    <select
                                      value={selectedLoanId}
                                      onChange={(e) => setSelectedLoanId(e.target.value ? Number(e.target.value) : '')}
                                      className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[320px]"
                                    >
                                      <option value="">-- Chọn một khế ước trong danh mục --</option>
                                      {currentLoan && !filteredModalLoans.some((l) => l.loan_id === currentLoan.loan_id) && (
                                        <option key={currentLoan.loan_id} value={currentLoan.loan_id}>
                                          [{currentLoan.bank_code}] {currentLoan.contract_number} (Dư nợ: {Number(currentLoan.current_principal_balance).toLocaleString('vi-VN')} đ)
                                        </option>
                                      )}
                                      {filteredModalLoans.map((l) => (
                                        <option key={l.loan_id} value={l.loan_id}>
                                          [{l.bank_code}] {l.contract_number} • Dư nợ: {Number(l.current_principal_balance).toLocaleString('vi-VN')} đ ({l.status})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Khung chia Gốc & Lãi */}
                                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700">Phân Bổ Gốc / Lãi</span>
                                    <div className="flex items-center space-x-2">
                                      {currentLoan && Number(currentLoan.current_principal_balance) > 0 && (
                                        <button
                                          type="button"
                                          onClick={handleSetPayoffPrincipal}
                                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                                          title="Điền đúng số dư gốc hiện tại để tất toán khoản vay (phần chênh lệch chuyển vào lãi)"
                                        >
                                          Tất toán gốc ({Number(currentLoan.current_principal_balance).toLocaleString('vi-VN')} đ)
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={handleSet100PercentPrincipal}
                                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                                      >
                                        100% Trả Gốc
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleSet100PercentInterest}
                                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors"
                                      >
                                        100% Trả Lãi
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                                        Tiền Trả Gốc (VNĐ)
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={principalAmount}
                                        onChange={(e) => handlePrincipalChange(e.target.value)}
                                        className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {principalAmount.toLocaleString('vi-VN')} đ
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                                        <span>Tiền Trả Lãi (VNĐ)</span>
                                        {interestAmount < 0 && (
                                          <span className="text-[10px] font-bold text-emerald-600">
                                            Hoàn / Giảm trừ lãi
                                          </span>
                                        )}
                                      </label>
                                      <input
                                        type="number"
                                        value={interestAmount}
                                        onChange={(e) => handleInterestChange(e.target.value)}
                                        className={`w-full text-xs font-mono font-bold bg-white border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 ${interestAmount < 0
                                            ? 'text-emerald-700 border-emerald-300 focus:ring-emerald-500'
                                            : 'text-amber-700 border-slate-300 focus:ring-amber-500'
                                          }`}
                                      />
                                      <div className="text-[10px] font-mono mt-0.5">
                                        {interestAmount < 0 ? (
                                          <span className="text-emerald-600 font-semibold">
                                            {interestAmount.toLocaleString('vi-VN')} đ (Hoàn lãi / thoái thu)
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">{interestAmount.toLocaleString('vi-VN')} đ</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Thông báo phân loại thời điểm Pre/Post Snapshot */}
                                  {isPreSnapshot ? (
                                    <div className="text-xs text-blue-800 bg-blue-50/90 p-2.5 rounded-lg border border-blue-200 flex items-start space-x-2">
                                      <span className="text-base leading-none">ℹ️</span>
                                      <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                          <p className="font-bold">
                                            Giao dịch trả nợ trước ngày xuất file{' '}
                                            {(currentLoan?.snapshot_date || selectedTx?.suggested_snapshot_date) &&
                                              `(${new Date(currentLoan?.snapshot_date || selectedTx?.suggested_snapshot_date || '').toLocaleDateString('vi-VN')})`}
                                          </p>
                                          <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] font-semibold text-blue-900 select-none">
                                            <input
                                              type="checkbox"
                                              checked={isPreSnapshot}
                                              onChange={(e) => setManualPreSnapshot(e.target.checked)}
                                              className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                            />
                                            <span>Trước ngày xuất file</span>
                                          </label>
                                        </div>
                                        <p className="text-[11px] text-blue-700 mt-0.5">
                                          Khoản nợ gốc này ngân hàng đã trừ trước thời điểm chốt sao kê. Hệ thống sẽ <strong>hoàn nguyên vào Dư nợ ban đầu</strong> và <strong>không trừ tiếp</strong> vào Dư nợ hiện tại trên file.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-amber-800 bg-amber-50/90 p-2 rounded-lg border border-amber-200 flex items-center justify-between">
                                      <span className="text-[11px]">
                                        ⏱️ Giao dịch sau ngày xuất file{' '}
                                        {(currentLoan?.snapshot_date || selectedTx?.suggested_snapshot_date) &&
                                          `(${new Date(currentLoan?.snapshot_date || selectedTx?.suggested_snapshot_date || '').toLocaleDateString('vi-VN')})`}
                                        . Khoản trả gốc sẽ giảm trừ trực tiếp vào Dư nợ hiện tại.
                                      </span>
                                      <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] font-semibold text-amber-900 select-none ml-2 shrink-0">
                                        <input
                                          type="checkbox"
                                          checked={isPreSnapshot}
                                          onChange={(e) => setManualPreSnapshot(e.target.checked)}
                                          className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                                        />
                                        <span>Đánh dấu Pre-Snapshot</span>
                                      </label>
                                    </div>
                                  )}

                                  {/* Cảnh báo nếu vượt dư nợ */}
                                  {isOverpayment && (
                                    <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200">
                                      ⚠️ Số tiền trả gốc ({principalAmount.toLocaleString('vi-VN')} đ) vượt quá dư nợ gốc hiện tại ({Number(currentLoan?.current_principal_balance).toLocaleString('vi-VN')} đ).
                                    </div>
                                  )}

                                  {/* Ghi chú */}
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                                      Ghi chú nội bộ
                                    </label>
                                    <input
                                      type="text"
                                      value={notes}
                                      onChange={(e) => setNotes(e.target.value)}
                                      placeholder="Ghi chú đối soát..."
                                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>

                                {/* Nút xác nhận inline */}
                                <div className="flex items-center justify-end space-x-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTx(null)}
                                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                                  >
                                    Đóng
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleConfirmReconcile}
                                    disabled={submitting || !selectedLoanId || !isSplitValid || isOverpayment}
                                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-all"
                                  >
                                    {submitting ? (
                                      <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Đang xử lý...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Xác nhận đối soát</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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
                    <SortableTh field="repayment_date" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} className="py-3 px-4">
                      Thời Điểm Trả Nợ (Sao kê)
                    </SortableTh>
                    <SortableTh field="contract" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} className="py-3 px-4">
                      Khế Ước / Ngân Hàng
                    </SortableTh>
                    <SortableTh field="principal_repaid" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} align="right" className="py-3 px-4">
                      Số Tiền Trả Gốc
                    </SortableTh>
                    <SortableTh field="interest_repaid" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} align="right" className="py-3 px-4">
                      Số Tiền Trả Lãi
                    </SortableTh>
                    <SortableTh field="remaining_principal_balance" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} align="right" className="py-3 px-4">
                      Dư Nợ Còn Lại
                    </SortableTh>
                    <SortableTh field="notes" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} className="py-3 px-4">
                      Nội Dung Diễn Giải
                    </SortableTh>
                    <SortableTh field="created_by" currentSortField={histSortField} currentSortDirection={histSortDirection} onSort={handleHistSort} className="py-3 px-4">
                      Người Thực Hiện
                    </SortableTh>
                    <th className="py-3 px-4 text-center">Hoàn Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {sortedHistoryList.map((hist) => (
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
                        {hist.repayment_timing === 'PRE_SNAPSHOT' && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 ml-1 mt-0.5">
                            Trước ngày xuất file
                          </span>
                        )}
                        {hist.repayment_timing === 'POST_SNAPSHOT' && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 ml-1 mt-0.5">
                            Sau ngày xuất file
                          </span>
                        )}
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

export default LoanRepaymentReconcilePage;
