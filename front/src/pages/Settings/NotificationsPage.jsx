import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotificationsPage({ apiUrl, token }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = () => {
        setLoading(true);
        fetch(`${apiUrl}/api/notifications`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setNotifications(data.items || []);
                setUnreadCount(data.unread_count || 0);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchNotifications();
    }, [apiUrl, token]);

    const handleMarkAsRead = (id) => {
        fetch(`${apiUrl}/api/notifications/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Update local state
                    setNotifications(prev => prev.map(n => 
                        n.id === id ? { ...n, is_read: 1 } : n
                    ));
                    setUnreadCount(prev => Math.max(0, prev - 1));
                }
            });
    };

    const handleMarkAllAsRead = () => {
        fetch(`${apiUrl}/api/notifications/read-all`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                    setUnreadCount(0);
                }
            });
    };

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <i className="bi bi-check-circle-fill text-green-500 text-xl" />;
            case 'warning': return <i className="bi bi-exclamation-triangle-fill text-amber-500 text-xl" />;
            case 'error': return <i className="bi bi-x-circle-fill text-red-500 text-xl" />;
            default: return <i className="bi bi-info-circle-fill text-blue-500 text-xl" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Notificaciones</h1>
                    <p className="text-slate-500">Mantente al día con las alertas y actualizaciones del sistema.</p>
                </div>
                {unreadCount > 0 && (
                    <button 
                        onClick={handleMarkAllAsRead}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                        Marcar todas como leídas
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Cargando notificaciones...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                            <i className="bi bi-bell-slash text-2xl text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Sin notificaciones</h3>
                        <p className="text-slate-500 mt-1">No tienes alertas pendientes por ahora.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {notifications.map(notif => (
                            <li 
                                key={notif.id} 
                                className={`p-4 transition hover:bg-slate-50 ${!notif.is_read ? 'bg-blue-50/40' : ''}`}
                            >
                                <div className="flex gap-4">
                                    <div className="mt-1 flex-shrink-0">
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between">
                                            <h4 className={`text-sm font-medium ${!notif.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                                                {notif.title}
                                            </h4>
                                            <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                                                {new Date(notif.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                                        
                                        <div className="mt-2 flex items-center gap-4">
                                            {notif.link && (
                                                <a href={notif.link} className="text-xs font-medium text-blue-600 hover:underline">
                                                    Ver detalles
                                                </a>
                                            )}
                                            {!notif.is_read && (
                                                <button 
                                                    onClick={() => handleMarkAsRead(notif.id)}
                                                    className="text-xs text-slate-500 hover:text-slate-800"
                                                >
                                                    Marcar como leída
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
