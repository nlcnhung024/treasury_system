import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Trash2,
  FileSpreadsheet,
  Sparkles,
  Building2,
} from 'lucide-react';
import api from '../services/api';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';
import { StatementFile } from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { TableGridToolbar } from '../components/common/TableGridToolbar';
import { useTableGrid } from '../hooks/useTableGrid';
import { ColumnConfig } from '../types/grid';

const STATEMENT_FILE_COLUMNS: ColumnConfig[] = [
  { field: 'original_filename', label: 'File Sao Kê / Kỳ', type: 'text', defaultWidth: 230 },
  { field: 'bank_account', label: 'Ngân hàng & Số TK', type: 'text', defaultWidth: 170 },
  { field: 'template_code', label: 'Mẫu & Chế độ Đối soát', type: 'text', defaultWidth: 150 },
  { field: 'total_transactions', label: 'Số dòng', type: 'number', align: 'center', defaultWidth: 90 },
  { field: 'opening_balance', label: 'Số dư Đầu kỳ', type: 'number', align: 'right', defaultWidth: 130 },
  { field: 'total_credit', label: 'Tổng Có (+)', type: 'number', align: 'right', defaultWidth: 130 },
  { field: 'total_debit', label: 'Tổng Nợ (-)', type: 'number', align: 'right', defaultWidth: 130 },
  { field: 'closing_balance', label: 'Số dư Cuối kỳ', type: 'number', align: 'right', defaultWidth: 130 },
  { field: 'reconciliation_status', label: 'Trạng thái Đối soát', type: 'text', align: 'center', defaultWidth: 150 },
];

