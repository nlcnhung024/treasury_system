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
  Plus,
  Edit2,
  X,
  CreditCard,
  Briefcase,
  FileText,
  Building2,
  Wallet,
  Download,
  FolderArchive,
  Shield,
  Receipt,
} from 'lucide-react';
import api from '../services/api';
import {
  CreditFacility,
  CreditStatementFile,
  CreditFacilitySummary,
  InstitutionType,
  InterestPaymentMethod,
  DisbursementDocument,
  CreditFacilityCreatePayload,
  CreditFacilityUpdatePayload,
} from '../types';

interface PresetOrg {
  code: string;
  name: string;
  type: InstitutionType;
}

interface StagedDossierFile {
  id: string;
  file: File;
  document_type: string;
  description: string;
}

const PRESET_ORGANIZATIONS: PresetOrg[] = [
  // Ngân hàng thương mại
  { code: 'CTG', name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)', type: 'BANK' },
  { code: 'MBB', name: 'Ngân hàng TMCP Quân Đội (MBBank)', type: 'BANK' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)', type: 'BANK' },
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)', type: 'BANK' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)', type: 'BANK' },
  { code: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', type: 'BANK' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)', type: 'BANK' },
  { code: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', type: 'BANK' },
  { code: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', type: 'BANK' },

  // Công ty tài chính
  { code: 'FE_CREDIT', name: 'Công ty Tài chính TNHH MTV Ngân hàng Việt Nam Thịnh Vượng (FE Credit)', type: 'FINANCE_COMPANY' },
  { code: 'HOME_CREDIT', name: 'Công ty Tài chính TNHH MTV Home Credit Việt Nam', type: 'FINANCE_COMPANY' },
  { code: 'HD_SAISON', name: 'Công ty Tài chính TNHH HD SAISON', type: 'FINANCE_COMPANY' },
  { code: 'SHINHAN_FIN', name: 'Công ty Tài chính TNHH Một thành viên Shinhan Việt Nam', type: 'FINANCE_COMPANY' },
  { code: 'MCREDIT', name: 'Công ty Tài chính TNHH MB SHINSEI (Mcredit)', type: 'FINANCE_COMPANY' },
  { code: 'MIRAE_ASSET', name: 'Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)', type: 'FINANCE_COMPANY' },
  { code: 'LOTTE_FIN', name: 'Công ty Tài chính TNHH MTV Lotte Việt Nam', type: 'FINANCE_COMPANY' },

  // Cho thuê tài chính
  { code: 'CTG_LEASING', name: 'Công ty Cho thuê Tài chính VietinBank (VietinBank Leasing)', type: 'LEASING_COMPANY' },
  { code: 'BSL', name: 'Công ty Cho thuê Tài chính TNHH BIDV-SuMi TRUST (BSL)', type: 'LEASING_COMPANY' },
  { code: 'CHAILEASE', name: 'Công ty Cho thuê Tài chính TNHH Chailease Việt Nam', type: 'LEASING_COMPANY' },
  { code: 'ACB_LEASING', name: 'Công ty Cho thuê Tài chính Ngân hàng Á Châu (ACB Leasing)', type: 'LEASING_COMPANY' },
  { code: 'VCB_LEASING', name: 'Công ty Cho thuê Tài chính Vietcombank (VCBL)', type: 'LEASING_COMPANY' },
];

export interface DossierCategoryConfig {
  key: string;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  description: string;
  examples: string;
  colorName: 'indigo' | 'amber' | 'emerald' | 'cyan' | 'purple';
}

export const DOSSIER_CATEGORIES: DossierCategoryConfig[] = [
  {
    key: 'CONTRACT',
    label: 'Hợp Đồng Tín Dụng & Thỏa Thuận Vay',
    shortLabel: 'Hợp đồng tín dụng',
    badgeLabel: 'HĐ Tín Dụng',
    description: 'Hợp đồng hạn mức tín dụng, thỏa thuận cho vay từng lần, phụ lục hợp đồng sửa đổi bổ sung',
    examples: 'HDTD_MBB_2026.pdf, Hop_dong_tin_dung_CTG.pdf',
    colorName: 'indigo',
  },
  {
    key: 'DEBT_NOTE',
    label: 'Khế Ước Nhận Nợ & Giấy Nhận Nợ (LD)',
    shortLabel: 'Khế ước nhận nợ',
    badgeLabel: 'Khế ước LD',
    description: 'Giấy đề nghị giải ngân kiêm khế ước nhận nợ (LD), thông báo giải ngân của ngân hàng',
    examples: 'Kheuoc_nhanno_LD01.pdf, Giay_nhan_no_CTG.pdf',
    colorName: 'amber',
  },
  {
    key: 'INVOICE',
    label: 'Chứng Từ Sử Dụng Vốn (Hóa Đơn & UNC)',
    shortLabel: 'Hóa đơn & UNC',
    badgeLabel: 'Hóa đơn / UNC',
    description: 'Hóa đơn GTGT, Hợp đồng kinh tế đầu vào, Biên bản giao nhận, UNC thanh toán cho bên thụ hưởng',
    examples: 'Hoa_don_GTGT_001.pdf, UNC_VietinBank_2ty.pdf, BB_Nghiem_thu.pdf',
    colorName: 'emerald',
  },
  {
    key: 'COLLATERAL',
    label: 'Tài Sản Bảo Đảm & Thế Chấp',
    shortLabel: 'Tài sản bảo đảm',
    badgeLabel: 'Tài sản BĐ',
    description: 'Hợp đồng thế chấp tài sản, biên bản định giá tài sản bảo đảm, đăng ký giao dịch bảo đảm',
    examples: 'Hop_dong_the_chap_QSDDat.pdf, BB_Dinh_gia_xe_bon.pdf',
    colorName: 'cyan',
  },
  {
    key: 'OTHER',
    label: 'Phê Duyệt Tín Dụng & Chứng Từ Khác',
    shortLabel: 'Phê duyệt & Khác',
    badgeLabel: 'Khác / Phê duyệt',
    description: 'Thông báo phê duyệt hạn mức, báo cáo kiểm tra định kỳ sau giải ngân, giấy tờ bổ sung',
    examples: 'Thong_bao_phe_duyet.pdf, Bien_ban_kiem_tra_sau_cho_vay.pdf',
    colorName: 'purple',
  },
];

export const mapDocTypeToCategoryKey = (docType: string): string => {
  if (docType === 'CONTRACT') return 'CONTRACT';
  if (docType === 'DEBT_NOTE' || docType === 'DISBURSEMENT_RECORD') return 'DEBT_NOTE';
  if (docType === 'INVOICE') return 'INVOICE';
  if (docType === 'COLLATERAL') return 'COLLATERAL';
  return 'OTHER';
};

export const renderDossierBadge = (docType: string) => {
  const catKey = mapDocTypeToCategoryKey(docType);
  switch (catKey) {
    case 'CONTRACT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <FileText className="w-3 h-3" /> HĐ Tín Dụng
        </span>
      );
    case 'DEBT_NOTE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Briefcase className="w-3 h-3" /> Khế ước LD
        </span>
      );
    case 'INVOICE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Receipt className="w-3 h-3" /> Hóa đơn / UNC
        </span>
      );
    case 'COLLATERAL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Shield className="w-3 h-3" /> Tài sản BĐ
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <FolderArchive className="w-3 h-3" /> Chứng từ khác
        </span>
      );
  }
};

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
  const [institutionFilter, setInstitutionFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [dueFilter, setDueFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingLoan, setEditingLoan] = useState<CreditFacility | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State
  const [formOrgPreset, setFormOrgPreset] = useState<string>('CTG');
  const [formData, setFormData] = useState({
    bank_code: 'CTG',
    bank_name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
    institution_type: 'BANK' as InstitutionType,
    contract_number: '',
    borrower_name: 'CONG TY CO PHAN XI MANG SUNRISE',
    cif_number: '',
    loan_purpose: '',
    currency: 'VND',
    disbursement_date: '',
    maturity_date: '',
    term: '',
    interest_rate: 8.5,
    debt_group: '1',
    loan_type: 'SHORT_TERM',
    interest_payment_method: 'MONTHLY' as InterestPaymentMethod,
    monthly_interest_due_day: 25 as number | null,
    current_principal_balance: 0,
    accrued_interest: 0,
    next_repayment_date: '',
    next_principal_amount: 0,
    next_interest_amount: 0,
    total_repayment_amount: 0,
    status: 'ACTIVE',
    note: '',
  });

  // Staged dossier files inside the Create/Edit Loan form modal
  const [stagedFiles, setStagedFiles] = useState<StagedDossierFile[]>([]);
  const [stagedDocCategory, setStagedDocCategory] = useState<string>('CONTRACT');
  const [editModalDocs, setEditModalDocs] = useState<DisbursementDocument[]>([]);
  const [isEditModalDocsLoading, setIsEditModalDocsLoading] = useState<boolean>(false);

  // Dedicated Modal "Nhập Bộ Hồ Sơ Cho Các Khoản Vay Đã Nhập"
  const [isDossierEntryModalOpen, setIsDossierEntryModalOpen] = useState<boolean>(false);
  const [entrySelectedLoanId, setEntrySelectedLoanId] = useState<number | null>(null);
  const [entryDossierDocs, setEntryDossierDocs] = useState<DisbursementDocument[]>([]);
  const [isEntryDocsLoading, setIsEntryDocsLoading] = useState<boolean>(false);
  const [entryStagedFiles, setEntryStagedFiles] = useState<StagedDossierFile[]>([]);
  const [entryCategoryTab, setEntryCategoryTab] = useState<string>('CONTRACT');
  const [entryBatchNote, setEntryBatchNote] = useState<string>('');
  const [isEntrySubmitting, setIsEntrySubmitting] = useState<boolean>(false);
  const [entryModalMsg, setEntryModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper tính lãi theo TT 14/2017/TT-NHNN preview
  const computeInterestPreview = (
    principal: number,
    ratePercent: number,
    method: 'MONTHLY' | 'END_OF_TERM',
    _dueDay: number | null,
    disbDateStr?: string,
    matDateStr?: string
  ): number => {
    if (!principal || !ratePercent) return 0;
    const rateFraction = ratePercent / 100.0;
    if (method === 'END_OF_TERM') {
      if (disbDateStr && matDateStr) {
        const d1 = new Date(disbDateStr).getTime();
        const d2 = new Date(matDateStr).getTime();
        const days = Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)));
        return Math.round((principal * rateFraction * days) / 365);
      }
      return Math.round((principal * rateFraction * 30) / 365);
    } else {
      const today = new Date();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return Math.round((principal * rateFraction * daysInMonth) / 365);
    }
  };

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

      const formPayload = new FormData();
      formPayload.append('file', file);
      formPayload.append('uploaded_by', 'Chị Cẩm Nhung');

      try {
        const res = await api.post('/credit-statements/upload', formPayload, {
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

  // Mở modal tạo mới
  const handleOpenCreateModal = () => {
    setEditingLoan(null);
    setModalError(null);
    setStagedFiles([]);
    setEditModalDocs([]);
    setStagedDocCategory('CONTRACT');
    setFormOrgPreset('CTG');
    setFormData({
      bank_code: 'CTG',
      bank_name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
      institution_type: 'BANK',
      contract_number: '',
      borrower_name: 'CONG TY CO PHAN XI MANG SUNRISE',
      cif_number: '',
      loan_purpose: 'Vay bổ sung vốn lưu động phục vụ SXKD xi măng',
      currency: 'VND',
      disbursement_date: new Date().toISOString().split('T')[0],
      maturity_date: '',
      term: '6M',
      interest_rate: 8.5,
      debt_group: '1',
      loan_type: 'SHORT_TERM',
      interest_payment_method: 'MONTHLY' as InterestPaymentMethod,
      monthly_interest_due_day: 25,
      current_principal_balance: 0,
      accrued_interest: 0,
      next_repayment_date: '',
      next_principal_amount: 0,
      next_interest_amount: 0,
      total_repayment_amount: 0,
      status: 'ACTIVE',
      note: '',
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (loan: CreditFacility) => {
    setEditingLoan(loan);
    setModalError(null);
    setStagedFiles([]);
    setEditModalDocs([]);
    setStagedDocCategory('CONTRACT');
    setIsEditModalDocsLoading(true);

    // Tải danh sách hồ sơ giải ngân đã có của khoản vay
    api.get(`/loans/${loan.loan_id}/dossier`)
      .then((res) => setEditModalDocs(res.data || []))
      .catch((err) => console.error('Lỗi khi tải hồ sơ giải ngân:', err))
      .finally(() => setIsEditModalDocsLoading(false));

    const matched = PRESET_ORGANIZATIONS.find((p) => p.code === loan.bank_code);
    setFormOrgPreset(matched ? matched.code : 'CUSTOM');
    setFormData({
      bank_code: loan.bank_code,
      bank_name: loan.bank_name,
      institution_type: loan.institution_type || 'BANK',
      contract_number: loan.contract_number,
      borrower_name: loan.borrower_name,
      cif_number: loan.cif_number || '',
      loan_purpose: loan.loan_purpose || '',
      currency: loan.currency || 'VND',
      disbursement_date: loan.disbursement_date || '',
      maturity_date: loan.maturity_date || '',
      term: loan.term || '',
      interest_rate: Number(loan.interest_rate) || 0,
      debt_group: loan.debt_group || '1',
      loan_type: loan.loan_type || 'SHORT_TERM',
      interest_payment_method: (loan.interest_payment_method || 'MONTHLY') as InterestPaymentMethod,
      monthly_interest_due_day: loan.monthly_interest_due_day || 25,
      current_principal_balance: Number(loan.current_principal_balance) || 0,
      accrued_interest: Number(loan.accrued_interest) || 0,
      next_repayment_date: loan.next_repayment_date || '',
      next_principal_amount: Number(loan.next_principal_amount) || 0,
      next_interest_amount: Number(loan.next_interest_amount) || 0,
      total_repayment_amount: Number(loan.total_repayment_amount) || 0,
      status: loan.status || 'ACTIVE',
      note: loan.note || '',
    });
    setIsModalOpen(true);
  };

  // Handlers quản lý file hồ sơ giải ngân đính kèm trong Form Modal theo loại chứng từ
  const handleAddStagedFilesForCategory = (
    e: React.ChangeEvent<HTMLInputElement>,
    catKey: string
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';

    const validFiles: StagedDossierFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng tối đa 50MB.`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        document_type: catKey,
        description: '',
      });
    }
    setStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDropStagedFilesForCategory = (
    e: React.DragEvent<HTMLDivElement>,
    catKey: string
  ) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);
    const validFiles: StagedDossierFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng tối đa 50MB.`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        document_type: catKey,
        description: '',
      });
    }
    setStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((sf) => sf.id !== id));
  };

  const handleUpdateStagedType = (id: string, type: string) => {
    setStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, document_type: type } : sf))
    );
  };

  const handleUpdateStagedDesc = (id: string, desc: string) => {
    setStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, description: desc } : sf))
    );
  };

  const handleDeleteEditModalDoc = async (documentId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;
    try {
      await api.delete(`/loans/dossier/${documentId}`);
      if (editingLoan) {
        const res = await api.get(`/loans/${editingLoan.loan_id}/dossier`);
        setEditModalDocs(res.data || []);
        fetchData();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa tài liệu.');
    }
  };

  const handleDownloadDossierDoc = async (doc: DisbursementDocument) => {
    try {
      const res = await api.get(`/loans/dossier/${doc.document_id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi tải file tài liệu.');
    }
  };

  // =========================================================================
  // GIAO DIỆN NHẬP BỘ HỒ SƠ CHO CÁC KHOẢN VAY ĐÃ NHẬP (CẤU TRÚC FORM CHUẨN)
  // =========================================================================
  const handleOpenDossierEntryModal = async (targetLoan?: CreditFacility) => {
    const loanToSelect = targetLoan || (loans.length > 0 ? loans[0] : null);
    const loanId = loanToSelect ? loanToSelect.loan_id : null;

    setEntrySelectedLoanId(loanId);
    setEntryStagedFiles([]);
    setEntryCategoryTab('CONTRACT');
    setEntryBatchNote('');
    setEntryModalMsg(null);
    setIsDossierEntryModalOpen(true);

    if (loanId) {
      setIsEntryDocsLoading(true);
      try {
        const res = await api.get(`/loans/${loanId}/dossier`);
        setEntryDossierDocs(res.data || []);
      } catch (err: any) {
        console.error('Lỗi khi tải hồ sơ giải ngân:', err);
        setEntryDossierDocs([]);
      } finally {
        setIsEntryDocsLoading(false);
      }
    } else {
      setEntryDossierDocs([]);
    }
  };

  const handleSelectEntryLoan = async (loanId: number) => {
    setEntrySelectedLoanId(loanId);
    setEntryModalMsg(null);
    setIsEntryDocsLoading(true);
    try {
      const res = await api.get(`/loans/${loanId}/dossier`);
      setEntryDossierDocs(res.data || []);
    } catch (err: any) {
      console.error('Lỗi khi tải hồ sơ giải ngân của khoản vay:', err);
      setEntryDossierDocs([]);
    } finally {
      setIsEntryDocsLoading(false);
    }
  };

  const handleAddEntryStagedFiles = (
    e: React.ChangeEvent<HTMLInputElement>,
    catKey: string
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';

    const validFiles: StagedDossierFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng tối đa 50MB.`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        document_type: catKey,
        description: '',
      });
    }
    setEntryStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDropEntryStagedFiles = (
    e: React.DragEvent<HTMLDivElement>,
    catKey: string
  ) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);
    const validFiles: StagedDossierFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng tối đa 50MB.`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        document_type: catKey,
        description: '',
      });
    }
    setEntryStagedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveEntryStagedFile = (id: string) => {
    setEntryStagedFiles((prev) => prev.filter((sf) => sf.id !== id));
  };

  const handleUpdateEntryStagedType = (id: string, type: string) => {
    setEntryStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, document_type: type } : sf))
    );
  };

  const handleUpdateEntryStagedDesc = (id: string, desc: string) => {
    setEntryStagedFiles((prev) =>
      prev.map((sf) => (sf.id === id ? { ...sf, description: desc } : sf))
    );
  };

  const handleDeleteEntrySavedDoc = async (documentId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi bộ hồ sơ giải ngân?')) return;
    try {
      await api.delete(`/loans/dossier/${documentId}`);
      if (entrySelectedLoanId) {
        const res = await api.get(`/loans/${entrySelectedLoanId}/dossier`);
        setEntryDossierDocs(res.data || []);
      }
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa tài liệu.');
    }
  };

  const handleSubmitEntryDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entrySelectedLoanId) {
      setEntryModalMsg({ type: 'error', text: 'Vui lòng chọn một khoản vay đã nhập trong hệ thống.' });
      return;
    }
    if (entryStagedFiles.length === 0) {
      setEntryModalMsg({ type: 'error', text: 'Vui lòng chọn ít nhất một tệp tài liệu để lưu vào bộ hồ sơ.' });
      return;
    }

    setIsEntrySubmitting(true);
    setEntryModalMsg(null);

    let successCount = 0;
    let failCount = 0;

    for (const sf of entryStagedFiles) {
      try {
        const fd = new FormData();
        fd.append('file', sf.file);
        fd.append('document_type', sf.document_type);
        const descCombined = [sf.description.trim(), entryBatchNote.trim()].filter(Boolean).join(' | ');
        if (descCombined) {
          fd.append('description', descCombined);
        }
        fd.append('uploaded_by', 'Chị Cẩm Nhung');

        await api.post(`/loans/${entrySelectedLoanId}/dossier/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch (uploadErr) {
        console.error('Lỗi khi tải file hồ sơ giải ngân lên Object Storage:', sf.file.name, uploadErr);
        failCount++;
      }
    }

    setIsEntrySubmitting(false);

    if (successCount > 0) {
      setEntryModalMsg({
        type: 'success',
        text: `Đã lưu thành công ${successCount} tệp vào Object Storage cho khoản vay!${failCount > 0 ? ` (${failCount} tệp lỗi)` : ''
          }`,
      });
      setEntryStagedFiles([]);
      const res = await api.get(`/loans/${entrySelectedLoanId}/dossier`);
      setEntryDossierDocs(res.data || []);
      await fetchData();
    } else {
      setEntryModalMsg({
        type: 'error',
        text: 'Không thể tải lên các tệp tài liệu. Vui lòng kiểm tra lại.',
      });
    }
  };

  // Thay đổi tổ chức cấp tín dụng
  const handleOrgPresetChange = (presetCode: string) => {
    setFormOrgPreset(presetCode);
    if (presetCode === 'CUSTOM') {
      setFormData((prev) => ({
        ...prev,
        bank_code: '',
        bank_name: '',
        institution_type: 'OTHER',
      }));
    } else {
      const org = PRESET_ORGANIZATIONS.find((o) => o.code === presetCode);
      if (org) {
        setFormData((prev) => ({
          ...prev,
          bank_code: org.code,
          bank_name: org.name,
          institution_type: org.type,
          loan_type: org.type === 'LEASING_COMPANY' ? 'FINANCIAL_LEASE' : prev.loan_type,
        }));
      }
    }
  };

  // Tự động tính toán lại total_repayment_amount khi đổi gốc hoặc lãi kỳ tới
  const handlePrincipalInterestChange = (
    field: 'next_principal_amount' | 'next_interest_amount',
    value: number
  ) => {
    setFormData((prev) => {
      const nextPrincipal = field === 'next_principal_amount' ? value : prev.next_principal_amount;
      const nextInterest = field === 'next_interest_amount' ? value : prev.next_interest_amount;
      return {
        ...prev,
        [field]: value,
        total_repayment_amount: nextPrincipal + nextInterest,
      };
    });
  };

  // Xử lý submit form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // Validation cơ bản
    if (!formData.bank_code.trim()) {
      setModalError('Vui lòng nhập mã tổ chức cấp tín dụng (Mã ngân hàng / Cty TC).');
      return;
    }
    if (!formData.bank_name.trim()) {
      setModalError('Vui lòng nhập tên đầy đủ của đơn vị cấp tín dụng.');
      return;
    }
    if (!formData.contract_number.trim()) {
      setModalError('Vui lòng nhập Số hợp đồng / Số khế ước nhận nợ.');
      return;
    }
    if (!formData.borrower_name.trim()) {
      setModalError('Vui lòng nhập Tên đơn vị / người đi vay.');
      return;
    }
    if (formData.current_principal_balance <= 0) {
      setModalError('Dư nợ gốc hiện tại phải lớn hơn 0.');
      return;
    }

    setModalSubmitting(true);
    try {
      let targetLoanId: number | null = editingLoan ? editingLoan.loan_id : null;
      if (editingLoan) {
        // Cập nhật khoản vay
        const updatePayload: CreditFacilityUpdatePayload = {
          bank_code: formData.bank_code.trim().toUpperCase(),
          bank_name: formData.bank_name.trim(),
          institution_type: formData.institution_type,
          contract_number: formData.contract_number.trim(),
          borrower_name: formData.borrower_name.trim(),
          cif_number: formData.cif_number.trim() || null,
          loan_purpose: formData.loan_purpose.trim() || null,
          currency: formData.currency,
          disbursement_date: formData.disbursement_date || null,
          maturity_date: formData.maturity_date || null,
          term: formData.term.trim() || null,
          interest_rate: formData.interest_rate,
          debt_group: formData.debt_group,
          loan_type: formData.loan_type,
          interest_payment_method: formData.interest_payment_method,
          monthly_interest_due_day: formData.interest_payment_method === 'MONTHLY' ? formData.monthly_interest_due_day : null,
          current_principal_balance: formData.current_principal_balance,
          accrued_interest: formData.accrued_interest,
          next_repayment_date: formData.next_repayment_date || null,
          next_principal_amount: formData.next_principal_amount,
          next_interest_amount: formData.next_interest_amount,
          total_repayment_amount: formData.total_repayment_amount,
          status: formData.status,
          note: formData.note.trim() || null,
        };
        await api.put(`/loans/${editingLoan.loan_id}`, updatePayload);
      } else {
        // Tạo mới khoản vay lẻ thủ công
        const createPayload: CreditFacilityCreatePayload = {
          bank_code: formData.bank_code.trim().toUpperCase(),
          bank_name: formData.bank_name.trim(),
          institution_type: formData.institution_type,
          contract_number: formData.contract_number.trim(),
          borrower_name: formData.borrower_name.trim(),
          cif_number: formData.cif_number.trim() || null,
          loan_purpose: formData.loan_purpose.trim() || null,
          currency: formData.currency,
          disbursement_date: formData.disbursement_date || null,
          maturity_date: formData.maturity_date || null,
          term: formData.term.trim() || null,
          interest_rate: formData.interest_rate,
          debt_group: formData.debt_group,
          loan_type: formData.loan_type,
          interest_payment_method: formData.interest_payment_method,
          monthly_interest_due_day: formData.interest_payment_method === 'MONTHLY' ? formData.monthly_interest_due_day : null,
          current_principal_balance: formData.current_principal_balance,
          accrued_interest: formData.accrued_interest,
          next_repayment_date: formData.next_repayment_date || null,
          next_principal_amount: formData.next_principal_amount,
          next_interest_amount: formData.next_interest_amount,
          total_repayment_amount: formData.total_repayment_amount,
          status: formData.status,
          note: formData.note.trim() || null,
        };
        const res = await api.post('/loans', createPayload);
        targetLoanId = res.data?.loan_id;
      }

      // Tự động đẩy các file hồ sơ giải ngân đính kèm lên Object Storage
      if (targetLoanId && stagedFiles.length > 0) {
        for (const sf of stagedFiles) {
          try {
            const fd = new FormData();
            fd.append('file', sf.file);
            fd.append('document_type', sf.document_type);
            if (sf.description.trim()) {
              fd.append('description', sf.description.trim());
            }
            fd.append('uploaded_by', 'Chị Cẩm Nhung');
            await api.post(`/loans/${targetLoanId}/dossier/upload`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          } catch (uploadErr) {
            console.error('Lỗi khi tải file hồ sơ giải ngân lên Object Storage:', sf.file.name, uploadErr);
          }
        }
      }

      setStagedFiles([]);
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Lỗi khi lưu khoản vay:', err);
      setModalError(err.response?.data?.detail || err.message || 'Lỗi khi lưu thông tin khoản vay.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Xóa khoản vay
  const handleDeleteLoan = async (loan: CreditFacility) => {
    const isManual = loan.is_manual;
    const confirmMsg = isManual
      ? `Bạn có chắc chắn muốn xóa hoàn toàn khoản nợ/khoản vay lẻ #${loan.contract_number} (${loan.bank_name})?`
      : `Khoản vay #${loan.contract_number} có nguồn từ file sao kê. Bạn có chắc chắn muốn chuyển sang trạng thái tất toán (SETTLED)?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/loans/${loan.loan_id}`);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Lỗi khi xóa khoản vay.');
    }
  };

  // Filter loans
  const filteredLoans = loans.filter((loan) => {
    // Lọc theo ngân hàng
    if (bankFilter !== 'ALL') {
      if (bankFilter === 'MBB') {
        if (loan.bank_code !== 'MBB' && loan.bank_code !== 'MB') return false;
      } else if (loan.bank_code !== bankFilter) {
        return false;
      }
    }

    // Lọc theo loại tổ chức
    if (institutionFilter !== 'ALL') {
      const type = loan.institution_type || 'BANK';
      if (type !== institutionFilter) return false;
    }

    // Lọc theo nguồn gốc (Nhập lẻ vs Sao kê)
    if (sourceFilter !== 'ALL') {
      if (sourceFilter === 'MANUAL' && !loan.is_manual) return false;
      if (sourceFilter === 'AUTO' && loan.is_manual) return false;
    }

    // Lọc từ khóa tìm kiếm
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchNo = loan.contract_number.toLowerCase().includes(q);
      const matchPurpose = loan.loan_purpose?.toLowerCase().includes(q) || false;
      const matchHolder = loan.borrower_name.toLowerCase().includes(q);
      const matchBank = loan.bank_name.toLowerCase().includes(q) || loan.bank_code.toLowerCase().includes(q);
      if (!matchNo && !matchPurpose && !matchHolder && !matchBank) return false;
    }

    // Lọc hạn trả
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
            Theo dõi hợp đồng vay, khế ước nhận nợ LD từ ngân hàng & các khoản nợ lẻ từ công ty tài chính, thuê tài chính
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleOpenDossierEntryModal()}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-semibold shadow-2xs hover:shadow-xs transition-all"
            title="Đính kèm bộ hồ sơ chứng từ giải ngân cho khoản vay đã có trong hệ thống"
          >
            <FolderArchive className="w-4 h-4 text-indigo-600" />
            <span>Nhập Bộ Hồ Sơ Cho Khoản Vay</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nhập Lẻ Khoản Vay</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
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
            {summary?.total_active_loans || 0} khoản vay đang theo dõi
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
          Hỗ trợ bóc tách tự động: <strong>VietinBank eFAST</strong> (Báo cáo danh sách khoản vay .xls) và <strong>MB (MBBank)</strong> (Báo cáo số dư tài khoản Vay/LD .xlsx). Đối với các khoản nợ từ tổ chức khác hoặc công ty tài chính, sử dụng tính năng <strong>Nhập Lẻ Khoản Vay</strong>.
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
                className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${msg.type === 'success'
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
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'loans'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <Layers className="w-4 h-4" />
            <span>Danh Mục Khoản Vay & Nợ ({filteredLoans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('banks')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'banks'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <Building className="w-4 h-4" />
            <span>Phân Bổ Theo Tổ Chức Tín Dụng ({summary?.by_bank.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'files'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Lịch Sử File Sao Kê Đã Nạp ({files.length})</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Danh Mục Khoản Vay & Khế Ước */}
      {activeTab === 'loans' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm số hợp đồng, mục đích, đơn vị..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Lọc loại tổ chức */}
              <select
                aria-label="Lọc theo loại tổ chức"
                value={institutionFilter}
                onChange={(e) => setInstitutionFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả loại tổ chức</option>
                <option value="BANK">Ngân hàng thương mại</option>
                <option value="FINANCE_COMPANY">Công ty tài chính</option>
                <option value="LEASING_COMPANY">Cho thuê tài chính</option>
                <option value="OTHER">Tổ chức khác</option>
              </select>

              {/* Lọc nguồn gốc */}
              <select
                aria-label="Lọc theo nguồn dữ liệu"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả nguồn</option>
                <option value="MANUAL">Chỉ khoản nợ nhập lẻ</option>
                <option value="AUTO">Bóc tách từ file sao kê</option>
              </select>

              {/* Lọc ngân hàng cụ thể */}
              <select
                aria-label="Lọc theo ngân hàng"
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả mã tổ chức</option>
                <option value="CTG">VietinBank (CTG)</option>
                <option value="MBB">MBBank (MBB)</option>
                <option value="BIDV">BIDV</option>
                <option value="FE_CREDIT">FE Credit</option>
                <option value="HOME_CREDIT">Home Credit</option>
                <option value="CHAILEASE">Chailease</option>
                <option value="BSL">BSL Leasing</option>
              </select>

              {/* Lọc hạn thanh toán */}
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

              <button
                onClick={handleOpenCreateModal}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm nợ lẻ</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  <th className="py-3 px-3">Số HĐ / Khế Ước</th>
                  <th className="py-3 px-3">Tổ Chức Cấp Tín Dụng</th>
                  <th className="py-3 px-3">Loại Tổ Chức & Nguồn</th>
                  <th className="py-3 px-3">Mục Đích Khoản Vay</th>
                  <th className="py-3 px-3 text-right">Dư Nợ Gốc (VND)</th>
                  <th className="py-3 px-3 text-center">Lãi Suất</th>
                  <th className="py-3 px-3 text-center">Hình Thức Trả Lãi</th>
                  <th className="py-3 px-3 text-right">Lãi Cần Trả (TT14)</th>
                  <th className="py-3 px-3">Thời Hạn</th>
                  <th className="py-3 px-3 text-right">Gốc Đến Hạn</th>
                  <th className="py-3 px-3 text-center">Ngày Trả Nợ</th>
                  <th className="py-3 px-3 text-center">Hồ Sơ Giải Ngân</th>
                  <th className="py-3 px-3 text-center">Nhóm Nợ</th>
                  <th className="py-3 px-3 text-center min-w-[90px] sticky right-0 bg-slate-100 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-slate-200">
                    Thao Tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-slate-400">
                      Chưa có khoản vay hoặc khoản nợ lẻ nào phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                ) : (
                  filteredLoans.map((loan) => {
                    const instType = loan.institution_type || 'BANK';
                    return (
                      <tr key={loan.loan_id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-2.5 px-3 font-semibold text-indigo-700">
                          <div className="flex items-center gap-1.5">
                            <span>{loan.contract_number}</span>
                            {loan.term && <span className="text-slate-400 font-normal text-xs">({loan.term})</span>}
                          </div>
                          {loan.note && (
                            <p className="text-[10px] text-slate-400 font-normal truncate max-w-[140px]" title={loan.note}>
                              {loan.note}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">{loan.bank_name}</div>
                          <div className="text-[10px] font-mono text-slate-500">{loan.bank_code}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-1 items-start">
                            {/* Badge loại tổ chức */}
                            {instType === 'BANK' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                <Building2 className="w-2.5 h-2.5" />
                                Ngân hàng
                              </span>
                            )}
                            {instType === 'FINANCE_COMPANY' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <Wallet className="w-2.5 h-2.5" />
                                Cty Tài chính
                              </span>
                            )}
                            {instType === 'LEASING_COMPANY' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Briefcase className="w-2.5 h-2.5" />
                                Cho thuê TC
                              </span>
                            )}
                            {instType === 'OTHER' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <CreditCard className="w-2.5 h-2.5" />
                                Khác
                              </span>
                            )}

                            {/* Badge nguồn */}
                            {loan.is_manual ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Edit2 className="w-2.5 h-2.5" />
                                Nhập lẻ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <FileSpreadsheet className="w-2.5 h-2.5" />
                                Sao kê file
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={loan.loan_purpose || ''}>
                          {loan.loan_purpose || 'Vay vốn phục vụ SXKD'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {Number(loan.current_principal_balance).toLocaleString('vi-VN')} ₫
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                          {Number(loan.interest_rate).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {loan.interest_payment_method === 'END_OF_TERM' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              Cuối kỳ
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                              title={`Trả lãi định kỳ ngày ${loan.monthly_interest_due_day || 25} hằng tháng`}
                            >
                              Hằng tháng (ngày {loan.monthly_interest_due_day || 25})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700 whitespace-nowrap" title="Số lãi cần trả tính theo Thông tư 14/2017/TT-NHNN (Cơ sở 365 ngày)">
                          {Number(loan.calculated_interest_due || 0).toLocaleString('vi-VN')} ₫
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {loan.disbursement_date || '-'} $\rightarrow$ {loan.maturity_date || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                          {loan.next_principal_amount > 0
                            ? `${Number(loan.next_principal_amount).toLocaleString('vi-VN')} ₫`
                            : '-'}
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
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {(loan.dossier_files_count || 0) > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title={`${loan.dossier_files_count} chứng từ giải ngân đã lưu trữ`}
                            >
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>{loan.dossier_files_count} chứng từ</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Nhóm {loan.debt_group}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-slate-100">
                          <button
                            onClick={() => handleOpenEditModal(loan)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-lg text-xs font-semibold shadow-2xs transition-all"
                            title="Chỉnh sửa thông tin khoản vay & Quản lý bộ hồ sơ giải ngân"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Phân Bổ Ngân Hàng / Tổ Chức Tín Dụng */}
      {activeTab === 'banks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary?.by_bank.map((b) => (
            <div key={b.bank_code} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow ${b.bank_code === 'CTG'
                      ? 'bg-sky-600'
                      : b.bank_code === 'MBB' || b.bank_code === 'MB'
                        ? 'bg-indigo-600'
                        : b.bank_code.includes('LEASING') || b.bank_code === 'CHAILEASE' || b.bank_code === 'BSL'
                          ? 'bg-amber-600'
                          : b.bank_code.includes('CREDIT') || b.bank_code.includes('FIN')
                            ? 'bg-purple-600'
                            : 'bg-emerald-600'
                      }`}
                  >
                    {b.bank_code.length > 4 ? b.bank_code.substring(0, 3) : b.bank_code}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm truncate max-w-[200px]" title={b.bank_name}>
                      {b.bank_name}
                    </h3>
                    <p className="text-xs text-slate-500">{b.loans_count} khoản vay / nợ đang quản lý</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Lãi suất bình quân (WAIR):</span>
                <span className="text-sm font-bold text-indigo-600">
                  {Number(b.weighted_avg_interest_rate).toFixed(2)} %/năm
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Dư nợ gốc hiện tại</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{formatVND(b.total_principal_balance)}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Lãi cộng dồn / dự trả</div>
                  <div className="font-bold text-emerald-600 text-sm mt-0.5">
                    {formatVND(b.total_accrued_interest || b.upcoming_interest_due)}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Gốc đến hạn gần nhất</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{formatVND(b.upcoming_principal_due)}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500">Lãi phải trả gần nhất</div>
                  <div className="font-bold text-amber-600 text-xs mt-0.5">{formatVND(b.upcoming_interest_due)}</div>
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

      {/* ========================================================================= */}
      {/* MODAL: NHẬP BỘ HỒ SƠ CHO CÁC KHOẢN VAY ĐÃ NHẬP (CẤU TRÚC FORM CHUẨN)       */}
      {/* ========================================================================= */}
      {isDossierEntryModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <span>Nhập Bộ Hồ Sơ Giải Ngân Cho Khoản Vay</span>
                    <span className="text-xs font-normal text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-400/30">
                      Object Storage S3
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Đính kèm tài liệu chứng từ phân loại theo 5 danh mục nghiệp vụ cho các khoản vay đã có trong hệ thống
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDossierEntryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitEntryDossier} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Alert message */}
              {entryModalMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${entryModalMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                >
                  {entryModalMsg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span className="font-medium">{entryModalMsg.text}</span>
                </div>
              )}

              {/* 1. KHỐI CHỌN KHOẢN VAY / KHẾ ƯỚC */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-indigo-600" />
                    1. Chọn Khoản Vay / Khế Ước Cần Đính Kèm Hồ Sơ
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    Tổng số {loans.length} khoản vay đang theo dõi
                  </span>
                </div>

                <select
                  value={entrySelectedLoanId || ''}
                  onChange={(e) => handleSelectEntryLoan(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  {loans.map((l) => (
                    <option key={l.loan_id} value={l.loan_id}>
                      [{l.bank_code}] HĐ: {l.contract_number} — Dư nợ: {Number(l.current_principal_balance).toLocaleString('vi-VN')} ₫ — {l.bank_name} {l.term ? `(${l.term})` : ''}
                    </option>
                  ))}
                </select>

                {/* Card tóm tắt khoản vay được chọn */}
                {(() => {
                  const targetLoan = loans.find((l) => l.loan_id === entrySelectedLoanId);
                  if (!targetLoan) return null;
                  return (
                    <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-purple-50/50 rounded-xl border border-indigo-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Tổ chức cấp tín dụng</span>
                        <span className="font-bold text-indigo-900 truncate block" title={targetLoan.bank_name}>
                          {targetLoan.bank_code} - {targetLoan.bank_name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Loại: {targetLoan.institution_type === 'FINANCE_COMPANY' ? 'Công ty tài chính' : targetLoan.institution_type === 'LEASING_COMPANY' ? 'Thuê tài chính' : 'Ngân hàng TM'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Số HĐ / Khế ước</span>
                        <span className="font-bold text-slate-900 font-mono block">
                          {targetLoan.contract_number}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Thời hạn: {targetLoan.term || 'Chưa rõ'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Dư nợ gốc hiện tại</span>
                        <span className="font-bold text-indigo-700 block">
                          {formatVND(targetLoan.current_principal_balance)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Lãi suất: {targetLoan.interest_rate}%/năm
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Ngày đáo hạn</span>
                        <span className="font-semibold text-slate-800 block">
                          {targetLoan.maturity_date || 'Không có'}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700">
                          Đã có: {entryDossierDocs.length} tài liệu trong CSDL
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 2. KHỐI BỘ HỒ SƠ GIẢI NGÂN PHÂN THEO LOẠI CHỨNG TỪ (CẤU TRÚC FORM NHẬP LẺ) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        2. Bộ Hồ Sơ Giải Ngân (Phân Chia Theo Loại Chứng Từ)
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Chọn loại chứng từ cần đính kèm. Tệp tải lên sẽ tự động lưu trữ tại MinIO/Object Storage.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {entryStagedFiles.length + entryDossierDocs.length} tệp trong hồ sơ
                  </span>
                </div>

                {/* Thanh Tab chọn Loại chứng từ */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                  {DOSSIER_CATEGORIES.map((cat) => {
                    const stagedCount = entryStagedFiles.filter(
                      (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                    ).length;
                    const existingCount = entryDossierDocs.filter(
                      (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                    ).length;
                    const totalCount = stagedCount + existingCount;
                    const isActive = entryCategoryTab === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setEntryCategoryTab(cat.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                      >
                        {cat.key === 'CONTRACT' && <FileText className="w-3.5 h-3.5" />}
                        {cat.key === 'DEBT_NOTE' && <Briefcase className="w-3.5 h-3.5" />}
                        {cat.key === 'INVOICE' && <Receipt className="w-3.5 h-3.5" />}
                        {cat.key === 'COLLATERAL' && <Shield className="w-3.5 h-3.5" />}
                        {cat.key === 'OTHER' && <FolderArchive className="w-3.5 h-3.5" />}
                        <span>{cat.shortLabel}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                              ? 'bg-white/20 text-white'
                              : totalCount > 0
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                        >
                          {totalCount}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setEntryCategoryTab('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${entryCategoryTab === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Tất cả</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${entryCategoryTab === 'ALL'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {entryStagedFiles.length + entryDossierDocs.length}
                    </span>
                  </button>
                </div>

                {/* Nội dung Tab cụ thể */}
                {entryCategoryTab !== 'ALL' && (() => {
                  const currentCategory = DOSSIER_CATEGORIES.find((c) => c.key === entryCategoryTab)!;
                  const catStagedFiles = entryStagedFiles.filter(
                    (sf) => mapDocTypeToCategoryKey(sf.document_type) === entryCategoryTab
                  );
                  const catExistingDocs = entryDossierDocs.filter(
                    (d) => mapDocTypeToCategoryKey(d.document_type) === entryCategoryTab
                  );

                  return (
                    <div className="space-y-3">
                      {/* Banner thông tin loại chứng từ */}
                      <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0 mt-0.5">
                          {currentCategory.key === 'CONTRACT' && <FileText className="w-4 h-4" />}
                          {currentCategory.key === 'DEBT_NOTE' && <Briefcase className="w-4 h-4" />}
                          {currentCategory.key === 'INVOICE' && <Receipt className="w-4 h-4" />}
                          {currentCategory.key === 'COLLATERAL' && <Shield className="w-4 h-4" />}
                          {currentCategory.key === 'OTHER' && <FolderArchive className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{currentCategory.label}</span>
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200">
                              Mục: {currentCategory.badgeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {currentCategory.description}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 italic">
                            Ví dụ tệp: {currentCategory.examples}
                          </p>
                        </div>
                      </div>

                      {/* Khung tải lên chuyên biệt cho loại chứng từ này */}
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropEntryStagedFiles(e, entryCategoryTab)}
                      >
                        <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-indigo-50/40 transition-all group">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar"
                            onChange={(e) => handleAddEntryStagedFiles(e, entryCategoryTab)}
                            className="hidden"
                          />
                          <div className="w-8 h-8 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 mb-1.5 transition-colors">
                            <Upload className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-semibold text-slate-800 text-center">
                            Bấm để chọn tệp hoặc kéo thả {currentCategory.shortLabel} vào đây
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 text-center">
                            Tệp tải vào mục này sẽ tự động gán loại "{currentCategory.badgeLabel}" (Tối đa 50MB/file)
                          </p>
                        </label>
                      </div>

                      {/* Danh sách tệp chuẩn bị nạp (staged) của mục này */}
                      {catStagedFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Tệp chuẩn bị lưu vào mục này ({catStagedFiles.length}):</span>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {catStagedFiles.map((sf) => (
                              <div
                                key={sf.id}
                                className="p-2.5 bg-white rounded-lg border border-indigo-200 shadow-2xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <span className="font-semibold text-xs text-slate-900 truncate max-w-xs" title={sf.file.name}>
                                      {sf.file.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      ({(sf.file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEntryStagedFile(sf.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Bỏ tệp này"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Chuyển sang loại chứng từ khác:
                                    </label>
                                    <select
                                      value={sf.document_type}
                                      onChange={(e) => handleUpdateEntryStagedType(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="CONTRACT">Hợp đồng tín dụng</option>
                                      <option value="DEBT_NOTE">Khế ước nhận nợ LD</option>
                                      <option value="INVOICE">Hóa đơn / UNC</option>
                                      <option value="COLLATERAL">Tài sản bảo đảm</option>
                                      <option value="OTHER">Phê duyệt & Khác</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Ghi chú chứng từ (tùy chọn):
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="VD: Số HĐ, ngày ký, số UNC..."
                                      value={sf.description}
                                      onChange={(e) => handleUpdateEntryStagedDesc(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Danh sách tệp đã lưu trong CSDL của mục này */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-200">
                        <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                          <span>Tài liệu đã lưu trong mục này ({catExistingDocs.length}):</span>
                          {isEntryDocsLoading && (
                            <span className="text-slate-400 text-[11px] flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Đang đồng bộ...
                            </span>
                          )}
                        </div>
                        {catExistingDocs.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center">
                            Chưa có tài liệu nào thuộc danh mục này trong CSDL.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {catExistingDocs.map((doc) => (
                              <div
                                key={doc.document_id}
                                className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-2xs"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-900 truncate max-w-xs block" title={doc.file_name}>
                                      {doc.file_name}
                                    </span>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                      <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                                      <span>•</span>
                                      <span>{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>
                                      {doc.description && (
                                        <>
                                          <span>•</span>
                                          <span className="text-slate-600 italic truncate max-w-[150px]" title={doc.description}>
                                            {doc.description}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadDossierDoc(doc)}
                                    className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                    title="Tải xuống tài liệu"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEntrySavedDoc(doc.document_id)}
                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                    title="Xóa tài liệu khỏi hồ sơ"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Nội dung Tab TẤT CẢ (Tổng hợp bảng danh mục) */}
                {entryCategoryTab === 'ALL' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {DOSSIER_CATEGORIES.map((cat) => {
                        const sCount = entryStagedFiles.filter(
                          (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                        ).length;
                        const eCount = entryDossierDocs.filter(
                          (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                        ).length;
                        const total = sCount + eCount;
                        return (
                          <div
                            key={cat.key}
                            onClick={() => setEntryCategoryTab(cat.key)}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-2xs cursor-pointer transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800 truncate">{cat.shortLabel}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${total > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                  }`}
                              >
                                {total} tệp
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{cat.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Danh sách hợp nhất tất cả tệp */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        <span>Tổng hợp toàn bộ tài liệu hồ sơ ({entryStagedFiles.length + entryDossierDocs.length}):</span>
                        {entryStagedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEntryStagedFiles([])}
                            className="text-[11px] text-rose-500 hover:underline"
                          >
                            Xóa tất cả {entryStagedFiles.length} tệp chuẩn bị nạp
                          </button>
                        )}
                      </div>

                      {entryStagedFiles.length === 0 && entryDossierDocs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có tài liệu nào trong bộ hồ sơ. Vui lòng chọn một danh mục chứng từ ở trên để tải tệp.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {/* Staged files */}
                          {entryStagedFiles.map((sf) => (
                            <div
                              key={sf.id}
                              className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-200 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{sf.file.name}</span>
                                {renderDossierBadge(sf.document_type)}
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Chờ lưu
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveEntryStagedFile(sf.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {/* Saved docs */}
                          {entryDossierDocs.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{doc.file_name}</span>
                                {renderDossierBadge(doc.document_type)}
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Đã lưu
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDossierDoc(doc)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 rounded"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntrySavedDoc(doc.document_id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. KHỐI GHI CHÚ ĐỢT NỘP HỒ SƠ */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  3. Ghi Chú Đợt Nhập Hồ Sơ (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm về đợt bổ sung hồ sơ chứng từ này (VD: Bổ sung hóa đơn than đợt 2 theo yêu cầu VietinBank...)"
                  value={entryBatchNote}
                  onChange={(e) => setEntryBatchNote(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsDossierEntryModalOpen(false)}
                  disabled={isEntrySubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isEntrySubmitting || entryStagedFiles.length === 0}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center space-x-1.5 ${entryStagedFiles.length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                >
                  {isEntrySubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu & tải lên {entryStagedFiles.length} tệp...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>
                        {entryStagedFiles.length > 0
                          ? `Lưu & Tải Lên ${entryStagedFiles.length} Tệp Hồ Sơ Vào Object Storage`
                          : 'Chọn Tệp Để Lưu'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL FORM: NHẬP LẺ & CHỈNH SỬA KHOẢN VAY / NỢ TÍN DỤNG                   */}
      {/* ========================================================================= */}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  {editingLoan ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {editingLoan ? `Chỉnh Sửa Khoản Vay #${editingLoan.contract_number}` : 'Nhập Lẻ Khoản Vay / Nợ Tín Dụng'}
                  </h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Hỗ trợ nhập nợ ngân hàng, công ty tài chính, thuê tài chính ngoài các file sao kê tự động
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Scrollable Form */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. KHỐI TỔ CHỨC CẤP TÍN DỤNG */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    1. Đơn Vị Cấp Tín Dụng / Cho Vay / Thuê Tài Chính
                  </label>
                  <span className="text-[11px] text-slate-500">Chọn nhanh hoặc tự nhập</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Danh sách đơn vị gợi ý <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formOrgPreset}
                      onChange={(e) => handleOrgPresetChange(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <optgroup label="🏦 Ngân Hàng Thương Mại">
                        {PRESET_ORGANIZATIONS.filter((o) => o.type === 'BANK').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🏢 Công Ty Tài Chính">
                        {PRESET_ORGANIZATIONS.filter((o) => o.type === 'FINANCE_COMPANY').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🚜 Công Ty Cho Thuê Tài Chính (Leasing)">
                        {PRESET_ORGANIZATIONS.filter((o) => o.type === 'LEASING_COMPANY').map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <option value="CUSTOM">➕ Tổ chức / Đối tác khác (Tự nhập tên và mã)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phân loại tổ chức <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.institution_type}
                      onChange={(e) =>
                        setFormData({ ...formData, institution_type: e.target.value as InstitutionType })
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="BANK">Ngân hàng thương mại (Commercial Bank)</option>
                      <option value="FINANCE_COMPANY">Công ty tài chính (Finance Company)</option>
                      <option value="LEASING_COMPANY">Công ty cho thuê tài chính (Leasing Company)</option>
                      <option value="OTHER">Tổ chức tín dụng khác (Other)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mã viết tắt (Bank/Org Code) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: CTG, FE_CREDIT, CHAILEASE..."
                      value={formData.bank_code}
                      onChange={(e) => setFormData({ ...formData, bank_code: e.target.value.toUpperCase() })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tên đầy đủ của đơn vị <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Ngân hàng TMCP..., Công ty Tài chính..."
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. KHỐI THÔNG TIN HỢP ĐỒNG & PHÁP LÝ */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  2. Thông Tin Hợp Đồng & Khế Ước
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Số HĐ / Số Khế Ước LD <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 108003668812, HDTD-2026/01..."
                      value={formData.contract_number}
                      onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Đơn vị vay / Bên thuê <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Tên công ty hoặc người vay"
                      value={formData.borrower_name}
                      onChange={(e) => setFormData({ ...formData, borrower_name: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mã CIF / Mã khách hàng
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 80145293 (tùy chọn)"
                      value={formData.cif_number}
                      onChange={(e) => setFormData({ ...formData, cif_number: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Loại khoản vay / Nợ
                    </label>
                    <select
                      value={formData.loan_type}
                      onChange={(e) => setFormData({ ...formData, loan_type: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="SHORT_TERM">Vay ngắn hạn (&lt; 1 năm)</option>
                      <option value="MEDIUM_TERM">Vay trung hạn (1 - 5 năm)</option>
                      <option value="LONG_TERM">Vay dài hạn (&gt; 5 năm)</option>
                      <option value="FINANCIAL_LEASE">Thuê tài chính (Financial Lease)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phân loại Nhóm Nợ
                    </label>
                    <select
                      value={formData.debt_group}
                      onChange={(e) => setFormData({ ...formData, debt_group: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="1">Nhóm 1 - Nợ đủ tiêu chuẩn</option>
                      <option value="2">Nhóm 2 - Nợ cần chú ý</option>
                      <option value="3">Nhóm 3 - Nợ dưới tiêu chuẩn</option>
                      <option value="4">Nhóm 4 - Nợ nghi ngờ</option>
                      <option value="5">Nhóm 5 - Nợ có khả năng mất vốn</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mục đích vay / Thuê tài sản
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Thanh toán tiền hàng, thuê xe bồn..."
                      value={formData.loan_purpose}
                      onChange={(e) => setFormData({ ...formData, loan_purpose: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. KHỐI SỐ DƯ GỐC & LÃI SUẤT */}
              <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3">
                <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  3. Số Dư Nợ Gốc & Lãi Suất
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Dư Nợ Gốc Hiện Tại (VND) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.current_principal_balance || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          current_principal_balance: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-indigo-700 font-medium mt-1">
                      {formatVND(formData.current_principal_balance)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lãi Suất (%/năm) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.interest_rate}
                      onChange={(e) =>
                        setFormData({ ...formData, interest_rate: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full text-sm font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Lãi suất hợp đồng hiện hành</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Lãi Cộng Dồn / Dự Trả (VND)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.accrued_interest || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, accrued_interest: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{formatVND(formData.accrued_interest)}</p>
                  </div>
                </div>
              </div>

              {/* 3B. KHỐI HÌNH THỨC TRẢ LÃI & TÍNH LÃI THEO LUẬT ĐỊNH (THÔNG TƯ 14/2017/TT-NHNN) */}
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-3">
                <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-emerald-600" />
                  Phương Thức Trả Lãi & Tính Số Lãi Phải Trả (Thông tư 14/2017/TT-NHNN)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hình Thức Trả Lãi <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.interest_payment_method}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          interest_payment_method: e.target.value as InterestPaymentMethod,
                        })
                      }
                      className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="MONTHLY">Hằng tháng (Định kỳ hàng tháng)</option>
                      <option value="END_OF_TERM">Cuối kỳ (Trả toàn bộ khi đáo hạn)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formData.interest_payment_method === 'MONTHLY'
                        ? 'Lãi thanh toán định kỳ từng tháng theo ngày chốt'
                        : 'Lãi thanh toán một lần cùng tiền gốc khi khoản vay đáo hạn'}
                    </p>
                  </div>

                  {formData.interest_payment_method === 'MONTHLY' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ngày Trả Lãi Hằng Tháng (1 - 31) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.monthly_interest_due_day || 25}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            monthly_interest_due_day: parseInt(e.target.value) || 25,
                          })
                        }
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ví dụ: Ngày {formData.monthly_interest_due_day || 25} hằng tháng
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Ngày Trả Lãi
                      </label>
                      <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 italic">
                        Thanh toán toàn bộ vào ngày đáo hạn ({formData.maturity_date || 'Chưa chọn'})
                      </div>
                    </div>
                  )}
                </div>

                {/* Live calculation banner according to circular 14 */}
                <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">
                      Số lãi cần trả tính theo TT 14/2017/TT-NHNN ({formData.interest_payment_method === 'MONTHLY' ? 'Kỳ tháng này' : 'Toàn kỳ hạn'}):
                    </span>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatVND(
                        computeInterestPreview(
                          formData.current_principal_balance,
                          formData.interest_rate,
                          formData.interest_payment_method,
                          formData.monthly_interest_due_day,
                          formData.disbursement_date,
                          formData.maturity_date
                        )
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Căn cứ: Số dư thực tế × Lãi suất năm × Số ngày tính lãi (Actual) / 365 ngày (Tính ngày đầu, bỏ ngày cuối).
                  </div>
                </div>
              </div>

              {/* 4. KHỐI THỜI HẠN & NGHĨA VỤ TRẢ NỢ */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  4. Thời Hạn & Lịch Trả Nợ Kỳ Tới
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Giải Ngân / Bắt Đầu
                    </label>
                    <input
                      type="date"
                      value={formData.disbursement_date}
                      onChange={(e) => setFormData({ ...formData, disbursement_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Đáo Hạn Hợp Đồng
                    </label>
                    <input
                      type="date"
                      value={formData.maturity_date}
                      onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Kỳ Hạn (Term)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 3M, 6M, 12M, 36 tháng..."
                      value={formData.term}
                      onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ngày Thu Nợ / Trả Nợ Kế Tiếp
                    </label>
                    <input
                      type="date"
                      value={formData.next_repayment_date}
                      onChange={(e) => setFormData({ ...formData, next_repayment_date: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Gốc Đến Hạn Kỳ Tới (VND)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.next_principal_amount || ''}
                      onChange={(e) =>
                        handlePrincipalInterestChange('next_principal_amount', parseFloat(e.target.value) || 0)
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{formatVND(formData.next_principal_amount)}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Lãi Đến Hạn Kỳ Tới (VND)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.next_interest_amount || ''}
                      onChange={(e) =>
                        handlePrincipalInterestChange('next_interest_amount', parseFloat(e.target.value) || 0)
                      }
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{formatVND(formData.next_interest_amount)}</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-900">
                      Tổng Nghĩa Vụ Phải Trả Kỳ Tới:
                    </div>
                    <div className="text-[11px] text-amber-700">
                      Tự động tính = Gốc đến hạn ({formatVND(formData.next_principal_amount)}) + Lãi đến hạn ({formatVND(formData.next_interest_amount)})
                    </div>
                  </div>
                  <div className="text-base font-bold text-amber-900">
                    {formatVND(formData.total_repayment_amount)}
                  </div>
                </div>
              </div>

              {/* 5. KHỐI BỘ HỒ SƠ GIẢI NGÂN PHÂN THEO LOẠI CHỨNG TỪ (LƯU TRỮ OBJECT STORAGE) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        5. Bộ Hồ Sơ Giải Ngân (Phân Chia Theo Loại Chứng Từ)
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Phân tách rành mạch theo 5 loại chứng từ ngân hàng. Tệp tải lên sẽ tự động lưu vào MinIO/Object Storage.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {stagedFiles.length + editModalDocs.length} tệp đính kèm
                  </span>
                </div>

                {/* Thanh Tab chọn Loại chứng từ */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                  {DOSSIER_CATEGORIES.map((cat) => {
                    const stagedCount = stagedFiles.filter(
                      (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                    ).length;
                    const existingCount = editModalDocs.filter(
                      (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                    ).length;
                    const totalCount = stagedCount + existingCount;
                    const isActive = stagedDocCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setStagedDocCategory(cat.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                      >
                        {cat.key === 'CONTRACT' && <FileText className="w-3.5 h-3.5" />}
                        {cat.key === 'DEBT_NOTE' && <Briefcase className="w-3.5 h-3.5" />}
                        {cat.key === 'INVOICE' && <Receipt className="w-3.5 h-3.5" />}
                        {cat.key === 'COLLATERAL' && <Shield className="w-3.5 h-3.5" />}
                        {cat.key === 'OTHER' && <FolderArchive className="w-3.5 h-3.5" />}
                        <span>{cat.shortLabel}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                              ? 'bg-white/20 text-white'
                              : totalCount > 0
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                        >
                          {totalCount}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setStagedDocCategory('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${stagedDocCategory === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Tất cả</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${stagedDocCategory === 'ALL'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {stagedFiles.length + editModalDocs.length}
                    </span>
                  </button>
                </div>

                {/* Nội dung Tab cụ thể */}
                {stagedDocCategory !== 'ALL' && (() => {
                  const currentCategory = DOSSIER_CATEGORIES.find((c) => c.key === stagedDocCategory)!;
                  const catStagedFiles = stagedFiles.filter(
                    (sf) => mapDocTypeToCategoryKey(sf.document_type) === stagedDocCategory
                  );
                  const catExistingDocs = editModalDocs.filter(
                    (d) => mapDocTypeToCategoryKey(d.document_type) === stagedDocCategory
                  );

                  return (
                    <div className="space-y-3">
                      {/* Banner thông tin loại chứng từ */}
                      <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0 mt-0.5">
                          {currentCategory.key === 'CONTRACT' && <FileText className="w-4 h-4" />}
                          {currentCategory.key === 'DEBT_NOTE' && <Briefcase className="w-4 h-4" />}
                          {currentCategory.key === 'INVOICE' && <Receipt className="w-4 h-4" />}
                          {currentCategory.key === 'COLLATERAL' && <Shield className="w-4 h-4" />}
                          {currentCategory.key === 'OTHER' && <FolderArchive className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{currentCategory.label}</span>
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200">
                              Mục: {currentCategory.badgeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {currentCategory.description}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 italic">
                            Ví dụ tệp: {currentCategory.examples}
                          </p>
                        </div>
                      </div>

                      {/* Khung tải lên chuyên biệt cho loại chứng từ này */}
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropStagedFilesForCategory(e, stagedDocCategory)}
                      >
                        <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-indigo-50/40 transition-all group">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar"
                            onChange={(e) => handleAddStagedFilesForCategory(e, stagedDocCategory)}
                            className="hidden"
                          />
                          <div className="w-8 h-8 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-600 mb-1.5 transition-colors">
                            <Upload className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-semibold text-slate-800 text-center">
                            Bấm để chọn tệp hoặc kéo thả {currentCategory.shortLabel} vào đây
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 text-center">
                            Tệp tải vào mục này sẽ tự động gán loại "{currentCategory.badgeLabel}" (Tối đa 50MB/file)
                          </p>
                        </label>
                      </div>

                      {/* Danh sách tệp chuẩn bị nạp (staged) của mục này */}
                      {catStagedFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Tệp chuẩn bị lưu vào mục này ({catStagedFiles.length}):</span>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {catStagedFiles.map((sf) => (
                              <div
                                key={sf.id}
                                className="p-2.5 bg-white rounded-lg border border-indigo-200 shadow-2xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <span className="font-semibold text-xs text-slate-900 truncate max-w-xs" title={sf.file.name}>
                                      {sf.file.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      ({(sf.file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStagedFile(sf.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Bỏ tệp này"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Chuyển sang loại chứng từ khác:
                                    </label>
                                    <select
                                      value={sf.document_type}
                                      onChange={(e) => handleUpdateStagedType(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="CONTRACT">Hợp đồng tín dụng</option>
                                      <option value="DEBT_NOTE">Khế ước nhận nợ LD</option>
                                      <option value="INVOICE">Hóa đơn / UNC</option>
                                      <option value="COLLATERAL">Tài sản bảo đảm</option>
                                      <option value="OTHER">Phê duyệt & Khác</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                      Ghi chú chứng từ (tùy chọn):
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="VD: Số HĐ, ngày ký, số UNC..."
                                      value={sf.description}
                                      onChange={(e) => handleUpdateStagedDesc(sf.id, e.target.value)}
                                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Danh sách tệp đã lưu trong CSDL của mục này (chế độ sửa) */}
                      {editingLoan && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>Tài liệu đã lưu trong mục này ({catExistingDocs.length}):</span>
                            {isEditModalDocsLoading && (
                              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Đang đồng bộ...
                              </span>
                            )}
                          </div>
                          {catExistingDocs.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-center">
                              Chưa có tài liệu nào thuộc danh mục này trong CSDL.
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              {catExistingDocs.map((doc) => (
                                <div
                                  key={doc.document_id}
                                  className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-2xs"
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0">
                                    <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <span className="font-semibold text-slate-900 truncate max-w-xs block" title={doc.file_name}>
                                        {doc.file_name}
                                      </span>
                                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                        <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                                        <span>•</span>
                                        <span>{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>
                                        {doc.description && (
                                          <>
                                            <span>•</span>
                                            <span className="text-slate-600 italic truncate max-w-[150px]" title={doc.description}>
                                              {doc.description}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadDossierDoc(doc)}
                                      className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                      title="Tải xuống tài liệu"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEditModalDoc(doc.document_id)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                      title="Xóa tài liệu khỏi hồ sơ"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Nội dung Tab TẤT CẢ (Tổng hợp bảng danh mục) */}
                {stagedDocCategory === 'ALL' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {DOSSIER_CATEGORIES.map((cat) => {
                        const sCount = stagedFiles.filter(
                          (sf) => mapDocTypeToCategoryKey(sf.document_type) === cat.key
                        ).length;
                        const eCount = editModalDocs.filter(
                          (d) => mapDocTypeToCategoryKey(d.document_type) === cat.key
                        ).length;
                        const total = sCount + eCount;
                        return (
                          <div
                            key={cat.key}
                            onClick={() => setStagedDocCategory(cat.key)}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-2xs cursor-pointer transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-800 truncate">{cat.shortLabel}</span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${total > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                  }`}
                              >
                                {total} tệp
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{cat.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Danh sách hợp nhất tất cả tệp */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                        <span>Tổng hợp toàn bộ tài liệu hồ sơ ({stagedFiles.length + editModalDocs.length}):</span>
                        {stagedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setStagedFiles([])}
                            className="text-[11px] text-rose-500 hover:underline"
                          >
                            Xóa tất cả {stagedFiles.length} tệp chuẩn bị nạp
                          </button>
                        )}
                      </div>

                      {stagedFiles.length === 0 && editModalDocs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có tài liệu nào trong bộ hồ sơ. Vui lòng chọn một danh mục chứng từ ở trên để tải tệp.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {/* Staged files */}
                          {stagedFiles.map((sf) => (
                            <div
                              key={sf.id}
                              className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-200 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{sf.file.name}</span>
                                {renderDossierBadge(sf.document_type)}
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Chờ lưu
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveStagedFile(sf.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {/* Saved docs */}
                          {editModalDocs.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-xs">{doc.file_name}</span>
                                {renderDossierBadge(doc.document_type)}
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Đã lưu
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDossierDoc(doc)}
                                  className="p-1 text-indigo-600 hover:text-indigo-800 rounded"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEditModalDoc(doc.document_id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* KHỐI GHI CHÚ NỘI BỘ */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ghi Chú Nội Bộ
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm về điều kiện tín dụng, tài sản thế chấp hoặc thỏa thuận thuê mua..."
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                {editingLoan ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingLoan) {
                        const target = editingLoan;
                        setIsModalOpen(false);
                        handleDeleteLoan(target);
                      }
                    }}
                    className="px-3 py-2 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5"
                    title="Xóa hoặc chuyển trạng thái tất toán cho khoản vay này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa khoản vay</span>
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={modalSubmitting}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {stagedFiles.length > 0
                          ? `Đang lưu & tải lên ${stagedFiles.length} tệp...`
                          : 'Đang lưu...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>
                        {editingLoan
                          ? (stagedFiles.length > 0 ? `Cập Nhật & Tải Lên ${stagedFiles.length} Tệp` : 'Cập Nhật Khoản Vay')
                          : (stagedFiles.length > 0 ? `Lưu & Tải Lên ${stagedFiles.length} Tệp Hồ Sơ` : 'Lưu Khoản Vay Mới')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      )}
    </div>
  );
};
