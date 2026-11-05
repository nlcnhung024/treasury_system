import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Play, CheckCircle2, Trash2, Edit2, Tag, Sliders } from 'lucide-react';
import api from '../services/api';
import { ClassificationRule, Category } from '../types';
import { SortableTh } from '../components/common/SortableTh';
import { TableGridToolbar } from '../components/common/TableGridToolbar';
import { useTableGrid } from '../hooks/useTableGrid';
import { ColumnConfig } from '../types/grid';

const RULE_COLUMNS: ColumnConfig[] = [
  { field: 'priority', label: 'Ưu tiên', type: 'number', align: 'center', defaultWidth: 90 },
  { field: 'rule_name', label: 'Tên Quy Tắc', type: 'text', defaultWidth: 180 },
  { field: 'category_name', label: 'Danh Mục Đích', type: 'text', defaultWidth: 160 },
  { field: 'keyword_patterns', label: 'Từ Khóa Nhận Diện', type: 'text', defaultWidth: 200 },
  { field: 'conditions', label: 'Điều kiện NH / TK / Số tiền', type: 'text', defaultWidth: 220 },
  { field: 'flow_type', label: 'Luồng', type: 'text', align: 'center', defaultWidth: 100 },
];

export const RuleManagementPage: React.FC = () => {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Table Grid Capabilities (Sort, Filter, Visibility, Resizing)
  const {
    sortField,
    sortDirection,
    handleSort,
    filters,
    setFilter,
    clearAllFilters,
    activeFilterCount,
    visibleColumns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    isColumnVisible,
    columnWidths,
    handleResize,
    filterAndSort,
  } = useTableGrid<ClassificationRule>({
    tableId: 'rules_management_table',
    columns: RULE_COLUMNS,
    defaultSortField: 'priority',
    defaultSortDirection: 'asc',
  });

  const sortedRules = useMemo(() => {
    return filterAndSort(rules, {
      conditions: (r) => `${r.target_bank_code || ''} ${r.target_account_number || ''} ${r.min_amount || ''}`,
      flow_type: (r) => r.applies_to_flow || '',
    });
  }, [rules, filterAndSort]);

  // State quản lý Form Danh mục (Categories)
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [catType, setCatType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [catName, setCatName] = useState<string>('');
  const [catColor, setCatColor] = useState<string>('#EF4444');
  const [catDesc, setCatDesc] = useState<string>('');

  // State quản lý Form Quy tắc (Classification Rules)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleName, setRuleName] = useState<string>('');
  const [ruleCategoryId, setRuleCategoryId] = useState<string>('');
  const [rulePriority, setRulePriority] = useState<string>('10');
  const [ruleKeywords, setRuleKeywords] = useState<string>('');
  const [ruleMatchType, setRuleMatchType] = useState<'CONTAINS' | 'EXACT' | 'REGEX'>('CONTAINS');
  const [ruleBankCode, setRuleBankCode] = useState<string>('');
  const [ruleAccountNo, setRuleAccountNo] = useState<string>('');
  const [ruleMinAmount, setRuleMinAmount] = useState<string>('');
  const [ruleMaxAmount, setRuleMaxAmount] = useState<string>('');
  const [ruleFlow, setRuleFlow] = useState<'DEBIT' | 'CREDIT' | 'ALL'>('DEBIT');

  useEffect(() => {
    fetchRulesAndCategories();
  }, []);

  const fetchRulesAndCategories = async () => {
    try {
      const [rulesRes, catsRes] = await Promise.all([api.get('/rules'), api.get('/categories')]);
      const loadedCats: Category[] = catsRes.data || [];
      setRules(rulesRes.data || []);
      setCategories(loadedCats);
      if (loadedCats.length > 0 && !ruleCategoryId) {
        setRuleCategoryId(String(loadedCats[0].category_id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Xử lý lưu Danh mục
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      alert('Vui lòng nhập tên danh mục!');
      return;
    }
    const payload = {
      category_type: catType,
      category_name: catName.trim(),
      color_code: catColor,
      description: catDesc.trim() || null,
      display_order: 0,
    };
    try {
      if (editingCatId) {
        await api.put(`/categories/${editingCatId}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      resetCategoryForm();
      await fetchRulesAndCategories();
    } catch (err: any) {
      alert(`Lỗi lưu danh mục: ${err.response?.data?.detail || err.message}`);
    }
  };

  const resetCategoryForm = () => {
    setEditingCatId(null);
    setCatName('');
    setCatDesc('');
    setCatType('EXPENSE');
    setCatColor('#EF4444');
  };

  const handleEditCategory = (c: Category) => {
    setEditingCatId(c.category_id);
    setCatType(c.category_type);
    setCatName(c.category_name);
    setCatColor(c.color_code || '#3B82F6');
    setCatDesc(c.description || '');
  };

  const handleDeleteCategory = async (catId: number, name: string) => {
    if (!window.confirm(`Xóa danh mục "${name}" sẽ xóa luôn các quy tắc thuộc danh mục này. Tiếp tục?`)) {
      return;
    }
    try {
      await api.delete(`/categories/${catId}`);
      await fetchRulesAndCategories();
    } catch (err: any) {
      alert(`Không thể xóa danh mục: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Xử lý lưu Quy tắc Phân loại
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !ruleCategoryId || !ruleKeywords.trim()) {
      alert('Vui lòng nhập Tên quy tắc, chọn Danh mục và nhập Từ khóa nhận diện!');
      return;
    }
    const payload = {
      rule_name: ruleName.trim(),
      category_id: Number(ruleCategoryId),
      priority: Number(rulePriority) || 10,
      keyword_patterns: ruleKeywords.trim(),
      match_type: ruleMatchType,
      target_bank_code: ruleBankCode.trim() || null,
      target_account_number: ruleAccountNo.trim() || null,
      min_amount: ruleMinAmount ? Number(ruleMinAmount) : null,
      max_amount: ruleMaxAmount ? Number(ruleMaxAmount) : null,
      applies_to_flow: ruleFlow,
    };
    try {
      if (editingRuleId) {
        await api.put(`/rules/${editingRuleId}`, payload);
      } else {
        await api.post('/rules', payload);
      }
      resetRuleForm();
      await fetchRulesAndCategories();
    } catch (err: any) {
      alert(`Lỗi lưu quy tắc: ${err.response?.data?.detail || err.message}`);
    }
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleName('');
    setRulePriority('10');
    setRuleKeywords('');
    setRuleMatchType('CONTAINS');
    setRuleBankCode('');
    setRuleAccountNo('');
    setRuleMinAmount('');
    setRuleMaxAmount('');
    setRuleFlow('DEBIT');
  };

  const handleEditRule = (r: ClassificationRule) => {
    setEditingRuleId(r.rule_id);
    setRuleName(r.rule_name);
    setRuleCategoryId(String(r.category_id));
    setRulePriority(String(r.priority));
    setRuleKeywords(r.keyword_patterns);
    setRuleMatchType((r.match_type as 'CONTAINS' | 'EXACT' | 'REGEX') || 'CONTAINS');
    setRuleBankCode(r.target_bank_code || '');
    setRuleAccountNo(r.target_account_number || '');
    setRuleMinAmount(r.min_amount ? String(r.min_amount) : '');
    setRuleMaxAmount(r.max_amount ? String(r.max_amount) : '');
    setRuleFlow((r.applies_to_flow as 'DEBIT' | 'CREDIT' | 'ALL') || 'DEBIT');
  };

  const handleDeleteRule = async (ruleId: number, name: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa quy tắc "${name}"?`)) {
      return;
    }
    try {
      await api.delete(`/rules/${ruleId}`);
      await fetchRulesAndCategories();
    } catch (err: any) {
      alert(`Lỗi xóa quy tắc: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleReapplyRules = async () => {
    setLoading(true);
    setReapplyMsg('Đang chạy lại bộ quy tắc trên toàn bộ dữ liệu giao dịch...');
    try {
      const res = await api.post('/rules/re-apply');
      setReapplyMsg(res.data.message);
    } catch (err: any) {
      setReapplyMsg(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Nút Chạy lại Quy tắc */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Tự Quản Lý Danh Mục & Bộ Quy Tắc Phân Loại Nâng Cao
          </h1>
          <p className="text-sm text-slate-500">
            Khởi tạo từ con số 0 • Tự thiết lập Danh mục Thu/Chi, điều kiện từ khóa kết hợp số tiền/ngân hàng • Bảo vệ tuyệt đối dòng phân loại thủ công
          </p>
        </div>
        <button
          onClick={handleReapplyRules}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Play className="w-4 h-4" />
          <span>Chạy Lại Toàn Bộ Quy Tắc Lên Lịch Sử Giao Dịch</span>
        </button>
      </div>

      {reapplyMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{reapplyMsg}</span>
        </div>
      )}

      {/* PHẦN 1: QUẢN LÝ DANH MỤC THU / CHI (CATEGORIES) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Bước 1: Quản Lý Danh Mục Thu / Chi ({categories.length} danh mục)
          </h2>
        </div>

        <form
          onSubmit={handleSaveCategory}
          className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg mb-5 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Loại Danh mục</label>
            <select
              value={catType}
              onChange={(e) => {
                const val = e.target.value as 'INCOME' | 'EXPENSE';
                setCatType(val);
                setCatColor(val === 'INCOME' ? '#10B981' : '#EF4444');
              }}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-medium"
            >
              <option value="EXPENSE">➖ Khoản Chi (EXPENSE)</option>
              <option value="INCOME">➕ Khoản Thu (INCOME)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Tên Danh mục</label>
            <input
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="VD: Chi thanh toán Nhà cung cấp Xi măng..."
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Màu hiển thị</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={catColor}
                onChange={(e) => setCatColor(e.target.value)}
                className="h-8 w-12 border border-slate-300 rounded cursor-pointer bg-white p-0.5"
              />
              <span className="font-mono text-slate-600">{catColor}</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mô tả (Tùy chọn)</label>
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Ghi chú danh mục..."
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{editingCatId ? 'Cập nhật' : 'Tạo Danh mục'}</span>
            </button>
            {editingCatId && (
              <button
                type="button"
                onClick={resetCategoryForm}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium"
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        {/* Danh sách Danh mục */}
        {categories.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
            Chưa có danh mục Thu/Chi nào. Hãy tạo danh mục đầu tiên bằng biểu mẫu phía trên.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((c) => (
              <div
                key={c.category_id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:shadow-xs transition-shadow"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color_code }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate" title={c.category_name}>
                      {c.category_name}
                    </div>
                    <span
                      className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        c.category_type === 'INCOME'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {c.category_type === 'INCOME' ? 'THU (+)' : 'CHI (-)'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleEditCategory(c)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded"
                    title="Sửa danh mục"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(c.category_id, c.category_name)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                    title="Xóa danh mục"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PHẦN 2: QUẢN LÝ QUY TẮC PHÂN LOẠI NÂNG CAO (CLASSIFICATION RULES) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Bước 2: Thiết Lập Quy Tắc Phân Loại Tự Động ({rules.length} quy tắc)
          </h2>
        </div>

        <form
          onSubmit={handleSaveRule}
          className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg mb-5 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tên Quy tắc</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="VD: Chi trả tiền hàng Trung Sơn"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Gán vào Danh mục</label>
            <select
              value={ruleCategoryId}
              onChange={(e) => setRuleCategoryId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-medium"
              required
            >
              <option value="">-- Chọn danh mục đích --</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  [{c.category_type === 'INCOME' ? 'THU' : 'CHI'}] {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">
              Từ khóa nhận diện (Cách nhau bởi dấu phẩy `,` hoặc Regex)
            </label>
            <input
              type="text"
              value={ruleKeywords}
              onChange={(e) => setRuleKeywords(e.target.value)}
              placeholder="VD: trung son, xuan son, tt tien hang"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kiểu khớp từ khóa</label>
            <select
              value={ruleMatchType}
              onChange={(e) => setRuleMatchType(e.target.value as 'CONTAINS' | 'EXACT' | 'REGEX')}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              <option value="CONTAINS">Chứa từ khóa (CONTAINS)</option>
              <option value="EXACT">Khớp chính xác (EXACT)</option>
              <option value="REGEX">Biểu thức chính quy (REGEX)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Áp dụng cho Luồng tiền</label>
            <select
              value={ruleFlow}
              onChange={(e) => setRuleFlow(e.target.value as 'DEBIT' | 'CREDIT' | 'ALL')}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              <option value="DEBIT">Chỉ Phát sinh Nợ (DEBIT - Chi)</option>
              <option value="CREDIT">Chỉ Phát sinh Có (CREDIT - Thu)</option>
              <option value="ALL">Cả Thu và Chi (ALL)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ngân hàng áp dụng (Tùy chọn)</label>
            <select
              value={ruleBankCode}
              onChange={(e) => setRuleBankCode(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5"
            >
              <option value="">Tất cả ngân hàng</option>
              <option value="MBB">MBBank (MBB)</option>
              <option value="MBV">MBV Business (MBV)</option>
              <option value="VPB">VPBank (VPB)</option>
              <option value="TPB">TPBank (TPB)</option>
              <option value="CTG">VietinBank (CTG)</option>
              <option value="SHB">SHB</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số TK cụ thể (Tùy chọn)</label>
            <input
              type="text"
              value={ruleAccountNo}
              onChange={(e) => setRuleAccountNo(e.target.value)}
              placeholder="Để trống = Tất cả TK"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số tiền tối thiểu (Min VND)</label>
            <input
              type="number"
              min="0"
              value={ruleMinAmount}
              onChange={(e) => setRuleMinAmount(e.target.value)}
              placeholder="Không giới hạn dưới"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số tiền tối đa (Max VND)</label>
            <input
              type="number"
              min="0"
              value={ruleMaxAmount}
              onChange={(e) => setRuleMaxAmount(e.target.value)}
              placeholder="Không giới hạn trên"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Độ ưu tiên (Số nhỏ chạy trước)</label>
            <input
              type="number"
              min="1"
              value={rulePriority}
              onChange={(e) => setRulePriority(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono"
              required
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{editingRuleId ? 'Cập nhật Quy tắc' : 'Thêm Quy tắc'}</span>
            </button>
            {editingRuleId && (
              <button
                type="button"
                onClick={resetRuleForm}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium"
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        {/* Bảng Danh sách Quy tắc */}
        <TableGridToolbar
          columns={RULE_COLUMNS}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onShowAllColumns={showAllColumns}
          onResetColumns={resetColumns}
          filteredCount={sortedRules.length}
          totalCount={rules.length}
          activeFilterCount={activeFilterCount}
          onClearAllFilters={clearAllFilters}
        />

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                {isColumnVisible('priority') && (
                  <SortableTh
                    field="priority"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    filterType="number"
                    filterValue={filters['priority']}
                    onFilterChange={(v) => setFilter('priority', v)}
                    width={columnWidths['priority']}
                    onResize={(w) => handleResize('priority', w)}
                  >
                    Ưu tiên
                  </SortableTh>
                )}
                {isColumnVisible('rule_name') && (
                  <SortableTh
                    field="rule_name"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['rule_name']}
                    onFilterChange={(v) => setFilter('rule_name', v)}
                    width={columnWidths['rule_name']}
                    onResize={(w) => handleResize('rule_name', w)}
                  >
                    Tên Quy Tắc
                  </SortableTh>
                )}
                {isColumnVisible('category_name') && (
                  <SortableTh
                    field="category_name"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['category_name']}
                    onFilterChange={(v) => setFilter('category_name', v)}
                    width={columnWidths['category_name']}
                    onResize={(w) => handleResize('category_name', w)}
                  >
                    Danh Mục Đích
                  </SortableTh>
                )}
                {isColumnVisible('keyword_patterns') && (
                  <SortableTh
                    field="keyword_patterns"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['keyword_patterns']}
                    onFilterChange={(v) => setFilter('keyword_patterns', v)}
                    width={columnWidths['keyword_patterns']}
                    onResize={(w) => handleResize('keyword_patterns', w)}
                  >
                    Từ Khóa Nhận Diện
                  </SortableTh>
                )}
                {isColumnVisible('conditions') && (
                  <SortableTh
                    field="conditions"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    filterType="text"
                    filterValue={filters['conditions']}
                    onFilterChange={(v) => setFilter('conditions', v)}
                    width={columnWidths['conditions']}
                    onResize={(w) => handleResize('conditions', w)}
                  >
                    Điều kiện NH / TK / Số tiền
                  </SortableTh>
                )}
                {isColumnVisible('flow_type') && (
                  <SortableTh
                    field="flow_type"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    filterType="text"
                    filterValue={filters['flow_type']}
                    onFilterChange={(v) => setFilter('flow_type', v)}
                    width={columnWidths['flow_type']}
                    onResize={(w) => handleResize('flow_type', w)}
                  >
                    Luồng
                  </SortableTh>
                )}
                <th className="px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedRules.length === 0 ? (
                <tr>
                  <td colSpan={RULE_COLUMNS.filter((c) => isColumnVisible(c.field)).length + 1} className="px-4 py-6 text-center text-slate-400">
                    {rules.length === 0
                      ? 'Chưa có quy tắc phân loại nào. Hãy tạo Danh mục ở Bước 1, sau đó thêm Quy tắc tại Bước 2.'
                      : 'Không có quy tắc nào khớp với điều kiện lọc trên bảng.'}
                  </td>
                </tr>
              ) : (
                sortedRules.map((r) => (
                  <tr key={r.rule_id} className="hover:bg-slate-50">
                    {isColumnVisible('priority') && (
                      <td className="px-3 py-3 font-mono font-bold text-blue-600">#{r.priority}</td>
                    )}
                    {isColumnVisible('rule_name') && (
                      <td className="px-3 py-3 font-semibold text-slate-900">{r.rule_name}</td>
                    )}
                    {isColumnVisible('category_name') && (
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold">
                          {r.category_name || `ID #${r.category_id}`}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('keyword_patterns') && (
                      <td className="px-3 py-3">
                        <code className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-mono">
                          {r.keyword_patterns}
                        </code>
                        <span className="ml-1.5 text-[10px] text-slate-400">({r.match_type})</span>
                      </td>
                    )}
                    {isColumnVisible('conditions') && (
                      <td className="px-3 py-3 text-[11px] text-slate-500">
                        <div>NH: {r.target_bank_code || 'Tất cả'} • TK: {r.target_account_number || 'Tất cả'}</div>
                        {(r.min_amount || r.max_amount) && (
                          <div className="font-mono">
                            Số tiền: {r.min_amount ? `≥ ${Number(r.min_amount).toLocaleString('vi-VN')}` : ''}{' '}
                            {r.max_amount ? `≤ ${Number(r.max_amount).toLocaleString('vi-VN')}` : ''}
                          </div>
                        )}
                      </td>
                    )}
                    {isColumnVisible('flow_type') && (
                      <td className="px-3 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          r.applies_to_flow === 'DEBIT'
                            ? 'bg-red-100 text-red-700'
                            : r.applies_to_flow === 'CREDIT'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.applies_to_flow}
                      </span>
                      </td>
                    )}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditRule(r)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          title="Sửa quy tắc"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(r.rule_id, r.rule_name)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                          title="Xóa quy tắc"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
