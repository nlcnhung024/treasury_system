import React, { useEffect, useMemo, useState } from 'react';
import { FileText, ChevronDown, ChevronRight, Loader2, AlertTriangle, Search, Copy, Check, Filter, RotateCcw } from 'lucide-react';
import api from '../services/api';
import { SortableTh } from '../components/common/SortableTh';
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
  original_principal_balance: string;
  total_principal_paid: string;
  current_principal_balance: string;
  interest_rate: string;
  estimated_interest: string;
  total_interest_paid: string;
  disbursement_date: string | null;
  maturity_date: string | null;
  repayment_count: number;
}

interface ColumnFilters {
  bank: string;
  contract_number: string;
  original_principal_balance: string;
  total_principal_paid: string;
  current_principal_balance: string;
  interest_rate: string;
  estimated_interest: string;
  total_interest_paid: string;
  disbursement_date: string;
  maturity_date: string;
}

const initialFilters: ColumnFilters = {
  bank: '',
  contract_number: '',
  original_principal_balance: '',
  total_principal_paid: '',
  current_principal_balance: 'ALL',
  interest_rate: '',
  estimated_interest: '',
  total_interest_paid: '',
  disbursement_date: '',
  maturity_date: '',
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

const fmtMoney = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
const fmtDateTime = (v: string) => new Date(v).toLocaleString('vi-VN');

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
    <div className="p-4">
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
      </table>
    </div>
  );
};

