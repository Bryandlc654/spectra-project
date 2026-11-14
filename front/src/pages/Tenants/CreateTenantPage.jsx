import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import { normalizePageResponse } from '../../lib/pagination';
import { useI18n } from '../../i18n/I18nContext';

function StepIndicator({ currentStep, steps }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between relative max-w-2xl mx-auto">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-10" />
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;

          return (
            <div key={stepNum} className="flex flex-col items-center gap-2 bg-white px-2">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all border-2 ${
                  isActive
                    ? 'bg-brand text-white border-brand ring-4 ring-brand/20'
                    : isCompleted
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {isCompleted ? <i className="bi bi-check-lg" /> : stepNum}
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isActive ? 'text-brand' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CreateTenantPage({ apiUrl, token }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  
  // Lookups
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Basic
    legal_name: '',
    trade_name: '',
    country_id: '',
    status: 'active', // active, pending, suspended
    default_currency_id: '',
    timezone_id: '',
    logo: null, // Nuevo campo para logo
    
    // Step 2: Fiscal
    tax_id: '',
    invoice_series: 'F001',
    invoice_number_start: 1,

    // Step 3: Owner
    owner_mode: 'create', // create, invite
    owner_email: '',
    owner_name: '', // only if create
    
    // Step 4: Init
    create_default_roles: true,
    activate_templates: true,
    kyb_required: true,
  });

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line
  }, []);

  async function loadLookups() {
    setLookupsLoading(true);
    try {
      const [cRes, curRes, tzRes] = await Promise.all([
        api.get('/api/countries?per_page=200'),
        api.get('/api/currencies?per_page=200'),
        api.get('/api/timezones?per_page=200'),
      ]);

      setCountries(normalizePageResponse(cRes).items);
      setCurrencies(normalizePageResponse(curRes).items);
      setTimezones(normalizePageResponse(tzRes).items);
    } catch (e) {
      toast.error(t('tenants.detail.create.catalogLoadError', { error: e.message }));
    } finally {
      setLookupsLoading(false);
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Zona horaria sugerida por país (el usuario puede cambiarla)
  const COUNTRY_TZ = { PE: 'America/Lima', CL: 'America/Santiago', CO: 'America/Bogota', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires', US: 'America/New_York', EC: 'America/Guayaquil' };
  const handleCountryChange = (countryId) => {
    const country = countries.find(c => String(c.id) === String(countryId));
    const code = String(country?.iso2 || country?.code || '').toUpperCase();
    const tz = timezones.find(z => (z.name || z.identifier || z.tz) === COUNTRY_TZ[code]);
    setFormData(prev => ({ ...prev, country_id: countryId, timezone_id: tz ? String(tz.id) : prev.timezone_id }));
  };

  // Step 1 Validation
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const emailValid = EMAIL_RE.test(String(formData.owner_email || '').trim());
  const [logoError, setLogoError] = useState('');
  const canNextStep1 = formData.legal_name.trim() && formData.country_id && formData.default_currency_id && !logoError;
  // Campos obligatorios que faltan en el paso actual (se muestran junto a "Siguiente")
  const missingFields = step === 1
    ? [
        !formData.legal_name.trim() && t('tenants.detail.create.legalNameLabel'),
        !formData.country_id && t('tenants.detail.create.countryLabel'),
        !formData.default_currency_id && t('tenants.detail.create.baseCurrencyLabel'),
      ].filter(Boolean)
    : step === 3
      ? [
          (!formData.owner_email ? t('tenants.detail.create.adminEmailLabel') : (!emailValid && t('tenants.detail.create.validEmail'))),
          formData.owner_mode !== 'invite' && !formData.owner_name && t('tenants.detail.create.ownerNameLabel'),
        ].filter(Boolean)
      : [];
  
  // Step 2 Validation
  const canNextStep2 = true; 
  
  // Step 3 Validation
  const canNextStep3 = emailValid && (formData.owner_mode === 'invite' || formData.owner_name.trim());

  async function handleSubmit() {
    setLoading(true);
    try {
      // Construct payload
      const payload = {
        ...formData,
        country_id: Number(formData.country_id),
        default_currency_id: Number(formData.default_currency_id),
        timezone_id: formData.timezone_id ? Number(formData.timezone_id) : undefined,
        invoice_number_start: Number(formData.invoice_number_start),
      };

      const data = new FormData();
      Object.keys(payload).forEach(key => {
        if (payload[key] !== null && payload[key] !== undefined) {
             data.append(key, payload[key]);
        }
      });

      await api.post('/api/tenants/wizard', data);

      toast.success(t('tenants.detail.create.createSuccess'));
      navigate('/dashboard/tenants');
    } catch (e) {
      console.error(e);
      toast.error(e.message || t('tenants.detail.create.createError'));
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { label: t('tenants.detail.create.steps.basic') },
    { label: t('tenants.detail.create.steps.tax') },
    { label: t('tenants.detail.create.steps.admin') },
    { label: t('tenants.detail.create.steps.confirm') },
  ];

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900">{t('tenants.detail.create.title')}</h1>
        <p className="text-slate-500 mt-2">{t('tenants.detail.create.subtitle')}</p>
      </div>

      <StepIndicator currentStep={step} steps={steps} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 transition-all">
        {/* STEP 1: Datos Básicos */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-xl font-bold text-slate-900">{t('tenants.detail.create.orgTitle')}</h2>
                <p className="text-sm text-slate-500">{t('tenants.detail.create.orgSubtitle')}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label htmlFor="tenant-logo" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.logoLabel')}</label>
                <div className="relative">
                  <input
                    id="tenant-logo"
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    aria-describedby="tenant-logo-hint"
                    onChange={e => {
                      const file = e.target.files[0] || null;
                      if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                        setLogoError(t('tenants.detail.create.logoInvalidType'));
                        handleChange('logo', null);
                      } else if (file && file.size > 2 * 1024 * 1024) {
                        setLogoError(t('tenants.detail.create.logoTooBig'));
                        handleChange('logo', null);
                      } else {
                        setLogoError('');
                        handleChange('logo', file);
                      }
                    }}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand/10 file:text-brand hover:file:bg-brand/20"
                  />
                  <p id="tenant-logo-hint" className="text-xs text-slate-400 mt-1">{t('tenants.detail.create.logoHint')}</p>
                  {logoError && <p className="text-xs text-red-600 mt-1" role="alert">{logoError}</p>}
                </div>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="tenant-legal-name" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.legalNameLabel')} <span className="text-red-500">*</span></label>
                <div className="relative">
                    <i className="bi bi-building absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    value={formData.legal_name}
                    id="tenant-legal-name"
                    onChange={e => handleChange('legal_name', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder={t('tenants.detail.create.legalNamePlaceholder')}
                    autoFocus
                    />
                </div>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="tenant-trade-name" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.tradeNameLabel')}</label>
                <div className="relative">
                    <i className="bi bi-shop absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    value={formData.trade_name}
                    id="tenant-trade-name"
                    onChange={e => handleChange('trade_name', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder={t('tenants.common.optional')}
                    />
                </div>
              </div>

              <div>
                <label htmlFor="tenant-country" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.countryLabel')} <span className="text-red-500">*</span></label>
                <select
                  value={formData.country_id}
                    id="tenant-country"
                  onChange={e => handleCountryChange(e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">{t('tenants.detail.create.selectCountry')}</option>
                  {countries.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tenant-currency" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.baseCurrencyLabel')} <span className="text-red-500">*</span></label>
                <select
                  value={formData.default_currency_id}
                    id="tenant-currency"
                  onChange={e => handleChange('default_currency_id', e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">{t('tenants.detail.create.selectCurrency')}</option>
                  {currencies.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tenant-timezone" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.timezoneLabel')}</label>
                <select
                  id="tenant-timezone"
                  value={formData.timezone_id}
                  onChange={e => handleChange('timezone_id', e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">{t('tenants.detail.create.selectTimezone')}</option>
                  {timezones.map(z => (
                    <option key={z.id} value={z.id}>{z.name || z.identifier || z.tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tenant-status" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.initialStatusLabel')}</label>
                <select
                  value={formData.status}
                    id="tenant-status"
                  onChange={e => handleChange('status', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="active">{t('tenants.common.active')}</option>
                  <option value="pending">{t('tenants.detail.create.pendingApproval')}</option>
                  <option value="suspended">{t('tenants.common.suspended')}</option>
                </select>
              </div>

            </div>
          </div>
        )}

        {/* STEP 2: Configuración Fiscal */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <div>
                <h2 className="text-xl font-bold text-slate-900">{t('tenants.detail.create.taxTitle')}</h2>
                <p className="text-sm text-slate-500">{t('tenants.detail.create.taxSubtitle')}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label htmlFor="tenant-tax-id" className="block text-sm font-semibold text-slate-700 mb-1">Tax ID / RUC / RFC</label>
                <div className="relative">
                    <i className="bi bi-card-text absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    id="tenant-tax-id"
                    value={formData.tax_id}
                    onChange={e => handleChange('tax_id', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder={t('tenants.detail.create.taxIdPlaceholder')}
                    />
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STEP 3: Owner / Admin */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-xl font-bold text-slate-900">{t('tenants.detail.create.adminTitle')}</h2>
                <p className="text-sm text-slate-500">{t('tenants.detail.create.adminSubtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={`relative flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${formData.owner_mode === 'create' ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300'}`}>
                <input
                  type="radio"
                  name="owner_mode"
                  checked={formData.owner_mode === 'create'}
                  onChange={() => handleChange('owner_mode', 'create')}
                  className="absolute top-4 right-4 text-brand focus:ring-brand"
                />
                <i className="bi bi-person-plus text-2xl text-brand mb-2"></i>
                <span className="font-semibold text-slate-800">{t('tenants.detail.create.createUserTitle')}</span>
                <span className="text-xs text-slate-500 mt-1">{t('tenants.detail.create.createUserHint')}</span>
              </label>

              <label className={`relative flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${formData.owner_mode === 'invite' ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300'}`}>
                <input
                  type="radio"
                  name="owner_mode"
                  checked={formData.owner_mode === 'invite'}
                  onChange={() => handleChange('owner_mode', 'invite')}
                  className="absolute top-4 right-4 text-brand focus:ring-brand"
                />
                <i className="bi bi-envelope-paper text-2xl text-brand mb-2"></i>
                <span className="font-semibold text-slate-800">{t('tenants.detail.create.inviteUserTitle')}</span>
                <span className="text-xs text-slate-500 mt-1">{t('tenants.detail.create.inviteUserHint')}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="md:col-span-2">
                <label htmlFor="tenant-owner-email" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.adminEmailLabel')} <span className="text-red-500">*</span></label>
                <div className="relative">
                  <i className="bi bi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    id="tenant-owner-email"
                    value={formData.owner_email}
                    onChange={e => handleChange('owner_email', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                    placeholder={t('tenants.detail.create.adminEmailPlaceholder')}
                  />
                </div>
              </div>

              {formData.owner_mode === 'create' && (
                <div className="md:col-span-2">
                  <label htmlFor="tenant-owner-name" className="block text-sm font-semibold text-slate-700 mb-1">{t('tenants.detail.create.ownerNameLabel')} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <i className="bi bi-person absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="tenant-owner-name"
                      value={formData.owner_name}
                      onChange={e => handleChange('owner_name', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                      placeholder={t('tenants.detail.create.ownerNamePlaceholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Inicialización */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <div>
                <h2 className="text-xl font-bold text-slate-900">{t('tenants.detail.create.initTitle')}</h2>
                <p className="text-sm text-slate-500">{t('tenants.detail.create.initSubtitle')}</p>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition group">
                <div className="flex h-6 items-center">
                    <input
                    type="checkbox"
                    checked={formData.create_default_roles}
                    onChange={e => handleChange('create_default_roles', e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand transition"
                    />
                </div>
                <div>
                  <span className="block font-semibold text-slate-800 group-hover:text-brand transition">{t('tenants.detail.create.defaultRolesTitle')}</span>
                  <span className="block text-sm text-slate-500 mt-1">{t('tenants.detail.create.defaultRolesHint')}</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition group">
                <div className="flex h-6 items-center">
                    <input
                    type="checkbox"
                    checked={formData.activate_templates}
                    onChange={e => handleChange('activate_templates', e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand transition"
                    />
                </div>
                <div>
                  <span className="block font-semibold text-slate-800 group-hover:text-brand transition">{t('tenants.detail.create.templatesTitle')}</span>
                  <span className="block text-sm text-slate-500 mt-1">{t('tenants.detail.create.templatesHint')}</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition group">
                <div className="flex h-6 items-center">
                    <input
                    type="checkbox"
                    checked={formData.kyb_required}
                    onChange={e => handleChange('kyb_required', e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand transition"
                    />
                </div>
                <div>
                  <span className="block font-semibold text-slate-800 group-hover:text-brand transition">{t('tenants.detail.create.kybRequiredTitle')}</span>
                  <span className="block text-sm text-slate-500 mt-1">{t('tenants.detail.create.kybRequiredHint')}</span>
                </div>
              </label>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">{t('tenants.detail.create.summaryTitle')}</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6 text-sm">
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">{t('tenants.detail.company')}</dt>
                  <dd className="font-semibold text-slate-900 text-base mt-0.5">{formData.legal_name}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">{t('tenants.detail.create.summaryLocation')}</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {countries.find(c => String(c.id) === formData.country_id)?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">{t('tenants.common.currency')}</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {currencies.find(c => String(c.id) === formData.default_currency_id)?.code}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">{t('tenants.detail.create.summaryAdmin')}</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{formData.owner_email}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
            onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/dashboard/tenants')}
            className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-2"
            disabled={loading}
            >
            {step > 1 ? <i className="bi bi-arrow-left" /> : <i className="bi bi-x-lg" />}
            {step > 1 ? t('tenants.common.previous') : t('tenants.common.cancel')}
            </button>

            {step < 4 ? (
            <div className="flex items-center gap-3">
            {missingFields.length > 0 && (
              <p className="text-xs text-slate-500" role="status" aria-live="polite">
                {t('tenants.detail.create.missingFields')}: {missingFields.join(', ')}
              </p>
            )}
            <button
                onClick={() => setStep(s => s + 1)}
                disabled={
                (step === 1 && !canNextStep1) ||
                (step === 2 && !canNextStep2) ||
                (step === 3 && !canNextStep3)
                }
                className="px-6 py-2.5 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2 shadow-lg shadow-brand/20"
            >
                {t('tenants.common.next')}
                <i className="bi bi-arrow-right" />
            </button>
            </div>
            ) : (
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-70 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
                {loading ? (
                <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('tenants.detail.create.creating')}
                </>
                ) : (
                <>
                    <i className="bi bi-check-lg" />
                    {t('tenants.detail.create.submit')}
                </>
                )}
            </button>
            )}
        </div>
      </div>
    </div>
  );
}
