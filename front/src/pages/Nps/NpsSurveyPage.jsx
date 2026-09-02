import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, resolveApiUrl } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function NpsSurveyPage() {
  const { user, token } = useAuth();
  const toast = useToast();
  const [score, setScore] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (score === null) {
      toast.error('Por favor selecciona una puntuación');
      return;
    }

    setLoading(true);
    try {
      await apiFetch(resolveApiUrl(), '/api/nps/submit', {
        token,
        method: 'POST',
        body: JSON.stringify({ score, feedback })
      });
      setSubmitted(true);
      toast.success('¡Gracias por tu feedback!');
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar feedback');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-lg shadow text-center">
        <div className="text-5xl mb-4">🙌</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Gracias por tu opinión!</h2>
        <p className="text-gray-600">Tu feedback nos ayuda a mejorar cada día.</p>
        <button 
          onClick={() => { setSubmitted(false); setScore(null); setFeedback(''); }}
          className="mt-6 text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Enviar otra respuesta
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6 bg-indigo-600 text-white">
          <h1 className="text-2xl font-bold">Encuesta de Satisfacción (eNPS)</h1>
          <p className="mt-2 opacity-90">Tu opinión es anónima y muy importante para nosotros.</p>
        </div>
        
        <div className="p-8">
          <h3 className="text-xl font-medium text-gray-800 mb-6 text-center">
            ¿Qué tan probable es que recomiendes trabajar aquí a un amigo o colega?
          </h3>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setScore(num)}
                className={`
                  w-10 h-10 rounded-full font-bold transition-all transform hover:scale-110
                  ${score === num 
                    ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-300' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                `}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-xs text-gray-500 px-4 mb-8">
            <span>Nada probable (0)</span>
            <span>Muy probable (10)</span>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ¿Qué es lo que más (o menos) valoras? (Opcional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              rows="4"
              placeholder="Comparte tus comentarios..."
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={loading || score === null}
              className={`
                px-6 py-2 rounded-md text-white font-medium
                ${loading || score === null 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'}
              `}
            >
              {loading ? 'Enviando...' : 'Enviar Respuesta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
