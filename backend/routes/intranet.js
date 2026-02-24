const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const intranetController = require('../controllers/intranetController');

// All intranet routes are protected by verifyToken
router.use(verifyToken);

// --- User Management (Admin only) ---
router.get('/usuarios', isAdmin, intranetController.getUsuarios);
router.post('/usuarios', isAdmin, intranetController.createUsuario);

// --- Horarios / Classes Management ---
router.get('/horarios', intranetController.getHorarios); // All roles can view
router.post('/horarios', isAdmin, intranetController.createHorario); // Admin only (could expand to Colaborador later)
router.put('/horarios/:id', isAdmin, intranetController.updateHorario);
router.delete('/horarios/:id', isAdmin, intranetController.deleteHorario);

// --- Reservas / Booking (Alumno) ---
router.post('/reservar', intranetController.bookHorario); // Alumno books a class
router.get('/mis-reservas', intranetController.getMyBookings); // Alumno views their classes

module.exports = router;
