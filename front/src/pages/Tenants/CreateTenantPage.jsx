import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import { normalizePageResponse } from '../../lib/pagination';

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
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  
  // Lookups
  const [countries, setCountries] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Basic
    legal_name: '',
    trade_name: '',
    country_id: '',
    timezone_id: '',
    status: 'active', // active, pending, suspended
    default_currency_id: '',
    logo: null, // Nuevo campo para logo
    per_freelancer_fee: '',
    
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
  });

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line
  }, []);

  async function loadLookups() {
    setLookupsLoading(true);
    try {
      const [cRes, tRes, curRes] = await Promise.all([
        api.get('/api/countries?per_page=200'),
        api.get('/api/timezones?per_page=200'),
        api.get('/api/currencies?per_page=200'),
      ]);

      setCountries(normalizePageResponse(cRes).items);
      setTimezones(normalizePageResponse(tRes).items);
      setCurrencies(normalizePageResponse(curRes).items);
    } catch (e) {
      toast.error('Error cargando catálogos: ' + e.message);
    } finally {
      setLookupsLoading(false);
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Step 1 Validation
  const canNextStep1 = formData.legal_name && formData.country_id && formData.timezone_id && formData.default_currency_id;
  
  // Step 2 Validation
  const canNextStep2 = true; 
  
  // Step 3 Validation
  const canNextStep3 = formData.owner_email && (formData.owner_mode === 'invite' || formData.owner_name);

  async function handleSubmit() {
    setLoading(true);
    try {
      // Construct payload
      const payload = {
        ...formData,
        country_id: Number(formData.country_id),
        timezone_id: Number(formData.timezone_id),
        default_currency_id: Number(formData.default_currency_id),
        invoice_number_start: Number(formData.invoice_number_start),
      };

      const data = new FormData();
      Object.keys(payload).forEach(key => {
        if (payload[key] !== null && payload[key] !== undefined) {
             data.append(key, payload[key]);
        }
      });

      await api.post('/api/tenants/wizard', data);

      toast.success('Empresa creada y configurada correctamente');
      navigate('/dashboard/tenants');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Error al crear la empresa');
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { label: 'Básico' },
    { label: 'Fiscal' },
    { label: 'Admin' },
    { label: 'Confirmar' },
  ];

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Nueva Empresa</h1>
        <p className="text-slate-500 mt-2">Configura una nueva organización en la plataforma paso a paso.</p>
      </div>

      <StepIndicator currentStep={step} steps={steps} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 transition-all">
        {/* STEP 1: Datos Básicos */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-xl font-bold text-slate-900">Datos de la Organización</h2>
                <p className="text-sm text-slate-500">Información legal y configuración regional.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Logotipo</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={e => handleChange('logo', e.target.files[0])}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand/10 file:text-brand hover:file:bg-brand/20"
                  />
                  <p className="text-xs text-slate-400 mt-1">Formatos: PNG, JPG, WEBP. Máx 2MB.</p>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Razón Social <span className="text-red-500">*</span></label>
                <div className="relative">
                    <i className="bi bi-building absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    value={formData.legal_name}
                    onChange={e => handleChange('legal_name', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder="Ej. Spectra Global Inc."
                    autoFocus
                    />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Comercial</label>
                <div className="relative">
                    <i className="bi bi-shop absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    value={formData.trade_name}
                    onChange={e => handleChange('trade_name', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder="Opcional"
                    />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">País <span className="text-red-500">*</span></label>
                <select
                  value={formData.country_id}
                  onChange={e => handleChange('country_id', e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">Seleccionar País</option>
                  {countries.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Moneda Base <span className="text-red-500">*</span></label>
                <select
                  value={formData.default_currency_id}
                  onChange={e => handleChange('default_currency_id', e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">Seleccionar Moneda</option>
                  {currencies.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Zona Horaria <span className="text-red-500">*</span></label>
                <select
                  value={formData.timezone_id}
                  onChange={e => handleChange('timezone_id', e.target.value)}
                  disabled={lookupsLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="">Seleccionar Zona Horaria</option>
                  {timezones.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Estado Inicial</label>
                <select
                  value={formData.status}
                  onChange={e => handleChange('status', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                >
                  <option value="active">Activo</option>
                  <option value="pending">Pendiente de Aprobación</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </div>

              <div className="md:col-span-2 pt-4 border-t border-slate-100 mt-2">
                <h3 className="font-bold text-slate-800 mb-4">Tarifa por Freelancer Activo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Tarifa por contrato de freelancer</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {currencies.find(c => String(c.id) === String(formData.default_currency_id))?.symbol || '$'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.per_freelancer_fee}
                        onChange={e => handleChange('per_freelancer_fee', e.target.value)}
                        placeholder="Ej. 15.00"
                        className="w-full rounded-xl border border-slate-200 pl-7 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Se factura por cada freelancer con contrato activo.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Configuración Fiscal */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <div>
                <h2 className="text-xl font-bold text-slate-900">Configuración Fiscal</h2>
                <p className="text-sm text-slate-500">Detalles de facturación e identificación tributaria.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tax ID / RUC / RFC</label>
                <div className="relative">
                    <i className="bi bi-card-text absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input
                    value={formData.tax_id}
                    onChange={e => handleChange('tax_id', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                    placeholder="Identificador fiscal único"
                    />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Serie de Facturación</label>
                <input
                  value={formData.invoice_series}
                  onChange={e => handleChange('invoice_series', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                  placeholder="Ej. F001"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Numeración Inicial</label>
                <input
                  type="number"
                  value={formData.invoice_number_start}
                  onChange={e => handleChange('invoice_number_start', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
                  min="1"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Owner / Admin */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-xl font-bold text-slate-900">Administrador de la Empresa</h2>
                <p className="text-sm text-slate-500">Asigna un usuario responsable (Owner).</p>
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
                <span className="font-semibold text-slate-800">Crear nuevo usuario</span>
                <span className="text-xs text-slate-500 mt-1">Registrar una nueva cuenta de usuario.</span>
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
                <span className="font-semibold text-slate-800">Invitar usuario existente</span>
                <span className="text-xs text-slate-500 mt-1">Vincular un usuario ya registrado.</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email del Administrador <span className="text-red-500">*</span></label>
                <div className="relative">
                  <i className="bi bi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={formData.owner_email}
                    onChange={e => handleChange('owner_email', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                    placeholder="admin@empresa.com"
                  />
                </div>
              </div>

              {formData.owner_mode === 'create' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Completo <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <i className="bi bi-person absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={formData.owner_name}
                      onChange={e => handleChange('owner_name', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition bg-white"
                      placeholder="Juan Pérez"
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
                <h2 className="text-xl font-bold text-slate-900">Inicialización y Confirmación</h2>
                <p className="text-sm text-slate-500">Revisa los datos y configura el entorno inicial.</p>
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
                  <span className="block font-semibold text-slate-800 group-hover:text-brand transition">Crear roles base por defecto</span>
                  <span className="block text-sm text-slate-500 mt-1">Genera roles estándar: Admin, Finance, HR, Approver, Viewer.</span>
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
                  <span className="block font-semibold text-slate-800 group-hover:text-brand transition">Activar plantillas base</span>
                  <span className="block text-sm text-slate-500 mt-1">Carga plantillas de documentos y correos según el país seleccionado.</span>
                </div>
              </label>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Resumen de la Empresa</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6 text-sm">
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">Empresa</dt>
                  <dd className="font-semibold text-slate-900 text-base mt-0.5">{formData.legal_name}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">Ubicación</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {countries.find(c => String(c.id) === formData.country_id)?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">Moneda</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {currencies.find(c => String(c.id) === formData.default_currency_id)?.code}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 text-xs uppercase font-semibold">Administrador</dt>
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
            {step > 1 ? 'Anterior' : 'Cancelar'}
            </button>

            {step < 4 ? (
            <button
                onClick={() => setStep(s => s + 1)}
                disabled={
                (step === 1 && !canNextStep1) ||
                (step === 2 && !canNextStep2) ||
                (step === 3 && !canNextStep3)
                }
                className="px-6 py-2.5 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2 shadow-lg shadow-brand/20"
            >
                Siguiente
                <i className="bi bi-arrow-right" />
            </button>
            ) : (
            <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-70 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
                {loading ? (
                <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creando...
                </>
                ) : (
                <>
                    <i className="bi bi-check-lg" />
                    Crear Empresa
                </>
                )}
            </button>
            )}
        </div>
      </div>
    </div>
  );
}
