import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Search,
  Copy,
  Check,
  Filter,
  RotateCcw,
  Edit2,
  Receipt,
  Plus,
  Trash2,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  User,
  Calendar,
  DollarSign,
  Percent,
  FolderOpen,
  Download,
  UploadCloud,
  FileCheck2, Sparkles,
} from 'lucide-react';
import api from '../services/api';
import { SortableTh } from '../components/common/SortableTh';
import { ColumnConfig } from '../types/grid';
import { useTableGrid } from '../hooks/useTableGrid';
import { TableGridToolbar } from '../components/common/TableGridToolbar';
import { SortDirection, sortList } from '../utils/sort';

const useSort = (defaultField = '', defaultDir: SortDirection = 'asc') => {
  const [field, setField] = useState(defaultField);
  const [dir, setDir] = useState<SortDirection>(defaultDir);
  const onSort = (f: string) => {
    if (f === field) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setField(f);
      setDir('asc');
    }
  };
  return { field, dir, onSort };
};

interface ContractRow {
  loan_id: number;
  bank_code: string;
  bank_name: string;
  contract_number: string;
  borrower_name?: string;
  cif_number?: string | null;
  loan_purpose?: string | null;
  term?: string | null;
  debt_group?: string;
  loan_type?: string;
  institution_type?: string;
  original_principal_balance: string;
  total_principal_paid: string;
  current_principal_balance: string;
  interest_rate: string;
  estimated_interest: string;
  total_interest_paid: string;
  disbursement_date: string | null;
  maturity_date: string | null;
  repayment_count: number;
  status?: string;
  note?: string | null;
  allocated_invoices_amount?: string;
  allocated_invoices_count?: number;
  invoice_reconciliation_status?: 'FULLY_SECURED' | 'UNDER_SECURED' | 'OVER_SECURED' | 'NO_INVOICE' | string;
  dossier_count?: number;
}

interface ColumnFilters {
  bank: string;
  contract_number: string;
  borrower_name: string;
  original_principal_balance: string;
  total_principal_paid: string;
  current_principal_balance: string;
  interest_rate: string;
  estimated_interest: string;
  total_interest_paid: string;
  disbursement_date: string;
  maturity_date: string;
  invoice_status: string[]; // Multiple selection: ('ENOUGH' | 'UNDER' | 'OVER')[]
}

const initialFilters: ColumnFilters = {
  bank: '',
  contract_number: '',
  borrower_name: '',
  original_principal_balance: '',
  total_principal_paid: '',
  current_principal_balance: 'ALL',
  interest_rate: '',
  estimated_interest: '',
  total_interest_paid: '',
  disbursement_date: '',
  maturity_date: '',
  invoice_status: [],
};

interface CashflowRow {
  repayment_id: number;
  repayment_date: string;
  description: string | null;
  opening_principal: string;
  total_amount: string;
  principal_amount: string;
  interest_amount: string;
  remaining_principal: string;
  is_overdue: boolean;
  is_over_repaid?: boolean;
}

interface AllocatedInvoiceItem {
  allocation_id: number;
  loan_id: number;
  invoice_id: number;
  bank_code: string;
  contract_number: string;
  allocated_amount: number | string;
  allocation_date: string;
  notes?: string | null;
  invoice_number?: string;
  invoice_series?: string;
  seller_name?: string;
  total_invoice_amount?: number | string;
  remaining_amount?: number | string;
  created_at?: string;
}

interface LoanAllocatedInvoicesData {
  loan_id: number;
  contract_number: string;
  bank_code: string;
  original_principal_balance: number | string;
  total_allocated_amount: number | string;
  difference_amount: number | string;
  is_fully_secured: boolean;
  status_message: string;
  allocations: AllocatedInvoiceItem[];
}

interface AvailableInvoice {
  invoice_id: number;
  invoice_number: string;
  invoice_series: string;
  invoice_date: string;
  seller_name: string;
  seller_tax_code: string;
  total_amount: number | string;
  allocated_amount: number | string;
  remaining_amount: number | string;
  locked_bank_code?: string | null;
  status: string;
}

const fmtMoney = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
const fmtDateTime = (v: string) => new Date(v).toLocaleString('vi-VN');

