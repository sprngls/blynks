const { db1Pool, db2Pool } = require('../config/database');
const cryptoService = require('../services/cryptoService');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class UserModel {
    
    async createUser(username, email, password) {
        const conn1 = await db1Pool.getConnection();
        const conn2 = await db2Pool.getConnection();
        
        try {
            console.log(`📝 Registrierung: ${username}`);
            
            await conn1.beginTransaction();
            await conn2.beginTransaction();
            
            // Prüfe ob Benutzername bereits existiert
            const [existing] = await conn2.execute(
                'SELECT user_id, username FROM users WHERE username = ? OR email = ?',
                [username, email || '']
            );
            
            if (existing.length > 0) {
                console.log(`❌ Benutzername ${username} existiert bereits`);
                throw new Error(`Benutzername "${username}" ist bereits vergeben. Bitte wähle einen anderen.`);
            }
            
            const userId = uuidv4();
            const salt = cryptoService.generateSalt();
            const passwordHash = await cryptoService.hashPassword(password, salt);
            const userSecret = crypto.randomBytes(32).toString('hex');
            
            // User in DB2 speichern
            await conn2.execute(
                `INSERT INTO users (user_id, username, email, salt, user_secret, avatar, profile_data) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, username, email || null, salt, userSecret, username.charAt(0).toUpperCase(), '{}']
            );
            
            // Passwort-Hash in DB1 speichern
            await conn1.execute(
                'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash]
            );
            
            await conn1.commit();
            await conn2.commit();
            
            console.log(`✅ Neuer Benutzer erstellt: ${username} (${userId})`);
            return { success: true, userId };
            
        } catch (error) {
            await conn1.rollback();
            await conn2.rollback();
            console.error('❌ Fehler beim Erstellen des Benutzers:', error.message);
            throw error;
        } finally {
            conn1.release();
            conn2.release();
        }
    }
    
    async findByUsername(username) {
        const conn = await db2Pool.getConnection();
        try {
            const [users] = await conn.execute(
                'SELECT user_id, username, email, avatar, status, user_secret FROM users WHERE username = ?',
                [username]
            );
            return users[0] || null;
        } finally { 
            conn.release(); 
        }
    }
    
    async findById(userId) {
        const conn = await db2Pool.getConnection();
        try {
            const [users] = await conn.execute(
                'SELECT user_id, username, email, avatar, status, user_secret, is_admin, is_banned FROM users WHERE user_id = ?',
                [userId]
            );
            return users[0] || null;
        } finally { 
            conn.release(); 
        }
    }
    
    async authenticateUser(username, password) {
        const conn1 = await db1Pool.getConnection();
        const conn2 = await db2Pool.getConnection();
        
        try {
            // Suche nach Benutzername oder E-Mail
            const [users] = await conn2.execute(
                'SELECT user_id, username, salt, user_secret, is_banned FROM users WHERE username = ? OR email = ?',
                [username, username]
            );
            
            if (users.length === 0) {
                return { success: false, error: 'Ungültige Anmeldedaten' };
            }
            
            const user = users[0];
            
            // Prüfe ob Benutzer gesperrt ist
            if (user.is_banned === 1) {
                return { success: false, error: 'Dieser Account wurde gesperrt' };
            }
            
            const [credentials] = await conn1.execute(
                'SELECT password_hash FROM user_credentials WHERE user_id = ?',
                [user.user_id]
            );
            
            if (credentials.length === 0) {
                return { success: false, error: 'Ungültige Anmeldedaten' };
            }
            
            const isValid = await cryptoService.verifyPassword(
                password,
                credentials[0].password_hash,
                user.salt
            );
            
            if (!isValid) {
                return { success: false, error: 'Ungültige Anmeldedaten' };
            }
            
            await conn2.execute(
                'UPDATE users SET status = "online", last_seen = NOW() WHERE user_id = ?',
                [user.user_id]
            );
            
            return {
                success: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    user_secret: user.user_secret
                }
            };
        } finally {
            conn1.release();
            conn2.release();
        }
    }
    
    async updateStatus(userId, status) {
        const conn = await db2Pool.getConnection();
        try {
            await conn.execute(
                'UPDATE users SET status = ?, last_seen = NOW() WHERE user_id = ?',
                [status, userId]
            );
        } finally { 
            conn.release(); 
        }
    }
    
    async searchUsers(query, currentUserId) {
        const conn = await db2Pool.getConnection();
        try {
            const [users] = await conn.execute(
                `SELECT user_id, username, avatar, status 
                 FROM users 
                 WHERE username LIKE ? AND user_id != ?
                 LIMIT 20`,
                [`%${query}%`, currentUserId]
            );
            return users;
        } finally { 
            conn.release(); 
        }
    }
}

module.exports = new UserModel();