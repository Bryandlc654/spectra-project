import React, { useState, useEffect } from 'react';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantAuditTab({ api, companyId }) {
  const toast = useToast();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [companyId]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const data = await api.get(`/api/tenants/${companyId}/logs`);
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error(t('tenants.admin.audit.loadError'));
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    if (!logs.length) return;
    
    const headers = [
      t('tenants.common.date'),
      t('tenants.admin.audit.action'),
      t('tenants.admin.audit.user'),
      t('tenants.common.email'),
      t('tenants.common.description'),
      t('tenants.admin.audit.ip'),
    ];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => [
        `"${new Date(log.created_at).toLocaleString(locale)}"`,
        `"${log.action}"`,
        `"${log.actor_name || t('tenants.admin.audit.system')}"`,
        `"${log.actor_email || ''}"`,
        `"${(log.description || '').replace(/"/g, '""')}"`,
        `"${log.ip || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${t('tenants.admin.audit.exportFilePrefix')}_${companyId}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">{t('tenants.admin.audit.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">{t('tenants.admin.audit.title')}</h3>
            <div className="flex gap-2">
                <input type="text" placeholder={t('tenants.admin.audit.filterPlaceholder')} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand" />
                <button 
                  onClick={handleExport}
                  disabled={logs.length === 0}
                  className="text-sm font-semibold text-brand hover:underline disabled:text-slate-400 disabled:no-underline"
                >
                  {t('tenants.admin.audit.export')}
                </button>
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold">
              <tr>
                <th className="px-6 py-3">{t('tenants.common.date')}</th>
                <th className="px-6 py-3">{t('tenants.admin.audit.action')}</th>
                <th className="px-6 py-3">{t('tenants.admin.audit.user')}</th>
                <th className="px-6 py-3">{t('tenants.common.description')}</th>
                <th className="px-6 py-3">{t('tenants.admin.audit.ip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    {t('tenants.admin.audit.empty')}
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(locale)}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900">{log.action}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {log.actor_name ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{log.actor_name}</span>
                          <span className="text-xs text-slate-500">{log.actor_email}</span>
                        </div>
                      ) : (
                        <span className="italic text-slate-400">{t('tenants.admin.audit.system')}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{log.description || '-'}</td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
