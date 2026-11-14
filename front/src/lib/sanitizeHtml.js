import DOMPurify from 'dompurify';

// Etiquetas de formato que usan las plantillas de contrato (espejo de
// SignatureController::sanitizeBody en el backend). Sin atributos: así no
// pueden colarse onclick=, onerror=, style= ni enlaces javascript:.
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'span', 'div',
];

/**
 * Limpia HTML no confiable antes de inyectarlo con innerHTML o
 * dangerouslySetInnerHTML. El token de sesión vive en localStorage, así que
 * cualquier script inyectado podría robarlo: todo HTML que venga del servidor
 * o del usuario debe pasar por aquí.
 */
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html ?? ''), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  });
}
