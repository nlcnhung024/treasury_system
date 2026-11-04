import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Trash2,
  Eye,
  Plus,
  RefreshCw,
  Building2,
  Receipt,
  X,
} from 'lucide-react';
import api from '../services/api';
import {
  InvoiceRegistryItem,
  InvoiceListResponse,
  LoanAllocatedInvoicesResponse,
  CreditFacility,
} from '../types/credit';

export const InvoiceRegistryPage: React.FC = () => {
  // State danh sách & thống kê
  const [invoices, setInvoices] = useState<InvoiceRegistryItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalValue, setTotalValue] = useState<number>(0);
  const [totalAllocated, setTotalAllocated] = useState<number>(0);
  const [totalRemaining, setTotalRemaining] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bộ lọc
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [bankFilter, setBankFilter] = useState<string>('');

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isZipModalOpen, setIsZipModalOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRegistryItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isAttachPdfModalOpen, setIsAttachPdfModalOpen] = useState<boolean>(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState<boolean>(false);

  // Form Upload XML & PDF
  const [uploadXmlFile, setUploadXmlFile] = useState<File | null>(null);
  const [uploadPdfFile, setUploadPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Form Upload ZIP
  const [uploadZipFile, setUploadZipFile] = useState<File | null>(null);

  // Form Attach PDF
  const [attachPdfFile, setAttachPdfFile] = useState<File | null>(null);

  // Form Allocate to Loan
  const [loansList, setLoansList] = useState<CreditFacility[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<number | ''>('');
  const [allocationAmount, setAllocationAmount] = useState<string>('');
  const [allocationNote, setAllocationNote] = useState<string>('');
  const [strictCheck, setStrictCheck] = useState<boolean>(false);
  const [isAllocating, setIsAllocating] = useState<boolean>(false);
  const [allocatedInvoicesInfo, setAllocatedInvoicesInfo] = useState<LoanAllocatedInvoicesResponse | null>(null);

  // Tải danh sách hóa đơn
  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { limit: 100, offset: 0 };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (statusFilter) params.status = statusFilter;
      if (bankFilter) params.locked_bank_code = bankFilter;

      const res = await api.get<InvoiceListResponse>('/invoices', { params });
      setInvoices(res.data.items || []);
      setTotalCount(res.data.total || 0);
      setTotalValue(Number(res.data.total_value) || 0);
      setTotalAllocated(Number(res.data.total_allocated) || 0);
      setTotalRemaining(Number(res.data.total_remaining) || 0);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Không thể tải danh sách hóa đơn.');
    } finally {
      setLoading(false);
    }
  };

  // Tải danh sách khoản vay phục vụ modal phân bổ
  const fetchLoans = async () => {
    try {
      const res = await api.get('/loans', { params: { limit: 200 } });
      const items = res.data?.items || res.data || [];
      setLoansList(items);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchLoans();
  }, [statusFilter, bankFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvoices();
  };

  // Đồng bộ hóa đơn từ hồ sơ giải ngân các khoản vay
  const handleSyncFromLoans = async () => {
    try {
      setSyncing(true);
      setError(null);
      const res = await api.post('/invoices/sync-from-loans');
      setSuccessMessage(res.data?.message || 'Đồng bộ hóa đơn từ các khoản vay thành công!');
      await fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Lỗi khi đồng bộ hóa đơn từ hồ sơ giải ngân.');
    } finally {
      setSyncing(false);
    }
  };

  // Xử lý nạp cặp file XML & PDF
  const handleUploadSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadXmlFile) {
      alert('Vui lòng chọn file XML hóa đơn điện tử.');
      return;
    }
    try {
      setIsUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('xml_file', uploadXmlFile);
      if (uploadPdfFile) {
        formData.append('pdf_file', uploadPdfFile);
      }

      await api.post('/invoices/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessMessage('Nạp và bóc tách hóa đơn thành công!');
      setIsUploadModalOpen(false);
      setUploadXmlFile(null);
      setUploadPdfFile(null);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Lỗi khi nạp hóa đơn.');
    } finally {
      setIsUploading(false);
    }
  };

  // Xử lý nạp gói ZIP (Sample_hoa_don)
  const handleUploadZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadZipFile) {
      alert('Vui lòng chọn file ZIP.');
      return;
    }
    try {
      setIsUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('zip_file', uploadZipFile);

      const res = await api.post('/invoices/upload-batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const count = Array.isArray(res.data) ? res.data.length : 1;
      setSuccessMessage(`Đã nạp và ghép cặp thành công ${count} hóa đơn từ gói ZIP!`);
      setIsZipModalOpen(false);
      setUploadZipFile(null);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Lỗi khi giải nén và nạp gói ZIP.');
    } finally {
      setIsUploading(false);
    }
  };

  // Xử lý gắn PDF bổ sung
  const handleAttachPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !attachPdfFile) return;
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('pdf_file', attachPdfFile);

      await api.post(`/invoices/${selectedInvoice.invoice_id}/attach-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessMessage(`Đã liên kết file PDF cho hóa đơn #${selectedInvoice.invoice_number}!`);
      setIsAttachPdfModalOpen(false);
      setAttachPdfFile(null);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Lỗi khi gắn file PDF.');
    } finally {
      setIsUploading(false);
    }
  };

  // Mở modal phân bổ
  const openAllocateModal = (inv: InvoiceRegistryItem) => {
    setSelectedInvoice(inv);
    setSelectedLoanId('');
    setAllocationAmount(inv.remaining_amount.toString());
    setAllocationNote('');
    setAllocatedInvoicesInfo(null);
    setIsAllocateModalOpen(true);
  };

  // Khi người dùng chọn một khoản vay trong modal phân bổ
  const handleSelectLoan = async (loanId: number) => {
    setSelectedLoanId(loanId);
    try {
      const res = await api.get<LoanAllocatedInvoicesResponse>(`/loans/${loanId}/allocated-invoices`);
      setAllocatedInvoicesInfo(res.data);
      if (selectedInvoice) {
        // Tự động gợi ý số tiền còn thiếu để khớp đúng 100% gốc ban đầu
        const needed = res.data.difference_amount;
        if (needed > 0) {
          const suggest = Math.min(Number(selectedInvoice.remaining_amount), Number(needed));
          setAllocationAmount(suggest.toString());
        }
      }
    } catch {
      setAllocatedInvoicesInfo(null);
    }
  };

  // Thực hiện phân bổ nhận nợ
  const handleExecuteAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !selectedLoanId) {
      alert('Vui lòng chọn khoản vay cần bảo đảm.');
      return;
    }
    const amt = parseFloat(allocationAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Vui lòng nhập số tiền nhận nợ hợp lệ lớn hơn 0.');
      return;
    }

    try {
      setIsAllocating(true);
      setError(null);

      // Lấy danh sách allocation hiện tại của khoản vay nếu có
      let currentAllocations: any[] = [];
      if (allocatedInvoicesInfo && allocatedInvoicesInfo.allocations) {
        currentAllocations = allocatedInvoicesInfo.allocations.map((a) => ({
          invoice_id: a.invoice_id,
          allocated_amount: a.allocated_amount,
          notes: a.notes,
        }));
      }

      // Thêm hoặc cập nhật phân bổ cho hóa đơn này
      const existingIdx = currentAllocations.findIndex((a) => a.invoice_id === selectedInvoice.invoice_id);
      if (existingIdx >= 0) {
        currentAllocations[existingIdx].allocated_amount = amt;
        currentAllocations[existingIdx].notes = allocationNote;
      } else {
        currentAllocations.push({
          invoice_id: selectedInvoice.invoice_id,
          allocated_amount: amt,
          notes: allocationNote,
        });
      }

      const res = await api.post(
        `/loans/${selectedLoanId}/allocate-invoices?strict_principal_check=${strictCheck}`,
        { allocations: currentAllocations }
      );

      setSuccessMessage(
        `Phân bổ nhận nợ thành công! Khoản vay ${res.data.contract_number} hiện bảo đảm: ${Number(
          res.data.total_allocated_amount
        ).toLocaleString('vi-VN')} ₫ / Gốc ${Number(res.data.original_principal_balance).toLocaleString('vi-VN')} ₫.`
      );
      setIsAllocateModalOpen(false);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Lỗi khi phân bổ nhận nợ.');
    } finally {
      setIsAllocating(false);
    }
  };

  // Xóa hóa đơn khỏi kho
  const handleDeleteInvoice = async (inv: InvoiceRegistryItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hóa đơn #${inv.invoice_number} khỏi kho dữ liệu?`)) return;
    try {
      await api.delete(`/invoices/${inv.invoice_id}`);
      setSuccessMessage(`Đã xóa hóa đơn #${inv.invoice_number}.`);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể xóa hóa đơn.');
    }
  };

  // Hủy một phân bổ nhận nợ
  const handleRemoveAllocation = async (allocationId: number) => {
    if (!window.confirm('Bạn có chắc muốn hủy phân bổ nhận nợ này? Hạn mức sẽ được hoàn lại cho hóa đơn.')) return;
    try {
      await api.delete(`/loans/0/allocated-invoices/${allocationId}`);
      setSuccessMessage('Đã hủy phân bổ nhận nợ thành công.');
      fetchInvoices();
      if (selectedInvoice) {
        // Tải lại chi tiết
        const updated = await api.get<InvoiceRegistryItem>(`/invoices/${selectedInvoice.invoice_id}`);
        setSelectedInvoice(updated.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể hủy phân bổ.');
    }
  };

  const fmtVND = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '0 ₫';
    return Number(val).toLocaleString('vi-VN') + ' ₫';
  };

  const fmtDate = (dStr: string | null | undefined) => {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString('vi-VN');
    } catch {
      return dStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tiêu đề */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Kho Hóa Đơn & Thống Kê Hóa Đơn Doanh Nghiệp</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Tiếp nhận hóa đơn điện tử XML (NĐ 123/TT 78), tự động ghép cặp file PDF & kiểm soát nhận nợ khoản vay (US-07.10)
              </p>
            </div>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nạp Hóa đơn (XML & PDF)</span>
          </button>
          <button
            onClick={() => setIsZipModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-all"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Nạp Gói ZIP (Tự ghép cặp)</span>
          </button>
          <button
            onClick={handleSyncFromLoans}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50"
            title="Tự động quét hồ sơ giải ngân các khoản vay và bổ sung hóa đơn chưa có vào kho"
          >
            <Building2 className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Hồ sơ Khoản vay'}</span>
          </button>
          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="p-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Thông báo lỗi / thành công */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Thống kê Hóa đơn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng số Hóa đơn</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalCount} <span className="text-xs font-normal text-slate-500">hóa đơn</span></div>
          <div className="text-[11px] text-slate-500 mt-1">Trong kho CSDL độc lập</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng Giá trị Hóa đơn</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{fmtVND(totalValue)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Đã bao gồm thuế GTGT</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Đã Nhận nợ Bảo đảm</div>
          <div className="text-2xl font-bold text-purple-600 mt-2">{fmtVND(totalAllocated)}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Tỷ lệ sử dụng: {totalValue > 0 ? ((totalAllocated / totalValue) * 100).toFixed(1) : 0}%
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Hạn mức Còn lại Khả dụng</div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{fmtVND(totalRemaining)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Có thể bảo đảm cho khoản vay mới</div>
        </div>
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo số hóa đơn, ký hiệu, tên bên bán / bên mua, mã số thuế..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none"
            >
              <option value="">-- Tất cả trạng thái --</option>
              <option value="AVAILABLE">Chưa nhận nợ (Khả dụng 100%)</option>
              <option value="PARTIALLY_ALLOCATED">Đã nhận nợ 1 phần (Còn dư)</option>
              <option value="FULLY_ALLOCATED">Đã nhận nợ hết (100%)</option>
            </select>

            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none"
            >
              <option value="">-- Tất cả Ngân hàng --</option>
              <option value="MBB">MBBank (MBB)</option>
              <option value="CTG">VietinBank (CTG)</option>
              <option value="VCB">Vietcombank (VCB)</option>
              <option value="BIDV">BIDV (BIDV)</option>
              <option value="TPB">TPBank (TPB)</option>
              <option value="VPB">VPBank (VPB)</option>
              <option value="EVF">EVF Finance</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900"
            >
              Lọc
            </button>
          </div>
        </form>
      </div>

      {/* Bảng Thống kê Hóa đơn Doanh nghiệp */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800">Danh mục Hóa đơn ({invoices.length})</h2>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            * Nguyên tắc: Hóa đơn dùng chung 1 tổ chức tín dụng. Cân bằng tuyệt đối với gốc ban đầu.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/75 text-slate-700 font-semibold border-b border-slate-200">
                <th className="px-4 py-3">Số HĐ / Ký hiệu</th>
                <th className="px-4 py-3">Ngày lập</th>
                <th className="px-4 py-3">Bên bán (Nhà cung cấp)</th>
                <th className="px-4 py-3 text-right">Tổng giá trị</th>
                <th className="px-4 py-3 text-right">Đã nhận nợ</th>
                <th className="px-4 py-3 text-right">Còn lại khả dụng</th>
                <th className="px-4 py-3 text-center">Ngân hàng khóa</th>
                <th className="px-4 py-3 text-center">Chứng từ đính kèm</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                    Đang tải danh sách hóa đơn...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    Chưa có hóa đơn nào trong kho. Hãy bấm <b>"Nạp Hóa đơn (XML & PDF)"</b> hoặc <b>"Nạp Gói ZIP"</b> để bắt đầu.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.invoice_id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Số HĐ & Ký hiệu */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{inv.invoice_number}</div>
                      <div className="text-[11px] text-slate-500">
                        Mẫu {inv.invoice_template} • {inv.invoice_series}
                      </div>
                    </td>

                    {/* Ngày lập */}
                    <td className="px-4 py-3 text-slate-600">{fmtDate(inv.invoice_date)}</td>

                    {/* Bên bán */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="font-medium text-slate-900 truncate" title={inv.seller_name}>
                        {inv.seller_name}
                      </div>
                      <div className="text-[11px] text-slate-500">MST: {inv.seller_tax_code}</div>
                    </td>

                    {/* Tổng giá trị */}
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtVND(inv.total_amount)}</td>

                    {/* Đã nhận nợ */}
                    <td className="px-4 py-3 text-right font-semibold text-purple-700">
                      {fmtVND(inv.allocated_amount)}
                    </td>

                    {/* Còn lại */}
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      {fmtVND(inv.remaining_amount)}
                    </td>

                    {/* Ngân hàng khóa */}
                    <td className="px-4 py-3 text-center">
                      {inv.locked_bank_code ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Lock className="w-3 h-3" />
                          {inv.locked_bank_code}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                          Tự do
                        </span>
                      )}
                    </td>

                    {/* Chứng từ đính kèm (XML / PDF) */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* File XML */}
                        {inv.xml_file_name && (
                          <a
                            href={`/api/v1/invoices/${inv.invoice_id}/download-xml`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-[11px] hover:bg-blue-100 border border-blue-200"
                            title="Tải XML gốc"
                          >
                            <FileText className="w-3 h-3" />
                            <span>XML</span>
                          </a>
                        )}

                        {/* File PDF */}
                        {inv.has_pdf ? (
                          <a
                            href={`/api/v1/invoices/${inv.invoice_id}/download-pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded text-[11px] hover:bg-red-100 border border-red-200 font-semibold"
                            title="Xem/Tải PDF tương ứng"
                          >
                            <Eye className="w-3 h-3" />
                            <span>PDF</span>
                          </a>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setIsAttachPdfModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] hover:bg-slate-200"
                            title="Chưa có PDF. Bấm để đính kèm"
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ PDF</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3 text-center">
                      {inv.status === 'AVAILABLE' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Chưa nhận nợ
                        </span>
                      )}
                      {inv.status === 'PARTIALLY_ALLOCATED' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                          Dùng 1 phần
                        </span>
                      )}
                      {inv.status === 'FULLY_ALLOCATED' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                          Đã dùng hết
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Xem chi tiết */}
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded"
                          title="Chi tiết hóa đơn & lịch sử nhận nợ"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Phân bổ cho khoản vay */}
                        {inv.remaining_amount > 0 && (
                          <button
                            onClick={() => openAllocateModal(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold hover:bg-emerald-700 shadow-sm"
                            title="Phân bổ bảo đảm cho khoản vay"
                          >
                            <Building2 className="w-3 h-3" />
                            <span>Nhận nợ</span>
                          </button>
                        )}

                        {/* Xóa nếu chưa nhận nợ */}
                        {inv.allocated_amount === 0 && (
                          <button
                            onClick={() => handleDeleteInvoice(inv)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Xóa hóa đơn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Nạp cặp XML & PDF */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Receipt className="w-5 h-5 text-blue-600" />
                <span>Nạp Hóa Đơn Điện Tử (XML & PDF)</span>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSingle} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. File XML Hóa đơn điện tử <span className="text-red-500">* (Bắt buộc)</span>
                </label>
                <input
                  type="file"
                  accept=".xml"
                  onChange={(e) => setUploadXmlFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg p-1"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">Định dạng chuẩn NĐ 123/2020/NĐ-CP & TT 78/2021/TT-BTC.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. File PDF Hóa đơn tương ứng (Tùy chọn)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setUploadPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 border border-slate-200 rounded-lg p-1"
                />
                <p className="text-[11px] text-slate-500 mt-1">Dùng để tra cứu và xem trực quan nguyên bản hóa đơn.</p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUploading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isUploading ? 'Đang bóc tách XML...' : 'Bóc tách & Lưu trữ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Nạp gói ZIP (Tự ghép cặp XML-PDF) */}
      {isZipModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <UploadCloud className="w-5 h-5 text-indigo-600" />
                <span>Nạp Hàng Loạt Từ Gói ZIP (Tự Động Ghép Cặp)</span>
              </div>
              <button onClick={() => setIsZipModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadZip} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chọn file ZIP chứa các file XML và PDF <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setUploadZipFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-200 rounded-lg p-1"
                  required
                />
                <div className="mt-3 p-3 bg-indigo-50/60 rounded-lg text-[11px] text-indigo-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    Cơ chế ghép cặp tự động thông minh:
                  </div>
                  <div>Hệ thống tự động rà soát và ghép cặp các file XML và PDF có cùng tên cơ sở (như mẫu trong thư mục <code>Resources/Sample_hoa_don</code>).</div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsZipModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isUploading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isUploading ? 'Đang xử lý gói ZIP...' : 'Giải nén & Ghép cặp'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Gắn PDF cho Hóa đơn */}
      {isAttachPdfModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="font-bold text-slate-900 text-sm">
                Đính kèm PDF cho Hóa đơn #{selectedInvoice.invoice_number}
              </div>
              <button onClick={() => setIsAttachPdfModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAttachPdf} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Chọn file PDF tương ứng</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setAttachPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 border border-slate-200 rounded-lg p-1"
                  required
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAttachPdfModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                >
                  {isUploading ? 'Đang lưu...' : 'Lưu file PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Chi tiết Hóa đơn (Items & Lịch sử Nhận nợ) */}
      {isDetailModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Hóa Đơn #{selectedInvoice.invoice_number} ({selectedInvoice.invoice_series})
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Mẫu số {selectedInvoice.invoice_template}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Mã CQT: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">{selectedInvoice.tax_authority_code || 'Chưa cấp'}</code> • Ngày lập: {fmtDate(selectedInvoice.invoice_date)}
                </div>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông tin Bên bán & Bên mua */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Đơn vị bán</div>
                <div className="font-semibold text-slate-900">{selectedInvoice.seller_name}</div>
                <div className="text-slate-500">MST: {selectedInvoice.seller_tax_code}</div>
                {selectedInvoice.seller_address && <div className="text-slate-500">{selectedInvoice.seller_address}</div>}
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Đơn vị mua</div>
                <div className="font-semibold text-slate-900">{selectedInvoice.buyer_name}</div>
                <div className="text-slate-500">MST: {selectedInvoice.buyer_tax_code}</div>
                {selectedInvoice.buyer_address && <div className="text-slate-500">{selectedInvoice.buyer_address}</div>}
              </div>
            </div>

            {/* Tóm tắt tiền tệ */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Tiền chưa thuế</div>
                <div className="text-sm font-bold text-slate-800">{fmtVND(selectedInvoice.subtotal_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Thuế GTGT</div>
                <div className="text-sm font-bold text-slate-800">{fmtVND(selectedInvoice.tax_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] text-blue-700 uppercase font-bold">Tổng thanh toán</div>
                <div className="text-base font-extrabold text-blue-700">{fmtVND(selectedInvoice.total_amount)}</div>
              </div>
            </div>

            {/* Chi tiết mặt hàng (Invoice Items) */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Chi tiết Danh mục Hàng hóa / Dịch vụ
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-center w-12">STT</th>
                      <th className="px-3 py-2">Tên hàng hóa, dịch vụ</th>
                      <th className="px-3 py-2 text-center">ĐVT</th>
                      <th className="px-3 py-2 text-right">Số lượng</th>
                      <th className="px-3 py-2 text-right">Đơn giá</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                      <th className="px-3 py-2 text-center">Thuế</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                      selectedInvoice.items.map((it) => (
                        <tr key={it.item_id}>
                          <td className="px-3 py-2 text-center text-slate-500">{it.line_number}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{it.item_name}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{it.unit || '-'}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{it.quantity ? Number(it.quantity).toLocaleString('vi-VN') : '-'}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{it.unit_price ? fmtVND(it.unit_price) : '-'}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">{fmtVND(it.subtotal)}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{it.tax_rate || '8%'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-slate-400">
                          Không có chi tiết từng dòng hàng hóa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lịch sử Nhận nợ cho các Khoản vay */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Lịch sử Phân bổ Nhận nợ Khoản vay ({selectedInvoice.allocations?.length || 0})
                </h4>
                {selectedInvoice.remaining_amount > 0 && (
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      openAllocateModal(selectedInvoice);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nhận nợ thêm ({fmtVND(selectedInvoice.remaining_amount)})</span>
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Khế ước / HĐTD</th>
                      <th className="px-3 py-2 text-center">Ngân hàng</th>
                      <th className="px-3 py-2 text-right">Số tiền nhận nợ</th>
                      <th className="px-3 py-2">Ngày phân bổ</th>
                      <th className="px-3 py-2">Ghi chú</th>
                      <th className="px-3 py-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.allocations && selectedInvoice.allocations.length > 0 ? (
                      selectedInvoice.allocations.map((al) => (
                        <tr key={al.allocation_id}>
                          <td className="px-3 py-2 font-bold text-slate-900">{al.contract_number}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800">
                              {al.bank_code}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-purple-700">
                            {fmtVND(al.allocated_amount)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(al.allocation_date)}</td>
                          <td className="px-3 py-2 text-slate-500">{al.notes || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleRemoveAllocation(al.allocation_id)}
                              className="text-red-500 hover:text-red-700 font-medium"
                              title="Hủy phân bổ nhận nợ"
                            >
                              Hủy
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                          Hóa đơn này chưa được dùng nhận nợ cho khoản vay nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Phân bổ Nhận nợ cho Khoản vay */}
      {isAllocateModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Phân Bổ Nhận Nợ Khoản Vay từ Hóa Đơn #{selectedInvoice.invoice_number}
                </h3>
              </div>
              <button onClick={() => setIsAllocateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông tin Hạn mức Hóa đơn */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Tổng Hóa đơn</div>
                <div className="font-bold text-slate-800">{fmtVND(selectedInvoice.total_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Đã dùng</div>
                <div className="font-bold text-purple-700">{fmtVND(selectedInvoice.allocated_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-700 uppercase font-bold">Còn lại khả dụng</div>
                <div className="font-extrabold text-emerald-700">{fmtVND(selectedInvoice.remaining_amount)}</div>
              </div>
            </div>

            {/* Cảnh báo Ngân hàng khóa (nếu có) */}
            {selectedInvoice.locked_bank_code && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Hóa đơn này đã được nhận nợ tại <b>{selectedInvoice.locked_bank_code}</b>. Theo quy định, phần còn lại
                  chỉ được phép bảo đảm cho khoản vay <b>CÙNG NGÂN HÀNG {selectedInvoice.locked_bank_code}</b>!
                </span>
              </div>
            )}

            <form onSubmit={handleExecuteAllocation} className="space-y-4 text-xs">
              {/* Chọn Khoản vay */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chọn Khoản vay / Khế ước cần bảo đảm <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedLoanId}
                  onChange={(e) => handleSelectLoan(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Chọn hợp đồng / khế ước --</option>
                  {loansList
                    .filter((l) => {
                      if (!selectedInvoice.locked_bank_code) return true;
                      return l.bank_code.toUpperCase() === selectedInvoice.locked_bank_code.toUpperCase();
                    })
                    .map((l) => (
                      <option key={l.loan_id} value={l.loan_id}>
                        [{l.bank_code}] {l.contract_number} • Gốc ban đầu: {fmtVND(l.original_principal_balance || l.current_principal_balance)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Tình trạng bảo đảm hiện tại của khoản vay được chọn */}
              {allocatedInvoicesInfo && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                  <div className="font-bold text-blue-900 flex items-center justify-between">
                    <span>Khoản vay: {allocatedInvoicesInfo.contract_number} ({allocatedInvoicesInfo.bank_code})</span>
                    <span>Gốc ban đầu: {fmtVND(allocatedInvoicesInfo.original_principal_balance)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Đã nhận nợ từ các HĐ: {fmtVND(allocatedInvoicesInfo.total_allocated_amount)}</span>
                    <span className="font-semibold text-red-600">
                      Còn thiếu: {fmtVND(allocatedInvoicesInfo.difference_amount)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 italic">
                    {allocatedInvoicesInfo.status_message}
                  </div>
                </div>
              )}

              {/* Số tiền nhận nợ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Số tiền nhận nợ từ hóa đơn này (VND) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedInvoice.remaining_amount}
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(e.target.value)}
                  placeholder="Nhập số tiền nhận nợ..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>Tối đa: {fmtVND(selectedInvoice.remaining_amount)}</span>
                  {allocatedInvoicesInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        const sug = Math.min(
                          Number(selectedInvoice.remaining_amount),
                          Number(allocatedInvoicesInfo.difference_amount)
                        );
                        setAllocationAmount(sug.toString());
                      }}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      Khớp số tiền còn thiếu ({fmtVND(allocatedInvoicesInfo.difference_amount)})
                    </button>
                  )}
                </div>
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú đối soát</label>
                <input
                  type="text"
                  value={allocationNote}
                  onChange={(e) => setAllocationNote(e.target.value)}
                  placeholder="Ví dụ: Bảo đảm đợt giải ngân ngày..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>

              {/* Ràng buộc khớp 100% gốc ban đầu */}
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                <input
                  type="checkbox"
                  id="strictCheck"
                  checked={strictCheck}
                  onChange={(e) => setStrictCheck(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="strictCheck" className="text-slate-700 font-medium cursor-pointer">
                  Bắt buộc tổng tiền nhận nợ từ các hóa đơn phải <b>bằng chính xác 100%</b> giá trị gốc vay ban đầu
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAllocating}
                  className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isAllocating ? 'Đang xác nhận...' : 'Xác nhận Nhận nợ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
