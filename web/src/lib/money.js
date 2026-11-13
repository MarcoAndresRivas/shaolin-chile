// Chilean pesos are whole numbers: no decimals anywhere.

export function formatPesos(amount) {
  const digits = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  return `${amount < 0 ? '-' : ''}$${digits}`;
}

// Turns what a person typed ("$ 1.250.000", "30.000", "15000") into whole pesos.
// Returns null when it is not a positive whole amount.
export function parsePesos(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[\s$]/g, '');
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(cleaned)) return null;
  const amount = Number(cleaned.replace(/\./g, ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
