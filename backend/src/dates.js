// Today in Chile as YYYY-MM-DD, so "past" does not depend on the server's time zone.
const todayInChile = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);

// A DATE column as YYYY-MM-DD: mysql2 gives a local-time Date, SQLite gives text.
const isoDay = (value) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return String(value).slice(0, 10);
};

module.exports = { todayInChile, isoDay };
