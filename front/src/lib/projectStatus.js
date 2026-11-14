/**
 * Estados de `projects.status` segun el enum de la base de datos:
 *   enum('active','on_hold','closed')
 *
 * El frontend antes solo traducía 'active' y 'completed'. 'completed' no existe
 * en ese enum, asi que la rama era codigo muerto y un proyecto cerrado se
 * pintaba con el literal en ingles "closed". Ojo: `project_milestones.status`
 * es un enum DISTINTO, enum('pending','in_progress','completed'), y este mapa
 * no aplica para los hitos.
 */
export const PROJECT_STATUS_META = {
    active: { label: 'Activo', badgeClass: 'bg-emerald-100 text-emerald-800' },
    on_hold: { label: 'En pausa', badgeClass: 'bg-amber-100 text-amber-800' },
    closed: { label: 'Finalizado', badgeClass: 'bg-blue-100 text-blue-800' },
};

const UNKNOWN_META = { label: 'Sin estado', badgeClass: 'bg-slate-100 text-slate-800' };

/**
 * Devuelve { label, badgeClass } para cualquier valor de projects.status.
 * Un estado desconocido cae en un literal legible en vez de enseñar el valor
 * crudo de la base de datos.
 */
export function getProjectStatus(status) {
    return PROJECT_STATUS_META[status] || UNKNOWN_META;
}

/** Un proyecto cuenta como "en curso" solo si esta activo. */
export function isProjectActive(status) {
    return status === 'active';
}
