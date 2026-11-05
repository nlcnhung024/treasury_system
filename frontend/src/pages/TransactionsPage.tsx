import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  CheckCheck,
} from 'lucide-react';
import api from '../services/api';
import { Transaction, Category, BankAccount } from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { TableGridToolbar } from '../components/common/TableGridToolbar';
import { useTableGrid } from '../hooks/useTableGrid';
import { ColumnConfig } from '../types/grid';

const TRANSACTION_COLUMNS: ColumnConfig[] = [
  { field: 'transaction_date', label: 'Ngày giờ GD', type: 'date', defaultWidth: 140 },
  { field: 'bank_account', label: 'NH / Số TK', type: 'text', defaultWidth: 150 },
  { field: 'counterparty_name', label: 'Đối tác (Thụ hưởng/Chuyển)', type: 'text', defaultWidth: 200 },
  { field: 'description', label: 'Nội dung Diễn giải', type: 'text', defaultWidth: 280 },
  { field: 'debit_amount', label: 'Phát sinh Nợ (-)', type: 'number', align: 'right', defaultWidth: 140 },
  { field: 'credit_amount', label: 'Phát sinh Có (+)', type: 'number', align: 'right', defaultWidth: 140 },
  { field: 'running_balance', label: 'Số dư Lũy kế', type: 'number', align: 'right', defaultWidth: 160 },
  { field: 'category_name', label: 'Danh mục', type: 'text', defaultWidth: 190 },
  { field: 'internal_note', label: 'Ghi chú Nội bộ', type: 'text', defaultWidth: 180 },
  { field: 'is_locked', label: 'Khóa', type: 'text', align: 'center', defaultWidth: 80 },
];

