import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StatusMessage from './components/StatusMessage';

export default function AuthPage({ apiUrl, onAuth, existingSession }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login'); // login | register | reset
  const [resetToken, setResetToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ tone: 'info', message: '' });

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  const title = useMemo(() => {
    if (mode === 'login') return 'Iniciar sesión';
    if (mode === 'register') return 'Crear administrador';
    if (mode === 'reset') return 'Restablecer contraseña';
    return '';
  }, [mode]);

  useEffect(() => {
    if (existingSession?.token) {
      setStatus({ tone: 'info', message: 'Sesión activa detectada. Ingresando al panel...' });
      onAuth(existingSession);
      navigate('/dashboard', { replace: true });
    }
  }, [existingSession, onAuth, navigate]);

  // Handle Reset Password Route
  useEffect(() => {
    if (location.pathname === '/auth/reset-password') {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');
      const emailParam = params.get('email');

      if (token && emailParam) {
        setMode('reset');
        setResetToken(token);
        setEmail(emailParam);
        setStatus({ tone: 'info', message: 'Ingresa tu nueva contraseña.' });
      } else {
        setStatus({ tone: 'error', message: 'Enlace de restablecimiento inválido o incompleto.' });
        // Redirect to login after a delay? Or just show error.
        // navigate('/auth');
      }
    }
  }, [location]);

  useEffect(() => {
    const storedEmail = localStorage.getItem('spectra_remember_email_value');
    const storedFlag = localStorage.getItem('spectra_remember_email_flag');
    if (storedEmail && storedFlag === '1') {
      setEmail(storedEmail);
      setRememberEmail(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const userStr = params.get('user');
    const error = params.get('error');

    if (token && userStr) {
      try {
        // userStr is base64 encoded JSON
        const user = JSON.parse(atob(userStr));
        onAuth({ token, user });
        // Standard redirection to dashboard
        navigate('/dashboard', { replace: true });
      } catch (e) {
        console.error('Error parsing SSO user', e);
        setStatus({ tone: 'error', message: 'Error procesando inicio de sesión SSO' });
      }
    } else if (error) {
      let msg = 'Error en inicio de sesión';
      if (error === 'user_not_found') msg = 'Usuario no encontrado';
      if (error === 'account_inactive') msg = 'Cuenta inactiva';
      setStatus({ tone: 'error', message: msg });
    }
  }, [location, onAuth, navigate]);

  async function handleSsoLogin(provider) {
    try {
      setLoading(true);
      const currentOrigin = window.location.origin + '/auth'; 
      const res = await fetch(`${apiUrl}/api/auth/${provider}/url?redirect_to=${encodeURIComponent(currentOrigin)}`);
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No se recibió URL de redirección');
      }
    } catch (e) {
      console.error(e);
      setStatus({ tone: 'error', message: 'Error iniciando SSO con ' + provider });
      setLoading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setStatus({ tone: 'info', message: '' });

    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      setStatus({ tone: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    setLoading(true);

    try {
      if (mode === 'reset') {
        const res = await fetch(`${apiUrl}/api/password/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: resetToken, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            data?.details?.message ||
            data?.details?.error ||
            data?.error ||
            data?.message ||
            `HTTP ${res.status}`;
          throw new Error(msg);
        }

        setStatus({ tone: 'success', message: 'Contraseña actualizada. Ahora inicia sesión.' });
        setMode('login');
        setPassword('');
        setConfirm('');
        setResetToken(null);
        navigate('/auth'); // Clean URL
        return;
      }

      const endpoint = mode === 'login' ? '/api/login' : '/api/register';

      const payload =
        mode === 'login'
          ? { email, password }
          : { full_name: fullName, email, password };

      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.details?.message ||
          data?.details?.error ||
          data?.error ||
          data?.message ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      if (mode === 'login') {
        const session = { token: data.token, refreshToken: data.refresh_token, user: data.user };
        onAuth(session);
        if (rememberEmail) {
          try {
            localStorage.setItem('spectra_remember_email_value', email);
            localStorage.setItem('spectra_remember_email_flag', '1');
          } catch {}
        } else {
          try {
            localStorage.removeItem('spectra_remember_email_value');
            localStorage.removeItem('spectra_remember_email_flag');
          } catch {}
        }
        // Standard redirection to dashboard
        navigate('/dashboard', { replace: true });
        return;
      }

      setStatus({ tone: 'success', message: 'Administrador creado. Ahora inicia sesión.' });
      setMode('login');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setStatus({ tone: 'error', message: err?.message || 'Error inesperado' });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setStatus({ tone: 'info', message: '' });

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setStatus({ tone: 'error', message: 'Ingresa tu correo para recuperar la contraseña.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus({ tone: 'error', message: 'Ingresa un correo válido.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.details?.message ||
          data?.details?.error ||
          data?.error ||
          data?.message ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setStatus({
        tone: 'success',
        message:
          data?.message ||
          'Si el correo está registrado, te hemos enviado un enlace para restablecer la contraseña.',
      });
    } catch (err) {
      setStatus({
        tone: 'error',
        message: err?.message || 'No se pudo iniciar el proceso de recuperación de contraseña.',
      });
    } finally {
      setLoading(false);
    }
  }

  const inputType = showPassword ? 'text' : 'password';
  const eyeIcon = showPassword ? 'bi-eye-slash' : 'bi-eye';
  const eyeLabel = showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-brand/10 grid place-items-center">
            <i className="bi bi-stars text-brand text-xl" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === 'login' ? 'Accede al panel global.' : 'Usa esto solo para el arranque inicial.'}
          </p>
        </div>

        {mode !== 'reset' && (
          <div className="mb-5 flex rounded-2xl bg-white border border-slate-200 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              Register
            </button>
          </div>
        )}

        {status?.message ? <StatusMessage tone={status.tone} message={status.message} /> : null}

        <form onSubmit={submit} className="mt-4 space-y-6 rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          {mode === 'register' && (
            <div>
              <label className="text-sm font-semibold text-slate-700">Nombre completo</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre y apellido"
                required
              />
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-700">Correo</label>
            <input
              type="email"
              className={`mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand ${
                mode === 'reset' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@dominio.com"
              required
              readOnly={mode === 'reset'}
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-sm font-semibold text-slate-700">
              {mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}
            </label>
            <div className="relative mt-1">
              <input
                type={inputType}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 pr-11 outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-brand/15"
                aria-label={eyeLabel}
                title={eyeLabel}
              >
                <i className={`bi ${eyeIcon}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Confirm */}
          {(mode === 'register' || mode === 'reset') && (
            <div>
              <label className="text-sm font-semibold text-slate-700">Confirmar contraseña</label>
              <div className="relative mt-1">
                <input
                  type={inputType}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-brand/15"
                  aria-label={eyeLabel}
                  title={eyeLabel}
                >
                  <i className={`bi ${eyeIcon}`} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-slate-600">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                />
                <span>Recordar</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-brand hover:text-brand-dark font-semibold"
                disabled={loading}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <button
            disabled={loading}
            className="w-full h-12 rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand/90 transition disabled:opacity-60"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
              ? 'Ingresar'
              : mode === 'reset'
              ? 'Cambiar contraseña'
              : 'Crear admin'}
          </button>

          {mode === 'login' && (
            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-slate-500">O continúa con</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSsoLogin('google')}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                >
                  <i className="bi bi-google text-base" />
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => handleSsoLogin('microsoft')}
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                >
                  <i className="bi bi-microsoft text-base" />
                  Microsoft
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
