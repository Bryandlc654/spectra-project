import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import { createApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PLATFORM_ROLES } from '../lib/platformRoles';

export default function ProfilePage({ apiUrl, token }) {
    const { user: sessionUser } = useAuth();
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('spectra_session'))?.user || sessionUser || {});
    const isFreelancer = user?.platform_role === PLATFORM_ROLES.FREELANCER || user?.platform_role === 'freelance';
    const [form, setForm] = useState({
        full_name: user?.full_name || '',
        email: user?.email || '',
        years_experience: '',
        area: '',
        country: '',
        city: '',
        phone: '',
        bio: '',
        skills: ''
    });
    const [savingProfile, setSavingProfile] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [reviewsSummary, setReviewsSummary] = useState(null);
    const [freelancerCode, setFreelancerCode] = useState('');
    const [status, setStatus] = useState('');
    const [countries, setCountries] = useState([]);
    const [loadingCountries, setLoadingCountries] = useState(false);
    const [areas, setAreas] = useState([]);
    const [loadingAreas, setLoadingAreas] = useState(false);
    const [emailTouched, setEmailTouched] = useState(false);
    const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
    const [skillInput, setSkillInput] = useState('');
    const parsedSkills = useMemo(() => (form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : []), [form.skills]);
    function addSkill(v) {
        const value = String(v || '').trim();
        if (!value) return;
        if (parsedSkills.includes(value)) { setSkillInput(''); return; }
        const next = [...parsedSkills, value];
        setForm(prev => ({ ...prev, skills: next.join(', ') }));
        setSkillInput('');
    }
    function removeSkill(idx) {
        const next = parsedSkills.filter((_, i) => i !== idx);
        setForm(prev => ({ ...prev, skills: next.join(', ') }));
    }
    function handleSkillKeyDown(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addSkill(skillInput);
        }
    }
    function handleSkillBlur() {
        addSkill(skillInput);
    }

    function handleChange(e) {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    }

    useEffect(() => {
        if (!isFreelancer || !user?.id) return;
        let mounted = true;
        (async () => {
            setLoading(true);
            setErr('');
            try {
                const res = await api.get(`/api/freelancers/${user.id}?_t=${Date.now()}`);
                const u = res.user || {};
                if (!mounted) return;
                setFreelancerCode(u.freelancer_code || '');
                setStatus(u.status || '');
                setReviewsSummary(res.reviews_summary || null);
                setForm(prev => ({
                    ...prev,
                    years_experience: u.years_experience || '',
                    area: u.area || '',
                    country: u.country || '',
                    city: u.city || '',
                    phone: u.phone || '',
                    bio: u.bio || '',
                    skills: u.skills || ''
                }));
            } catch (e) {
                setErr(e.message || 'No se pudo cargar tu perfil de freelancer');
            } finally {
                setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [isFreelancer, user?.id, api]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoadingCountries(true);
            try {
                const res = await api.get('/api/countries?page=1&per_page=200');
                const out = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                if (mounted) setCountries(out || []);
            } catch (e) {
                if (mounted) setCountries([]);
            } finally {
                if (mounted) setLoadingCountries(false);
            }
        })();
        return () => { mounted = false; };
    }, [api]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoadingAreas(true);
            try {
                const res = await api.get('/api/freelancer-areas');
                const out = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                if (mounted) setAreas(out || []);
            } catch (e) {
                if (mounted) setAreas([]);
            } finally {
                if (mounted) setLoadingAreas(false);
            }
        })();
        return () => { mounted = false; };
    }, [api]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!user?.id) {
            toast.error('No se pudo identificar al usuario actual');
            return;
        }
        setSavingProfile(true);
        try {
            const payload = {
                full_name: form.full_name,
                email: form.email,
            };
            await api.put(`/api/users/${user.id}`, payload);
            if (isFreelancer) {
                const fPayload = {
                    years_experience: form.years_experience,
                    area: form.area,
                    country: form.country,
                    city: form.city,
                    phone: form.phone,
                    bio: form.bio,
                    skills: form.skills
                };
                await api.put(`/api/freelancers/${user.id}`, fPayload);
            }
            const updatedUser = { ...user, full_name: form.full_name, email: form.email };
            setUser(updatedUser);
            try {
                const raw = localStorage.getItem('spectra_session');
                const session = raw ? JSON.parse(raw) : null;
                if (session) {
                    localStorage.setItem('spectra_session', JSON.stringify({ ...session, user: updatedUser }));
                }
            } catch (e2) {
            }
            toast.success('Perfil actualizado correctamente');
        } catch (err) {
            toast.error(err?.message || 'No se pudo actualizar el perfil');
        } finally {
            setSavingProfile(false);
        }
    }

    async function handlePasswordReset() {
        if (!user?.id) {
            toast.error('No se pudo identificar al usuario actual');
            return;
        }
        setSendingReset(true);
        try {
            await api.post(`/api/users/${user.id}/send-password-reset`, {});
            toast.success('Te hemos enviado un correo para cambiar tu contraseña');
        } catch (err) {
            toast.error(err?.message || 'No se pudo iniciar el cambio de contraseña');
        } finally {
            setSendingReset(false);
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Mi Perfil</h1>
            
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center gap-4">
                    <div className="h-20 w-20 rounded-full bg-brand/10 text-brand flex items-center justify-center text-3xl font-bold">
                        {user?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900">{user?.full_name || 'Usuario'}</h2>
                            {isFreelancer && (
                                <>
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                                        {status === 'active' ? 'Activo' : status || '—'}
                                    </span>
                                    {freelancerCode && (
                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                            Código: {freelancerCode}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        <p className="text-slate-500">{user?.email}</p>
                        <div className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                            {user?.platform_role || 'Rol desconocido'}
                        </div>
                        {isFreelancer && reviewsSummary && (
                            <div className="mt-2 flex items-center gap-2">
                                <div className="text-amber-400 text-sm">
                                    {[...Array(5)].map((_, i) => (
                                        <i key={i} className={`bi ${i < Math.round(Number(reviewsSummary.avg_rating || 0)) ? 'bi-star-fill' : 'bi-star'}`} />
                                    ))}
                                </div>
                                <span className="text-xs text-slate-600">
                                    {(Number(reviewsSummary.avg_rating || 0)).toFixed(1)} / 5 · <span className="text-slate-400">({Number(reviewsSummary.total_reviews || 0)} reseñas)</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Nombre completo
                        </label>
                        <input
                            type="text"
                            name="full_name"
                            value={form.full_name}
                            onChange={handleChange}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                            placeholder="Tu nombre y apellidos"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={(e) => { setEmailTouched(true); handleChange(e); }}
                            onBlur={() => setEmailTouched(true)}
                            className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${emailTouched && !isValidEmail(form.email) ? 'border border-red-300 focus:border-red-500' : 'border border-slate-200 focus:border-brand'}`}
                            placeholder="tu@correo.com"
                        />
                        {emailTouched && !isValidEmail(form.email) && (
                            <div className="mt-1 text-xs text-red-600">Ingresa un email válido.</div>
                        )}
                    </div>

                    {isFreelancer && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Años de experiencia</label>
                                <input
                                    type="number"
                                    name="years_experience"
                                    value={form.years_experience}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Área / Especialidad</label>
                                <select
                                    name="area"
                                    value={form.area || ''}
                                    onChange={handleChange}
                                    disabled={loadingAreas}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand bg-white"
                                >
                                    <option value="">{loadingAreas ? 'Cargando…' : 'Selecciona un área'}</option>
                                    {areas.map((a) => (
                                        <option key={a.id || a.name} value={(a.name || '').toString()}>
                                            {(a.name || '').toString()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">País</label>
                                <select
                                    name="country"
                                    value={form.country || ''}
                                    onChange={handleChange}
                                    disabled={loadingCountries}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand bg-white"
                                >
                                    <option value="">{loadingCountries ? 'Cargando…' : 'Selecciona un país'}</option>
                                    {countries.map((c) => (
                                        <option key={c.id || c.iso2} value={(c.iso2 || c.id || '').toString().toUpperCase()}>
                                            {(c.name || c.iso2 || '').toString()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ciudad</label>
                                <input
                                    type="text"
                                    name="city"
                                    value={form.city}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono</label>
                                <input
                                    type="text"
                                    name="phone"
                                    value={form.phone}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bio</label>
                                <textarea
                                    name="bio"
                                    value={form.bio}
                                    onChange={handleChange}
                                    rows={4}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Habilidades (separadas por coma)</label>
                                <div className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                    <div className="flex flex-wrap items-center gap-1">
                                        {parsedSkills.map((s, i) => (
                                            <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200">
                                                {s}
                                                <button
                                                    type="button"
                                                    onClick={() => removeSkill(i)}
                                                    className="ml-1 text-slate-500 hover:text-red-600"
                                                    aria-label="Quitar"
                                                >
                                                    <i className="bi bi-x-lg text-[10px]" />
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={skillInput}
                                            onChange={(e) => setSkillInput(e.target.value)}
                                            onKeyDown={handleSkillKeyDown}
                                            onBlur={handleSkillBlur}
                                            placeholder={parsedSkills.length === 0 ? 'React, Node.js, UI…' : 'Agregar habilidad…'}
                                            className="flex-1 min-w-[140px] border-0 outline-none bg-transparent py-1"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Fecha de Registro
                        </label>
                        <div className="text-slate-900 font-medium">
                            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </div>
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={savingProfile || !isValidEmail(form.email)}
                            className="inline-flex items-center px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                            {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </div>
            
            {isFreelancer && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Información Profesional</div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-briefcase text-slate-400" /> {form.area || 'No especificado'}</div>
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-bar-chart text-slate-400" /> {form.years_experience ? `${form.years_experience} años` : 'No especificado'}</div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <i className="bi bi-stars text-slate-400" />
                                {form.skills ? (
                                    <div className="flex flex-wrap gap-1">
                                        {form.skills.split(',').map((s, i) => (
                                            <span key={i} className="inline-flex items-center rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-100">{s.trim()}</span>
                                        ))}
                                    </div>
                                ) : 'Sin habilidades registradas'}
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Ubicación y Contacto</div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-geo-alt text-slate-400" /> {form.country || '-'}{form.city ? `, ${form.city}` : ''}</div>
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-envelope text-slate-400" /> {user?.email}</div>
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-telephone text-slate-400" /> {form.phone || '-'}</div>
                        </div>
                    </div>
                    <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Bio</div>
                        <div className="text-sm text-slate-700 leading-relaxed">{form.bio || 'Sin biografía disponible.'}</div>
                    </div>
                </div>
            )}

            {isFreelancer && (
                <div className="mt-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <a href="/dashboard/payment-settings" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-credit-card text-lg text-slate-500 group-hover:text-brand"></i>
                                <div className="font-semibold text-slate-900">Datos de Pago</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Configura métodos de cobro</div>
                        </a>
                        <a href="/dashboard/contracts" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-file-earmark-text text-lg text-slate-500 group-hover:text-brand"></i>
                                <div className="font-semibold text-slate-900">Mis Contratos</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Consulta tus contratos activos</div>
                        </a>
                        <a href="/dashboard/projects" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-kanban text-lg text-slate-500 group-hover:text-brand"></i>
                                <div className="font-semibold text-slate-900">Mis Proyectos</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Entregables y asignaciones</div>
                        </a>
                        <a href="/dashboard/net-salary" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-calculator text-lg text-slate-500 group-hover:text-brand"></i>
                                <div className="font-semibold text-slate-900">Calculadora</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Cálculo de liquidación</div>
                        </a>
                    </div>
                </div>
            )}

            <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Seguridad</h3>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-semibold text-slate-900">Contraseña</div>
                            <div className="text-sm text-slate-500">Te enviaremos un correo para cambiar tu contraseña.</div>
                        </div>
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={sendingReset}
                            className="px-4 py-2 rounded-xl bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                            {sendingReset ? 'Enviando...' : 'Cambiar contraseña'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
