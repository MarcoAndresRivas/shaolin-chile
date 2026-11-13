// A small in-memory limiter for public endpoints: at most `max` requests per
// `windowMs` for each client IP. The state lives in the process, so it resets
// on restart and is per instance, which is enough to stop a form from being
// flooded by one visitor.

function createRateLimiter({ max, windowMs, now = Date.now }) {
    const hits = new Map(); // ip -> timestamps of requests inside the window

    return function rateLimit(req, res, next) {
        const current = now();
        const recent = (hits.get(req.ip) ?? []).filter((time) => current - time < windowMs);

        if (recent.length >= max) {
            hits.set(req.ip, recent);
            return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
        }

        recent.push(current);
        hits.set(req.ip, recent);

        // Forget visitors whose window has passed so the map does not grow forever.
        if (hits.size > 5000) {
            for (const [ip, times] of hits) {
                if (times.every((time) => current - time >= windowMs)) hits.delete(ip);
            }
        }
        next();
    };
}

module.exports = { createRateLimiter };
