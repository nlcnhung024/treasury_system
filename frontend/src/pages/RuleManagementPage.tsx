import React, { useState, useEffect } from 'react';
import { Sliders, Plus, Play, CheckCircle2, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { ClassificationRule, Category } from '../types';

export const RuleManagementPage: React.FC = () => {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchRulesAndCategories();
  }, []);

  const fetchRulesAndCategories = async () => {
    try {
      const [rulesRes, catsRes] = await Promise.all([
        api.get('/rules'),
        api.get('/categories'),
      ]);
      setRules(rulesRes.data || []);
      setCategories(catsRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReapplyRules = async () => {
    setLoading(true);
    setReapplyMsg('Đang áp dụng bộ quy tắc lên toàn bộ dữ liệu lịch sử...');
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản Lý Bộ Quy Tắc Phân Loại Nâng Cao</h1>
          <p className="text-sm text-slate-500">
            Tự định nghĩa từ khóa, điều kiện số tiền, ngân hàng và luồng tiền • Bảo vệ tuyệt đối dòng phân loại thủ công
          </p>
        </div>
        <button
          onClick={handleReapplyRules}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Play className="w-4 h-4" />
          <span>Chạy Lại Toàn Bộ Quy Tắc</span>
        </button>
      </div>

      {reapplyMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{reapplyMsg}</span>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Danh Sách Quy Tắc Hiện Hành (Theo Độ Ưu Tiên)</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Ưu tiên</th>
                <th className="px-4 py-3">Tên Quy Tắc</th>
                <th className="px-4 py-3">Từ Khóa Nhận Diện</th>
                <th className="px-4 py-3">Ngân hàng</th>
                <th className="px-4 py-3">Áp dụng Luồng</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Chưa có quy tắc nào. Vui lòng tạo quy tắc mới.
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.rule_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">#{r.priority}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.rule_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 bg-slate-50 rounded">
                      {r.keyword_patterns}
                    </td>
                    <td className="px-4 py-3">{r.target_bank_code || 'Tất cả'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.applies_to_flow === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.applies_to_flow}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                        Đang hoạt động
                      </span>
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

