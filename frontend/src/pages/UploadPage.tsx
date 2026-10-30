import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import api from '../services/api';

export const UploadPage: React.FC = () => {
  const [selectedBank, setSelectedBank] = useState<string>('MBB');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      alert('Dung lượng file vượt quá giới hạn 25MB!');
      return;
    }

    setIsUploading(true);
    setUploadStatus('Đang xác thực Magic Bytes và tải lên...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bank_code', selectedBank);

    try {
      const res = await api.post('/statements/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadStatus(`Thành công! File ID: ${res.data.file_id}. Đang bóc tách ngầm.`);
    } catch (err: any) {
      setUploadStatus(`Thất bại: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Tiếp nhận & Bóc tách Sao kê Ngân hàng</h1>
        <p className="text-sm text-slate-500 mb-6">
          Hỗ trợ bóc tách tự động đa ngân hàng (MBBank, Vietcombank, Shinhan, VPBank, TPBank, VietinBank, SHB...). File gốc được bảo vệ an toàn trên MinIO/GCS.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Ngân hàng Phát hành
            </label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="MBB">MBBank (Ngân hàng TMCP Quân Đội)</option>
              <option value="MBV">Shinhan Bank (Ngân hàng TNHH MTV Shinhan VN)</option>
              <option value="VPB">VPBank (Ngân hàng TMCP Việt Nam Thịnh Vượng)</option>
              <option value="TPB">TPBank (Ngân hàng TMCP Tiên Phong)</option>
              <option value="CTG">VietinBank (Ngân hàng TMCP Công Thương VN)</option>
              <option value="SHB">SHB (Ngân hàng TMCP Sài Gòn - Hà Nội)</option>
              <option value="VCB">Vietcombank (Ngoại thương Việt Nam)</option>
              <option value="TCB">Techcombank (Kỹ Thương Việt Nam)</option>
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-10 text-center transition-colors bg-slate-50 cursor-pointer"
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <div className="text-base font-semibold text-slate-800">
              Kéo & Thả file sao kê (.xlsx, .xls) vào đây hoặc bấm để duyệt
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Dung lượng tối đa 25MB • Tự động kiểm tra Magic Bytes & Chống nạp trùng lặp
            </div>
          </label>
        </div>

        {uploadStatus && (
          <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 flex items-center space-x-2">
            <Clock className="w-4 h-4 animate-spin" />
            <span>{uploadStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};

