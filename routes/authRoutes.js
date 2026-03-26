const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { loginLimiter, registerLimiter, csrfProtection } = require('../config/security');
const authService = require('../services/authService');

const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Benutzername muss 3-50 Zeichen lang sein')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten'),
    body('email')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Ungültige E-Mail-Adresse'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Passwort muss mindestens 8 Zeichen lang sein')
];

const loginValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Benutzername oder E-Mail erforderlich'),
    body('password')
        .notEmpty()
        .withMessage('Passwort erforderlich')
];

router.post('/api/register', registerLimiter, registerValidation, authController.register);
router.post('/api/login', loginLimiter, loginValidation, authController.login);
router.post('/api/logout', authController.logout);
router.get('/api/session', authController.checkSession);

router.get('/api/user', csrfProtection, authController.getCurrentUser);

router.get('/api/csrf-token', (req, res) => {
    if (req.session && req.session.csrfToken) {
        res.json({ csrfToken: req.session.csrfToken });
    } else {
        res.status(401).json({ error: 'Nicht authentifiziert' });
    }
});

module.exports = router;