const userModel = require('../models/userModel');
const cryptoService = require('./cryptoService');
const { db2Pool } = require('../config/database');

class AuthService {
    constructor() {
        this.sessionHandler = null;
    }
    
    setSessionHandler(handler) {
        this.sessionHandler = handler;
    }
    
    async register(username, email, password) {
        // Validierungen
        if (!username || username.length < 3 || username.length > 50) {
            return { success: false, error: 'Benutzername muss 3-50 Zeichen lang sein' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { success: false, error: 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten' };
        }
        if (password.length < 8) {
            return { success: false, error: 'Passwort muss mindestens 8 Zeichen lang sein' };
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { success: false, error: 'Ungültige E-Mail-Adresse' };
        }
        
        try {
            const result = await userModel.createUser(username, email, password);
            return result;
        } catch (error) {
            console.error('Registrierungsfehler:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    async login(username, password, req) {
        console.log(`🔐 Login-Versuch für: ${username}`);
        
        const result = await userModel.authenticateUser(username, password);
        
        if (result.success && this.sessionHandler && req.session) {
            req.session.userId = result.user.id;
            req.session.username = result.user.username;
            req.session.userSecret = result.user.user_secret;
            req.session.csrfToken = cryptoService.generateSessionToken();
            req.session.createdAt = Date.now();
            
            // Hole Admin-Status
            const conn = await db2Pool.getConnection();
            try {
                const [users] = await conn.execute('SELECT is_admin FROM users WHERE user_id = ?', [result.user.id]);
                req.session.isAdmin = users[0]?.is_admin === 1;
            } finally {
                conn.release();
            }
            
            this.sessionHandler.save(req, req.session);
            
            console.log(`✅ Login erfolgreich: ${result.user.username} | Admin: ${req.session.isAdmin}`);
            
            return {
                success: true,
                user: { id: result.user.id, username: result.user.username },
                csrfToken: req.session.csrfToken
            };
        }
        
        return result;
    }
    
    async logout(req) {
        if (req.session?.userId) {
            await userModel.updateStatus(req.session.userId, 'offline');
        }
        
        if (this.sessionHandler) {
            this.sessionHandler.destroy(req);
        }
        
        return { success: true };
    }
    
    async getCurrentUser(req) {
        if (!req.session?.userId) return null;
        return await userModel.findById(req.session.userId);
    }
    
    isAuthenticated(req) {
        return !!(req.session && req.session.userId);
    }
    
    async isAdmin(req) {
        if (!this.isAuthenticated(req)) return false;
        return req.session.isAdmin === true;
    }
}

module.exports = new AuthService();