export const UploadPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();
  const [selectedBank, setSelectedBank] = useState<string>('AUTO_DETECT');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessages, setUploadMessages] = useState<
    Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }>
  >([]);
  const [statements, setStatements] = useState<StatementFile[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);

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
  } = useTableGrid<StatementFile>({
    tableId: 'upload_statements_table',
    columns: STATEMENT_FILE_COLUMNS,
    defaultSortField: 'file_id',
    defaultSortDirection: 'desc',
  });

  const sortedStatements = useMemo(() => {
    return filterAndSort(statements, {
      bank_account: (st) => `${st.bank_code || ''} ${st.account_number || ''} ${st.account_holder || ''}`,
      total_transactions: (st) => st.total_transactions_count,
      opening_balance: (st) => st.header_opening_balance,
      total_credit: (st) => st.total_credit_amount,
      total_debit: (st) => st.total_debit_amount,
      closing_balance: (st) => st.calculated_closing_balance,
    });
  }, [statements, filterAndSort]);

  const fetchStatements = async () => {
    setLoadingList(true);
    try {
      const res = await api.get('/statements', { params: { limit: 50 } });
      setStatements(res.data.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách sao kê:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, []);

  // Tự động Polling nếu có file đang ở trạng thái QUEUED / PARSING / RECONCILING
  useEffect(() => {
    const hasPending = statements.some((s) =>
      ['UPLOADED', 'QUEUED', 'PARSING', 'RECONCILING'].includes(s.processing_status)
    );
    if (!hasPending) return;
    const timer = setInterval(() => {
      fetchStatements();
    }, 2000);
    return () => clearInterval(timer);
  }, [statements]);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadMultipleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadMultipleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const uploadMultipleFiles = async (files: File[]) => {
    setIsUploading(true);
    const results: Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }> = [];

    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        results.push({
          filename: file.name,
          type: 'error',
          text: 'Dung lượng file vượt quá giới hạn 25MB.',
        });
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);
      if (selectedBank !== 'AUTO_DETECT') {
        formData.append('bank_code', selectedBank);
      }
      if (selectedEntity && selectedEntity.id !== 'ALL') {
        formData.append('account_holder', selectedEntity.name);
      }

      try {
        const res = await api.post('/statements/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const data = res.data;
        results.push({
          filename: file.name,
          type: data.warning ? 'warning' : 'success',
          text: data.message || `Thành công! File ID: ${data.file_id} (${data.detected_template_code})`,
        });
      } catch (err: any) {
        results.push({
          filename: file.name,
          type: 'error',
          text: err.response?.data?.detail || err.message || 'Lỗi tải file',
        });
      }
    }

    setUploadMessages(results);
    setIsUploading(false);
    await fetchStatements();
  };

  const handleDeleteFile = async (fileId: number, filename: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa file sao kê "${filename}" và toàn bộ giao dịch liên kết?`)) {
      return;
    }
    try {
      await api.delete(`/statements/${fileId}`);
      await fetchStatements();
    } catch (err: any) {
      alert(`Không thể xóa file: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Khu vực Kéo Thả Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Tiếp nhận & Bóc tách Sao kê Ngân hàng Tự động</h1>
            <p className="text-sm text-slate-500 mt-1">
              Hỗ trợ kéo-thả 1 hoặc nhiều file cùng lúc (.xlsx, .xls) • Tự động nhận diện 7 mẫu ngân hàng & Đối soát 5 chế độ (Δ = 0).
            </p>
          </div>
          <div className="min-w-[290px]">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Chế độ Nhận diện Ngân hàng
            </label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="AUTO_DETECT">✨ Tự động nhận diện (Auto-Detect Signature)</option>
              <option value="MBB">MBBank (Tự phân biệt Doanh nghiệp & Cá nhân CEO)</option>
              <option value="MBV">MBV Business (Ngân hàng TNHH MTV Việt Nam Hiện Đại)</option>
              <option value="VPB">VPBank (Ngân hàng TMCP Việt Nam Thịnh Vượng)</option>
              <option value="TPB">TPBank (Ngân hàng TMCP Tiên Phong)</option>
              <option value="CTG">VietinBank eFAST (Ngân hàng TMCP Công Thương VN)</option>
              <option value="SHB">SHB (Ngân hàng TMCP Sài Gòn - Hà Nội)</option>
            </select>
          </div>
        </div>

                {/* Active Corporate Entity Banner */}
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-slate-700">
              Doanh nghiệp nạp sao kê: <strong className="text-blue-900 font-bold">{selectedEntity.name}</strong>
              {selectedEntity.taxCode && (
                <span className="ml-1 font-mono text-slate-500 font-medium">({selectedEntity.taxCode})</span>
              )}
            </span>
          </div>
          <span className="text-[11px] text-blue-600 font-medium hidden sm:inline">
            (Thực thể tự động đồng bộ từ Dropdown Header)
          </span>
        </div>
<div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition-colors bg-slate-50 cursor-pointer"
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
          />
          <label htmlFor="file-upload" className="cursor-pointer block">
            <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
              {isUploading ? <Clock className="w-7 h-7 animate-spin" /> : <Upload className="w-7 h-7" />}
            </div>
            <div className="text-base font-semibold text-slate-800">
              {isUploading
                ? 'Đang xác thực Magic Bytes, bóc tách & đối soát cân bằng số dư...'
                : 'Kéo & Thả 1 hoặc nhiều file sao kê (.xlsx, .xls) vào đây hoặc bấm để chọn file'}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Dung lượng tối đa 25MB/file • Kiểm tra Magic Bytes nhị phân • Chống nạp trùng SHA-256
              </span>
            </div>
          </label>
        </div>

        {uploadMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-sm flex items-start space-x-2.5 ${
                  msg.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : msg.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                {msg.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                ) : msg.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <span className="font-semibold">{msg.filename}: </span>
                  <span>{msg.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bảng Lịch Sử File Sao Kê & Kết Quả Đối Soát Cân Bằng Kế Toán */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span>Lịch Sử Nạp Sao Kê & Kết Quả Đối Soát Kế Toán ({statements.length} file)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kiểm chứng tự động: Số dư Đầu kỳ + Tổng Thu (Có) - Tổng Chi (Nợ) = Số dư Cuối kỳ (Δ = 0.00 VND)
            </p>
          </div>
          <button
            onClick={fetchStatements}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* Table Grid Toolbar */}
        <TableGridToolbar
          columns={STATEMENT_FILE_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onShowAllColumns={showAllColumns}
          onResetColumns={resetColumns}
          filteredCount={sortedStatements.length}
          totalCount={statements.length}
          activeFilterCount={activeFilterCount}
          onClearAllFilters={clearAllFilters}
        />

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                {isColumnVisible('original_filename') && (
                  <SortableTh
                    field="original_filename"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['original_filename']}
                    onFilterChange={(v) => setFilter('original_filename', v)}
                    width={columnWidths['original_filename']}
                    onResize={(w) => handleResize('original_filename', w)}
                  >
                    File Sao Kê / Kỳ
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
                    Ngân hàng & Số TK
                  </SortableTh>
                )}
                {isColumnVisible('template_code') && (
                  <SortableTh
                    field="template_code"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['template_code']}
                    onFilterChange={(v) => setFilter('template_code', v)}
                    width={columnWidths['template_code']}
                    onResize={(w) => handleResize('template_code', w)}
                  >
                    Mẫu & Chế độ Đối soát
                  </SortableTh>
                )}
                {isColumnVisible('total_transactions') && (
                  <SortableTh
                    field="total_transactions"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    filterType="number"
                    filterValue={filters['total_transactions']}
                    onFilterChange={(v) => setFilter('total_transactions', v)}
                    width={columnWidths['total_transactions']}
                    onResize={(w) => handleResize('total_transactions', w)}
                  >
                    Số dòng
                  </SortableTh>
                )}
                {isColumnVisible('opening_balance') && (
                  <SortableTh
                    field="opening_balance"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['opening_balance']}
                    onFilterChange={(v) => setFilter('opening_balance', v)}
                    width={columnWidths['opening_balance']}
                    onResize={(w) => handleResize('opening_balance', w)}
                  >
                    Số dư Đầu kỳ
                  </SortableTh>
                )}
                {isColumnVisible('total_credit') && (
                  <SortableTh
                    field="total_credit"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['total_credit']}
                    onFilterChange={(v) => setFilter('total_credit', v)}
                    width={columnWidths['total_credit']}
                    onResize={(w) => handleResize('total_credit', w)}
                  >
                    Tổng Có (+)
                  </SortableTh>
                )}
                {isColumnVisible('total_debit') && (
                  <SortableTh
                    field="total_debit"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['total_debit']}
                    onFilterChange={(v) => setFilter('total_debit', v)}
                    width={columnWidths['total_debit']}
                    onResize={(w) => handleResize('total_debit', w)}
                  >
                    Tổng Nợ (-)
                  </SortableTh>
                )}
                {isColumnVisible('closing_balance') && (
                  <SortableTh
                    field="closing_balance"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                    filterType="number"
                    filterValue={filters['closing_balance']}
                    onFilterChange={(v) => setFilter('closing_balance', v)}
                    width={columnWidths['closing_balance']}
                    onResize={(w) => handleResize('closing_balance', w)}
                  >
                    Số dư Cuối kỳ
                  </SortableTh>
                )}
                {isColumnVisible('reconciliation_status') && (
                  <SortableTh
                    field="reconciliation_status"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    filterType="text"
                    filterValue={filters['reconciliation_status']}
                    onFilterChange={(v) => setFilter('reconciliation_status', v)}
                    width={columnWidths['reconciliation_status']}
                    onResize={(w) => handleResize('reconciliation_status', w)}
                  >
                    Trạng thái Đối soát
                  </SortableTh>
                )}
                <th className="px-3 py-3 text-center w-20">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedStatements.length === 0 ? (
                <tr>
                  <td
                    colSpan={STATEMENT_FILE_COLUMNS.filter((c) => isColumnVisible(c.field)).length + 1}
                    className="px-4 py-8 text-center text-slate-400 text-sm"
                  >
                    Chưa có file sao kê nào được tải lên hoặc không khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                sortedStatements.map((st) => (
                  <tr key={st.file_id} className="hover:bg-slate-50 transition-colors">
                    {isColumnVisible('original_filename') && (
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900 max-w-[220px] truncate" title={st.original_filename}>
                          {st.original_filename}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {st.statement_period_start && st.statement_period_end
                            ? `Kỳ: ${st.statement_period_start} → ${st.statement_period_end}`
                            : `Tải lên: ${new Date(st.created_at).toLocaleString('vi-VN')}`}
                        </div>
                      </td>
                    )}
                    {isColumnVisible('bank_account') && (
                      <td className="px-3 py-3">
                        <div className="font-bold text-blue-700">
                          {st.bank_code || '—'} • <span className="font-mono">{st.account_number || '—'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 max-w-[180px] truncate" title={st.account_holder || ''}>
                          {st.account_holder || '—'}
                        </div>
                      </td>
                    )}
                    {isColumnVisible('template_code') && (
                      <td className="px-3 py-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold">
                          {st.template_code || 'AUTO'}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {st.reconciliation_mode || '—'}
                        </div>
                      </td>
                    )}
                    {isColumnVisible('total_transactions') && (
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-800">
                        {st.total_transactions_count}
                      </td>
                    )}
                    {isColumnVisible('opening_balance') && (
                      <td className="px-3 py-3 text-right font-mono text-slate-700">
                        {st.header_opening_balance !== null && st.header_opening_balance !== undefined
                          ? Number(st.header_opening_balance).toLocaleString('vi-VN')
                          : '—'}
                      </td>
                    )}
                    {isColumnVisible('total_credit') && (
                      <td className="px-3 py-3 text-right font-mono text-emerald-600 font-medium">
                        +{Number(st.total_credit_amount).toLocaleString('vi-VN')}
                      </td>
                    )}
                    {isColumnVisible('total_debit') && (
                      <td className="px-3 py-3 text-right font-mono text-red-600 font-medium">
                        -{Number(st.total_debit_amount).toLocaleString('vi-VN')}
                      </td>
                    )}
                    {isColumnVisible('closing_balance') && (
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                        {st.calculated_closing_balance !== null && st.calculated_closing_balance !== undefined
                          ? Number(st.calculated_closing_balance).toLocaleString('vi-VN')
                          : '—'}
                      </td>
                    )}
                    {isColumnVisible('reconciliation_status') && (
                      <td className="px-3 py-3 text-center">
                      {st.reconciliation_status === 'BALANCED' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            BALANCED (Δ=0)
                          </span>
                          {st.has_data_gap && (
                            <div className="mt-1">
                              <span
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.2 rounded"
                                title="Phát hiện khoảng trống hoặc lệch số dư giữa các kỳ sao kê (ĐK kỳ sau ≠ CK kỳ trước)"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                Lệch kỳ sao kê
                              </span>
                            </div>
                          )}
                        </div>
                      ) : st.reconciliation_status === 'DISCREPANCY' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                            LỆCH SỐ DƯ
                          </span>
                          <div className="text-[10px] text-red-600 font-mono mt-0.5">
                            Δ = {Number(st.discrepancy_amount).toLocaleString('vi-VN')}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          {st.processing_status}
                        </span>
                      )}
                    </td>
                    )}
                    {isColumnVisible('actions') && (
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleDeleteFile(st.file_id, st.original_filename)}
                          title="Xóa file sao kê này"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
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