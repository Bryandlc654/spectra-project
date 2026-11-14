import React from 'react';

export default function CountryCalculatorSwitch({ country, onChange }) {
  const options = [
    { value: 'PE', label: 'Perú' },
    { value: 'MX', label: 'México' },
    { value: 'CO', label: 'Colombia' },
  ];

  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            country === option.value ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
