import React, { useState, useEffect } from 'react';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Trash2,
  FileSpreadsheet,
  Sparkles,
} from 'lucide-react';
import api from '../services/api';
import { StatementFile } from '../types';

export const UploadPage: React.FC = () => {
  const [selectedBank, setSelectedBank] = useState<string>('AUTO_DETECT');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessages, setUploadMessages] = useState<
    Array<{ filename: string; type: 'success' | 'warning' | 'error'; text: string }>
  >([]);
  const [statements, setStatements] = useState<StatementFile[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);

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

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3">File Sao Kê / Kỳ</th>
                <th className="px-3 py-3">Ngân hàng & Số TK</th>
                <th className="px-3 py-3">Mẫu & Chế độ Đối soát</th>
                <th className="px-3 py-3 text-center">Số dòng</th>
                <th className="px-3 py-3 text-right">Số dư Đầu kỳ</th>
                <th className="px-3 py-3 text-right">Tổng Có (+)</th>
                <th className="px-3 py-3 text-right">Tổng Nợ (-)</th>
                <th className="px-3 py-3 text-right">Số dư Cuối kỳ</th>
                <th className="px-3 py-3 text-center">Trạng thái Đối soát</th>
                <th className="px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Chưa có file sao kê nào được tải lên. Hãy kéo-thả 7 file mẫu từ thư mục{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">Resources/Samples_sao_ke</code>{' '}
                    vào khung trên.
                  </td>
                </tr>
              ) : (
                statements.map((st) => (
                  <tr key={st.file_id} className="hover:bg-slate-50 transition-colors">
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
                    <td className="px-3 py-3">
                      <div className="font-bold text-blue-700">
                        {st.bank_code || '—'} • <span className="font-mono">{st.account_number || '—'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 max-w-[180px] truncate" title={st.account_holder || ''}>
                        {st.account_holder || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold">
                        {st.template_code || 'AUTO'}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {st.reconciliation_mode || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-bold text-slate-800">
                      {st.total_transactions_count}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-700">
                      {st.header_opening_balance !== null && st.header_opening_balance !== undefined
                        ? Number(st.header_opening_balance).toLocaleString('vi-VN')
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-600 font-medium">
                      +{Number(st.total_credit_amount).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-600 font-medium">
                      -{Number(st.total_debit_amount).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {st.calculated_closing_balance !== null && st.calculated_closing_balance !== undefined
                        ? Number(st.calculated_closing_balance).toLocaleString('vi-VN')
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {st.reconciliation_status === 'BALANCED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          BALANCED (Δ=0)
                        </span>
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
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleDeleteFile(st.file_id, st.original_filename)}
                        title="Xóa file sao kê này"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
    </div>
  );
};
