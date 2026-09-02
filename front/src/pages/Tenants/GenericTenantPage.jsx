import React from 'react';
import { useOutletContext } from 'react-router-dom';

export default function GenericTenantPage({ Component }) {
  const { api, id, tenant, countries } = useOutletContext();
  // Pass common props. Some tabs use tenantId, some companyId. Passing both is safe.
  // Also pass tenant object just in case.
  return <Component api={api} tenantId={id} companyId={id} tenant={tenant} countries={countries} />;
}
