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

  FolderArchive,

  Download,

  UploadCloud,

  FileCheck2,

  Sparkles,

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

  is_manual?: boolean;

  invoice_number?: string;

  invoice_series?: string;

  seller_name?: string;

  total_invoice_amount?: number | string;

  remaining_amount?: number | string;

  created_at?: string;

}



interface DossierUnallocatedInvoiceItem {

  invoice_id: number;

  invoice_number?: string;

  invoice_series?: string;

  invoice_date?: string | null;

  seller_name?: string;

  total_invoice_amount?: number | string;

  remaining_amount?: number | string;

  locked_bank_code?: string | null;

  status?: string;

  reason_code?: 'BANK_MISMATCH' | 'EXHAUSTED_LIMIT' | 'PRINCIPAL_FULFILLED' | 'UNALLOCATED' | string;

  reason_message?: string;

  allocated_to_contracts?: string[];

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

  dossier_unallocated_invoices?: DossierUnallocatedInvoiceItem[];

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

// COMPONENT 3 & 4 GỘP: BỘ HỒ SƠ GIẢI NGÂN & ĐỐI SOÁT HÓA ĐƠN NHẬN NỢ

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



const DOSSIER_CUSTOM_CATEGORIES_KEY = 'dossier_custom_categories';

const DOSSIER_CUSTOM_CATEGORIES_LEGACY_KEY = 'custom_dossier_categories';



export interface CustomDocCategory {

  key: string;

  label: string;

  isCustom?: boolean;

}



const loadStoredCustomCategories = (): CustomDocCategory[] => {

  const map = new Map<string, CustomDocCategory>();



  try {

    const raw = localStorage.getItem(DOSSIER_CUSTOM_CATEGORIES_KEY);

    if (raw) {

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {

        parsed.forEach((c) => {

          if (c && (c.key || c.label)) {

            const key = String(c.key || c.label).trim();

            const label = String(c.label || c.key).trim();

            if (key) map.set(key, { key, label, isCustom: true });

          }

        });

      }

    }

  } catch (e) {}



  try {

    const rawLegacy = localStorage.getItem(DOSSIER_CUSTOM_CATEGORIES_LEGACY_KEY);

    if (rawLegacy) {

      const parsed = JSON.parse(rawLegacy);

      if (Array.isArray(parsed)) {

        parsed.forEach((c) => {

          if (c && (c.key || c.label)) {

            const key = String(c.key || c.label).trim();

            const label = String(c.shortLabel || c.label || c.key).trim();

            if (key && !map.has(key)) map.set(key, { key, label, isCustom: true });

          }

        });

      }

    }

  } catch (e) {}



  return Array.from(map.values());

};



const saveStoredCustomCategories = (cats: CustomDocCategory[]) => {

  try {

    localStorage.setItem(DOSSIER_CUSTOM_CATEGORIES_KEY, JSON.stringify(cats));

    const legacyFormat = cats.map((c) => ({

      key: c.key,

      label: c.label,

      shortLabel: c.label,

      badgeLabel: c.label,

      description: `Chứng từ ${c.label}`,

      examples: `${c.key.toLowerCase()}.pdf`,

      colorName: 'purple',

      isCustom: true,

    }));

    localStorage.setItem(DOSSIER_CUSTOM_CATEGORIES_LEGACY_KEY, JSON.stringify(legacyFormat));

    window.dispatchEvent(new CustomEvent('dossier_custom_categories_changed'));

  } catch (e) {

    console.warn('Lỗi khi lưu custom categories vào localStorage:', e);

  }

};



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

  // ==========================================

  // 1. STATE ĐỐI SOÁT HÓA ĐƠN & NHẬN NỢ

  // ==========================================

  const [data, setData] = useState<LoanAllocatedInvoicesData | null>(null);

  const [loadingAllocations, setLoadingAllocations] = useState(true);

  const [errorAllocations, setErrorAllocations] = useState<string | null>(null);

  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const [saving, setSaving] = useState(false);

  // Lưu trữ số tiền chỉnh sửa theo invoice_id để thống nhất cả hóa đơn đã gán và hóa đơn thừa/chưa gán

  const [editingAmounts, setEditingAmounts] = useState<Record<number, string>>({});

  const [activeSellerTab, setActiveSellerTab] = useState<string>('ALL');



  // ==========================================

  // 2. STATE BỘ HỒ SƠ GIẢI NGÂN (CHỨNG TỪ TẢI LÊN)

  // ==========================================

