import React, { useState, useEffect } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SystemSmtpPage({ apiUrl, token }) {
  const toast = useToast();
  const api = React.useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const [formData, setFormData] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_pass: '',
    smtp_encryption: 'tls',
    smtp_from_email: '',
    smtp_from_name: ''
  });

  // Estado para prueba (no persiste)
  const [testTo, setTestTo] = useState('');
  const [useCurrentForTest, setUseCurrentForTest] = useState(true);
  const [testOverrides, setTestOverrides] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_pass: '',
    smtp_encryption: 'ssl',
    smtp_from_email: '',
    smtp_from_name: 'Spectra ERP'
  });

  useEffect(() => {
    loadSettings();
  }, [api]);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await api.get('/api/system-settings');
      setFormData(prev => ({ ...prev, ...res.data }));
    } catch (e) {
      toast.error(e.message || 'Error cargando configuraciones');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/api/system-settings', formData);
      toast.success('Configuración SMTP guardada correctamente');
      loadSettings(); 
    } catch (e) {
      toast.error(e.message || 'Error guardando configuraciones');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando configuraciones...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configuración SMTP</h1>
        <p className="text-slate-600 mt-1">
          Configura el servidor de correo saliente para notificaciones del sistema.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <i className="bi bi-envelope text-slate-500"></i>
              Servidor de Correo
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Host SMTP</label>
            <input 
              type="text" 
              value={formData.smtp_host || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_host: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="smtp.example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Puerto</label>
            <input 
              type="number" 
              value={formData.smtp_port || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_port: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="587"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cifrado</label>
            <select
              value={formData.smtp_encryption || 'tls'}
              onChange={e => setFormData(p => ({ ...p, smtp_encryption: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            >
              <option value="tls">TLS (Recomendado)</option>
              <option value="ssl">SSL</option>
              <option value="none">Ninguno</option>
            </select>
          </div>

          <div className="md:col-span-2 border-t border-slate-100 my-2"></div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario SMTP</label>
            <input 
              type="text" 
              value={formData.smtp_user || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_user: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña SMTP</label>
            <input 
              type="password" 
              value={formData.smtp_pass || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_pass: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="************"
            />
          </div>

          <div className="md:col-span-2 border-t border-slate-100 my-2"></div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email del Remitente</label>
            <input 
              type="email" 
              value={formData.smtp_from_email || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_from_email: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="no-reply@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Remitente</label>
            <input 
              type="text" 
              value={formData.smtp_from_name || ''}
              onChange={e => setFormData(p => ({ ...p, smtp_from_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="Spectra ERP System"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brand-dark disabled:opacity-50 transition-colors shadow-lg shadow-brand/20 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                Guardando...
              </>
            ) : (
              <>
                <i className="bi bi-save"></i>
                Guardar Configuración
              </>
            )}
          </button>
        </div>
      </form>
      
      <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <i className="bi bi-send text-slate-500"></i>
          Enviar correo de prueba (no guarda configuración)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Para (email)</label>
            <input
              type="email"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              placeholder="destinatario@dominio.com"
            />
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={useCurrentForTest}
                onChange={e => setUseCurrentForTest(e.target.checked)}
              />
              Usar la configuración actual de esta página para la prueba
            </label>
          </div>

          {!useCurrentForTest && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Host SMTP</label>
                <input
                  type="text"
                  value={testOverrides.smtp_host}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_host: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Puerto</label>
                <input
                  type="number"
                  value={testOverrides.smtp_port}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_port: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="465"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cifrado</label>
                <select
                  value={testOverrides.smtp_encryption}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_encryption: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                >
                  <option value="tls">TLS</option>
                  <option value="ssl">SSL</option>
                  <option value="none">Ninguno</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Usuario SMTP</label>
                <input
                  type="text"
                  value={testOverrides.smtp_user}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_user: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="usuario@dominio.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña SMTP</label>
                <input
                  type="password"
                  value={testOverrides.smtp_pass}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_pass: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="********"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Remitente</label>
                <input
                  type="email"
                  value={testOverrides.smtp_from_email}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_from_email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="info@dominio.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Remitente</label>
                <input
                  type="text"
                  value={testOverrides.smtp_from_name}
                  onChange={e => setTestOverrides(p => ({ ...p, smtp_from_name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  placeholder="Spectra ERP"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={testing || !testTo}
            onClick={async () => {
              try {
                setTesting(true);
                const payload = { to: testTo };
                if (useCurrentForTest) {
                  Object.assign(payload, { ...formData });
                } else {
                  Object.entries(testOverrides).forEach(([k, v]) => {
                    if (v !== undefined && v !== null && v !== '') payload[k] = v;
                  });
                }
                await api.post('/api/system-settings/test-smtp', payload);
                toast.success('Correo de prueba enviado (aceptado por el servidor SMTP). Revisa tu bandeja y spam.');
              } catch (e) {
                toast.error(e.message || 'Error enviando correo de prueba');
              } finally {
                setTesting(false);
              }
            }}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {testing ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                Enviando...
              </>
            ) : (
              <>
                <i className="bi bi-send"></i>
                Enviar correo de prueba
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
