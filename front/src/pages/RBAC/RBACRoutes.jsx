import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PermissionsPage from './PermissionsPage';
import RoleTemplatesPage from './RoleTemplatesPage';

export default function RBACRoutes({ apiUrl, token }) {
  return (
    <Routes>
      <Route path="permissions" element={<PermissionsPage apiUrl={apiUrl} token={token} />} />
      <Route path="roles" element={<RoleTemplatesPage apiUrl={apiUrl} token={token} />} />
      <Route path="*" element={<Navigate to="roles" replace />} />
    </Routes>
  );
}
