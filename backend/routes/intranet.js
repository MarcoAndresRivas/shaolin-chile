const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const intranetController = require('../controllers/intranetController');
const escuelaController = require('../controllers/escuelaController');
const reservasController = require('../controllers/reservasController');
const disponibilidadController = require('../controllers/disponibilidadController');
const interesadosController = require('../controllers/interesadosController');
const familiasController = require('../controllers/familiasController');
const finanzasController = require('../controllers/finanzasController');
const gradosController = require('../controllers/gradosController');

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

// --- Interested people, follow-up and trial classes (administration) ---
router.get('/interesados', isAdmin, interesadosController.getInteresados);
router.get('/interesados/:id', isAdmin, interesadosController.getInteresado);
router.put('/interesados/:id', isAdmin, interesadosController.updateEstado);
router.post('/interesados/:id/seguimientos', isAdmin, interesadosController.addSeguimiento);
router.post('/interesados/:id/clase-prueba', isAdmin, interesadosController.agendarClasePrueba);
router.put('/clases-prueba/:id', isAdmin, interesadosController.updateClasePrueba);

// --- Families (administration), the guardian's view and consents (the person or their guardian) ---
router.get('/familias', isAdmin, familiasController.getFamilias);
router.post('/familias', isAdmin, familiasController.createFamilia);
router.delete('/familias/:id', isAdmin, familiasController.deleteFamilia);
router.post('/familias/:id/miembros', isAdmin, familiasController.addMiembro);
router.delete('/familias/:id/miembros/:usuarioId', isAdmin, familiasController.removeMiembro);
router.get('/familia/mia', familiasController.miFamilia);
router.get('/consentimientos', familiasController.getConsentimientos);
router.post('/consentimientos', familiasController.createConsentimiento);
router.put('/consentimientos/:id/revocar', familiasController.revocarConsentimiento);

// --- Finances: plans, subscriptions, charges, payments by transfer, statements (admin writes; the student or guardian reports payments and reads the statement) ---
router.get('/planes', finanzasController.getPlanes);
router.post('/planes', isAdmin, finanzasController.createPlan);
router.put('/planes/:id', isAdmin, finanzasController.updatePlan);
router.get('/suscripciones', isAdmin, finanzasController.getSuscripciones);
router.post('/suscripciones', isAdmin, finanzasController.createSuscripcion);
router.put('/suscripciones/:id', isAdmin, finanzasController.updateSuscripcion);
router.post('/cargos', isAdmin, finanzasController.createCargo);
router.post('/cargos/generar', isAdmin, finanzasController.generarCargos);
router.put('/cargos/:id/anular', isAdmin, finanzasController.anularCargo);
router.post('/cargos/:id/pagos', finanzasController.createPago);
router.get('/pagos', isAdmin, finanzasController.getPagos);
router.put('/pagos/:id/validar', isAdmin, finanzasController.validarPago);
router.put('/pagos/:id/rechazar', isAdmin, finanzasController.rechazarPago);
router.get('/cuenta/mia', finanzasController.miCuenta);
router.get('/morosidad', isAdmin, finanzasController.getMorosidad);

// --- Grades, progress, exams, nominations (instructor or admin) and results (admin) ---
router.get('/grados', gradosController.getGrados);
router.post('/grados', isAdmin, gradosController.createGrado);
router.post('/alumnos/:id/grados', isAdmin, gradosController.placeAlumno);
router.get('/progreso/mio', gradosController.miProgreso);
router.get('/habilitados', gradosController.habilitados);
router.get('/examenes', gradosController.getExamenes);
router.post('/examenes', isAdmin, gradosController.createExamen);
router.get('/examenes/:id', gradosController.getExamen);
router.put('/examenes/:id', isAdmin, gradosController.updateExamen);
router.post('/examenes/:id/nominaciones', gradosController.nominar);
router.put('/examenes/:id/nominaciones/:alumnoId/confirmar', isAdmin, gradosController.confirmar);
router.put('/examenes/:id/resultados', isAdmin, gradosController.resultados);

// --- Reservas / Booking (Alumno) ---
router.post('/reservar', intranetController.bookHorario); // Alumno books a class
router.get('/mis-reservas', intranetController.getMyBookings); // Alumno views their classes

module.exports = router;
