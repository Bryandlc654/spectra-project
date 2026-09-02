import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TenantSettingsTab from './tabs/TenantSettingsTab';

export default function TenantSettingsPage() {
  const { api, id, loadTenant } = useOutletContext();

  return (
    <TenantSettingsTab 
        api={api} 
        companyId={id} 
        onUpdate={loadTenant}
    />
  );
}
