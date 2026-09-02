import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TenantRolesTab from './tabs/TenantRolesTab';

export default function TenantRolesPage() {
  const { id, apiUrl, token } = useOutletContext();

  return (
    <TenantRolesTab 
        companyId={id} 
        apiUrl={apiUrl}
        token={token}
    />
  );
}
