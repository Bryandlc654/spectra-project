import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function SigningCompletePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const event = searchParams.get('event');

    useEffect(() => {
        // Automatically redirect to dashboard after a few seconds
        const timer = setTimeout(() => {
            navigate('/dashboard');
        }, 5000);

        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-100">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                    <i className="bi bi-check-lg text-4xl text-emerald-600" />
                </div>
                
                <h1 className="mb-2 text-2xl font-bold text-slate-900">
                    {event === 'signing_complete' ? '¡Firmado Correctamente!' : 'Proceso Finalizado'}
                </h1>
                
                <p className="mb-8 text-slate-600">
                    El documento ha sido procesado exitosamente. Serás redirigido al dashboard en unos segundos.
                </p>

                <button
                    onClick={() => navigate('/dashboard')}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
                >
                    Volver al Inicio
                </button>
            </div>
        </div>
    );
}
