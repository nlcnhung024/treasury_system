import {
  CreditFacility,
  DebtRolloverPlanConfig,
  DebtRolloverSimulationResult,
  MonthlyRolloverBucket,
  RolloverExecutionItem,
  RolloverPriorityField,
  RolloverPriorityRule,
} from '../types/credit';

export interface PriorityFieldDefinition {
  field: RolloverPriorityField;
  label: string;
  category: 'BANK' | 'CONTRACT';
  descLabel: string;
  ascLabel: string;
  defaultDirection: 'ASC' | 'DESC';
  description: string;
}

export const PRIORITY_FIELD_DEFINITIONS: Record<RolloverPriorityField, PriorityFieldDefinition> = {
  bank_total_principal: {
    field: 'bank_total_principal',
    label: 'Tổng dư nợ của Ngân hàng (Toàn danh mục)',
    category: 'BANK',
    descLabel: 'NH dư nợ lớn trước ↓',
    ascLabel: 'NH dư nợ nhỏ trước ↑',
    defaultDirection: 'DESC',
    description: 'Nhóm và ưu tiên xử lý các khế ước thuộc Ngân hàng đang có tổng dư nợ gốc toàn danh mục lớn nhất (hoặc nhỏ nhất) trước.',
  },
  bank_monthly_principal: {
    field: 'bank_monthly_principal',
    label: 'Dư nợ đến hạn trong tháng của Ngân hàng',
    category: 'BANK',
    descLabel: 'NH đến hạn nhiều trong tháng ↓',
    ascLabel: 'NH đến hạn ít trong tháng ↑',
    defaultDirection: 'DESC',
    description: 'Tính tổng gốc đến hạn theo từng Ngân hàng ngay trong tháng bị vượt trần để ưu tiên xử lý ngân hàng gây áp lực lớn nhất tháng đó.',
  },
  bank_custom_order: {
    field: 'bank_custom_order',
    label: 'Thứ tự Ngân hàng chỉ định (Kéo thả NH)',
    category: 'BANK',
    descLabel: 'Đảo ngược thứ tự NH ↓',
    ascLabel: 'Theo thứ tự NH đã xếp ↑',
    defaultDirection: 'ASC',
    description: 'Cho phép kéo thả sắp xếp trực tiếp thứ tự ưu tiên từng Ngân hàng cụ thể (VD: MBB -> TPB -> VPB -> EVF).',
  },
  interest_rate: {
    field: 'interest_rate',
    label: 'Lãi suất vay (%)',
    category: 'CONTRACT',
    descLabel: 'Lãi suất cao trước ↓',
    ascLabel: 'Lãi suất thấp trước ↑',
    defaultDirection: 'DESC',
    description: 'Ưu tiên đảo nợ sớm các khoản có lãi suất cao để giảm chi phí tài chính (hoặc ngược lại).',
  },
  disbursement_date: {
    field: 'disbursement_date',
    label: 'Ngày giải ngân',
    category: 'CONTRACT',
    descLabel: 'Giải ngân mới trước ↓',
    ascLabel: 'Giải ngân cũ trước ↑',
    defaultDirection: 'ASC',
    description: 'Ưu tiên xử lý các khế ước đã giải ngân lâu ngày trước (FIFO) hoặc mới giải ngân trước (LIFO).',
  },
  principal: {
    field: 'principal',
    label: 'Dư nợ gốc đến hạn',
    category: 'CONTRACT',
    descLabel: 'Gốc lớn trước ↓',
    ascLabel: 'Gốc nhỏ trước ↑',
    defaultDirection: 'DESC',
    description: 'Ưu tiên cắt các món vay có số dư gốc đến hạn lớn để giải phóng nhanh áp lực trần OCF với ít lệnh giao dịch nhất.',
  },
  maturity_date: {
    field: 'maturity_date',
    label: 'Ngày đáo hạn',
    category: 'CONTRACT',
    descLabel: 'Đáo hạn muộn trước ↓',
    ascLabel: 'Đáo hạn sớm trước ↑',
    defaultDirection: 'ASC',
    description: 'Trong cùng một tháng, ưu tiên khế ước có ngày đáo hạn rơi vào đầu tháng trước.',
  },
  term_months: {
    field: 'term_months',
    label: 'Kỳ hạn giải ngân (Tháng)',
    category: 'CONTRACT',
    descLabel: 'Kỳ hạn dài trước ↓',
    ascLabel: 'Kỳ hạn ngắn trước ↑',
    defaultDirection: 'DESC',
    description: 'Ưu tiên các khoản vay có kỳ hạn tái giải ngân dài hơn để đẩy chu kỳ đáo hạn kế tiếp ra xa hơn.',
  },
  original_principal: {
    field: 'original_principal',
    label: 'Số tiền giải ngân ban đầu',
    category: 'CONTRACT',
    descLabel: 'Hạn mức gốc lớn trước ↓',
    ascLabel: 'Hạn mức gốc nhỏ trước ↑',
    defaultDirection: 'DESC',
    description: 'So sánh theo quy mô giải ngân ban đầu trên khế ước (principal_amount).',
  },
  calculated_interest: {
    field: 'calculated_interest',
    label: 'Tiền lãi dự kiến kỳ này',
    category: 'CONTRACT',
    descLabel: 'Tiền lãi lớn trước ↓',
    ascLabel: 'Tiền lãi nhỏ trước ↑',
    defaultDirection: 'DESC',
    description: 'Ưu tiên theo số tiền lãi phát sinh thực tế của khế ước.',
  },
  interest_payment_method: {
    field: 'interest_payment_method',
    label: 'Phương thức trả lãi',
    category: 'CONTRACT',
    descLabel: 'Trả lãi định kỳ hằng tháng trước ↓',
    ascLabel: 'Trả lãi cuối kỳ trước ↑',
    defaultDirection: 'DESC',
    description: 'Phân loại ưu tiên giữa khế ước trả lãi hàng tháng và trả lãi cuối kỳ.',
  },
  loan_source: {
    field: 'loan_source',
    label: 'Nguồn gốc khoản vay (Tự nhiên vs Đảo mới)',
    category: 'CONTRACT',
    descLabel: 'Khế ước gốc tự nhiên trước ↓',
    ascLabel: 'Khoản đảo nợ mới trước ↑',
    defaultDirection: 'DESC',
    description: 'Ưu tiên xử lý các khế ước gốc ban đầu trước khi động đến các khoản vừa mới tái giải ngân.',
  },
};

