import React from 'react';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantReportsTab({ tenant }) {
  const { t } = useI18n();
  const metrics = [
    t('tenants.operations.reports.metricProjectCosts'),
    t('tenants.operations.reports.metricHires'),
    t('tenants.operations.reports.metricTurnover'),
    t('tenants.operations.reports.metricTaxCompliance'),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('tenants.operations.reports.title')}</h2>
          <p className="text-sm text-slate-500">{t('tenants.operations.reports.subtitle')}</p>
        </div>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <i className="bi bi-download mr-2" />
          {t('tenants.operations.reports.exportCsv')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <dt className="truncate text-sm font-medium text-slate-500">{metric}</dt>
            <dd className="mt-2 text-3xl font-semibold text-slate-900">--</dd>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">{t('tenants.operations.reports.selectDateRange')}</p>
      </div>
    </div>
  );
}
