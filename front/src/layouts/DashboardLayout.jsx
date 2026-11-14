import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import LanguageSelector from '../components/LanguageSelector';
import KybGatePage from '../pages/Verification/KybGatePage';
import { useI18n } from '../i18n/I18nContext';

// Cambia a false para ocultar por completo la barra lateral.
const SHOW_SIDEBAR = true;



function activeFromPath(pathname) {
    if (pathname.startsWith('/dashboard/tenants')) return 'tenants';
    return 'dashboard';
}

export default function DashboardLayout({ user, onLogout, token, apiUrl }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { t } = useI18n();
    const [unreadCount, setUnreadCount] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(false);

    const role = user?.platform_role || user?.role;
    const isCompanyScoped = !!user?.company_id && ['company_admin', 'user', 'it_admin'].includes(role);
    const [kybGate, setKybGate] = useState({
        checking: isCompanyScoped,
        required: false,
        status: 'not_started',
        companyName: '',
    });

    const refreshKybGate = useCallback(async () => {
        if (!isCompanyScoped || !token || !apiUrl) {
            setKybGate({ checking: false, required: false, status: 'not_started', companyName: '' });
            return;
        }

        try {
            const res = await fetch(`${apiUrl}/api/tenants/${user.company_id}/kyb`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('kyb_gate_unavailable');
            const data = await res.json();
            setKybGate({
                checking: false,
                required: !!data?.required,
                status: data?.request?.status || 'not_started',
                companyName: data?.company_name || '',
            });
        } catch {
            // Fail-open: the backend still enforces the gate on every request.
            setKybGate({ checking: false, required: false, status: 'not_started', companyName: '' });
        }
    }, [apiUrl, isCompanyScoped, token, user?.company_id]);

    useEffect(() => {
        refreshKybGate();
    }, [refreshKybGate]);

    useEffect(() => {
        const handleKybRequired = () => refreshKybGate();
        window.addEventListener('spectra:kyb-required', handleKybRequired);
        return () => window.removeEventListener('spectra:kyb-required', handleKybRequired);
    }, [refreshKybGate]);

    const kybBlocked = isCompanyScoped && (kybGate.checking || (kybGate.required && kybGate.status !== 'approved'));

    useEffect(() => {
        if (!token || !apiUrl || kybBlocked) return;

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
    }, [token, apiUrl, kybBlocked]);

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

    if (isCompanyScoped && kybGate.checking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
                <div className="text-center">
                    <img src="/logo-spectra.webp" alt="Grupo Spectra" className="mx-auto mb-5 h-10 w-auto object-contain" />
                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    <p className="text-sm text-slate-500">{t('tenants.verification.loading')}</p>
                </div>
            </div>
        );
    }

    if (isCompanyScoped && kybGate.required && kybGate.status !== 'approved') {
        return (
            <KybGatePage
                user={user}
                token={token}
                apiUrl={apiUrl}
                onLogout={onLogout}
            />
        );
    }

    return (
        <div className="min-h-screen flex bg-slate-50">
            {SHOW_SIDEBAR && (
                <Sidebar
                   user={user}
                   onLogout={onLogout}
                   open={isMobile ? sidebarOpen : true}
                   collapsed={!isMobile && !sidebarOpen}
                   isMobile={isMobile}
                   onClose={isMobile ? () => setSidebarOpen(false) : undefined}
                />
            )}

            <main className="flex-1 flex flex-col">
                {user?.is_impersonated && (
                    <div className="bg-amber-600 px-4 py-3 text-white shadow-md">
                        <div className="mx-auto flex max-w-6xl items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-white/20 p-1.5">
                                    <i className="bi bi-incognito text-xl" />
                                </div>
                                <div>
                                    <p className="font-bold">{t('common.impersonationActive')}</p>
                                    <p className="text-xs opacity-90">
                                        {t('common.impersonationDescription', { role: t('common.companyAdmin') })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleStopImpersonation}
                                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-sm transition hover:bg-amber-50"
                            >
                                <i className="bi bi-x-circle-fill mr-2" />
                                {t('common.stopImpersonation')}
                            </button>
                        </div>
                    </div>
                )}

                <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
                    <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {SHOW_SIDEBAR && (
                                <button
                                    onClick={toggleSidebar}
                                    className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                                    aria-label={t('common.toggleMenu')}
                                >
                                    <i className="bi bi-list text-xl" />
                                </button>
                            )}
                            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                                {t('common.globalPanel')}
                            </div>
                            <div className="text-lg font-bold text-slate-900">
                                {user?.full_name ? t('common.hello', { name: user.full_name }) : t('common.helloShort')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <LanguageSelector />
                            <button
                                onClick={onLogout}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                {t('common.logout')}
                            </button>
                        </div>
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
