import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Layers,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Sliders,
  Building2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  GripVertical,
  ArrowUpDown,
  Plus,
  X,
  RotateCcw,
} from 'lucide-react';
import api from '../services/api';
import {
  CreditFacility,
  DebtRolloverPlanConfig,
  DebtRolloverSimulationResult,
  MonthlyRolloverBucket,
  RolloverPriorityField,
  RolloverPriorityRule,
} from '../types/credit';
import {
  simulateDebtRolloverPlan,
  PRIORITY_FIELD_DEFINITIONS,
  DEFAULT_PRIORITY_RULES,
} from '../utils/debtRolloverEngine';
import { useCorporateEntity } from '../contexts/CorporateEntityContext';

export const DebtRolloverPlanPage: React.FC = () => {
  const { selectedEntity } = useCorporateEntity();

  const [loans, setLoans] = useState<CreditFacility[]>([]);
  const [, setLoading] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Cấu hình Kế hoạch
  const [config, setConfig] = useState<DebtRolloverPlanConfig>({
    borrower_name: selectedEntity?.name || 'DEFAULT',
    horizon_months: 12,
    default_monthly_ocf: 10_000_000_000,
    default_rollover_term_months: 6,
    monthly_ocf_overrides: {},
    bank_term_overrides: {},
    payoff_contract_numbers: [],
    locked_rollover_actions: [],
    priority_rules: DEFAULT_PRIORITY_RULES,
    custom_bank_order: [],
  });

  // Trạng thái kéo thả (Drag-and-Drop) cho Tháp Ưu Tiên
  const [draggedRuleIdx, setDraggedRuleIdx] = useState<number | null>(null);
  const [dragOverRuleIdx, setDragOverRuleIdx] = useState<number | null>(null);
  const [draggedPoolField, setDraggedPoolField] = useState<RolloverPriorityField | null>(null);
  const [draggedBankCode, setDraggedBankCode] = useState<string | null>(null);

  // Chế độ xem biểu đồ Waterfall:
  // 'WATERFALL_STACK' (Cột Thác Nước Hợp Nhất) | 'WATERFALL_STEPS' (Thác Nước 4 Bước Nối Tiếp) | 'COMPARE' (So sánh Trước & Sau)
  const [chartMode, setChartMode] = useState<'WATERFALL_STACK' | 'WATERFALL_STEPS' | 'COMPARE'>('WATERFALL_STACK');

  // Tháng đang được rê chuột hoặc chọn để xem công thức Waterfall
  const [hoveredBucket, setHoveredBucket] = useState<MonthlyRolloverBucket | null>(null);

  // Bộ lọc bảng chi tiết
  const [filterBank, setFilterBank] = useState<string>('ALL');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Input sửa OCF nhanh theo tháng
  const [editingOcfMonth, setEditingOcfMonth] = useState<string | null>(null);
  const [editingOcfValue, setEditingOcfValue] = useState<string>('');

  // Tải dữ liệu khoản vay và cấu hình từ Backend
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Tải danh sách khoản vay (độc lập để không bao giờ bị chặn bởi API config)
      const loansRes = await api.get('/loans', { params: { limit: 500 } });
      if (loansRes.data && Array.isArray(loansRes.data.data)) {
        setLoans(loansRes.data.data);
      } else if (loansRes.data && Array.isArray(loansRes.data.items)) {
        setLoans(loansRes.data.items);
      } else if (Array.isArray(loansRes.data)) {
        setLoans(loansRes.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách khoản vay:', err);
    }

    // 2. Tải cấu hình kế hoạch đảo nợ theo doanh nghiệp
    const borrowerParam = selectedEntity?.id === 'ALL' ? 'DEFAULT' : selectedEntity?.name || 'DEFAULT';
    const localKey = `bsp_rollover_plan_cfg_${borrowerParam}`;
    try {
      const configRes = await api.get('/loans/rollover-plan-config', {
        params: { borrower_name: borrowerParam },
      });
      if (configRes.data) {
        const mergedCfg: DebtRolloverPlanConfig = {
          ...configRes.data,
          borrower_name: borrowerParam,
          default_monthly_ocf: Number(configRes.data.default_monthly_ocf) || 10_000_000_000,
          priority_rules:
            Array.isArray(configRes.data.priority_rules) && configRes.data.priority_rules.length > 0
              ? configRes.data.priority_rules
              : DEFAULT_PRIORITY_RULES,
          custom_bank_order: Array.isArray(configRes.data.custom_bank_order)
            ? configRes.data.custom_bank_order
            : [],
        };
        setConfig(mergedCfg);
        localStorage.setItem(localKey, JSON.stringify(mergedCfg));
      }
    } catch (err) {
      console.warn('Không tải được cấu hình từ server, sử dụng cấu hình lưu cục bộ:', err);
      try {
        const cached = localStorage.getItem(localKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setConfig({
            ...parsed,
            priority_rules:
              Array.isArray(parsed.priority_rules) && parsed.priority_rules.length > 0
                ? parsed.priority_rules
                : DEFAULT_PRIORITY_RULES,
            custom_bank_order: Array.isArray(parsed.custom_bank_order) ? parsed.custom_bank_order : [],
          });
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEntity]);

  // Lọc danh sách khoản vay theo thực thể doanh nghiệp đang chọn trên Header
  const entityLoans = useMemo(() => {
    if (!selectedEntity || selectedEntity.id === 'ALL') {
      return loans;
    }
    const stripAccents = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toUpperCase()
        .trim();
    const targetName = stripAccents(selectedEntity.name || '');
    const targetShort = stripAccents(selectedEntity.shortName || '');

    return loans.filter((l) => {
      const bName = stripAccents(l.borrower_name || '');
      if (!bName) return true;
      return (
        bName.includes(targetName) ||
        targetName.includes(bName) ||
        (targetShort && bName.includes(targetShort))
      );
    });
  }, [loans, selectedEntity]);

  // Chạy mô phỏng kế hoạch phản ứng thời gian thực (Real-time Reactive)
  const simulationResult: DebtRolloverSimulationResult = useMemo(() => {
    return simulateDebtRolloverPlan(entityLoans, config);
  }, [entityLoans, config]);

  // Tự động mở rộng 4 tháng đầu tiên mặc định
  useEffect(() => {
    if (simulationResult.monthly_buckets.length > 0 && expandedMonths.size === 0) {
      const initSet = new Set<string>();
      simulationResult.monthly_buckets.slice(0, 4).forEach((b) => initSet.add(b.month_key));
      setExpandedMonths(initSet);
    }
  }, [simulationResult]);

  // Lưu cấu hình lên server & localStorage
  const handleSaveConfig = async (newConfig?: DebtRolloverPlanConfig) => {
    setSavingConfig(true);
    const payloadToSave = newConfig || config;
    const borrowerParam = selectedEntity?.id === 'ALL' ? 'DEFAULT' : selectedEntity?.name || 'DEFAULT';
    const localKey = `bsp_rollover_plan_cfg_${borrowerParam}`;
    try {
      localStorage.setItem(localKey, JSON.stringify(payloadToSave));
      await api.put('/loans/rollover-plan-config', {
        borrower_name: borrowerParam,
        horizon_months: payloadToSave.horizon_months,
        default_monthly_ocf: payloadToSave.default_monthly_ocf,
        default_rollover_term_months: payloadToSave.default_rollover_term_months,
        monthly_ocf_overrides: payloadToSave.monthly_ocf_overrides,
        bank_term_overrides: payloadToSave.bank_term_overrides,
        payoff_contract_numbers: payloadToSave.payoff_contract_numbers,
        locked_rollover_actions: payloadToSave.locked_rollover_actions,
        priority_rules: payloadToSave.priority_rules || DEFAULT_PRIORITY_RULES,
        custom_bank_order: payloadToSave.custom_bank_order || [],
        updated_by: 'CFO / Kế toán trưởng',
      });
      setSuccessToast('Đã lưu cấu hình kế hoạch đảo nợ thành công!');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      setSuccessToast('Đã lưu cấu hình kế hoạch (Chế độ cục bộ)!');
      setTimeout(() => setSuccessToast(null), 3000);
    } finally {
      setSavingConfig(false);
    }
  };

  // Định dạng VNĐ
  const formatVND = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0 ₫';
    return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
  };

  // Định dạng rút gọn cho đỉnh cột biểu đồ
  const formatCompact = (val: number): string => {
    if (!val || val === 0) return '0 ₫';
    const absVal = Math.abs(val);
    if (absVal >= 1_000_000_000) {
      return `${(val / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
    }
    if (absVal >= 1_000_000) {
      return `${(val / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} tr`;
    }
    return formatVND(val);
  };

  // Thao tác Đánh dấu / Bỏ đánh dấu "Tất toán đứt (Không vay lại)"
  const handleTogglePayoff = (contractNumber: string) => {
    const baseContract = contractNumber.replace(/\s*\((Đảo mới|Tái GN)\)\s*/g, '').trim();
    const currentList = config.payoff_contract_numbers || [];
    let updated: string[];
    if (currentList.includes(baseContract)) {
      updated = currentList.filter((c) => c !== baseContract);
    } else {
      updated = [...currentList, baseContract];
    }
    const nextCfg = { ...config, payoff_contract_numbers: updated };
    setConfig(nextCfg);
    handleSaveConfig(nextCfg);
  };

  // Thao tác Lưu OCF Override cho tháng cụ thể
  const handleSaveOcfOverride = (monthKey: string) => {
    const rawClean = editingOcfValue.replace(/,/g, '.').trim();
    const numVal = parseFloat(rawClean);
    const currentOverrides = { ...(config.monthly_ocf_overrides || {}) };
    if (!isNaN(numVal) && numVal > 0) {
      // Nếu người dùng nhập số nhỏ (< 10000), hiểu là đơn vị Tỷ VNĐ; ngược lại là VNĐ
      const amountVnd = numVal < 10000 ? Math.round(numVal * 1_000_000_000) : Math.round(numVal);
      currentOverrides[monthKey] = amountVnd;
    } else {
      delete currentOverrides[monthKey];
    }
    const nextCfg = { ...config, monthly_ocf_overrides: currentOverrides };
    setConfig(nextCfg);
    setEditingOcfMonth(null);
    handleSaveConfig(nextCfg);
  };

  // Thao tác Cập nhật Kỳ hạn giải ngân lại theo Ngân hàng
  const handleBankTermChange = (bankCode: string, term: number) => {
    const updated = { ...(config.bank_term_overrides || {}), [bankCode]: term };
    const nextCfg = { ...config, bank_term_overrides: updated };
    setConfig(nextCfg);
    handleSaveConfig(nextCfg);
  };

  // =========================================================================
  // BỘ ĐIỀU KHIỂN THÁP ƯU TIÊN ĐẢO NỢ (PRIORITY STACK BUILDER HANDLERS)
  // =========================================================================
  const activePriorityRules: RolloverPriorityRule[] = useMemo(() => {
    return config.priority_rules && config.priority_rules.length > 0
      ? config.priority_rules
      : DEFAULT_PRIORITY_RULES;
  }, [config.priority_rules]);

  const availablePoolFields: RolloverPriorityField[] = useMemo(() => {
    const usedSet = new Set(activePriorityRules.map((r) => r.field));
    return (Object.keys(PRIORITY_FIELD_DEFINITIONS) as RolloverPriorityField[]).filter(
      (f) => !usedSet.has(f)
    );
  }, [activePriorityRules]);

  // Danh sách ngân hàng theo thứ tự tùy chỉnh (dùng cho tiêu chí bank_custom_order)
  const orderedBanksForCustomRule = useMemo(() => {
    const allCodes = simulationResult.unique_banks.map((b) => b.bank_code);
    const savedOrder = config.custom_bank_order || [];
    const validSaved = savedOrder.filter((code) => allCodes.includes(code));
    const missing = allCodes.filter((code) => !validSaved.includes(code));
    return [...validSaved, ...missing];
  }, [simulationResult.unique_banks, config.custom_bank_order]);

  const updatePriorityRules = (nextRules: RolloverPriorityRule[], nextCustomBanks?: string[]) => {
    const nextCfg: DebtRolloverPlanConfig = {
      ...config,
      priority_rules: nextRules,
      custom_bank_order: nextCustomBanks !== undefined ? nextCustomBanks : config.custom_bank_order,
    };
    setConfig(nextCfg);
    handleSaveConfig(nextCfg);
  };

  const handleToggleRuleDirection = (idx: number) => {
    const next = [...activePriorityRules];
    next[idx] = {
      ...next[idx],
      direction: next[idx].direction === 'DESC' ? 'ASC' : 'DESC',
    };
    updatePriorityRules(next);
  };

  const handleMoveRule = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= activePriorityRules.length || fromIdx === toIdx) return;
    const next = [...activePriorityRules];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    updatePriorityRules(next);
  };

  const handleRemoveRule = (idx: number) => {
    if (activePriorityRules.length <= 1) return; // Giữ tối thiểu 1 điều kiện
    const next = activePriorityRules.filter((_, i) => i !== idx);
    updatePriorityRules(next);
  };

  const handleAddRuleFromPool = (field: RolloverPriorityField, insertAtTop: boolean = false) => {
    const def = PRIORITY_FIELD_DEFINITIONS[field];
    if (!def) return;
    const newRule: RolloverPriorityRule = {
      field,
      direction: def.defaultDirection,
      enabled: true,
    };
    const filtered = activePriorityRules.filter((r) => r.field !== field);
    const next = insertAtTop ? [newRule, ...filtered] : [...filtered, newRule];
    const nextBanks =
      field === 'bank_custom_order' && (!config.custom_bank_order || config.custom_bank_order.length === 0)
        ? orderedBanksForCustomRule
        : config.custom_bank_order;
    updatePriorityRules(next, nextBanks);
  };

  // Preset nhanh: Ưu tiên Ngân hàng có tổng dư nợ lớn nhất lên Tầng #1
  const handlePresetLargestBankFirst = () => {
    const topBankRule: RolloverPriorityRule = {
      field: 'bank_total_principal',
      direction: 'DESC',
      enabled: true,
    };
    const rest = activePriorityRules.filter((r) => r.field !== 'bank_total_principal');
    updatePriorityRules([topBankRule, ...rest]);
  };

  // Khôi phục thứ tự mặc định (Lãi suất > Ngày giải ngân > Dư nợ gốc > Ngày đáo hạn)
  const handleResetDefaultPriority = () => {
    updatePriorityRules([...DEFAULT_PRIORITY_RULES]);
  };

  // Sắp xếp thứ tự Ngân hàng trong thẻ bank_custom_order
  const handleMoveCustomBank = (fromCode: string, toCode: string) => {
    if (fromCode === toCode) return;
    const list = [...orderedBanksForCustomRule];
    const fromIdx = list.indexOf(fromCode);
    const toIdx = list.indexOf(toCode);
    if (fromIdx < 0 || toIdx < 0) return;
    list.splice(fromIdx, 1);
    list.splice(toIdx, 0, fromCode);
    updatePriorityRules(activePriorityRules, list);
  };

  // Xuất kế hoạch ra file CSV/Excel UTF-8
  const handleExportPlan = () => {
    const headers = [
      'Tháng Kế Hoạch',
      'Hạn Mức OCF (VNĐ)',
      '(1) Gốc Đến Hạn Hiện Tại (VNĐ)',
      '(2) Gốc Đã Đáo Nợ Sớm (- VNĐ)',
      '(3) Gốc Đến Hạn Đảo Nợ Mới (+ VNĐ)',
      '(4) Đảo Nợ Sớm Nhận Về (+ VNĐ)',
      'Tổng Tất Toán Thực Tế (VNĐ)',
      'Số Khế Ước',
      'Ngân Hàng',
      'Lãi Suất (%/năm)',
      'Ngày Đáo Hạn Gốc',
      'Loại Hành Động',
      'Số Tiền Tất Toán (VNĐ)',
      'Số Tiền Giải Ngân Mới (VNĐ)',
      'Kỳ Hạn Mới (Tháng)',
      'Ngày Đáo Hạn Mới',
    ];

    const rows: string[][] = [];
    simulationResult.monthly_buckets.forEach((b) => {
      if (b.items.length === 0 && b.pulled_out_items.length === 0) {
        rows.push([
          b.month_label,
          b.ocf_limit.toString(),
          b.natural_due_amount.toString(),
          b.pulled_out_early_amount.toString(),
          b.re_disbursed_due_amount.toString(),
          b.early_pulled_in_amount.toString(),
          b.total_settled_amount.toString(),
          '(Không có nghĩa vụ)',
          '',
          '',
          '',
          '',
          '0',
          '0',
          '',
          '',
        ]);
      } else {
        b.items.forEach((it) => {
          let actionLabel = 'Gốc đến hạn hiện tại (Đáo hạn đúng kỳ)';
          if (it.action_type === 'EARLY_ROLLOVER') {
            actionLabel = `(+) Đảo nợ sớm (Kéo từ ${it.source_excess_month || 'tháng sau'})`;
          } else if (it.action_type === 'PERMANENT_PAYOFF') {
            actionLabel = 'Tất toán đứt (Không vay lại)';
          } else if (it.action_type === 'RE_DISBURSED_MATURITY') {
            actionLabel = '(+) Gốc đến hạn khoản đảo nợ mới';
          }

          rows.push([
            b.month_label,
            b.ocf_limit.toString(),
            b.natural_due_amount.toString(),
            b.pulled_out_early_amount.toString(),
            b.re_disbursed_due_amount.toString(),
            b.early_pulled_in_amount.toString(),
            b.total_settled_amount.toString(),
            it.contract_number,
            it.bank_code,
            it.interest_rate.toString(),
            it.original_due_date,
            actionLabel,
            it.settlement_amount.toString(),
            it.redisbursement_amount.toString(),
            it.term_months.toString(),
            it.new_maturity_date,
          ]);
        });

        b.pulled_out_items.forEach((it) => {
          rows.push([
            b.month_label,
            b.ocf_limit.toString(),
            b.natural_due_amount.toString(),
            b.pulled_out_early_amount.toString(),
            b.re_disbursed_due_amount.toString(),
            b.early_pulled_in_amount.toString(),
            b.total_settled_amount.toString(),
            it.contract_number,
            it.bank_code,
            it.interest_rate.toString(),
            it.original_due_date,
            `(-) Gốc đã đáo nợ sớm tại tháng ${it.execution_month}`,
            `-${it.settlement_amount}`,
            '0',
            it.term_months.toString(),
            it.new_maturity_date,
          ]);
        });
      }
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Ke_hoach_Waterfall_Dao_No_${config.borrower_name}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tính đỉnh cao nhất của trục Y (xét cả đỉnh trước khi cắt giảm Waterfall để khối giảm trừ không bị tràn khung)
  const maxBarValue = useMemo(() => {
    let m = config.default_monthly_ocf * 1.18;
    simulationResult.monthly_buckets.forEach((b) => {
      const grossPeak = b.natural_due_amount + b.re_disbursed_due_gross_amount;
      const stackedPeak = b.total_settled_amount + b.pulled_out_early_amount;
      if (grossPeak > m) m = grossPeak * 1.08;
      if (stackedPeak > m) m = stackedPeak * 1.08;
      if (b.total_settled_amount > m) m = b.total_settled_amount * 1.08;
      if (b.ocf_limit * 1.15 > m) m = b.ocf_limit * 1.15;
    });
    return Math.max(m, 1_000_000_000);
  }, [simulationResult, config]);

  // Tổng hợp 4 cấu phần trên toàn chu kỳ
  const waterfallTotals = useMemo(() => {
    return simulationResult.monthly_buckets.reduce(
      (acc, b) => {
        acc.naturalDue += b.natural_due_amount;
        acc.pulledOutEarly += b.pulled_out_early_amount;
        acc.reDisbursedDue += b.re_disbursed_due_amount;
        acc.earlyPulledIn += b.early_pulled_in_amount;
        acc.totalSettled += b.total_settled_amount;
        return acc;
      },
      { naturalDue: 0, pulledOutEarly: 0, reDisbursedDue: 0, earlyPulledIn: 0, totalSettled: 0 }
    );
  }, [simulationResult]);

  const activeBucketForBanner = hoveredBucket || simulationResult.monthly_buckets[0] || null;

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* HEADER & TOP TITLE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            <Sliders className="w-4 h-4" />
            <span>Kế Hoạch Tài Chính & Tái Cấu Trúc Nợ</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Kế Hoạch Tất Toán & Đảo Nợ Hằng Tháng (Waterfall)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Phân rã thác nước hằng tháng: Gốc đến hạn hiện tại &rarr; (-) Gốc đã đáo nợ sớm &rarr; (+) Gốc đến hạn đảo nợ mới &rarr; (+) Đảo nợ sớm &le; Trần OCF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportPlan}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-2xs transition-all"
            title="Xuất bảng kế hoạch Waterfall giải ngân và tất toán ra file CSV/Excel"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Xuất Kế Hoạch Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveConfig()}
            disabled={savingConfig}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${savingConfig ? 'animate-spin' : ''}`} />
            <span>{savingConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KHU VỰC 1: BẢNG ĐIỀU KHIỂN CẤU HÌNH & 4 THẺ KPI TỔNG QUAN                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panel Cấu hình Thông số (Trái - 5 Cột) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Tham Số Cân Đối Dòng Tiền (OCF)</span>
            </h2>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {selectedEntity?.name || 'Toàn doanh nghiệp'}
            </span>
          </div>

          <div className="space-y-3.5">
            {/* OCF Mặc định hằng tháng */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dòng tiền HĐKD (OCF) mặc định hằng tháng:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={Number(config.default_monthly_ocf).toLocaleString('vi-VN')}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^\d]/g, '');
                    const num = parseInt(clean, 10) || 0;
                    setConfig({ ...config, default_monthly_ocf: num });
                  }}
                  className="w-full pl-3 pr-10 py-1.5 text-xs font-bold text-indigo-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="absolute right-3 top-2 text-[11px] font-semibold text-slate-400">VNĐ</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Trần nợ tối đa được phép đến hạn trong mỗi tháng. Có thể ghi đè riêng từng tháng.
              </p>
            </div>

            {/* Chu kỳ mô phỏng */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Khung thời gian mô phỏng:
                </label>
                <select
                  value={config.horizon_months}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10);
                    setConfig({ ...config, horizon_months: h });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={6}>6 tháng kế tiếp</option>
                  <option value={12}>12 tháng (1 năm)</option>
                  <option value={18}>18 tháng</option>
                  <option value={24}>24 tháng (2 năm)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kỳ hạn giải ngân chuẩn:
                </label>
                <select
                  value={config.default_rollover_term_months}
                  onChange={(e) => {
                    const t = parseInt(e.target.value, 10);
                    setConfig({ ...config, default_rollover_term_months: t });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={3}>3 tháng</option>
                  <option value={4}>4 tháng</option>
                  <option value={5}>5 tháng</option>
                  <option value={6}>6 tháng (Mặc định)</option>
                  <option value={9}>9 tháng</option>
                  <option value={12}>12 tháng</option>
                </select>
              </div>
            </div>

            {/* Cấu hình kỳ hạn theo từng ngân hàng */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kỳ hạn giải ngân lại theo từng Ngân hàng:
              </label>
              <div className="flex flex-wrap gap-2">
                {simulationResult.unique_banks.map((b) => {
                  const currentTerm =
                    config.bank_term_overrides?.[b.bank_code] || config.default_rollover_term_months || 6;
                  return (
                    <div
                      key={b.bank_code}
                      className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-[11px]"
                    >
                      <span className="font-bold text-slate-800">{b.bank_code}:</span>
                      <select
                        value={currentTerm}
                        onChange={(e) => handleBankTermChange(b.bank_code, parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-300 rounded px-1 py-0.5 text-[11px] font-semibold text-indigo-700"
                      >
                        <option value={3}>3T</option>
                        <option value={4}>4T</option>
                        <option value={5}>5T</option>
                        <option value={6}>6T</option>
                        <option value={9}>9T</option>
                        <option value={12}>12T</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Thẻ KPI Cấu Phần Waterfall Toàn Kỳ (Phải - 7 Cột) */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-2 gap-3.5">
          {/* Card 1: (1) Gốc đến hạn tại thời điểm hiện tại */}
          <div className="bg-white p-4 rounded-2xl border border-indigo-200 bg-indigo-50/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-indigo-700 mb-1">
              <span className="text-xs font-bold">1. Gốc Đến Hạn Hiện Tại</span>
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-lg font-black text-indigo-950">
              {formatCompact(simulationResult.total_active_principal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>
                {entityLoans.filter((l) => Number(l.current_principal_balance) > 0 && l.status !== 'SETTLED').length}{' '}
                khế ước hiện hữu
              </span>
              <span className="font-semibold text-indigo-700">
                Giữ đúng kỳ: {formatCompact(waterfallTotals.naturalDue - waterfallTotals.pulledOutEarly)}
              </span>
            </div>
          </div>

          {/* Card 2: (2) Gốc đã đáo nợ sớm (- Giảm trừ tại tháng cao điểm) & (4) Đảo nợ sớm (+ Nhận về tháng trước) */}
          <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-800 mb-1">
              <span className="text-xs font-bold">2 & 4. Đảo Nợ Sớm / Đã Đáo Sớm</span>
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-rose-600" title="Gốc đã đáo nợ sớm (giảm tại tháng vượt trần)">
                -{formatCompact(waterfallTotals.pulledOutEarly)}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-lg font-black text-amber-600" title="Đảo nợ sớm (kéo về tháng còn dư OCF)">
                +{formatCompact(waterfallTotals.earlyPulledIn)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Kéo từ tháng vượt trần về tháng trước còn dư OCF
            </div>
          </div>

          {/* Card 3: (3) Gốc đến hạn các khoản đảo nợ mới */}
          <div className="bg-white p-4 rounded-2xl border border-cyan-200 bg-cyan-50/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-cyan-800 mb-1">
              <span className="text-xs font-bold">3. Gốc Đến Hạn Đảo Nợ Mới</span>
              <Layers className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-lg font-black text-cyan-700">
              +{formatCompact(waterfallTotals.reDisbursedDue)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Phát sinh từ các khoản giải ngân lại đến kỳ đáo hạn mới
            </div>
          </div>

          {/* Card 4: Kiểm soát Trần OCF & Thanh khoản */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-600 mb-1">
              <span className="text-xs font-bold">Tháng Vượt Trần OCF (Trước &rarr; Sau)</span>
              {simulationResult.is_fully_feasible ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-rose-600">
                {simulationResult.initial_overload_months_count} tháng
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-lg font-black text-emerald-600">
                {simulationResult.final_overload_months_count} tháng
              </span>
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1">
              {simulationResult.is_fully_feasible
                ? '100% các tháng đều <= Trần dòng tiền HĐKD'
                : `Thiếu hụt: ${formatCompact(simulationResult.total_liquidity_shortfall)}`}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KHU VỰC 1B: BỘ KÉO THẢ XẾP CHỒNG THỨ TỰ ƯU TIÊN ĐẢO NỢ (PRIORITY STACK)    */}
      {/* ========================================================================= */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Thứ Tự Ưu Tiên Đảo Nợ (Kéo Thả Xếp Chồng Điều Kiện)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khi tháng có nợ đến hạn vượt trần OCF, thuật toán xét từ <strong>Ưu tiên #1 &rarr; #2 &rarr; #3...</strong> để chọn khế ước kéo về đáo nợ sớm. Kéo thả thẻ để đổi vị trí hoặc thêm điều kiện mới từ kho bên phải.
            </p>
          </div>

          {/* Các nút Preset nhanh */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePresetLargestBankFirst}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-all shadow-2xs"
              title="Đặt tiêu chí Tổng dư nợ của Ngân hàng (Lớn trước) lên Tầng Ưu Tiên #1"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Ưu tiên NH có tổng dư nợ lớn nhất lên #1</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaultPriority}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all"
              title="Khôi phục thứ tự mặc định: Lãi suất > Ngày giải ngân > Dư nợ gốc > Ngày đáo hạn"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Khôi phục mặc định</span>
            </button>
          </div>
        </div>

        {/* Tóm tắt chuỗi ưu tiên hiện hành */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs">
          <span className="font-bold text-indigo-900 mr-1">Chuỗi quy tắc đang áp dụng:</span>
          {activePriorityRules.map((rule, idx) => {
            const def = PRIORITY_FIELD_DEFINITIONS[rule.field];
            if (!def) return null;
            return (
              <React.Fragment key={rule.field}>
                {idx > 0 && <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold border ${
                    def.category === 'BANK'
                      ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                      : 'bg-white text-indigo-800 border-indigo-200'
                  }`}
                >
                  <span className="text-[10px] px-1 rounded bg-indigo-600 text-white">#{idx + 1}</span>
                  <span>{def.label}</span>
                  <span className="text-[10px] text-slate-500">
                    ({rule.direction === 'DESC' ? def.descLabel : def.ascLabel})
                  </span>
                </span>
              </React.Fragment>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* CỘT TRÁI (7 CỘT): THÁP XẾP CHỒNG ĐANG KÍCH HOẠT (ACTIVE PRIORITY STACK) */}
          <div
            className="lg:col-span-7 space-y-2.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggedPoolField) {
                handleAddRuleFromPool(draggedPoolField, false);
                setDraggedPoolField(null);
              }
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Tháp Ưu Tiên Đang Áp Dụng (Kéo thả để xếp chồng lên trước)</span>
              <span className="text-[11px] font-normal text-slate-400">
                {activePriorityRules.length} tầng điều kiện
              </span>
            </div>

            <div className="space-y-2">
              {activePriorityRules.map((rule, idx) => {
                const def = PRIORITY_FIELD_DEFINITIONS[rule.field];
                if (!def) return null;
                const isBankCategory = def.category === 'BANK';
                const isDragOver = dragOverRuleIdx === idx;

                // Xếp hạng ngân hàng trực tiếp nếu thẻ là bank_total_principal
                const sortedBanksPreview =
                  rule.field === 'bank_total_principal'
                    ? [...simulationResult.unique_banks].sort((a, b) =>
                        rule.direction === 'DESC'
                          ? b.total_principal - a.total_principal
                          : a.total_principal - b.total_principal
                      )
                    : [];

                return (
                  <div
                    key={rule.field}
                    draggable
                    onDragStart={() => {
                      setDraggedRuleIdx(idx);
                      setDraggedPoolField(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverRuleIdx !== idx) setDragOverRuleIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverRuleIdx === idx) setDragOverRuleIdx(null);
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      setDragOverRuleIdx(null);
                      if (draggedRuleIdx !== null && draggedRuleIdx !== idx) {
                        handleMoveRule(draggedRuleIdx, idx);
                      } else if (draggedPoolField) {
                        const defPool = PRIORITY_FIELD_DEFINITIONS[draggedPoolField];
                        if (defPool) {
                          const newRule: RolloverPriorityRule = {
                            field: draggedPoolField,
                            direction: defPool.defaultDirection,
                            enabled: true,
                          };
                          const next = [...activePriorityRules.filter((r) => r.field !== draggedPoolField)];
                          next.splice(idx, 0, newRule);
                          updatePriorityRules(next);
                        }
                      }
                      setDraggedRuleIdx(null);
                      setDraggedPoolField(null);
                    }}
                    onDragEnd={() => {
                      setDraggedRuleIdx(null);
                      setDragOverRuleIdx(null);
                    }}
                    className={`group p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                      isDragOver
                        ? 'border-2 border-indigo-600 bg-indigo-50/70 shadow-md scale-[1.01]'
                        : isBankCategory
                        ? 'border-amber-300 bg-amber-50/30 hover:border-amber-400 shadow-2xs'
                        : 'border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-white shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Bên trái: Tay nắm kéo + Thứ hạng #1, #2 + Tên trường */}
                      <div className="flex items-center gap-2.5">
                        <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-black tracking-tight shrink-0 ${
                            idx === 0
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : idx === 1
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          Ưu tiên #{idx + 1}
                        </span>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">{def.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                isBankCategory
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              {isBankCategory ? 'Cấp Ngân hàng' : 'Cấp Khế ước'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{def.description}</p>
                        </div>
                      </div>

                      {/* Bên phải: Nút Đảo chiều ASC/DESC + Lên/Xuống + Xóa */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => handleToggleRuleDirection(idx)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                            rule.direction === 'DESC'
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                              : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                          }`}
                          title="Nhấn để đảo chiều ưu tiên (Cao trước / Thấp trước)"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                          <span>{rule.direction === 'DESC' ? def.descLabel : def.ascLabel}</span>
                        </button>

                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveRule(idx, idx - 1)}
                            className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                            title="Đẩy lên mức ưu tiên cao hơn"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activePriorityRules.length - 1}
                            onClick={() => handleMoveRule(idx, idx + 1)}
                            className="p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 border-l border-slate-200"
                            title="Hạ xuống mức ưu tiên thấp hơn"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={activePriorityRules.length <= 1}
                          onClick={() => handleRemoveRule(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-colors"
                          title="Gỡ điều kiện này khỏi tháp ưu tiên"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Hiển thị Live Preview Thứ Hạng Ngân Hàng nếu là tiêu chí Tổng dư nợ của Ngân hàng */}
                    {rule.field === 'bank_total_principal' && sortedBanksPreview.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-amber-900">
                          Thứ tự Ngân hàng tự động theo dư nợ:
                        </span>
                        {sortedBanksPreview.map((b, bIdx) => (
                          <React.Fragment key={b.bank_code}>
                            {bIdx > 0 && <ArrowRight className="w-3 h-3 text-amber-500" />}
                            <span className="px-2 py-0.5 rounded bg-white border border-amber-300 font-bold text-slate-800 shadow-2xs">
                              <strong className="text-amber-700">#{bIdx + 1} {b.bank_code}</strong>{' '}
                              <span className="text-slate-600">({formatCompact(b.total_principal)})</span>
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {/* Hiển thị Thanh Kéo Thả Thứ Tự Ngân Hàng nếu là tiêu chí bank_custom_order */}
                    {rule.field === 'bank_custom_order' && orderedBanksForCustomRule.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-amber-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-amber-900">
                          Kéo thả các thẻ Ngân hàng bên dưới để sắp xếp thứ tự ưu tiên chỉ định:
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(rule.direction === 'ASC'
                            ? orderedBanksForCustomRule
                            : [...orderedBanksForCustomRule].reverse()
                          ).map((bankCode, bIdx) => {
                            const bankInfo = simulationResult.unique_banks.find((x) => x.bank_code === bankCode);
                            return (
                              <div
                                key={bankCode}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  setDraggedBankCode(bankCode);
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                  e.stopPropagation();
                                  if (draggedBankCode && draggedBankCode !== bankCode) {
                                    handleMoveCustomBank(draggedBankCode, bankCode);
                                  }
                                  setDraggedBankCode(null);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-400 text-xs font-bold text-slate-800 cursor-grab active:cursor-grabbing shadow-2xs hover:bg-amber-50"
                              >
                                <GripVertical className="w-3 h-3 text-amber-600" />
                                <span className="text-amber-700">#{bIdx + 1}</span>
                                <span>{bankCode}</span>
                                {bankInfo && (
                                  <span className="text-[10px] text-slate-500">
                                    ({formatCompact(bankInfo.total_principal)})
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CỘT PHẢI (5 CỘT): KHO ĐIỀU KIỆN BỔ SUNG (AVAILABLE CRITERIA POOL) */}
          <div className="lg:col-span-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Kho Điều Kiện Bổ Sung (Kéo vào tháp hoặc nhấn +)</span>
              <span className="text-[11px] font-normal text-slate-400">
                Còn {availablePoolFields.length} điều kiện
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-2 max-h-[380px] overflow-y-auto">
              {availablePoolFields.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  Tất cả 12 điều kiện ưu tiên đều đã được đưa vào Tháp Ưu Tiên bên trái.
                </div>
              ) : (
                availablePoolFields.map((field) => {
                  const def = PRIORITY_FIELD_DEFINITIONS[field];
                  const isBankCat = def.category === 'BANK';
                  return (
                    <div
                      key={field}
                      draggable
                      onDragStart={() => {
                        setDraggedPoolField(field);
                        setDraggedRuleIdx(null);
                      }}
                      onDragEnd={() => setDraggedPoolField(null)}
                      className={`p-2.5 rounded-xl border bg-white hover:border-indigo-400 transition-all cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 shadow-2xs ${
                        isBankCat ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              isBankCat
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isBankCat ? 'Ngân hàng' : 'Khế ước'}
                          </span>
                          <span className="text-xs font-bold text-slate-800">{def.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-2">{def.description}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddRuleFromPool(field, true)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors"
                          title="Đặt điều kiện này lên vị trí Ưu tiên #1 cao nhất"
                        >
                          Đặt lên #1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRuleFromPool(field, false)}
                          className="p-1.5 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                          title="Thêm vào cuối tháp ưu tiên"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KHU VỰC 2: BIỂU ĐỒ WATERFALL HẰNG THÁNG (4 CẤU PHẦN + ĐƯỜNG TRẦN OCF)       */}
      {/* ========================================================================= */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <span>Biểu Đồ Waterfall Dư Nợ Đến Hạn & Đảo Nợ Hằng Tháng</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Biểu diễn rõ 4 cấu phần: <strong>(1) Gốc đến hạn hiện tại</strong>, <strong>(2) (-) Gốc đã đáo nợ sớm</strong>,{' '}
              <strong>(3) (+) Gốc đến hạn các khoản đảo nợ mới</strong>, và <strong>(4) (+) Đảo nợ sớm</strong>.
            </p>
          </div>

          {/* Toggle Chế độ xem Biểu đồ Waterfall */}
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold gap-1">
            <button
              type="button"
              onClick={() => setChartMode('WATERFALL_STACK')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMode === 'WATERFALL_STACK'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Waterfall Hợp Nhất (Theo Tháng)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('WATERFALL_STEPS')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMode === 'WATERFALL_STEPS'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Waterfall 4 Bước (Chi Tiết)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('COMPARE')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMode === 'COMPARE'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              So Sánh Lịch Gốc & Sau Đảo
            </button>
          </div>
        </div>

        {/* Thanh Phương Trình Cân Bằng Waterfall Động (Live Interactive Equation Banner) */}
        {activeBucketForBanner && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-bold">
                {activeBucketForBanner.month_label}
              </span>
              <span className="text-slate-500 hidden sm:inline">Phương trình Waterfall:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
                Gốc hiện tại: {formatCompact(activeBucketForBanner.natural_due_amount)}
              </span>
              <span className="text-slate-400 font-bold">+</span>
              <span className="px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold">
                Đảo nợ mới đến hạn: +{formatCompact(activeBucketForBanner.re_disbursed_due_gross_amount)}
              </span>
              <span className="text-slate-400 font-bold">-</span>
              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                Đã đáo nợ sớm: -{formatCompact(activeBucketForBanner.pulled_out_early_amount)}
              </span>
              <span className="text-slate-400 font-bold">+</span>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                Đảo nợ sớm (kéo về): +{formatCompact(activeBucketForBanner.early_pulled_in_amount)}
              </span>
              <span className="text-slate-600 font-bold">=</span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-black">
                Thực trả: {formatCompact(activeBucketForBanner.total_settled_amount)} / Trần{' '}
                {formatCompact(activeBucketForBanner.ocf_limit)}
              </span>
            </div>
          </div>
        )}

        {/* KHUNG ĐỒ THỊ WATERFALL (Tách biệt hoàn toàn Vùng Vẽ Plot Area 280px và Vùng Trục X 56px để Đường Trần OCF Khớp Tuyệt Đối 100%) */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 sm:p-5 overflow-x-auto select-none">
          <div className="min-w-[960px]">
            {/* 1. VÙNG VẼ ĐỒ THỊ (PLOT AREA - Chiều cao cố định 280px, 0% = đáy cột, 100% = maxBarValue) */}
            <div className="relative h-[280px] w-full flex items-end justify-between gap-1.5 sm:gap-2.5 border-b-2 border-slate-300">
              {/* Lưới trục Y nét đứt */}
              {[0.25, 0.5, 0.75, 1].map((ratio) => (
                <div
                  key={ratio}
                  style={{ bottom: `${ratio * 100}%` }}
                  className="absolute inset-x-0 border-t border-dashed border-slate-300/70 pointer-events-none flex justify-end pr-1"
                >
                  <span className="text-[9px] text-slate-400 -mt-3.5 bg-slate-50/80 px-1 rounded">
                    {formatCompact(maxBarValue * ratio)}
                  </span>
                </div>
              ))}

              {/* Các Cột Tháng */}
              {simulationResult.monthly_buckets.map((b) => {
                // Tọa độ % chính xác trong vùng Plot Area 280px
                const toPct = (val: number) => Math.max(0, Math.min(100, (val / maxBarValue) * 100));

                const ocfPct = toPct(b.ocf_limit);

                // 4 cấu phần Waterfall:
                const grossNatural = b.natural_due_amount; // (1) Gốc đến hạn hiện tại (ban đầu)
                const netNatural = b.natural_settled_amount; // Gốc hiện tại còn lại thực trả tại tháng
                const grossReDisbursed = b.re_disbursed_due_gross_amount; // (3) Gốc đến hạn đảo nợ mới (trước cắt)
                const netReDisbursed = b.re_disbursed_due_amount; // (3) Gốc đến hạn đảo nợ mới thực trả tại tháng
                const pulledOutEarly = b.pulled_out_early_amount; // (2) (-) Gốc đã đáo nợ sớm (kéo đi)
                const earlyPulledIn = b.early_pulled_in_amount; // (4) (+) Đảo nợ sớm (kéo từ tháng sau về)
                const finalSettled = b.total_settled_amount; // Tổng thực trả = netNatural + netReDisbursed + earlyPulledIn

                const isHovered = hoveredBucket?.month_key === b.month_key;

                // Tọa độ cho chế độ WATERFALL_STACK:
                // - Tầng 1 (0 -> netNatural): Gốc đến hạn hiện tại còn lại (Xanh Indigo)
                // - Tầng 2 (netNatural -> netNatural + netReDisbursed): (+) Gốc đến hạn đảo nợ mới (Xanh Cyan)
                // - Tầng 3 (netNatural + netReDisbursed -> finalSettled): (+) Đảo nợ sớm kéo về (Vàng Cam)
                // - Khối giảm trừ Waterfall (treo phía trên phần nợ tự thân nếu pulledOutEarly > 0):
                //   Hiển thị ngay phía trên cột từ finalSettled lên finalSettled + pulledOutEarly
                const hNetNaturalPct = toPct(netNatural);
                const hNetReDisbursedPct = toPct(netReDisbursed);
                const hEarlyPulledInPct = toPct(earlyPulledIn);
                const hPulledOutPct = toPct(pulledOutEarly);
                const hFinalSettledPct = toPct(finalSettled);

                // Tọa độ cho chế độ WATERFALL_STEPS (4 cột bước nối tiếp nhau trong tháng):
                // Step 1: 0 -> grossNatural (Gốc đến hạn hiện tại)
                const s1Bottom = 0;
                const s1Height = toPct(grossNatural);
                // Step 2: grossNatural -> grossNatural + grossReDisbursed (+ Gốc đến hạn các khoản đảo nợ mới)
                const s2Bottom = toPct(grossNatural);
                const s2Height = toPct(grossReDisbursed);
                // Step 3 (Giảm trừ -): đi xuống từ (grossNatural + grossReDisbursed) xuống (netNatural + netReDisbursed)
                const s3Bottom = toPct(netNatural + netReDisbursed);
                const s3Height = toPct(pulledOutEarly);
                // Step 4 (Tăng thêm +): đi lên từ (netNatural + netReDisbursed) lên finalSettled (+ Đảo nợ sớm)
                const s4Bottom = toPct(netNatural + netReDisbursed);
                const s4Height = toPct(earlyPulledIn);

                return (
                  <div
                    key={b.month_key}
                    onMouseEnter={() => setHoveredBucket(b)}
                    className={`flex-1 min-w-[68px] h-full relative flex items-end justify-center px-0.5 sm:px-1 transition-colors rounded-t-lg ${
                      isHovered ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    {/* ĐƯỜNG TRẦN DÒNG TIỀN HĐKD (OCF CAP LINE - Nằm cùng Plot Area nên khớp 100% với chiều cao cột) */}
                    <div
                      style={{ bottom: `${ocfPct}%` }}
                      className="absolute inset-x-0 border-t-2 border-dashed border-rose-500 z-30 pointer-events-none"
                      title={`Trần OCF ${b.month_label}: ${formatVND(b.ocf_limit)}`}
                    />

                    {chartMode === 'WATERFALL_STACK' ? (
                      <div className="relative w-full max-w-[46px] h-full flex items-end justify-center">
                        {/* Nhãn Tổng Thực Trả trên đỉnh cột thực trả */}
                        <div
                          style={{
                            bottom: `${Math.min(93, hFinalSettledPct + hPulledOutPct + 1)}%`,
                          }}
                          className="absolute inset-x-0 flex flex-col items-center pointer-events-none z-20"
                        >
                          {pulledOutEarly > 0 && (
                            <span
                              className="text-[9px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded leading-tight mb-0.5 whitespace-nowrap shadow-2xs"
                              title={`Đã kéo ${formatVND(pulledOutEarly)} của tháng này về đáo nợ sớm ở các tháng trước`}
                            >
                              &darr; -{formatCompact(pulledOutEarly)}
                            </span>
                          )}
                          <span className="text-[10px] font-extrabold text-slate-800 whitespace-nowrap">
                            {formatCompact(finalSettled)}
                          </span>
                        </div>

                        {/* KHỐI GIẢM TRỪ WATERFALL: (2) (-) Gốc đã đáo nợ sớm (Treo từ đỉnh thực trả lên đỉnh trước cắt) */}
                        {pulledOutEarly > 0 && (
                          <div
                            style={{
                              bottom: `${hFinalSettledPct}%`,
                              height: `${Math.max(2, hPulledOutPct)}%`,
                            }}
                            className="absolute w-full border-2 border-dashed border-rose-500 bg-rose-100/75 flex items-center justify-center z-10 rounded-t-sm"
                            title={`(-) Gốc đã đáo nợ sớm: -${formatVND(pulledOutEarly)} (Đã kéo về các tháng trước)`}
                          >
                            <ArrowDownRight className="w-3 h-3 text-rose-600 opacity-80" />
                          </div>
                        )}

                        {/* CỘT THỰC TRẢ (0 -> finalSettled): Gồm (1) Gốc hiện tại + (3) Gốc đảo nợ mới + (4) Đảo nợ sớm */}
                        <div className="w-full h-full relative flex flex-col justify-end">
                          {/* Tầng 4 (Trên cùng): (+) Đảo nợ sớm (kéo từ tháng sau về) */}
                          {earlyPulledIn > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hEarlyPulledInPct)}%` }}
                              className="w-full bg-amber-500 border-t border-x border-amber-700/40 transition-all hover:brightness-110"
                              title={`(4) (+) Đảo nợ sớm (kéo từ tháng cao điểm phía sau về): +${formatVND(earlyPulledIn)}`}
                            />
                          )}

                          {/* Tầng 3 (Giữa): (+) Gốc đến hạn các khoản đảo nợ mới */}
                          {netReDisbursed > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hNetReDisbursedPct)}%` }}
                              className="w-full bg-cyan-500 border-t border-x border-cyan-700/40 transition-all hover:brightness-110"
                              title={`(3) (+) Gốc đến hạn các khoản đảo nợ mới: +${formatVND(netReDisbursed)}`}
                            />
                          )}

                          {/* Tầng 1 (Đáy): (1) Gốc đến hạn tại thời điểm hiện tại (còn lại) */}
                          {netNatural > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hNetNaturalPct)}%` }}
                              className="w-full bg-indigo-600 border-t border-x border-indigo-900/40 transition-all hover:brightness-110"
                              title={`(1) Gốc đến hạn tại thời điểm hiện tại (giữ tại tháng): ${formatVND(netNatural)}`}
                            />
                          )}
                        </div>
                      </div>
                    ) : chartMode === 'WATERFALL_STEPS' ? (
                      /* CHẾ ĐỘ 2: WATERFALL 4 BƯỚC NỐI TIẾP TRONG TỪNG THÁNG */
                      <div className="relative w-full h-full flex items-end justify-between gap-0.5 px-0.5">
                        {/* Nhãn tổng kết tháng ở trên cùng */}
                        <div
                          style={{
                            bottom: `${Math.min(92, Math.max(s1Height + s2Height, hFinalSettledPct) + 2)}%`,
                          }}
                          className="absolute inset-x-0 text-center text-[9px] font-extrabold text-slate-800 pointer-events-none z-20 whitespace-nowrap"
                        >
                          {formatCompact(finalSettled)}
                        </div>

                        {/* Bước 1: Gốc đến hạn hiện tại (0 -> grossNatural) */}
                        <div className="flex-1 h-full relative">
                          {grossNatural > 0 && (
                            <div
                              style={{ bottom: `${s1Bottom}%`, height: `${Math.max(2, s1Height)}%` }}
                              className="absolute inset-x-0 bg-indigo-600 rounded-t-xs border border-indigo-800/40"
                              title={`Bước 1 - Gốc đến hạn hiện tại: ${formatVND(grossNatural)}`}
                            />
                          )}
                        </div>

                        {/* Bước 2: (+) Gốc đến hạn các khoản đảo nợ mới (grossNatural -> grossNatural + grossReDisbursed) */}
                        <div className="flex-1 h-full relative">
                          {grossReDisbursed > 0 && (
                            <div
                              style={{ bottom: `${s2Bottom}%`, height: `${Math.max(2, s2Height)}%` }}
                              className="absolute inset-x-0 bg-cyan-500 rounded-xs border border-cyan-700/40"
                              title={`Bước 2 - (+) Gốc đến hạn đảo nợ mới: +${formatVND(grossReDisbursed)}`}
                            />
                          )}
                        </div>

                        {/* Bước 3: (-) Gốc đã đáo nợ sớm (Đi xuống từ đỉnh về netOwn) */}
                        <div className="flex-1 h-full relative">
                          {pulledOutEarly > 0 && (
                            <div
                              style={{ bottom: `${s3Bottom}%`, height: `${Math.max(2, s3Height)}%` }}
                              className="absolute inset-x-0 bg-rose-500 border border-rose-700/50 rounded-xs"
                              title={`Bước 3 - (-) Gốc đã đáo nợ sớm (kéo về tháng trước): -${formatVND(pulledOutEarly)}`}
                            />
                          )}
                        </div>

                        {/* Bước 4: (+) Đảo nợ sớm (Đi lên từ netOwn -> finalSettled) */}
                        <div className="flex-1 h-full relative">
                          {earlyPulledIn > 0 && (
                            <div
                              style={{ bottom: `${s4Bottom}%`, height: `${Math.max(2, s4Height)}%` }}
                              className="absolute inset-x-0 bg-amber-500 border border-amber-700/50 rounded-t-xs"
                              title={`Bước 4 - (+) Đảo nợ sớm (kéo từ tháng sau về): +${formatVND(earlyPulledIn)}`}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      /* CHẾ ĐỘ 3: SO SÁNH LỊCH GỐC BAN ĐẦU VS KẾ HOẠCH SAU ĐẢO NỢ */
                      <div className="w-full h-full flex items-end justify-center gap-1">
                        {/* Cột Trái: Lịch gốc hiện tại */}
                        <div
                          style={{ height: `${Math.max(2, toPct(grossNatural))}%` }}
                          className={`w-1/2 max-w-[22px] rounded-t-xs transition-all ${
                            grossNatural > b.ocf_limit ? 'bg-rose-400' : 'bg-slate-300'
                          }`}
                          title={`Gốc đến hạn hiện tại: ${formatVND(grossNatural)}`}
                        />

                        {/* Cột Phải: Kế hoạch sau đảo nợ (3 màu cộng) */}
                        <div className="w-1/2 max-w-[22px] h-full flex flex-col justify-end">
                          {earlyPulledIn > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hEarlyPulledInPct)}%` }}
                              className="w-full bg-amber-500"
                              title={`(+) Đảo nợ sớm: +${formatVND(earlyPulledIn)}`}
                            />
                          )}
                          {netReDisbursed > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hNetReDisbursedPct)}%` }}
                              className="w-full bg-cyan-500"
                              title={`(+) Gốc đến hạn đảo nợ mới: +${formatVND(netReDisbursed)}`}
                            />
                          )}
                          {netNatural > 0 && (
                            <div
                              style={{ height: `${Math.max(1.5, hNetNaturalPct)}%` }}
                              className="w-full bg-indigo-600"
                              title={`Gốc hiện tại còn lại: ${formatVND(netNatural)}`}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 2. VÙNG NHÃN TRỤC X & NÚT CHỈNH TRẦN OCF TỪNG THÁNG (Tách biệt dưới đáy đường 0 ₫) */}
            <div className="w-full flex items-start justify-between gap-1.5 sm:gap-2.5 pt-2">
              {simulationResult.monthly_buckets.map((b) => (
                <div key={b.month_key} className="flex-1 min-w-[68px] text-center">
                  <span className="block text-[11px] font-bold text-slate-800">
                    {b.month_label.replace('Tháng ', 'T')}
                  </span>

                  {/* Sửa nhanh OCF riêng tháng */}
                  {editingOcfMonth === b.month_key ? (
                    <div className="mt-1 flex items-center justify-center gap-0.5">
                      <input
                        type="text"
                        autoFocus
                        value={editingOcfValue}
                        onChange={(e) => setEditingOcfValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveOcfOverride(b.month_key);
                          if (e.key === 'Escape') setEditingOcfMonth(null);
                        }}
                        className="w-14 text-[10px] p-0.5 border border-indigo-500 rounded text-center font-bold bg-white"
                        placeholder="Tỷ VNĐ"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveOcfOverride(b.month_key)}
                        className="bg-emerald-600 text-white p-0.5 rounded text-[10px]"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOcfMonth(b.month_key);
                        setEditingOcfValue((b.ocf_limit / 1_000_000_000).toString());
                      }}
                      className={`block text-[9px] mt-0.5 font-semibold mx-auto px-1 py-0.2 rounded transition-colors ${
                        b.is_ocf_overridden
                          ? 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                          : 'text-rose-600 hover:bg-rose-50'
                      }`}
                      title="Click để sửa trần OCF riêng tháng này (nhập số tỷ hoặc số tiền VNĐ)"
                    >
                      Trần: {formatCompact(b.ocf_limit)}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chú giải 4 Cấu Phần Waterfall Rõ Ràng */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-indigo-600 inline-block rounded-xs shadow-2xs" />
              <span>(1) Gốc đến hạn tại thời điểm hiện tại</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-rose-100 border-2 border-dashed border-rose-500 inline-block rounded-xs" />
              <span className="text-rose-700 font-semibold">(2) (-) Gốc đã đáo nợ sớm (kéo về tháng trước)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-cyan-500 inline-block rounded-xs shadow-2xs" />
              <span className="text-cyan-800 font-semibold">(3) (+) Gốc đến hạn các khoản đảo nợ mới</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 bg-amber-500 inline-block rounded-xs shadow-2xs" />
              <span className="text-amber-800 font-semibold">(4) (+) Đảo nợ sớm (nhận từ tháng sau về)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-rose-500 inline-block" />
              <span>Ngưỡng trần OCF (Dòng tiền HĐKD)</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 italic">
            * Rê chuột vào cột từng tháng để xem chi tiết phương trình Waterfall 4 cấu phần
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KHU VỰC 3: BẢNG KẾ HOẠCH HÀNH ĐỘNG GIẢI NGÂN & ĐẢO NỢ CHI TIẾT TỪNG THÁNG */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Bảng Tổng Hợp Waterfall & Chi Tiết Các Lệnh Đảo Nợ Theo Tháng</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mỗi tháng hiển thị đầy đủ 4 cấu phần Waterfall và danh sách các khế ước tất toán, đảo nợ sớm, hoặc tái đáo hạn.
            </p>
          </div>

          {/* Bộ lọc Ngân hàng & Nút Mở rộng/Thu gọn */}
          <div className="flex items-center gap-2">
            <select
              value={filterBank}
              onChange={(e) => setFilterBank(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 bg-white"
            >
              <option value="ALL">Tất cả ngân hàng</option>
              {simulationResult.unique_banks.map((b) => (
                <option key={b.bank_code} value={b.bank_code}>
                  {b.bank_code} ({b.bank_name})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (expandedMonths.size === simulationResult.monthly_buckets.length) {
                  setExpandedMonths(new Set());
                } else {
                  setExpandedMonths(new Set(simulationResult.monthly_buckets.map((b) => b.month_key)));
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700"
            >
              {expandedMonths.size === simulationResult.monthly_buckets.length ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}
            </button>
          </div>
        </div>

        {/* Danh sách các tháng kế hoạch */}
        <div className="space-y-3">
          {simulationResult.monthly_buckets.map((bucket) => {
            const isExpanded = expandedMonths.has(bucket.month_key);
            const filteredItems = bucket.items.filter((it) => {
              if (filterBank !== 'ALL' && it.bank_code !== filterBank) return false;
              return true;
            });
            const filteredPulledOut = bucket.pulled_out_items.filter((it) => {
              if (filterBank !== 'ALL' && it.bank_code !== filterBank) return false;
              return true;
            });

            return (
              <div
                key={bucket.month_key}
                className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all"
              >
                {/* Header Dòng Tháng với 4 Cấu Phần Waterfall */}
                <div
                  onClick={() => {
                    const next = new Set(expandedMonths);
                    if (next.has(bucket.month_key)) next.delete(bucket.month_key);
                    else next.add(bucket.month_key);
                    setExpandedMonths(next);
                  }}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 select-none"
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-600" />
                    )}
                    <div>
                      <span className="text-sm font-bold text-slate-900">{bucket.month_label}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        ({filteredItems.length} lệnh thực trả
                        {filteredPulledOut.length > 0 ? `, ${filteredPulledOut.length} lệnh đã đáo sớm` : ''})
                      </span>
                    </div>
                  </div>

                  {/* 4 Cấu phần Waterfall ngay trên thanh tiêu đề mỗi tháng */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium">
                    <div className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                      <span>(1) Gốc hiện tại: </span>
                      <strong>{formatCompact(bucket.natural_due_amount)}</strong>
                    </div>
                    {bucket.pulled_out_early_amount > 0 && (
                      <div className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        <span>(2) Đã đáo nợ sớm: </span>
                        <strong>-{formatCompact(bucket.pulled_out_early_amount)}</strong>
                      </div>
                    )}
                    {bucket.re_disbursed_due_amount > 0 && (
                      <div className="px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
                        <span>(3) Đảo nợ mới đến hạn: </span>
                        <strong>+{formatCompact(bucket.re_disbursed_due_amount)}</strong>
                      </div>
                    )}
                    {bucket.early_pulled_in_amount > 0 && (
                      <div className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        <span>(4) Đảo nợ sớm: </span>
                        <strong>+{formatCompact(bucket.early_pulled_in_amount)}</strong>
                      </div>
                    )}
                    <div className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <span>Tổng tất toán: </span>
                      <strong className="font-black">{formatVND(bucket.total_settled_amount)}</strong>
                      <span className="text-slate-500"> / Trần {formatCompact(bucket.ocf_limit)}</span>
                    </div>
                  </div>
                </div>

                {/* Bảng Chi tiết các khoản vay thực thi & đã rút sớm trong tháng này */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                          <th className="px-3.5 py-2.5">Số Khế Ước</th>
                          <th className="px-3 py-2.5">Ngân Hàng</th>
                          <th className="px-3 py-2.5 text-center">Lãi Suất</th>
                          <th className="px-3 py-2.5 text-center">Ngày Giải Ngân</th>
                          <th className="px-3 py-2.5 text-center">Đáo Hạn Gốc</th>
                          <th className="px-3 py-2.5">Phân Loại Waterfall (4 Cấu Phần)</th>
                          <th className="px-3 py-2.5 text-right">Biến Động Tất Toán</th>
                          <th className="px-3 py-2.5 text-right">Số Tiền Giải Ngân Mới</th>
                          <th className="px-3 py-2.5 text-center">Kỳ Hạn Mới</th>
                          <th className="px-3 py-2.5 text-center">Đáo Hạn Chu Kỳ Tới</th>
                          <th className="px-3 py-2.5 text-center">Tùy Chọn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredItems.length === 0 && filteredPulledOut.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-4 text-center text-slate-400 italic">
                              Không có khế ước nào phát sinh nghĩa vụ trong tháng này.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {/* Các dòng thực hiện tất toán & giải ngân lại trong tháng */}
                            {filteredItems.map((it) => (
                              <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-3.5 py-2.5 font-bold text-slate-900 font-mono">
                                  {it.contract_number}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="px-2 py-0.5 bg-slate-100 text-indigo-700 font-bold rounded border border-slate-200">
                                    {it.bank_code}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                                  {it.interest_rate.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-slate-500">
                                  {it.disbursement_date || '-'}
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                                  {it.original_due_date}
                                </td>
                                <td className="px-3 py-2.5">
                                  {it.action_type === 'EARLY_ROLLOVER' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                      <ArrowUpRight className="w-3 h-3 text-amber-600" />
                                      (4) (+) Đảo nợ sớm (Kéo từ {it.source_excess_month})
                                    </span>
                                  ) : it.action_type === 'RE_DISBURSED_MATURITY' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-300">
                                      <Layers className="w-3 h-3 text-cyan-600" />
                                      (3) (+) Gốc đến hạn khoản đảo nợ mới
                                    </span>
                                  ) : it.action_type === 'PERMANENT_PAYOFF' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                      <Ban className="w-3 h-3 text-rose-600" />
                                      Tất toán đứt (Không vay lại)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                      <Check className="w-3 h-3 text-indigo-600" />
                                      (1) Gốc đến hạn tại thời điểm hiện tại
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                                  +{formatVND(it.settlement_amount)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                                  {it.redisbursement_amount > 0 ? formatVND(it.redisbursement_amount) : '-'}
                                </td>
                                <td className="px-3 py-2.5 text-center font-bold text-slate-600">
                                  {it.redisbursement_amount > 0 ? `${it.term_months} tháng` : '-'}
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-slate-800 font-semibold">
                                  {it.redisbursement_amount > 0 ? it.new_maturity_date : '-'}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePayoff(it.contract_number)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                      it.is_permanent_payoff
                                        ? 'bg-rose-600 text-white shadow-2xs'
                                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                                    }`}
                                    title="Đánh dấu dùng OCF trả đứt, không sinh khế ước vay mới tại chu kỳ tiếp theo"
                                  >
                                    {it.is_permanent_payoff ? 'Đang trả đứt' : 'Trả đứt'}
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {/* Các dòng đối chiếu: (2) (-) Gốc của tháng này đã được kéo về đáo nợ sớm ở tháng trước */}
                            {filteredPulledOut.map((it) => (
                              <tr
                                key={`PULLED-OUT-${it.id}`}
                                className="bg-rose-50/40 hover:bg-rose-50/70 transition-colors text-slate-600"
                              >
                                <td className="px-3.5 py-2 font-bold text-rose-800 font-mono">
                                  {it.contract_number}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-0.5 bg-white text-rose-700 font-bold rounded border border-rose-200">
                                    {it.bank_code}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center font-semibold text-rose-700">
                                  {it.interest_rate.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-slate-500">
                                  {it.disbursement_date || '-'}
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-slate-500">
                                  {it.original_due_date}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                    <ArrowDownRight className="w-3 h-3 text-rose-600" />
                                    (2) (-) Gốc đã đáo nợ sớm tại tháng {it.execution_month}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-rose-600">
                                  -{formatVND(it.settlement_amount)}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-400 italic">
                                  Đã giải ngân tại {it.execution_month}
                                </td>
                                <td className="px-3 py-2 text-center text-slate-400">
                                  {it.term_months} tháng
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-slate-500">
                                  {it.new_maturity_date}
                                </td>
                                <td className="px-3 py-2 text-center text-[10px] text-rose-600 font-semibold">
                                  Đã rút sớm
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
