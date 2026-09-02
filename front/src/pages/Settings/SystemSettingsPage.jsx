import React, { useState, useEffect } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SystemSettingsPage({ apiUrl, token }) {
  const toast = useToast();
  const api = React.useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    system_api_url: ''
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
      toast.success('Configuración guardada correctamente');
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
        <h1 className="text-2xl font-bold text-slate-900">Parámetros del Sistema</h1>
        <p className="text-slate-600 mt-1">
          Configuración general de la plataforma.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* General Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <i className="bi bi-gear text-2xl text-slate-700"></i>
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
              Utilizada para generar enlaces absolutos y callbacks de OAuth.
            </p>
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
