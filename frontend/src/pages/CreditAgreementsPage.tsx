import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Shield,
  ArrowRightLeft,
  Edit2,
  Trash2,
  X,
  Calendar,
  Layers,
  ExternalLink,
} from 'lucide-react';
import api from '../services/api';
import { CreditAgreement, LinkedCollateralBrief } from '../types';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';

const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val))) + ' đ';
};

export const CreditAgreementsPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();
  const [agreements, setAgreements] = useState<CreditAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [filterBank, setFilterBank] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedAgreement, setSelectedAgreement] = useState<CreditAgreement | null>(null);

  // Modal Tạo / Sửa HĐTD
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingAgreement, setEditingAgreement] = useState<CreditAgreement | null>(null);
  const [formData, setFormData] = useState({
    bank_code: 'CTG',
    bank_name: 'VietinBank',
    agreement_number: '',
    agreement_name: '',
    borrower_name: '',
    total_credit_limit: '',
    loan_sublimit: '',
    guarantee_sublimit: '',
    lc_sublimit: '',
    signed_date: '',
    effective_from: '',
    effective_to: '',
    interest_rate_framework: '',
    collateral_summary: '',
    parent_agreement_id: '',
    transfer_collaterals_from_parent: true,
    notes: '',
  });

  // Modal Tái cấp hạn mức & Chuyển tiếp TSĐB từ HĐTD hết hạn sang HĐTD mới
  const [renewTarget, setRenewTarget] = useState<CreditAgreement | null>(null);
  const [renewForm, setRenewForm] = useState({
    new_agreement_number: '',
    new_agreement_name: '',
    total_credit_limit: '',
    loan_sublimit: '',
    guarantee_sublimit: '',
    lc_sublimit: '',
    signed_date: new Date().toISOString().slice(0, 10),
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    interest_rate_framework: '',
    notes: '',
    selected_collateral_ids: [] as number[],
  });

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      const res = await api.get<CreditAgreement[]>('/credit-limits/agreements');
      setAgreements(res.data || []);
      if (selectedAgreement) {
        const updated = (res.data || []).find((a) => a.agreement_id === selectedAgreement.agreement_id);
        if (updated) setSelectedAgreement(updated);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách Hợp đồng tín dụng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgreements();
  }, [selectedEntity]);

  const handleSyncLoans = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/credit-limits/agreements/sync-loans');
      alert(res.data?.message || 'Đã đồng bộ gắn kết Khế ước vào Hợp đồng tín dụng theo ngày giải ngân!');
      await fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi đồng bộ Khế ước.');
    } finally {
      setSyncing(false);
    }
  };

  const filteredAgreements = useMemo(() => {
    return agreements.filter((ag) => {
      if (filterBank !== 'ALL' && ag.bank_code !== filterBank) return false;
      if (filterStatus !== 'ALL' && ag.computed_status !== filterStatus) return false;
      return true;
    });
  }, [agreements, filterBank, filterStatus]);

  const summaryKpis = useMemo(() => {
    const activeAgs = agreements.filter((a) => a.computed_status === 'ACTIVE' || a.computed_status === 'EXPIRING_SOON');
    const totalLimit = activeAgs.reduce((acc, a) => acc + Number(a.total_credit_limit || 0), 0);
    const totalUtilized = activeAgs.reduce((acc, a) => acc + Number(a.utilized_loan_amount || 0), 0);
    const totalAvailable = Math.max(0, totalLimit - totalUtilized);
    const expiringOrExpiredCount = agreements.filter(
      (a) => a.computed_status === 'EXPIRING_SOON' || a.computed_status === 'EXPIRED'
    ).length;
    return { totalLimit, totalUtilized, totalAvailable, expiringOrExpiredCount, activeCount: activeAgs.length };
  }, [agreements]);

  const openCreateModal = () => {
    setEditingAgreement(null);
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    setFormData({
      bank_code: 'CTG',
      bank_name: 'VietinBank',
      agreement_number: '',
      agreement_name: '',
      borrower_name:
        (selectedEntity.id !== 'ALL' ? selectedEntity.name : '') ||
        agreements[0]?.borrower_name ||
        'CONG TY CO PHAN XI MANG SUNRISE',
      total_credit_limit: '50000000000',
      loan_sublimit: '45000000000',
      guarantee_sublimit: '5000000000',
      lc_sublimit: '0',
      signed_date: today,
      effective_from: today,
      effective_to: nextYear,
      interest_rate_framework: '6.5% - 7.8%/năm theo từng Khế ước',
      collateral_summary: '',
      parent_agreement_id: '',
      transfer_collaterals_from_parent: true,
      notes: '',
    });
    setShowFormModal(true);
  };

  const openEditModal = (ag: CreditAgreement) => {
    setEditingAgreement(ag);
    setFormData({
      bank_code: ag.bank_code,
      bank_name: ag.bank_name,
      agreement_number: ag.agreement_number,
      agreement_name: ag.agreement_name,
      borrower_name: ag.borrower_name,
      total_credit_limit: String(ag.total_credit_limit || 0),
      loan_sublimit: ag.loan_sublimit ? String(ag.loan_sublimit) : '',
      guarantee_sublimit: ag.guarantee_sublimit ? String(ag.guarantee_sublimit) : '',
      lc_sublimit: ag.lc_sublimit ? String(ag.lc_sublimit) : '',
      signed_date: ag.signed_date || ag.effective_from,
      effective_from: ag.effective_from,
      effective_to: ag.effective_to,
      interest_rate_framework: ag.interest_rate_framework || '',
      collateral_summary: ag.collateral_summary || '',
      parent_agreement_id: ag.parent_agreement_id ? String(ag.parent_agreement_id) : '',
      transfer_collaterals_from_parent: false,
      notes: ag.notes || '',
    });
    setShowFormModal(true);
  };

  const handleSaveAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        bank_code: formData.bank_code,
        bank_name: formData.bank_name,
        agreement_number: formData.agreement_number,
        agreement_name: formData.agreement_name,
        borrower_name: formData.borrower_name,
        total_credit_limit: Number(formData.total_credit_limit || 0),
        loan_sublimit: formData.loan_sublimit ? Number(formData.loan_sublimit) : null,
        guarantee_sublimit: formData.guarantee_sublimit ? Number(formData.guarantee_sublimit) : null,
        lc_sublimit: formData.lc_sublimit ? Number(formData.lc_sublimit) : null,
        signed_date: formData.signed_date || formData.effective_from,
        effective_from: formData.effective_from,
        effective_to: formData.effective_to,
        interest_rate_framework: formData.interest_rate_framework || null,
        collateral_summary: formData.collateral_summary || null,
        parent_agreement_id: formData.parent_agreement_id ? Number(formData.parent_agreement_id) : null,
        transfer_collaterals_from_parent: formData.transfer_collaterals_from_parent,
        notes: formData.notes || null,
      };
      if (editingAgreement) {
        await api.put(`/credit-limits/agreements/${editingAgreement.agreement_id}`, payload);
      } else {
        await api.post('/credit-limits/agreements', payload);
      }
      setShowFormModal(false);
      await fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi lưu Hợp đồng tín dụng.');
    }
  };

  const openRenewModal = (ag: CreditAgreement) => {
    setRenewTarget(ag);
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    setRenewForm({
      new_agreement_number: `${ag.agreement_number}-RENEW`,
      new_agreement_name: `HĐTD Tái cấp hạn mức ${ag.bank_name} (${new Date().getFullYear() + 1})`,
      total_credit_limit: String(ag.total_credit_limit || 0),
      loan_sublimit: ag.loan_sublimit ? String(ag.loan_sublimit) : '',
      guarantee_sublimit: ag.guarantee_sublimit ? String(ag.guarantee_sublimit) : '',
      lc_sublimit: ag.lc_sublimit ? String(ag.lc_sublimit) : '',
      signed_date: today,
      effective_from: today,
      effective_to: nextYear,
      interest_rate_framework: ag.interest_rate_framework || '',
      notes: `Tái cấp hạn mức và nhận chuyển tiếp Tài sản đảm bảo từ HĐTD hết hạn ${ag.agreement_number}.`,
      selected_collateral_ids: ag.linked_collaterals.map((c) => c.asset_id),
    });
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTarget) return;
    try {
      await api.post(`/credit-limits/agreements/${renewTarget.agreement_id}/renew`, {
        new_agreement_number: renewForm.new_agreement_number,
        new_agreement_name: renewForm.new_agreement_name,
        total_credit_limit: Number(renewForm.total_credit_limit || 0),
        loan_sublimit: renewForm.loan_sublimit ? Number(renewForm.loan_sublimit) : null,
        guarantee_sublimit: renewForm.guarantee_sublimit ? Number(renewForm.guarantee_sublimit) : null,
        lc_sublimit: renewForm.lc_sublimit ? Number(renewForm.lc_sublimit) : null,
        signed_date: renewForm.signed_date,
        effective_from: renewForm.effective_from,
        effective_to: renewForm.effective_to,
        interest_rate_framework: renewForm.interest_rate_framework || null,
        notes: renewForm.notes || null,
        transfer_collateral_ids: renewForm.selected_collateral_ids,
      });
      setRenewTarget(null);
      await fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi tái cấp Hợp đồng tín dụng.');
    }
  };

  const handleDeleteAgreement = async (ag: CreditAgreement) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Hợp đồng tín dụng ${ag.agreement_number}?`)) return;
    try {
      await api.delete(`/credit-limits/agreements/${ag.agreement_id}`);
      if (selectedAgreement?.agreement_id === ag.agreement_id) setSelectedAgreement(null);
      await fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Không thể xóa Hợp đồng tín dụng.');
    }
  };

  const renderStatusBadge = (ag: CreditAgreement) => {
    switch (ag.computed_status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Đang hiệu lực (còn {ag.days_to_expiry} ngày)
          </span>
        );
      case 'EXPIRING_SOON':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Sắp hết hạn ({ag.days_to_expiry} ngày)
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Đã hết hạn ({Math.abs(ag.days_to_expiry)} ngày trước)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {ag.computed_status}
          </span>
        );
    }
  };

  const uniqueBanks = useMemo(() => {
    const map = new Map<string, string>();
    agreements.forEach((a) => map.set(a.bank_code, a.bank_name));
    return Array.from(map.entries());
  }, [agreements]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <Layers className="w-4 h-4" />
            <span>Phân hệ Quản lý hạn mức</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Hợp Đồng Tín Dụng (Hạn Mức Khung)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi Khế ước vay tự động gắn với 1 Hợp đồng tín dụng có thời gian hiệu lực tương ứng. Tự động tổng hợp hạn mức đã giải ngân, hạn mức còn lại và chuyển tiếp Tài sản đảm bảo khi hết hạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncLoans}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Tự động gắn Khế ước theo Ngày giải ngân
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Thêm Hợp đồng tín dụng
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tổng Hạn Mức Đang Hiệu Lực</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(summaryKpis.totalLimit)}</div>
          <div className="text-xs text-slate-500 mt-1">{summaryKpis.activeCount} Hợp đồng tín dụng đang mở</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Đã Giải Ngân (Từ Khế Ước ACTIVE)</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(summaryKpis.totalUtilized)}</div>
          <div className="text-xs text-slate-500 mt-1">
            Tỷ lệ sử dụng:{' '}
            <span className="font-semibold text-slate-700">
              {summaryKpis.totalLimit > 0 ? ((summaryKpis.totalUtilized / summaryKpis.totalLimit) * 100).toFixed(1) : 0}%
            </span>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Hạn Mức Còn Lại Khả Dụng</div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(summaryKpis.totalAvailable)}</div>
          <div className="text-xs text-slate-500 mt-1">Sẵn sàng giải ngân khế ước mới</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">HĐTD Sắp Hết Hạn / Đã Hết Hạn</div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{summaryKpis.expiringOrExpiredCount} HĐTD</div>
          <div className="text-xs text-slate-500 mt-1">Cần tái cấp hoặc chuyển tiếp TSĐB</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase text-slate-500">Ngân hàng:</span>
          <button
            onClick={() => setFilterBank('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterBank === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả ({agreements.length})
          </button>
          {uniqueBanks.map(([code, name]) => (
            <button
              key={code}
              onClick={() => setFilterBank(code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterBank === code ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {name} ({code})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Trạng thái:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-medium text-slate-700"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hiệu lực</option>
            <option value="EXPIRING_SOON">Sắp hết hạn (≤ 30 ngày)</option>
            <option value="EXPIRED">Đã hết hạn</option>
          </select>
        </div>
      </div>

      {/* Main Agreements List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Ngân hàng / Số HĐTD</th>
                <th className="px-4 py-3.5">Thời gian hiệu lực</th>
                <th className="px-4 py-3.5 text-right">Tổng Hạn Mức</th>
                <th className="px-4 py-3.5 text-right">Đã Giải Ngân (Khế ước)</th>
                <th className="px-4 py-3.5 text-right">Hạn Mức Còn Lại</th>
                <th className="px-4 py-3.5 text-center">Khế ước & TSĐB</th>
                <th className="px-4 py-3.5 text-center">Trạng Thái</th>
                <th className="px-4 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Đang tải dữ liệu Hợp đồng tín dụng...
                  </td>
                </tr>
              ) : filteredAgreements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Chưa có Hợp đồng tín dụng nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredAgreements.map((ag) => {
                  const pct = Math.min(100, Number(ag.utilization_pct || 0));
                  const isSelected = selectedAgreement?.agreement_id === ag.agreement_id;
                  return (
                    <tr
                      key={ag.agreement_id}
                      onClick={() => setSelectedAgreement(ag)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-100 text-blue-800">
                            {ag.bank_code}
                          </span>
                          <span className="font-bold text-slate-900">{ag.agreement_number}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1 font-medium">{ag.agreement_name}</div>
                        {ag.parent_agreement_number && (
                          <div className="text-[11px] text-indigo-600 mt-0.5">
                            ↳ Kế thừa từ HĐTD: <span className="font-semibold">{ag.parent_agreement_number}</span>
                          </div>
                        )}
                        {ag.renewed_to_agreement_number && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            ↱ Đã tái cấp sang: <span className="font-semibold">{ag.renewed_to_agreement_number}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center text-xs font-semibold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                          {ag.effective_from} → {ag.effective_to}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {ag.interest_rate_framework || 'Theo từng Khế ước nhận nợ'}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900">{formatCurrency(ag.total_credit_limit)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Cho vay: {formatCurrency(ag.loan_sublimit || ag.total_credit_limit)}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-blue-600">{formatCurrency(ag.utilized_loan_amount)}</div>
                        <div className="w-28 ml-auto bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${
                              pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{ag.utilization_pct}% hạn mức</div>
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-emerald-600">{formatCurrency(ag.available_credit_limit)}</div>
                        {ag.guarantee_sublimit && Number(ag.guarantee_sublimit) > 0 ? (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            HM Bảo lãnh: {formatCurrency(ag.guarantee_sublimit)}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center space-x-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {ag.active_loans_count} Khế ước
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            {ag.collateral_count} TSĐB
                          </span>
                        </div>
                        {ag.total_collateral_value > 0 && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            TSĐB: {formatCurrency(ag.total_collateral_value)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">{renderStatusBadge(ag)}</td>

                      <td className="px-4 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center space-x-1.5">
                          {(ag.computed_status === 'EXPIRED' || ag.computed_status === 'EXPIRING_SOON') && (
                            <button
                              onClick={() => openRenewModal(ag)}
                              title="Tái cấp HĐTD mới & Chuyển tiếp Tài sản đảm bảo"
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300 flex items-center"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                              Chuyển tiếp HĐTD mới
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(ag)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg"
                            title="Chỉnh sửa HĐTD"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAgreement(ag)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Xóa HĐTD"
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

      {/* Chi tiết Hợp đồng tín dụng được chọn: Danh sách Khế ước con & Tài sản đảm bảo gắn liền */}
      {selectedAgreement && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-md p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-blue-600 text-white">
                  {selectedAgreement.bank_name} ({selectedAgreement.bank_code})
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Chi Tiết Hợp Đồng Tín Dụng: {selectedAgreement.agreement_number}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Hiệu lực từ <strong>{selectedAgreement.effective_from}</strong> đến{' '}
                <strong>{selectedAgreement.effective_to}</strong> • Các khế ước có ngày giải ngân trong khoảng này được tự động gắn vào HĐTD.
              </p>
            </div>
            <button
              onClick={() => setSelectedAgreement(null)}
              className="self-start md:self-auto text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200"
            >
              Đóng chi tiết
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cột 1: Danh sách các Khế ước nhận nợ thuộc HĐTD */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2 font-bold text-slate-800 text-sm">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Danh Sách Khế Ước Thuộc HĐTD ({selectedAgreement.linked_loans.length})</span>
                </div>
                <Link
                  to="/contract-details"
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center"
                >
                  Mở trang Khế ước <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {selectedAgreement.linked_loans.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Chưa có khế ước nào có ngày giải ngân nằm trong kỳ hiệu lực ({selectedAgreement.effective_from} →{' '}
                    {selectedAgreement.effective_to}).
                  </div>
                ) : (
                  selectedAgreement.linked_loans.map((loan) => (
                    <div key={loan.loan_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{loan.contract_number}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Giải ngân: <span className="font-semibold text-slate-700">{loan.disbursement_date || 'N/A'}</span> • Đáo hạn:{' '}
                          <span className="font-semibold text-slate-700">{loan.maturity_date || 'N/A'}</span> • LS:{' '}
                          <span className="text-blue-600 font-semibold">{loan.interest_rate}%/năm</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          {formatCurrency(loan.current_principal_balance)}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                            loan.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {loan.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Cột 2: Danh sách Tài sản đảm bảo đang thế chấp cho HĐTD này */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2 font-bold text-slate-800 text-sm">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <span>Tài Sản Đảm Bảo Gắn Với HĐTD ({selectedAgreement.linked_collaterals.length})</span>
                </div>
                <Link
                  to="/collateral-assets"
                  className="text-xs font-semibold text-purple-600 hover:underline flex items-center"
                >
                  Quản lý Tài sản đảm bảo <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {selectedAgreement.linked_collaterals.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Chưa có Tài sản đảm bảo nào gắn với Hợp đồng tín dụng này.
                  </div>
                ) : (
                  selectedAgreement.linked_collaterals.map((col: LinkedCollateralBrief) => (
                    <div key={col.asset_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-xs">{col.asset_code}</span>
                          {col.requires_revaluation && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                              Yêu cầu định giá lại (&gt;6 tháng)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 mt-0.5">{col.asset_name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Chủ sở hữu: <strong>{col.owner_name}</strong> • Định giá gần nhất:{' '}
                          {col.latest_valuation_date || 'Chưa định giá'}
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap ml-3">
                        <div className="text-xs font-bold text-slate-900">{formatCurrency(col.appraised_value)}</div>
                        <div className="text-[11px] text-purple-700 font-semibold">
                          LTV {col.ltv_ratio}% → Max: {formatCurrency(col.max_secured_loan_value)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Chỉnh sửa Hợp đồng tín dụng */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingAgreement ? 'Cập Nhật Hợp Đồng Tín Dụng' : 'Thêm Hợp Đồng Tín Dụng Mới'}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAgreement} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Ngân hàng *</label>
                  <select
                    value={formData.bank_code}
                    onChange={(e) => {
                      const code = e.target.value;
                      const bankMap: Record<string, string> = {
                        CTG: 'VietinBank',
                        MBB: 'MBBank',
                        VPB: 'VPBank',
                        BIDV: 'BIDV',
                        VCB: 'Vietcombank',
                        TCB: 'Techcombank',
                        TPB: 'TPBank',
                        SHB: 'SHB',
                      };
                      setFormData({ ...formData, bank_code: code, bank_name: bankMap[code] || code });
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="CTG">CTG - VietinBank</option>
                    <option value="MBB">MBB - MBBank</option>
                    <option value="VPB">VPB - VPBank</option>
                    <option value="BIDV">BIDV - BIDV</option>
                    <option value="VCB">VCB - Vietcombank</option>
                    <option value="TCB">TCB - Techcombank</option>
                    <option value="TPB">TPB - TPBank</option>
                    <option value="SHB">SHB - SHB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên hiển thị Ngân hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Hợp đồng tín dụng *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 02/2026-HĐCVHM/NHCT106"
                    value={formData.agreement_number}
                    onChange={(e) => setFormData({ ...formData, agreement_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên / Mô tả HĐTD *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: HĐTD Hạn mức Ngắn hạn 2026 - 2027"
                    value={formData.agreement_name}
                    onChange={(e) => setFormData({ ...formData, agreement_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pháp nhân vay vốn *</label>
                <input
                  type="text"
                  required
                  value={formData.borrower_name}
                  onChange={(e) => setFormData({ ...formData, borrower_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tổng hạn mức tín dụng (VND) *</label>
                  <input
                    type="number"
                    required
                    value={formData.total_credit_limit}
                    onChange={(e) => setFormData({ ...formData, total_credit_limit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn mức Cho vay (Loan)</label>
                  <input
                    type="number"
                    value={formData.loan_sublimit}
                    onChange={(e) => setFormData({ ...formData, loan_sublimit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn mức Bảo lãnh / L/C</label>
                  <input
                    type="number"
                    value={formData.guarantee_sublimit}
                    onChange={(e) => setFormData({ ...formData, guarantee_sublimit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày ký HĐTD</label>
                  <input
                    type="date"
                    value={formData.signed_date}
                    onChange={(e) => setFormData({ ...formData, signed_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">Hiệu lực từ ngày *</label>
                  <input
                    type="date"
                    required
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                    className="w-full border border-blue-300 rounded-xl px-3 py-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">Hiệu lực đến ngày *</label>
                  <input
                    type="date"
                    required
                    value={formData.effective_to}
                    onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                    className="w-full border border-blue-300 rounded-xl px-3 py-2 bg-white"
                  />
                </div>
                <div className="sm:col-span-3 text-[11px] text-blue-700">
                  * Các Khế ước tại {formData.bank_name} có Ngày giải ngân nằm trong khoảng{' '}
                  <strong>
                    {formData.effective_from || '...'} → {formData.effective_to || '...'}
                  </strong>{' '}
                  sẽ tự động được gắn vào Hợp đồng tín dụng này.
                </div>
              </div>

              {!editingAgreement && (
                <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
                  <label className="block text-xs font-bold text-amber-900">
                    Kế thừa từ Hợp đồng tín dụng cũ (Tùy chọn - Dùng khi HĐTD cũ hết hạn)
                  </label>
                  <select
                    value={formData.parent_agreement_id}
                    onChange={(e) => setFormData({ ...formData, parent_agreement_id: e.target.value })}
                    className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white text-xs"
                  >
                    <option value="">-- Không kế thừa (Hợp đồng cấp mới độc lập) --</option>
                    {agreements
                      .filter((a) => a.bank_code === formData.bank_code)
                      .map((a) => (
                        <option key={a.agreement_id} value={a.agreement_id}>
                          {a.agreement_number} - {a.agreement_name} ({a.computed_status}) - Có {a.collateral_count} TSĐB
                        </option>
                      ))}
                  </select>
                  {formData.parent_agreement_id && (
                    <label className="flex items-center space-x-2 text-xs text-amber-900 font-medium pt-1">
                      <input
                        type="checkbox"
                        checked={formData.transfer_collaterals_from_parent}
                        onChange={(e) =>
                          setFormData({ ...formData, transfer_collaterals_from_parent: e.target.checked })
                        }
                        className="rounded text-amber-600"
                      />
                      <span>Tự động chuyển tiếp toàn bộ Tài sản đảm bảo từ HĐTD cũ sang HĐTD mới này</span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Khung lãi suất & Ghi chú</label>
                <input
                  type="text"
                  placeholder="VD: 6.5% - 7.5%/năm, trả lãi ngày 05 hàng tháng"
                  value={formData.interest_rate_framework}
                  onChange={(e) => setFormData({ ...formData, interest_rate_framework: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Lưu Hợp đồng tín dụng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tái cấp HĐTD & Chuyển tiếp Tài sản đảm bảo từ HĐTD hết hạn */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Tái Cấp Hạn Mức & Chuyển Tiếp Tài Sản Đảm Bảo
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Từ HĐTD cũ: <strong>{renewTarget.agreement_number}</strong> ({renewTarget.bank_name}) sang HĐTD mới
                </p>
              </div>
              <button onClick={() => setRenewTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Hợp đồng tín dụng MỚI *</label>
                  <input
                    type="text"
                    required
                    value={renewForm.new_agreement_number}
                    onChange={(e) => setRenewForm({ ...renewForm, new_agreement_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên Hợp đồng tín dụng MỚI *</label>
                  <input
                    type="text"
                    required
                    value={renewForm.new_agreement_name}
                    onChange={(e) => setRenewForm({ ...renewForm, new_agreement_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tổng hạn mức mới (VND) *</label>
                  <input
                    type="number"
                    required
                    value={renewForm.total_credit_limit}
                    onChange={(e) => setRenewForm({ ...renewForm, total_credit_limit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hiệu lực từ ngày *</label>
                  <input
                    type="date"
                    required
                    value={renewForm.effective_from}
                    onChange={(e) => setRenewForm({ ...renewForm, effective_from: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hiệu lực đến ngày *</label>
                  <input
                    type="date"
                    required
                    value={renewForm.effective_to}
                    onChange={(e) => setRenewForm({ ...renewForm, effective_to: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="border border-purple-200 bg-purple-50/50 rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold text-purple-900">
                  Chọn Tài sản đảm bảo chuyển tiếp từ HĐTD cũ sang HĐTD mới ({renewTarget.linked_collaterals.length} tài sản):
                </div>
                {renewTarget.linked_collaterals.length === 0 ? (
                  <div className="text-xs text-slate-500">HĐTD cũ không có tài sản đảm bảo nào đang gắn.</div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {renewTarget.linked_collaterals.map((c) => {
                      const checked = renewForm.selected_collateral_ids.includes(c.asset_id);
                      return (
                        <label
                          key={c.asset_id}
                          className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-purple-200 cursor-pointer"
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRenewForm({
                                    ...renewForm,
                                    selected_collateral_ids: [...renewForm.selected_collateral_ids, c.asset_id],
                                  });
                                } else {
                                  setRenewForm({
                                    ...renewForm,
                                    selected_collateral_ids: renewForm.selected_collateral_ids.filter(
                                      (id) => id !== c.asset_id
                                    ),
                                  });
                                }
                              }}
                              className="rounded text-purple-600"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-900">
                                {c.asset_code} — {c.asset_name}
                              </div>
                              <div className="text-[11px] text-slate-500">Chủ sở hữu: {c.owner_name}</div>
                            </div>
                          </div>
                          <div className="text-xs font-bold text-purple-700">{formatCurrency(c.appraised_value)}</div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRenewTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700"
                >
                  Tạo HĐTD mới & Chuyển tiếp TSĐB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