// ==========================================
// COMPONENT 1: BẢNG DÒNG TIỀN TRẢ NỢ
// ==========================================
const CashflowTable: React.FC<{ loanId: number }> = ({ loanId }) => {
  const [rows, setRows] = useState<CashflowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sort = useSort('repayment_date', 'asc');
  const sortedRows = useMemo(() => sortList(rows ?? [], sort.field, sort.dir), [rows, sort.field, sort.dir]);
  const th = (field: string, label: string, align: 'left' | 'right' = 'right') => (
    <SortableTh field={field} currentSortField={sort.field} currentSortDirection={sort.dir} onSort={sort.onSort} align={align} className="!py-2">
      {label}
    </SortableTh>
  );

  const totalAmountSum = useMemo(() => {
    return (rows ?? []).reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  }, [rows]);

  const totalPrincipalSum = useMemo(() => {
    return (rows ?? []).reduce((sum, r) => sum + (Number(r.principal_amount) || 0), 0);
  }, [rows]);

  const totalInterestSum = useMemo(() => {
    return (rows ?? []).reduce((sum, r) => sum + (Number(r.interest_amount) || 0), 0);
  }, [rows]);

  const latestRemainingPrincipal = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return rows[rows.length - 1].remaining_principal;
  }, [rows]);

  useEffect(() => {
    api
      .get(`/loans/${loanId}/cashflow`)
      .then((res) => setRows(res.data?.data ?? []))
      .catch(() => setError('Không tải được bảng dòng tiền.'));
  }, [loanId]);

  if (error) return <div className="p-4 text-xs text-rose-600">{error}</div>;
  if (!rows)
    return (
      <div className="p-4 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải dòng tiền...
      </div>
    );
  if (rows.length === 0)
    return <div className="p-4 text-xs text-slate-500 italic">Chưa có giao dịch trả gốc/lãi nào được đối soát.</div>;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span className="inline-block w-3 h-3 rounded bg-pink-100 border border-pink-300" /> Trả gốc quá hạn (sau ngày đáo hạn)
      </div>
      <table className="w-full text-xs border border-slate-200 bg-white rounded">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            {th('repayment_date', 'Thời điểm giao dịch', 'left')}
            {th('description', 'Nội dung giao dịch', 'left')}
            {th('opening_principal', 'Nợ gốc đầu kỳ')}
            {th('total_amount', 'Tổng giá trị giao dịch')}
            {th('principal_amount', 'Số tiền trả gốc')}
            {th('interest_amount', 'Số tiền trả lãi')}
            {th('remaining_principal', 'Gốc còn lại')}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr key={r.repayment_id} className={`border-t border-slate-100 ${r.is_overdue ? 'bg-pink-100' : ''}`}>
              <td className="px-3 py-2">
                {fmtDateTime(r.repayment_date)}
                {r.is_overdue && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                    <AlertTriangle className="w-3 h-3" /> Quá hạn
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600 max-w-md break-words" title={r.description ?? ''}>
                {r.description || '—'}
              </td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.opening_principal)}</td>
              <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.total_amount)}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.principal_amount)}</td>
              <td
                className={`px-3 py-2 text-right ${Number(r.interest_amount) < 0 ? 'text-emerald-600 font-semibold' : ''}`}
                title={Number(r.interest_amount) < 0 ? 'Hoàn lãi / giảm trừ lãi khi tất toán' : undefined}
              >
                {fmtMoney(r.interest_amount)}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${r.is_over_repaid ? 'text-rose-600' : ''}`}
                title={r.is_over_repaid ? 'Tổng gốc đã trả vượt dư nợ gốc khế ước — kiểm tra lại dữ liệu đối soát/giải ngân' : undefined}
              >
                {fmtMoney(r.remaining_principal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50/95 border-t-2 border-slate-300 font-bold text-slate-900">
          <tr>
            <td colSpan={2} className="px-3 py-3 text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-extrabold text-slate-800">Tổng cộng:</span>
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">
                  {rows.length} giao dịch
                </span>
              </div>
            </td>
            <td className="px-3 py-3 text-right text-slate-400 font-mono font-normal">—</td>
            <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-900">
              {fmtMoney(totalAmountSum)}
            </td>
            <td className="px-3 py-3 text-right font-mono text-xs font-bold text-indigo-700">
              {fmtMoney(totalPrincipalSum)}
            </td>
            <td className="px-3 py-3 text-right font-mono text-xs font-bold text-amber-700">
              {fmtMoney(totalInterestSum)}
            </td>
            <td
              className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-800"
              title="Dư nợ gốc còn lại cuối kỳ"
            >
              {fmtMoney(latestRemainingPrincipal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ==========================================
// COMPONENT 2: MODAL GÁN HÓA ĐƠN BẢO ĐẢM
// ==========================================
interface AllocateInvoiceModalProps {
  loan: ContractRow;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  remainingNeeded: number;
}

const AllocateInvoiceModal: React.FC<AllocateInvoiceModalProps> = ({
  loan,
  isOpen,
  onClose,
  onSuccess,
  remainingNeeded,
}) => {
  const [invoices, setInvoices] = useState<AvailableInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [allocatedAmount, setAllocatedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSelectedInvoiceId(null);
    setAllocatedAmount('');
    setNotes('');

    api
      .get('/invoices', {
        params: {
          locked_bank_code: loan.bank_code,
          limit: 100,
        },
      })
      .then((res) => {
        const items: AvailableInvoice[] = res.data?.items ?? [];
        setInvoices(items);
      })
      .catch(() => setError('Không tải được danh sách hóa đơn khả dụng.'))
      .finally(() => setLoading(false));
  }, [isOpen, loan.bank_code]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Chỉ chọn hóa đơn chưa phân bổ hết
      const rem = Number(inv.remaining_amount || 0);
      if (rem <= 0) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.invoice_series?.toLowerCase().includes(q) ||
        inv.seller_name?.toLowerCase().includes(q) ||
        inv.seller_tax_code?.toLowerCase().includes(q)
      );
    });
  }, [invoices, search]);

  const handleSelectInvoice = (inv: AvailableInvoice) => {
    setSelectedInvoiceId(inv.invoice_id);
    const invRemaining = Number(inv.remaining_amount || 0);
    // Gợi ý số tiền: nhỏ hơn giữa số còn thiếu của khế ước và số còn lại của HĐ
    const suggest = Math.min(invRemaining, remainingNeeded > 0 ? remainingNeeded : invRemaining);
    setAllocatedAmount(String(Math.floor(suggest)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) {
      setError('Vui lòng chọn một hóa đơn từ danh sách.');
      return;
    }
    const amt = Number(allocatedAmount.replace(/[\.,\s]/g, ''));
    if (!amt || amt <= 0) {
      setError('Vui lòng nhập số tiền nhận nợ hợp lệ lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/loans/${loan.loan_id}/allocate-invoices`, {
        allocations: [
          {
            invoice_id: selectedInvoiceId,
            allocated_amount: amt,
            notes: notes.trim() || undefined,
          },
        ],
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Lỗi khi gán hóa đơn bảo đảm nhận nợ.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Receipt className="w-5 h-5 text-indigo-300" />
            <div>
              <h3 className="text-base font-bold">Gán Hóa Đơn Bảo Đảm Nhận Nợ</h3>
              <p className="text-xs text-indigo-200">
                Khế ước: <span className="font-mono font-semibold">{loan.contract_number}</span> ({loan.bank_name || loan.bank_code})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Hộp gợi ý số tiền còn thiếu */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900">
            <div>
              <span className="font-medium">Số tiền nhận nợ gốc cần bảo đảm:</span>{' '}
              <strong className="text-sm font-bold text-indigo-700">{fmtMoney(loan.original_principal_balance)} đ</strong>
            </div>
            <div>
              <span className="font-medium">Còn thiếu:</span>{' '}
              <strong className="text-sm font-bold text-amber-700">{fmtMoney(remainingNeeded)} đ</strong>
            </div>
          </div>

          {/* Tìm kiếm hóa đơn */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chọn Hóa Đơn Khả Dụng (cùng TCTD {loan.bank_name || loan.bank_code})
            </label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo số HĐ, ký hiệu, đơn vị bán, MST..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải danh sách hóa đơn...
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 italic">
                  Không tìm thấy hóa đơn khả dụng nào còn hạn mức cho ngân hàng này.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-center w-8">Chọn</th>
                      <th className="px-2 py-1.5 text-left">Số HĐ / Ký hiệu</th>
                      <th className="px-2 py-1.5 text-left">Nhà cung cấp</th>
                      <th className="px-2 py-1.5 text-right">Tổng tiền HĐ</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-indigo-700">Hạn mức còn lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => {
                      const isSelected = selectedInvoiceId === inv.invoice_id;
                      return (
                        <tr
                          key={inv.invoice_id}
                          onClick={() => handleSelectInvoice(inv)}
                          className={`border-t border-slate-200 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-100 text-indigo-900 font-medium' : 'hover:bg-slate-100'
                          }`}
                        >
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="radio"
                              name="selected_invoice"
                              checked={isSelected}
                              onChange={() => handleSelectInvoice(inv)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {inv.invoice_number} <span className="text-[10px] text-slate-500">({inv.invoice_series})</span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 max-w-xs truncate" title={inv.seller_name}>
                            {inv.seller_name}
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmtMoney(inv.total_amount)}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-emerald-700 font-mono">
                            {fmtMoney(inv.remaining_amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Nhập số tiền phân bổ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Tiền Phân Bổ Bảo Đảm (VNĐ) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={allocatedAmount}
                onChange={(e) => setAllocatedAmount(e.target.value)}
                placeholder="Nhập số tiền..."
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {allocatedAmount ? `= ${fmtMoney(allocatedAmount)} đ` : 'Nhập số tiền cần đối soát bảo đảm'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú đối soát</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="vd: Hóa đơn xi măng tháng 10 đợt 1"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedInvoiceId}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang gán đối soát...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Xác nhận gán HĐ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENT 3: PANEL ĐỐI SOÁT HÓA ĐƠN VỚI NHẬN NỢ
// ==========================================
interface InvoiceReconciliationPanelProps {
  contract: ContractRow;
  onRefreshContract: () => void;
}

const InvoiceReconciliationPanel: React.FC<InvoiceReconciliationPanelProps> = ({ contract, onRefreshContract }) => {
  const [data, setData] = useState<LoanAllocatedInvoicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAmounts, setEditingAmounts] = useState<Record<number, string>>({});

  const handleAutoSync = async (force: boolean = false) => {
    setSyncing(true);
    try {
      const res = await api.post(`/loans/${contract.loan_id}/auto-sync-dossier-invoices`, null, {
        params: { force_recalculate: force },
      });
      setData(res.data);
      setEditingAmounts({});
      onRefreshContract();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi đồng bộ cuốn chiếu hóa đơn từ hồ sơ.');
    } finally {
      setSyncing(false);
    }
  };

  const fetchAllocations = () => {
    setLoading(true);
    setError(null);
    api
      .get(`/loans/${contract.loan_id}/allocated-invoices`)
      .then((res) => {
        setData(res.data);
        setEditingAmounts({});
      })
      .catch((err) => setError(err?.response?.data?.detail || 'Không tải được danh sách đối soát hóa đơn.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAllocations();
  }, [contract.loan_id]);

  const handleDeleteAllocation = async (allocationId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy gán hóa đơn này khỏi khế ước? Hạn mức của hóa đơn sẽ được hoàn trả.')) {
      return;
    }
    setDeletingId(allocationId);
    try {
      await api.delete(`/loans/${contract.loan_id}/allocated-invoices/${allocationId}`);
      fetchAllocations();
      onRefreshContract();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi hủy gán hóa đơn.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAmountChange = (allocationId: number, rawInput: string) => {
    const digits = rawInput.replace(/[^\d]/g, '');
    setEditingAmounts((prev) => ({
      ...prev,
      [allocationId]: digits,
    }));
  };

  const liveAllocations = useMemo(() => {
    if (!data?.allocations) return [];
    return data.allocations.map((item) => {
      const isEdited = editingAmounts[item.allocation_id] !== undefined;
      const currentAmt = isEdited
        ? (editingAmounts[item.allocation_id] === '' ? 0 : Number(editingAmounts[item.allocation_id]))
        : Number(item.allocated_amount);
      return {
        ...item,
        effectiveAmount: currentAmt,
        isEdited,
      };
    });
  }, [data?.allocations, editingAmounts]);

  const hasChanges = useMemo(() => {
    if (!data?.allocations) return false;
    return data.allocations.some((item) => {
      if (editingAmounts[item.allocation_id] === undefined) return false;
      const originalAmt = Math.round(Number(item.allocated_amount));
      const editedAmt = editingAmounts[item.allocation_id] === '' ? 0 : Number(editingAmounts[item.allocation_id]);
      return originalAmt !== editedAmt;
    });
  }, [data?.allocations, editingAmounts]);

  const originalPrincipal = Number(contract.original_principal_balance || 0);
  const totalAllocated = useMemo(() => {
    return liveAllocations.reduce((sum, item) => sum + item.effectiveAmount, 0);
  }, [liveAllocations]);
  const totalInvoiceAmountSum = useMemo(() => {
    return liveAllocations.reduce((sum, item) => sum + (Number(item.total_invoice_amount) || 0), 0);
  }, [liveAllocations]);
  const totalRemainingAmountSum = useMemo(() => {
    return liveAllocations.reduce((sum, item) => sum + (Number(item.remaining_amount) || 0), 0);
  }, [liveAllocations]);
  const diff = originalPrincipal - totalAllocated;
  const isFullySecured = (totalAllocated === originalPrincipal && originalPrincipal > 0);

  const handleSaveAllocations = async () => {
    if (!data?.allocations || data.allocations.length === 0) return;

    for (const item of liveAllocations) {
      if (item.effectiveAmount <= 0) {
        alert(`Số tiền nhận nợ cho hóa đơn ${item.invoice_number || item.invoice_id} phải lớn hơn 0. Nếu muốn xóa khỏi khế ước, vui lòng bấm nút xóa ở cột Thao tác.`);
        return;
      }
      if (item.total_invoice_amount && item.effectiveAmount > Number(item.total_invoice_amount)) {
        alert(`Số tiền nhận nợ (${item.effectiveAmount.toLocaleString('vi-VN')} đ) vượt quá tổng giá trị hóa đơn ${item.invoice_number || ''} (${Number(item.total_invoice_amount).toLocaleString('vi-VN')} đ)!`);
        return;
      }
    }

    if (totalAllocated > originalPrincipal) {
      alert(`Tổng số tiền nhận nợ (${totalAllocated.toLocaleString('vi-VN')} đ) không được vượt quá số tiền gốc khế ước (${originalPrincipal.toLocaleString('vi-VN')} đ)! Hiện đang vượt ${Math.abs(diff).toLocaleString('vi-VN')} đ.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        allocations: liveAllocations.map((item) => ({
          invoice_id: item.invoice_id,
          allocated_amount: item.effectiveAmount,
          notes: item.notes || undefined,
        })),
      };
      const res = await api.post(`/loans/${contract.loan_id}/allocate-invoices`, payload);
      setData(res.data);
      setEditingAmounts({});
      onRefreshContract();
      alert('Đã lưu thành công số tiền nhận nợ!');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi lưu số tiền nhận nợ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Thẻ KPI Đối Soát Nhận Nợ */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gốc nhận nợ khế ước</div>
          <div className="text-base font-bold text-slate-900 mt-1 font-mono">{fmtMoney(originalPrincipal)} đ</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Số tiền vay giải ngân ban đầu</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hóa đơn đã gán bảo đảm</div>
          <div className="text-base font-bold text-indigo-700 mt-1 font-mono">{fmtMoney(totalAllocated)} đ</div>
          <div className="text-[10px] text-indigo-500 mt-0.5">
            {data?.allocations?.length || 0} hóa đơn gán cho khế ước này
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chênh lệch bảo đảm</div>
          <div
            className={`text-base font-bold mt-1 font-mono ${
              diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-blue-700'
            }`}
          >
            {diff === 0 ? '0 đ (Khớp 100%)' : diff > 0 ? `Thiếu ${fmtMoney(diff)} đ` : `Thừa ${fmtMoney(Math.abs(diff))} đ`}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {diff > 0 ? 'Cần bổ sung thêm hóa đơn bảo đảm' : diff === 0 ? 'Đã đủ 100% chứng từ nhận nợ' : 'Hóa đơn vượt số nợ'}
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trạng thái bảo đảm</div>
            <div className="mt-1">
              {isFullySecured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Khớp 100% Bảo Đảm
                </span>
              ) : totalAllocated > 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <AlertCircle className="w-3.5 h-3.5" /> Chưa Đủ Hóa Đơn
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                  <HelpCircle className="w-3.5 h-3.5" /> Chưa Gán Hóa Đơn
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleSaveAllocations}
              disabled={saving || !hasChanges}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all ${
                hasChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer ring-2 ring-emerald-300 animate-pulse'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
              title={hasChanges ? 'Lưu các thay đổi số tiền nhận nợ' : 'Chưa có thay đổi để lưu'}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Lưu</span>
            </button>
            <button
              type="button"
              onClick={() => handleAutoSync(true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Tự động đồng bộ cuốn chiếu hóa đơn từ bộ hồ sơ giải ngân đến khi đủ 100% dư nợ gốc"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              )}
              <span>Đồng Bộ Cuốn Chiếu</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAllocateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Gán Thủ Công</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bảng danh sách hóa đơn đã gán */}
      {loading ? (
        <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải danh sách hóa đơn đối soát...
        </div>
      ) : error ? (
        <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{error}</div>
      ) : data?.allocations?.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl space-y-3">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-700 text-sm">Khế ước này chưa được đối soát với hóa đơn bảo đảm nào.</p>
          <p className="text-slate-400 max-w-md mx-auto">
            {contract.dossier_count && contract.dossier_count > 0 ? (
              <>
                Bộ hồ sơ khế ước đang có <strong>{contract.dossier_count} chứng từ</strong>. Bấm nút bên dưới để hệ thống tự động cuốn chiếu hạn mức từ bảng hóa đơn tổng đến khi đủ số lượng dư nợ gốc.
              </>
            ) : (
              'Bấm nút "Gán Hóa Đơn Mới" ở góc trên bên phải để liên kết số tiền nhận nợ với hóa đơn tương ứng.'
            )}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleAutoSync(true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-200" />}
              <span>Tự Động Cuốn Chiếu Từ Hồ Sơ</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAllocateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Gán Thủ Công</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">
          {/* Thanh công cụ bảng: hiển thị trạng thái sửa và nút Lưu nhanh */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">
                Danh sách hóa đơn nhận nợ ({liveAllocations.length})
              </span>
              {hasChanges && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  <AlertCircle className="w-3 h-3 text-amber-600" /> Có thay đổi chưa lưu
                </span>
              )}
            </div>
            {hasChanges && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAmounts({})}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded text-xs transition-colors cursor-pointer"
                >
                  Khôi phục
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllocations}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            )}
          </div>

          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Số HĐ / Ký hiệu</th>
                <th className="px-3 py-2 text-left">Đơn vị bán (Nhà cung cấp)</th>
                <th className="px-3 py-2 text-right">Tổng tiền trên HĐ</th>
                <th className="px-3 py-2 text-right font-semibold text-emerald-900">Số tiền khả dụng</th>
                <th className="px-3 py-2 text-right font-semibold text-indigo-900 w-44">Số tiền bảo đảm nhận nợ</th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
                <th className="px-3 py-2 text-center w-16">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {liveAllocations.map((item) => (
                <tr key={item.allocation_id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${item.isEdited ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-3 py-2 font-mono text-indigo-700 font-medium">
                    {item.invoice_number || '—'}{' '}
                    {item.invoice_series && <span className="text-slate-400 text-[11px]">({item.invoice_series})</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-800 max-w-sm truncate" title={item.seller_name || ''}>
                    {item.seller_name || '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {fmtMoney(item.total_invoice_amount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 bg-emerald-50/20">
                    {fmtMoney(item.remaining_amount)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <input
                        type="text"
                        value={
                          editingAmounts[item.allocation_id] !== undefined
                            ? (editingAmounts[item.allocation_id] === '' ? '' : Number(editingAmounts[item.allocation_id]).toLocaleString('vi-VN'))
                            : Number(item.allocated_amount).toLocaleString('vi-VN')
                        }
                        onChange={(e) => handleAmountChange(item.allocation_id, e.target.value)}
                        placeholder="0"
                        className={`w-36 px-2.5 py-1 text-xs font-mono font-bold text-right rounded-lg border focus:outline-none focus:ring-2 shadow-2xs transition-all ${
                          item.isEdited
                            ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-amber-500'
                            : 'bg-white border-slate-300 text-emerald-800 focus:ring-emerald-500 focus:border-emerald-500'
                        }`}
                      />
                      <span className="text-[11px] font-semibold text-slate-500">đ</span>
                    </div>
                    {item.isEdited && (
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Gốc: {fmtMoney(item.allocated_amount)} đ
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-xs truncate" title={item.notes || ''}>
                    {item.notes?.includes('cuốn chiếu') || item.notes?.includes('hồ sơ') ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                        {item.notes}
                      </span>
                    ) : (
                      item.notes || '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteAllocation(item.allocation_id)}
                      disabled={deletingId === item.allocation_id}
                      className="p-1 rounded text-rose-500 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
                      title="Hủy gán hóa đơn này khỏi khế ước"
                    >
                      {deletingId === item.allocation_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50/95 border-t-2 border-slate-300 font-bold text-slate-900">
              <tr>
                <td colSpan={2} className="px-3 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-extrabold text-slate-800">Tổng cộng:</span>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">
                      {liveAllocations.length} hóa đơn
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-slate-700">
                  {fmtMoney(totalInvoiceAmountSum)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs font-bold text-emerald-700">
                  {fmtMoney(totalRemainingAmountSum)}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="font-mono text-sm font-black text-emerald-700">
                    {fmtMoney(totalAllocated)} đ
                  </div>
                  <div className="text-[10px] font-medium mt-0.5 font-mono">
                    {diff === 0 ? (
                      <span className="text-emerald-600 font-semibold">Khớp 100% gốc</span>
                    ) : diff > 0 ? (
                      <span className="text-amber-600 font-semibold">Thiếu {fmtMoney(diff)} đ</span>
                    ) : (
                      <span className="text-blue-600 font-semibold">Thừa {fmtMoney(Math.abs(diff))} đ</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-left text-[11px] text-slate-600 font-medium">
                  {diff === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đã đủ 100% chứng từ nhận nợ
                    </span>
                  ) : diff > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Cần bổ sung thêm hóa đơn bảo đảm
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                      Hóa đơn vượt dư nợ gốc
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-slate-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal gán hóa đơn */}
      <AllocateInvoiceModal
        loan={contract}
        isOpen={isAllocateModalOpen}
        onClose={() => setIsAllocateModalOpen(false)}
        onSuccess={() => {
          fetchAllocations();
          onRefreshContract();
        }}
        remainingNeeded={diff > 0 ? diff : 0}
      />
    </div>
  );
};

// ==========================================
// COMPONENT 4: MODAL CHỈNH SỬA THÔNG TIN KHẾ ƯỚC
// ==========================================

// ==========================================
// COMPONENT 4: BỘ HỒ SƠ GIẢI NGÂN (DISBURSEMENT DOSSIER)
// ==========================================
interface DisbursementDocItem {
  document_id: number;
  document_uuid: string;
  loan_id: number;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  file_sha256: string;
  mime_type: string;
  document_type: string;
  description?: string | null;
  invoice_number?: string | null;
  invoice_total_amount?: number | null;
  uploaded_by?: string;
  created_at: string;
}

const DOSSIER_CATEGORY_META: Record<string, { label: string; badge: string; colorClass: string }> = {
  DEBT_NOTE: {
    label: 'Khế ước nhận nợ',
    badge: 'Khế ước nhận nợ',
    colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  INVOICE: {
    label: 'Hóa đơn',
    badge: 'Hóa đơn',
    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  CONTRACT: {
    label: 'Hợp đồng tín dụng',
    badge: 'HĐ Tín dụng',
    colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  DISBURSEMENT_RECORD: {
    label: 'Biên bản giải ngân',
    badge: 'Biên bản GN',
    colorClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  COLLATERAL: {
    label: 'Tài sản bảo đảm',
    badge: 'TS Bảo đảm',
    colorClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  OTHER: {
    label: 'Chứng từ khác',
    badge: 'Khác',
    colorClass: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

const ALL_CATEGORY_OPTIONS = [
  { key: 'DEBT_NOTE', label: 'Khế ước nhận nợ' },
  { key: 'INVOICE', label: 'Hóa đơn' },
  { key: 'CONTRACT', label: 'Hợp đồng tín dụng' },
  { key: 'DISBURSEMENT_RECORD', label: 'Biên bản giải ngân' },
  { key: 'COLLATERAL', label: 'Tài sản bảo đảm' },
  { key: 'OTHER', label: 'Chứng từ khác' },
];

const formatDocSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface DisbursementDossierPanelProps {
  contract: ContractRow;
  onRefreshContract: () => void;
}

const DisbursementDossierPanel: React.FC<DisbursementDossierPanelProps> = ({ contract, onRefreshContract }) => {
  const [docs, setDocs] = useState<DisbursementDocItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Drag & drop inline upload
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string }>({
    current: 0,
    total: 0,
    fileName: '',
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    setLoading(true);
    setError(null);
    api
      .get(`/loans/${contract.loan_id}/dossier`)
      .then((res) => {
        setDocs(res.data ?? []);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || 'Không tải được bộ hồ sơ giải ngân.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
  }, [contract.loan_id]);

  const handleDownload = async (doc: DisbursementDocItem) => {
    try {
      const res = await api.get(`/loans/dossier/${doc.document_id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Không tải được tài liệu.');
    }
  };

  const handleDelete = async (docId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;
    setDeletingId(docId);
    try {
      await api.delete(`/loans/dossier/${docId}`);
      fetchDocs();
      onRefreshContract();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi xóa tài liệu.');
    } finally {
      setDeletingId(null);
    }
  };

  // Thống kê phân loại
  const catCounts = useMemo(() => {
    const map: Record<string, number> = { CONTRACT: 0, DEBT_NOTE: 0, INVOICE: 0, COLLATERAL: 0, DISBURSEMENT_RECORD: 0, OTHER: 0 };
    docs.forEach((d) => {
      const t = d.document_type || 'OTHER';
      map[t] = (map[t] || 0) + 1;
    });
    return map;
  }, [docs]);

  // Danh sách các tab hiển thị: Mặc định chỉ có Khế ước nhận nợ & Hóa đơn.
  // Nếu có tài liệu loại khác đã tồn tại trong docs hoặc user bấm dấu +, thêm vào danh sách tab.
  const activeCategoryTabs = useMemo(() => {
    const baseKeys = ['DEBT_NOTE', 'INVOICE'];
    const existingWithFiles = Object.keys(catCounts).filter((k) => (catCounts[k] || 0) > 0 && !baseKeys.includes(k));
    const merged = Array.from(new Set([...baseKeys, ...existingWithFiles, ...extraCategories]));
    return ALL_CATEGORY_OPTIONS.filter((c) => merged.includes(c.key));
  }, [catCounts, extraCategories]);

  // Các loại chứng từ còn lại có thể thêm qua nút dấu +
  const remainingAddOptions = useMemo(() => {
    const activeKeys = activeCategoryTabs.map((c) => c.key);
    return ALL_CATEGORY_OPTIONS.filter((c) => !activeKeys.includes(c.key));
  }, [activeCategoryTabs]);

  const filteredDocs = useMemo(() => {
    if (filterCategory === 'ALL') return docs;
    return docs.filter((d) => d.document_type === filterCategory);
  }, [docs, filterCategory]);

  const targetCategoryLabel = useMemo(() => {
    if (filterCategory === 'ALL') return 'Tự động nhận diện (Khế ước nhận nợ / Hóa đơn)';
    const found = ALL_CATEGORY_OPTIONS.find((c) => c.key === filterCategory);
    return found ? found.label : filterCategory;
  }, [filterCategory]);

  // Xử lý tải file kéo thả
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const fileArray = Array.from(files);
    setUploadProgress({ current: 0, total: fileArray.length, fileName: fileArray[0].name });

    let successCount = 0;
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress({ current: i + 1, total: fileArray.length, fileName: file.name });

      let docType = filterCategory !== 'ALL' ? filterCategory : 'DEBT_NOTE';
      if (filterCategory === 'ALL') {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.xml') || lowerName.includes('hoadon') || lowerName.includes('inv')) {
          docType = 'INVOICE';
        } else if (lowerName.includes('kheuoc') || lowerName.includes('nhanno') || lowerName.includes('ld')) {
          docType = 'DEBT_NOTE';
        } else {
          docType = 'DEBT_NOTE';
        }
      }

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('document_type', docType);
        await api.post(`/loans/${contract.loan_id}/dossier/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch (err: any) {
        console.error('Lỗi khi tải file', file.name, err);
        setUploadError(err?.response?.data?.detail || `Lỗi khi tải lên file ${file.name}`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchDocs();
    onRefreshContract();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Thẻ KPI Hồ sơ */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng chứng từ lưu trữ</div>
          <div className="text-base font-bold text-indigo-700 mt-1 font-mono">{docs.length} tệp tin</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Lưu trữ an toàn trên Object Storage</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Khế ước nhận nợ</div>
          <div className="text-base font-bold text-amber-700 mt-1 font-mono">
            {catCounts.DEBT_NOTE} tệp
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Khế ước vay & Giấy nhận nợ LD
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hóa đơn</div>
          <div className="text-base font-bold text-emerald-700 mt-1 font-mono">{catCounts.INVOICE} tệp</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Hóa đơn XML/PDF & UNC giải ngân</div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chứng từ khác</div>
          <div className="text-base font-bold text-purple-700 mt-1 font-mono">
            {catCounts.CONTRACT + catCounts.COLLATERAL + catCounts.DISBURSEMENT_RECORD + catCounts.OTHER} tệp
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">HĐ tín dụng, TS bảo đảm, Biên bản GN...</div>
        </div>
      </div>

      {/* Thanh Phân Loại Chứng Từ: Mặc định Khế ước nhận nợ & Hóa đơn, kèm nút + */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 text-xs relative">
        <button
          type="button"
          onClick={() => setFilterCategory('ALL')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            filterCategory === 'ALL' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Tất cả ({docs.length})
        </button>

        {activeCategoryTabs.map((cat) => {
          const count = catCounts[cat.key] || 0;
          const isActive = filterCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilterCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Nút dấu + thêm loại chứng từ */}
        {remainingAddOptions.length > 0 && (
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIsAddMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
              title="Thêm loại chứng từ khác"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm loại</span>
            </button>

            {isAddMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsAddMenuOpen(false)}
                />
                <div
                  className="absolute left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                    Chọn loại chứng từ thêm:
                  </div>
                  {remainingAddOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setExtraCategories((prev) => [...prev, opt.key]);
                        setFilterCategory(opt.key);
                        setIsAddMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="font-medium">{opt.label}</span>
                      <Plus className="w-3.5 h-3.5 text-indigo-500" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Khu Vực Kéo Thả File Tải Lên (Inline Drag & Drop Zone - Không Cần Cửa Sổ Phụ) */}
      <div className="space-y-2">
        {uploadError && (
          <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{uploadError}</span>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/80 scale-[1.005] ring-2 ring-indigo-200 shadow-xs'
              : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            accept=".pdf,.xml,.jpg,.jpeg,.png,.docx,.xlsx,.zip"
          />

          {uploading ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-1">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <div className="text-xs font-bold text-slate-800">
                Đang tải lên {uploadProgress.current}/{uploadProgress.total} tệp tin...
              </div>
              <div className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                {uploadProgress.fileName}
              </div>
              <div className="w-48 bg-slate-200 rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / Math.max(1, uploadProgress.total)) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-0.5">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-slate-800">
                <span className="text-indigo-600 font-bold hover:underline">Nhấn để chọn tệp</span> hoặc kéo và thả tài liệu vào đây
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap justify-center">
                <span>Đang tải vào:</span>
                <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {targetCategoryLabel}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-400">Hỗ trợ PDF, XML, DOCX, XLSX, Ảnh... (tối đa 25MB, có thể chọn nhiều file)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bảng Danh Sách Chứng Từ */}
      {loading ? (
        <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải danh sách hồ sơ...
        </div>
      ) : error ? (
        <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{error}</div>
      ) : filteredDocs.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl space-y-2">
          <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-medium text-slate-700">Chưa có tài liệu nào trong mục này.</p>
          <p className="text-slate-400">
            Kéo thả tệp tin vào khung nét đứt phía trên để tải lên ngay vào mục <strong>{targetCategoryLabel}</strong>.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">Phân loại hồ sơ</th>
                <th className="px-3 py-2 text-left">Tên tệp tin</th>
                <th className="px-3 py-2 text-right">Dung lượng</th>
                <th className="px-3 py-2 text-center">Ngày tải lên</th>
                <th className="px-3 py-2 text-left">Người tải</th>
                <th className="px-3 py-2 text-left">Ghi chú / Diễn giải</th>
                <th className="px-3 py-2 text-center w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const meta = DOSSIER_CATEGORY_META[doc.document_type] || DOSSIER_CATEGORY_META.OTHER;
                return (
                  <tr key={doc.document_id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${meta.colorClass}`}>
                        {meta.badge}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-indigo-700 font-medium max-w-xs truncate" title={doc.file_name}>
                      <div className="flex items-center gap-1.5">
                        <FileCheck2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{doc.file_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 whitespace-nowrap">
                      {formatDocSize(doc.file_size_bytes)}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500 font-mono whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{doc.uploaded_by || 'Hệ thống'}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-sm truncate" title={doc.description || ''}>
                      {doc.description || '—'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Tải xuống tệp chứng từ"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.document_id)}
                          disabled={deletingId === doc.document_id}
                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Xóa chứng từ khỏi bộ hồ sơ"
                        >
                          {deletingId === doc.document_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface EditContractModalProps {
  contract: ContractRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EditContractModal: React.FC<EditContractModalProps> = ({ contract, isOpen, onClose, onSuccess }) => {
  const [banksList, setBanksList] = useState<Array<{ bank_id: number; bank_code: string; bank_name: string; short_name: string; branch_name?: string | null }>>([]);
  const [formData, setFormData] = useState({
    contract_number: '',
    bank_name: '',
    bank_code: '',
    borrower_name: '',
    original_principal_balance: '',
    current_principal_balance: '',
    interest_rate: '',
    disbursement_date: '',
    maturity_date: '',
    term: '',
    loan_purpose: '',
    debt_group: '1',
    status: 'ACTIVE',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/banks').then((res) => setBanksList(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (contract) {
      setFormData({
        contract_number: contract.contract_number || '',
        bank_name: contract.bank_name || '',
        bank_code: contract.bank_code || '',
        borrower_name: contract.borrower_name || '',
        original_principal_balance: contract.original_principal_balance || '0',
        current_principal_balance: contract.current_principal_balance || '0',
        interest_rate: contract.interest_rate || '0',
        disbursement_date: contract.disbursement_date ? contract.disbursement_date.slice(0, 10) : '',
        maturity_date: contract.maturity_date ? contract.maturity_date.slice(0, 10) : '',
        term: contract.term || '',
        loan_purpose: contract.loan_purpose || '',
        debt_group: contract.debt_group || '1',
        status: contract.status || 'ACTIVE',
        note: contract.note || '',
      });
      setError(null);
    }
  }, [contract]);

  if (!isOpen || !contract) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, any> = {
        contract_number: formData.contract_number.trim(),
        bank_name: formData.bank_name.trim(),
        bank_code: formData.bank_code.trim(),
        borrower_name: formData.borrower_name.trim(),
        original_principal_balance: Number(formData.original_principal_balance) || 0,
        current_principal_balance: Number(formData.current_principal_balance) || 0,
        interest_rate: Number(formData.interest_rate) || 0,
        debt_group: formData.debt_group,
        status: formData.status,
        note: formData.note.trim() || null,
        term: formData.term.trim() || null,
        loan_purpose: formData.loan_purpose.trim() || null,
      };

      if (formData.disbursement_date) {
        payload.disbursement_date = formData.disbursement_date;
      }
      if (formData.maturity_date) {
        payload.maturity_date = formData.maturity_date;
      }

      await api.put(`/loans/${contract.loan_id}`, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Lỗi khi cập nhật thông tin khế ước.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Edit2 className="w-5 h-5 text-indigo-300" />
            <div>
              <h3 className="text-base font-bold">Chỉnh Sửa Thông Tin Khế Ước</h3>
              <p className="text-xs text-indigo-200 font-mono">ID: {contract.loan_id} — {contract.contract_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Số khế ước */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số khế ước / HĐ vay <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contract_number}
                onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Chủ thể đứng tên vay */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chủ thể vay / Bên đứng tên <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={formData.borrower_name}
                  onChange={(e) => setFormData({ ...formData, borrower_name: e.target.value })}
                  placeholder="vd: Công ty CP Tập đoàn Sơn Hà..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Tổ chức tín dụng / Ngân hàng */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngân hàng / TCTD liên kết <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <select
                  value={formData.bank_code}
                  onChange={(e) => {
                    const selCode = e.target.value;
                    const found = banksList.find((b) => b.bank_code === selCode);
                    setFormData({
                      ...formData,
                      bank_code: selCode,
                      bank_name: found ? found.short_name : formData.bank_name,
                    });
                  }}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                  required
                >
                  <option value="">-- Chọn ngân hàng trong danh mục --</option>
                  {banksList.map((b) => (
                    <option key={b.bank_id} value={b.bank_code}>
                      [{b.short_name}] {b.bank_name} {b.branch_name ? `(${b.branch_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tên hiển thị viết tắt */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên viết tắt hiển thị <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="vd: VietinBank, MB, VPBank..."
                className="w-full px-3 py-2 text-xs font-bold text-indigo-700 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                required
              />
            </div>

            {/* Dư nợ gốc ban đầu */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dư nợ gốc ban đầu (VNĐ) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  value={formData.original_principal_balance}
                  onChange={(e) => setFormData({ ...formData, original_principal_balance: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 font-mono">
                = {fmtMoney(formData.original_principal_balance)} đ
              </p>
            </div>

            {/* Dư nợ gốc hiện tại */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dư nợ gốc hiện tại (VNĐ) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  value={formData.current_principal_balance}
                  onChange={(e) => setFormData({ ...formData, current_principal_balance: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 font-mono">
                = {fmtMoney(formData.current_principal_balance)} đ
              </p>
            </div>

            {/* Lãi suất */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lãi suất (% / năm) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Percent className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                  placeholder="vd: 8.5"
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Kỳ hạn */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kỳ hạn vay</label>
              <input
                type="text"
                value={formData.term}
                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                placeholder="vd: 4M, 6M, 12M..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Ngày giải ngân */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày giải ngân</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="date"
                  value={formData.disbursement_date}
                  onChange={(e) => setFormData({ ...formData, disbursement_date: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Ngày đáo hạn */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày đáo hạn</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="date"
                  value={formData.maturity_date}
                  onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Nhóm nợ */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phân loại nhóm nợ (CIC)</label>
              <select
                value={formData.debt_group}
                onChange={(e) => setFormData({ ...formData, debt_group: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1">Nhóm 1 - Nợ đủ tiêu chuẩn</option>
                <option value="2">Nhóm 2 - Nợ cần chú ý</option>
                <option value="3">Nhóm 3 - Nợ dưới tiêu chuẩn</option>
                <option value="4">Nhóm 4 - Nợ nghi ngờ</option>
                <option value="5">Nhóm 5 - Nợ có khả năng mất vốn</option>
              </select>
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái khế ước</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ACTIVE">ACTIVE - Đang hoạt động / Còn dư nợ</option>
                <option value="SETTLED">SETTLED - Đã tất toán toàn bộ</option>
                <option value="OVERDUE">OVERDUE - Quá hạn trả nợ</option>
              </select>
            </div>
          </div>

          {/* Mục đích vay */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mục đích vay</label>
            <input
              type="text"
              value={formData.loan_purpose}
              onChange={(e) => setFormData({ ...formData, loan_purpose: e.target.value })}
              placeholder="vd: Vay bổ sung vốn lưu động phục vụ SXKD xi măng..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú nội bộ</label>
            <textarea
              rows={2}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú điều khoản, bảo lãnh, tài sản..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu thay đổi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENT CHÍNH: CONTRACT DETAILS PAGE
// ==========================================

const CONTRACT_COLUMNS: ColumnConfig[] = [
  { field: 'bank', label: 'Ngân hàng', type: 'text', defaultWidth: 140, minWidth: 100 },
  { field: 'contract_number', label: 'Số khế ước', type: 'text', defaultWidth: 160, minWidth: 120 },
  { field: 'borrower_name', label: 'Chủ thể vay', type: 'text', defaultWidth: 160, minWidth: 120 },
  { field: 'original_principal_balance', label: 'Dư nợ gốc', type: 'number', defaultWidth: 140, minWidth: 110, align: 'right' },
  { field: 'total_principal_paid', label: 'Tổng gốc đã trả', type: 'number', defaultWidth: 140, minWidth: 110, align: 'right' },
  { field: 'current_principal_balance', label: 'Dư nợ hiện tại', type: 'number', defaultWidth: 140, minWidth: 110, align: 'right' },
  { field: 'interest_rate', label: 'Lãi suất', type: 'number', defaultWidth: 100, minWidth: 80, align: 'right' },
  { field: 'estimated_interest', label: 'Lãi ước tính', type: 'number', defaultWidth: 130, minWidth: 100, align: 'right' },
  { field: 'total_interest_paid', label: 'Lãi đã trả', type: 'number', defaultWidth: 130, minWidth: 100, align: 'right' },
  { field: 'disbursement_date', label: 'Ngày GN', type: 'date', defaultWidth: 110, minWidth: 90, align: 'center' },
  { field: 'maturity_date', label: 'Ngày ĐH', type: 'date', defaultWidth: 110, minWidth: 90, align: 'center' },
  { field: 'invoice_status', label: 'Tình trạng hóa đơn', type: 'text', defaultWidth: 155, minWidth: 130, align: 'center' },
  { field: 'actions', label: 'Thao tác', type: 'actions', defaultWidth: 100, minWidth: 90, align: 'center', locked: true },
];

export const ContractDetailsPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<Record<number, 'cashflow' | 'invoices' | 'dossier'>>({});
  const [copiedContract, setCopiedContract] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ColumnFilters>(initialFilters);
  const [showColumnFilters, setShowColumnFilters] = useState(true);

  // Multi-select dropdown state for Tình trạng hóa đơn filter
  const [isInvoiceStatusFilterOpen, setIsInvoiceStatusFilterOpen] = useState(false);
  const invoiceStatusDropdownRef = useRef<HTMLDivElement>(null);

  // Modal Sửa Khế Ước State
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchContracts = () => {
    api
      .get('/loans/contract-details')
      .then((res) => setContracts(res.data?.data ?? []))
      .catch(() => setError('Không tải được danh sách khế ước.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleCopyContract = (e: React.MouseEvent, contractNumber: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractNumber);
    setCopiedContract(contractNumber);
    setTimeout(() => setCopiedContract(null), 2000);
  };

  const handleOpenEdit = (e: React.MouseEvent, c: ContractRow) => {
    e.stopPropagation();
    setEditingContract(c);
    setIsEditModalOpen(true);
  };

  const handleOpenInvoiceReconcile = (e: React.MouseEvent, c: ContractRow) => {
    e.stopPropagation();
    setExpanded(c.loan_id);
    setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'invoices' }));
  };

  const handleFilterChange = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters(initialFilters);
    setSearch('');
  };

  const toggleInvoiceStatusFilter = (statusKey: string) => {
    setFilters((prev) => {
      const current = prev.invoice_status || [];
      const next = current.includes(statusKey)
        ? current.filter((s) => s !== statusKey)
        : [...current, statusKey];
      return { ...prev, invoice_status: next };
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        invoiceStatusDropdownRef.current &&
        !invoiceStatusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsInvoiceStatusFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const uniqueBanks = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach((c) => {
      const b = c.bank_name || c.bank_code;
      if (b) set.add(b.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [contracts]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.bank) count++;
    if (filters.contract_number) count++;
    if (filters.borrower_name) count++;
    if (filters.original_principal_balance) count++;
    if (filters.total_principal_paid) count++;
    if (filters.current_principal_balance !== 'ALL') count++;
    if (filters.interest_rate) count++;
    if (filters.estimated_interest) count++;
    if (filters.total_interest_paid) count++;
    if (filters.disbursement_date) count++;
    if (filters.maturity_date) count++;
    if (filters.invoice_status && filters.invoice_status.length > 0) count++;
    return count;
  }, [filters]);

  const {
    visibleColumns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    isColumnVisible,
    columnWidths,
    handleResize,
    sortField,
    sortDirection,
    handleSort,
    filters: gridFilters,
    setFilter: setGridFilter,
    clearAllFilters: clearGridFilters,
    activeFilterCount: gridActiveFilterCount,
    filterAndSort,
  } = useTableGrid<ContractRow & { bank: string }>({
    tableId: 'contracts_table',
    columns: CONTRACT_COLUMNS,
    defaultSortField: 'contract_number',
    defaultSortDirection: 'asc',
  });

  const enrichedContracts = useMemo(() => {
    return contracts.map((c) => ({
      ...c,
      bank: c.bank_name || c.bank_code || '',
    }));
  }, [contracts]);

  const searchedContracts = useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase();
    const cleanNum = (s: string) => s.replace(/[\.,\s]/g, '');

    return enrichedContracts.filter((c) => {
      // 1. Global search
      if (search.trim()) {
        const q = norm(search.trim());
        const bankStr = norm(`${c.bank_name} ${c.bank_code}`);
        const contractStr = norm(c.contract_number);
        const borrowerStr = norm(c.borrower_name || '');
        if (!bankStr.includes(q) && !contractStr.includes(q) && !borrowerStr.includes(q)) {
          return false;
        }
      }

      // 2. Column filters
      if (filters.bank) {
        const bankName = c.bank_name || c.bank_code || '';
        if (bankName.trim() !== filters.bank.trim()) return false;
      }

      if (filters.contract_number.trim()) {
        const q = norm(filters.contract_number.trim());
        if (!norm(c.contract_number).includes(q)) return false;
      }

      if (filters.borrower_name.trim()) {
        const q = norm(filters.borrower_name.trim());
        if (!norm(c.borrower_name || '').includes(q)) return false;
      }

      if (filters.original_principal_balance.trim()) {
        const q = cleanNum(filters.original_principal_balance.trim());
        const raw = cleanNum(String(c.original_principal_balance || ''));
        const fmt = cleanNum(fmtMoney(c.original_principal_balance));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      if (filters.total_principal_paid.trim()) {
        const q = cleanNum(filters.total_principal_paid.trim());
        const raw = cleanNum(String(c.total_principal_paid || ''));
        const fmt = cleanNum(fmtMoney(c.total_principal_paid));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      if (filters.current_principal_balance === 'ACTIVE') {
        if (Number(c.current_principal_balance) <= 0) return false;
      } else if (filters.current_principal_balance === 'SETTLED') {
        if (Number(c.current_principal_balance) > 0) return false;
      } else if (filters.current_principal_balance !== 'ALL' && filters.current_principal_balance.trim()) {
        const q = cleanNum(filters.current_principal_balance.trim());
        const raw = cleanNum(String(c.current_principal_balance || ''));
        const fmt = cleanNum(fmtMoney(c.current_principal_balance));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      if (filters.interest_rate.trim()) {
        const q = filters.interest_rate.trim().replace('%', '');
        const rateStr = Number(c.interest_rate).toFixed(2);
        if (!rateStr.includes(q)) return false;
      }

      if (filters.estimated_interest.trim()) {
        const q = cleanNum(filters.estimated_interest.trim());
        const raw = cleanNum(String(c.estimated_interest || ''));
        const fmt = cleanNum(fmtMoney(c.estimated_interest));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      if (filters.total_interest_paid.trim()) {
        const q = cleanNum(filters.total_interest_paid.trim());
        const raw = cleanNum(String(c.total_interest_paid || ''));
        const fmt = cleanNum(fmtMoney(c.total_interest_paid));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      if (filters.disbursement_date.trim()) {
        const q = filters.disbursement_date.trim().toLowerCase();
        const dStr = fmtDate(c.disbursement_date).toLowerCase();
        const rawDate = (c.disbursement_date || '').toLowerCase();
        if (!dStr.includes(q) && !rawDate.includes(q)) return false;
      }

      if (filters.maturity_date.trim()) {
        const q = filters.maturity_date.trim().toLowerCase();
        const dStr = fmtDate(c.maturity_date).toLowerCase();
        const rawDate = (c.maturity_date || '').toLowerCase();
        if (!dStr.includes(q) && !rawDate.includes(q)) return false;
      }

      // Filter Tình trạng hóa đơn (Multiple Selection: ENOUGH, UNDER, OVER)
      if (filters.invoice_status && filters.invoice_status.length > 0) {
        const origAmt = Number(c.original_principal_balance || 0);
        const allocAmt = Number(c.allocated_invoices_amount || 0);
        let statusKey = 'UNDER';
        if (origAmt > 0 && Math.abs(allocAmt - origAmt) < 0.01) {
          statusKey = 'ENOUGH';
        } else if (allocAmt > origAmt) {
          statusKey = 'OVER';
        } else {
          statusKey = 'UNDER';
        }
        if (!filters.invoice_status.includes(statusKey)) return false;
      }

      return true;
    });
  }, [enrichedContracts, search, filters]);

  const sortedContracts = useMemo(() => {
    return filterAndSort(searchedContracts, {
      bank: (c) => c.bank_name || c.bank_code || '',
      invoice_status: (c) => {
        const orig = Number(c.original_principal_balance || 0);
        const alloc = Number(c.allocated_invoices_amount || 0);
        if (orig > 0 && Math.abs(alloc - orig) < 0.01) return 'A_ENOUGH';
        if (alloc < orig) return 'B_UNDER';
        return 'C_OVER';
      },
    });
  }, [searchedContracts, filterAndSort]);

  const th = (field: string, label: string, align: 'left' | 'right' | 'center' = 'right') => {
    if (!isColumnVisible(field)) return null;
    const colDef = CONTRACT_COLUMNS.find((col) => col.field === field);
    return (
      <SortableTh
        field={field}
        currentSortField={sortField}
        currentSortDirection={sortDirection}
        onSort={handleSort}
        align={align}
        className="!py-2"
        width={columnWidths[field]}
        onResize={(w) => handleResize(field, w)}
        filterType={colDef?.type}
        filterValue={gridFilters[field]}
        onFilterChange={(val) => setGridFilter(field, val)}
      >
        {label}
      </SortableTh>
    );
  };
  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Chi tiết khế ước & Đối soát nhận nợ</h1>
            <p className="text-xs text-slate-500">
              Quản lý chi tiết từng khế ước, chỉnh sửa trực tiếp, theo dõi dòng tiền và đối soát số tiền nhận nợ với hóa đơn.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColumnFilters(!showColumnFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              showColumnFilters
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Ẩn/Hiện dòng lọc theo từng cột"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{showColumnFilters ? 'Ẩn bộ lọc' : 'Lọc từng cột'}</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {(activeFilterCount > 0 || search.trim()) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Đặt lại toàn bộ bộ lọc và ô tìm kiếm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa lọc</span>
            </button>
          )}

          <div className="text-xs text-slate-500 font-medium ml-1">
            Hiển thị <strong className="text-slate-800">{sortedContracts.length}</strong> / {contracts.length} khế ước
          </div>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo ngân hàng, số khế ước, chủ thể vay..."
          aria-label="Tìm kiếm khế ước"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {/* Table Toolbar */}
      <TableGridToolbar
        columns={CONTRACT_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onShowAllColumns={showAllColumns}
        onResetColumns={resetColumns}
        activeFilterCount={gridActiveFilterCount + activeFilterCount}
        onClearAllFilters={() => {
          clearGridFilters();
          handleResetFilters();
        }}
        totalCount={contracts.length}
        filteredCount={sortedContracts.length}
      />

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải dữ liệu khế ước...
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-rose-600">{error}</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 w-6" />
                {th('bank', 'Ngân hàng', 'left')}
                {th('contract_number', 'Số khế ước', 'left')}
                {th('borrower_name', 'Chủ thể vay', 'left')}
                {th('original_principal_balance', 'Dư nợ gốc')}
                {th('total_principal_paid', 'Tổng gốc đã trả')}
                {th('current_principal_balance', 'Dư nợ hiện tại')}
                {th('interest_rate', 'Lãi suất')}
                {th('estimated_interest', 'Lãi ước tính')}
                {th('total_interest_paid', 'Lãi đã trả')}
                {th('disbursement_date', 'Ngày GN', 'center')}
                {th('maturity_date', 'Ngày ĐH', 'center')}
                {th('invoice_status', 'Tình trạng hóa đơn', 'center')}
                {isColumnVisible('actions') && (
                  <SortableTh
                    field="actions"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={() => {}}
                    disableFilter
                    align="center"
                    className="w-24 px-3 py-2"
                    width={columnWidths['actions']}
                    minWidth={90}
                    onResize={(w) => handleResize('actions', w)}
                  >
                    Thao tác
                  </SortableTh>
                )}
              </tr>

              {/* DÒNG FILTER TỪNG CỘT */}
              {showColumnFilters && (
                <tr className="bg-indigo-50/50 border-t border-indigo-100 text-[11px]">
                  <td className="px-2 py-1.5 text-center text-slate-400">
                    <Filter className="w-3 h-3 mx-auto text-indigo-400" />
                  </td>

                  {/* 1. Filter Ngân hàng */}
                  {isColumnVisible('bank') && (
                    <td className="px-2 py-1.5">
                      <select
                        value={filters.bank}
                        onChange={(e) => handleFilterChange('bank', e.target.value)}
                        className="w-full text-[11px] bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Tất cả NH</option>
                        {uniqueBanks.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}

                  {/* 2. Filter Số khế ước */}
                  {isColumnVisible('contract_number') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.contract_number}
                        onChange={(e) => handleFilterChange('contract_number', e.target.value)}
                        placeholder="Lọc số khế ước..."
                        className="w-full text-[11px] font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 3. Filter Chủ thể vay */}
                  {isColumnVisible('borrower_name') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.borrower_name}
                        onChange={(e) => handleFilterChange('borrower_name', e.target.value)}
                        placeholder="Lọc chủ thể..."
                        className="w-full text-[11px] bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 4. Filter Dư nợ gốc */}
                  {isColumnVisible('original_principal_balance') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.original_principal_balance}
                        onChange={(e) => handleFilterChange('original_principal_balance', e.target.value)}
                        placeholder="Lọc gốc..."
                        className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 5. Filter Tổng gốc đã trả */}
                  {isColumnVisible('total_principal_paid') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.total_principal_paid}
                        onChange={(e) => handleFilterChange('total_principal_paid', e.target.value)}
                        placeholder="Lọc đã trả..."
                        className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 6. Filter Dư nợ hiện tại */}
                  {isColumnVisible('current_principal_balance') && (
                    <td className="px-2 py-1.5">
                      <select
                        value={filters.current_principal_balance}
                        onChange={(e) => handleFilterChange('current_principal_balance', e.target.value)}
                        className="w-full text-[11px] font-medium bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="ALL">Tất cả nợ</option>
                        <option value="ACTIVE">Còn nợ (&gt; 0)</option>
                        <option value="SETTLED">Tất toán (= 0)</option>
                      </select>
                    </td>
                  )}

                  {/* 7. Filter Lãi suất */}
                  {isColumnVisible('interest_rate') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.interest_rate}
                        onChange={(e) => handleFilterChange('interest_rate', e.target.value)}
                        placeholder="vd: 8.5"
                        className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 8. Filter Lãi ước tính */}
                  {isColumnVisible('estimated_interest') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.estimated_interest}
                        onChange={(e) => handleFilterChange('estimated_interest', e.target.value)}
                        placeholder="Lãi tính..."
                        className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 9. Filter Tổng lãi đã trả */}
                  {isColumnVisible('total_interest_paid') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.total_interest_paid}
                        onChange={(e) => handleFilterChange('total_interest_paid', e.target.value)}
                        placeholder="Lãi trả..."
                        className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 10. Filter Ngày giải ngân */}
                  {isColumnVisible('disbursement_date') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.disbursement_date}
                        onChange={(e) => handleFilterChange('disbursement_date', e.target.value)}
                        placeholder="vd: 10/3"
                        className="w-full text-[11px] text-center font-mono bg-white border border-slate-300 rounded px-1 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 11. Filter Ngày đáo hạn */}
                  {isColumnVisible('maturity_date') && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters.maturity_date}
                        onChange={(e) => handleFilterChange('maturity_date', e.target.value)}
                        placeholder="vd: 10/9"
                        className="w-full text-[11px] text-center font-mono bg-white border border-slate-300 rounded px-1 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  )}

                  {/* 12. Filter Tình trạng hóa đơn (Multiple Selection) */}
                  {isColumnVisible('invoice_status') && (
                    <td className="px-2 py-1.5 relative">
                      <div ref={invoiceStatusDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setIsInvoiceStatusFilterOpen(!isInvoiceStatusFilterOpen)}
                          className={`w-full text-[11px] rounded px-1.5 py-1 border transition-all flex items-center justify-between gap-1 text-left ${
                            filters.invoice_status.length > 0
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-bold shadow-2xs'
                              : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                          }`}
                          title="Lọc chọn nhiều tình trạng hóa đơn"
                        >
                          <span className="truncate">
                            {filters.invoice_status.length === 0
                              ? 'Tất cả'
                              : filters.invoice_status.length === 1
                              ? filters.invoice_status[0] === 'ENOUGH'
                                ? 'Đủ HĐ'
                                : filters.invoice_status[0] === 'UNDER'
                                ? 'Thiếu HĐ'
                                : 'Thừa HĐ'
                              : `Đã chọn (${filters.invoice_status.length})`}
                          </span>
                          <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        </button>

                        {/* Popover Dropdown */}
                        {isInvoiceStatusFilterOpen && (
                          <div className="absolute z-50 mt-1 right-0 w-44 bg-white border border-slate-200 rounded-lg shadow-xl p-2 space-y-1 text-xs animate-in fade-in duration-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pb-1 border-b border-slate-100 flex items-center justify-between">
                              <span>Chọn tình trạng</span>
                              {filters.invoice_status.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterChange('invoice_status', []);
                                  }}
                                  className="text-[10px] text-indigo-600 hover:underline cursor-pointer lowercase font-medium"
                                >
                                  xóa chọn
                                </button>
                              )}
                            </div>

                            <label className="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={filters.invoice_status.includes('ENOUGH')}
                                onChange={() => toggleInvoiceStatusFilter('ENOUGH')}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                              />
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-[11px]">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Đủ hóa đơn
                              </span>
                            </label>

                            <label className="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={filters.invoice_status.includes('UNDER')}
                                onChange={() => toggleInvoiceStatusFilter('UNDER')}
                                className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                              />
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-800 text-[11px]">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                Thiếu hóa đơn
                              </span>
                            </label>

                            <label className="flex items-center gap-2 p-1 hover:bg-slate-50 rounded cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={filters.invoice_status.includes('OVER')}
                                onChange={() => toggleInvoiceStatusFilter('OVER')}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                              />
                              <span className="inline-flex items-center gap-1 font-semibold text-blue-800 text-[11px]">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                Thừa hóa đơn
                              </span>
                            </label>

                            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleFilterChange('invoice_status', ['ENOUGH', 'UNDER', 'OVER'])}
                                className="text-slate-500 hover:text-slate-800 font-medium"
                              >
                                Chọn tất cả
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsInvoiceStatusFilterOpen(false)}
                                className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100"
                              >
                                Đóng
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  )}

                  {isColumnVisible('actions') && <td className="px-2 py-1.5" />}
                </tr>
              )}
            </thead>
            <tbody>
              {sortedContracts.length === 0 && (
                <tr>
                  <td colSpan={CONTRACT_COLUMNS.filter((col) => isColumnVisible(col.field)).length + 1} className="p-6 text-center text-slate-500 italic">
                    {contracts.length === 0 ? 'Chưa có khế ước nào.' : 'Không tìm thấy khế ước phù hợp.'}
                  </td>
                </tr>
              )}
              {sortedContracts.map((c) => {
                const open = expanded === c.loan_id;
                const currentTab = activeSubTab[c.loan_id] || 'cashflow';
                const origAmt = Number(c.original_principal_balance || 0);
                const allocAmt = Number(c.allocated_invoices_amount || 0);
                const diffAmt = origAmt - allocAmt;

                return (
                  <React.Fragment key={c.loan_id}>
                    <tr
                      onClick={() => setExpanded(open ? null : c.loan_id)}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-indigo-50/60 transition-colors ${
                        open ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {open ? <ChevronDown className="w-4 h-4 text-indigo-600" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      {isColumnVisible('bank') && (
                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                          {c.bank_name || c.bank_code}
                        </td>
                      )}
                      {isColumnVisible('contract_number') && (
                        <td className="px-3 py-2 font-mono text-indigo-700 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 group">
                            <span className="font-semibold">{c.contract_number}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyContract(e, c.contract_number)}
                              className="p-1 rounded hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors opacity-70 group-hover:opacity-100 focus:opacity-100"
                              title={copiedContract === c.contract_number ? 'Đã sao chép!' : 'Sao chép số khế ước'}
                              aria-label={`Sao chép số khế ước ${c.contract_number}`}
                            >
                              {copiedContract === c.contract_number ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('borrower_name') && (
                        <td className="px-3 py-2 text-slate-800 max-w-xs truncate" title={c.borrower_name || ''}>
                          {c.borrower_name || '—'}
                        </td>
                      )}
                      {isColumnVisible('original_principal_balance') && (
                        <td className="px-3 py-2 text-right font-mono font-medium">{fmtMoney(c.original_principal_balance)}</td>
                      )}
                      {isColumnVisible('total_principal_paid') && (
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmtMoney(c.total_principal_paid)}</td>
                      )}
                      {isColumnVisible('current_principal_balance') && (
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {fmtMoney(c.current_principal_balance)}
                        </td>
                      )}
                      {isColumnVisible('interest_rate') && (
                        <td className="px-3 py-2 text-right font-mono">{Number(c.interest_rate).toFixed(2)}%</td>
                      )}
                      {isColumnVisible('estimated_interest') && (
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtMoney(c.estimated_interest)}</td>
                      )}
                      {isColumnVisible('total_interest_paid') && (
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmtMoney(c.total_interest_paid)}</td>
                      )}
                      {isColumnVisible('disbursement_date') && (
                        <td className="px-3 py-2 text-center font-mono whitespace-nowrap">{fmtDate(c.disbursement_date)}</td>
                      )}
                      {isColumnVisible('maturity_date') && (
                        <td className="px-3 py-2 text-center font-mono whitespace-nowrap">{fmtDate(c.maturity_date)}</td>
                      )}

                      {/* Cột Tình Trạng Hóa Đơn */}
                      {isColumnVisible('invoice_status') && (
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {origAmt > 0 && Math.abs(allocAmt - origAmt) < 0.01 ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                              title={`Đã gán đủ hóa đơn nhận nợ: ${fmtMoney(allocAmt)} / ${fmtMoney(origAmt)} đ`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đủ hóa đơn
                            </span>
                          ) : allocAmt < origAmt ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs"
                              title={`Thiếu hóa đơn: Đã gán ${fmtMoney(allocAmt)} đ / ${fmtMoney(origAmt)} đ (Còn thiếu: ${fmtMoney(diffAmt)} đ)`}
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Thiếu hóa đơn
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs"
                              title={`Thừa hóa đơn: Đã gán ${fmtMoney(allocAmt)} đ / ${fmtMoney(origAmt)} đ (Thừa: ${fmtMoney(Math.abs(diffAmt))} đ)`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-blue-600" /> Thừa hóa đơn
                            </span>
                          )}
                        </td>
                      )}

                      {/* Action buttons */}
                      {isColumnVisible('actions') && (
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleOpenEdit(e, c)}
                              className="p-1.5 rounded-lg text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 transition-colors cursor-pointer"
                              title="Chỉnh sửa trực tiếp thông tin khế ước"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenInvoiceReconcile(e, c)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 transition-colors cursor-pointer"
                              title="Đối soát số tiền nhận nợ với hóa đơn"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* VÙNG MỞ RỘNG CỦA KHẾ ƯỚC (SUB-TABS) */}
                    {open && (
                      <tr className="bg-slate-50/80 border-t border-indigo-100">
                        <td colSpan={CONTRACT_COLUMNS.filter((col) => isColumnVisible(col.field)).length + 1} className="p-4">
                          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
                            {/* Navigation Bar giữa 2 tab con */}
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'cashflow' }))}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
                                    currentTab === 'cashflow'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>Dòng tiền trả nợ đã đối soát ({c.repayment_count})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'invoices' }))}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
                                    currentTab === 'invoices'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  <span>
                                    Hóa đơn nhận nợ ({c.allocated_invoices_count || 0})
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'dossier' }))}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
                                    currentTab === 'dossier'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  <span>Hồ sơ khế ước ({c.dossier_count || 0})</span>
                                </button>
                              </div>

                              <div className="flex items-center space-x-2 text-xs">
                                <span className="text-slate-500">Trạng thái:</span>
                                <span
                                  className={`font-semibold px-2 py-0.5 rounded-full ${
                                    Number(c.current_principal_balance) > 0
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {Number(c.current_principal_balance) > 0 ? 'Đang vay' : 'Đã tất toán'}
                                </span>
                              </div>
                            </div>

                            {/* Nội dung Tab */}
                            {currentTab === 'cashflow' && <CashflowTable loanId={c.loan_id} />}
                            {currentTab === 'invoices' && (
                              <InvoiceReconciliationPanel
                                contract={c}
                                onRefreshContract={fetchContracts}
                              />
                            )}
                            {currentTab === 'dossier' && (
                              <DisbursementDossierPanel
                                contract={c}
                                onRefreshContract={fetchContracts}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Sửa Khế Ước */}
      <EditContractModal
        contract={editingContract}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingContract(null);
        }}
        onSuccess={fetchContracts}
      />
    </div>
  );
};
