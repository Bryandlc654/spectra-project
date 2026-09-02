import React from 'react';
import { Routes, Route } from 'react-router-dom';
import UsersListPage from './UsersListPage';
import UserDetailPage from './UserDetailPage';
import CompanyAdminsReportPage from './CompanyAdminsReportPage';

export default function UsersRoutes({ apiUrl, token, defaultRole, roleScope }) {
  return (
    <Routes>
      <Route index element={<UsersListPage apiUrl={apiUrl} token={token} defaultRole={defaultRole} roleScope={roleScope} />} />
      <Route path="company-admins" element={<CompanyAdminsReportPage apiUrl={apiUrl} token={token} />} />
      <Route path=":id" element={<UserDetailPage apiUrl={apiUrl} token={token} defaultRole={defaultRole} roleScope={roleScope} />} />
    </Routes>
  );
}
