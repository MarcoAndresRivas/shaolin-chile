const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Register a new representative
router.post('/register', authController.register);

// Login for Intranet
router.post('/login', authController.login);

module.exports = router;
