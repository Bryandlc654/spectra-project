import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import InvoicesPage from './InvoicesPage';
import WalletPage from './WalletPage';
import ReconciliationPage from './ReconciliationPage';
import ElectronicInvoicingPage from './ElectronicInvoicingPage';
import { PLATFORM_ROLES } from '../../lib/platformRoles';

export default function FinanceRoutes({ apiUrl, token, user }) {
  const role = user?.platform_role || user?.role;
  const canAccessElectronicInvoicing = [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCE].includes(role);

  return (
    <Routes>
      <Route path="invoices" element={<InvoicesPage apiUrl={apiUrl} token={token} />} />
      <Route path="wallet" element={<WalletPage apiUrl={apiUrl} token={token} />} />
      <Route path="reconciliation" element={<ReconciliationPage apiUrl={apiUrl} token={token} />} />
      <Route
        path="electronic-invoicing"
        element={canAccessElectronicInvoicing
          ? <ElectronicInvoicingPage apiUrl={apiUrl} token={token} />
          : <Navigate to="invoices" replace />}
      />
      <Route path="*" element={<Navigate to="invoices" replace />} />
    </Routes>
  );
}
