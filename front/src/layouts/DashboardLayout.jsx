import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';



function activeFromPath(pathname) {
    if (pathname.startsWith('/dashboard/tenants')) return 'tenants';
    return 'dashboard';
}

export default function DashboardLayout({ user, onLogout, token, apiUrl }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [unreadCount, setUnreadCount] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (!token || !apiUrl) return;

        const fetchUnread = () => {
            fetch(`${apiUrl}/api/notifications`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.unread_count !== undefined) {
                    setUnreadCount(data.unread_count);
                }
            })
            .catch(() => {});
        };

        fetchUnread();
        // Poll every 60 seconds
        const interval = setInterval(fetchUnread, 60000);
        return () => clearInterval(interval);
    }, [token, apiUrl]);

    // Responsive sidebar behavior
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024; // lg breakpoint
            setIsMobile(mobile);
            if (mobile) {
                setSidebarOpen(false);
            } else {
                const persisted = localStorage.getItem('spectra_sidebar_open');
                setSidebarOpen(persisted !== null ? persisted === '1' : true);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && isMobile && sidebarOpen) {
                setSidebarOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isMobile, sidebarOpen]);

    const toggleSidebar = () => {
        if (isMobile) {
            setSidebarOpen(prev => !prev);
        } else {
            setSidebarOpen(prev => {
                const next = !prev;
                localStorage.setItem('spectra_sidebar_open', next ? '1' : '0');
                return next;
            });
        }
    };

    const handleStopImpersonation = () => {
        const original = localStorage.getItem('spectra_original_session');
        if (original) {
            localStorage.setItem('spectra_session', original);
            localStorage.removeItem('spectra_original_session');
            window.location.href = '/dashboard/support';
        } else {
            // Fallback if lost
            onLogout();
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50">
            <Sidebar
               user={user}
               onLogout={onLogout}
               open={isMobile ? sidebarOpen : true}
               collapsed={!isMobile && !sidebarOpen}
               isMobile={isMobile}
               onClose={isMobile ? () => setSidebarOpen(false) : undefined}
            />

            <main className="flex-1 flex flex-col">
                {user?.is_impersonated && (
                    <div className="bg-amber-600 px-4 py-3 text-white shadow-md">
                        <div className="mx-auto flex max-w-6xl items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-white/20 p-1.5">
                                    <i className="bi bi-incognito text-xl" />
                                </div>
                                <div>
                                    <p className="font-bold">Modo Impersonación Activo</p>
                                    <p className="text-xs opacity-90">
                                        Estás viendo la plataforma como <span className="font-mono font-bold">Admin de Empresa</span>.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleStopImpersonation}
                                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-sm transition hover:bg-amber-50"
                            >
                                <i className="bi bi-x-circle-fill mr-2" />
                                Salir de Impersonación
                            </button>
                        </div>
                    </div>
                )}

                <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
                    <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={toggleSidebar}
                                className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                                aria-label="Alternar menú"
                            >
                                <i className="bi bi-list text-xl" />
                            </button>
                            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                                Panel global
                            </div>
                            <div className="text-lg font-bold text-slate-900">
                                {user?.full_name ? `Hola, ${user.full_name}` : 'Hola'}
                            </div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                </header>

                <div className="mx-auto max-w-6xl px-5 py-6 w-full">
                    <Outlet />
                </div>
            </main>
            {isMobile && sidebarOpen && (
                <div
                    className="fixed inset-0 z-20 bg-slate-900/40"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}
        </div>
    );
}
