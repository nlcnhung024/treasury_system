import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Database, Calendar } from 'lucide-react';

interface TopHeaderProps {
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onToggleSidebar }) => {
  const location = useLocation();

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
      default:
        return { group: 'Hệ thống Quản trị', title: 'Bank Statement Processor' };
    }
  };

  const { group, title } = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
            {group}
          </div>
          <h1 className="text-base font-bold text-slate-900 leading-tight">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Database className="w-3.5 h-3.5" />
          <span className="font-medium">PostgreSQL 15 Connected</span>
        </div>

        <div className="hidden md:flex items-center space-x-1 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>
    </header>
  );
};
