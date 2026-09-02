import React, { useState, useEffect } from 'react';
import { Plus, Bell, AlertTriangle, Info, Globe, Calendar, ExternalLink, Send } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';

const LaborLawAlertsPage = ({ apiUrl, token, user }) => {
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Filters
  const [selectedCountry, setSelectedCountry] = useState('');
  const [countries, setCountries] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    country_code: '',
    title: '',
    summary: '',
    details: '',
    severity: 'info',
    effective_date: '',
    source_url: ''
  });

  const canManage = ['super_admin', 'admin', 'legal', 'support'].includes(user?.platform_role);

  useEffect(() => {
    fetchCountries();
    fetchAlerts();
  }, [selectedCountry]);

  const fetchCountries = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/countries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        setCountries(list);
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      let url = `${apiUrl}/api/compliance/labor-law-alerts`;
      const params = new URLSearchParams();
      if (selectedCountry) params.append('country_code', selectedCountry);
      
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        setAlerts(list);
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error('Error cargando alertas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/compliance/labor-law-alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Alerta creada correctamente');
        setIsCreateModalOpen(false);
        setFormData({
            country_code: '',
            title: '',
            summary: '',
            details: '',
            severity: 'info',
            effective_date: '',
            source_url: ''
        });
        fetchAlerts();
      } else {
        const err = await res.json();
        toast.error(err.message || 'No se pudo crear la alerta');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error creando alerta');
    }
  };

  const handleBroadcast = async (id) => {
    try {
      const res = await fetch(`${apiUrl}/api/compliance/labor-law-alerts/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Alerta enviada a administradores de empresa');
      } else {
        toast.error(data.message || 'No se pudo enviar la alerta');
      }
    } catch (error) {
      toast.error('Error enviando la alerta');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-5 h-5" />;
      case 'warning': return <Bell className="w-5 h-5" />;
      case 'info': default: return <Info className="w-5 h-5" />;
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'critical': return 'Crítica';
      case 'warning': return 'Advertencia';
      case 'info': default: return 'Información';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertas de legislación laboral</h1>
          <p className="text-sm text-gray-500">Mantente al día con los cambios legales y requisitos de cumplimiento.</p>
        </div>
        <div className="flex gap-3">
          <select 
            className="border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500 p-2"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="">Todos los países</option>
            {countries.map(c => {
              const key = c.id ?? c.iso2 ?? c.code ?? c.name;
              const value = (c.iso2 || c.code || c.id || '').toString().toUpperCase();
              return (
                <option key={key} value={value}>
                  {c.name}
                </option>
              );
            })}
          </select>
          
          {canManage && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva alerta
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">Cargando alertas...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron alertas</h3>
              <p className="mt-1 text-sm text-gray-500">No hay alertas de legislación laboral que coincidan con tu criterio.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className={`bg-white border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)} bg-opacity-20`}>
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{alert.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getSeverityColor(alert.severity)}`}>
                          {getSeverityLabel(alert.severity)}
                        </span>
                        {alert.country_code ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            <Globe className="w-3 h-3" /> {alert.country_code}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-600">
                            <Globe className="w-3 h-3" /> Global
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-600 mt-2 mb-3">{alert.summary}</p>
                      
                      {alert.details && (
                        <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md mb-3">
                           {alert.details}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Vigente desde: {alert.effective_date}
                        </span>
                        {alert.source_url && (
                          <a 
                            href={alert.source_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Fuente
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      Publicada: {new Date(alert.created_at).toLocaleDateString()}
                    </div>
                    {canManage && (
                      <button
                        onClick={() => handleBroadcast(alert.id)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                        title="Enviar notificación a administradores relevantes"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Notificar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Create Labor Law Alert</h2>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">País</label>
                  <select
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    value={formData.country_code}
                    onChange={e => setFormData({...formData, country_code: e.target.value})}
                  >
                    <option value="">Global (Todos los países)</option>
                    {countries.map(c => {
                      const key = c.id ?? c.iso2 ?? c.code ?? c.name;
                      const value = (c.iso2 || c.code || c.id || '').toString().toUpperCase();
                      return (
                        <option key={key} value={value}>
                          {c.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de vigencia *</label>
                  <input
                    type="date"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                    value={formData.effective_date}
                    onChange={e => setFormData({...formData, effective_date: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Título *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Severidad</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={formData.severity}
                  onChange={e => setFormData({...formData, severity: e.target.value})}
                >
                  <option value="info">Información</option>
                  <option value="warning">Advertencia</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Resumen</label>
                <textarea
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={formData.summary}
                  onChange={e => setFormData({...formData, summary: e.target.value})}
                  placeholder="Resumen breve del cambio..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Detalles</label>
                <textarea
                  rows={5}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={formData.details}
                  onChange={e => setFormData({...formData, details: e.target.value})}
                  placeholder="Detalles completos, implicancias y acciones requeridas..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">URL de la fuente</label>
                <input
                  type="url"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                  value={formData.source_url}
                  onChange={e => setFormData({...formData, source_url: e.target.value})}
                  placeholder="https://..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Crear alerta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaborLawAlertsPage;
