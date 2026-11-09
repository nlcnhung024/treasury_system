import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCheck,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Edit2,
  Trash2,
  X,
  Calendar,
} from 'lucide-react';
import api from '../services/api';
import { PostLoanCovenant, CreditAgreement } from '../types';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';
import { fetchMasterBanks, MasterBank, ALL_VIETNAM_BANKS } from '../services/bankService';

const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val)));
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  CASHFLOW_TURNOVER: {
    label: 'Cam kết Doanh số chuyển tiền / Dòng tiền CASA',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  PERIODIC_REPORTING: {
    label: 'Cam kết Cung cấp Báo cáo định kỳ (BCTC, Tồn kho)',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  FINANCIAL_RATIO: {
    label: 'Cam kết Chỉ số Tài chính (DSCR, Nợ/VCSH, LTV)',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  POST_DISBURSEMENT_DOC: {
    label: 'Cam kết Bổ sung Chứng từ / Hồ sơ sau giải ngân',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

const FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: 'Một lần sau giải ngân',
  MONTHLY: 'Hàng tháng',
  QUARTERLY: 'Hàng quý',
  SEMI_ANNUAL: '6 tháng / Bán niên',
  ANNUAL: 'Hàng năm',
};

export const PostLoanCovenantsPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();
  const [covenants, setCovenants] = useState<PostLoanCovenant[]>([]);
  const [agreements, setAgreements] = useState<CreditAgreement[]>([]);
  const [masterBanks, setMasterBanks] = useState<MasterBank[]>(ALL_VIETNAM_BANKS);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterBank, setFilterBank] = useState<string>('ALL');

  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingCovenant, setEditingCovenant] = useState<PostLoanCovenant | null>(null);
  const [formData, setFormData] = useState({
    agreement_id: '',
    bank_code: 'CTG',
    bank_name: 'VietinBank',
    borrower_name: '',
    covenant_title: '',
    covenant_category: 'CASHFLOW_TURNOVER',
    frequency: 'QUARTERLY',
    period_start: '',
    due_date: '',
    target_value: '',
    actual_value: '',
    unit: 'VND',
    compliance_status: 'IN_PROGRESS',
    responsible_person: 'Ông Trần Ngọc Tuấn (CFO)',
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [covRes, agRes, banks] = await Promise.all([
        api.get<PostLoanCovenant[]>('/credit-limits/covenants'),
        api.get<CreditAgreement[]>('/credit-limits/agreements'),
        fetchMasterBanks(),
      ]);
      setCovenants(covRes.data || []);
      setAgreements(agRes.data || []);
      if (banks && banks.length > 0) setMasterBanks(banks);
    } catch (err) {
      console.error('Lỗi tải Cam kết sau vay:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEntity]);

  const filteredCovenants = useMemo(() => {
    return covenants.filter((c) => {
      if (filterCategory !== 'ALL' && c.covenant_category !== filterCategory) return false;
      if (filterBank !== 'ALL' && c.bank_code !== filterBank) return false;
      return true;
    });
  }, [covenants, filterCategory, filterBank]);

  const summary = useMemo(() => {
    const compliant = covenants.filter((c) => c.computed_compliance_status === 'COMPLIANT').length;
    const inProgress = covenants.filter((c) => c.computed_compliance_status === 'IN_PROGRESS').length;
    const dueSoon = covenants.filter((c) => c.computed_compliance_status === 'DUE_SOON').length;
    const breached = covenants.filter((c) => c.computed_compliance_status === 'BREACHED').length;
    return { total: covenants.length, compliant, inProgress, dueSoon, breached };
  }, [covenants]);

  const openCreateModal = () => {
    setEditingCovenant(null);
    const firstAg = agreements[0];
    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      agreement_id: firstAg ? String(firstAg.agreement_id) : '',
      bank_code: firstAg?.bank_code || 'CTG',
      bank_name: firstAg?.bank_name || 'VietinBank',
      borrower_name:
        (selectedEntity.id !== 'ALL' ? selectedEntity.name : '') ||
        firstAg?.borrower_name ||
        'CONG TY CO PHAN XI MANG SUNRISE',
      covenant_title: '',
      covenant_category: 'CASHFLOW_TURNOVER',
      frequency: 'QUARTERLY',
      period_start: today,
      due_date: today,
      target_value: '40000000000',
      actual_value: '0',
      unit: 'VND',
      compliance_status: 'IN_PROGRESS',
      responsible_person: 'Ông Trần Ngọc Tuấn (CFO)',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (cov: PostLoanCovenant) => {
    setEditingCovenant(cov);
    setFormData({
      agreement_id: String(cov.agreement_id),
      bank_code: cov.bank_code,
      bank_name: cov.bank_name,
      borrower_name: cov.borrower_name,
      covenant_title: cov.covenant_title,
      covenant_category: cov.covenant_category,
      frequency: cov.frequency,
      period_start: cov.period_start || '',
      due_date: cov.due_date,
      target_value: cov.target_value !== null && cov.target_value !== undefined ? String(cov.target_value) : '',
      actual_value: cov.actual_value !== null && cov.actual_value !== undefined ? String(cov.actual_value) : '',
      unit: cov.unit,
      compliance_status: cov.compliance_status,
      responsible_person: cov.responsible_person || '',
      notes: cov.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        agreement_id: Number(formData.agreement_id),
        bank_code: formData.bank_code,
        bank_name: formData.bank_name,
        borrower_name: formData.borrower_name,
        covenant_title: formData.covenant_title,
        covenant_category: formData.covenant_category,
        frequency: formData.frequency,
        period_start: formData.period_start || null,
        due_date: formData.due_date,
        target_value: formData.target_value ? Number(formData.target_value) : null,
        actual_value: formData.actual_value ? Number(formData.actual_value) : null,
        unit: formData.unit,
        compliance_status: formData.compliance_status,
        responsible_person: formData.responsible_person || null,
        notes: formData.notes || null,
      };
      if (editingCovenant) {
        await api.put(`/credit-limits/covenants/${editingCovenant.covenant_id}`, payload);
      } else {
        await api.post('/credit-limits/covenants', payload);
      }
      setShowModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi lưu Cam kết sau vay.');
    }
  };

  const handleDelete = async (cov: PostLoanCovenant) => {
    if (!window.confirm(`Xóa cam kết "${cov.covenant_title}"?`)) return;
    try {
      await api.delete(`/credit-limits/covenants/${cov.covenant_id}`);
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const renderComplianceBadge = (status: string) => {
    switch (status) {
      case 'COMPLIANT':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Đạt cam kết
          </span>
        );
      case 'DUE_SOON':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Sắp đến hạn (≤ 7 ngày)
          </span>
        );
      case 'BREACHED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Vi phạm / Quá hạn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            Đang thực hiện
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">
            <CheckCheck className="w-4 h-4" />
            <span>Phân hệ Quản lý hạn mức</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Cam Kết Sau Vay (Post-Disbursement Covenants)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi nghĩa vụ sau giải ngân gắn với từng Hợp đồng tín dụng: Cam kết doanh số chuyển tiền CASA (tự động đối chiếu sao kê), Cung cấp báo cáo định kỳ, Chỉ số tài chính (DSCR, Nợ/VCSH) và Bổ sung chứng từ sau giải ngân.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Thêm Cam Kết Sau Vay
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tổng Số Cam Kết Theo Dõi</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{summary.total} Cam kết</div>
          <div className="text-xs text-slate-500 mt-1">Trên toàn bộ các HĐTD hiệu lực</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Đã Đạt / Hoàn Thành</div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{summary.compliant} Cam kết</div>
          <div className="text-xs text-slate-500 mt-1">Tuân thủ đúng hạn ngân hàng</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Đang Thực Hiện / Sắp Đến Hạn</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{summary.inProgress + summary.dueSoon} Cam kết</div>
          <div className="text-xs text-amber-600 font-semibold mt-1">{summary.dueSoon} cam kết đến hạn ≤ 7 ngày</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Cảnh Báo Quá Hạn / Chưa Đạt</div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{summary.breached} Cam kết</div>
          <div className="text-xs text-rose-600 font-semibold mt-1">Cần xử lý bổ sung ngay</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Nhóm cam kết:</span>
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'CASHFLOW_TURNOVER', label: 'Doanh số dòng tiền CASA' },
            { key: 'PERIODIC_REPORTING', label: 'Báo cáo định kỳ' },
            { key: 'FINANCIAL_RATIO', label: 'Chỉ số tài chính' },
            { key: 'POST_DISBURSEMENT_DOC', label: 'Bổ sung hồ sơ sau vay' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setFilterCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterCategory === cat.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Ngân hàng:</span>
          <select
            value={filterBank}
            onChange={(e) => setFilterBank(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
          >
            <option value="ALL">Tất cả ngân hàng</option>
            {masterBanks.map((b) => (
              <option key={b.bank_code} value={b.bank_code}>
                {b.short_name} ({b.bank_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Covenants Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Ngân Hàng &amp; HĐTD</th>
                <th className="px-4 py-3.5">Nội Dung Cam Kết Sau Vay</th>
                <th className="px-4 py-3.5">Chu Kỳ &amp; Hạn Đánh Giá</th>
                <th className="px-4 py-3.5 text-right">Mục Tiêu vs Thực Tế</th>
                <th className="px-4 py-3.5 text-center">Trạng Thái Tuân Thủ</th>
                <th className="px-4 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                    Đang tải danh sách Cam kết sau vay...
                  </td>
                </tr>
              ) : filteredCovenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                    Chưa có Cam kết sau vay nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredCovenants.map((c) => {
                  const catInfo = CATEGORY_LABELS[c.covenant_category] || CATEGORY_LABELS.CASHFLOW_TURNOVER;
                  const pct = Math.min(100, Number(c.achievement_pct || 0));
                  return (
                    <tr key={c.covenant_id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-100 text-blue-800">
                            {c.bank_code}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">{c.bank_name}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          HĐTD: <strong className="text-slate-900">{c.agreement_number || 'N/A'}</strong>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                        <div className="font-bold text-slate-900 mt-1">{c.covenant_title}</div>
                        {c.notes && <div className="text-xs text-slate-500 mt-0.5">{c.notes}</div>}
                        {c.responsible_person && (
                          <div className="text-[11px] text-slate-400 mt-0.5">Phụ trách: {c.responsible_person}</div>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-xs font-bold text-slate-800">
                          {FREQUENCY_LABELS[c.frequency] || c.frequency}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          Hạn: <strong>{c.due_date}</strong>
                        </div>
                        <div
                          className={`text-[11px] font-semibold mt-0.5 ${
                            c.days_until_due < 0
                              ? 'text-rose-600'
                              : c.days_until_due <= 7
                              ? 'text-amber-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {c.days_until_due < 0
                            ? `Quá hạn ${Math.abs(c.days_until_due)} ngày`
                            : `Còn ${c.days_until_due} ngày`}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {c.target_value ? (
                          <div>
                            <div className="text-xs text-slate-500">
                              Mục tiêu:{' '}
                              <strong className="text-slate-900">
                                {formatCurrency(c.target_value)} {c.unit}
                              </strong>
                            </div>
                            <div className="text-xs font-bold text-emerald-700 mt-0.5">
                              Thực tế: {formatCurrency(c.actual_value)} {c.unit}
                            </div>
                            <div className="w-28 ml-auto bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                              <div
                                className={`h-full rounded-full ${
                                  pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-blue-600' : 'bg-amber-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {c.achievement_pct !== null && c.achievement_pct !== undefined && (
                              <div className="text-[11px] text-slate-500 mt-0.5">Đạt {c.achievement_pct}%</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Theo hồ sơ</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {renderComplianceBadge(c.computed_compliance_status)}
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            onClick={() => openEditModal(c)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg"
                            title="Cập nhật cam kết"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Xóa cam kết"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tạo / Sửa Cam kết sau vay */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCovenant ? 'Cập Nhật Cam Kết Sau Vay' : 'Thêm Cam Kết Sau Vay Mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Thuộc Hợp đồng tín dụng *</label>
                {agreements.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    Chưa có Hợp đồng tín dụng nào trong hệ thống. Vui lòng tạo Hợp đồng tín dụng trước tại menu <strong>"Hợp đồng tín dụng"</strong>.
                  </div>
                ) : (
                  <select
                    required
                    value={formData.agreement_id}
                    onChange={(e) => {
                      const agId = e.target.value;
                      const found = agreements.find((a) => String(a.agreement_id) === agId);
                      setFormData({
                        ...formData,
                        agreement_id: agId,
                        bank_code: found ? found.bank_code : formData.bank_code,
                        bank_name: found ? found.bank_name : formData.bank_name,
                        borrower_name: found ? found.borrower_name : formData.borrower_name,
                      });
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {agreements.map((ag) => (
                      <option key={ag.agreement_id} value={ag.agreement_id}>
                        [{ag.bank_code}] {ag.agreement_number} — {ag.agreement_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm cam kết *</label>
                  <select
                    value={formData.covenant_category}
                    onChange={(e) => setFormData({ ...formData, covenant_category: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="CASHFLOW_TURNOVER">Cam kết Doanh số chuyển tiền CASA</option>
                    <option value="PERIODIC_REPORTING">Cam kết Cung cấp Báo cáo định kỳ</option>
                    <option value="FINANCIAL_RATIO">Cam kết Chỉ số Tài chính (DSCR, Nợ/VCSH)</option>
                    <option value="POST_DISBURSEMENT_DOC">Cam kết Bổ sung Hồ sơ sau giải ngân</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chu kỳ đánh giá *</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="ONE_TIME">Một lần sau giải ngân</option>
                    <option value="MONTHLY">Hàng tháng</option>
                    <option value="QUARTERLY">Hàng quý</option>
                    <option value="SEMI_ANNUAL">6 tháng / Bán niên</option>
                    <option value="ANNUAL">Hàng năm</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nội dung cam kết *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Cam kết doanh số chuyển tiền qua TK VietinBank tối thiểu 45 tỷ/quý"
                  value={formData.covenant_title}
                  onChange={(e) => setFormData({ ...formData, covenant_title: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mục tiêu cam kết</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.target_value}
                    onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kết quả thực tế</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.actual_value}
                    onChange={(e) => setFormData({ ...formData, actual_value: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Đơn vị tính</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="VND">VND (Đồng)</option>
                    <option value="%">% (Tỷ lệ hoàn thành)</option>
                    <option value="RATIO">Lần (Hệ số tài chính)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Từ ngày (Kỳ tính)</label>
                  <input
                    type="date"
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn hoàn thành / Đánh giá *</label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái tuân thủ</label>
                  <select
                    value={formData.compliance_status}
                    onChange={(e) => setFormData({ ...formData, compliance_status: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  >
                    <option value="IN_PROGRESS">Đang thực hiện</option>
                    <option value="COMPLIANT">Đạt cam kết</option>
                    <option value="DUE_SOON">Sắp đến hạn</option>
                    <option value="BREACHED">Vi phạm / Quá hạn</option>
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú theo dõi</label>
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
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                >
                  Lưu Cam Kết
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
