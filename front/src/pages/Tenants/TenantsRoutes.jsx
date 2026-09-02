import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Tenants from '../Tenants';
// luego: import TenantDetail from './TenantDetail';

export default function TenantsRoutes({ apiUrl, token }) {
  return (
    <Routes>
      <Route index element={<Tenants apiUrl={apiUrl} token={token} />} />
      {/* preparado para el detalle */}
      {/* <Route path=":id" element={<TenantDetail apiUrl={apiUrl} token={token} />} /> */}
    </Routes>
  );
}