  const [docs, setDocs] = useState<DisbursementDocItem[]>([]);

  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);

  const [errorDocs, setErrorDocs] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const [extraCategories, setExtraCategories] = useState<string[]>([]);

  const [customCategories, setCustomCategories] = useState<CustomDocCategory[]>(loadStoredCustomCategories);

  const [newCategoryName, setNewCategoryName] = useState<string>('');

  const [isAddMenuOpen, setIsAddMenuOpen] = useState<boolean>(false);

  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);



  // Kéo thả & Upload inline

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [uploading, setUploading] = useState<boolean>(false);

  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string }>({

    current: 0,

    total: 0,

    fileName: '',

  });

  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // State chuyên biệt cho Nạp hóa đơn & Quản lý tệp hóa đơn đã lưu trữ
  const [isDraggingInvoice, setIsDraggingInvoice] = useState<boolean>(false);
  const [uploadingInvoice, setUploadingInvoice] = useState<boolean>(false);
  const [invoiceUploadProgress, setInvoiceUploadProgress] = useState<{ current: number; total: number; fileName: string }>({
    current: 0,
    total: 0,
    fileName: '',
  });
  const [invoiceUploadError, setInvoiceUploadError] = useState<string | null>(null);
  const [isInvoiceDocsOpen, setIsInvoiceDocsOpen] = useState<boolean>(true);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);

  // Phân tách tệp tin hóa đơn và các chứng từ giải ngân khác
  const invoiceDocs = useMemo(() => docs.filter((d) => d.document_type === 'INVOICE'), [docs]);
  const otherDocs = useMemo(() => docs.filter((d) => d.document_type !== 'INVOICE'), [docs]);



  // Đóng/Mở các khối (mặc định mở cả 2 để xem toàn cảnh)

  const [isInvoicesSectionOpen, setIsInvoicesSectionOpen] = useState<boolean>(true);

  const [isDocsSectionOpen, setIsDocsSectionOpen] = useState<boolean>(true);



  // Lắng nghe sự kiện đồng bộ từ các panel khác hoặc tab khác

  useEffect(() => {

    const handleUpdate = () => {

      setCustomCategories(loadStoredCustomCategories());

    };

    window.addEventListener('dossier_custom_categories_changed', handleUpdate);

    window.addEventListener('storage', handleUpdate);

    return () => {

      window.removeEventListener('dossier_custom_categories_changed', handleUpdate);

      window.removeEventListener('storage', handleUpdate);

    };

  }, []);



  // Lấy các loại chứng từ đã từng lưu trên server

  useEffect(() => {

    api

      .get<string[]>('/loans/dossier/document-types')

      .then((res) => {

        if (Array.isArray(res.data) && res.data.length > 0) {

          const sysKeys = new Set(ALL_CATEGORY_OPTIONS.map((c) => c.key));

          const currentStored = loadStoredCustomCategories();

          const currentMap = new Map<string, CustomDocCategory>();

          currentStored.forEach((c) => currentMap.set(c.key, c));



          let changed = false;

          res.data.forEach((t) => {

            const clean = (t || '').trim();

            if (clean && !sysKeys.has(clean) && !currentMap.has(clean)) {

              currentMap.set(clean, { key: clean, label: clean, isCustom: true });

              changed = true;

            }

          });



          if (changed) {

            const nextList = Array.from(currentMap.values());

            setCustomCategories(nextList);

            saveStoredCustomCategories(nextList);

          }

        }

      })

      .catch(() => {});

  }, []);



  const fetchAllocations = () => {

    setLoadingAllocations(true);

    setErrorAllocations(null);

    api

      .get(`/loans/${contract.loan_id}/allocated-invoices`)

      .then((res) => {

        setData(res.data);

        setEditingAmounts({});

      })

      .catch((err) => setErrorAllocations(err?.response?.data?.detail || 'Không tải được danh sách đối soát hóa đơn.'))

      .finally(() => setLoadingAllocations(false));

  };



  const fetchDocs = () => {

    setLoadingDocs(true);

    setErrorDocs(null);

    api

      .get(`/loans/${contract.loan_id}/dossier`)

      .then((res) => {

        setDocs(res.data ?? []);

      })

      .catch((err) => {

        setErrorDocs(err?.response?.data?.detail || 'Không tải được bộ hồ sơ giải ngân.');

      })

      .finally(() => setLoadingDocs(false));

  };



  useEffect(() => {

    fetchAllocations();

    fetchDocs();

  }, [contract.loan_id]);



  // Thay đổi số tiền theo invoice_id

  const handleAmountChange = (invoiceId: number, rawInput: string) => {

    const digits = rawInput.replace(/[^\d]/g, '');

    setEditingAmounts((prev) => ({

      ...prev,

      [invoiceId]: digits,

    }));

  };



  // 1. Danh sách hóa đơn đã gán trên server (có tính toán chỉnh sửa tay)

  const liveAllocations = useMemo(() => {

    if (!data?.allocations) return [];

    return data.allocations.map((item) => {

      const isEdited = editingAmounts[item.invoice_id] !== undefined;

      const currentAmt = isEdited

        ? (editingAmounts[item.invoice_id] === '' ? 0 : Number(editingAmounts[item.invoice_id]))

        : Number(item.allocated_amount);

      return {

        ...item,

        effectiveAmount: currentAmt,

        isEdited,

      };

    });

  }, [data?.allocations, editingAmounts]);



  // 2. Danh sách hóa đơn chưa gán / hóa đơn thừa trong hồ sơ (cho phép chỉnh sửa trực tiếp, mặc định 0 đ)

  const liveUnallocated = useMemo(() => {

    if (!data?.dossier_unallocated_invoices) return [];

    return data.dossier_unallocated_invoices.map((uInv) => {

      const isEdited = editingAmounts[uInv.invoice_id] !== undefined;

      const currentAmt = isEdited

        ? (editingAmounts[uInv.invoice_id] === '' ? 0 : Number(editingAmounts[uInv.invoice_id]))

        : 0;

      return {

        ...uInv,

        effectiveAmount: currentAmt,

        isEdited,

      };

    });

  }, [data?.dossier_unallocated_invoices, editingAmounts]);



  // Có thay đổi chưa lưu

  const hasChanges = useMemo(() => {

    const allocChanged = (data?.allocations || []).some((item) => {

      if (editingAmounts[item.invoice_id] === undefined) return false;

      const orig = Math.round(Number(item.allocated_amount));

      const edited = editingAmounts[item.invoice_id] === '' ? 0 : Number(editingAmounts[item.invoice_id]);

      return orig !== edited;

    });

    const unallocChanged = (data?.dossier_unallocated_invoices || []).some((uInv) => {

      if (editingAmounts[uInv.invoice_id] === undefined) return false;

      const edited = editingAmounts[uInv.invoice_id] === '' ? 0 : Number(editingAmounts[uInv.invoice_id]);

      return edited > 0;

    });

    return allocChanged || unallocChanged;

  }, [data?.allocations, data?.dossier_unallocated_invoices, editingAmounts]);



  // Phân nhóm hóa đơn theo Đơn vị bán (Nhà cung cấp)

  interface SellerGroup {

    sellerName: string;

    totalInvoices: number;

    allocatedCount: number;

    unallocatedCount: number;

    totalInvoiceAmount: number;

    allocatedAmount: number;

    remainingAmount: number;

    hasUnsavedEdits: boolean;

  }



  const sellerGroups = useMemo<SellerGroup[]>(() => {

    const map = new Map<string, SellerGroup>();



    liveAllocations.forEach((item) => {

      const seller = (item.seller_name || '').trim() || 'Chưa xác định đơn vị bán';

      if (!map.has(seller)) {

        map.set(seller, {

          sellerName: seller,

          totalInvoices: 0,

          allocatedCount: 0,

          unallocatedCount: 0,

          totalInvoiceAmount: 0,

          allocatedAmount: 0,

          remainingAmount: 0,

          hasUnsavedEdits: false,

        });

      }

      const g = map.get(seller)!;

      g.totalInvoices += 1;

      if (item.effectiveAmount > 0) {

        g.allocatedCount += 1;

      } else {

        g.unallocatedCount += 1;

      }

      g.totalInvoiceAmount += Number(item.total_invoice_amount) || 0;

      g.allocatedAmount += item.effectiveAmount;

      g.remainingAmount += Number(item.remaining_amount) || 0;

      if (item.isEdited) {

        g.hasUnsavedEdits = true;

      }

    });



    liveUnallocated.forEach((uInv) => {

      const seller = (uInv.seller_name || '').trim() || 'Chưa xác định đơn vị bán';

      if (!map.has(seller)) {

        map.set(seller, {

          sellerName: seller,

          totalInvoices: 0,

          allocatedCount: 0,

          unallocatedCount: 0,

          totalInvoiceAmount: 0,

          allocatedAmount: 0,

          remainingAmount: 0,

          hasUnsavedEdits: false,

        });

      }

      const g = map.get(seller)!;

      g.totalInvoices += 1;

      if (uInv.effectiveAmount > 0) {

        g.allocatedCount += 1;

      } else {

        g.unallocatedCount += 1;

      }

      g.totalInvoiceAmount += Number(uInv.total_invoice_amount) || 0;

      g.allocatedAmount += uInv.effectiveAmount;

      g.remainingAmount += Number(uInv.remaining_amount) || 0;

      if (uInv.isEdited) {

        g.hasUnsavedEdits = true;

      }

    });



    return Array.from(map.values()).sort((a, b) => b.totalInvoices - a.totalInvoices);

  }, [liveAllocations, liveUnallocated]);



  // Bộ lọc hiển thị theo đơn vị bán

  const displayedAllocations = useMemo(() => {

    if (activeSellerTab === 'ALL') return liveAllocations;

    return liveAllocations.filter(

      (a) => ((a.seller_name || '').trim() || 'Chưa xác định đơn vị bán') === activeSellerTab

    );

  }, [liveAllocations, activeSellerTab]);



  const displayedUnallocated = useMemo(() => {

    if (activeSellerTab === 'ALL') return liveUnallocated;

    return liveUnallocated.filter(

      (u) => ((u.seller_name || '').trim() || 'Chưa xác định đơn vị bán') === activeSellerTab

    );

  }, [liveUnallocated, activeSellerTab]);



  const displayedTotalInvoiceAmount = useMemo(() => {

    const allocSum = displayedAllocations.reduce((sum, item) => sum + (Number(item.total_invoice_amount) || 0), 0);

    const unallocSum = displayedUnallocated.reduce((sum, item) => sum + (Number(item.total_invoice_amount) || 0), 0);

    return allocSum + unallocSum;

  }, [displayedAllocations, displayedUnallocated]);



  const displayedTotalRemainingAmount = useMemo(() => {

    const allocRem = displayedAllocations.reduce((sum, item) => sum + (Number(item.remaining_amount) || 0), 0);

    const unallocRem = displayedUnallocated.reduce((sum, item) => sum + (Number(item.remaining_amount) || 0), 0);

    return allocRem + unallocRem;

  }, [displayedAllocations, displayedUnallocated]);



  const displayedTotalAllocated = useMemo(() => {

    const allocSum = displayedAllocations.reduce((sum, item) => sum + item.effectiveAmount, 0);

    const unallocSum = displayedUnallocated.reduce((sum, item) => sum + item.effectiveAmount, 0);

    return allocSum + unallocSum;

  }, [displayedAllocations, displayedUnallocated]);



  const originalPrincipal = Number(contract.original_principal_balance || 0);



  // Tổng số tiền nhận nợ trên toàn bộ hóa đơn của khoản vay

  const totalAllocated = useMemo(() => {

    const allocSum = liveAllocations.reduce((sum, item) => sum + item.effectiveAmount, 0);

    const unallocSum = liveUnallocated.reduce((sum, item) => sum + item.effectiveAmount, 0);

    return allocSum + unallocSum;

  }, [liveAllocations, liveUnallocated]);



  const totalInvoiceAmountSum = useMemo(() => {

    const allocSum = liveAllocations.reduce((sum, item) => sum + (Number(item.total_invoice_amount) || 0), 0);

    const unallocSum = liveUnallocated.reduce((sum, item) => sum + (Number(item.total_invoice_amount) || 0), 0);

    return allocSum + unallocSum;

  }, [liveAllocations, liveUnallocated]);



  const totalRemainingAmountSum = useMemo(() => {

    const allocRem = liveAllocations.reduce((sum, item) => sum + (Number(item.remaining_amount) || 0), 0);

    const unallocRem = liveUnallocated.reduce((sum, item) => sum + (Number(item.remaining_amount) || 0), 0);

    return allocRem + unallocRem;

  }, [liveAllocations, liveUnallocated]);



  const diff = originalPrincipal - totalAllocated;

  const isFullySecured = (totalAllocated === originalPrincipal && originalPrincipal > 0);



  // =========================================================================

  // TÙY CHỈNH TỔNG SỐ TIỀN NHẬN NỢ CỦA TỪNG NGƯỜI BÁN (ĐA NGƯỜI BÁN)

  // =========================================================================

  const handleDistributeSellerAmount = (sellerName: string, targetAmount: number) => {

    if (isNaN(targetAmount) || targetAmount < 0) return;



    // Toàn bộ hóa đơn của người bán này

    const sellerAllocInvs = liveAllocations.filter(

      (a) => ((a.seller_name || '').trim() || 'Chưa xác định đơn vị bán') === sellerName

    );

    const sellerUnallocInvs = liveUnallocated.filter(

      (u) => ((u.seller_name || '').trim() || 'Chưa xác định đơn vị bán') === sellerName

    );

    const allSellerInvs = [...sellerAllocInvs, ...sellerUnallocInvs];



    // Tính tổng hạn mức tối đa bên này có thể nhận nợ

    const maxSellerLimit = allSellerInvs.reduce((sum, inv) => {

      const origAlloc = 'allocated_amount' in inv ? Number(inv.allocated_amount) : 0;

      return sum + (Number(inv.remaining_amount) + origAlloc);

    }, 0);



    if (targetAmount > maxSellerLimit) {

      alert(

        `Tổng số tiền nhận nợ (${targetAmount.toLocaleString('vi-VN')} đ) vượt quá tổng hạn mức hóa đơn khả dụng của "${sellerName}" (${maxSellerLimit.toLocaleString('vi-VN')} đ)!`

      );

      return;

    }



    let remainingNeeded = targetAmount;

    const nextEdits = { ...editingAmounts };



    for (const inv of allSellerInvs) {

      // Hóa đơn bị khóa bởi ngân hàng khác thì bỏ qua

      if ('reason_code' in inv && inv.reason_code === 'BANK_MISMATCH') {

        nextEdits[inv.invoice_id] = '0';

        continue;

      }



      const origAlloc = 'allocated_amount' in inv ? Number(inv.allocated_amount) : 0;

      const invMax = Number(inv.remaining_amount) + origAlloc;



      if (remainingNeeded > 0) {

        const take = Math.min(invMax, remainingNeeded);

        nextEdits[inv.invoice_id] = String(Math.round(take));

        remainingNeeded -= take;

      } else {

        // Hóa đơn thừa của người bán này: để 0 đ (vẫn cho phép sửa tay trực tiếp)

        nextEdits[inv.invoice_id] = '0';

      }

    }



    setEditingAmounts(nextEdits);

  };



  // =========================================================================

  // LƯU PHÂN BỔ NHẬN NỢ (RÀNG BUỘC: TỔNG NHẬN NỢ PHẢI BẰNG GỐC VAY)

  // =========================================================================

  const handleSaveAllocations = async () => {

    // Ràng buộc điều kiện: Tổng số tiền nhận nợ bằng tổng giá trị khoản vay

    if (totalAllocated !== originalPrincipal) {

      alert(

        `ĐIỀU KIỆN LƯU BẮT BUỘC:\n\nTổng số tiền nhận nợ các bên (${totalAllocated.toLocaleString('vi-VN')} đ) phải BẰNG ĐÚNG tổng giá trị gốc khoản vay (${originalPrincipal.toLocaleString('vi-VN')} đ)!\n\nHiện đang ${

          diff > 0 ? `thiếu ${diff.toLocaleString('vi-VN')} đ` : `thừa ${Math.abs(diff).toLocaleString('vi-VN')} đ`

        }.\n\nVui lòng tùy chỉnh lại số tiền nhận nợ giữa các bên/hóa đơn sao cho khớp 100% gốc vay trước khi lưu.`

      );

      return;

    }



    const activeAllocations: Array<{ invoice_id: number; allocated_amount: number; notes?: string; is_manual: boolean }> = [];



    // Duyệt qua các hóa đơn đã gán có số tiền > 0

    for (const item of liveAllocations) {

      if (item.effectiveAmount > 0) {

        const maxLimit = Number(item.remaining_amount) + Number(item.allocated_amount);

        if (item.effectiveAmount > maxLimit) {

          alert(`Số tiền nhận nợ (${item.effectiveAmount.toLocaleString('vi-VN')} đ) vượt quá hạn mức tối đa của hóa đơn ${item.invoice_number || ''} (${maxLimit.toLocaleString('vi-VN')} đ)!`);

          return;

        }

        activeAllocations.push({

          invoice_id: item.invoice_id,

          allocated_amount: item.effectiveAmount,

          notes: item.isEdited

            ? (item.notes?.includes('thủ công') ? item.notes : `Điều chỉnh thủ công (${contract.contract_number})`)

            : (item.notes || (item.is_manual ? 'Gán thủ công' : undefined)),

          is_manual: true,

        });

      }

    }



    // Duyệt qua các hóa đơn ban đầu chưa gán nhưng được người dùng nhập số tiền > 0

    for (const uInv of liveUnallocated) {

      if (uInv.effectiveAmount > 0) {

        const maxLimit = Number(uInv.remaining_amount);

        if (uInv.effectiveAmount > maxLimit) {

          alert(`Số tiền nhận nợ (${uInv.effectiveAmount.toLocaleString('vi-VN')} đ) vượt quá hạn mức khả dụng của hóa đơn ${uInv.invoice_number || ''} (${maxLimit.toLocaleString('vi-VN')} đ)!`);

          return;

        }

        activeAllocations.push({

          invoice_id: uInv.invoice_id,

          allocated_amount: uInv.effectiveAmount,

          notes: `Gán từ hóa đơn thừa trong hồ sơ (${contract.contract_number})`,

          is_manual: true,

        });

      }

    }



    if (activeAllocations.length === 0) {

      alert('Vui lòng phân bổ số tiền nhận nợ cho ít nhất một hóa đơn.');

      return;

    }



    setSaving(true);

    try {

      const payload = {

        allocations: activeAllocations,

      };

      const res = await api.post(`/loans/${contract.loan_id}/allocate-invoices?strict_principal_check=true`, payload);

      setData(res.data);

      setEditingAmounts({});

      fetchDocs();

      onRefreshContract();

      alert('Đã lưu thành công số tiền nhận nợ! Đã khớp chính xác 100% giá trị khoản vay.');

    } catch (err: any) {

      alert(err?.response?.data?.detail || 'Lỗi khi lưu số tiền nhận nợ.');

    } finally {

      setSaving(false);

    }

  };



  // Tự động cuốn chiếu

  const handleAutoSync = async (force: boolean = false) => {

    if (hasChanges) {

      const confirmSaveFirst = window.confirm(

        'Bạn đang có thay đổi số tiền nhận nợ chưa lưu.\n\nHệ thống sẽ ƯU TIÊN LƯU các thay đổi thủ công của bạn trước, sau đó mới đồng bộ cuốn chiếu phần còn lại.\n\nBấm OK để lưu và tiếp tục đồng bộ.'

      );

      if (!confirmSaveFirst) return;

    }



    setSyncing(true);

    try {

      const res = await api.post(`/loans/${contract.loan_id}/auto-sync-dossier-invoices`, null, {

        params: { force_recalculate: force },

      });

      setData(res.data);

      setEditingAmounts({});

      fetchDocs();

      onRefreshContract();

    } catch (err: any) {

      alert(err?.response?.data?.detail || 'Lỗi khi đồng bộ cuốn chiếu hóa đơn từ hồ sơ.');

    } finally {

      setSyncing(false);

    }

  };



  // Thao tác với Dossier Docs

  const handleDownloadDoc = async (doc: DisbursementDocItem) => {

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



  const handleDeleteDoc = async (docId: number) => {

    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;

    setDeletingDocId(docId);

    try {

      await api.delete(`/loans/dossier/${docId}`);

      fetchDocs();

      fetchAllocations();

      onRefreshContract();

    } catch (err: any) {

      alert(err?.response?.data?.detail || 'Lỗi khi xóa tài liệu.');

    } finally {

      setDeletingDocId(null);

    }

  };



  // Thống kê phân loại hồ sơ

  const catCounts = useMemo(() => {

    const map: Record<string, number> = { CONTRACT: 0, DEBT_NOTE: 0, INVOICE: 0, COLLATERAL: 0, DISBURSEMENT_RECORD: 0, OTHER: 0 };

    docs.forEach((d) => {

      const t = d.document_type || 'OTHER';

      map[t] = (map[t] || 0) + 1;

    });

    return map;

  }, [docs]);



  const allKnownCategories = useMemo(() => {

    const map = new Map<string, { key: string; label: string; isCustom?: boolean }>();

    ALL_CATEGORY_OPTIONS.forEach((c) => map.set(c.key, { ...c, isCustom: false }));

    customCategories.forEach((c) => {

      if (!map.has(c.key)) {

        map.set(c.key, { key: c.key, label: c.label || c.key, isCustom: true });

      }

    });

    docs.forEach((d) => {

      if (d.document_type && !map.has(d.document_type)) {

        map.set(d.document_type, { key: d.document_type, label: d.document_type, isCustom: true });

      }

    });

    return Array.from(map.values());

  }, [customCategories, docs]);



  const activeCategoryTabs = useMemo(() => {

    const baseKeys = ['DEBT_NOTE'];

    const existingWithFiles = Object.keys(catCounts).filter((k) => (catCounts[k] || 0) > 0 && !baseKeys.includes(k) && k !== 'INVOICE');

    const merged = Array.from(new Set([...baseKeys, ...existingWithFiles, ...extraCategories]));

    return allKnownCategories.filter((c) => merged.includes(c.key) && c.key !== 'INVOICE');

  }, [allKnownCategories, catCounts, extraCategories]);



  const remainingAddOptions = useMemo(() => {

    const activeKeys = new Set(activeCategoryTabs.map((c) => c.key));

    return allKnownCategories.filter((c) => !activeKeys.has(c.key));

  }, [allKnownCategories, activeCategoryTabs]);



  const savedCustomOptions = useMemo(() => {

    return remainingAddOptions.filter((c) => c.isCustom);

  }, [remainingAddOptions]);



  const standardRemainingOptions = useMemo(() => {

    return remainingAddOptions.filter((c) => !c.isCustom);

  }, [remainingAddOptions]);



  const filteredDocs = useMemo(() => {

    if (filterCategory === 'ALL') return otherDocs;

    return otherDocs.filter((d) => d.document_type === filterCategory);

  }, [docs, filterCategory]);



  const targetCategoryLabel = useMemo(() => {

    if (filterCategory === 'ALL') return 'Tự động nhận diện (Khế ước nhận nợ / Hóa đơn)';

    const found = allKnownCategories.find((c) => c.key === filterCategory);

    return found ? found.label : filterCategory;

  }, [allKnownCategories, filterCategory]);



  const handleAddNewCategory = () => {

    const trimmed = newCategoryName.trim();

    if (!trimmed) return;

    const existing = allKnownCategories.find(

      (c) => c.label.toLowerCase() === trimmed.toLowerCase() || c.key.toLowerCase() === trimmed.toLowerCase()

    );

    const categoryKey = existing ? existing.key : trimmed;

    const categoryLabel = existing ? existing.label : trimmed;



    if (!existing || existing.isCustom) {

      const currentStored = loadStoredCustomCategories();

      if (!currentStored.some((c) => c.key.toLowerCase() === categoryKey.toLowerCase())) {

        const nextCustom = [...currentStored, { key: categoryKey, label: categoryLabel, isCustom: true }];

        setCustomCategories(nextCustom);

        saveStoredCustomCategories(nextCustom);

      }

    }



    setExtraCategories((prev) => Array.from(new Set([...prev, categoryKey])));

    setFilterCategory(categoryKey);

    setNewCategoryName('');

    setIsAddMenuOpen(false);

  };



  const handleDeleteCustomCategory = (key: string, e: React.MouseEvent) => {

    e.stopPropagation();

    const target = customCategories.find((c) => c.key === key);

    if (!window.confirm(`Bạn có chắc chắn muốn xóa loại chứng từ "${target?.label || key}" khỏi danh mục gợi ý?`)) {

      return;

    }

    const nextCustom = customCategories.filter((c) => c.key !== key);

    setCustomCategories(nextCustom);

    saveStoredCustomCategories(nextCustom);

  };



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

    fetchAllocations();

    onRefreshContract();

  };



  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {

    e.preventDefault();

    e.stopPropagation();

    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

      handleFiles(e.dataTransfer.files);

    }

  };



  // Nạp chuyên biệt hóa đơn XML/PDF vào hồ sơ giải ngân
  const handleInvoiceUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploadingInvoice(true);
    setInvoiceUploadError(null);
    const fileArray = Array.from(files);
    setInvoiceUploadProgress({ current: 0, total: fileArray.length, fileName: fileArray[0].name });

    let successCount = 0;
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setInvoiceUploadProgress({ current: i + 1, total: fileArray.length, fileName: file.name });
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('document_type', 'INVOICE');
        await api.post(`/loans/${contract.loan_id}/dossier/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch (err: any) {
        console.error('Lỗi khi nạp hóa đơn', file.name, err);
        setInvoiceUploadError(err?.response?.data?.detail || `Lỗi khi nạp file ${file.name}`);
      }
    }

    setUploadingInvoice(false);
    if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    fetchDocs();
    fetchAllocations();
    onRefreshContract();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    if (e.target.files && e.target.files.length > 0) {

      handleFiles(e.target.files);

    }

  };



  return (

    <div className="space-y-4">

      {/* ======================================================== */}

      {/* 1. THẺ KPI ĐỐI SOÁT BẢO ĐẢM & NHẬN NỢ (CHỨC NĂNG HÓA ĐƠN) */}

      {/* ======================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">

        {/* Card 1: Gốc nhận nợ khế ước */}

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">

          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gốc nhận nợ khế ước</div>

          <div className="text-base font-bold text-slate-900 mt-1 font-mono">{fmtMoney(originalPrincipal)} đ</div>

          <div className="text-[10px] text-slate-400 mt-0.5">Số tiền vay giải ngân ban đầu</div>

        </div>



        {/* Card 2: Hóa đơn đã gán bảo đảm */}

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">

          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hóa đơn đã gán bảo đảm</div>

          <div className="text-base font-bold text-indigo-700 mt-1 font-mono">{fmtMoney(totalAllocated)} đ</div>

          <div className="text-[10px] text-indigo-500 mt-0.5">

            {liveAllocations.filter((a) => a.effectiveAmount > 0).length + liveUnallocated.filter((u) => u.effectiveAmount > 0).length}/

            {liveAllocations.length + liveUnallocated.length} hóa đơn trong hồ sơ đã gán

          </div>

        </div>



        {/* Card 3: Chênh lệch bảo đảm */}

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">

          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chênh lệch bảo đảm</div>

          <div

            className={`text-base font-bold mt-1 font-mono ${

              diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-rose-700'

            }`}

          >

            {diff === 0 ? '0 đ (Khớp 100%)' : diff > 0 ? `Thiếu ${fmtMoney(diff)} đ` : `Thừa ${fmtMoney(Math.abs(diff))} đ`}

          </div>

          <div className="text-[10px] text-slate-400 mt-0.5">

            {diff === 0

              ? 'Đã đủ 100% chứng từ nhận nợ (Có thể lưu)'

              : diff > 0

              ? 'Chưa bằng gốc vay (Cần bổ sung thêm)'

              : 'Hóa đơn vượt quá giá trị khoản vay'}

          </div>

        </div>



        {/* Card 4: Trạng thái & Các nút thao tác nghiệp vụ */}

        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">

          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trạng thái bảo đảm</div>

          <div className="mt-1">

            {isFullySecured ? (

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">

                <CheckCircle2 className="w-3.5 h-3.5" /> Khớp 100% Bảo Đảm

              </span>

            ) : totalAllocated > 0 ? (

              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${

                diff > 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300'

              }`}>

                <AlertCircle className="w-3.5 h-3.5" /> {diff > 0 ? 'Chưa Đủ Gốc Vay' : 'Vượt Quá Gốc Vay'}

              </span>

            ) : (

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">

                <HelpCircle className="w-3.5 h-3.5" /> Chưa Gán Hóa Đơn

              </span>

            )}

          </div>

          <div className="text-[10px] text-slate-400 mt-1">

            {isFullySecured

              ? 'Đã đủ 100% chứng từ nhận nợ'

              : diff > 0

              ? `Cần thêm ${fmtMoney(diff)} đ để đủ gốc vay`

              : totalAllocated > 0

              ? `Vượt quá gốc vay ${fmtMoney(Math.abs(diff))} đ`

              : 'Chưa có hóa đơn nào được gán'}

          </div>

        </div>

      </div>



      {/* ======================================================== */}

      {/* 2. TÙY CHỈNH TỔNG SỐ TIỀN NHẬN NỢ CHO TỪNG BÊN (ĐA NGƯỜI BÁN) */}

      {/* ======================================================== */}

      {sellerGroups.length >= 2 && (

        <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-sky-50/70 border-2 border-indigo-200 rounded-xl p-3.5 shadow-2xs space-y-3">

          <div className="flex items-center justify-between flex-wrap gap-2">

            <div className="flex items-center gap-2">

              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">

                <Building2 className="w-4 h-4" />

              </div>

              <div>

                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">

                  <span>Phân bổ số tiền nhận nợ theo từng Người bán ({sellerGroups.length} đơn vị bán)</span>

                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700">

                    Đa người bán

                  </span>

                </div>

                <div className="text-[11px] text-slate-500">

                  Tùy chỉnh số tiền nhận nợ mỗi bên sao cho tổng các bên bằng đúng tổng giá trị khoản vay ({fmtMoney(originalPrincipal)} đ). Hóa đơn thừa để 0 đ và vẫn cho phép sửa tay.

                </div>

              </div>

            </div>



            {/* Trạng thái cân bằng tổng các bên */}

            <div>

              {diff === 0 ? (

                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">

                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Khớp 100% Gốc Vay (Đủ điều kiện lưu)

                </span>

              ) : diff > 0 ? (

                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">

                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Còn thiếu {fmtMoney(diff)} đ để bằng gốc vay

                </span>

              ) : (

                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">

                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Vượt gốc vay {fmtMoney(Math.abs(diff))} đ

                </span>

              )}

            </div>

          </div>



          {/* Danh sách từng Người bán với ô nhập tùy chỉnh số tiền nhận nợ */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">

            {sellerGroups.map((group) => {

              const otherSellersAlloc = totalAllocated - group.allocatedAmount;

              const neededForThisSeller = originalPrincipal - otherSellersAlloc;

              const percentOfPrincipal = originalPrincipal > 0 ? (group.allocatedAmount / originalPrincipal) * 100 : 0;



              return (

                <div

                  key={group.sellerName}

                  className="bg-white border border-indigo-100 rounded-xl p-3 shadow-xs space-y-2 hover:border-indigo-300 transition-colors"

                >

                  <div className="flex items-start justify-between gap-2">

                    <div className="min-w-0">

                      <div className="text-xs font-bold text-slate-800 truncate" title={group.sellerName}>

                        {group.sellerName}

                      </div>

                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">

                        <span>{group.totalInvoices} HĐ trong hồ sơ</span>

                        <span>•</span>

                        <span>Tổng HĐ: <strong>{fmtMoney(group.totalInvoiceAmount)} đ</strong></span>

                      </div>

                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">

                      {percentOfPrincipal.toFixed(1)}% gốc vay

                    </span>

                  </div>



                  {/* Ô nhập tùy chỉnh số tiền nhận nợ cho Người bán này */}

                  <div className="space-y-1">

                    <div className="flex items-center justify-between text-[11px]">

                      <span className="font-semibold text-slate-700">Tổng nhận nợ bên này:</span>

                      <span className="font-mono font-bold text-indigo-700 text-xs">

                        {fmtMoney(group.allocatedAmount)} đ

                      </span>

                    </div>



                    <div className="flex items-center gap-1.5">

                      <div className="relative flex-1">

                        <input

                          type="text"

                          placeholder="Nhập số tiền muốn nhận nợ..."

                          defaultValue={group.allocatedAmount > 0 ? group.allocatedAmount.toLocaleString('vi-VN') : ''}

                          key={`${group.sellerName}-${group.allocatedAmount}`}

                          onKeyDown={(e) => {

                            if (e.key === 'Enter') {

                              e.preventDefault();

                              const val = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');

                              handleDistributeSellerAmount(group.sellerName, val ? Number(val) : 0);

                            }

                          }}

                          onBlur={(e) => {

                            const val = e.target.value.replace(/[^\d]/g, '');

                            if (val !== '' && Number(val) !== group.allocatedAmount) {

                              handleDistributeSellerAmount(group.sellerName, Number(val));

                            }

                          }}

                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"

                        />

                      </div>



                      {/* Nút hành động nhanh */}

                      {neededForThisSeller > 0 && neededForThisSeller !== group.allocatedAmount && (

                        <button

                          type="button"

                          onClick={() => handleDistributeSellerAmount(group.sellerName, neededForThisSeller)}

                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"

                          title={`Lấy phần còn thiếu (${fmtMoney(neededForThisSeller)} đ) để tổng vừa tròn 100% gốc vay`}

                        >

                          Lấy số còn thiếu

                        </button>

                      )}

                    </div>



                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">

                      <span>Đã phân bổ cho {group.allocatedCount}/{group.totalInvoices} HĐ</span>

                      <div className="flex items-center gap-2">

                        <button

                          type="button"

                          onClick={() => handleDistributeSellerAmount(group.sellerName, group.totalInvoiceAmount)}

                          className="text-indigo-600 hover:underline cursor-pointer font-medium"

                          title="Nhận nợ tối đa toàn bộ hóa đơn bên này"

                        >

                          Tối đa

                        </button>

                        <span>|</span>

                        <button

                          type="button"

                          onClick={() => handleDistributeSellerAmount(group.sellerName, 0)}

                          className="text-rose-600 hover:underline cursor-pointer font-medium"

                          title="Đặt nhận nợ bên này về 0 đ (tất cả thành hóa đơn thừa)"

                        >

                          Về 0 đ

                        </button>

                      </div>

                    </div>

                  </div>

                </div>

              );

            })}

          </div>

        </div>

      )}



      {/* ======================================================== */}

      {/* 3. KHỐI CHÍNH 1: NẠP HÓA ĐƠN & DANH SÁCH HÓA ĐƠN NHẬN NỢ */}

      {/* ======================================================== */}

      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">

        {/* Header khối hóa đơn với nút thu gọn/mở rộng */}

        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs flex-wrap gap-2">

          <div className="flex items-center gap-2 flex-wrap">

            <button

              type="button"

              onClick={() => setIsInvoicesSectionOpen(!isInvoicesSectionOpen)}

              className="font-bold text-slate-800 flex items-center gap-1.5 hover:text-indigo-600 transition-colors cursor-pointer"

            >

              {isInvoicesSectionOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}

              <Receipt className="w-4 h-4 text-indigo-600" />

              <span>

                Hóa đơn giải ngân & Nhận nợ ({liveAllocations.filter((a) => a.effectiveAmount > 0).length + liveUnallocated.filter((u) => u.effectiveAmount > 0).length} đã gán

                {liveAllocations.length + liveUnallocated.length > 0

                  ? ` / ${liveAllocations.length + liveUnallocated.length} hóa đơn trong hồ sơ`

                  : ''}

                )

              </span>

            </button>



            {invoiceDocs.length > 0 && (

              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">

                <FileCheck2 className="w-3 h-3 text-emerald-600" /> {invoiceDocs.length} tệp hóa đơn đã nạp

              </span>

            )}



            {hasChanges && (

              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">

                <AlertCircle className="w-3 h-3 text-amber-600" /> Có thay đổi thủ công chưa lưu

              </span>

            )}

          </div>



          <div className="flex items-center gap-2">

            {hasChanges && (

              <>

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

                  className={`inline-flex items-center gap-1 px-3 py-1 font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer ${

                    isFullySecured

                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 animate-pulse'

                      : 'bg-amber-600 hover:bg-amber-700 text-white'

                  }`}

                  title={isFullySecured ? 'Lưu thay đổi số tiền nhận nợ' : 'Yêu cầu: Tổng số tiền nhận nợ phải bằng đúng gốc vay mới được lưu'}

                >

                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}

                  <span>Lưu thay đổi {isFullySecured ? '(Khớp 100%)' : '(Chưa khớp)'}</span>

                </button>

              </>

            )}

          </div>

        </div>



        {isInvoicesSectionOpen && (

          <div>

            {/* A. GIAO DIỆN NẠP HÓA ĐƠN TRỰC TIẾP (GỘP LÊN TRÊN DANH SÁCH HÓA ĐƠN) */}

            <div className="p-3 bg-slate-50/80 border-b border-slate-200 space-y-2.5">

              {invoiceUploadError && (

                <div className="p-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">

                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />

                  <span>{invoiceUploadError}</span>

                </div>

              )}



              {/* Vùng kéo thả & Nạp nhanh file hóa đơn XML/PDF */}

              <div

                onDragOver={(e) => {

                  e.preventDefault();

                  e.stopPropagation();

                  e.dataTransfer.dropEffect = 'copy';

                  setIsDraggingInvoice(true);

                }}

                onDragLeave={() => setIsDraggingInvoice(false)}

                onDrop={(e) => {

                  e.preventDefault();

                  e.stopPropagation();

                  setIsDraggingInvoice(false);

                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {

                    handleInvoiceUpload(e.dataTransfer.files);

                  }

                }}

                onClick={() => invoiceFileInputRef.current?.click()}

                className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-150 ${

                  isDraggingInvoice

                    ? 'border-indigo-500 bg-indigo-50/90 ring-2 ring-indigo-200 shadow-xs'

                    : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/20'

                }`}

              >

                <input

                  ref={invoiceFileInputRef}

                  type="file"

                  multiple

                  onChange={(e) => {

                    if (e.target.files && e.target.files.length > 0) {

                      handleInvoiceUpload(e.target.files);

                    }

                  }}

                  className="hidden"

                  accept=".xml,.pdf,.zip,.jpg,.jpeg,.png"

                />



                {uploadingInvoice ? (

                  <div className="flex items-center justify-center gap-2 py-1">

                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />

                    <div className="text-xs font-bold text-slate-800">

                      Đang nạp {invoiceUploadProgress.current}/{invoiceUploadProgress.total} hóa đơn: {invoiceUploadProgress.fileName}...

                    </div>

                  </div>

                ) : (

                  <div className="flex items-center justify-between flex-wrap gap-2 px-1">

                    <div className="flex items-center gap-2.5 text-left">

                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">

                        <UploadCloud className="w-4 h-4" />

                      </div>

                      <div>

                        <div className="text-xs font-bold text-slate-800">

                          <span className="text-indigo-600 hover:underline">Nhấn để chọn tệp hóa đơn</span> hoặc kéo và thả file XML / PDF vào đây

                        </div>

                        <div className="text-[10px] text-slate-400">

                          * Hỗ trợ Hóa đơn điện tử XML, PDF, ảnh hoặc tệp ZIP (Tự động nhận diện, bóc tách và phân bổ nhận nợ)

                        </div>

                      </div>

                    </div>



                    <button

                      type="button"

                      onClick={(e) => {

                        e.stopPropagation();

                        invoiceFileInputRef.current?.click();

                      }}

                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"

                    >

                      <Plus className="w-3.5 h-3.5" />

                      <span>Nạp Hóa Đơn Mới</span>

                    </button>

                  </div>

                )}

              </div>



              {/* DANH MỤC CÁC TỆP HÓA ĐƠN ĐÃ LƯU TRỮ (GỘP TỪ PHẦN HỒ SƠ LÊN ĐÂY) */}

              {invoiceDocs.length > 0 && (

                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">

                  <div

                    onClick={() => setIsInvoiceDocsOpen(!isInvoiceDocsOpen)}

                    className="flex items-center justify-between px-3 py-1.5 bg-slate-100/90 hover:bg-slate-100 cursor-pointer text-xs font-semibold text-slate-700 transition-colors"

                  >

                    <div className="flex items-center gap-1.5">

                      {isInvoiceDocsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}

                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />

                      <span>Tệp hóa đơn đã lưu trữ trong hồ sơ ({invoiceDocs.length} tệp tin)</span>

                    </div>

                    <span className="text-[10px] text-indigo-600 hover:underline font-normal">

                      {isInvoiceDocsOpen ? 'Thu gọn danh sách tệp' : 'Xem chi tiết tệp hóa đơn'}

                    </span>

                  </div>



                  {isInvoiceDocsOpen && (

                    <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">

                      {invoiceDocs.map((doc) => {

                        const isXml = doc.file_name.toLowerCase().endsWith('.xml');

                        return (

                          <div key={doc.document_id} className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50/80 text-xs">

                            <div className="flex items-center gap-2 min-w-0 mr-2">

                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${

                                isXml ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-rose-100 text-rose-800 border border-rose-300'

                              }`}>

                                {isXml ? 'XML' : 'PDF'}

                              </span>

                              <span className="font-mono text-slate-800 truncate text-[11px]" title={doc.file_name}>

                                {doc.file_name}

                              </span>

                            </div>



                            <div className="flex items-center gap-3 shrink-0 text-[11px] text-slate-500 font-mono">

                              <span>{doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : '—'}</span>

                              <span className="text-slate-400">{doc.created_at ? new Date(doc.created_at).toLocaleDateString('vi-VN') : '—'}</span>

                              <span className="text-slate-600 max-w-[120px] truncate" title={doc.uploaded_by || ''}>

                                {doc.uploaded_by || '—'}

                              </span>

                              <div className="flex items-center gap-1">

                                <button

                                  type="button"

                                  onClick={() => handleDownloadDoc(doc)}

                                  className="p-1 rounded text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"

                                  title="Tải xuống tệp hóa đơn này"

                                >

                                  <Download className="w-3.5 h-3.5" />

                                </button>

                                <button

                                  type="button"

                                  onClick={() => handleDeleteDoc(doc.document_id)}

                                  className="p-1 rounded text-rose-500 hover:bg-rose-100 transition-colors cursor-pointer"

                                  title="Xóa tệp hóa đơn này khỏi hồ sơ"

                                >

                                  <Trash2 className="w-3.5 h-3.5" />

                                </button>

                              </div>

                            </div>

                          </div>

                        );

                      })}

                    </div>

                  )}

                </div>

              )}

            </div>



            {/* B. TỰ ĐỘNG CHIA TAB NẾU CÓ TRÊN 2 NGƯỜI BÁN (SELLER GROUPS >= 2) */}

            {sellerGroups.length >= 2 ? (

              <div className="bg-slate-50/80 border-b border-slate-200 px-3 pt-2.5 pb-2">

                <div className="flex items-center justify-between mb-2">

                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">

                    <Building2 className="w-4 h-4 text-indigo-600" />

                    <span>Đơn vị bán ({sellerGroups.length} nhà cung cấp - Tự động chia tab):</span>

                  </div>

                  {activeSellerTab !== 'ALL' && (

                    <button

                      type="button"

                      onClick={() => setActiveSellerTab('ALL')}

                      className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold cursor-pointer underline flex items-center gap-1"

                    >

                      <span>Xem tất cả đơn vị bán</span>

                    </button>

                  )}

                </div>



                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">

                  {/* Tab Tất cả */}

                  <button

                    type="button"

                    onClick={() => setActiveSellerTab('ALL')}

                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${

                      activeSellerTab === 'ALL'

                        ? 'bg-indigo-600 text-white shadow-xs'

                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'

                    }`}

                  >

                    <span>Tất cả</span>

                    <span

                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${

                        activeSellerTab === 'ALL' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'

                      }`}

                    >

                      {liveAllocations.length + liveUnallocated.length}

                    </span>

                    {hasChanges && (

                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Có chỉnh sửa chưa lưu" />

                    )}

                  </button>



                  {/* Từng tab cho mỗi Đơn vị bán */}

                  {sellerGroups.map((group) => {

                    const isActive = activeSellerTab === group.sellerName;

                    return (

                      <button

                        key={group.sellerName}

                        type="button"

                        onClick={() => setActiveSellerTab(group.sellerName)}

                        title={group.sellerName}

                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center gap-2 max-w-sm cursor-pointer ${

                          isActive

                            ? 'bg-indigo-600 text-white shadow-xs'

                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'

                        }`}

                      >

                        <span className="truncate max-w-[200px] sm:max-w-[260px]">{group.sellerName}</span>

                        <span

                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${

                            isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'

                          }`}

                        >

                          {group.totalInvoices}

                        </span>

                        {group.hasUnsavedEdits && (

                          <span

                            className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white animate-pulse"

                            title="Đơn vị này có chỉnh sửa chưa lưu"

                          />

                        )}

                      </button>

                    );

                  })}

                </div>



                {/* Dải thông tin tóm tắt nhanh và tùy chỉnh nhận nợ của Tab đơn vị bán được chọn */}

                {activeSellerTab !== 'ALL' && (() => {

                  const currentGroup = sellerGroups.find((g) => g.sellerName === activeSellerTab);

                  if (!currentGroup) return null;

                  const otherSellersAlloc = totalAllocated - currentGroup.allocatedAmount;

                  const neededForThisSeller = originalPrincipal - otherSellersAlloc;



                  return (

                    <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-200/80 rounded-xl space-y-2 animate-fadeIn">

                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">

                        <div className="flex items-center gap-2">

                          <Building2 className="w-4 h-4 text-indigo-700 shrink-0" />

                          <div>

                            <span className="font-bold text-indigo-950 text-xs">{currentGroup.sellerName}</span>

                            <span className="ml-2 text-indigo-700 text-[11px] font-medium">

                              ({currentGroup.allocatedCount} đã gán nhận nợ / {currentGroup.totalInvoices} hóa đơn)

                            </span>

                          </div>

                        </div>

                        <div className="flex items-center gap-3 text-indigo-950 font-mono text-[11px] flex-wrap">

                          <div>

                            <span className="text-slate-500 font-sans">Tổng HĐ: </span>

                            <strong>{fmtMoney(currentGroup.totalInvoiceAmount)} đ</strong>

                          </div>

                          <div>

                            <span className="text-slate-500 font-sans">Đã gán: </span>

                            <strong className="text-emerald-700 font-bold">{fmtMoney(currentGroup.allocatedAmount)} đ</strong>

                          </div>

                          <div>

                            <span className="text-slate-500 font-sans">Khả dụng: </span>

                            <strong className="text-indigo-700">{fmtMoney(currentGroup.remainingAmount)} đ</strong>

                          </div>

                        </div>

                      </div>



                      {/* Bộ điều khiển tùy chỉnh nhận nợ nhanh cho người bán đang chọn */}

                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-indigo-100 flex-wrap text-xs">

                        <div className="flex items-center gap-2">

                          <span className="font-semibold text-slate-700 text-[11px]">Tùy chỉnh nhận nợ bên này:</span>

                          <div className="relative inline-flex items-center">

                            <input

                              type="text"

                              placeholder="Nhập số tiền..."

                              defaultValue={currentGroup.allocatedAmount > 0 ? currentGroup.allocatedAmount.toLocaleString('vi-VN') : ''}

                              key={`quick-${currentGroup.sellerName}-${currentGroup.allocatedAmount}`}

                              onFocus={(e) => e.target.select()}

                              onKeyDown={(e) => {

                                if (e.key === 'Enter') {

                                  e.preventDefault();

                                  const val = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');

                                  handleDistributeSellerAmount(currentGroup.sellerName, val ? Number(val) : 0);

                                }

                              }}

                              onBlur={(e) => {

                                const val = e.target.value.replace(/[^\d]/g, '');

                                if (val !== '' && Number(val) !== currentGroup.allocatedAmount) {

                                  handleDistributeSellerAmount(currentGroup.sellerName, Number(val));

                                }

                              }}

                              className="w-36 px-2.5 py-1 text-xs font-mono font-bold text-right bg-white border border-indigo-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"

                            />

                            <span className="ml-1 text-[11px] font-semibold text-slate-500">đ</span>

                          </div>

                        </div>



                        <div className="flex items-center gap-1.5">

                          {neededForThisSeller > 0 && neededForThisSeller !== currentGroup.allocatedAmount && (

                            <button

                              type="button"

                              onClick={() => handleDistributeSellerAmount(currentGroup.sellerName, neededForThisSeller)}

                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"

                              title={`Tự động lấy số tiền còn thiếu (${fmtMoney(neededForThisSeller)} đ) để tổng vừa tròn 100% gốc vay`}

                            >

                              Lấy số còn thiếu ({fmtMoney(neededForThisSeller)} đ)

                            </button>

                          )}

                          <button

                            type="button"

                            onClick={() => handleDistributeSellerAmount(currentGroup.sellerName, currentGroup.totalInvoiceAmount)}

                            className="px-2 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"

                            title="Nhận nợ tối đa hóa đơn bên này"

                          >

                            Tối đa

                          </button>

                          <button

                            type="button"

                            onClick={() => handleDistributeSellerAmount(currentGroup.sellerName, 0)}

                            className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"

                            title="Đặt nhận nợ bên này về 0 đ (tất cả thành hóa đơn thừa)"

                          >

                            Về 0 đ

                          </button>

                        </div>

                      </div>

                    </div>

                  );

                })()}

              </div>

            ) : sellerGroups.length === 1 ? (

              <div className="bg-slate-50/90 border-b border-slate-200 px-3 py-2 flex items-center justify-between text-xs flex-wrap gap-2">

                <div className="flex items-center gap-2">

                  <Building2 className="w-4 h-4 text-indigo-600" />

                  <span className="text-slate-500 font-medium">Đơn vị bán:</span>

                  <span className="font-bold text-slate-900">{sellerGroups[0].sellerName}</span>

                  <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.2 rounded-full font-semibold">

                    {sellerGroups[0].totalInvoices} hóa đơn trong hồ sơ

                  </span>

                </div>

                <div className="font-mono text-slate-700 text-xs flex items-center gap-3">

                  <span>Tổng tiền HĐ: <strong>{fmtMoney(sellerGroups[0].totalInvoiceAmount)} đ</strong></span>

                  <span>•</span>

                  <span>Đã nhận nợ: <strong className="text-emerald-700">{fmtMoney(sellerGroups[0].allocatedAmount)} đ</strong></span>

                </div>

              </div>

            ) : null}



            {/* BẢNG DANH SÁCH HÓA ĐƠN VÀ SỐ TIỀN NHẬN NỢ */}

            {loadingAllocations ? (

              <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-500">

                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải danh sách hóa đơn đối soát...

              </div>

            ) : errorAllocations ? (

              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{errorAllocations}</div>

            ) : liveAllocations.length === 0 && liveUnallocated.length === 0 ? (

              <div className="p-6 text-center text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl space-y-3 m-3">

                <Receipt className="w-8 h-8 text-slate-300 mx-auto" />

                <p className="font-semibold text-slate-700 text-sm">Khế ước này chưa được đối soát với hóa đơn bảo đảm nào.</p>

                <p className="text-slate-400 max-w-md mx-auto">

                  {docs.length > 0 ? (

                    <>

                      Bộ hồ sơ khế ước đang có <strong>{docs.length} chứng từ</strong>. Bấm nút bên dưới để hệ thống tự động cuốn chiếu hạn mức từ hóa đơn trong hồ sơ đến khi đủ số lượng dư nợ gốc.

                    </>

                  ) : (

                    'Kéo thả hóa đơn XML/PDF vào khung bên trên, hoặc bấm "Gán Thủ Công" để liên kết số tiền nhận nợ với hóa đơn có sẵn.'

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

              <table className="w-full text-xs">

                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">

                  <tr>

                    <th className="px-3 py-2 text-left">Số HĐ / Ký hiệu</th>

                    <th className="px-3 py-2 text-left">Đơn vị bán (Nhà cung cấp)</th>

                    <th className="px-3 py-2 text-right">Tổng tiền trên HĐ</th>

                    <th className="px-3 py-2 text-right font-semibold text-emerald-900">Số tiền khả dụng</th>

                    <th className="px-3 py-2 text-right font-semibold text-indigo-900 w-48">Số tiền bảo đảm nhận nợ</th>

                    <th className="px-3 py-2 text-left">Ghi chú / Trạng thái</th>

                    <th className="px-3 py-2 text-center w-16">Thao tác</th>

                  </tr>

                </thead>

                <tbody>

                  {/* Danh sách hóa đơn đã gán */}

                  {displayedAllocations.map((item) => (

                    <tr

                      key={`alloc-${item.invoice_id}`}

                      className={`border-t border-slate-100 hover:bg-slate-50/70 ${

                        item.isEdited

                          ? 'bg-amber-50/40'

                          : item.effectiveAmount === 0

                          ? 'bg-slate-50/60 opacity-80'

                          : item.is_manual

                          ? 'bg-blue-50/20'

                          : ''

                      }`}

                    >

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

                              editingAmounts[item.invoice_id] !== undefined

                                ? (editingAmounts[item.invoice_id] === '' ? '' : Number(editingAmounts[item.invoice_id]).toLocaleString('vi-VN'))

                                : Number(item.allocated_amount).toLocaleString('vi-VN')

                            }

                            onChange={(e) => handleAmountChange(item.invoice_id, e.target.value)}

                            placeholder="0"

                            className={`w-36 px-2.5 py-1 text-xs font-mono font-bold text-right rounded-lg border focus:outline-none focus:ring-2 shadow-2xs transition-all ${

                              item.isEdited

                                ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-amber-500 ring-1 ring-amber-300'

                                : item.effectiveAmount === 0

                                ? 'bg-slate-50 border-slate-300 text-slate-500 focus:ring-indigo-500'

                                : item.is_manual

                                ? 'bg-blue-50/50 border-blue-300 text-blue-900 focus:ring-blue-500'

                                : 'bg-white border-slate-300 text-emerald-800 focus:ring-emerald-500 focus:border-emerald-500'

                            }`}

                          />

                          <span className="text-[11px] font-semibold text-slate-500">đ</span>

                        </div>

                        {item.isEdited ? (

                          <div className="text-[10px] text-amber-700 font-medium mt-0.5 flex items-center justify-end gap-1">

                            <span>Gốc: {fmtMoney(item.allocated_amount)} đ</span>

                            <span className="font-bold uppercase tracking-wider text-[9px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded">Sửa tay</span>

                          </div>

                        ) : item.effectiveAmount === 0 ? (

                          <div className="text-[9px] text-slate-400 font-mono mt-0.5 text-right">

                            Hóa đơn thừa (nhận nợ 0 đ)

                          </div>

                        ) : item.is_manual ? (

                          <div className="text-[10px] text-blue-600 font-medium mt-0.5 text-right">

                            <span className="font-bold uppercase tracking-wider text-[9px] bg-blue-100 text-blue-800 px-1 py-0.2 rounded" title="Phân bổ thủ công - được ưu tiên bảo vệ">Thủ công</span>

                          </div>

                        ) : null}

                      </td>

                      <td className="px-3 py-2 text-slate-600 max-w-xs truncate" title={item.notes || ''}>

                        {item.isEdited ? (

                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">

                            <AlertCircle className="w-2.5 h-2.5 text-amber-700" />

                            Đang sửa thủ công (chưa lưu)

                          </span>

                        ) : item.effectiveAmount === 0 ? (

                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">

                            Hóa đơn thừa (chưa phân bổ nợ)

                          </span>

                        ) : item.is_manual || item.notes?.includes('thủ công') ? (

                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">

                            <CheckCircle2 className="w-2.5 h-2.5 text-blue-600" />

                            {item.notes || 'Sửa thủ công (Ưu tiên lưu)'}

                          </span>

                        ) : item.notes?.includes('cuốn chiếu') || item.notes?.includes('hồ sơ') ? (

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

                          onClick={() => {

                            // Đặt số tiền nhận nợ về 0 đ (chuyển thành hóa đơn thừa) thay vì xóa mất dòng

                            handleAmountChange(item.invoice_id, '0');

                          }}

                          className="p-1 rounded text-rose-500 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"

                          title="Đặt số tiền nhận nợ về 0 đ (chuyển thành hóa đơn thừa)"

                        >

                          <Trash2 className="w-3.5 h-3.5" />

                        </button>

                      </td>

                    </tr>

                  ))}



                  {/* Các hóa đơn trong Hồ sơ giải ngân (hóa đơn thừa / chưa gán) - ĐỂ 0 Đ VÀ VẪN CHO PHÉP SỬA TAY */}

                  {displayedUnallocated.map((uInv) => {

                    const isBankConflict = uInv.reason_code === 'BANK_MISMATCH';

                    const isExhausted = uInv.reason_code === 'EXHAUSTED_LIMIT' && Number(uInv.remaining_amount) <= 0;

                    const isLocked = isBankConflict || isExhausted;



                    return (

                      <tr

                        key={`unalloc-${uInv.invoice_id}`}

                        className={`border-t border-slate-100 ${

                          isBankConflict

                            ? 'bg-rose-50/40 hover:bg-rose-50/70'

                            : uInv.effectiveAmount > 0

                            ? 'bg-amber-50/30 hover:bg-amber-50/60'

                            : 'bg-slate-50/60 hover:bg-slate-100/60'

                        }`}

                      >

                        <td className="px-3 py-2 font-mono text-slate-600 font-medium">

                          <div className="flex items-center gap-1.5">

                            <span>{uInv.invoice_number || '—'}</span>

                            {uInv.invoice_series && <span className="text-slate-400 text-[11px]">({uInv.invoice_series})</span>}

                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-600">

                              Hồ sơ

                            </span>

                          </div>

                        </td>

                        <td className="px-3 py-2 text-slate-600 max-w-sm truncate" title={uInv.seller_name || ''}>

                          {uInv.seller_name || '—'}

                        </td>

                        <td className="px-3 py-2 text-right font-mono text-slate-500">

                          {fmtMoney(uInv.total_invoice_amount)}

                        </td>

                        <td

                          className={`px-3 py-2 text-right font-mono font-semibold ${

                            Number(uInv.remaining_amount) > 0 ? 'text-amber-700' : 'text-rose-600 bg-rose-50/30'

                          }`}

                        >

                          {fmtMoney(uInv.remaining_amount)}

                        </td>

                        <td className="px-3 py-2 text-right">

                          {isLocked ? (

                            <span

                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 font-mono text-xs font-semibold"

                              title="Khóa do ràng buộc khác ngân hàng hoặc đã dùng hết hạn mức"

                            >

                              0 đ (Khóa)

                            </span>

                          ) : (

                            <div className="inline-flex items-center gap-1 justify-end">

                              <input

                                type="text"

                                value={

                                  editingAmounts[uInv.invoice_id] !== undefined

                                    ? (editingAmounts[uInv.invoice_id] === '' ? '' : Number(editingAmounts[uInv.invoice_id]).toLocaleString('vi-VN'))

                                    : '0'

                                }

                                onChange={(e) => handleAmountChange(uInv.invoice_id, e.target.value)}

                                onFocus={(e) => e.target.select()}

                                placeholder="0"

                                className={`w-36 px-2.5 py-1 text-xs font-mono font-bold text-right rounded-lg border focus:outline-none focus:ring-2 shadow-2xs transition-all ${

                                  uInv.effectiveAmount > 0

                                    ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-amber-500 ring-1 ring-amber-300'

                                    : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400 focus:ring-indigo-500'

                                }`}

                              />

                              <span className="text-[11px] font-semibold text-slate-500">đ</span>

                            </div>

                          )}



                          {uInv.effectiveAmount > 0 ? (

                            <div className="text-[10px] text-amber-700 font-medium mt-0.5 flex items-center justify-end gap-1">

                              <span className="font-bold uppercase tracking-wider text-[9px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded">

                                Đã gán từ HĐ thừa

                              </span>

                            </div>

                          ) : !isLocked ? (

                            <div className="text-[9px] text-slate-400 font-mono mt-0.5 text-right">

                              Hóa đơn thừa (cho phép sửa tay)

                            </div>

                          ) : null}

                        </td>

                        <td className="px-3 py-2 text-slate-700 max-w-md" title={uInv.reason_message || ''}>

                          {uInv.effectiveAmount > 0 ? (

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">

                              <Sparkles className="w-3 h-3 text-emerald-600" />

                              <span>Đã gán số tiền nhận nợ: {fmtMoney(uInv.effectiveAmount)} đ</span>

                            </span>

                          ) : (

                            <span

                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${

                                isBankConflict

                                  ? 'bg-rose-50 text-rose-700 border-rose-200'

                                  : 'bg-amber-50 text-amber-800 border-amber-200'

                              }`}

                            >

                              <AlertTriangle className="w-3 h-3 shrink-0" />

                              <span>{uInv.reason_message}</span>

                            </span>

                          )}

                        </td>

                        <td className="px-3 py-2 text-center">

                          {uInv.effectiveAmount > 0 ? (

                            <button

                              type="button"

                              onClick={() => handleAmountChange(uInv.invoice_id, '0')}

                              className="p-1 rounded text-rose-500 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"

                              title="Đặt lại về 0 đ (hóa đơn thừa)"

                            >

                              <Trash2 className="w-3.5 h-3.5" />

                            </button>

                          ) : !isLocked ? (

                            <button

                              type="button"

                              onClick={() => {

                                const needed = originalPrincipal - totalAllocated;

                                const maxAvail = Number(uInv.remaining_amount);

                                const alloc = Math.max(0, Math.min(maxAvail, needed > 0 ? needed : maxAvail));

                                handleAmountChange(uInv.invoice_id, String(Math.round(alloc)));

                              }}

                              className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 transition-colors cursor-pointer"

                              title="Điền nhanh số tiền còn thiếu để khớp khoản vay"

                            >

                              <Plus className="w-3.5 h-3.5" />

                            </button>

                          ) : (

                            <span className="text-slate-300">—</span>

                          )}

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

                <tfoot className="bg-slate-50/95 border-t-2 border-slate-300 font-bold text-slate-900">

                  {/* Dòng subtotal của tab hiện tại nếu đang chọn 1 đơn vị bán */}

                  {activeSellerTab !== 'ALL' && (

                    <tr className="bg-indigo-50/60 border-b border-indigo-200 text-indigo-950 font-bold">

                      <td colSpan={2} className="px-3 py-2 text-left">

                        <span className="text-xs uppercase tracking-wider font-extrabold text-indigo-900">Tiểu kế ({activeSellerTab}):</span>

                        <span className="ml-2 text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">

                          {displayedAllocations.filter((a) => a.effectiveAmount > 0).length + displayedUnallocated.filter((u) => u.effectiveAmount > 0).length} đã gán / {displayedAllocations.length + displayedUnallocated.length} HĐ

                        </span>

                      </td>

                      <td className="px-3 py-2 text-right font-mono text-xs text-indigo-900">

                        {fmtMoney(displayedTotalInvoiceAmount)}

                      </td>

                      <td className="px-3 py-2 text-right font-mono text-xs text-indigo-700">

                        {fmtMoney(displayedTotalRemainingAmount)}

                      </td>

                      <td className="px-3 py-2 text-right font-mono text-xs text-indigo-950 font-black">

                        {fmtMoney(displayedTotalAllocated)} đ

                      </td>

                      <td colSpan={2} className="px-3 py-2 text-left text-[11px] text-indigo-700">

                        Số tiền nhận nợ riêng đơn vị này

                      </td>

                    </tr>

                  )}



                  {/* Dòng tổng cộng toàn bộ khế ước */}

                  <tr>

                    <td colSpan={2} className="px-3 py-3 text-left">

                      <div className="flex items-center gap-2 flex-wrap">

                        <span className="text-xs uppercase tracking-wider font-extrabold text-slate-800">

                          {activeSellerTab === 'ALL' ? 'Tổng cộng toàn bộ:' : 'Tổng toàn khế ước:'}

                        </span>

                        <span className="text-[11px] font-semibold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">

                          {liveAllocations.filter((a) => a.effectiveAmount > 0).length + liveUnallocated.filter((u) => u.effectiveAmount > 0).length} đã gán nhận nợ

                          ({liveAllocations.length + liveUnallocated.length} HĐ trong hồ sơ)

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

                          <span className="text-emerald-600 font-semibold">Khớp 100% gốc vay</span>

                        ) : diff > 0 ? (

                          <span className="text-amber-600 font-semibold">Thiếu {fmtMoney(diff)} đ</span>

                        ) : (

                          <span className="text-rose-600 font-semibold">Thừa {fmtMoney(Math.abs(diff))} đ</span>

                        )}

                      </div>

                    </td>

                    <td className="px-3 py-3 text-left text-[11px] text-slate-600 font-medium">

                      {diff === 0 ? (

                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">

                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đã đủ 100% chứng từ nhận nợ (Đủ điều kiện lưu)

                        </span>

                      ) : diff > 0 ? (

                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">

                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Chưa bằng gốc vay (cần thêm {fmtMoney(diff)} đ)

                        </span>

                      ) : (

                        <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">

                          Hóa đơn vượt dư nợ gốc (cần giảm {fmtMoney(Math.abs(diff))} đ)

                        </span>

                      )}

                    </td>

                    <td className="px-3 py-3 text-center text-slate-400">—</td>

                  </tr>

                </tfoot>

              </table>

            )}

          </div>

        )}

      </div>



      {/* ======================================================== */}

      {/* 4. KHỐI CHÍNH 2: DANH MỤC CHỨNG TỪ HỒ SƠ GIẢI NGÂN KHÁC       */}

      {/* ======================================================== */}

      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">

        {/* Header khối danh mục tài liệu với nút thu gọn/mở rộng */}

        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs flex-wrap gap-2">

          <button

            type="button"

            onClick={() => setIsDocsSectionOpen(!isDocsSectionOpen)}

            className="font-bold text-slate-800 flex items-center gap-1.5 hover:text-indigo-600 transition-colors cursor-pointer"

          >

            {isDocsSectionOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}

            <FolderOpen className="w-4 h-4 text-indigo-600" />

            <span>

              Danh mục chứng từ hồ sơ giải ngân khác ({filteredDocs.length}/{otherDocs.length} tệp tin)

            </span>

          </button>

        </div>



        {isDocsSectionOpen && (

          <div className="p-3 space-y-3">

            {/* Vùng kéo thả nạp chứng từ hồ sơ giải ngân khác */}

            <div

              onDragOver={(e) => {

                e.preventDefault();

                e.stopPropagation();

                e.dataTransfer.dropEffect = 'copy';

                setIsDragging(true);

              }}

              onDragLeave={() => setIsDragging(false)}

              onDrop={handleDrop}

              onClick={() => fileInputRef.current?.click()}

              className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-150 ${

                isDragging

                  ? 'border-indigo-500 bg-indigo-50/90 ring-2 ring-indigo-200 shadow-xs'

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

                <div className="flex items-center justify-center gap-2 py-1">

                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />

                  <span className="text-xs font-bold text-slate-800">

                    Đang tải lên {uploadProgress.current}/{uploadProgress.total} tệp tin: {uploadProgress.fileName}...

                  </span>

                </div>

              ) : (

                <div className="flex items-center justify-between flex-wrap gap-2 px-1">

                  <div className="flex items-center gap-2 text-left">

                    <UploadCloud className="w-4 h-4 text-indigo-600 shrink-0" />

                    <div>

                      <span className="text-xs font-semibold text-slate-800">

                        <span className="text-indigo-600 hover:underline font-bold">Nhấn để chọn tệp</span> hoặc kéo thả chứng từ khác vào đây

                      </span>

                      <div className="text-[10px] text-slate-400">

                        Khế ước vay, Biên bản bàn giao, Đề nghị giải ngân, v.v. (PDF, Word, Excel, Ảnh)

                      </div>

                    </div>

                  </div>

                  <div className="text-[11px] text-slate-500">

                    Nạp vào mục: <strong className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{targetCategoryLabel}</strong>

                  </div>

                </div>

              )}

            </div>



            {uploadError && (

              <div className="p-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">

                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />

                <span>{uploadError}</span>

              </div>

            )}

            {/* Thanh Phân Loại Chứng Từ: Mặc định Khế ước nhận nợ & Hóa đơn, kèm nút + */}

            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 text-xs relative">

              <button

                type="button"

                onClick={() => setFilterCategory('ALL')}

                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${

                  filterCategory === 'ALL' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-100'

                }`}

              >

                Tất cả ({otherDocs.length})

              </button>



              {activeCategoryTabs.map((cat) => {

                const count = catCounts[cat.key] || 0;

                const isActive = filterCategory === cat.key;

                const isRemovable = count === 0 && cat.key !== 'DEBT_NOTE' && cat.key !== 'INVOICE';

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

                    {isRemovable && (

                      <span

                        role="button"

                        tabIndex={0}

                        onClick={(e) => {

                          e.stopPropagation();

                          setExtraCategories((prev) => prev.filter((k) => k !== cat.key));

                          if (filterCategory === cat.key) setFilterCategory('ALL');

                        }}

                        className={`ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-black/10 transition-colors ${

                          isActive ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-slate-700'

                        }`}

                        title="Đóng tab này"

                      >

                        <X className="w-3 h-3" />

                      </span>

                    )}

                  </button>

                );

              })}



              {/* Nút dấu + thêm loại chứng từ (hỗ trợ nhập loại hồ sơ mới tùy chỉnh) */}

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

                      className="absolute left-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"

                      onClick={(e) => e.stopPropagation()}

                    >

                      {/* Nhập loại hồ sơ mới */}

                      <div className="p-2.5 bg-slate-50 border-b border-slate-100">

                        <label className="block text-[11px] font-bold text-slate-700 mb-1">

                          Nhập loại hồ sơ mới:

                        </label>

                        <div className="flex items-center gap-1.5">

                          <input

                            type="text"

                            value={newCategoryName}

                            onChange={(e) => setNewCategoryName(e.target.value)}

                            onKeyDown={(e) => {

                              if (e.key === 'Enter') {

                                e.preventDefault();

                                handleAddNewCategory();

                              }

                            }}

                            placeholder="vd: Khế ước nhận nợ, Báo cáo tài chính..."

                            className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-indigo-500 text-slate-800 placeholder:text-slate-400 shadow-2xs"

                            autoFocus

                          />

                          <button

                            type="button"

                            onClick={handleAddNewCategory}

                            disabled={!newCategoryName.trim()}

                            className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-2xs"

                            title="Thêm và lưu loại hồ sơ này để lần sau dùng tiếp"

                          >

                            Thêm

                          </button>

                        </div>

                        <div className="text-[10px] text-slate-400 mt-1 italic">

                          * Loại mới sẽ được tự động lưu lại để lần sau dùng tiếp.

                        </div>

                      </div>



                      {/* Loại hồ sơ tùy chỉnh đã lưu từ trước */}

                      {savedCustomOptions.length > 0 && (

                        <div className="p-1.5 border-b border-slate-100 bg-amber-50/30">

                          <div className="px-2 py-1 text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center justify-between">

                            <span className="flex items-center gap-1">

                              <Sparkles className="w-3 h-3 text-amber-500" />

                              Loại đã lưu (dùng lại):

                            </span>

                            <span className="text-[9px] font-normal text-slate-400 font-mono">

                              {savedCustomOptions.length} loại

                            </span>

                          </div>

                          <div className="max-h-36 overflow-y-auto space-y-0.5">

                            {savedCustomOptions.map((opt) => (

                              <div

                                key={opt.key}

                                onClick={() => {

                                  setExtraCategories((prev) => Array.from(new Set([...prev, opt.key])));

                                  setFilterCategory(opt.key);

                                  setIsAddMenuOpen(false);

                                }}

                                className="group w-full px-2.5 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center justify-between transition-colors cursor-pointer"

                              >

                                <span className="font-medium truncate mr-1.5">{opt.label}</span>

                                <div className="flex items-center gap-1 shrink-0">

                                  <Plus className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />

                                  <button

                                    type="button"

                                    onClick={(e) => handleDeleteCustomCategory(opt.key, e)}

                                    title="Xóa khỏi danh sách lưu"

                                    className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"

                                  >

                                    <Trash2 className="w-3.5 h-3.5" />

                                  </button>

                                </div>

                              </div>

                            ))}

                          </div>

                        </div>

                      )}



                      {/* Chọn loại có sẵn mặc định nếu còn */}

                      {standardRemainingOptions.length > 0 && (

                        <div className="p-1.5">

                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">

                            Hoặc chọn loại có sẵn:

                          </div>

                          {standardRemainingOptions.map((opt) => (

                            <button

                              key={opt.key}

                              type="button"

                              onClick={() => {

                                setExtraCategories((prev) => Array.from(new Set([...prev, opt.key])));

                                setFilterCategory(opt.key);

                                setIsAddMenuOpen(false);

                              }}

                              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg flex items-center justify-between transition-colors cursor-pointer"

                            >

                              <span className="font-medium">{opt.label}</span>

                              <Plus className="w-3.5 h-3.5 text-indigo-500" />

                            </button>

                          ))}

                        </div>

                      )}

                    </div>

                  </>

                )}

              </div>

            </div>



            {/* Bảng Danh Sách Chứng Từ */}

            {loadingDocs ? (

              <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500">

                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Đang tải danh sách hồ sơ...

              </div>

            ) : errorDocs ? (

              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">{errorDocs}</div>

            ) : filteredDocs.length === 0 ? (

              <div

                onDragOver={(e) => {

                  e.preventDefault();

                  e.stopPropagation();

                  e.dataTransfer.dropEffect = 'copy';

                  setIsDragging(true);

                }}

                onDragEnter={(e) => {

                  e.preventDefault();

                  e.stopPropagation();

                  setIsDragging(true);

                }}

                onDragLeave={(e) => {

                  e.preventDefault();

                  e.stopPropagation();

                  setIsDragging(false);

                }}

                onDrop={handleDrop}

                onClick={() => fileInputRef.current?.click()}

                className={`p-8 text-center text-xs rounded-xl space-y-2 cursor-pointer transition-all duration-150 border-2 border-dashed ${

                  isDragging

                    ? 'border-indigo-500 bg-indigo-50/95 ring-2 ring-indigo-300 shadow-md scale-[1.002]'

                    : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/20'

                }`}

              >

                <div className="pointer-events-none space-y-2">

                  <FolderOpen className={`w-10 h-10 mx-auto transition-colors ${isDragging ? 'text-indigo-600 animate-bounce' : 'text-slate-400'}`} />

                  <p className="font-bold text-slate-800 text-sm">

                    {isDragging ? 'Thả tệp tin tại đây để nạp ngay!' : `Chưa có tài liệu nào trong mục "${targetCategoryLabel}"`}

                  </p>

                  <p className="text-slate-500">

                    <span className="text-indigo-600 font-bold hover:underline">Nhấn vào đây để chọn tệp</span> hoặc kéo và thả trực tiếp tài liệu vào khung này để tải lên ngay vào mục <strong>{targetCategoryLabel}</strong>.

                  </p>

                  <div className="text-[10px] text-slate-400">

                    * Hỗ trợ PDF, Word, Excel, Ảnh, ZIP (Tự động lưu trữ vào hồ sơ)

                  </div>

                </div>

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

                      const foundCat = allKnownCategories.find((c) => c.key === doc.document_type);

                      const meta = DOSSIER_CATEGORY_META[doc.document_type] || {

                        label: foundCat ? foundCat.label : doc.document_type,

                        badge: foundCat ? foundCat.label : doc.document_type,

                        colorClass: 'bg-teal-50 text-teal-700 border-teal-200',

                      };

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

                                onClick={() => handleDownloadDoc(doc)}

                                className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 transition-colors cursor-pointer"

                                title="Tải xuống tệp chứng từ"

                              >

                                <Download className="w-3.5 h-3.5" />

                              </button>

                              <button

                                type="button"

                                onClick={() => handleDeleteDoc(doc.document_id)}

                                disabled={deletingDocId === doc.document_id}

                                className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"

                                title="Xóa chứng từ khỏi bộ hồ sơ"

                              >

                                {deletingDocId === doc.document_id ? (

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

        )}

      </div>



      {/* Modal gán hóa đơn thủ công */}

      <AllocateInvoiceModal

        loan={contract}

        isOpen={isAllocateModalOpen}

        onClose={() => setIsAllocateModalOpen(false)}

        onSuccess={() => {

          fetchAllocations();

          fetchDocs();

          onRefreshContract();

        }}

        remainingNeeded={diff > 0 ? diff : 0}

      />

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

    setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'dossier' }));

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

                                  onClick={() => setActiveSubTab((prev) => ({ ...prev, [c.loan_id]: 'dossier' }))}

                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${

                                    currentTab === 'dossier' || currentTab === 'invoices'

                                      ? 'bg-indigo-600 text-white shadow-xs'

                                      : 'text-slate-600 hover:bg-slate-100'

                                  }`}

                                >

                                  <FolderArchive className="w-3.5 h-3.5" />

                                  <span>

                                    Hồ sơ giải ngân ({c.dossier_count || 0})

                                  </span>

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

                            {(currentTab === 'dossier' || currentTab === 'invoices') && (

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

