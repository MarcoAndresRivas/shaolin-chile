const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'Se requiere un token de autenticación para acceder a este recurso.' });
    }

    try {
        // Bearer <token>
        const tokenString = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

        const decoded = jwt.verify(tokenString, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};

// Middleware to check if user has Admin role (rol_id 1 or 2)
exports.isAdmin = (req, res, next) => {
    if (req.user && (req.user.rol_id === 1 || req.user.rol_id === 2)) {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado. Requiere privilegios de administrador.' });
    }
};
