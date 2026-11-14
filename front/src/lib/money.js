// Formato de importes único para toda el área de Finanzas.
// Antes cada página usaba un locale distinto ("50,000.00", "50.000,00", "2000,00").
export function formatMoney(amount, symbol = '') {
  const n = Number(amount);
  const text = (Number.isFinite(n) ? n : 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol || ''} ${text}`.trim();
}

const TX_TYPES = {
  deposit: 'Depósito',
  payment: 'Pago',
  withdrawal: 'Retiro',
  adjustment: 'Ajuste',
  fee: 'Comisión',
  refund: 'Reembolso',
  transfer: 'Transferencia',
};
const TX_REFERENCES = {
  manual: 'Manual',
  payroll: 'Nómina',
  payroll_fee: 'Comisión de nómina',
  invoice: 'Factura',
  invoice_fee: 'Comisión de factura',
  advance: 'Adelanto',
  contract_fee: 'Comisión de contrato',
};

export function txTypeLabel(type) {
  const k = String(type || '').toLowerCase();
  return TX_TYPES[k] || type || '—';
}

export function txReferenceLabel(ref) {
  const k = String(ref || 'manual').toLowerCase();
  return TX_REFERENCES[k] || ref;
}
