import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  UploadCloud,
  Table,
  PieChart,
  TrendingUp,
  Sliders,
  Landmark,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Wallet,
  X,
  Building2,
} from 'lucide-react';
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

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const [selectedPersona, setSelectedPersona] = useState<string>('ACCOUNTANT');
  const [tonQuyOpen, setTonQuyOpen] = useState<boolean>(true);
  const [khoanVayOpen, setKhoanVayOpen] = useState<boolean>(true);
  const navigate = useNavigate();
  const location = useLocation();

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
      // Fallback dev mode
    }
    navigate(p.defaultRoute);
    setMobileOpen(false);
  };

  const tonQuyNavItems = [
    { to: '/', label: 'Nạp Sao Kê', icon: UploadCloud, exact: true },
    { to: '/transactions', label: 'Bảng Giao Dịch', icon: Table },
    { to: '/cfo-dashboard', label: 'Tồn Quỹ CFO (<9h)', icon: PieChart },
    { to: '/ceo-waterfall', label: 'Waterfall CEO', icon: TrendingUp },
    { to: '/rules', label: 'Bộ Quy Tắc', icon: Sliders },
  ];

  const khoanVayNavItems = [
    { to: '/credit-statements', label: 'Sao Kê Tín Dụng', icon: Landmark },
  ];

  const currentPersona = PERSONAS.find((p) => p.key === selectedPersona) || PERSONAS[0];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-base tracking-wider text-white shadow-lg shadow-blue-500/25">
              BSP
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">Treasury & Bank</div>
              <div className="text-[11px] text-slate-400">Hệ thống Đối soát Tự động</div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* NHÓM 1: THEO DÕI TỒN QUỸ */}
          <div>
            <button
              type="button"
              onClick={() => setTonQuyOpen(!tonQuyOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Wallet className="w-3.5 h-3.5 text-blue-400" />
                <span>Theo dõi tồn quỹ</span>
              </div>
              {tonQuyOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>

            {tonQuyOpen && (
              <div className="mt-1 space-y-0.5 pl-1">
                {tonQuyNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.exact
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>

          {/* NHÓM 2: THEO DÕI KHOẢN VAY */}
          <div>
            <button
              type="button"
              onClick={() => setKhoanVayOpen(!khoanVayOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Theo dõi khoản vay</span>
              </div>
              {khoanVayOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>

            {khoanVayOpen && (
              <div className="mt-1 space-y-0.5 pl-1">
                {khoanVayNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom User Persona Switcher */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Người dùng hiện tại
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {currentPersona.roleBadge}
              </span>
            </div>

            <div className="relative mt-1">
              <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5 pointer-events-none" />
              <select
                aria-label="Chuyển đổi vai trò người dùng"
                value={selectedPersona}
                onChange={(e) => handlePersonaChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs font-medium text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
      </aside>
    </>
  );
};
