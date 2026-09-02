import React from 'react';
import { Routes, Route } from 'react-router-dom';
import KYBRequestsPage from './KYBRequestsPage';
import KYBDetailPage from './KYBDetailPage';

export default function KYBRoutes({ apiUrl, token }) {
  return (
    <Routes>
      <Route index element={<KYBRequestsPage apiUrl={apiUrl} token={token} />} />
      <Route path=":id" element={<KYBDetailPage apiUrl={apiUrl} token={token} />} />
    </Routes>
  );
}
