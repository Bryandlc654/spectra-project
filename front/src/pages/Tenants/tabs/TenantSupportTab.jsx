import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantSupportTab({ companyId, api }) {
  const toast = useToast();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const safeApi = useMemo(() => api, [api]);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        // Try to fetch tickets for this tenant
        // Assuming endpoint exists or using global tickets with filter
        // If this endpoint 404s, we might need to adjust backend or use different approach
        const res = await safeApi.get(`/api/tenants/${companyId}/tickets`);
        
        if (!cancelled) {
          setTickets(Array.isArray(res) ? res : (res.data || []));
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Could not load tenant tickets', e);
          setErr(t('tenants.admin.support.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [safeApi, companyId]);

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString(locale);
    } catch {
      return value;
    }
  };

  const statusLabels = {
    open: t('tenants.admin.support.statusOpen'),
    closed: t('tenants.admin.support.statusClosed'),
    resolved: t('tenants.admin.support.statusResolved'),
    pending: t('tenants.common.pending'),
  };

  const priorityLabels = {
    low: t('tenants.admin.support.priorityLow'),
    medium: t('tenants.admin.support.priorityMedium'),
    high: t('tenants.admin.support.priorityHigh'),
    urgent: t('tenants.admin.support.priorityUrgent'),
  };

  const renderStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    let cls = 'bg-slate-100 text-slate-700';
    if (s === 'open') cls = 'bg-blue-50 text-blue-700';
    else if (s === 'closed') cls = 'bg-slate-100 text-slate-500';
    else if (s === 'resolved') cls = 'bg-emerald-50 text-emerald-700';
    else if (s === 'pending') cls = 'bg-amber-50 text-amber-700';
    
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
        {statusLabels[s] || status || t('tenants.common.unknown')}
      </span>
    );
  };

  const renderPriority = (priority) => {
    const p = String(priority || '').toLowerCase();
    return priorityLabels[p] || priority || t('tenants.admin.support.defaultPriority');
  };

  if (!safeApi?.get) return null;

  if (loading && !tickets.length && !err) {
    return <div className="py-8 text-center text-slate-500">{t('tenants.admin.support.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t('tenants.admin.support.title')}</h3>
          <p className="text-xs text-slate-500">{t('tenants.admin.support.subtitle')}</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {err}
        </div>
      )}

      {!tickets.length && !loading && !err && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {t('tenants.admin.support.empty')}
        </div>
      )}

      {tickets.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{t('tenants.admin.support.colSubject')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.admin.support.colPriority')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.common.status')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.common.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{ticket.subject || ticket.title}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{renderPriority(ticket.priority)}</td>
                  <td className="px-4 py-3">{renderStatusBadge(ticket.status)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(ticket.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
