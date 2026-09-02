import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import InvoicesPage from './InvoicesPage';
import WalletPage from './WalletPage';
import ReconciliationPage from './ReconciliationPage';

export default function FinanceRoutes({ apiUrl, token }) {
  return (
    <Routes>
      <Route path="invoices" element={<InvoicesPage apiUrl={apiUrl} token={token} />} />
      <Route path="wallet" element={<WalletPage apiUrl={apiUrl} token={token} />} />
      <Route path="reconciliation" element={<ReconciliationPage apiUrl={apiUrl} token={token} />} />
      <Route path="*" element={<Navigate to="invoices" replace />} />
    </Routes>
  );
}
