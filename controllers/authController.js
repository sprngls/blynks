const authService = require('../services/authService');
const { validationResult } = require('express-validator');

class AuthController {
    async register(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { username, email, password } = req.body;
        const result = await authService.register(username, email, password, req.ip);
        
        if (result.success) {
            res.status(201).json({ success: true, message: 'Registrierung erfolgreich' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    }
    
    async login(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { username, password } = req.body;
        const result = await authService.login(username, password, req);
        
        if (result.success) {
            res.json({
                success: true,
                user: result.user,
                csrfToken: result.csrfToken
            });
        } else {
            res.status(401).json({ success: false, error: result.error });
        }
    }
    
    async logout(req, res) {
        await authService.logout(req);
        res.json({ success: true });
    }
    
    async getCurrentUser(req, res) {
        const user = await authService.getCurrentUser(req);
        
        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
        }
    }

    
    async checkSession(req, res) {
        const isAuthenticated = authService.isAuthenticated(req);
        
        if (isAuthenticated) {
            const user = await authService.getCurrentUser(req);
            res.json({
                authenticated: true,
                user,
                csrfToken: req.session.csrfToken
            });
        } else {
            res.json({ authenticated: false });
        }
    }
}

module.exports = new AuthController();