import React, { useState, useEffect } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SystemAuthPage({ apiUrl, token }) {
  const toast = useToast();
  const api = React.useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    system_api_url: '',
    google_client_id: '',
    google_client_secret: '',
    microsoft_client_id: '',
    microsoft_client_secret: ''
  });

  useEffect(() => {
    loadSettings();
  }, [api]);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await api.get('/api/system-settings');
      // Merge with defaults just in case
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
      toast.success('Configuración guardada correctamente');
      loadSettings(); // Reload to get masked values if backend masks them
    } catch (e) {
      toast.error(e.message || 'Error guardando configuraciones');
    } finally {
      setSaving(false);
    }
  }

  const getCallbackUrl = (provider) => {
    let base = formData.system_api_url || apiUrl;
    base = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${base}/api/auth/${provider}/callback`;
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando configuraciones...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configuración de Autenticación (SSO)</h1>
        <p className="text-slate-600 mt-1">
          Gestiona las credenciales para inicio de sesión con Google y Microsoft.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* General Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <i className="bi bi-globe text-2xl text-slate-700"></i>
            <h2 className="text-lg font-bold text-slate-900">Configuración General</h2>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL Base de la API</label>
            <input 
              type="url" 
              value={formData.system_api_url || ''}
              onChange={e => setFormData(p => ({ ...p, system_api_url: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder={apiUrl}
            />
            <p className="text-xs text-slate-500 mt-1">
              URL pública donde está alojado el backend (ej. https://api.midominio.com/public).
              <br />
              Es crucial para que las redirecciones de OAuth coincidan con lo registrado en Google/Microsoft.
            </p>
          </div>
        </div>

        {/* Google Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <i className="bi bi-google text-2xl text-slate-700"></i>
            <h2 className="text-lg font-bold text-slate-900">Google OAuth 2.0</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
              <div className="flex items-start gap-3">
                <i className="bi bi-info-circle text-blue-600 mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-bold text-blue-900">Configuración en Google Cloud</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Agrega esta URL en "Authorized redirect URIs":
                  </p>
                  <code className="mt-2 block w-full break-all rounded bg-white px-2 py-1 text-xs font-mono text-slate-600 border border-blue-200 select-all">
                    {getCallbackUrl('google')}
                  </code>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
              <input 
                type="text" 
                value={formData.google_client_id || ''}
                onChange={e => setFormData(p => ({ ...p, google_client_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                placeholder="xxxx.apps.googleusercontent.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
              <input 
                type="password" 
                value={formData.google_client_secret || ''}
                onChange={e => setFormData(p => ({ ...p, google_client_secret: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                placeholder="************"
              />
              <p className="text-xs text-slate-500 mt-1">El valor se ocultará después de guardar.</p>
            </div>
          </div>
        </div>

        {/* Microsoft Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <i className="bi bi-microsoft text-2xl text-slate-700"></i>
            <h2 className="text-lg font-bold text-slate-900">Microsoft Entra ID</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
              <div className="flex items-start gap-3">
                <i className="bi bi-info-circle text-blue-600 mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-bold text-blue-900">Configuración en Azure Portal</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Agrega esta URL en "Redirect URIs" (Web):
                  </p>
                  <code className="mt-2 block w-full break-all rounded bg-white px-2 py-1 text-xs font-mono text-slate-600 border border-blue-200 select-all">
                    {getCallbackUrl('microsoft')}
                  </code>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client ID (Application ID)</label>
              <input 
                type="text" 
                value={formData.microsoft_client_id || ''}
                onChange={e => setFormData(p => ({ ...p, microsoft_client_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
              <input 
                type="password" 
                value={formData.microsoft_client_secret || ''}
                onChange={e => setFormData(p => ({ ...p, microsoft_client_secret: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                placeholder="************"
              />
              <p className="text-xs text-slate-500 mt-1">El valor se ocultará después de guardar.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand text-white font-bold hover:bg-brand-dark disabled:opacity-50 transition-colors shadow-lg shadow-brand/20"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>

      </form>
    </div>
  );
}
