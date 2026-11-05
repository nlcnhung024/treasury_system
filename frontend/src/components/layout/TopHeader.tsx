import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Menu,
  Database,
  Calendar,
  Building2,
  ChevronDown,
  Check,
  Info,
  Plus,
} from 'lucide-react';
import { useCorporateEntity } from '../../contexts/CorporateEntityContext';
import { CreateCorporateEntityModal } from '../modals/CreateCorporateEntityModal';


interface TopHeaderProps {
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onToggleSidebar }) => {
  const location = useLocation();
  const { selectedEntity, setSelectedEntity, entities, openCreateModal, isCreateModalOpen, closeCreateModal } = useCorporateEntity();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/':
        return { group: 'Theo dõi tồn quỹ', title: 'Nạp & Bóc Tách Sao Kê Ngân Hàng' };
      case '/transactions':
        return { group: 'Theo dõi tồn quỹ', title: 'Bảng Giao Dịch Chi Tiết' };
      case '/cfo-dashboard':
        return { group: 'Theo dõi tồn quỹ', title: 'Báo Cáo Tồn Quỹ Hợp Nhất CFO (<9h)' };
      case '/ceo-waterfall':
        return { group: 'Theo dõi tồn quỹ', title: 'Biểu Đồ Thác Nước Waterfall CEO' };
      case '/rules':
        return { group: 'Theo dõi tồn quỹ', title: 'Thiết Lập Bộ Quy Tắc Phân Loại' };
      case '/credit-statements':
        return { group: 'Theo dõi khoản vay', title: 'Sao Kê Tín Dụng & Danh Mục Khoản Vay' };
      case '/loan-reports':
        return { group: 'Theo dõi khoản vay', title: 'Thống Kê Dư Nợ Tín Dụng & Phân Tích Đa Chiều' };
      case '/contract-details':
        return { group: 'Theo dõi khoản vay', title: 'Chi Tiết Khế Ước & Đối Soát Nhận Nợ' };
      case '/invoices':
        return { group: 'Theo dõi khoản vay', title: 'Kho Hóa Đơn & Đảm Bảo' };
      case '/loan-repayments':
        return { group: 'Theo dõi khoản vay', title: 'Đối Soát Giao Dịch Trả Nợ' };
      default:
        return { group: 'Hệ thống Quản trị', title: 'Bank Statement Processor' };
    }
  };

  const { group, title } = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Cụm Tiêu Đề Trang */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider truncate">
            {group}
          </div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Cụm Bên Phải: Dropdown Doanh Nghiệp & Trạng Thái Hệ Thống */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
        {/* DROPDOWN CHỌN THỰC THỂ DOANH NGHIỆP */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all text-xs text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              isDropdownOpen
                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20'
                : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-indigo-300'
            }`}
            title="Nhấn để chọn thực thể doanh nghiệp đang làm việc"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-3.5 h-3.5" />
            </div>

            <div className="hidden sm:block">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <span>Doanh nghiệp:</span>
                {selectedEntity.taxCode && (
                  <span className="text-slate-500 font-mono text-[9px] font-normal">({selectedEntity.taxCode})</span>
                )}
              </div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1 max-w-[180px] md:max-w-[240px] truncate">
                <span className="truncate">{selectedEntity.shortName}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                  }`}
                />
              </div>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 sm:hidden shrink-0 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* POPOVER MENU LỰA CHỌN DOANH NGHIỆP */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Chọn Thực Thể Doanh Nghiệp</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Áp dụng cho nạp sao kê tín dụng (MB, CTG) & sao kê ngân hàng
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Hệ sinh thái
                </span>
              </div>

              <div className="p-1.5 space-y-1 max-h-80 overflow-y-auto">
                {entities.map((ent) => {
                  const isSelected = selectedEntity.id === ent.id;
                  return (
                    <button
                      key={ent.id}
                      type="button"
                      onClick={() => {
                        setSelectedEntity(ent);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-colors flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 border border-indigo-200 shadow-2xs'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <div
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-indigo-900' : 'text-slate-800'
                            }`}
                          >
                            {ent.shortName}
                          </div>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${ent.colorClass}`}>
                            {ent.badgeLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-0.5 font-medium" title={ent.name}>
                          {ent.name}
                        </div>
                        {ent.taxCode && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            MST: <span className="font-semibold text-slate-600">{ent.taxCode}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 italic mt-0.5">{ent.description}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-1" />}
                    </button>
                  );
                })}
              </div>

              {/* NÚT + THÊM NGƯỜI HOẶC CÔNG TY DƯỚI CÙNG */}
              <div className="p-2 border-t border-slate-100 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    openCreateModal();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100/90 text-indigo-700 font-bold text-xs transition-all cursor-pointer group shadow-2xs"
                >
                  <Plus className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span>+ Thêm người hoặc công ty vào hệ sinh thái</span>
                </button>
              </div>

              <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Khi tải file sao kê MB/CASA, dữ liệu sẽ tự động gán cho doanh nghiệp đã chọn.</span>
              </div>
            </div>
          )}
        </div>

        {/* Cụm Trạng Thái PostgreSQL */}
        <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Database className="w-3.5 h-3.5" />
          <span className="font-medium">PostgreSQL 15 Connected</span>
        </div>

        {/* Ngày Hiện Tại */}
        <div className="hidden md:flex items-center space-x-1 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>
      {/* MODAL THÊM PHÁP NHÂN HOẶC CÁ NHÂN */}
      <CreateCorporateEntityModal isOpen={isCreateModalOpen} onClose={closeCreateModal} />
    </header>
  );
};
