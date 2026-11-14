import React, { useEffect, useMemo, useState } from 'react';
import { normalizePageResponse } from '../../../lib/pagination';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useToast } from "../../../components/ToastProvider";
import { useAuth } from "../../../context/AuthContext";
import { PLATFORM_ROLES } from "../../../lib/platformRoles";
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantSettingsTab({ companyId, api, onUpdate }) {
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({
    legal_name: '',
    trade_name: '',
    logo_url: '',
    country_id: '',
    default_currency_id: '',
    timezone_id: '',
    default_language: 'es',
    default_payment_cycle: 'monthly',
    status: 'active',
    read_only_mode: false,
    kyb_required: false,
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Critical Actions State
  const [actionModal, setActionModal] = useState({
    open: false,
    type: null, // 'suspend', 'activate', 'readonly_on', 'readonly_off'
    title: '',
    message: '',
    danger: false,
    loading: false
  });

  // Lookups
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [lookupsErr, setLookupsErr] = useState('');

  const countriesById = useMemo(() => {
    const m = new Map();
    for (const c of countries) m.set(Number(c.id), c);
    return m;
  }, [countries]);

  const currenciesById = useMemo(() => {
    const m = new Map();
    for (const c of currencies) m.set(Number(c.id), c);
    return m;
  }, [currencies]);

  const timezonesById = useMemo(() => {
    const m = new Map();
    for (const tz of timezones) m.set(Number(tz.id), tz);
    return m;
  }, [timezones]);

  async function loadLookups() {
    setLookupsLoading(true);
    setLookupsErr('');
    try {
      const [c1, c2, c3] = await Promise.all([
        api.get('/api/countries?page=1&per_page=500'),
        api.get('/api/currencies?page=1&per_page=500'),
        api.get('/api/timezones?page=1&per_page=2000'),
      ]);

      const outCountries = normalizePageResponse(c1);
      const outCurrencies = normalizePageResponse(c2);
      const outTimezones = normalizePageResponse(c3);

      setCountries(outCountries.items || []);
      setCurrencies(outCurrencies.items || []);
      setTimezones(outTimezones.items || []);
    } catch (e) {
      setLookupsErr(e?.message || t('tenants.admin.settings.lookupsError'));
    } finally {
      setLookupsLoading(false);
    }
  }

  async function loadTenant() {
    setErr('');
    try {
      const d = await api.get(`/api/tenants/${companyId}`);

      const company = d?.data?.company || d?.company || {};
      const settings = d?.data?.settings || d?.settings || {};

      if (company?.logo_url) {
        setLogoPreview(company.logo_url);
      }

      setForm({
        legal_name: company?.legal_name ?? '',
        trade_name: company?.trade_name ?? '',
        country_id: company?.country_id ?? '',
        default_currency_id: company?.default_currency_id ?? '',
        timezone_id: company?.timezone_id ?? '',
        default_language: settings?.default_language ?? 'es',
        default_payment_cycle: company?.default_payment_cycle ?? d?.payment_cycle?.type ?? 'monthly',
        status: company?.status || 'active',
        read_only_mode: settings?.read_only_mode === 1 || settings?.read_only_mode === true || settings?.read_only_mode === '1',
        kyb_required: company?.kyb_required === 1 || company?.kyb_required === true || company?.kyb_required === '1',
      });
    } catch (e) {
      setErr(e?.message || t('tenants.admin.settings.loadError'));
    }
  }

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const formData = new FormData();
      if (form.legal_name) formData.append('legal_name', form.legal_name);
      formData.append('trade_name', form.trade_name || '');
      formData.append('country_id', form.country_id);
      formData.append('default_currency_id', form.default_currency_id);
      formData.append('timezone_id', form.timezone_id);
      formData.append('default_language', form.default_language);
      formData.append('default_payment_cycle', form.default_payment_cycle);
      formData.append('kyb_required', form.kyb_required ? '1' : '0');

      if (logoFile) {
        formData.append('logo', logoFile);
      }

      await api.post(`/api/tenants/${companyId}/settings?_method=PUT`, formData);
      setMsg(t('tenants.admin.settings.savedSuccess'));
      loadTenant();
      if (typeof onUpdate === 'function') {
        onUpdate();
      }
    } catch (error) {
      setErr(error.message || t('tenants.admin.settings.saveError'));
    } finally {
      setSaving(false);
    }
  }

  // Critical Actions Handlers
  function openActionModal(type) {
    let title = '';
    let message = '';
    let danger = false;

    switch (type) {
      case 'suspend':
        title = t('tenants.admin.settings.modalSuspendTitle');
        message = t('tenants.admin.settings.modalSuspendMessage');
        danger = true;
        break;
      case 'activate':
        title = t('tenants.admin.settings.modalActivateTitle');
        message = t('tenants.admin.settings.modalActivateMessage');
        danger = false;
        break;
      case 'readonly_on':
        title = t('tenants.admin.settings.modalReadOnlyOnTitle');
        message = t('tenants.admin.settings.modalReadOnlyOnMessage');
        danger = true;
        break;
      case 'readonly_off':
        title = t('tenants.admin.settings.modalReadOnlyOffTitle');
        message = t('tenants.admin.settings.modalReadOnlyOffMessage');
        danger = false;
        break;
      default: return;
    }

    setActionModal({
      open: true,
      type,
      title,
      message,
      danger,
      loading: false
    });
  }

  async function confirmCriticalAction(reason) {
    setActionModal(prev => ({ ...prev, loading: true }));
    try {
      const { type } = actionModal;
      
      if (type === 'suspend') {
        await api.post(`/api/tenants/${companyId}/suspend`, { reason });
        toast.success(t('tenants.admin.settings.suspendSuccess'));
      } else if (type === 'activate') {
        await api.post(`/api/tenants/${companyId}/activate`, { reason });
        toast.success(t('tenants.admin.settings.activateSuccess'));
      } else if (type === 'readonly_on') {
        await api.put(`/api/tenants/${companyId}/settings`, { read_only_mode: 1, reason });
        toast.success(t('tenants.admin.settings.readOnlyOnSuccess'));
      } else if (type === 'readonly_off') {
        await api.put(`/api/tenants/${companyId}/settings`, { read_only_mode: 0, reason });
        toast.success(t('tenants.admin.settings.readOnlyOffSuccess'));
      }

      loadTenant();
      if (typeof onUpdate === 'function') {
        onUpdate();
      }
      setActionModal(prev => ({ ...prev, open: false }));
    } catch (e) {
      toast.error(e.message || t('tenants.admin.settings.actionError'));
      setActionModal(prev => ({ ...prev, loading: false }));
    }
  }

  async function handleExport() {
    try {
      const data = await api.get(`/api/tenants/${companyId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${companyId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('tenants.admin.settings.exportSuccess'));
    } catch (e) {
      if (e.status === 404) {
        try {
          const tenant = await api.get(`/api/tenants/${companyId}`);
          const contacts = await api.get(`/api/tenants/${companyId}/contacts?page=1&per_page=500`);
          const members = await api.get(`/api/tenants/${companyId}/members?page=1&per_page=500`);
          const payload = {
            generated_at: new Date().toISOString(),
            tenant,
            contacts,
            members,
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_${companyId}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success(t('tenants.admin.settings.exportSuccess'));
        } catch (e2) {
          toast.error(e2.message || t('tenants.admin.settings.exportError'));
        }
      } else {
        toast.error(e.message || t('tenants.admin.settings.exportError'));
      }
    }
  }

  const countryObj = form.country_id ? countriesById.get(Number(form.country_id)) : null;
  const currencyObj = form.default_currency_id ? currenciesById.get(Number(form.default_currency_id)) : null;
  const tzObj = form.timezone_id ? timezonesById.get(Number(form.timezone_id)) : null;

  const userRole = user?.role || user?.platform_role;
  const showAdminActions = [
    PLATFORM_ROLES.SUPER_ADMIN,
    PLATFORM_ROLES.ADMIN,
    PLATFORM_ROLES.SUPPORT,
    PLATFORM_ROLES.SECURITY,
    PLATFORM_ROLES.LEGAL,
    PLATFORM_ROLES.FINANCE
  ].includes(userRole);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Configuración General */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{t('tenants.admin.settings.generalTitle')}</h3>
          <p className="text-sm text-slate-500">{t('tenants.admin.settings.generalSubtitle')}</p>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {err && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <i className="bi bi-exclamation-triangle-fill" /> {err}
            </div>
          )}
          {msg && (
            <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <i className="bi bi-check-circle-fill" /> {msg}
            </div>
          )}
          
          {lookupsErr && (
            <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm flex items-center gap-2">
              <i className="bi bi-exclamation-circle" /> {lookupsErr}
              <button type="button" onClick={loadLookups} className="underline ml-2">{t('tenants.admin.settings.retry')}</button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Logo */}
            <div className="md:col-span-2 flex items-center gap-6">
                <div className="shrink-0">
                    <div className="h-24 w-24 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group">
                        {logoPreview ? (
                            <img src={logoPreview} alt={t('tenants.admin.settings.logoAlt')} className="h-full w-full object-cover" />
                        ) : (
                            <i className="bi bi-building text-3xl text-slate-300" />
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <i className="bi bi-camera text-white text-xl" />
                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                        </label>
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-slate-900">{t('tenants.admin.settings.logoTitle')}</h4>
                    <p className="text-xs text-slate-500 mb-2">{t('tenants.admin.settings.logoHelp')}</p>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <i className="bi bi-upload" /> {t('tenants.admin.settings.uploadLogo')}
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                    </label>
                </div>
            </div>

            {/* Datos Legales */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.legalName')}</label>
              <input
                type="text"
                required
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.tradeName')}</label>
              <input
                type="text"
                value={form.trade_name}
                onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              />
            </div>

            {/* País */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.country')}</label>
              <select
                required
                value={form.country_id}
                onChange={(e) => setForm({ ...form, country_id: e.target.value })}
                disabled={lookupsLoading || !countries.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">{t('tenants.admin.settings.selectCountry')}</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.iso2} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Moneda */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.baseCurrency')}</label>
              <select
                required
                value={form.default_currency_id}
                onChange={(e) => setForm({ ...form, default_currency_id: e.target.value })}
                disabled={lookupsLoading || !currencies.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">{t('tenants.admin.settings.selectCurrency')}</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Zona Horaria */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.timezone')}</label>
              <select
                value={form.timezone_id}
                onChange={(e) => setForm({ ...form, timezone_id: e.target.value })}
                disabled={lookupsLoading || !timezones.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">{t('tenants.admin.settings.selectTimezone')}</option>
                {timezones.map((tz) => (
                  <option key={tz.id} value={tz.id}>{tz.name}</option>
                ))}
              </select>
            </div>

            {/* Idioma */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.language')}</label>
              <select
                value={form.default_language}
                onChange={(e) => setForm({ ...form, default_language: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="es">{t('tenants.admin.settings.languageSpanish')}</option>
                <option value="en">{t('tenants.admin.settings.languageEnglish')}</option>
              </select>
            </div>

            {/* Ciclo */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.admin.settings.paymentCycle')}</label>
              <select
                value={form.default_payment_cycle}
                onChange={(e) => setForm({ ...form, default_payment_cycle: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="weekly">{t('tenants.admin.settings.weekly')}</option>
                <option value="biweekly">{t('tenants.admin.settings.biweekly')}</option>
                <option value="monthly">{t('tenants.admin.settings.monthly')}</option>
              </select>
            </div>

            {/* Requerimiento KYB */}
            {showAdminActions && (
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.kyb_required}
                    onChange={(e) => setForm({ ...form, kyb_required: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{t('tenants.admin.settings.kybRequiredTitle')}</span>
                    <span className="block text-xs text-slate-500 mt-1">{t('tenants.admin.settings.kybRequiredDescription')}</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? t('tenants.common.saving') : t('tenants.admin.settings.saveChanges')}
            </button>
          </div>
        </form>
      </div>

      {/* Acciones Administrativas */}
      {showAdminActions && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-base font-semibold text-slate-900">{t('tenants.admin.settings.adminActionsTitle')}</h3>
            <p className="text-sm text-slate-500">{t('tenants.admin.settings.adminActionsSubtitle')}</p>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Read Only Mode */}
            <div className="p-6 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-900">{t('tenants.admin.settings.readOnlyTitle')}</h4>
                <p className="text-sm text-slate-500 mt-1">
                  {t('tenants.admin.settings.readOnlyDescription')}
                </p>
              </div>
              <button
                onClick={() => openActionModal(form.read_only_mode ? 'readonly_off' : 'readonly_on')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${form.read_only_mode ? 'bg-brand' : 'bg-slate-200'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.read_only_mode ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {/* Export Data */}
            <div className="p-6 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-900">{t('tenants.admin.settings.exportTitle')}</h4>
                <p className="text-sm text-slate-500 mt-1">
                  {t('tenants.admin.settings.exportDescription')}
                </p>
              </div>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <i className="bi bi-download" />
                {t('tenants.admin.settings.exportButton')}
              </button>
            </div>

            {/* Suspend / Activate */}
            <div className={`p-6 flex items-center justify-between gap-4 ${form.status === 'suspended' ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
              <div>
                <h4 className={`text-sm font-medium ${form.status === 'suspended' ? 'text-emerald-900' : 'text-red-900'}`}>
                  {form.status === 'suspended' ? t('tenants.admin.settings.reactivateCompany') : t('tenants.admin.settings.suspendCompany')}
                </h4>
                <p className={`text-sm mt-1 ${form.status === 'suspended' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {form.status === 'suspended' 
                    ? t('tenants.admin.settings.reactivateDescription')
                    : t('tenants.admin.settings.suspendDescription')}
                </p>
              </div>
              <button
                onClick={() => openActionModal(form.status === 'suspended' ? 'activate' : 'suspend')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm
                  ${form.status === 'suspended' 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500' 
                    : 'bg-white border border-red-200 text-red-700 hover:bg-red-50 focus:ring-red-500'}`}
              >
                <i className={`bi ${form.status === 'suspended' ? 'bi-play-circle' : 'bi-pause-circle'}`} />
                {form.status === 'suspended' ? t('tenants.admin.settings.reactivateButton') : t('tenants.admin.settings.suspendButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CriticalActionModal
        open={actionModal.open}
        title={actionModal.title}
        message={actionModal.message}
        danger={actionModal.danger}
        loading={actionModal.loading}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        onConfirm={confirmCriticalAction}
      />
    </div>
  );
}
