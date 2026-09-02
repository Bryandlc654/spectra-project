import React, { useEffect, useMemo, useState } from 'react';
import Pusher from 'pusher-js';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SupportTicketsPage({ apiUrl, token, user }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subject: '', priority: 'medium', description: '' });
  const [creating, setCreating] = useState(false);

  // Detail Modal
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Load tickets
  const loadTickets = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/support-tickets');
      setTickets(res.data?.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar tickets');
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => {
    if (!selectedTicket) return;

    const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY;
    const pusherCluster = import.meta.env.VITE_PUSHER_APP_CLUSTER;

    if (!pusherKey || !pusherCluster) return;

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster
    });

    const channel = pusher.subscribe(`ticket-${selectedTicket.id}`);
    
    channel.bind('message-sent', (data) => {
      // Avoid duplicate messages if I just sent it (though I should probably rely on the event instead of optimistic UI)
      // But for now, let's just append.
      // We might want to check if message ID already exists.
      setMessages((prev) => {
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
      
      // Auto-scroll to bottom? We'll let the UI handle it naturally or user scrolls.
    });

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, [selectedTicket]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Create ticket
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.subject) return toast.error('El asunto es requerido');
    
    setCreating(true);
    try {
      await api.post('/api/support-tickets', form);
      toast.success('Ticket creado correctamente');
      setShowCreate(false);
      setForm({ subject: '', priority: 'medium', description: '' });
      loadTickets();
    } catch (err) {
      toast.error(err.message || 'Error al crear ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      await api.put(`/api/support-tickets/${selectedTicket.id}`, { status: newStatus });
      setSelectedTicket({ ...selectedTicket, status: newStatus });
      setTickets(tickets.map(t => t.id === selectedTicket.id ? { ...t, status: newStatus } : t));
      toast.success('Estado actualizado');
    } catch (e) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleUpdatePriority = async (newPriority) => {
    try {
      await api.put(`/api/support-tickets/${selectedTicket.id}`, { priority: newPriority });
      setSelectedTicket({ ...selectedTicket, priority: newPriority });
      setTickets(tickets.map(t => t.id === selectedTicket.id ? { ...t, priority: newPriority } : t));
      toast.success('Prioridad actualizada');
    } catch (e) {
      toast.error('Error al actualizar prioridad');
    }
  };

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.subject.toLowerCase().includes(search.toLowerCase()) || 
                          t.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getPriorityBadge = (p) => {
    const colors = {
      high: 'bg-red-50 text-red-700 border-red-200',
      medium: 'bg-amber-50 text-amber-700 border-amber-200',
      low: 'bg-blue-50 text-blue-700 border-blue-200',
      default: 'bg-slate-50 text-slate-700 border-slate-200'
    };
    return colors[p] || colors.default;
  };

  const getStatusBadge = (s) => {
    const colors = {
      open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      closed: 'bg-slate-100 text-slate-600 border-slate-200',
      in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      default: 'bg-slate-50 text-slate-700 border-slate-200'
    };
    return colors[s] || colors.default;
  };

  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    // Reset message input
    setNewMessage('');
    try {
      const res = await api.get(`/api/support-tickets/${ticket.id}/messages`);
      setMessages(res.data || []);
    } catch (e) {
      console.error(e);
      // Don't show error if it's just empty or 404 for messages
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    setSendingMessage(true);
    try {
      await api.post(`/api/support-tickets/${selectedTicket.id}/messages`, {
        message: newMessage
      });
      setNewMessage('');
      // Reload messages
      const res = await api.get(`/api/support-tickets/${selectedTicket.id}/messages`);
      setMessages(res.data || []);
    } catch (err) {
      toast.error('Error al enviar mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  const isSupport = ['super_admin', 'support'].includes(user?.platform_role);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tickets de Soporte</h1>
          <p className="text-sm text-slate-500">Gestiona y da seguimiento a tus solicitudes</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 transition shadow-sm w-full sm:w-auto"
        >
          <i className="bi bi-plus-lg mr-2" />
          Nuevo Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input 
            type="text" 
            placeholder="Buscar por asunto..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm min-w-[140px]"
          >
            <option value="all">Todos los Estados</option>
            <option value="open">Abierto</option>
            <option value="in_progress">En Progreso</option>
            <option value="closed">Cerrado</option>
          </select>
          <select 
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm min-w-[140px]"
          >
            <option value="all">Todas las Prioridades</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            <i className="bi bi-ticket-detailed text-3xl" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No hay tickets encontrados</h3>
          <p className="mt-2 text-slate-500">
            Intenta ajustar los filtros o crea un nuevo ticket.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-4">Asunto</th>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Prioridad</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => handleOpenTicket(t)}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">{t.subject}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{t.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand uppercase">
                          {(t.user_name || 'U').charAt(0)}
                        </div>
                        <div>
                          <p className="text-slate-900 font-medium text-xs">{t.user_name || 'Desconocido'}</p>
                          <p className="text-slate-500 text-[10px]">{t.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${getPriorityBadge(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${getStatusBadge(t.status)}`}>
                        {t.status === 'open' ? 'Abierto' : t.status === 'in_progress' ? 'En Progreso' : 'Cerrado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile List (Cards) */}
          <div className="md:hidden space-y-4">
            {filteredTickets.map((t) => (
              <div 
                key={t.id} 
                onClick={() => handleOpenTicket(t)}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${getPriorityBadge(t.priority)}`}>
                    {t.priority}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{t.subject}</h3>
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">{t.description}</p>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                      {(t.user_name || 'U').charAt(0)}
                    </div>
                    <span className="text-xs text-slate-500">{t.user_name}</span>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${getStatusBadge(t.status)}`}>
                    {t.status === 'open' ? 'Abierto' : t.status === 'in_progress' ? 'Progreso' : 'Cerrado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Crear */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Nuevo Ticket</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Asunto</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  placeholder="Ej: Problema con facturación"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Prioridad</label>
                <select
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Descripción</label>
                <textarea
                  rows={4}
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe el problema detalladamente..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Crear Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalle Ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 md:p-4 backdrop-blur-sm">
          <div className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-3xl md:rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-4 md:p-6 border-b border-slate-100 bg-white">
              <div className="flex-1 mr-4">
                <h2 className="text-xl font-bold text-slate-900 leading-tight">{selectedTicket.subject}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${getPriorityBadge(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${getStatusBadge(selectedTicket.status)}`}>
                    {selectedTicket.status === 'open' ? 'Abierto' : selectedTicket.status === 'in_progress' ? 'En Progreso' : 'Cerrado'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTicket(null)} 
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition"
              >
                <i className="bi bi-x-lg text-lg" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6 space-y-6">
              
              {/* Admin/Support Controls */}
              {isSupport && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <i className="bi bi-gear-fill"></i>
                    Gestión de Soporte
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
                      <select 
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateStatus(e.target.value)}
                        className="w-full rounded-lg border-slate-300 text-sm focus:border-brand focus:ring-brand"
                      >
                        <option value="open">Abierto</option>
                        <option value="in_progress">En Progreso</option>
                        <option value="resolved">Resuelto</option>
                        <option value="closed">Cerrado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Prioridad</label>
                      <select 
                        value={selectedTicket.priority}
                        onChange={(e) => handleUpdatePriority(e.target.value)}
                        className="w-full rounded-lg border-slate-300 text-sm focus:border-brand focus:ring-brand"
                      >
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Description Card */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Descripción</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-2">
                  <i className="bi bi-clock"></i>
                  Creado el {new Date(selectedTicket.created_at).toLocaleString()}
                </div>
              </div>

              {/* Chat Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200"></div>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Actividad</span>
                  <div className="h-px flex-1 bg-slate-200"></div>
                </div>

                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
                      <i className="bi bi-chat-dots text-xl"></i>
                    </div>
                    <p className="text-sm text-slate-500">No hay mensajes aún.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map(msg => {
                      const isMe = msg.user_id == user?.id; // Allow type coercion for id
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                              {!isMe && (
                                <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                                  {(msg.user_name || '?').charAt(0)}
                                </div>
                              )}
                              <div className={`
                                px-4 py-2.5 rounded-2xl text-sm shadow-sm whitespace-pre-wrap
                                ${isMe 
                                  ? 'bg-brand text-white rounded-br-none' 
                                  : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}
                              `}>
                                {msg.message}
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                              {isMe ? 'Tú' : msg.user_name} • {new Date(msg.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer (Input) */}
            <div className="p-4 md:p-6 border-t border-slate-100 bg-white">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-xl border-slate-300 bg-slate-50 px-4 py-2.5 text-sm focus:bg-white focus:border-brand focus:ring-brand transition"
                  placeholder="Escribe un mensaje..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  className="rounded-xl bg-brand px-4 py-2 text-white hover:bg-brand/90 disabled:opacity-50 transition shadow-sm"
                >
                  <i className="bi bi-send-fill" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
