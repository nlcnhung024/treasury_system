import React from 'react';
import { NavLink } from 'react-router-dom';
import { UploadCloud, Table, PieChart, TrendingUp, Sliders, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const navItems = [
    { to: '/', label: 'Nạp Sao Kê', icon: UploadCloud },
    { to: '/transactions', label: 'Bảng Giao Dịch', icon: Table },
    { to: '/cfo-dashboard', label: 'Tồn Quỹ CFO (<9h)', icon: PieChart },
    { to: '/ceo-waterfall', label: 'Waterfall CEO', icon: TrendingUp },
    { to: '/rules', label: 'Bộ Quy Tắc', icon: Sliders },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg tracking-wider text-white shadow-lg shadow-blue-500/30">
            BSP
          </div>
          <div>
            <div className="text-base font-bold leading-tight">Bank Statement Processor</div>
            <div className="text-xs text-slate-400">Hệ thống Xử lý & Báo cáo Tự động</div>
          </div>
        </div>

        <nav className="flex space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center space-x-3 text-sm">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Chị Cẩm Nhung (Kế toán)</span>
          </div>
        </div>
      </div>
    </header>
  );
};

