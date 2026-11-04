import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { UploadPage } from './pages/UploadPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { CreditStatementsPage } from './pages/CreditStatementsPage';
import { LoanRepaymentReconcilePage } from './pages/LoanRepaymentReconcilePage';
import { ContractDetailsPage } from './pages/ContractDetailsPage';
import { CFODashboardPage } from './pages/CFODashboardPage';
import { CEOWaterfallPage } from './pages/CEOWaterfallPage';
import { RuleManagementPage } from './pages/RuleManagementPage';

export const App: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar Menu */}
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopHeader onToggleSidebar={() => setMobileOpen(true)} />

          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<UploadPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/credit-statements" element={<CreditStatementsPage />} />
              <Route path="/loan-repayments" element={<LoanRepaymentReconcilePage />} />
              <Route path="/contract-details" element={<ContractDetailsPage />} />
              <Route path="/cfo-dashboard" element={<CFODashboardPage />} />
              <Route path="/ceo-waterfall" element={<CEOWaterfallPage />} />
              <Route path="/rules" element={<RuleManagementPage />} />
            </Routes>
          </main>

          <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
            Bank Statement Processing & Reporting System &copy; 2026 • Enterprise Architecture by @SystemArchitect
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
};
