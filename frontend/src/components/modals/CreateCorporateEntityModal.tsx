import React, { useState } from 'react';
import { X, Building2, User, Sparkles, AlertCircle, Check } from 'lucide-react';
import { useCorporateEntity } from '../../contexts/CorporateEntityContext';

interface CreateCorporateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_PRESETS = [
  { label: 'Xanh Chàm (Indigo)', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { label: 'Xanh Lá (Emerald)', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Tím (Purple)', class: 'bg-purple-50 text-purple-700 border-purple-200' },
  { label: 'Hổ Phách (Amber)', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Xanh Dương (Sky)', class: 'bg-sky-50 text-sky-700 border-sky-200' },
  { label: 'Hồng Đào (Rose)', class: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const CreateCorporateEntityModal: React.FC<CreateCorporateEntityModalProps> = ({ isOpen, onClose }) => {
  const { addEntity } = useCorporateEntity();

  const [type, setType] = useState<'CORPORATE' | 'SPECIAL_CASH'>('CORPORATE');
  const [shortName, setShortName] = useState('');
  const [fullName, setFullName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [badgeLabel, setBadgeLabel] = useState('Thành viên');
  const [description, setDescription] = useState('');
  const [colorClass, setColorClass] = useState('bg-indigo-50 text-indigo-700 border-indigo-200');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickBadges =
    type === 'CORPORATE'
      ? ['Thành viên', 'Pháp nhân phụ', 'Đối tác liên kết', 'Cty liên doanh', 'Công ty con']
      : ['Ủy quyền CEO', 'Ban Giám đốc', 'Kênh tiền mặt', 'Ủy thác điều hành', 'Cá nhân góp vốn'];

  const handleTypeChange = (newType: 'CORPORATE' | 'SPECIAL_CASH') => {
    setType(newType);
    if (newType === 'SPECIAL_CASH') {
      setBadgeLabel('Ủy quyền CEO');
      setColorClass('bg-purple-50 text-purple-700 border-purple-200');
    } else {
      setBadgeLabel('Thành viên');
      setColorClass('bg-indigo-50 text-indigo-700 border-indigo-200');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedShort = shortName.trim();
    const trimmedFull = fullName.trim();

    if (!trimmedShort) {
      setErrorMsg('Vui lòng nhập Tên hiển thị ngắn gọn');
      return;
    }
    if (!trimmedFull) {
      setErrorMsg('Vui lòng nhập Tên pháp nhân đầy đủ hoặc Họ và tên');
      return;
    }

    try {
      setIsSubmitting(true);
      await addEntity({
        name: trimmedFull,
        shortName: trimmedShort,
        taxCode: taxCode.trim() || undefined,
        type,
        description: description.trim() || (type === 'SPECIAL_CASH' ? 'Kênh ủy quyền điều hành cá nhân' : 'Pháp nhân thành viên hệ sinh thái'),
        badgeLabel: badgeLabel.trim() || (type === 'SPECIAL_CASH' ? 'Ủy quyền' : 'Thành viên'),
        colorClass,
      });

      // Reset form
      setShortName('');
      setFullName('');
      setTaxCode('');
      setDescription('');
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Có lỗi xảy ra khi tạo thực thể mới.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              {type === 'CORPORATE' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Thêm Người hoặc Công Ty Vào Hệ Sinh Thái</span>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mở rộng danh mục pháp nhân và cá nhân để quản lý dòng tiền, sao kê & khế ước nợ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMsg}</div>
            </div>
          )}

          {/* CHỌN LOẠI ĐỐI TƯỢNG */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Loại Đối Tượng <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange('CORPORATE')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  type === 'CORPORATE'
                    ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20 text-indigo-900'
                    : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    type === 'CORPORATE' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Công Ty / Pháp Nhân</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Doanh nghiệp thành viên trong tập đoàn</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('SPECIAL_CASH')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  type === 'SPECIAL_CASH'
                    ? 'bg-purple-50/70 border-purple-400 ring-2 ring-purple-500/20 text-purple-900'
                    : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    type === 'SPECIAL_CASH' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Cá Nhân / Lãnh Đạo</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Kênh ủy quyền CEO, rút tiền mặt, góp vốn</div>
                </div>
              </button>
            </div>
          </div>

          {/* TÊN HIỂN THỊ NGẮN GỌN */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tên Hiển Thị Ngắn Gọn <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder={type === 'CORPORATE' ? 'Ví dụ: Xi măng Hà Tiên, TM Hướng Dương...' : 'Ví dụ: Ông Trần Ngọc Tuấn (CFO)...'}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Dùng để hiển thị ngắn gọn trên thanh Header, Bảng báo cáo và bộ lọc.
            </span>
          </div>

          {/* TÊN PHÁP NHÂN ĐẦY ĐỦ / HỌ TÊN CHỦ TÀI KHOẢN */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tên Pháp Nhân Đầy Đủ / Chủ Tài Khoản <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={
                type === 'CORPORATE'
                  ? 'Ví dụ: CONG TY TNHH MOT THANH VIEN XI MANG HA TIEN'
                  : 'Ví dụ: TRAN NGOC TUAN'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
            />
            <span className="text-[11px] text-indigo-600 mt-1 block">
              💡 Tên này sẽ được tự động gán vào sao kê tín dụng (MB) và sao kê ngân hàng CASA khi tải file.
            </span>
          </div>

          {/* MÃ SỐ THUẾ / CCCD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mã Số Thuế / CCCD (Tùy chọn)
              </label>
              <input
                type="text"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="Ví dụ: 0109730501"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Nhãn Phân Loại (Badge)
              </label>
              <input
                type="text"
                value={badgeLabel}
                onChange={(e) => setBadgeLabel(e.target.value)}
                placeholder="Ví dụ: Thành viên, Ủy quyền..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* GỢI Ý NHÃN NHANH */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
              <span>Gợi ý nhãn nhanh:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickBadges.map((badge) => (
                <button
                  key={badge}
                  type="button"
                  onClick={() => setBadgeLabel(badge)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer border ${
                    badgeLabel === badge
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  {badge}
                </button>
              ))}
            </div>
          </div>

          {/* MÔ TẢ VAI TRÒ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mô Tả Nghiệp Vụ / Vai Trò Trong Hệ Sinh Thái (Tùy chọn)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === 'CORPORATE'
                  ? 'Ví dụ: Đơn vị đảm nhận phân phối nguyên vật liệu và tiếp vận nội bộ...'
                  : 'Ví dụ: Tài khoản chi tạm ứng công trình và kênh tiền mặt điều hành...'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* MÀU SẮC BADGE */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Màu Sắc Đại Diện
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COLOR_PRESETS.map((cp) => (
                <button
                  key={cp.class}
                  type="button"
                  onClick={() => setColorClass(cp.class)}
                  className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-medium flex items-center justify-between cursor-pointer transition-all ${
                    colorClass === cp.class ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border-slate-200'
                  }`}
                >
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${cp.class}`}>
                    {cp.label.split(' ')[0]}
                  </span>
                  {colorClass === cp.class && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* MODAL FOOTER */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <span>Đang Lưu...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>+ Tạo & Chọn Ngay</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
