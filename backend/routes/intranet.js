const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const intranetController = require('../controllers/intranetController');
const escuelaController = require('../controllers/escuelaController');
const reservasController = require('../controllers/reservasController');
const disponibilidadController = require('../controllers/disponibilidadController');

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

// --- Escuela: sedes, disciplinas, clases and sesiones (read: any role, write: admin) ---
router.get('/sedes', escuelaController.getSedes);
router.post('/sedes', isAdmin, escuelaController.createSede);
router.put('/sedes/:id', isAdmin, escuelaController.updateSede);
router.get('/disciplinas', escuelaController.getDisciplinas);
router.get('/clases', escuelaController.getClases);
router.post('/clases', isAdmin, escuelaController.createClase);
router.delete('/clases/:id', isAdmin, escuelaController.deleteClase);
router.post('/clases/:id/sesiones', isAdmin, escuelaController.generateSesiones);
router.get('/sesiones', escuelaController.getSesiones);
router.post('/sesiones/:id/cancelar', isAdmin, escuelaController.cancelSesion);

// --- Reservas of sesiones (student) and attendance (instructor of the clase or admin) ---
router.post('/sesiones/:id/reservar', reservasController.reservar);
router.delete('/sesiones/:id/reservar', reservasController.cancelarReserva);
router.get('/reservas/mias', reservasController.misReservas);
router.get('/sesiones/:id/asistencia', reservasController.getAsistencia);
router.put('/sesiones/:id/asistencia', reservasController.saveAsistencia);
router.get('/asistencia/mia', reservasController.miAsistencia);

// --- Weekly availability of instructors (the instructor, or administration) ---
router.get('/disponibilidad', disponibilidadController.getDisponibilidad);
router.put('/disponibilidad', disponibilidadController.saveDisponibilidad);

// --- Reservas / Booking (Alumno) ---
router.post('/reservar', intranetController.bookHorario); // Alumno books a class
router.get('/mis-reservas', intranetController.getMyBookings); // Alumno views their classes

module.exports = router;
