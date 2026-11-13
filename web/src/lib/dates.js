// Calendar helpers. Dates travel as YYYY-MM-DD text and "today" is the day in
// Chile, so the portal agrees with the backend near midnight.

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayInChile(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

export function addDays(iso, days) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// First and last day of the month that contains `iso`.
export function monthRange(iso) {
  const [year, month] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return { desde: first.toISOString().slice(0, 10), hasta: last.toISOString().slice(0, 10) };
}
