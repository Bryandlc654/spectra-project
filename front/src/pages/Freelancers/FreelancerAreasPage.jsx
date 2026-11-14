import React from 'react';
import { Link } from 'react-router-dom';
import FreelancerAreasManager from './FreelancerAreasManager';

export default function FreelancerAreasPage({ apiUrl }) {
    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
                <Link to="/dashboard/freelancers" className="inline-flex items-center text-sm text-slate-500 hover:text-brand mb-4">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver a Freelancers
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Áreas y Especialidades</h1>
                    <p className="text-slate-500">Gestiona las áreas disponibles para los freelancers.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <FreelancerAreasManager apiUrl={apiUrl} />
            </div>
        </div>
    );
}
