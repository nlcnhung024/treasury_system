import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { UploadCloud, Table, PieChart, TrendingUp, Sliders, ShieldCheck, UserCheck } from 'lucide-react';
import api from '../../services/api';

interface Persona {
  key: string;
  username: string;
  label: string;
  roleBadge: string;
  defaultRoute: string;
}

const PERSONAS: Persona[] = [
  {
    key: 'ACCOUNTANT',
    username: 'nhung.nghiem',
    label: 'Chị Cẩm Nhung (Kế toán)',
    roleBadge: 'ACCOUNTANT',
    defaultRoute: '/',
  },
  {
    key: 'CFO',
    username: 'tuan.tran',
    label: 'Ông Trần Ngọc Tuấn (CFO)',
    roleBadge: 'CFO',
    defaultRoute: '/cfo-dashboard',
  },
  {
    key: 'CEO',
    username: 'lananh.nguyen',
    label: 'Bà Nguyễn Thị Lan Anh (CEO)',
    roleBadge: 'CEO',
    defaultRoute: '/ceo-waterfall',
  },
];

export const Navbar: React.FC = () => {
  const [selectedPersona, setSelectedPersona] = useState<string>('ACCOUNTANT');
  const navigate = useNavigate();

  const navItems = [
    { to: '/', label: 'Nạp Sao Kê', icon: UploadCloud },
    { to: '/transactions', label: 'Bảng Giao Dịch', icon: Table },
    { to: '/cfo-dashboard', label: 'Tồn Quỹ CFO (<9h)', icon: PieChart },
    { to: '/ceo-waterfall', label: 'Waterfall CEO', icon: TrendingUp },
    { to: '/rules', label: 'Bộ Quy Tắc', icon: Sliders },
  ];

  const handlePersonaChange = async (personaKey: string) => {
    setSelectedPersona(personaKey);
    const p = PERSONAS.find((item) => item.key === personaKey);
    if (!p) return;
    try {
      const res = await api.post('/auth/login', { username: p.username, password: 'dev_password' });
      if (res.data?.access_token) {
        localStorage.setItem('access_token', res.data.access_token);
      }
    } catch {
      // Fallback local dev mode
    }
    navigate(p.defaultRoute);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg tracking-wider text-white shadow-lg shadow-blue-500/30">
            BSP
          </div>
          <div>
            <div className="text-base font-bold leading-tight">Bank Statement Processor</div>
            <div className="text-xs text-slate-400">Hệ thống Xử lý & Đối soát Tự động</div>
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

        <div className="flex items-center space-x-2 text-sm">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <UserCheck className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
            <select
              aria-label="Chuyển đổi vai trò người dùng"
              value={selectedPersona}
              onChange={(e) => handlePersonaChange(e.target.value)}
              className="bg-transparent text-emerald-400 text-xs font-medium focus:outline-none cursor-pointer"
            >
              {PERSONAS.map((p) => (
                <option key={p.key} value={p.key} className="bg-slate-900 text-white">
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
