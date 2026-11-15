// Today in Chile as YYYY-MM-DD, so "past" does not depend on the server's time zone.
const todayInChile = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);

module.exports = { todayInChile };
