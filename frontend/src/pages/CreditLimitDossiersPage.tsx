import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  Plus,
  Upload,
  Trash2,
  FileText,
  X,
  Edit2,
  CheckSquare,
  Square,
} from 'lucide-react';
import api from '../services/api';
import { CreditLimitDossier, CreditAgreement, ChecklistItem } from '../types';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';

const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val))) + ' đ';
};

const DOSSIER_TYPE_LABELS: Record<string, string> = {
  NEW_LIMIT: 'Cấp mới hạn mức',
  RENEWAL: 'Tái cấp / Gia hạn hạn mức',
  INCREASE_LIMIT: 'Tăng hạn mức tín dụng',
  PERIODIC_REVIEW: 'Rà soát định kỳ',
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  PREPARING: { label: 'Đang chuẩn bị hồ sơ', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  SUBMITTED: { label: 'Đang trình ngân hàng', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  NEED_SUPPLEMENT: { label: 'Cần bổ sung hồ sơ', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  APPROVED: { label: 'Đã phê duyệt cấp HM', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Từ chối / Dừng', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const CreditLimitDossiersPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();
  const [dossiers, setDossiers] = useState<CreditLimitDossier[]>([]);
  const [agreements, setAgreements] = useState<CreditAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDossier, setSelectedDossier] = useState<CreditLimitDossier | null>(null);

  // Modal Tạo / Sửa bộ hồ sơ hạn mức
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingDossier, setEditingDossier] = useState<CreditLimitDossier | null>(null);
  const [formData, setFormData] = useState({
    agreement_id: '',
    bank_code: 'CTG',
    bank_name: 'VietinBank',
    borrower_name: '',
    dossier_code: '',
    dossier_title: '',
    dossier_type: 'RENEWAL',
    proposed_limit_amount: '',
    approved_limit_amount: '',
    submission_date: '',
    approval_date: '',
    expiry_review_date: '',
    status: 'PREPARING',
    responsible_person: 'Chị Cẩm Nhung (Kế toán trưởng)',
    notes: '',
  });

  // Upload file vào bộ hồ sơ
  const [uploadCategory, setUploadCategory] = useState<string>('LEGAL');
  const [uploadDesc, setUploadDesc] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dosRes, agRes] = await Promise.all([
        api.get<CreditLimitDossier[]>('/credit-limits/dossiers'),
        api.get<CreditAgreement[]>('/credit-limits/agreements'),
      ]);
      const list = dosRes.data || [];
      setDossiers(list);
      setAgreements(agRes.data || []);
      if (selectedDossier) {
        const refreshed = list.find((d) => d.dossier_id === selectedDossier.dossier_id);
        if (refreshed) setSelectedDossier(refreshed);
      } else if (list.length > 0) {
        setSelectedDossier(list[0]);
      }
    } catch (err) {
      console.error('Lỗi tải Hồ sơ hạn mức:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEntity]);

  const openCreateModal = () => {
    setEditingDossier(null);
    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      agreement_id: agreements[0] ? String(agreements[0].agreement_id) : '',
      bank_code: agreements[0]?.bank_code || 'CTG',
      bank_name: agreements[0]?.bank_name || 'VietinBank',
      borrower_name:
        (selectedEntity.id !== 'ALL' ? selectedEntity.name : '') ||
        agreements[0]?.borrower_name ||
        'CONG TY CO PHAN XI MANG SUNRISE',
      dossier_code: `HS-HM-${new Date().getFullYear()}-${String(dossiers.length + 1).padStart(2, '0')}`,
      dossier_title: '',
      dossier_type: 'RENEWAL',
      proposed_limit_amount: '50000000000',
      approved_limit_amount: '',
      submission_date: today,
      approval_date: '',
      expiry_review_date: '',
      status: 'PREPARING',
      responsible_person: 'Chị Cẩm Nhung (Kế toán trưởng)',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (d: CreditLimitDossier) => {
    setEditingDossier(d);
    setFormData({
      agreement_id: d.agreement_id ? String(d.agreement_id) : '',
      bank_code: d.bank_code,
      bank_name: d.bank_name,
      borrower_name: d.borrower_name,
      dossier_code: d.dossier_code,
      dossier_title: d.dossier_title,
      dossier_type: d.dossier_type,
      proposed_limit_amount: String(d.proposed_limit_amount || 0),
      approved_limit_amount: d.approved_limit_amount ? String(d.approved_limit_amount) : '',
      submission_date: d.submission_date || '',
      approval_date: d.approval_date || '',
      expiry_review_date: d.expiry_review_date || '',
      status: d.status,
      responsible_person: d.responsible_person || '',
      notes: d.notes || '',
    });
    setShowModal(true);
  };

  const handleSaveDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        agreement_id: formData.agreement_id ? Number(formData.agreement_id) : null,
        bank_code: formData.bank_code,
        bank_name: formData.bank_name,
        borrower_name: formData.borrower_name,
        dossier_code: formData.dossier_code,
        dossier_title: formData.dossier_title,
        dossier_type: formData.dossier_type,
        proposed_limit_amount: Number(formData.proposed_limit_amount || 0),
        approved_limit_amount: formData.approved_limit_amount ? Number(formData.approved_limit_amount) : null,
        submission_date: formData.submission_date || null,
        approval_date: formData.approval_date || null,
        expiry_review_date: formData.expiry_review_date || null,
        status: formData.status,
        responsible_person: formData.responsible_person || null,
        notes: formData.notes || null,
      };
      if (editingDossier) {
        await api.put(`/credit-limits/dossiers/${editingDossier.dossier_id}`, payload);
      } else {
        await api.post('/credit-limits/dossiers', payload);
      }
      setShowModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi lưu Bộ hồ sơ hạn mức.');
    }
  };

  const handleToggleChecklistItem = async (dos: CreditLimitDossier, itemKey: string) => {
    const updatedChecklist: ChecklistItem[] = dos.checklist.map((item) =>
      item.key === itemKey ? { ...item, is_completed: !item.is_completed } : item
    );
    try {
      const res = await api.put<CreditLimitDossier>(`/credit-limits/dossiers/${dos.dossier_id}`, {
        checklist: updatedChecklist,
      });
      setSelectedDossier(res.data);
      setDossiers((prev) => prev.map((d) => (d.dossier_id === dos.dossier_id ? res.data : d)));
    } catch (err) {
      console.error('Lỗi cập nhật checklist:', err);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDossier) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', uploadCategory);
      fd.append('description', uploadDesc || file.name);
      fd.append('uploaded_by', 'Chị Cẩm Nhung');
      await api.post(`/credit-limits/dossiers/${selectedDossier.dossier_id}/files`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadDesc('');
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi tải lên tệp hồ sơ.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!window.confirm('Xóa tệp chứng từ này khỏi bộ hồ sơ hạn mức?')) return;
    try {
      await api.delete(`/credit-limits/dossiers/files/${fileId}`);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDossier = async (dos: CreditLimitDossier) => {
    if (!window.confirm(`Xóa bộ hồ sơ hạn mức ${dos.dossier_code}?`)) return;
    try {
      await api.delete(`/credit-limits/dossiers/${dos.dossier_id}`);
      if (selectedDossier?.dossier_id === dos.dossier_id) setSelectedDossier(null);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <FolderArchive className="w-4 h-4" />
            <span>Phân hệ Quản lý hạn mức</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Hồ Sơ Hạn Mức Tín Dụng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý tiến độ trình duyệt cấp/tái cấp hạn mức, danh mục Checklist 6 nhóm hồ sơ bắt buộc (Pháp lý, BCTC, Phương án KD, Nghị quyết HĐQT, TSĐB, HĐTD) và kho chứng từ số hóa.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Tạo Bộ Hồ Sơ Hạn Mức
        </button>
      </div>

      {/* Main Split View: Danh sách bên trái & Chi tiết Checklist + Kho file bên phải */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cột trái: Danh sách các Bộ hồ sơ hạn mức */}
        <div className="lg:col-span-5 space-y-4">
          {loading ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
              Đang tải danh sách bộ hồ sơ hạn mức...
            </div>
          ) : dossiers.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
              Chưa có bộ hồ sơ hạn mức nào.
            </div>
          ) : (
            dossiers.map((dos) => {
              const isSelected = selectedDossier?.dossier_id === dos.dossier_id;
              const badge = STATUS_BADGES[dos.status] || STATUS_BADGES.PREPARING;
              return (
                <div
                  key={dos.dossier_id}
                  onClick={() => setSelectedDossier(dos)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/60 border-blue-500 shadow-md ring-1 ring-blue-500/30'
                      : 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-600 text-white">
                        {dos.bank_code}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{dos.dossier_code}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-2">{dos.dossier_title}</h3>
                  <div className="text-xs text-slate-500 mt-1">
                    Loại: <strong>{DOSSIER_TYPE_LABELS[dos.dossier_type] || dos.dossier_type}</strong>
                    {dos.agreement_number && (
                      <span>
                        {' '}
                        • Gắn HĐTD: <strong className="text-blue-700">{dos.agreement_number}</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200/80 text-xs">
                    <div>
                      <span className="text-slate-400">Hạn mức đề xuất:</span>
                      <div className="font-bold text-slate-900">{formatCurrency(dos.proposed_limit_amount)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Hạn mức phê duyệt:</span>
                      <div className="font-bold text-emerald-600">
                        {dos.approved_limit_amount ? formatCurrency(dos.approved_limit_amount) : 'Đang thẩm định'}
                      </div>
                    </div>
                  </div>

                  {/* Thanh tiến độ hoàn thành Checklist */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-600">Tiến độ hoàn thiện bộ hồ sơ</span>
                      <span className="font-bold text-blue-600">{dos.completion_pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          dos.completion_pct === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${dos.completion_pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Phụ trách: {dos.responsible_person || 'Kế toán'}</span>
                    <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEditModal(dos)}
                        className="text-blue-600 hover:underline font-semibold flex items-center"
                      >
                        <Edit2 className="w-3 h-3 mr-0.5" /> Sửa
                      </button>
                      <button
                        onClick={() => handleDeleteDossier(dos)}
                        className="text-rose-600 hover:underline font-semibold flex items-center"
                      >
                        <Trash2 className="w-3 h-3 mr-0.5" /> Xóa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cột phải: Chi tiết Checklist 6 nhóm & Tải lên tài liệu của Bộ hồ sơ đang chọn */}
        <div className="lg:col-span-7">
          {selectedDossier ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-blue-600">
                    Chi tiết Bộ Hồ Sơ • {selectedDossier.dossier_code}
                  </span>
                  <span className="text-xs text-slate-500">
                    Ngày nộp: {selectedDossier.submission_date || 'Chưa nộp'} • Kỳ đánh giá lại:{' '}
                    {selectedDossier.expiry_review_date || 'N/A'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedDossier.dossier_title}</h2>
                {selectedDossier.notes && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
                    <strong>Ghi chú thẩm định:</strong> {selectedDossier.notes}
                  </p>
                )}
              </div>

              {/* Phần 1: Checklist Danh mục hồ sơ bắt buộc */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                  <span>1. Checklist Danh Mục Tài Liệu Cấp Hạn Mức (Click để đánh dấu hoàn thành)</span>
                  <span className="text-xs font-bold text-blue-600">
                    Hoàn thành {selectedDossier.checklist.filter((c) => c.is_completed).length}/
                    {selectedDossier.checklist.length} hạng mục
                  </span>
                </h3>
                <div className="space-y-2">
                  {selectedDossier.checklist.map((item) => (
                    <div
                      key={item.key}
                      onClick={() => handleToggleChecklistItem(selectedDossier, item.key)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                        item.is_completed
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {item.is_completed ? (
                          <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[11px] text-slate-500">Nhóm mã: {item.category}</div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.is_completed ? 'ĐÃ ĐỦ' : 'CÒN THIẾU'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phần 2: Kho Tệp Chứng Từ Đính Kèm */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Tệp Chứng Từ Đính Kèm Trong Bộ Hồ Sơ ({selectedDossier.files.length} file)
                </h3>

                {/* Form Upload nhanh */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm tài liệu</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                    >
                      <option value="LEGAL">Hồ sơ pháp lý (ĐKKD, Điều lệ)</option>
                      <option value="FINANCIAL_REPORT">Báo cáo tài chính & Thuế</option>
                      <option value="BUSINESS_PLAN">Phương án kinh doanh</option>
                      <option value="BOARD_RESOLUTION">Biên bản & Nghị quyết HĐQT</option>
                      <option value="CREDIT_PROPOSAL">Hồ sơ TSĐB & Thẩm định</option>
                      <option value="CREDIT_CONTRACT">Thông báo phê duyệt & HĐTD scan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú tài liệu</label>
                    <input
                      type="text"
                      placeholder="VD: BCTC Kiểm toán 2025..."
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {uploadingFile ? 'Đang tải lên...' : 'Tải File Lên Bộ Hồ Sơ'}
                      <input type="file" className="hidden" onChange={handleUploadFile} disabled={uploadingFile} />
                    </label>
                  </div>
                </div>

                {/* Danh sách file */}
                {selectedDossier.files.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Chưa có tệp đính kèm nào trong bộ hồ sơ này. Hãy tải lên PDF/Word/Excel ở khung trên.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {selectedDossier.files.map((f) => (
                      <div key={f.file_id} className="px-4 py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-900">{f.file_name}</div>
                            <div className="text-[11px] text-slate-500">
                              Nhóm: <strong>{f.category}</strong> • {f.description || 'Không có mô tả'} • Người tải:{' '}
                              {f.uploaded_by}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(f.file_id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
              Chọn một Bộ hồ sơ hạn mức ở cột bên trái để xem chi tiết Checklist và tài liệu đính kèm.
            </div>
          )}
        </div>
      </div>

      {/* Modal Tạo / Sửa Bộ hồ sơ hạn mức */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingDossier ? 'Cập Nhật Bộ Hồ Sơ Hạn Mức' : 'Tạo Bộ Hồ Sơ Hạn Mức Mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDossier} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Gắn với Hợp đồng tín dụng (Tùy chọn)
                </label>
                <select
                  value={formData.agreement_id}
                  onChange={(e) => {
                    const agId = e.target.value;
                    const found = agreements.find((a) => String(a.agreement_id) === agId);
                    setFormData({
                      ...formData,
                      agreement_id: agId,
                      bank_code: found ? found.bank_code : formData.bank_code,
                      bank_name: found ? found.bank_name : formData.bank_name,
                    });
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">-- Hồ sơ trình mới (Chưa có số HĐTD) --</option>
                  {agreements.map((a) => (
                    <option key={a.agreement_id} value={a.agreement_id}>
                      [{a.bank_code}] {a.agreement_number} — {a.agreement_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã bộ hồ sơ *</label>
                  <input
                    type="text"
                    required
                    value={formData.dossier_code}
                    onChange={(e) => setFormData({ ...formData, dossier_code: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Loại hồ sơ *</label>
                  <select
                    value={formData.dossier_type}
                    onChange={(e) => setFormData({ ...formData, dossier_type: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="NEW_LIMIT">Cấp mới hạn mức</option>
                    <option value="RENEWAL">Tái cấp / Gia hạn hạn mức</option>
                    <option value="INCREASE_LIMIT">Tăng hạn mức tín dụng</option>
                    <option value="PERIODIC_REVIEW">Rà soát định kỳ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề Bộ hồ sơ hạn mức *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Hồ sơ tái cấp hạn mức 60 tỷ tại VietinBank năm 2026-2027"
                  value={formData.dossier_title}
                  onChange={(e) => setFormData({ ...formData, dossier_title: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn mức đề xuất (VND) *</label>
                  <input
                    type="number"
                    required
                    value={formData.proposed_limit_amount}
                    onChange={(e) => setFormData({ ...formData, proposed_limit_amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn mức được duyệt (VND)</label>
                  <input
                    type="number"
                    value={formData.approved_limit_amount}
                    onChange={(e) => setFormData({ ...formData, approved_limit_amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái thẩm định</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="PREPARING">Đang chuẩn bị hồ sơ</option>
                    <option value="SUBMITTED">Đang trình ngân hàng</option>
                    <option value="NEED_SUPPLEMENT">Cần bổ sung hồ sơ</option>
                    <option value="APPROVED">Đã phê duyệt cấp HM</option>
                    <option value="REJECTED">Từ chối / Dừng</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Người phụ trách</label>
                  <input
                    type="text"
                    value={formData.responsible_person}
                    onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày trình hồ sơ</label>
                  <input
                    type="date"
                    value={formData.submission_date}
                    onChange={(e) => setFormData({ ...formData, submission_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày phê duyệt</label>
                  <input
                    type="date"
                    value={formData.approval_date}
                    onChange={(e) => setFormData({ ...formData, approval_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày cần tái cấp</label>
                  <input
                    type="date"
                    value={formData.expiry_review_date}
                    onChange={(e) => setFormData({ ...formData, expiry_review_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú / Yêu cầu bổ sung từ Ngân hàng</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Lưu Bộ hồ sơ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
