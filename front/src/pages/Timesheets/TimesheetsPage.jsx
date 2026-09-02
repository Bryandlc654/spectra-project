import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function TimesheetsPage({ apiUrl, token }) {
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id');

  const toast = useToast();
  const { user, hasAccess } = useAuth();
  
  const [timesheets, setTimesheets] = useState([]);
  const [filteredTimesheets, setFilteredTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    period_start: '',
    period_end: '',
    project_id: ''
  });
  const [saving, setSaving] = useState(false);

  // Granular Entry State
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState(null);
  const [entryForm, setEntryForm] = useState({
      date: '',
      start_time: '',
      end_time: '',
      break_time: 0,
      description: ''
  });

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [itemToReject, setItemToReject] = useState(null);

  // Load Projects for dropdown
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const res = await apiFetch(apiUrl, '/api/timesheets', { token });
        setTimesheets(res.data || []);
        
        // Load projects for selector
        try {
            const pRes = await apiFetch(apiUrl, '/api/projects', { token });
            if (!cancelled) setProjects(pRes.data || pRes.items || []);
        } catch (e) {
            console.warn('Could not load projects', e);
        }

      } catch (e) {
        if (!cancelled) setErr(e?.message || 'No se pudieron cargar las hojas de tiempo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiUrl, token]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(apiUrl, '/api/timesheets', {
        token,
        method: 'POST',
        body: JSON.stringify(formData)
      });
      toast.success('Hoja de tiempo creada');
      setModalOpen(false);
      
      // Reload
      const res = await apiFetch(apiUrl, '/api/timesheets', { token });
      setTimesheets(res.data || []);
    } catch (e) {
      toast.error(e?.message || 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (!window.confirm(`¿Estás seguro de cambiar el estado a ${newStatus}?`)) return;
    try {
      await apiFetch(apiUrl, `/api/timesheets/${id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Estado actualizado a ${newStatus}`);
      setTimesheets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      if (selectedTimesheet?.id === id) {
        setSelectedTimesheet(prev => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      toast.error(e.message || 'Error actualizando estado');
    }
  };

  const handleRejectConfirm = async () => {
    if (!itemToReject) return;
    if (!rejectReason.trim()) {
        toast.error('Debes ingresar una razón para el rechazo');
        return;
    }

    try {
        await apiFetch(apiUrl, `/api/timesheets/${itemToReject.id}`, {
            token,
            method: 'PUT',
            body: JSON.stringify({ 
                status: 'rejected',
                rejection_reason: rejectReason
            })
        });
        
        toast.success('Hoja de tiempo rechazada');
        setTimesheets(prev => prev.map(t => t.id === itemToReject.id ? { ...t, status: 'rejected' } : t));
        setRejectModalOpen(false);
        setRejectReason('');
        setItemToReject(null);
    } catch (e) {
        toast.error(e.message || 'Error al rechazar');
    }
  };

  const handleViewDetails = async (ts) => {
    setSelectedTimesheet(ts);
    setDetailsOpen(true);
    // Fetch fresh details with entries
    try {
        const res = await apiFetch(apiUrl, `/api/timesheets/${ts.id}`, { token });
        if (res) {
            setSelectedTimesheet(res);
        }
    } catch (e) {
        console.error("Could not load details", e);
    }
  };

  const handleSaveEntry = async (e) => {
      e.preventDefault();
      if (!selectedTimesheet) return;
      
      try {
          // Calculate hours
          const start = new Date(`2000-01-01T${entryForm.start_time}`);
          const end = new Date(`2000-01-01T${entryForm.end_time}`);
          let diff = (end - start) / 1000 / 60 / 60; // hours
          if (diff < 0) diff += 24;
          const breakH = (parseFloat(entryForm.break_time) || 0) / 60;
          const total = Math.max(0, diff - breakH).toFixed(2);

          const payload = {
              ...entryForm,
              hours: total,
              timesheet_id: selectedTimesheet.id
          };

          await apiFetch(apiUrl, `/api/timesheets/${selectedTimesheet.id}/entries`, {
              token,
              method: 'POST',
              body: JSON.stringify(payload)
          });

          toast.success('Entrada agregada');
          
          // Refresh details
          const res = await apiFetch(apiUrl, `/api/timesheets/${selectedTimesheet.id}`, { token });
          setSelectedTimesheet(res);
          
          // Reset form
          setEntryForm({
              date: '',
              start_time: '',
              end_time: '',
              break_time: 0,
              description: ''
          });
      } catch (e) {
          toast.error(e.message || 'Error al agregar entrada');
      }
  };

  const renderStatus = (status) => {
    const map = {
        draft: 'bg-slate-100 text-slate-700',
        submitted: 'bg-blue-50 text-blue-700',
        approved: 'bg-emerald-50 text-emerald-700',
        rejected: 'bg-red-50 text-red-700'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${map[status] || map.draft}`}>
            {status}
        </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hojas de Tiempo</h1>
          <p className="text-sm text-slate-500">Registro de horas y actividades</p>
        </div>
        <button
          onClick={() => {
              setFormData({ period_start: '', period_end: '', project_id: filterProjectId || '' });
              setModalOpen(true);
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90"
        >
          <i className="bi bi-plus-lg mr-2" />
          Nueva Hoja
        </button>
      </div>

      {loading && <div className="text-center py-12 text-slate-500">Cargando...</div>}
      
      {err && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
            {err}
        </div>
      )}

      {!loading && !err && timesheets.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
              <i className="bi bi-clock-history text-4xl text-slate-300 mb-3 block" />
              <p className="text-slate-500">No hay hojas de tiempo registradas</p>
          </div>
      )}

      {timesheets.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Periodo</th>
                <th className="px-4 py-3 text-left">Proyecto</th>
                <th className="px-4 py-3 text-left">Total Horas</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timesheets.map(ts => (
                <tr key={ts.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                      {ts.period_start} — {ts.period_end}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      {projects.find(p => p.id === ts.project_id)?.name || 'General'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      {ts.total_hours || '0.00'}
                  </td>
                  <td className="px-4 py-3">
                      {renderStatus(ts.status)}
                  </td>
                  <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {(user?.role === 'company_admin' || user?.role === 'admin' || user?.platform_role === 'admin') && ts.status === 'submitted' && (
                            <>
                                <button 
                                    onClick={() => handleStatusChange(ts.id, 'approved')}
                                    className="text-emerald-600 hover:text-emerald-800 text-sm font-semibold"
                                    title="Aprobar"
                                >
                                    <i className="bi bi-check-lg" />
                                </button>
                                <button 
                                    onClick={() => {
                                        setItemToReject(ts);
                                        setRejectModalOpen(true);
                                    }}
                                    className="text-red-600 hover:text-red-800 text-sm font-semibold"
                                    title="Rechazar"
                                >
                                    <i className="bi bi-x-lg" />
                                </button>
                            </>
                        )}
                        <button 
                            onClick={() => handleViewDetails(ts)}
                            className="text-brand hover:text-brand/80 text-sm font-semibold"
                        >
                            Detalles
                        </button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Detalle de Hoja de Tiempo">
        {selectedTimesheet && (
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl">
                    <div>
                        <p className="text-sm text-slate-500">Periodo</p>
                        <p className="font-semibold">{selectedTimesheet.period_start} — {selectedTimesheet.period_end}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-slate-500">Total Horas</p>
                        <p className="text-2xl font-bold text-brand">{selectedTimesheet.total_hours}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="font-bold text-slate-900">Agregar Entrada</h3>
                    <form onSubmit={handleSaveEntry} className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-200">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha</label>
                                <input 
                                    type="date" 
                                    required
                                    className="w-full rounded-lg border-slate-200 text-sm"
                                    value={entryForm.date}
                                    onChange={e => setEntryForm({...entryForm, date: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Descripción</label>
                                <input 
                                    type="text" 
                                    className="w-full rounded-lg border-slate-200 text-sm"
                                    placeholder="Tarea realizada..."
                                    value={entryForm.description}
                                    onChange={e => setEntryForm({...entryForm, description: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Inicio</label>
                                <input 
                                    type="time" 
                                    required
                                    className="w-full rounded-lg border-slate-200 text-sm"
                                    value={entryForm.start_time}
                                    onChange={e => setEntryForm({...entryForm, start_time: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fin</label>
                                <input 
                                    type="time" 
                                    required
                                    className="w-full rounded-lg border-slate-200 text-sm"
                                    value={entryForm.end_time}
                                    onChange={e => setEntryForm({...entryForm, end_time: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Descanso (min)</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full rounded-lg border-slate-200 text-sm"
                                    value={entryForm.break_time}
                                    onChange={e => setEntryForm({...entryForm, break_time: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="text-right">
                            <button 
                                type="submit" 
                                className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90"
                            >
                                <i className="bi bi-plus-lg mr-1"/>
                                Agregar
                            </button>
                        </div>
                    </form>
                </div>

                <div>
                    <h3 className="font-bold text-slate-900 mb-3">Entradas Registradas</h3>
                    {selectedTimesheet.entries && selectedTimesheet.entries.length > 0 ? (
                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Fecha</th>
                                        <th className="px-3 py-2 text-left">Horario</th>
                                        <th className="px-3 py-2 text-left">Descanso</th>
                                        <th className="px-3 py-2 text-left">Total</th>
                                        <th className="px-3 py-2 text-left">Desc.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedTimesheet.entries.map(entry => (
                                        <tr key={entry.id}>
                                            <td className="px-3 py-2">{entry.date}</td>
                                            <td className="px-3 py-2 text-slate-600">
                                                {entry.start_time ? `${entry.start_time.substring(0,5)} - ${entry.end_time.substring(0,5)}` : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{entry.break_time}m</td>
                                            <td className="px-3 py-2 font-semibold">{entry.hours}h</td>
                                            <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[150px]">{entry.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm text-center py-4">No hay entradas registradas</p>
                    )}
                </div>
            </div>
        )}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Hoja de Tiempo">
        <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Inicio</label>
                    <input 
                        type="date" 
                        required
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.period_start}
                        onChange={e => setFormData({...formData, period_start: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fin</label>
                    <input 
                        type="date" 
                        required
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.period_end}
                        onChange={e => setFormData({...formData, period_end: e.target.value})}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Proyecto (Opcional)</label>
                <select
                    className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                    value={formData.project_id}
                    onChange={e => setFormData({...formData, project_id: e.target.value})}
                >
                    <option value="">-- General / Sin Proyecto --</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            <div className="pt-4 flex justify-end gap-2">
                <button 
                    type="button" 
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg"
                >
                    Cancelar
                </button>
                <button 
                    type="submit" 
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50"
                >
                    {saving ? 'Creando...' : 'Crear Hoja'}
                </button>
            </div>
        </form>
      </Modal>

      <Modal open={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title="Rechazar Hoja de Tiempo">
        <div className="space-y-4">
            <p className="text-slate-600">Por favor indica la razón del rechazo para que el usuario pueda corregirlo.</p>
            <textarea
                className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand min-h-[100px]"
                placeholder="Escribe la razón aquí..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
                <button 
                    type="button" 
                    onClick={() => setRejectModalOpen(false)}
                    className="px-4 py-2 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg"
                >
                    Cancelar
                </button>
                <button 
                    type="button" 
                    onClick={handleRejectConfirm}
                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700"
                >
                    Rechazar Hoja
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
}