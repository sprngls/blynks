const { db1Pool, db2Pool, db3Pool, db4Pool, db5Pool } = require('../config/database');
const cryptoService = require('../services/cryptoService');
const { v4: uuidv4 } = require('uuid');
const { sendPushNotification } = require('../routes/pushRoutes');

class AdminController {
    
    sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
    
    // ============ BENUTZERVERWALTUNG ============
    
    async getUsers(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const [users] = await conn.execute(`
                SELECT u.user_id, u.username, u.email, u.avatar, u.status, 
                       u.created_at, u.is_banned, u.is_admin
                FROM users u
                ORDER BY u.created_at DESC
            `);
            this.sendJSON(res, 200, { success: true, users });
        } catch (error) {
            console.error('Fehler beim Laden der Benutzer:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    async getUser(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const [users] = await conn.execute(
                'SELECT * FROM users WHERE user_id = ?',
                [req.params.userId]
            );
            if (users.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Benutzer nicht gefunden' });
            }
            this.sendJSON(res, 200, { success: true, user: users[0] });
        } catch (error) {
            console.error('Fehler beim Laden des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    async createUser(req, res) {
        const conn1 = await db1Pool.getConnection();
        const conn2 = await db2Pool.getConnection();
        
        try {
            const { username, email, password, is_admin = false } = req.body;
            
            if (!username || username.length < 3) {
                return this.sendJSON(res, 400, { success: false, error: 'Benutzername zu kurz' });
            }
            if (!password || password.length < 8) {
                return this.sendJSON(res, 400, { success: false, error: 'Passwort zu kurz' });
            }
            
            // Prüfe ob Benutzername existiert
            const [existing] = await conn2.execute(
                'SELECT user_id FROM users WHERE username = ? OR email = ?',
                [username, email || '']
            );
            if (existing.length > 0) {
                return this.sendJSON(res, 400, { success: false, error: 'Benutzername oder E-Mail bereits vergeben' });
            }
            
            const userId = uuidv4();
            const salt = cryptoService.generateSalt();
            const passwordHash = await cryptoService.hashPassword(password, salt);
            const userSecret = crypto.randomBytes(32).toString('hex');
            
            await conn2.beginTransaction();
            await conn1.beginTransaction();
            
            await conn2.execute(
                `INSERT INTO users (user_id, username, email, salt, user_secret, avatar, is_admin, profile_data) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, username, email || null, salt, userSecret, username.charAt(0).toUpperCase(), is_admin ? 1 : 0, '{}']
            );
            
            await conn1.execute(
                'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash]
            );
            
            await conn2.commit();
            await conn1.commit();
            
            this.sendJSON(res, 200, { success: true, userId });
        } catch (error) {
            await conn1.rollback();
            await conn2.rollback();
            console.error('Fehler beim Erstellen des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn1.release();
            conn2.release();
        }
    }
    
    async updateUser(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const { userId } = req.params;
            const { username, email, avatar, is_admin, is_banned } = req.body;
            
            const [user] = await conn.execute('SELECT username FROM users WHERE user_id = ?', [userId]);
            if (user[0]?.username === 'Jojo') {
                return this.sendJSON(res, 403, { success: false, error: 'Root-Admin kann nicht bearbeitet werden' });
            }
            
            const updates = [];
            const values = [];
            
            if (username !== undefined) { updates.push('username = ?'); values.push(username); }
            if (email !== undefined) { updates.push('email = ?'); values.push(email); }
            if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
            if (is_admin !== undefined) { updates.push('is_admin = ?'); values.push(is_admin ? 1 : 0); }
            if (is_banned !== undefined) { updates.push('is_banned = ?'); values.push(is_banned ? 1 : 0); }
            
            if (updates.length === 0) {
                return this.sendJSON(res, 400, { success: false, error: 'Keine Änderungen' });
            }
            
            values.push(userId);
            await conn.execute(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, values);
            
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    async deleteUser(req, res) {
        const conn1 = await db1Pool.getConnection();
        const conn2 = await db2Pool.getConnection();
        
        try {
            const { userId } = req.params;
            
            const [user] = await conn2.execute('SELECT username FROM users WHERE user_id = ?', [userId]);
            if (user[0]?.username === 'Jojo') {
                return this.sendJSON(res, 403, { success: false, error: 'Root-Admin kann nicht gelöscht werden' });
            }
            
            await conn1.beginTransaction();
            await conn2.beginTransaction();
            
            await conn1.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
            await conn2.execute('DELETE FROM users WHERE user_id = ?', [userId]);
            
            await conn1.commit();
            await conn2.commit();
            
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            await conn1.rollback();
            await conn2.rollback();
            console.error('Fehler beim Löschen des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn1.release();
            conn2.release();
        }
    }
    
    async banUser(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const { userId } = req.params;
            
            const [user] = await conn.execute('SELECT username FROM users WHERE user_id = ?', [userId]);
            if (user[0]?.username === 'Jojo') {
                return this.sendJSON(res, 403, { success: false, error: 'Root-Admin kann nicht gesperrt werden' });
            }
            
            await conn.execute('UPDATE users SET is_banned = 1, banned_at = NOW() WHERE user_id = ?', [userId]);
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            console.error('Fehler beim Sperren des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    async unbanUser(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const { userId } = req.params;
            await conn.execute('UPDATE users SET is_banned = 0, banned_at = NULL WHERE user_id = ?', [userId]);
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            console.error('Fehler beim Entsperren des Benutzers:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    // ============ SUPPORT-CHAT ============
    
    async getSupportChats(req, res) {
        const conn2 = await db2Pool.getConnection();  // DB2 für users
        const conn3 = await db3Pool.getConnection();  // DB3 für support_chats
        
        try {
            const [chats] = await conn3.execute(`
                SELECT sc.id, sc.user_id, sc.status, sc.created_at, sc.updated_at
                FROM support_chats sc
                ORDER BY sc.updated_at DESC
            `);
            
            // Hole Benutzernamen aus DB2 für jeden Chat
            for (const chat of chats) {
                const [user] = await conn2.execute(
                    'SELECT username, avatar FROM users WHERE user_id = ?',
                    [chat.user_id]
                );
                chat.username = user[0]?.username || 'Unbekannt';
                chat.avatar = user[0]?.avatar || '?';
                
                // Letzte Nachricht aus DB4 holen
                const supportChatId = `support_${chat.id}`;
                const [lastMsg] = await db4Pool.execute(
                    `SELECT encrypted_message, created_at FROM chat_messages_part_a a
                     INNER JOIN chat_messages_part_b b ON a.message_id = b.message_id
                     WHERE a.chat_id = ? ORDER BY a.created_at DESC LIMIT 1`,
                    [supportChatId]
                );
                chat.last_message = lastMsg[0]?.encrypted_message?.substring(0, 50) || 'Keine Nachrichten';
                chat.last_message_time = lastMsg[0]?.created_at || null;
            }
            
            this.sendJSON(res, 200, { success: true, chats });
        } catch (error) {
            console.error('Fehler beim Laden der Support-Chats:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn2.release();
            conn3.release();
        }
    }
    
    async getSupportMessages(req, res) {
        const conn2 = await db2Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        const conn5 = await db5Pool.getConnection();
        
        try {
            const { chatId } = req.params;
            const supportChatId = `support_${chatId}`;
            
            const [messages] = await conn4.execute(`
                SELECT a.message_id, a.user_id, a.message_type, a.created_at,
                       b.encrypted_message
                FROM chat_messages_part_a a
                INNER JOIN chat_messages_part_b b ON a.message_id = b.message_id
                WHERE a.chat_id = ?
                ORDER BY a.created_at ASC
            `, [supportChatId]);
            
            const formattedMessages = [];
            for (const msg of messages) {
                // Hole Benutzername aus DB2
                const [user] = await conn2.execute(
                    'SELECT username, avatar, is_admin FROM users WHERE user_id = ?',
                    [msg.user_id]
                );
                
                formattedMessages.push({
                    id: msg.message_id,
                    userId: msg.user_id,
                    username: user[0]?.username || 'Unbekannt',
                    avatar: user[0]?.avatar || '?',
                    message: msg.encrypted_message,
                    messageType: msg.message_type,
                    createdAt: msg.created_at,
                    isAdmin: user[0]?.is_admin === 1 || msg.message_type === 'admin'
                });
            }
            
            this.sendJSON(res, 200, { success: true, messages: formattedMessages });
        } catch (error) {
            console.error('Fehler beim Laden der Support-Nachrichten:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn2.release();
            conn4.release();
            conn5.release();
        }
    }
    
    async sendSupportMessage(req, res) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        const conn5 = await db5Pool.getConnection();
        
        try {
            const { chatId } = req.params;
            const { message } = req.body;
            const adminId = req.session.userId;
            const supportChatId = `support_${chatId}`;
            const now = new Date();
            const messageId = uuidv4();
            
            // Prüfe ob Support-Chat existiert
            const [chat] = await conn3.execute(
                'SELECT * FROM support_chats WHERE id = ?',
                [chatId]
            );
            if (chat.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Support-Chat nicht gefunden' });
            }
            
            // Admin-Nachricht speichern
            await conn4.execute(
                `INSERT INTO chat_messages_part_a 
                 (message_id, chat_id, user_id, iv, auth_tag, integrity_hash, message_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [messageId, supportChatId, adminId, 'admin', 'admin', 'admin', 'admin', now]
            );
            
            await conn5.execute(
                `INSERT INTO chat_messages_part_b 
                 (message_id, encrypted_message, created_at)
                 VALUES (?, ?, ?)`,
                [messageId, message, now]
            );
            
            // Support-Chat aktualisieren
            await conn3.execute(
                'UPDATE support_chats SET updated_at = ?, status = "open" WHERE id = ?',
                [now, chatId]
            );
            
            // Push-Benachrichtigung an Benutzer senden
            await sendPushNotification(
                chat[0].user_id,
                '💬 BLYNKS Support',
                message.length > 80 ? message.substring(0, 80) + '...' : message,
                null,
                'BLYNKS Support'
            );
            
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            console.error('Fehler beim Senden der Support-Nachricht:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn2.release();
            conn3.release();
            conn4.release();
            conn5.release();
        }
    }
    
    async createSupportChat(req, res) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        
        try {
            const { userId, message } = req.body;
            const supportChatId = uuidv4();
            const now = new Date();
            
            // Prüfe ob bereits ein offener Support-Chat existiert
            const [existing] = await conn3.execute(
                'SELECT * FROM support_chats WHERE user_id = ? AND status != "closed"',
                [userId]
            );
            if (existing.length > 0) {
                return this.sendJSON(res, 200, { success: true, chatId: existing[0].id, existing: true });
            }
            
            await conn3.beginTransaction();
            
            // Support-Chat erstellen
            await conn3.execute(
                `INSERT INTO support_chats (id, user_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?)`,
                [supportChatId, userId, now, now]
            );
            
            // Erste Nachricht speichern
            const messageId = uuidv4();
            const supportChatIdFormatted = `support_${supportChatId}`;
            
            const conn4 = await db4Pool.getConnection();
            const conn5 = await db5Pool.getConnection();
            
            await conn4.execute(
                `INSERT INTO chat_messages_part_a 
                 (message_id, chat_id, user_id, iv, auth_tag, integrity_hash, message_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [messageId, supportChatIdFormatted, userId, 'user', 'user', 'user', 'user', now]
            );
            
            await conn5.execute(
                `INSERT INTO chat_messages_part_b 
                 (message_id, encrypted_message, created_at)
                 VALUES (?, ?, ?)`,
                [messageId, message, now]
            );
            
            conn4.release();
            conn5.release();
            
            await conn3.commit();
            
            this.sendJSON(res, 200, { success: true, chatId: supportChatId });
        } catch (error) {
            await conn3.rollback();
            console.error('Fehler beim Erstellen des Support-Chats:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn2.release();
            conn3.release();
        }
    }
    
    async closeSupportChat(req, res) {
        const conn = await db3Pool.getConnection();
        try {
            const { chatId } = req.params;
            await conn.execute(
                'UPDATE support_chats SET status = "closed", updated_at = NOW() WHERE id = ?',
                [chatId]
            );
            this.sendJSON(res, 200, { success: true });
        } catch (error) {
            console.error('Fehler beim Schließen des Support-Chats:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    // ============ PUSH-NACHRICHTEN ============
    
    async sendPushNotification(req, res) {
        const conn = await db2Pool.getConnection();
        try {
            const { userId, title, message, sender } = req.body;
            
            if (!userId || !title || !message) {
                return this.sendJSON(res, 400, { success: false, error: 'Fehlende Parameter' });
            }
            
            const [user] = await conn.execute('SELECT username FROM users WHERE user_id = ?', [userId]);
            if (user.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Benutzer nicht gefunden' });
            }
            
            const finalTitle = `💬 BLYNKS Support: ${title}`;
            const finalMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
            
            const result = await sendPushNotification(userId, finalTitle, finalMessage, null, 'BLYNKS Support');
            
            this.sendJSON(res, 200, { success: result, message: result ? 'Push gesendet' : 'Keine aktive Push-Subscription' });
        } catch (error) {
            console.error('Fehler beim Senden der Push-Nachricht:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn.release();
        }
    }
    
    // ============ STATISTIKEN ============
    
    async getStats(req, res) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        
        try {
            const [totalUsers] = await conn2.execute('SELECT COUNT(*) as count FROM users');
            const [onlineUsers] = await conn2.execute('SELECT COUNT(*) as count FROM users WHERE status = "online"');
            const [totalChats] = await conn3.execute('SELECT COUNT(*) as count FROM chats');
            const [totalMessages] = await conn4.execute('SELECT COUNT(*) as count FROM chat_messages_part_a');
            const [openSupport] = await conn3.execute('SELECT COUNT(*) as count FROM support_chats WHERE status != "closed"');
            
            this.sendJSON(res, 200, {
                success: true,
                stats: {
                    totalUsers: totalUsers[0].count,
                    onlineUsers: onlineUsers[0].count,
                    totalChats: totalChats[0].count,
                    totalMessages: totalMessages[0].count,
                    openSupport: openSupport[0].count
                }
            });
        } catch (error) {
            console.error('Fehler beim Laden der Statistiken:', error);
            this.sendJSON(res, 500, { success: false, error: 'Serverfehler' });
        } finally {
            conn2.release();
            conn3.release();
            conn4.release();
        }
    }
}

module.exports = new AdminController();