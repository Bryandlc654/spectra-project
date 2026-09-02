import React, { useEffect, useMemo, useState } from 'react';
import { normalizePageResponse } from '../../../lib/pagination';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useToast } from "../../../components/ToastProvider";
import { useAuth } from "../../../context/AuthContext";
import { PLATFORM_ROLES } from "../../../lib/platformRoles";

export default function TenantSettingsTab({ companyId, api, onUpdate }) {
  const toast = useToast();
  const { user } = useAuth();
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
    for (const t of timezones) m.set(Number(t.id), t);
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
      setLookupsErr(e?.message || 'No se pudieron cargar los catálogos');
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
        country_id: company?.country_id ?? '',
        default_currency_id: company?.default_currency_id ?? '',
        timezone_id: company?.timezone_id ?? '',
        default_language: settings?.default_language ?? 'es',
        default_payment_cycle: company?.default_payment_cycle ?? d?.payment_cycle?.type ?? 'monthly',
        status: company?.status || 'active',
        read_only_mode: settings?.read_only_mode === 1 || settings?.read_only_mode === true || settings?.read_only_mode === '1',
      });
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar la configuración');
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
      formData.append('legal_name', form.legal_name);
      formData.append('trade_name', form.trade_name || '');
      formData.append('country_id', form.country_id);
      formData.append('default_currency_id', form.default_currency_id);
      formData.append('timezone_id', form.timezone_id);
      formData.append('default_language', form.default_language);
      formData.append('default_payment_cycle', form.default_payment_cycle);

      if (logoFile) {
        formData.append('logo', logoFile);
      }

      await api.post(`/api/tenants/${companyId}/settings?_method=PUT`, formData);
      setMsg('Configuración guardada correctamente');
      loadTenant();
      if (typeof onUpdate === 'function') {
        onUpdate();
      }
    } catch (error) {
      setErr(error.message || 'Error guardando cambios');
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
        title = 'Suspender Empresa';
        message = 'La empresa perderá acceso al sistema inmediatamente. Los usuarios no podrán iniciar sesión. ¿Estás seguro?';
        danger = true;
        break;
      case 'activate':
        title = 'Reactivar Empresa';
        message = 'La empresa volverá a tener acceso al sistema. ¿Confirmar reactivación?';
        danger = false;
        break;
      case 'readonly_on':
        title = 'Activar Modo Solo Lectura';
        message = 'Se bloqueará la creación de nuevos contratos, pagos y otros registros. Solo se permitirá la consulta de datos. ¿Confirmar?';
        danger = true;
        break;
      case 'readonly_off':
        title = 'Desactivar Modo Solo Lectura';
        message = 'Se restablecerá la capacidad de crear registros en la empresa. ¿Confirmar?';
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
        toast.success('Empresa suspendida correctamente');
      } else if (type === 'activate') {
        await api.post(`/api/tenants/${companyId}/activate`, { reason });
        toast.success('Empresa reactivada correctamente');
      } else if (type === 'readonly_on') {
        await api.put(`/api/tenants/${companyId}/settings`, { read_only_mode: 1, reason });
        toast.success('Modo solo lectura activado');
      } else if (type === 'readonly_off') {
        await api.put(`/api/tenants/${companyId}/settings`, { read_only_mode: 0, reason });
        toast.success('Modo solo lectura desactivado');
      }

      loadTenant();
      if (typeof onUpdate === 'function') {
        onUpdate();
      }
      setActionModal(prev => ({ ...prev, open: false }));
    } catch (e) {
      toast.error(e.message || 'Error ejecutando acción');
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
      toast.success('Export generado correctamente');
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
          toast.success('Export generado correctamente');
        } catch (e2) {
          toast.error(e2.message || 'No se pudo exportar los datos');
        }
      } else {
        toast.error(e.message || 'No se pudo exportar los datos');
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
          <h3 className="text-base font-semibold text-slate-900">Configuración General</h3>
          <p className="text-sm text-slate-500">Ajustes regionales y de localización</p>
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
              <button type="button" onClick={loadLookups} className="underline ml-2">Reintentar</button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Logo */}
            <div className="md:col-span-2 flex items-center gap-6">
                <div className="shrink-0">
                    <div className="h-24 w-24 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group">
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
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
                    <h4 className="text-sm font-semibold text-slate-900">Logotipo de la Empresa</h4>
                    <p className="text-xs text-slate-500 mb-2">Se recomienda formato PNG o JPG, tamaño mínimo 200x200px.</p>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <i className="bi bi-upload" /> Subir Logo
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                    </label>
                </div>
            </div>

            {/* Datos Legales */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social</label>
              <input
                type="text"
                required
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={form.trade_name}
                onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              />
            </div>

            {/* País */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select
                required
                value={form.country_id}
                onChange={(e) => setForm({ ...form, country_id: e.target.value })}
                disabled={lookupsLoading || !countries.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">Selecciona un país</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.iso2} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Moneda */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Moneda Base</label>
              <select
                required
                value={form.default_currency_id}
                onChange={(e) => setForm({ ...form, default_currency_id: e.target.value })}
                disabled={lookupsLoading || !currencies.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">Selecciona una moneda</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Zona Horaria */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Zona Horaria</label>
              <select
                required
                value={form.timezone_id}
                onChange={(e) => setForm({ ...form, timezone_id: e.target.value })}
                disabled={lookupsLoading || !timezones.length}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="">Selecciona una zona</option>
                {timezones.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Idioma */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Idioma</label>
              <select
                value={form.default_language}
                onChange={(e) => setForm({ ...form, default_language: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>

            {/* Ciclo */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Ciclo de pago por defecto</label>
              <select
                value={form.default_payment_cycle}
                onChange={(e) => setForm({ ...form, default_payment_cycle: e.target.value })}
                className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand/10"
              >
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* Acciones Administrativas */}
      {showAdminActions && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-base font-semibold text-slate-900">Acciones Administrativas</h3>
            <p className="text-sm text-slate-500">Gestión avanzada y zonas de peligro</p>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Read Only Mode */}
            <div className="p-6 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-900">Modo Solo Lectura</h4>
                <p className="text-sm text-slate-500 mt-1">
                  Bloquea la creación de nuevos contratos, pagos y registros. Solo permite consultas.
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
                <h4 className="text-sm font-medium text-slate-900">Exportar Datos</h4>
                <p className="text-sm text-slate-500 mt-1">
                  Descarga un archivo JSON con toda la información de la empresa.
                </p>
              </div>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <i className="bi bi-download" />
                Exportar
              </button>
            </div>

            {/* Suspend / Activate */}
            <div className={`p-6 flex items-center justify-between gap-4 ${form.status === 'suspended' ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
              <div>
                <h4 className={`text-sm font-medium ${form.status === 'suspended' ? 'text-emerald-900' : 'text-red-900'}`}>
                  {form.status === 'suspended' ? 'Reactivar Empresa' : 'Suspender Empresa'}
                </h4>
                <p className={`text-sm mt-1 ${form.status === 'suspended' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {form.status === 'suspended' 
                    ? 'Restaurar el acceso completo a la plataforma para todos los usuarios.'
                    : 'La empresa perderá acceso inmediato al sistema. Se requiere justificación.'}
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
                {form.status === 'suspended' ? 'Reactivar' : 'Suspender'}
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