export const ContractDetailsPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copiedContract, setCopiedContract] = useState<string | null>(null);
  const sort = useSort();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ColumnFilters>(initialFilters);
  const [showColumnFilters, setShowColumnFilters] = useState(true);

  const handleCopyContract = (e: React.MouseEvent, contractNumber: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractNumber);
    setCopiedContract(contractNumber);
    setTimeout(() => {
      setCopiedContract((prev) => (prev === contractNumber ? null : prev));
    }, 2000);
  };

  const handleFilterChange = (key: keyof ColumnFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters(initialFilters);
    setSearch('');
  };

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
    if (filters.original_principal_balance) count++;
    if (filters.total_principal_paid) count++;
    if (filters.current_principal_balance !== 'ALL') count++;
    if (filters.interest_rate) count++;
    if (filters.estimated_interest) count++;
    if (filters.total_interest_paid) count++;
    if (filters.disbursement_date) count++;
    if (filters.maturity_date) count++;
    return count;
  }, [filters]);

  const sortedContracts = useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase();
    const cleanNum = (s: string) => s.replace(/[\.,\s]/g, '');

    const filtered = contracts.filter((c) => {
      // 1. Global search
      if (search.trim()) {
        const q = norm(search.trim());
        const bankStr = norm(`${c.bank_name} ${c.bank_code}`);
        const contractStr = norm(c.contract_number);
        if (!bankStr.includes(q) && !contractStr.includes(q)) {
          return false;
        }
      }

      // 2. Column filters
      // 2.1 Ngân hàng
      if (filters.bank) {
        const bankName = c.bank_name || c.bank_code || '';
        if (bankName.trim() !== filters.bank.trim()) return false;
      }

      // 2.2 Số khế ước
      if (filters.contract_number.trim()) {
        const q = norm(filters.contract_number.trim());
        if (!norm(c.contract_number).includes(q)) return false;
      }

      // 2.3 Dư nợ gốc
      if (filters.original_principal_balance.trim()) {
        const q = cleanNum(filters.original_principal_balance.trim());
        const raw = cleanNum(String(c.original_principal_balance || ''));
        const fmt = cleanNum(fmtMoney(c.original_principal_balance));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      // 2.4 Tổng dư nợ gốc đã trả
      if (filters.total_principal_paid.trim()) {
        const q = cleanNum(filters.total_principal_paid.trim());
        const raw = cleanNum(String(c.total_principal_paid || ''));
        const fmt = cleanNum(fmtMoney(c.total_principal_paid));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      // 2.5 Dư nợ gốc hiện tại (Dropdown + Custom input)
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

      // 2.6 Lãi suất
      if (filters.interest_rate.trim()) {
        const q = filters.interest_rate.trim().replace('%', '');
        const rateStr = Number(c.interest_rate).toFixed(2);
        if (!rateStr.includes(q)) return false;
      }

      // 2.7 Lãi ước tính
      if (filters.estimated_interest.trim()) {
        const q = cleanNum(filters.estimated_interest.trim());
        const raw = cleanNum(String(c.estimated_interest || ''));
        const fmt = cleanNum(fmtMoney(c.estimated_interest));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      // 2.8 Tổng lãi đã trả
      if (filters.total_interest_paid.trim()) {
        const q = cleanNum(filters.total_interest_paid.trim());
        const raw = cleanNum(String(c.total_interest_paid || ''));
        const fmt = cleanNum(fmtMoney(c.total_interest_paid));
        if (!raw.includes(q) && !fmt.includes(q)) return false;
      }

      // 2.9 Ngày giải ngân
      if (filters.disbursement_date.trim()) {
        const q = filters.disbursement_date.trim().toLowerCase();
        const dStr = fmtDate(c.disbursement_date).toLowerCase();
        const rawDate = (c.disbursement_date || '').toLowerCase();
        if (!dStr.includes(q) && !rawDate.includes(q)) return false;
      }

      // 2.10 Ngày đáo hạn
      if (filters.maturity_date.trim()) {
        const q = filters.maturity_date.trim().toLowerCase();
        const dStr = fmtDate(c.maturity_date).toLowerCase();
        const rawDate = (c.maturity_date || '').toLowerCase();
        if (!dStr.includes(q) && !rawDate.includes(q)) return false;
      }

      return true;
    });

    return sortList(filtered, sort.field, sort.dir, { bank: (c) => c.bank_name || c.bank_code });
  }, [contracts, search, filters, sort.field, sort.dir]);

  const th = (field: string, label: string, align: 'left' | 'right' | 'center' = 'right') => (
    <SortableTh field={field} currentSortField={sort.field} currentSortDirection={sort.dir} onSort={sort.onSort} align={align} className="!py-2">
      {label}
    </SortableTh>
  );

  useEffect(() => {
    api
      .get('/loans/contract-details')
      .then((res) => setContracts(res.data?.data ?? []))
      .catch(() => setError('Không tải được danh sách khế ước.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Chi tiết khế ước</h1>
            <p className="text-xs text-slate-500">Bấm vào một khế ước để xem bảng dòng tiền trả gốc/lãi đã đối soát.</p>
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

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm nhanh theo ngân hàng hoặc số khế ước..."
          aria-label="Tìm kiếm khế ước"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
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
                {th('original_principal_balance', 'Dư nợ gốc')}
                {th('total_principal_paid', 'Tổng dư nợ gốc đã trả')}
                {th('current_principal_balance', 'Dư nợ gốc hiện tại')}
                {th('interest_rate', 'Lãi suất')}
                {th('estimated_interest', 'Lãi ước tính')}
                {th('total_interest_paid', 'Tổng lãi đã trả')}
                {th('disbursement_date', 'Ngày giải ngân', 'center')}
                {th('maturity_date', 'Ngày đáo hạn', 'center')}
              </tr>

              {/* DÒNG FILTER TỪNG CỘT */}
              {showColumnFilters && (
                <tr className="bg-indigo-50/50 border-t border-indigo-100 text-[11px]">
                  <td className="px-2 py-1.5 text-center text-slate-400">
                    <Filter className="w-3 h-3 mx-auto text-indigo-400" />
                  </td>

                  {/* 1. Filter Ngân hàng */}
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

                  {/* 2. Filter Số khế ước */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.contract_number}
                      onChange={(e) => handleFilterChange('contract_number', e.target.value)}
                      placeholder="Lọc số khế ước..."
                      className="w-full text-[11px] font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 3. Filter Dư nợ gốc */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.original_principal_balance}
                      onChange={(e) => handleFilterChange('original_principal_balance', e.target.value)}
                      placeholder="Lọc số tiền..."
                      className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 4. Filter Tổng gốc đã trả */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.total_principal_paid}
                      onChange={(e) => handleFilterChange('total_principal_paid', e.target.value)}
                      placeholder="Lọc số tiền..."
                      className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 5. Filter Dư nợ hiện tại (Dropdown trạng thái) */}
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

                  {/* 6. Filter Lãi suất */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.interest_rate}
                      onChange={(e) => handleFilterChange('interest_rate', e.target.value)}
                      placeholder="vd: 8.5"
                      className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 7. Filter Lãi ước tính */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.estimated_interest}
                      onChange={(e) => handleFilterChange('estimated_interest', e.target.value)}
                      placeholder="Lọc lãi..."
                      className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 8. Filter Tổng lãi đã trả */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.total_interest_paid}
                      onChange={(e) => handleFilterChange('total_interest_paid', e.target.value)}
                      placeholder="Lọc lãi..."
                      className="w-full text-[11px] text-right font-mono bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 9. Filter Ngày giải ngân */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.disbursement_date}
                      onChange={(e) => handleFilterChange('disbursement_date', e.target.value)}
                      placeholder="vd: 10/3"
                      className="w-full text-[11px] text-center font-mono bg-white border border-slate-300 rounded px-1 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>

                  {/* 10. Filter Ngày đáo hạn */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={filters.maturity_date}
                      onChange={(e) => handleFilterChange('maturity_date', e.target.value)}
                      placeholder="vd: 10/9"
                      className="w-full text-[11px] text-center font-mono bg-white border border-slate-300 rounded px-1 py-1 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedContracts.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-slate-500 italic">
                    {contracts.length === 0 ? 'Chưa có khế ước nào.' : 'Không tìm thấy khế ước phù hợp.'}
                  </td>
                </tr>
              )}
              {sortedContracts.map((c) => {
                const open = expanded === c.loan_id;
                return (
                  <React.Fragment key={c.loan_id}>
                    <tr
                      onClick={() => setExpanded(open ? null : c.loan_id)}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-indigo-50/60 ${open ? 'bg-indigo-50' : ''}`}
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">{c.bank_name || c.bank_code}</td>
                      <td className="px-3 py-2 font-mono text-indigo-700 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 group">
                          <span>{c.contract_number}</span>
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
                      <td className="px-3 py-2 text-right">{fmtMoney(c.original_principal_balance)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmtMoney(c.total_principal_paid)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtMoney(c.current_principal_balance)}</td>
                      <td className="px-3 py-2 text-right">{Number(c.interest_rate).toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.estimated_interest)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmtMoney(c.total_interest_paid)}</td>
                      <td className="px-3 py-2 text-center">{fmtDate(c.disbursement_date)}</td>
                      <td className="px-3 py-2 text-center">{fmtDate(c.maturity_date)}</td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50">
                        <td colSpan={11}>
                          <CashflowTable loanId={c.loan_id} />
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
    </div>
  );
};

