const jwt = require('jsonwebtoken');

const ADMIN_ROLES = ['Director', 'Administrador', 'Desarrollador'];

// Tokens issued before usuario_roles existed only carry the legacy rol_id.
// They expire after 8 hours; until then they keep their previous permissions.
const LEGACY_ROLE_NAMES = {
    1: 'Desarrollador',
    2: 'Administrador',
    3: 'Colaborador',
    4: 'Externo',
    5: 'Alumno',
};

function rolesOf(user) {
    if (!user) return [];
    if (Array.isArray(user.roles)) return user.roles;
    const legacy = LEGACY_ROLE_NAMES[user.rol_id];
    return legacy ? [legacy] : [];
}

function hasAnyRole(user, allowed) {
    return rolesOf(user).some((role) => allowed.includes(role));
}

exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'Se requiere un token de autenticación para acceder a este recurso.' });
    }

    try {
        // Bearer <token>
        const tokenString = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

        const decoded = jwt.verify(tokenString, req.app.locals.config.jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};

exports.isAdmin = (req, res, next) => {
    if (hasAnyRole(req.user, ADMIN_ROLES)) return next();
    return res.status(403).json({ error: 'Acceso denegado. Requiere privilegios de administrador.' });
};

exports.rolesOf = rolesOf;
exports.hasAnyRole = hasAnyRole;
exports.ADMIN_ROLES = ADMIN_ROLES;