export const DEFAULT_PRIORITY_RULES: RolloverPriorityRule[] = [
  { field: 'interest_rate', direction: 'DESC', enabled: true },
  { field: 'disbursement_date', direction: 'ASC', enabled: true },
  { field: 'principal', direction: 'DESC', enabled: true },
  { field: 'maturity_date', direction: 'ASC', enabled: true },
];

/**
 * Trợ giúp tạo danh sách tháng liên tiếp từ ngày hiện tại hoặc tháng chỉ định
 */
export function generateMonthKeys(startMonthKey: string, count: number): string[] {
  const [yyyyStr, mmStr] = startMonthKey.split('-');
  let y = parseInt(yyyyStr, 10);
  let m = parseInt(mmStr, 10); // 1-12
  const res: string[] = [];

  for (let i = 0; i < count; i++) {
    const mmFormatted = String(m).padStart(2, '0');
    res.push(`${y}-${mmFormatted}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return res;
}

/**
 * Cộng thêm n tháng vào month_key (YYYY-MM)
 */
export function addMonthsToKey(monthKey: string, monthsToAdd: number): string {
  const [yyyyStr, mmStr] = monthKey.split('-');
  let y = parseInt(yyyyStr, 10);
  let m = parseInt(mmStr, 10) + monthsToAdd;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Suy ra kỳ hạn giải ngân (số tháng) từ khế ước hoặc cấu hình ngân hàng
 */
export function determineLoanTerm(
  loan: CreditFacility,
  bankTermOverrides: Record<string, number>,
  defaultTerm: number = 6
): number {
  const bankCode = (loan.bank_code || 'OTHER').toUpperCase().trim();
  if (bankTermOverrides[bankCode] && bankTermOverrides[bankCode] > 0) {
    return Math.round(bankTermOverrides[bankCode]);
  }

  // Phân tích từ trường term (ví dụ: '6 tháng', '180 ngày')
  if (loan.term) {
    const matchMonth = loan.term.match(/(\d+)\s*(tháng|thang|m)/i);
    if (matchMonth) {
      const val = parseInt(matchMonth[1], 10);
      if (val > 0) return val;
    }
    const matchDay = loan.term.match(/(\d+)\s*(ngày|ngay|d)/i);
    if (matchDay) {
      const days = parseInt(matchDay[1], 10);
      if (days > 0) return Math.max(1, Math.round(days / 30));
    }
  }

  // Tính từ disbursement_date và maturity_date
  if (loan.disbursement_date && loan.maturity_date) {
    const d1 = new Date(loan.disbursement_date);
    const d2 = new Date(loan.maturity_date);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const diffMonths = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
      if (diffMonths > 0) return diffMonths;
    }
  }

  return defaultTerm || 6;
}

/**
 * Tính ngày đáo hạn mới dạng YYYY-MM-DD
 */
export function calculateNewMaturityDate(
  executionMonthKey: string,
  termMonths: number,
  originalDueDate?: string
): string {
  const newMonthKey = addMonthsToKey(executionMonthKey, termMonths);
  const [yyyyStr, mmStr] = newMonthKey.split('-');
  const y = parseInt(yyyyStr, 10);
  const m = parseInt(mmStr, 10);

  let targetDay = 28;
  if (originalDueDate) {
    const d = new Date(originalDueDate);
    if (!isNaN(d.getTime())) {
      targetDay = d.getDate();
    }
  }

  // Lấy ngày cuối cùng của tháng mới
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const day = Math.min(targetDay, lastDayOfMonth);

  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * ĐỘNG CƠ THUẬT TOÁN CÂN ĐỐI & ĐẢO NỢ HẰNG THÁNG ĐA CHU KỲ (WATERFALL SIMULATION ENGINE)
 * Phân rã chính xác 4 cấu phần Waterfall mỗi tháng:
 * 1. Gốc đến hạn tại thời điểm hiện tại (natural_due_amount)
 * 2. (-) Gốc đã đáo nợ sớm (pulled_out_early_amount - phần nợ của tháng này đã kéo về tháng trước)
 * 3. (+) Gốc đến hạn các khoản đảo nợ mới (re_disbursed_due_amount - từ các khoản đảo nợ chu kỳ trước)
 * 4. (+) Đảo nợ sớm (early_pulled_in_amount - nhận nợ từ các tháng cao điểm phía sau kéo về)
 */
export function simulateDebtRolloverPlan(
  loans: CreditFacility[],
  config: DebtRolloverPlanConfig,
  startMonthKeyOverride?: string
): DebtRolloverSimulationResult {
  const horizon = config.horizon_months || 12;
  const defaultOcf = Number(config.default_monthly_ocf) || 10_000_000_000;
  const ocfOverrides = config.monthly_ocf_overrides || {};
  const bankTermOverrides = config.bank_term_overrides || {};
  const payoffContracts = new Set<string>(config.payoff_contract_numbers || []);
  const _lockedActions = config.locked_rollover_actions || [];
  void _lockedActions;

  // Lọc các khoản vay còn dư nợ gốc
  const activeLoans = loans.filter((l) => {
    const curBal = Number(l.current_principal_balance) || 0;
    const nextP = Number(l.next_principal_amount) || 0;
    return (curBal > 0 || nextP > 0) && l.status !== 'SETTLED';
  });

  // Tìm tháng bắt đầu
  let earliestMonthKey = '';
  const now = new Date();
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');
  const thisMonthKey = `${curY}-${curM}`;

  if (startMonthKeyOverride) {
    earliestMonthKey = startMonthKeyOverride;
  } else {
    earliestMonthKey = thisMonthKey;
    for (const l of activeLoans) {
      const dateStr =
        l.next_principal_amount > 0 && l.next_repayment_date
          ? l.next_repayment_date
          : l.maturity_date || l.next_repayment_date;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mk < earliestMonthKey && mk >= thisMonthKey) {
            earliestMonthKey = mk;
          }
        }
      }
    }
  }

  const monthKeys = generateMonthKeys(earliestMonthKey, horizon);

  interface InternalLoanSchedule {
    loan: CreditFacility;
    base_contract_number: string;
    contract_number: string;
    original_month: string;
    original_due_date: string;
    principal: number;
    interest_rate: number;
    term: number;
    bank_code: string;
    bank_name: string;
    borrower_name: string;
    is_re_disbursed?: boolean;
  }

  const priorityRules: RolloverPriorityRule[] =
    config.priority_rules && config.priority_rules.length > 0
      ? config.priority_rules
      : DEFAULT_PRIORITY_RULES;
  const customBankOrder: string[] = config.custom_bank_order || [];

  const monthSchedules: Record<string, InternalLoanSchedule[]> = {};
  const bucketOcfLimits: Record<string, number> = {};

  for (const mk of monthKeys) {
    monthSchedules[mk] = [];
    bucketOcfLimits[mk] = ocfOverrides[mk] !== undefined ? Number(ocfOverrides[mk]) : defaultOcf;
  }

  // Phân bổ nợ gốc tự nhiên vào các tháng ban đầu
  let totalActivePrincipal = 0;
  const uniqueBanksMap = new Map<string, string>();
  const bankTotalPrincipalMap: Record<string, number> = {};
  const bankLoansCountMap: Record<string, number> = {};

  for (const l of activeLoans) {
    const nextP = Number(l.next_principal_amount) || 0;
    const curBal = Number(l.current_principal_balance) || 0;
    const principalDue = nextP > 0 ? nextP : curBal;
    if (principalDue <= 0) continue;

    totalActivePrincipal += principalDue;
    const bankCode = (l.bank_code || 'OTHER').toUpperCase().trim();
    const bankName = l.bank_name || l.bank_code || 'Ngân hàng';
    uniqueBanksMap.set(bankCode, bankName);
    bankTotalPrincipalMap[bankCode] = (bankTotalPrincipalMap[bankCode] || 0) + principalDue;
    bankLoansCountMap[bankCode] = (bankLoansCountMap[bankCode] || 0) + 1;

    const dateStr =
      nextP > 0 && l.next_repayment_date
        ? l.next_repayment_date
        : l.maturity_date || l.next_repayment_date;
    let originalMonth = monthKeys[0];
    let originalDueDate = `${monthKeys[0]}-28`;

    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        originalMonth = mk;
        originalDueDate = dateStr.substring(0, 10);
      }
    }

    // Nếu ngày đến hạn quá khứ -> gom vào tháng đầu tiên trong kế hoạch
    if (originalMonth < monthKeys[0]) {
      originalMonth = monthKeys[0];
    }

    if (!monthSchedules[originalMonth]) {
      monthSchedules[originalMonth] = [];
    }

    const term = determineLoanTerm(l, bankTermOverrides, config.default_rollover_term_months || 6);

    monthSchedules[originalMonth].push({
      loan: l,
      base_contract_number: l.contract_number,
      contract_number: l.contract_number,
      original_month: originalMonth,
      original_due_date: originalDueDate,
      principal: principalDue,
      interest_rate: Number(l.interest_rate) || 0,
      term,
      bank_code: bankCode,
      bank_name: bankName,
      borrower_name: l.borrower_name || 'Doanh nghiệp',
      is_re_disbursed: false,
    });
  }

  /**
   * Hàm so sánh đa tầng dựa trên Priority Stack
   */
  const compareSchedulesByPriority = (
    a: InternalLoanSchedule,
    b: InternalLoanSchedule,
    bankMonthlyPrincipalMap: Record<string, number>
  ): number => {
    const activeRules = priorityRules.filter((r) => r.enabled);
    for (const rule of activeRules) {
      const mul = rule.direction === 'ASC' ? 1 : -1;
      let diff = 0;

      switch (rule.field) {
        case 'bank_total_principal': {
          const valA = bankTotalPrincipalMap[a.bank_code] || 0;
          const valB = bankTotalPrincipalMap[b.bank_code] || 0;
          diff = (valA - valB) * mul;
          break;
        }
        case 'bank_monthly_principal': {
          const valA = bankMonthlyPrincipalMap[a.bank_code] || 0;
          const valB = bankMonthlyPrincipalMap[b.bank_code] || 0;
          diff = (valA - valB) * mul;
          break;
        }
        case 'bank_custom_order': {
          const idxA = customBankOrder.indexOf(a.bank_code);
          const idxB = customBankOrder.indexOf(b.bank_code);
          const rankA = idxA >= 0 ? idxA : 9999;
          const rankB = idxB >= 0 ? idxB : 9999;
          diff = (rankA - rankB) * mul;
          break;
        }
        case 'interest_rate': {
          diff = (a.interest_rate - b.interest_rate) * mul;
          break;
        }
        case 'disbursement_date': {
          const dA = a.loan.disbursement_date || '9999-12-31';
          const dB = b.loan.disbursement_date || '9999-12-31';
          diff = dA.localeCompare(dB) * mul;
          break;
        }
        case 'principal': {
          diff = (a.principal - b.principal) * mul;
          break;
        }
        case 'maturity_date': {
          const mA = a.original_due_date || '9999-12-31';
          const mB = b.original_due_date || '9999-12-31';
          diff = mA.localeCompare(mB) * mul;
          break;
        }
        case 'term_months': {
          diff = (a.term - b.term) * mul;
          break;
        }
        case 'original_principal': {
          const opA = Number(a.loan.original_principal_balance) || a.principal;
          const opB = Number(b.loan.original_principal_balance) || b.principal;
          diff = (opA - opB) * mul;
          break;
        }
        case 'calculated_interest': {
          const ciA = Number(a.loan.calculated_interest_due) || Number(a.loan.accrued_interest) || 0;
          const ciB = Number(b.loan.calculated_interest_due) || Number(b.loan.accrued_interest) || 0;
          diff = (ciA - ciB) * mul;
          break;
        }
        case 'interest_payment_method': {
          const rankMethod = (m?: string | null) => {
            if (!m) return 0;
            const upper = m.toUpperCase();
            if (upper.includes('THÁNG') || upper.includes('THANG') || upper.includes('MONTHLY')) return 2;
            return 1;
          };
          diff = (rankMethod(a.loan.interest_payment_method) - rankMethod(b.loan.interest_payment_method)) * mul;
          break;
        }
        case 'loan_source': {
          const srcA = a.is_re_disbursed ? 0 : 1;
          const srcB = b.is_re_disbursed ? 0 : 1;
          diff = (srcA - srcB) * mul;
          break;
        }
      }

      if (Math.abs(diff) > 1e-6) {
        return diff;
      }
    }
    return a.contract_number.localeCompare(b.contract_number);
  };

  // Tính số tháng vượt trần ban đầu (Initial Overload trên lịch hiện tại)
  let initialOverloadCount = 0;
  for (const mk of monthKeys) {
    const totalDue = (monthSchedules[mk] || []).reduce((s, it) => s + it.principal, 0);
    const limit = bucketOcfLimits[mk] || defaultOcf;
    if (totalDue > limit) {
      initialOverloadCount++;
    }
  }

  // Khởi tạo cấu trúc lưu trữ kết quả từng tháng
  const executedBuckets: Record<
    string,
    {
      natural_due_amount: number;
      natural_settled_amount: number;
      pulled_out_early_amount: number;
      natural_pulled_out_amount: number;
      redisbursed_pulled_out_amount: number;
      re_disbursed_due_gross_amount: number;
      re_disbursed_due_amount: number;
      early_pulled_in_amount: number;
      initial_excess_amount: number;
      total_settled_amount: number;
      total_redisbursed_amount: number;
      remaining_ocf: number;
      shortfall_amount: number;
      items: RolloverExecutionItem[];
      pulled_out_items: RolloverExecutionItem[];
    }
  > = {};

  for (const mk of monthKeys) {
    const naturalDue = (monthSchedules[mk] || []).reduce((s, it) => s + it.principal, 0);
    const limit = bucketOcfLimits[mk] || defaultOcf;
    executedBuckets[mk] = {
      natural_due_amount: naturalDue,
      natural_settled_amount: 0,
      pulled_out_early_amount: 0,
      natural_pulled_out_amount: 0,
      redisbursed_pulled_out_amount: 0,
      re_disbursed_due_gross_amount: 0,
      re_disbursed_due_amount: 0,
      early_pulled_in_amount: 0,
      initial_excess_amount: Math.max(0, naturalDue - limit),
      total_settled_amount: 0,
      total_redisbursed_amount: 0,
      remaining_ocf: limit,
      shortfall_amount: 0,
      items: [],
      pulled_out_items: [],
    };
  }

  let totalEarlyRolloverVolume = 0;
  let totalLiquidityShortfall = 0;

  // TIẾN TRÌNH QUÉT ĐA CHU KỲ QUA TỪNG THÁNG T = 0 .. H-1
  for (let tIdx = 0; tIdx < monthKeys.length; tIdx++) {
    const targetMonth = monthKeys[tIdx];
    const targetLimit = bucketOcfLimits[targetMonth] || defaultOcf;
    const currentScheduledList = monthSchedules[targetMonth] || [];
    const targetBucket = executedBuckets[targetMonth];

    // Tính tổng gốc đến hạn theo từng ngân hàng ngay trong tháng targetMonth (phục vụ tiêu chí bank_monthly_principal)
    const bankMonthlyPrincipalMap: Record<string, number> = {};
    for (const it of currentScheduledList) {
      bankMonthlyPrincipalMap[it.bank_code] = (bankMonthlyPrincipalMap[it.bank_code] || 0) + it.principal;
    }

    // Sắp xếp danh sách khế ước trong tháng theo Priority Stack người dùng cấu hình
    currentScheduledList.sort((a, b) => compareSchedulesByPriority(a, b, bankMonthlyPrincipalMap));

    // Tính tổng gốc tái đáo hạn phát sinh tại tháng này (Gross trước khi cắt)
    targetBucket.re_disbursed_due_gross_amount = currentScheduledList
      .filter((it) => it.is_re_disbursed)
      .reduce((s, it) => s + it.principal, 0);

    // Tổng nợ đến hạn (Gốc hiện tại + Gốc đảo nợ mới đến hạn) tại tháng targetMonth
    let scheduledDue = currentScheduledList.reduce((s, it) => s + it.principal, 0);

    // Kiểm tra xem tháng này có bị vượt trần OCF không?
    if (scheduledDue > targetLimit) {
      let excess = scheduledDue - targetLimit;

      // Duyệt từng khoản vay cần cắt giảm tại targetMonth (đã được sort theo Priority Stack)
      for (let i = 0; i < currentScheduledList.length && excess > 0; i++) {
        const item = currentScheduledList[i];
        if (item.principal <= 0) continue;

        const isPayoff = payoffContracts.has(item.base_contract_number) || payoffContracts.has(item.contract_number);

        // BƯỚC A: Ưu tiên kéo về các tháng mIdx < tIdx sao cho kỳ đáo hạn mới (mIdx + item.term) > tIdx
        // (hoặc nếu là khoản trả đứt không vay lại thì mIdx bắt đầu ngay từ 0).
        // Nhờ đó khoản giải ngân mới sẽ rơi vào tháng sau targetMonth, không bị dội ngược lại chính targetMonth!
        const minDirectMonthIdx = isPayoff ? 0 : Math.max(0, tIdx - item.term + 1);

        for (let mIdx = minDirectMonthIdx; mIdx < tIdx && excess > 0 && item.principal > 0; mIdx++) {
          const pullMonth = monthKeys[mIdx];
          const pullBucket = executedBuckets[pullMonth];
          if (pullBucket.remaining_ocf <= 0) continue;

          const sliceAmount = Math.min(excess, pullBucket.remaining_ocf, item.principal);
          if (sliceAmount <= 0) continue;

          // 1. Giảm trừ tại tháng gốc (targetMonth) -> Cấu phần (2): (-) Gốc đã đáo nợ sớm
          item.principal -= sliceAmount;
          excess -= sliceAmount;
          scheduledDue -= sliceAmount;

          targetBucket.pulled_out_early_amount += sliceAmount;
          if (item.is_re_disbursed) {
            targetBucket.redisbursed_pulled_out_amount += sliceAmount;
          } else {
            targetBucket.natural_pulled_out_amount += sliceAmount;
          }

          // 2. Cộng thêm tại tháng nhận (pullMonth) -> Cấu phần (4): (+) Đảo nợ sớm
          pullBucket.early_pulled_in_amount += sliceAmount;
          pullBucket.total_settled_amount += sliceAmount;
          pullBucket.remaining_ocf -= sliceAmount;
          totalEarlyRolloverVolume += sliceAmount;

          const redisburseAmount = isPayoff ? 0 : sliceAmount;
          pullBucket.total_redisbursed_amount += redisburseAmount;

          const newMaturityDate = calculateNewMaturityDate(pullMonth, item.term, item.original_due_date);
          const newMaturityMonth = addMonthsToKey(pullMonth, item.term);

          const actionItem: RolloverExecutionItem = {
            id: `EARLY-${item.contract_number}-${pullMonth}-${tIdx}-${i}-${mIdx}`,
            loan_id: item.loan.loan_id,
            contract_number: item.contract_number,
            bank_code: item.bank_code,
            bank_name: item.bank_name,
            borrower_name: item.borrower_name,
            interest_rate: item.interest_rate,
            disbursement_date: item.loan.disbursement_date || undefined,
            original_due_date: item.original_due_date,
            original_month: targetMonth,
            execution_month: pullMonth,
            settlement_amount: sliceAmount,
            redisbursement_amount: redisburseAmount,
            term_months: item.term,
            new_maturity_date: newMaturityDate,
            new_maturity_month: newMaturityMonth,
            action_type: 'EARLY_ROLLOVER',
            is_partial: sliceAmount < Number(item.loan.current_principal_balance || 0),
            is_locked: false,
            is_permanent_payoff: isPayoff,
            source_excess_month: targetMonth,
          };

          pullBucket.items.push(actionItem);
          targetBucket.pulled_out_items.push(actionItem);

          // 3. Nếu giải ngân lại -> Đẩy vào giỏ nợ đến hạn của tháng tương lai (newMaturityMonth > targetMonth)
          if (redisburseAmount > 0 && monthSchedules[newMaturityMonth]) {
            monthSchedules[newMaturityMonth].push({
              loan: item.loan,
              base_contract_number: item.base_contract_number,
              contract_number: item.base_contract_number.includes('(Đảo mới)')
                ? item.base_contract_number
                : `${item.base_contract_number} (Đảo mới)`,
              original_month: newMaturityMonth,
              original_due_date: newMaturityDate,
              principal: redisburseAmount,
              interest_rate: item.interest_rate,
              term: item.term,
              bank_code: item.bank_code,
              bank_name: item.bank_name,
              borrower_name: item.borrower_name,
              is_re_disbursed: true,
            });
          }
        }

        // BƯỚC B (Chuỗi đảo nợ bắc cầu Multi-hop): Nếu các tháng trong [tIdx - term + 1 .. tIdx - 1] đã đầy
        // mà các tháng xa hơn về trước (m0 < minDirectMonthIdx) VÀ các điểm dừng trung gian đều còn dư OCF:
        if (!isPayoff && excess > 0 && item.principal > 0 && minDirectMonthIdx > 0) {
          for (let m0 = 0; m0 < minDirectMonthIdx && excess > 0 && item.principal > 0; m0++) {
            // Xây dựng chuỗi các tháng trung gian m0 -> m0 + term -> ... cho đến khi > tIdx
            const chainIdxs: number[] = [];
            let curHop = m0;
            let chainValid = true;
            while (curHop <= tIdx) {
              if (curHop === tIdx) {
                // Nếu chuỗi rơi đúng vào lại tIdx thì không giảm được nợ tại tIdx
                chainValid = false;
                break;
              }
              const hopBucket = executedBuckets[monthKeys[curHop]];
              if (!hopBucket || hopBucket.remaining_ocf <= 0) {
                chainValid = false;
                break;
              }
              chainIdxs.push(curHop);
              curHop += item.term;
            }

            if (!chainValid || chainIdxs.length === 0) continue;

            const minChainOcf = Math.min(...chainIdxs.map((idx) => executedBuckets[monthKeys[idx]].remaining_ocf));
            const sliceAmount = Math.min(excess, minChainOcf, item.principal);
            if (sliceAmount <= 0) continue;

            // Giảm trừ tại targetMonth
            item.principal -= sliceAmount;
            excess -= sliceAmount;
            scheduledDue -= sliceAmount;

            targetBucket.pulled_out_early_amount += sliceAmount;
            if (item.is_re_disbursed) {
              targetBucket.redisbursed_pulled_out_amount += sliceAmount;
            } else {
              targetBucket.natural_pulled_out_amount += sliceAmount;
            }

            // Thực thi qua từng mắt xích trong chuỗi m0 -> m1 -> ... -> curHop (> tIdx)
            for (let c = 0; c < chainIdxs.length; c++) {
              const hopIdx = chainIdxs[c];
              const hopMonth = monthKeys[hopIdx];
              const hopBucket = executedBuckets[hopMonth];
              const nextHopMonth = addMonthsToKey(hopMonth, item.term);
              const nextHopDate = calculateNewMaturityDate(hopMonth, item.term, item.original_due_date);

              if (c === 0) {
                hopBucket.early_pulled_in_amount += sliceAmount;
                totalEarlyRolloverVolume += sliceAmount;
              } else {
                hopBucket.re_disbursed_due_gross_amount += sliceAmount;
                hopBucket.re_disbursed_due_amount += sliceAmount;
              }

              hopBucket.total_settled_amount += sliceAmount;
              hopBucket.remaining_ocf -= sliceAmount;
              hopBucket.total_redisbursed_amount += sliceAmount;

              const hopAction: RolloverExecutionItem = {
                id: `CHAIN-${item.contract_number}-${hopMonth}-${tIdx}-${i}-${c}`,
                loan_id: item.loan.loan_id,
                contract_number: c === 0 ? item.contract_number : `${item.base_contract_number} (Đảo mới)`,
                bank_code: item.bank_code,
                bank_name: item.bank_name,
                borrower_name: item.borrower_name,
                interest_rate: item.interest_rate,
                disbursement_date: item.loan.disbursement_date || undefined,
                original_due_date: item.original_due_date,
                original_month: c === 0 ? targetMonth : hopMonth,
                execution_month: hopMonth,
                settlement_amount: sliceAmount,
                redisbursement_amount: sliceAmount,
                term_months: item.term,
                new_maturity_date: nextHopDate,
                new_maturity_month: nextHopMonth,
                action_type: c === 0 ? 'EARLY_ROLLOVER' : 'RE_DISBURSED_MATURITY',
                is_partial: true,
                is_locked: false,
                is_permanent_payoff: false,
                source_excess_month: c === 0 ? targetMonth : undefined,
              };
              hopBucket.items.push(hopAction);
              if (c === 0) {
                targetBucket.pulled_out_items.push(hopAction);
              }
            }

            // Đẩy kỳ đáo hạn cuối cùng (curHop > tIdx) vào monthSchedules
            const finalMonthKey = monthKeys[curHop];
            if (finalMonthKey && monthSchedules[finalMonthKey]) {
              const lastHopMonth = monthKeys[chainIdxs[chainIdxs.length - 1]];
              const finalDueDate = calculateNewMaturityDate(lastHopMonth, item.term, item.original_due_date);
              monthSchedules[finalMonthKey].push({
                loan: item.loan,
                base_contract_number: item.base_contract_number,
                contract_number: `${item.base_contract_number} (Đảo mới)`,
                original_month: finalMonthKey,
                original_due_date: finalDueDate,
                principal: sliceAmount,
                interest_rate: item.interest_rate,
                term: item.term,
                bank_code: item.bank_code,
                bank_name: item.bank_name,
                borrower_name: item.borrower_name,
                is_re_disbursed: true,
              });
            }
          }
        }
      }

      // Nếu đã vét cạn tất cả khả năng kéo nợ mà vẫn còn phần vượt trần
      if (excess > 0) {
        targetBucket.shortfall_amount = excess;
        totalLiquidityShortfall += excess;
      }
    }

    // Xử lý phần nợ còn lại đáo hạn đúng kỳ trong tháng targetMonth
    for (const item of currentScheduledList) {
      if (item.principal <= 0) continue;

      const settleAmt = item.principal;
      const isPayoff = payoffContracts.has(item.base_contract_number) || payoffContracts.has(item.contract_number);
      const redisburseAmt = isPayoff ? 0 : settleAmt;

      // Tách bạch rõ Cấu phần (1) Gốc hiện tại còn lại vs Cấu phần (3) Gốc đến hạn các khoản đảo nợ mới
      if (item.is_re_disbursed) {
        targetBucket.re_disbursed_due_amount += settleAmt;
      } else {
        targetBucket.natural_settled_amount += settleAmt;
      }

      targetBucket.total_settled_amount += settleAmt;
      targetBucket.remaining_ocf = Math.max(0, targetBucket.remaining_ocf - settleAmt);
      targetBucket.total_redisbursed_amount += redisburseAmt;

      const newMaturityDate = calculateNewMaturityDate(targetMonth, item.term, item.original_due_date);
      const newMaturityMonth = addMonthsToKey(targetMonth, item.term);

      const actionItem: RolloverExecutionItem = {
        id: `STD-${item.contract_number}-${targetMonth}-${Math.random()}`,
        loan_id: item.loan.loan_id,
        contract_number: item.contract_number,
        bank_code: item.bank_code,
        bank_name: item.bank_name,
        borrower_name: item.borrower_name,
        interest_rate: item.interest_rate,
        disbursement_date: item.loan.disbursement_date || undefined,
        original_due_date: item.original_due_date,
        original_month: targetMonth,
        execution_month: targetMonth,
        settlement_amount: settleAmt,
        redisbursement_amount: redisburseAmt,
        term_months: item.term,
        new_maturity_date: newMaturityDate,
        new_maturity_month: newMaturityMonth,
        action_type: item.is_re_disbursed
          ? 'RE_DISBURSED_MATURITY'
          : isPayoff
          ? 'PERMANENT_PAYOFF'
          : 'NATURAL_REPAYMENT',
        is_partial: false,
        is_locked: false,
        is_permanent_payoff: isPayoff,
      };
      targetBucket.items.push(actionItem);

      // Khoản giải ngân mới của tháng targetMonth sẽ đáo hạn ở chu kỳ tiếp theo (newMaturityMonth)
      if (redisburseAmt > 0 && monthSchedules[newMaturityMonth]) {
        monthSchedules[newMaturityMonth].push({
          loan: item.loan,
          base_contract_number: item.base_contract_number,
          contract_number: item.base_contract_number.includes('(Đảo mới)')
            ? item.base_contract_number
            : `${item.base_contract_number} (Đảo mới)`,
          original_month: newMaturityMonth,
          original_due_date: newMaturityDate,
          principal: redisburseAmt,
          interest_rate: item.interest_rate,
          term: item.term,
          bank_code: item.bank_code,
          bank_name: item.bank_name,
          borrower_name: item.borrower_name,
          is_re_disbursed: true,
        });
      }
    }
  }

  // Tổng hợp danh sách MonthlyRolloverBucket trả về
  let finalOverloadMonthsCount = 0;
  const resultBuckets: MonthlyRolloverBucket[] = monthKeys.map((mk) => {
    const eb = executedBuckets[mk];
    const [y, m] = mk.split('-');
    const label = `Tháng ${m}/${y}`;
    const limit = bucketOcfLimits[mk] || defaultOcf;

    if (eb.total_settled_amount > limit + 1 || eb.shortfall_amount > 1) {
      finalOverloadMonthsCount++;
    }

    return {
      month_key: mk,
      month_label: label,
      ocf_limit: limit,
      is_ocf_overridden: ocfOverrides[mk] !== undefined,
      natural_due_amount: eb.natural_due_amount,
      natural_settled_amount: eb.natural_settled_amount,
      pulled_out_early_amount: eb.pulled_out_early_amount,
      natural_pulled_out_amount: eb.natural_pulled_out_amount,
      redisbursed_pulled_out_amount: eb.redisbursed_pulled_out_amount,
      re_disbursed_due_gross_amount: eb.re_disbursed_due_gross_amount,
      re_disbursed_due_amount: eb.re_disbursed_due_amount,
      early_pulled_in_amount: eb.early_pulled_in_amount,
      initial_excess_amount: eb.initial_excess_amount,
      total_settled_amount: eb.total_settled_amount,
      total_redisbursed_amount: eb.total_redisbursed_amount,
      remaining_ocf: eb.remaining_ocf,
      shortfall_amount: eb.shortfall_amount,
      items: eb.items,
      pulled_out_items: eb.pulled_out_items,
    };
  });

  const uniqueBanks = Array.from(uniqueBanksMap.entries())
    .map(([bank_code, bank_name]) => ({
      bank_code,
      bank_name,
      total_principal: bankTotalPrincipalMap[bank_code] || 0,
      loans_count: bankLoansCountMap[bank_code] || 0,
    }))
    .sort((a, b) => b.total_principal - a.total_principal);

  return {
    horizon_months: horizon,
    total_active_principal: totalActivePrincipal,
    initial_overload_months_count: initialOverloadCount,
    final_overload_months_count: finalOverloadMonthsCount,
    total_early_rollover_volume: totalEarlyRolloverVolume,
    total_liquidity_shortfall: totalLiquidityShortfall,
    is_fully_feasible: totalLiquidityShortfall <= 1 && finalOverloadMonthsCount === 0,
    monthly_buckets: resultBuckets,
    unique_banks: uniqueBanks,
  };
}
