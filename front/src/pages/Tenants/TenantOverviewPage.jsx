import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TenantOverviewTab from './tabs/TenantOverviewTab';

export default function TenantOverviewPage() {
  const { tenant, api, id, countriesById, currenciesById } = useOutletContext();
  
  const company = tenant?.data?.company || tenant?.company;
  const settings = tenant?.data?.settings || tenant?.settings;
  const wallet = tenant?.data?.wallet || tenant?.wallet;

  return (
    <TenantOverviewTab 
        api={api}
        companyId={id}
        company={company}
        settings={settings}
        wallet={wallet}
        countriesById={countriesById}
        currenciesById={currenciesById}
    />
  );
}
