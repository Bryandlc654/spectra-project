import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { createApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getStoredSession } from '../session';
import { PLATFORM_ROLES, ROLE_LABELS } from '../lib/platformRoles';

const FREELANCER_ROLES = [PLATFORM_ROLES.FREELANCER, 'freelance'];

const STATUS_LABELS = {
    active: 'Activo',
    pending: 'Pendiente',
    inactive: 'Inactivo',
    blocked: 'Bloqueado',
    suspended: 'Suspendido',
    rejected: 'Rechazado'
};

const FIELD_LABELS = {
    full_name: 'Nombre completo',
    email: 'Email',
    current_password: 'Contraseña actual',
    years_experience: 'Años de experiencia',
    area: 'Área / Especialidad',
    country: 'País',
    city: 'Ciudad',
    phone: 'Teléfono',
    bio: 'Bio',
    skills: 'Habilidades'
};

export default function ProfilePage({ apiUrl, token }) {
    const { user: sessionUser } = useAuth();
    const [user, setUser] = useState(() => {
        // getStoredSession() ya parsea de forma segura; leer localStorage con
        // JSON.parse directo lanzaba una pantalla blanca si el JSON era inválido.
        const stored = getStoredSession();
        return stored?.user || sessionUser || {};
    });
    const isFreelancer = FREELANCER_ROLES.includes(user?.platform_role);
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
    const [currentPassword, setCurrentPassword] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
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

    const emailChanged = useMemo(() => {
        const current = String(user?.email || '').trim().toLowerCase();
        const next = String(form.email || '').trim().toLowerCase();
        return next !== '' && next !== current;
    }, [form.email, user?.email]);

    const parsedSkills = useMemo(
        () => (form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : []),
        [form.skills]
    );

    // Si el valor guardado no está entre las opciones (área renombrada, país
    // guardado con otro formato) se añade como opción para no perderlo en
    // silencio al guardar.
    const areaOptions = useMemo(() => {
        const values = areas.map(a => ({ value: (a.name || '').toString(), label: (a.name || '').toString() }));
        const current = form.area || '';
        if (current && !values.some(o => o.value === current)) {
            values.unshift({ value: current, label: `${current} (no disponible)` });
        }
        return values;
    }, [areas, form.area]);

    const countryOptions = useMemo(() => {
        const values = countries.map(c => ({
            value: (c.iso2 || c.id || '').toString().toUpperCase(),
            label: (c.name || c.iso2 || '').toString()
        }));
        const current = form.country || '';
        if (current && !values.some(o => o.value === current)) {
            values.unshift({ value: current, label: `${current} (no disponible)` });
        }
        return values;
    }, [countries, form.country]);

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
                    full_name: u.full_name || prev.full_name,
                    years_experience: u.years_experience ?? '',
                    area: u.area || '',
                    country: u.country || '',
                    city: u.city || '',
                    phone: u.phone || '',
                    bio: u.bio || '',
                    skills: u.skills || ''
                }));
            } catch (e) {
                if (mounted) setErr(e.message || 'No se pudo cargar tu perfil de freelancer');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [isFreelancer, user?.id, api, reloadKey]);

    useEffect(() => {
        if (!isFreelancer) return;
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
    }, [api, isFreelancer]);

    useEffect(() => {
        if (!isFreelancer) return;
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
    }, [api, isFreelancer]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!user?.id) {
            toast.error('No se pudo identificar al usuario actual');
            return;
        }
        if (!form.full_name.trim()) {
            toast.error('El nombre no puede estar vacío');
            return;
        }
        if (emailChanged && !currentPassword) {
            toast.error('Confirma tu contraseña actual para cambiar el email');
            return;
        }

        setSavingProfile(true);
        try {
            const payload = { full_name: form.full_name, email: form.email };
            if (emailChanged) payload.current_password = currentPassword;

            await api.put(`/api/users/${user.id}`, payload);

            if (isFreelancer) {
                // `full_name` es obligatorio en el backend: si no viaja, el PUT
                // responde 422 y ningún campo del perfil se guardaba.
                const fPayload = {
                    full_name: form.full_name,
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
            setCurrentPassword('');
            try {
                const session = getStoredSession();
                if (session) {
                    localStorage.setItem('spectra_session', JSON.stringify({ ...session, user: updatedUser }));
                }
            } catch (e2) {
                // Si localStorage no está disponible la sesión en memoria ya se actualizó.
            }
            toast.success('Perfil actualizado correctamente');
        } catch (err) {
            const message = typeof err?.message === 'string' && err.message
                ? err.message
                : 'No se pudo actualizar el perfil';
            toast.error(message.includes('perfil') ? message : `${message}. No se guardaron los cambios.`);
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

    const statusLabel = STATUS_LABELS[status] || status || '—';
    const roleLabel = ROLE_LABELS[user?.platform_role] || user?.platform_role || 'Rol desconocido';
    const canSubmit = !savingProfile && isValidEmail(form.email) && (!emailChanged || !!currentPassword);

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Mi Perfil</h1>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center gap-4">
                    <div className="h-20 w-20 rounded-full bg-brand/10 text-brand flex items-center justify-center text-3xl font-bold shrink-0">
                        {(user?.full_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900">{user?.full_name || 'Usuario'}</h2>
                            {isFreelancer && (
                                <>
                                    <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                            status === 'active'
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : 'border-slate-200 bg-slate-50 text-slate-700'
                                        }`}
                                    >
                                        {statusLabel}
                                    </span>
                                    {freelancerCode && (
                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                            Código: {freelancerCode}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        <p className="text-slate-500 break-all">{user?.email}</p>
                        <div className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                            {roleLabel}
                        </div>
                        {isFreelancer && reviewsSummary && (
                            <div className="mt-2 flex items-center gap-2">
                                <div className="text-amber-400 text-sm" aria-hidden="true">
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

                {err && (
                    <div role="alert" className="m-6 mb-0 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                        <i className="bi bi-exclamation-triangle text-red-600 mt-0.5" aria-hidden="true" />
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-red-800">No se pudo cargar tu perfil</div>
                            <div className="text-sm text-red-700">{err}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReloadKey(k => k + 1)}
                            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="p-10 text-center text-slate-500">
                        <div className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" aria-hidden="true" />
                            Cargando tu perfil…
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6" noValidate>
                        <div className="md:col-span-2">
                            <label htmlFor="pf-full_name" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                {FIELD_LABELS.full_name}
                            </label>
                            <input
                                id="pf-full_name"
                                type="text"
                                name="full_name"
                                value={form.full_name}
                                onChange={handleChange}
                                required
                                maxLength={120}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                placeholder="Tu nombre y apellidos"
                            />
                        </div>

                        <div>
                            <label htmlFor="pf-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                {FIELD_LABELS.email}
                            </label>
                            <input
                                id="pf-email"
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={(e) => { setEmailTouched(true); handleChange(e); }}
                                onBlur={() => setEmailTouched(true)}
                                aria-invalid={emailTouched && !isValidEmail(form.email)}
                                aria-describedby="pf-email-help"
                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none ${emailTouched && !isValidEmail(form.email) ? 'border border-red-300 focus:border-red-500' : 'border border-slate-200 focus:border-brand'}`}
                                placeholder="tu@correo.com"
                            />
                            {emailTouched && !isValidEmail(form.email) && (
                                <div id="pf-email-help" className="mt-1 text-xs text-red-600">Ingresa un email válido.</div>
                            )}
                        </div>

                        {emailChanged && (
                            <div>
                                <label htmlFor="pf-current_password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                    {FIELD_LABELS.current_password}
                                </label>
                                <input
                                    id="pf-current_password"
                                    type="password"
                                    name="current_password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    autoComplete="current-password"
                                    aria-describedby="pf-current_password-help"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                    placeholder="••••••••"
                                />
                                <div id="pf-current_password-help" className="mt-1 text-xs text-slate-500">
                                    Necesaria para confirmar el cambio de email.
                                </div>
                            </div>
                        )}

                        {isFreelancer && (
                            <>
                                <div>
                                    <label htmlFor="pf-years_experience" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.years_experience}
                                    </label>
                                    <input
                                        id="pf-years_experience"
                                        type="number"
                                        name="years_experience"
                                        value={form.years_experience}
                                        onChange={handleChange}
                                        min={0}
                                        max={80}
                                        inputMode="numeric"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pf-area" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.area}
                                    </label>
                                    <select
                                        id="pf-area"
                                        name="area"
                                        value={form.area || ''}
                                        onChange={handleChange}
                                        disabled={loadingAreas}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand bg-white disabled:opacity-60"
                                    >
                                        <option value="">{loadingAreas ? 'Cargando…' : 'Selecciona un área'}</option>
                                        {areaOptions.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="pf-country" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.country}
                                    </label>
                                    <select
                                        id="pf-country"
                                        name="country"
                                        value={form.country || ''}
                                        onChange={handleChange}
                                        disabled={loadingCountries}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand bg-white disabled:opacity-60"
                                    >
                                        <option value="">{loadingCountries ? 'Cargando…' : 'Selecciona un país'}</option>
                                        {countryOptions.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="pf-city" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.city}
                                    </label>
                                    <input
                                        id="pf-city"
                                        type="text"
                                        name="city"
                                        value={form.city}
                                        onChange={handleChange}
                                        maxLength={120}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pf-phone" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.phone}
                                    </label>
                                    <input
                                        id="pf-phone"
                                        type="tel"
                                        name="phone"
                                        value={form.phone}
                                        onChange={handleChange}
                                        maxLength={40}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="pf-bio" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        {FIELD_LABELS.bio}
                                    </label>
                                    <textarea
                                        id="pf-bio"
                                        name="bio"
                                        value={form.bio}
                                        onChange={handleChange}
                                        rows={4}
                                        maxLength={2000}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                                    />
                                    <div className="mt-1 text-right text-[11px] text-slate-400">{form.bio.length}/2000</div>
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="pf-skill-input" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        Habilidades
                                    </label>
                                    <div className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                        <div className="flex flex-wrap items-center gap-1">
                                            {parsedSkills.map((s, i) => (
                                                <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200">
                                                    {s}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSkill(i)}
                                                        className="ml-1 text-slate-500 hover:text-red-600"
                                                        aria-label={`Quitar ${s}`}
                                                    >
                                                        <i className="bi bi-x-lg text-[10px]" aria-hidden="true" />
                                                    </button>
                                                </span>
                                            ))}
                                            <input
                                                id="pf-skill-input"
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
                                    <div className="mt-1 text-[11px] text-slate-400">Pulsa Enter o coma para agregar.</div>
                                </div>
                            </>
                        )}

                        <div>
                            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                Fecha de Registro
                            </span>
                            <div className="text-slate-900 font-medium">
                                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                            </div>
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className="inline-flex items-center px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                                {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {isFreelancer && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Información Profesional</div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-briefcase text-slate-400" aria-hidden="true" /> {form.area || 'No especificado'}</div>
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-bar-chart text-slate-400" aria-hidden="true" /> {form.years_experience ? `${form.years_experience} años` : 'No especificado'}</div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <i className="bi bi-stars text-slate-400" aria-hidden="true" />
                                {parsedSkills.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {parsedSkills.map((s, i) => (
                                            <span key={`${s}-${i}`} className="inline-flex items-center rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-100">{s}</span>
                                        ))}
                                    </div>
                                ) : 'Sin habilidades registradas'}
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Ubicación y Contacto</div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-geo-alt text-slate-400" aria-hidden="true" /> {form.country || '-'}{form.city ? `, ${form.city}` : ''}</div>
                            <div className="flex items-center gap-2 text-slate-700 break-all"><i className="bi bi-envelope text-slate-400 shrink-0" aria-hidden="true" /> {user?.email}</div>
                            <div className="flex items-center gap-2 text-slate-700"><i className="bi bi-telephone text-slate-400" aria-hidden="true" /> {form.phone || '-'}</div>
                        </div>
                    </div>
                    <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <div className="font-bold text-slate-900 mb-2">Bio</div>
                        <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{form.bio || 'Sin biografía disponible.'}</div>
                    </div>
                </div>
            )}

            {isFreelancer && (
                <div className="mt-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Link to="/dashboard/payment-settings" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-credit-card text-lg text-slate-500 group-hover:text-brand" aria-hidden="true"></i>
                                <div className="font-semibold text-slate-900">Datos de Pago</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Configura métodos de cobro</div>
                        </Link>
                        <Link to="/dashboard/contracts" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-file-earmark-text text-lg text-slate-500 group-hover:text-brand" aria-hidden="true"></i>
                                <div className="font-semibold text-slate-900">Mis Contratos</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Consulta tus contratos activos</div>
                        </Link>
                        <Link to="/dashboard/projects" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-kanban text-lg text-slate-500 group-hover:text-brand" aria-hidden="true"></i>
                                <div className="font-semibold text-slate-900">Mis Proyectos</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Entregables y asignaciones</div>
                        </Link>
                        <Link to="/dashboard/net-salary" className="group rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-calculator text-lg text-slate-500 group-hover:text-brand" aria-hidden="true"></i>
                                <div className="font-semibold text-slate-900">Calculadora</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Cálculo de liquidación</div>
                        </Link>
                    </div>
                </div>
            )}

            <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Seguridad</h3>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="font-semibold text-slate-900">Contraseña</div>
                            <div className="text-sm text-slate-500">Te enviaremos un correo para cambiar tu contraseña.</div>
                        </div>
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={sendingReset}
                            className="shrink-0 px-4 py-2 rounded-xl bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                            {sendingReset ? 'Enviando...' : 'Cambiar contraseña'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
