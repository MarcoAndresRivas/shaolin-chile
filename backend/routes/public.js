const express = require('express');
const interesadosController = require('../controllers/interesadosController');

// Routes that need no login. The form is rate limited per IP.
module.exports = function publicRoutes({ rateLimit }) {
    const router = express.Router();
    router.get('/catalogo', interesadosController.catalogo);
    router.post('/interesados', rateLimit, interesadosController.registrar);
    return router;
};