export const TransactionsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Bộ lọc đa chiều (hỗ trợ khởi tạo từ URL Query Params khi Drill-down từ Báo cáo CFO)
  const [keyword, setKeyword] = useState<string>(searchParams.get('keyword') || '');
  const [bankCode, setBankCode] = useState<string>(searchParams.get('bank_code') || '');
  const [accountId, setAccountId] = useState<string>(searchParams.get('account_id') || '');
  const [flowType, setFlowType] = useState<string>(searchParams.get('flow_type') || '');
  const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get('category_id') || '');
  const [fromDate, setFromDate] = useState<string>(searchParams.get('from_date') || '');
  const [toDate, setToDate] = useState<string>(searchParams.get('to_date') || '');
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

  // Table Grid Capabilities (Sort, Filter, Visibility, Resizing)
  const {
    sortField,
    sortDirection,
    handleSort,
    filters,
    setFilter,
    clearAllFilters,
    activeFilterCount,
    visibleColumns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    isColumnVisible,
    columnWidths,
    handleResize,
    filterAndSort,
  } = useTableGrid<Transaction>({
    tableId: 'transactions_table',
    columns: TRANSACTION_COLUMNS,
    defaultSortField: 'transaction_date',
    defaultSortDirection: 'desc',
  });

  const sortedTransactions = useMemo(() => {
    return filterAndSort(transactions, {
      bank_account: (tx) => `${tx.bank_code || ''} ${tx.account_number || ''}`,
      counterparty_name: (tx) => tx.counter_party || '',
      category_name: (tx) => tx.category_name || '',
      is_locked: (tx) => (tx.is_manual_override ? 'locked' : 'unlocked'),
    });
  }, [transactions, filterAndSort]);

  useEffect(() => {
    fetchCategories();
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page, bankCode, accountId, flowType, categoryFilter, fromDate, toDate]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      setAccounts(res.data || []);
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
          account_id: accountId !== '' ? Number(accountId) : undefined,
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
    if (accountId !== '') params.set('account_id', accountId);
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
          <div className="md:col-span-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nội dung, mã GD..."
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
              setAccountId('');
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
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả Số tài khoản</option>
            {accounts
              .filter((acc) => !bankCode || acc.bank_code === bankCode)
              .map((acc) => (
                <option key={acc.account_id} value={acc.account_id}>
                  [{acc.bank_code}] {acc.account_number} ({acc.account_type === 'SPECIAL_CASH' ? 'TK Cá nhân CEO' : 'TK Công ty'})
                </option>
              ))}
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
            {(fromDate || toDate || bankCode || accountId || flowType || categoryFilter || keyword) && (
              <button
                onClick={() => {
                  setKeyword('');
                  setBankCode('');
                  setAccountId('');
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

        {/* Table Grid Toolbar */}
        <TableGridToolbar
          columns={TRANSACTION_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onShowAllColumns={showAllColumns}
          onResetColumns={resetColumns}
          filteredCount={sortedTransactions.length}
          totalCount={transactions.length}
          activeFilterCount={activeFilterCount}
          onClearAllFilters={clearAllFilters}
        />

        {/* Bảng Giao dịch */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={sortedTransactions.length > 0 && selectedIds.length === sortedTransactions.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </th>
                {isColumnVisible('transaction_date') && (
                  <SortableTh
                    field="transaction_date"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="date"
                    filterValue={filters['transaction_date']}
                    onFilterChange={(v) => setFilter('transaction_date', v)}
                    width={columnWidths['transaction_date']}
                    onResize={(w) => handleResize('transaction_date', w)}
                  >
                    Ngày giờ GD
                  </SortableTh>
                )}
                {isColumnVisible('bank_account') && (
                  <SortableTh
                    field="bank_account"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['bank_account']}
                    onFilterChange={(v) => setFilter('bank_account', v)}
                    width={columnWidths['bank_account']}
                    onResize={(w) => handleResize('bank_account', w)}
                  >
                    NH / Số TK
                  </SortableTh>
                )}
                {isColumnVisible('counterparty_name') && (
                  <SortableTh
                    field="counterparty_name"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['counterparty_name']}
                    onFilterChange={(v) => setFilter('counterparty_name', v)}
                    width={columnWidths['counterparty_name']}
                    onResize={(w) => handleResize('counterparty_name', w)}
                  >
                    Đối tác
                  </SortableTh>
                )}
                {isColumnVisible('description') && (
                  <SortableTh
                    field="description"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['description']}
                    onFilterChange={(v) => setFilter('description', v)}
                    width={columnWidths['description']}
                    onResize={(w) => handleResize('description', w)}
                  >
                    Diễn giải
                  </SortableTh>
                )}
                {isColumnVisible('debit_amount') && (
                  <SortableTh
                    field="debit_amount"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['debit_amount']}
                    onFilterChange={(v) => setFilter('debit_amount', v)}
                    width={columnWidths['debit_amount']}
                    onResize={(w) => handleResize('debit_amount', w)}
                  >
                    Phát sinh Nợ (-)
                  </SortableTh>
                )}
                {isColumnVisible('credit_amount') && (
                  <SortableTh
                    field="credit_amount"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['credit_amount']}
                    onFilterChange={(v) => setFilter('credit_amount', v)}
                    width={columnWidths['credit_amount']}
                    onResize={(w) => handleResize('credit_amount', w)}
                  >
                    Phát sinh Có (+)
                  </SortableTh>
                )}
                {isColumnVisible('running_balance') && (
                  <SortableTh
                    field="running_balance"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['running_balance']}
                    onFilterChange={(v) => setFilter('running_balance', v)}
                    width={columnWidths['running_balance']}
                    onResize={(w) => handleResize('running_balance', w)}
                  >
                    Số dư Lũy kế
                  </SortableTh>
                )}
                {isColumnVisible('category_name') && (
                  <SortableTh
                    field="category_name"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['category_name']}
                    onFilterChange={(v) => setFilter('category_name', v)}
                    width={columnWidths['category_name']}
                    onResize={(w) => handleResize('category_name', w)}
                  >
                    Danh mục
                  </SortableTh>
                )}
                {isColumnVisible('internal_note') && (
                  <SortableTh
                    field="internal_note"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['internal_note']}
                    onFilterChange={(v) => setFilter('internal_note', v)}
                    width={columnWidths['internal_note']}
                    onResize={(w) => handleResize('internal_note', w)}
                  >
                    Ghi chú
                  </SortableTh>
                )}
                {isColumnVisible('is_locked') && (
                  <SortableTh
                    field="is_locked"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    filterType="text"
                    filterValue={filters['is_locked']}
                    onFilterChange={(v) => setFilter('is_locked', v)}
                    width={columnWidths['is_locked']}
                    onResize={(w) => handleResize('is_locked', w)}
                  >
                    Khóa
                  </SortableTh>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={TRANSACTION_COLUMNS.filter((c) => isColumnVisible(c.field)).length + 1} className="px-4 py-8 text-center text-slate-400 text-sm">
                    {loading ? 'Đang tải dữ liệu...' : 'Không có giao dịch nào khớp điều kiện lọc.'}
                  </td>
                </tr>
              ) : (
                sortedTransactions.map((tx) => (
                  <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(tx.transaction_id)}
                        onChange={() => toggleSelectRow(tx.transaction_id)}
                        className="rounded border-slate-300"
                      />
                    </td>
{isColumnVisible('transaction_date') && (
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px]">
                      <div>{tx.transaction_date.slice(0, 10)}</div>
                      <div className="text-slate-400">{tx.transaction_date.slice(11, 19)}</div>
                    </td>
                  )}
{isColumnVisible('bank_account') && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{tx.bank_code || 'MBB'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{tx.account_number}</div>
                    </td>
                  )}
{isColumnVisible('counterparty_name') && (
                    <td className="px-3 py-2.5 min-w-[180px] max-w-xs">
                      {tx.counter_party ? (
                        <div className="font-semibold text-slate-900 break-words leading-snug">
                          {tx.counter_party}
                        </div>
                      ) : (
                        <span className="text-slate-300 italic">—</span>
                      )}
                    </td>
                  )}
{isColumnVisible('description') && (
                    <td className="px-3 py-2.5 min-w-[260px] max-w-lg">
                      <div className="text-slate-800 whitespace-normal break-words leading-relaxed" title={tx.description}>
                        {tx.description}
                      </div>
                      {tx.reference_number && (
                        <div className="font-mono text-[10px] text-slate-400 mt-1 break-all">
                          Mã GD: {tx.reference_number}
                        </div>
                      )}
                    </td>
                  )}
{isColumnVisible('debit_amount') && (
                    <td className="px-3 py-2.5 text-right font-mono text-red-600 font-medium whitespace-nowrap">
                      {Number(tx.debit_amount) > 0 ? Number(tx.debit_amount).toLocaleString('vi-VN') : '—'}
                    </td>
                  )}
{isColumnVisible('credit_amount') && (
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600 font-medium whitespace-nowrap">
                      {Number(tx.credit_amount) > 0 ? Number(tx.credit_amount).toLocaleString('vi-VN') : '—'}
                    </td>
                  )}
{isColumnVisible('running_balance') && (
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
                          title="Bấm để sửa số dư lũy kế tại dòng này (Hệ thống sẽ lấy làm mốc Điểm Neo để tính lại toàn bộ số dư lũy kế xuôi & ngược - US-04.9)"
                          className="group inline-flex flex-col items-end gap-0.5 cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-2 py-1 rounded transition-colors"
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{Number(tx.running_balance).toLocaleString('vi-VN')}</span>
                            <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                          </div>
                          {tx.is_anchor_point && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              📌 Mốc neo
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {isColumnVisible('category_name') && (
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
                      {tx.category_name === 'Trả nợ' && Number(tx.debit_amount) > 0 && (
                        <a
                          href="/loan-repayments"
                          className="inline-flex items-center space-x-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded mt-1 transition-colors"
                          title="Chuyển sang trang Đối soát Trả nợ & Giảm trừ nợ gốc"
                        >
                          <CheckCheck className="w-3 h-3 text-indigo-500" />
                          <span>Đối soát nợ</span>
                        </a>
                      )}
                    </td>
                  )}
                  {isColumnVisible('internal_note') && (
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
                  )}
                  {isColumnVisible('is_locked') && (
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
                  )}
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
