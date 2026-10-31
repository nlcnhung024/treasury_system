import React, { useState, useEffect } from 'react';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
  Search,
  DollarSign,
  Calendar,
  Percent,
  Layers,
  Building,
  RefreshCw,
  Clock,
} from 'lucide-react';
import api from '../services/api';
import { CreditFacility, CreditStatementFile, CreditFacilitySummary } from '../types';

export const CreditStatementsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'loans' | 'files' | 'banks'>('loans');
  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [files, setFiles] = useState<CreditStatementFile[]>([]);
  const [summary, setSummary] = useState<CreditFacilitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessages, setUploadMessages] = useState<
    Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }>
  >([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [dueFilter, setDueFilter] = useState<string>('ALL');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [loansRes, filesRes, summaryRes] = await Promise.all([
        api.get('/loans', { params: { limit: 100 } }),
        api.get('/credit-statements', { params: { limit: 50 } }),
        api.get('/loans/summary'),
      ]);
      setLoans(loansRes.data.data || []);
      setFiles(filesRes.data.data || []);
      setSummary(summaryRes.data || null);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu sao kê tín dụng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const uploadFiles = async (fileList: File[]) => {
    setIsUploading(true);
    const results: Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }> = [];

    for (const file of fileList) {
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
      formData.append('uploaded_by', 'Chị Cẩm Nhung');

      try {
        const res = await api.post('/credit-statements/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const d = res.data;
        results.push({
          filename: file.name,
          type: d.reconciliation_status === 'BALANCED' ? 'success' : 'warning',
          text: d.message || `Bóc tách thành công (${d.template_code})!`,
        });
      } catch (err: any) {
        results.push({
          filename: file.name,
          type: 'error',
          text: err.response?.data?.detail || err.message || 'Lỗi khi upload file.',
        });
      }
    }

    setUploadMessages(results);
    setIsUploading(false);
    await fetchData();
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file sao kê tín dụng #${fileId}?`)) return;
    try {
      await api.delete(`/credit-statements/${fileId}`);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa file.');
    }
  };

  const formatVND = (val: number | undefined | null) => {
    if (val === undefined || val === null) return '0 ₫';
    return `${Number(val).toLocaleString('vi-VN')} ₫`;
  };

  // Filter loans
  const filteredLoans = loans.filter((loan) => {
    if (bankFilter !== 'ALL' && loan.bank_code !== bankFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchNo = loan.contract_number.toLowerCase().includes(q);
      const matchPurpose = loan.loan_purpose?.toLowerCase().includes(q) || false;
      const matchHolder = loan.borrower_name.toLowerCase().includes(q);
      if (!matchNo && !matchPurpose && !matchHolder) return false;
    }
    if (dueFilter === '7DAYS') {
      if (!loan.next_repayment_date) return false;
      const due = new Date(loan.next_repayment_date).getTime();
      const now = new Date().getTime();
      const diffDays = (due - now) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 7) return false;
    }
    if (dueFilter === '30DAYS') {
      if (!loan.next_repayment_date) return false;
      const due = new Date(loan.next_repayment_date).getTime();
      const now = new Date().getTime();
      const diffDays = (due - now) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 30) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building className="w-7 h-7 text-indigo-600" />
            Quản Lý & Đối Soát Sao Kê Tín Dụng
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi danh mục hợp đồng vay, khế ước nhận nợ LD và lịch nghĩa vụ trả nợ gốc/lãi đến hạn
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Tổng Dư Nợ Vay</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatVND(summary?.total_principal_balance)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary?.total_active_loans || 0} khoản vay đang hoạt động
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Lãi Dự Trả / Lũy Kế</span>
            <Percent className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600">
            {formatVND((summary?.total_accrued_interest || 0) + (summary?.total_upcoming_interest_due || 0))}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Đến hạn gần nhất: {formatVND(summary?.total_upcoming_interest_due)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Đến Hạn Trong 7 Ngày</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600">
            {formatVND(summary?.total_upcoming_due_7days)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Gốc & lãi cần thanh toán tuần tới</div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Đến Hạn Trong 30 Ngày</span>
            <Calendar className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-600">
            {formatVND(summary?.total_upcoming_due_30days)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Gốc & lãi trong tháng tới</div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Lãi Suất BQ (WAIR)</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-purple-600">
            {summary?.weighted_avg_interest_rate ? `${Number(summary.weighted_avg_interest_rate).toFixed(2)} %` : '0.00 %'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Weighted Average Interest Rate</div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-600" />
          Nạp File Sao Kê Danh Sách Khoản Vay & Khế Ước LD
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Hỗ trợ bóc tách tự động: <strong>VietinBank eFAST</strong> (Báo cáo danh sách khoản vay .xls) và <strong>BIDV</strong> (Báo cáo số dư tài khoản Vay/LD .xlsx).
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-xl p-8 text-center transition-all cursor-pointer relative"
        >
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-medium text-slate-700">
              {isUploading ? 'Đang phân tích và đối soát file...' : 'Kéo thả file sao kê tín dụng vào đây, hoặc click để chọn file'}
            </div>
            <div className="text-xs text-slate-400">
              Chấp nhận định dạng .xlsx, .xls (Tối đa 25MB)
            </div>
          </div>
        </div>

        {uploadMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${
                  msg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : msg.type === 'warning'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {msg.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <span className="font-semibold">{msg.filename}: </span>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('loans')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'loans'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Danh Mục Khoản Vay & Khế Ước ({filteredLoans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('banks')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'banks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Phân Bổ Dư Nợ Theo Ngân Hàng ({summary?.by_bank.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'files'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Lịch Sử File Sao Kê Đã Nạp ({files.length})</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Danh Mục Khoản Vay */}
      {activeTab === 'loans' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm số LD, mục đích vay..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <select
                aria-label="Lọc theo ngân hàng"
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả ngân hàng</option>
                <option value="CTG">VietinBank (CTG)</option>
                <option value="BIDV">BIDV</option>
              </select>

              <select
                aria-label="Lọc theo ngày đến hạn"
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả kỳ hạn</option>
                <option value="7DAYS">Đến hạn trong 7 ngày</option>
                <option value="30DAYS">Đến hạn trong 30 ngày</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  <th className="py-3 px-3">Số LD / Hợp Đồng</th>
                  <th className="py-3 px-3">Ngân Hàng</th>
                  <th className="py-3 px-3">Mục Đích Khoản Vay</th>
                  <th className="py-3 px-3 text-right">Dư Nợ Gốc (VND)</th>
                  <th className="py-3 px-3 text-center">Lãi Suất</th>
                  <th className="py-3 px-3">Giải Ngân - Đáo Hạn</th>
                  <th className="py-3 px-3 text-right">Gốc Đến Hạn</th>
                  <th className="py-3 px-3 text-right">Lãi Phải Trả</th>
                  <th className="py-3 px-3 text-center">Ngày Thu Nợ</th>
                  <th className="py-3 px-3 text-center">Nhóm Nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Chưa có khoản vay nào phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                ) : (
                  filteredLoans.map((loan) => (
                    <tr key={loan.loan_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-indigo-700">
                        {loan.contract_number}
                        {loan.term && <span className="ml-1 text-slate-400 font-normal">({loan.term})</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            loan.bank_code === 'CTG'
                              ? 'bg-blue-100 text-blue-700'
                              : loan.bank_code === 'BIDV'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {loan.bank_code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={loan.loan_purpose || ''}>
                        {loan.loan_purpose || 'Vay phục vụ SXKD'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {Number(loan.current_principal_balance).toLocaleString('vi-VN')} ₫
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                        {Number(loan.interest_rate).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {loan.disbursement_date || '-'} $\rightarrow$ {loan.maturity_date || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                        {loan.next_principal_amount > 0 ? `${Number(loan.next_principal_amount).toLocaleString('vi-VN')} ₫` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-600">
                        {loan.next_interest_amount > 0 ? `${Number(loan.next_interest_amount).toLocaleString('vi-VN')} ₫` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">
                        {loan.next_repayment_date ? (
                          <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                            <Calendar className="w-3.5 h-3.5" />
                            {loan.next_repayment_date}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Nhóm {loan.debt_group}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Phân Bổ Ngân Hàng */}
      {activeTab === 'banks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary?.by_bank.map((b) => (
            <div key={b.bank_code} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow ${
                      b.bank_code === 'CTG' ? 'bg-blue-600' : 'bg-emerald-600'
                    }`}
                  >
                    {b.bank_code}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{b.bank_name}</h3>
                    <p className="text-xs text-slate-500">{b.loans_count} khoản vay / khế ước hoạt động</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Lãi suất bình quân</div>
                  <div className="text-base font-bold text-indigo-600">
                    {Number(b.weighted_avg_interest_rate).toFixed(2)} %/năm
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500">Dư nợ gốc hiện tại</div>
                  <div className="font-bold text-slate-900 text-base mt-0.5">{formatVND(b.total_principal_balance)}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500">Lãi cộng dồn / dự trả</div>
                  <div className="font-bold text-emerald-600 text-base mt-0.5">
                    {formatVND(b.total_accrued_interest || b.upcoming_interest_due)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500">Gốc đến hạn gần nhất</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{formatVND(b.upcoming_principal_due)}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500">Lãi phải trả gần nhất</div>
                  <div className="font-bold text-amber-600 text-sm mt-0.5">{formatVND(b.upcoming_interest_due)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Lịch Sử File Đã Nạp */}
      {activeTab === 'files' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  <th className="py-3 px-3">File ID</th>
                  <th className="py-3 px-3">Ngân Hàng</th>
                  <th className="py-3 px-3">Tên File Gốc</th>
                  <th className="py-3 px-3">Mã Mẫu</th>
                  <th className="py-3 px-3">Ngày Số Liệu</th>
                  <th className="py-3 px-3 text-right">Tổng Dư Nợ</th>
                  <th className="py-3 px-3 text-center">Số Khoản Vay</th>
                  <th className="py-3 px-3 text-center">Đối Soát Cân Bằng</th>
                  <th className="py-3 px-3">Ngày Tải Lên</th>
                  <th className="py-3 px-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Chưa có file sao kê tín dụng nào được nạp vào hệ thống.
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.file_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-500">#{file.file_id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{file.bank_code}</td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={file.original_filename}>
                        {file.original_filename}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{file.template_code}</td>
                      <td className="py-2.5 px-3 text-slate-600">{file.statement_date || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {Number(file.total_principal_amount).toLocaleString('vi-VN')} ₫
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                        {file.total_contracts_count}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {file.reconciliation_status === 'BALANCED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Khớp 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Lệch số dư
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(file.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleDeleteFile(file.file_id)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          title="Xóa file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
