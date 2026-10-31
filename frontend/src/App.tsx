import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { UploadPage } from './pages/UploadPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { CreditStatementsPage } from './pages/CreditStatementsPage';
import { CFODashboardPage } from './pages/CFODashboardPage';
import { CEOWaterfallPage } from './pages/CEOWaterfallPage';
import { RuleManagementPage } from './pages/RuleManagementPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/credit-statements" element={<CreditStatementsPage />} />
            <Route path="/cfo-dashboard" element={<CFODashboardPage />} />
            <Route path="/ceo-waterfall" element={<CEOWaterfallPage />} />
            <Route path="/rules" element={<RuleManagementPage />} />
          </Routes>
        </main>
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
          Bank Statement Processing & Reporting System &copy; 2026 • Enterprise Architecture by @SystemArchitect
        </footer>
      </div>
    </BrowserRouter>
  );
};

