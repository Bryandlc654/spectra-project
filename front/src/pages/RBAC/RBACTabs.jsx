import React from 'react';
import { NavLink } from 'react-router-dom';

export default function RBACTabs() {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
      <NavLink
        to="/dashboard/rbac/roles"
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            isActive
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`
        }
      >
        Roles del Sistema
      </NavLink>
      <NavLink
        to="/dashboard/rbac/permissions"
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            isActive
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`
        }
      >
        Catálogo de Permisos
      </NavLink>
    </div>
  );
}
