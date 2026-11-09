import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  FileText,
  Image as ImageIcon,
  ArrowRightLeft,
  Download,
  Trash2,
  Edit2,
  X,
  Upload,
  ExternalLink,
} from 'lucide-react';
import api from '../services/api';
import { CollateralAsset, CreditAgreement } from '../types';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';
import { fetchMasterBanks, MasterBank, ALL_VIETNAM_BANKS } from '../services/bankService';

const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val))) + ' đ';
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE_LAND: 'BĐS Đất & Nhà ở (Sổ đỏ/Sổ hồng)',
  FACTORY_INDUSTRIAL: 'Nhà xưởng & BĐS Khu công nghiệp',
  MACHINERY_VEHICLE: 'Máy móc thiết bị & Phương tiện',
  DEPOSIT_SAVINGS: 'Sổ tiết kiệm / Hợp đồng tiền gửi',
  INVENTORY_RECEIVABLES: 'Hàng tồn kho & Quyền đòi nợ',
  OTHER: 'Tài sản khác',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  UNVALUED: { label: 'Chưa định giá', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  VALUED: { label: 'Đã định giá', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  MORTGAGED: { label: 'Thế chấp', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RELEASED: { label: 'Giải chấp', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  RED_BOOK: 'File Sổ đỏ / Sổ hồng / GCN QSDĐ',
  SITE_PHOTO: 'Ảnh chụp thực tế tài sản',
  MORTGAGE_CONTRACT: 'Hợp đồng thế chấp công chứng',
  SECURITY_REGISTRATION: 'Chứng nhận Đăng ký giao dịch bảo đảm',
  OTHER: 'Hồ sơ tài sản khác',
};

export const CollateralAssetsPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();
  const [assets, setAssets] = useState<CollateralAsset[]>([]);
  const [agreements, setAgreements] = useState<CreditAgreement[]>([]);
  const [masterBanks, setMasterBanks] = useState<MasterBank[]>(ALL_VIETNAM_BANKS);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterBank, setFilterBank] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [onlyRevaluationAlert, setOnlyRevaluationAlert] = useState<boolean>(false);

  // Tài sản đang mở xem chi tiết (4 Tabs)
  const [selectedAsset, setSelectedAsset] = useState<CollateralAsset | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'VALUATIONS' | 'DOSSIER' | 'TRANSFER'>('OVERVIEW');

  // Modal Thêm / Sửa Tài sản đảm bảo
  const [showAssetModal, setShowAssetModal] = useState<boolean>(false);
  const [editingAsset, setEditingAsset] = useState<CollateralAsset | null>(null);
  const [assetForm, setAssetForm] = useState({
    asset_code: '',
    asset_name: '',
    asset_type: 'REAL_ESTATE_LAND',
    owner_name: '',
    owner_id_or_tax_code: '',
    ownership_relation: 'BORROWER_OWNED',
    agreement_id: '',
    bank_code: 'CTG',
    bank_name: 'VietinBank',
    appraised_value: '',
    ltv_ratio: '70',
    collateral_status: 'MORTGAGED',
    latest_valuation_date: '',
    certificate_number: '',
    certificate_issue_date: '',
    certificate_issued_by: '',
    address: '',
    land_area_m2: '',
    google_maps_url: '',
    latitude: '',
    longitude: '',
    notes: '',
  });

  // Form Thêm Lịch sử định giá (Tab 2)
  const [valOrg, setValOrg] = useState<string>('');
  const [valAmount, setValAmount] = useState<string>('');
  const [valDate, setValDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [valReportNo, setValReportNo] = useState<string>('');
  const [valNotes, setValNotes] = useState<string>('');
  const [valFile, setValFile] = useState<File | null>(null);
  const [submittingVal, setSubmittingVal] = useState<boolean>(false);

  // Form Tải lên Bộ hồ sơ tài sản (Tab 3: Sổ đỏ, Ảnh chụp thực tế, HĐ thế chấp)
  const [docCategory, setDocCategory] = useState<string>('RED_BOOK');
  const [docDesc, setDocDesc] = useState<string>('');
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);

  // Form Chuyển tiếp Hợp đồng tín dụng / Giải chấp (Tab 4)
  const [transferToAgreementId, setTransferToAgreementId] = useState<string>('');
  const [transferActionType, setTransferActionType] = useState<string>('ROLLOVER_TRANSFER');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [transferNotes, setTransferNotes] = useState<string>('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [colRes, agRes, banks] = await Promise.all([
        api.get<CollateralAsset[]>('/credit-limits/collaterals'),
        api.get<CreditAgreement[]>('/credit-limits/agreements'),
        fetchMasterBanks(),
      ]);
      const list = colRes.data || [];
      setAssets(list);
      setAgreements(agRes.data || []);
      if (banks && banks.length > 0) setMasterBanks(banks);
      if (selectedAsset) {
        const updated = list.find((a) => a.asset_id === selectedAsset.asset_id);
        if (updated) setSelectedAsset(updated);
      } else if (list.length > 0) {
        setSelectedAsset(list[0]);
      }
    } catch (err) {
      console.error('Lỗi tải Tài sản đảm bảo:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [selectedEntity]);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (filterBank !== 'ALL' && a.bank_code !== filterBank) return false;
      if (filterStatus !== 'ALL' && a.collateral_status !== filterStatus) return false;
      if (onlyRevaluationAlert && !a.requires_revaluation) return false;
      return true;
    });
  }, [assets, filterBank, filterStatus, onlyRevaluationAlert]);

  const kpis = useMemo(() => {
    const activeCols = assets.filter((a) => a.collateral_status !== 'RELEASED');
    const totalAppraised = activeCols.reduce((s, a) => s + Number(a.appraised_value || 0), 0);
    const totalMaxSecured = activeCols.reduce((s, a) => s + Number(a.max_secured_loan_value || 0), 0);
    const revaluationAlertCount = assets.filter((a) => a.requires_revaluation).length;
    const expiredAgreementAssetCount = assets.filter(
      (a) => a.agreement_status === 'EXPIRED' && a.collateral_status === 'MORTGAGED'
    ).length;
    return {
      totalCount: assets.length,
      totalAppraised,
      totalMaxSecured,
      revaluationAlertCount,
      expiredAgreementAssetCount,
    };
  }, [assets]);

  const openCreateModal = () => {
    setEditingAsset(null);
    const firstAg = agreements.find((a) => a.computed_status === 'ACTIVE') || agreements[0];
    setAssetForm({
      asset_code: `TSĐB-${firstAg?.bank_code || 'CTG'}-${String(assets.length + 1).padStart(2, '0')}`,
      asset_name: '',
      asset_type: 'REAL_ESTATE_LAND',
      owner_name:
        (selectedEntity.id !== 'ALL' ? selectedEntity.name : '') ||
        'CONG TY CO PHAN XI MANG SUNRISE',
      owner_id_or_tax_code: selectedEntity?.taxCode || '0109730501',
      ownership_relation: 'BORROWER_OWNED',
      agreement_id: firstAg ? String(firstAg.agreement_id) : '',
      bank_code: firstAg?.bank_code || 'CTG',
      bank_name: firstAg?.bank_name || 'VietinBank',
      appraised_value: '30000000000',
      ltv_ratio: '70',
      collateral_status: 'MORTGAGED',
      latest_valuation_date: new Date().toISOString().slice(0, 10),
      certificate_number: '',
      certificate_issue_date: '',
      certificate_issued_by: '',
      address: '',
      land_area_m2: '',
      google_maps_url: 'https://www.google.com/maps?q=21.0285,105.8542',
      latitude: '21.0285',
      longitude: '105.8542',
      notes: '',
    });
    setShowAssetModal(true);
  };

  const openEditModal = (a: CollateralAsset) => {
    setEditingAsset(a);
    setAssetForm({
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      asset_type: a.asset_type,
      owner_name: a.owner_name,
      owner_id_or_tax_code: a.owner_id_or_tax_code || '',
      ownership_relation: a.ownership_relation || 'BORROWER_OWNED',
      agreement_id: a.agreement_id ? String(a.agreement_id) : '',
      bank_code: a.bank_code || 'CTG',
      bank_name: a.bank_name || 'VietinBank',
      appraised_value: String(a.appraised_value || 0),
      ltv_ratio: String(a.ltv_ratio || 70),
      collateral_status: a.collateral_status,
      latest_valuation_date: a.latest_valuation_date || '',
      certificate_number: a.certificate_number || '',
      certificate_issue_date: a.certificate_issue_date || '',
      certificate_issued_by: a.certificate_issued_by || '',
      address: a.address || '',
      land_area_m2: a.land_area_m2 ? String(a.land_area_m2) : '',
      google_maps_url: a.google_maps_url || '',
      latitude: a.latitude ? String(a.latitude) : '',
      longitude: a.longitude ? String(a.longitude) : '',
      notes: a.notes || '',
    });
    setShowAssetModal(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        asset_code: assetForm.asset_code,
        asset_name: assetForm.asset_name,
        asset_type: assetForm.asset_type,
        owner_name: assetForm.owner_name,
        owner_id_or_tax_code: assetForm.owner_id_or_tax_code || null,
        ownership_relation: assetForm.ownership_relation,
        agreement_id: assetForm.agreement_id ? Number(assetForm.agreement_id) : null,
        bank_code: assetForm.bank_code || null,
        bank_name: assetForm.bank_name || null,
        appraised_value: Number(assetForm.appraised_value || 0),
        ltv_ratio: Number(assetForm.ltv_ratio || 70),
        collateral_status: assetForm.collateral_status,
        latest_valuation_date: assetForm.latest_valuation_date || null,
        certificate_number: assetForm.certificate_number || null,
        certificate_issue_date: assetForm.certificate_issue_date || null,
        certificate_issued_by: assetForm.certificate_issued_by || null,
        address: assetForm.address || null,
        land_area_m2: assetForm.land_area_m2 ? Number(assetForm.land_area_m2) : null,
        google_maps_url: assetForm.google_maps_url || null,
        latitude: assetForm.latitude ? Number(assetForm.latitude) : null,
        longitude: assetForm.longitude ? Number(assetForm.longitude) : null,
        notes: assetForm.notes || null,
      };
      if (editingAsset) {
        await api.put(`/credit-limits/collaterals/${editingAsset.asset_id}`, payload);
      } else {
        await api.post('/credit-limits/collaterals', payload);
      }
      setShowAssetModal(false);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi lưu Tài sản đảm bảo.');
    }
  };

  const handleAddValuation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    setSubmittingVal(true);
    try {
      const fd = new FormData();
      fd.append('valuation_org', valOrg);
      fd.append('valuation_amount', valAmount);
      fd.append('valuation_date', valDate);
      if (valReportNo) fd.append('report_number', valReportNo);
      if (valNotes) fd.append('notes', valNotes);
      if (valFile) fd.append('file', valFile);

      await api.post(`/credit-limits/collaterals/${selectedAsset.asset_id}/valuations`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setValOrg('');
      setValAmount('');
      setValReportNo('');
      setValNotes('');
      setValFile(null);
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi thêm Lịch sử định giá.');
    } finally {
      setSubmittingVal(false);
    }
  };

  const handleDeleteValuation = async (valId: number) => {
    if (!window.confirm('Xóa bản ghi Lịch sử định giá này?')) return;
    try {
      await api.delete(`/credit-limits/collaterals/valuations/${valId}`);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadAssetDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAsset) return;
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_category', docCategory);
      fd.append('description', docDesc || file.name);
      await api.post(`/credit-limits/collaterals/${selectedAsset.asset_id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDocDesc('');
      await fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi tải lên hồ sơ tài sản.');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleDeleteAssetDoc = async (docId: number) => {
    if (!window.confirm('Xóa tệp này khỏi Bộ hồ sơ tài sản?')) return;
    try {
      await api.delete(`/credit-limits/collaterals/documents/${docId}`);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTransferAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      await api.post(`/credit-limits/collaterals/${selectedAsset.asset_id}/transfer-agreement`, {
        to_agreement_id: transferActionType === 'RELEASE' ? null : Number(transferToAgreementId),
        action_type: transferActionType,
        effective_date: transferDate,
        notes: transferNotes,
        performed_by: 'Chị Cẩm Nhung',
      });
      setTransferNotes('');
      await fetchAll();
      alert('Đã cập nhật liên kết Hợp đồng tín dụng và lưu lịch sử thành công!');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi chuyển Hợp đồng tín dụng.');
    }
  };

  const handleDeleteAsset = async (asset: CollateralAsset) => {
    if (!window.confirm(`Xóa Tài sản đảm bảo ${asset.asset_code}?`)) return;
    try {
      await api.delete(`/credit-limits/collaterals/${asset.asset_id}`);
      if (selectedAsset?.asset_id === asset.asset_id) setSelectedAsset(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-purple-600 mb-1">
            <Shield className="w-4 h-4" />
            <span>Phân hệ Quản lý hạn mức</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tài Sản Đảm Bảo Tại Các Ngân Hàng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý Chủ sở hữu, Giá trị thẩm định, LTV, Tình trạng (Chưa định giá / Đã định giá / Thế chấp / Giải chấp), Lịch sử định giá kèm Biên bản, Bộ hồ sơ tài sản (Sổ đỏ, Ảnh thực tế, Định vị Google Map) và chuyển tiếp HĐTD.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Thêm Tài Sản Đảm Bảo
        </button>
      </div>

      {/* Banner Cảnh báo "Yêu cầu định giá lại" (> 6 tháng) & HĐTD hết hạn chờ chuyển tiếp */}
      {(kpis.revaluationAlertCount > 0 || kpis.expiredAgreementAssetCount > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {kpis.revaluationAlertCount > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-sm">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-rose-900">
                    Cảnh Báo Định Giá Định Kỳ: Có {kpis.revaluationAlertCount} tài sản hiển thị &ldquo;Yêu cầu định giá lại&rdquo;
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Thời điểm định giá gần nhất đã cách hiện tại quá hơn 6 tháng (&gt;180 ngày). Cần thực hiện định giá lại và cập nhật Biên bản định giá.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOnlyRevaluationAlert(!onlyRevaluationAlert)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition-colors ${
                  onlyRevaluationAlert
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-100'
                }`}
              >
                {onlyRevaluationAlert ? 'Hiện tất cả TSĐB' : 'Lọc TSĐB cần định giá lại'}
              </button>
            </div>
          )}

          {kpis.expiredAgreementAssetCount > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-sm">
              <div className="flex items-start space-x-3">
                <ArrowRightLeft className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-amber-900">
                    Có {kpis.expiredAgreementAssetCount} tài sản đang gắn với Hợp đồng tín dụng đã hết hạn
                  </h3>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Mỗi tài sản chỉ thế chấp tại 1 ngân hàng gắn với HĐTD. Khi HĐTD cũ hết hạn, bạn có thể bấm gán tiếp sang cho Hợp đồng tín dụng mới.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tổng Số Tài Sản Đảm Bảo</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{kpis.totalCount} Tài sản</div>
          <div className="text-xs text-slate-500 mt-1">Độc quyền 1 Ngân hàng / 1 TSĐB</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tổng Giá Trị Thẩm Định Hiện Hành</div>
          <div className="text-2xl font-bold text-purple-600 mt-2">{formatCurrency(kpis.totalAppraised)}</div>
          <div className="text-xs text-slate-500 mt-1">Nhập độc lập với lịch sử định giá</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tổng Giá Trị Bảo Đảm Theo LTV</div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(kpis.totalMaxSecured)}</div>
          <div className="text-xs text-slate-500 mt-1">= Giá trị thẩm định × LTV (%)</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-400">Tài Sản Quá 6 Tháng Định Giá</div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{kpis.revaluationAlertCount} Tài sản</div>
          <div className="text-xs text-rose-600 font-semibold mt-1">Yêu cầu định giá lại</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-slate-500">Tình trạng TSĐB:</span>
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'UNVALUED', label: 'Chưa định giá' },
            { key: 'VALUED', label: 'Đã định giá' },
            { key: 'MORTGAGED', label: 'Thế chấp' },
            { key: 'RELEASED', label: 'Giải chấp' },
          ].map((st) => (
            <button
              key={st.key}
              onClick={() => setFilterStatus(st.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === st.key ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase text-slate-500">Ngân hàng nhận thế chấp:</span>
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

      {/* Bảng Danh sách Tài sản đảm bảo */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Mã & Tên Tài Sản Đảm Bảo</th>
                <th className="px-4 py-3.5">Tên Chủ Sở Hữu</th>
                <th className="px-4 py-3.5">Ngân Hàng & HĐTD Gắn Liền</th>
                <th className="px-4 py-3.5 text-right">Giá Trị Thẩm Định</th>
                <th className="px-4 py-3.5 text-center">LTV (%)</th>
                <th className="px-4 py-3.5 text-center">Tình Trạng</th>
                <th className="px-4 py-3.5">Định Giá Gần Nhất & Cảnh Báo</th>
                <th className="px-4 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                    Đang tải danh sách Tài sản đảm bảo...
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                    Không có Tài sản đảm bảo nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredAssets.map((a) => {
                  const st = STATUS_CONFIG[a.collateral_status] || STATUS_CONFIG.MORTGAGED;
                  const isSelected = selectedAsset?.asset_id === a.asset_id;
                  return (
                    <tr
                      key={a.asset_id}
                      onClick={() => setSelectedAsset(a)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-purple-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-purple-700 text-xs">{a.asset_code}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {ASSET_TYPE_LABELS[a.asset_type] || a.asset_type}
                          </span>
                        </div>
                        <div className="font-bold text-slate-900 mt-1">{a.asset_name}</div>
                        {a.certificate_number && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            Số Sổ đỏ/GCN: <strong className="text-slate-700">{a.certificate_number}</strong>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900 text-xs">{a.owner_name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {a.ownership_relation === 'THIRD_PARTY' ? 'Bên thứ 3 bảo lãnh' : 'Chính chủ doanh nghiệp'}
                          {a.owner_id_or_tax_code ? ` • ${a.owner_id_or_tax_code}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {a.bank_code ? (
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-100 text-blue-800">
                                {a.bank_code}
                              </span>
                              <span className="text-xs font-bold text-slate-800">{a.bank_name}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              HĐTD: <strong className="text-slate-900">{a.agreement_number || 'Chưa gắn'}</strong>
                            </div>
                            {a.agreement_status === 'EXPIRED' && (
                              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                HĐTD đã hết hạn → Chờ gán sang HĐTD mới
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Chưa thế chấp ngân hàng</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900">{formatCurrency(a.appraised_value)}</div>
                        <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                          Bảo đảm tối đa: {formatCurrency(a.max_secured_loan_value)}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 font-bold text-xs">
                          {a.ltv_ratio}%
                        </span>
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-800">
                          {a.latest_valuation_date || 'Chưa định giá'}
                        </div>
                        {a.days_since_valuation !== null && a.days_since_valuation !== undefined && (
                          <div className="text-[11px] text-slate-500">Cách đây {a.days_since_valuation} ngày</div>
                        )}
                        {a.requires_revaluation ? (
                          <div className="mt-1 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-600 text-white shadow-sm">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                            Yêu cầu định giá lại
                          </div>
                        ) : (
                          <div className="mt-1 inline-flex items-center text-[11px] font-semibold text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Còn hiệu lực (&le; 6 tháng)
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center space-x-1">
                          <button
                            onClick={() => openEditModal(a)}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-slate-100 rounded-lg"
                            title="Chỉnh sửa TSĐB"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(a)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Xóa TSĐB"
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

      {/* Khu vực Chi Tiết Tài Sản Đảm Bảo Đang Chọn (4 Tabs chuyên sâu) */}
      {selectedAsset && (
        <div className="bg-white rounded-2xl border-2 border-purple-200 shadow-md overflow-hidden">
          {/* Header Chi Tiết */}
          <div className="bg-slate-900 text-white px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-purple-500 text-white">
                  {selectedAsset.asset_code}
                </span>
                {selectedAsset.requires_revaluation && (
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-rose-500 text-white flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    Yêu cầu định giá lại (&gt; 6 tháng)
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold mt-1">{selectedAsset.asset_name}</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Chủ sở hữu: <strong>{selectedAsset.owner_name}</strong> • Ngân hàng thế chấp:{' '}
                <strong>{selectedAsset.bank_name || 'Chưa thế chấp'}</strong> • HĐTD:{' '}
                <strong>{selectedAsset.agreement_number || 'Chưa gắn'}</strong>
              </p>
            </div>

            {/* Tabs Navigation */}
            <div className="flex flex-wrap gap-1.5 bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('OVERVIEW')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'OVERVIEW' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                1. Thông tin &amp; Google Map
              </button>
              <button
                onClick={() => setActiveTab('VALUATIONS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'VALUATIONS' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                2. Lịch sử định giá ({selectedAsset.valuations.length})
              </button>
              <button
                onClick={() => setActiveTab('DOSSIER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'DOSSIER' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                3. Bộ hồ sơ tài sản ({selectedAsset.documents.length})
              </button>
              <button
                onClick={() => setActiveTab('TRANSFER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'TRANSFER' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                4. Chuyển tiếp HĐTD ({selectedAsset.agreement_history.length})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* TAB 1: THÔNG TIN CHUNG & ĐỊNH VỊ GOOGLE MAPS */}
            {activeTab === 'OVERVIEW' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4 text-sm">
                  <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-2">
                    Thông Tin Pháp Lý & Thẩm Định Tài Sản
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">Chủ sở hữu tài sản:</span>
                      <div className="font-bold text-slate-900 mt-0.5">{selectedAsset.owner_name}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">Số Sổ đỏ / Sổ hồng / GCN:</span>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {selectedAsset.certificate_number || 'Chưa cập nhật'}
                      </div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                      <span className="text-purple-600 font-semibold">Giá trị thẩm định hiện hành:</span>
                      <div className="font-bold text-purple-900 text-sm mt-0.5">
                        {formatCurrency(selectedAsset.appraised_value)}
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="text-emerald-700 font-semibold">Tỷ lệ LTV &amp; Bảo đảm tối đa:</span>
                      <div className="font-bold text-emerald-900 text-sm mt-0.5">
                        LTV {selectedAsset.ltv_ratio}% → {formatCurrency(selectedAsset.max_secured_loan_value)}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl text-xs space-y-1">
                    <div>
                      <strong>Địa chỉ thực tế:</strong> {selectedAsset.address || 'Chưa cập nhật địa chỉ'}
                    </div>
                    {selectedAsset.land_area_m2 && (
                      <div>
                        <strong>Diện tích đất / sàn:</strong> {selectedAsset.land_area_m2} m²
                      </div>
                    )}
                    {selectedAsset.certificate_issued_by && (
                      <div>
                        <strong>Cơ quan cấp GCN:</strong> {selectedAsset.certificate_issued_by} (Ngày cấp:{' '}
                        {selectedAsset.certificate_issue_date || 'N/A'})
                      </div>
                    )}
                    {selectedAsset.notes && (
                      <div className="pt-1 text-slate-600">
                        <strong>Ghi chú:</strong> {selectedAsset.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Định vị Google Maps */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center">
                      <MapPin className="w-4 h-4 text-rose-600 mr-1.5" />
                      Định Vị Tài Sản Trên Google Maps
                    </h3>
                    {selectedAsset.google_maps_url && (
                      <a
                        href={selectedAsset.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs font-bold text-blue-600 hover:underline"
                      >
                        Mở Google Maps trên tab mới <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </a>
                    )}
                  </div>

                  {selectedAsset.latitude && selectedAsset.longitude ? (
                    <div className="rounded-xl overflow-hidden border border-slate-200 h-56 bg-slate-100">
                      <iframe
                        title="Google Map Location"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        src={`https://maps.google.com/maps?q=${selectedAsset.latitude},${selectedAsset.longitude}&z=15&output=embed`}
                      />
                    </div>
                  ) : (
                    <div className="h-56 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-xs text-slate-500 p-4 text-center">
                      <MapPin className="w-8 h-8 text-slate-400 mb-2" />
                      <p>Chưa nhập tọa độ (Latitude, Longitude) cho tài sản này.</p>
                      {selectedAsset.google_maps_url && (
                        <a
                          href={selectedAsset.google_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold"
                        >
                          Mở Link Định Vị Google Map
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: LỊCH SỬ ĐỊNH GIÁ (Tổ chức định giá, Giá trị định giá, Thời điểm định giá, File Biên bản) */}
            {activeTab === 'VALUATIONS' && (
              <div className="space-y-6">
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
                  <strong>Quy tắc độc lập:</strong> Bảng Lịch sử định giá dưới đây lưu vết tất cả các lần thẩm định giá qua các thời kỳ (Tổ chức định giá, Giá trị định giá, Thời điểm định giá, File Biên bản định giá) và <strong>không tự động ghi đè</strong> Giá trị thẩm định hiện hành &amp; LTV trên Tài sản. Nếu lần định giá gần nhất cách thời điểm hiện tại quá <strong>6 tháng</strong>, hệ thống tự động bật cảnh báo <strong>&ldquo;Yêu cầu định giá lại&rdquo;</strong>.
                </div>

                {/* Form Thêm Lần Định Giá Mới */}
                <form
                  onSubmit={handleAddValuation}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-xs"
                >
                  <div className="md:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">Tổ chức định giá *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Công ty Thẩm định giá VietinBank AMC"
                      value={valOrg}
                      onChange={(e) => setValOrg(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Giá trị định giá (VND) *</label>
                    <input
                      type="number"
                      required
                      placeholder="VD: 52500000000"
                      value={valAmount}
                      onChange={(e) => setValAmount(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Thời điểm định giá *</label>
                    <input
                      type="date"
                      required
                      value={valDate}
                      onChange={(e) => setValDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">File Biên bản định giá</label>
                    <input
                      type="file"
                      onChange={(e) => setValFile(e.target.files?.[0] || null)}
                      className="w-full text-[11px] border border-slate-300 rounded-lg p-1.5 bg-white"
                    />
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={submittingVal}
                      className="w-full py-2 px-3 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700"
                    >
                      {submittingVal ? 'Đang lưu...' : '+ Thêm Định Giá'}
                    </button>
                  </div>
                </form>

                {/* Bảng Lịch sử định giá */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase">
                      <tr>
                        <th className="px-4 py-3">Thời Điểm Định Giá</th>
                        <th className="px-4 py-3">Tổ Chức Định Giá</th>
                        <th className="px-4 py-3 text-right">Giá Trị Định Giá</th>
                        <th className="px-4 py-3">File Biên Bản Định Giá</th>
                        <th className="px-4 py-3">Ghi Chú</th>
                        <th className="px-4 py-3 text-right">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedAsset.valuations.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                            Chưa có lịch sử định giá cho tài sản này.
                          </td>
                        </tr>
                      ) : (
                        selectedAsset.valuations.map((v) => (
                          <tr key={v.valuation_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{v.valuation_date}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {v.valuation_org}
                              {v.report_number && (
                                <div className="text-[11px] text-slate-500">Số chứng thư: {v.report_number}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-purple-700 whitespace-nowrap">
                              {formatCurrency(v.valuation_amount)}
                            </td>
                            <td className="px-4 py-3">
                              {v.report_file_name ? (
                                <a
                                  href={`/api/v1/credit-limits/collaterals/valuations/${v.valuation_id}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 border border-blue-200"
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                  {v.report_file_name}
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">Chưa đính kèm file</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{v.notes || '-'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleDeleteValuation(v.valuation_id)}
                                className="p-1 text-slate-400 hover:text-rose-600"
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

            {/* TAB 3: BỘ HỒ SƠ TÀI SẢN (File Sổ đỏ/Sổ hồng, Ảnh chụp thực tế, HĐ thế chấp) */}
            {activeTab === 'DOSSIER' && (
              <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Loại tài liệu trong Bộ hồ sơ tài sản</label>
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-semibold"
                    >
                      <option value="RED_BOOK">File Sổ đỏ / Sổ hồng / GCN QSDĐ</option>
                      <option value="SITE_PHOTO">Ảnh chụp thực tế tài sản</option>
                      <option value="MORTGAGE_CONTRACT">Hợp đồng thế chấp công chứng</option>
                      <option value="SECURITY_REGISTRATION">Đăng ký giao dịch bảo đảm</option>
                      <option value="OTHER">Hồ sơ tài sản khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mô tả tệp / ảnh</label>
                    <input
                      type="text"
                      placeholder="VD: Bản scan màu Sổ đỏ trang 1-4 / Ảnh mặt tiền..."
                      value={docDesc}
                      onChange={(e) => setDocDesc(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 cursor-pointer">
                      <Upload className="w-4 h-4 mr-1.5" />
                      {uploadingDoc ? 'Đang tải lên...' : 'Tải Lên File Sổ Đỏ / Ảnh Thực Tế'}
                      <input type="file" className="hidden" onChange={handleUploadAssetDoc} disabled={uploadingDoc} />
                    </label>
                  </div>
                </div>

                {selectedAsset.documents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Bộ hồ sơ tài sản hiện đang trống. Hãy tải lên File Sổ đỏ/Sổ hồng và Ảnh chụp thực tế ở trên.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedAsset.documents.map((doc) => (
                      <div
                        key={doc.doc_id}
                        className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between hover:bg-slate-50"
                      >
                        <div className="flex items-start space-x-3">
                          {doc.doc_category === 'SITE_PHOTO' ? (
                            <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <FileText className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                              {DOC_CATEGORY_LABELS[doc.doc_category] || doc.doc_category}
                            </span>
                            <div className="text-xs font-bold text-slate-900 mt-1">{doc.file_name}</div>
                            <div className="text-[11px] text-slate-500">{doc.description || 'Bộ hồ sơ tài sản'}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <a
                            href={`/api/v1/credit-limits/collaterals/documents/${doc.doc_id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Tải xuống"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDeleteAssetDoc(doc.doc_id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: LIÊN KẾT & CHUYỂN TIẾP HỢP ĐỒNG TÍN DỤNG */}
            {activeTab === 'TRANSFER' && (
              <div className="space-y-6">
                <form
                  onSubmit={handleTransferAgreement}
                  className="bg-purple-50/60 border border-purple-200 rounded-xl p-4 space-y-4 text-xs"
                >
                  <div className="font-bold text-purple-950 text-sm">
                    Chuyển Tiếp Tài Sản Đảm Bảo Sang Hợp Đồng Tín Dụng Mới (Hoặc Giải Chấp)
                  </div>
                  <p className="text-slate-600">
                    Mỗi tài sản chỉ được thế chấp tại 1 ngân hàng và gắn liền với 1 Hợp đồng tín dụng. Khi HĐTD cũ hết hạn, chọn HĐTD mới dưới đây để chuyển tiếp tài sản.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Loại nghiệp vụ</label>
                      <select
                        value={transferActionType}
                        onChange={(e) => setTransferActionType(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-semibold"
                      >
                        <option value="ROLLOVER_TRANSFER">Chuyển tiếp sang HĐTD mới (Khi hết hạn)</option>
                        <option value="MANUAL_REASSIGN">Đổi Hợp đồng tín dụng gắn kết</option>
                        <option value="RELEASE">Giải chấp tài sản (Release)</option>
                      </select>
                    </div>

                    {transferActionType !== 'RELEASE' && (
                      <div className="md:col-span-2">
                        <label className="block font-bold text-slate-700 mb-1">Chọn Hợp đồng tín dụng mới *</label>
                        <select
                          required
                          value={transferToAgreementId}
                          onChange={(e) => setTransferToAgreementId(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-semibold"
                        >
                          <option value="">-- Chọn Hợp đồng tín dụng nhận thế chấp --</option>
                          {agreements.map((ag) => (
                            <option key={ag.agreement_id} value={ag.agreement_id}>
                              [{ag.bank_code}] {ag.agreement_number} — {ag.agreement_name} ({ag.computed_status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Ngày hiệu lực chuyển</label>
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <input
                      type="text"
                      placeholder="Ghi chú biên bản phụ lục thế chấp / chuyển tiếp HĐTD..."
                      value={transferNotes}
                      onChange={(e) => setTransferNotes(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 shrink-0"
                    >
                      Xác Nhận Chuyển HĐTD
                    </button>
                  </div>
                </form>

                {/* Bảng lịch sử thế chấp qua các HĐTD */}
                <div>
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">
                    Lịch Sử Thế Chấp &amp; Chuyển Tiếp Hợp Đồng Tín Dụng
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                          <th className="px-4 py-2.5">Ngày Hiệu Lực</th>
                          <th className="px-4 py-2.5">Nghiệp Vụ</th>
                          <th className="px-4 py-2.5">Từ HĐTD Cũ</th>
                          <th className="px-4 py-2.5">Sang HĐTD Mới</th>
                          <th className="px-4 py-2.5">Ghi Chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedAsset.agreement_history.map((h) => (
                          <tr key={h.history_id}>
                            <td className="px-4 py-2.5 font-semibold">{h.effective_date}</td>
                            <td className="px-4 py-2.5 font-bold text-purple-700">{h.action_type}</td>
                            <td className="px-4 py-2.5 text-slate-500">{h.from_agreement_number || 'Khởi tạo'}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-900">
                              {h.to_agreement_number || 'Đã giải chấp'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{h.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Tạo / Sửa Tài sản đảm bảo */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingAsset ? 'Chỉnh Sửa Tài Sản Đảm Bảo' : 'Thêm Tài Sản Đảm Bảo Mới'}
              </h3>
              <button onClick={() => setShowAssetModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Tài sản đảm bảo *</label>
                  <input
                    type="text"
                    required
                    value={assetForm.asset_code}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_code: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm / Loại tài sản *</label>
                  <select
                    value={assetForm.asset_type}
                    onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Tài sản đảm bảo *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Quyền sử dụng đất và Nhà xưởng tại KCN Tiên Sơn, Bắc Ninh"
                  value={assetForm.asset_name}
                  onChange={(e) => setAssetForm({ ...assetForm, asset_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên Chủ sở hữu tài sản *</label>
                  <input
                    type="text"
                    required
                    value={assetForm.owner_name}
                    onChange={(e) => setAssetForm({ ...assetForm, owner_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quan hệ sở hữu</label>
                  <select
                    value={assetForm.ownership_relation}
                    onChange={(e) => setAssetForm({ ...assetForm, ownership_relation: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  >
                    <option value="BORROWER_OWNED">Chính chủ Doanh nghiệp vay</option>
                    <option value="THIRD_PARTY">Tài sản Bên thứ 3 bảo lãnh</option>
                  </select>
                </div>
              </div>

              {/* Gắn liền với 1 Ngân hàng & 1 Hợp đồng tín dụng */}
              <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 space-y-2">
                <label className="block text-xs font-bold text-purple-950">
                  Hợp đồng tín dụng &amp; Ngân hàng nhận thế chấp (Mỗi TSĐB chỉ thế chấp tại 1 Ngân hàng)
                </label>
                <select
                  value={assetForm.agreement_id}
                  onChange={(e) => {
                    const agId = e.target.value;
                    const found = agreements.find((a) => String(a.agreement_id) === agId);
                    setAssetForm({
                      ...assetForm,
                      agreement_id: agId,
                      bank_code: found ? found.bank_code : assetForm.bank_code,
                      bank_name: found ? found.bank_name : assetForm.bank_name,
                    });
                  }}
                  className="w-full border border-purple-300 rounded-xl px-3 py-2 bg-white text-xs font-semibold"
                >
                  <option value="">-- Chưa thế chấp vào HĐTD nào --</option>
                  {agreements.map((ag) => (
                    <option key={ag.agreement_id} value={ag.agreement_id}>
                      [{ag.bank_name}] Số HĐTD: {ag.agreement_number} ({ag.computed_status})
                    </option>
                  ))}
                </select>

                {!assetForm.agreement_id && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        Ngân hàng quản lý / định giá TS *
                      </label>
                      <select
                        value={assetForm.bank_code}
                        onChange={(e) => {
                          const code = e.target.value;
                          const found = masterBanks.find((b) => b.bank_code === code);
                          setAssetForm({
                            ...assetForm,
                            bank_code: code,
                            bank_name: found ? found.short_name : code,
                          });
                        }}
                        className="w-full border border-purple-300 rounded-lg px-2 py-1.5 text-xs bg-white font-medium"
                      >
                        {masterBanks.map((b) => (
                          <option key={b.bank_code} value={b.bank_code}>
                            {b.bank_code} — {b.short_name} ({b.bank_name})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">Tên hiển thị Ngân hàng *</label>
                      <input
                        type="text"
                        required
                        value={assetForm.bank_name}
                        onChange={(e) => setAssetForm({ ...assetForm, bank_name: e.target.value })}
                        className="w-full border border-purple-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Giá trị thẩm định, LTV, Tình trạng, Thời điểm định giá gần nhất */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giá trị thẩm định hiện hành (VND) *
                  </label>
                  <input
                    type="number"
                    required
                    value={assetForm.appraised_value}
                    onChange={(e) => setAssetForm({ ...assetForm, appraised_value: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold text-purple-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tỷ lệ LTV (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={assetForm.ltv_ratio}
                    onChange={(e) => setAssetForm({ ...assetForm, ltv_ratio: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tình trạng TSĐB *</label>
                  <select
                    value={assetForm.collateral_status}
                    onChange={(e) => setAssetForm({ ...assetForm, collateral_status: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold"
                  >
                    <option value="UNVALUED">Chưa định giá</option>
                    <option value="VALUED">Đã định giá</option>
                    <option value="MORTGAGED">Thế chấp</option>
                    <option value="RELEASED">Giải chấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời điểm định giá gần nhất (&gt; 6 tháng sẽ báo &ldquo;Yêu cầu định giá lại&rdquo;)
                  </label>
                  <input
                    type="date"
                    value={assetForm.latest_valuation_date}
                    onChange={(e) => setAssetForm({ ...assetForm, latest_valuation_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Sổ đỏ / Sổ hồng / GCN</label>
                  <input
                    type="text"
                    placeholder="VD: CT 892341"
                    value={assetForm.certificate_number}
                    onChange={(e) => setAssetForm({ ...assetForm, certificate_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Địa chỉ tài sản</label>
                <input
                  type="text"
                  value={assetForm.address}
                  onChange={(e) => setAssetForm({ ...assetForm, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Link Định vị Google Maps</label>
                  <input
                    type="text"
                    value={assetForm.google_maps_url}
                    onChange={(e) => setAssetForm({ ...assetForm, google_maps_url: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vĩ độ (Latitude)</label>
                  <input
                    type="text"
                    placeholder="21.0285"
                    value={assetForm.latitude}
                    onChange={(e) => setAssetForm({ ...assetForm, latitude: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kinh độ (Longitude)</label>
                  <input
                    type="text"
                    placeholder="105.8542"
                    value={assetForm.longitude}
                    onChange={(e) => setAssetForm({ ...assetForm, longitude: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAssetModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700"
                >
                  Lưu Tài Sản Đảm Bảo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
