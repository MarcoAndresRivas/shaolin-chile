const express = require('express');
const interesadosController = require('../controllers/interesadosController');
const ventasController = require('../controllers/ventasController');

// Routes that need no login. The forms are rate limited per IP.
module.exports = function publicRoutes({ rateLimit, salesLimit }) {
    const router = express.Router();
    router.get('/catalogo', interesadosController.catalogo);
    router.post('/interesados', rateLimit, interesadosController.registrar);
    // Seminars and courses: the catalog, buying and the buyer's own purchase
    // (code + email). The purchase routes share one limit, so codes cannot be guessed.
    router.get('/ofertas', ventasController.getOfertas);
    router.post('/compras', salesLimit, ventasController.crearCompra);
    router.get('/compras/:codigo', salesLimit, ventasController.getCompra);
    router.post('/compras/:codigo/pago', salesLimit, ventasController.informarPago);
    return router;
};
