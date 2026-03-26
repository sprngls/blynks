const { db2Pool, db3Pool, db4Pool, db5Pool } = require('../config/database');
const cryptoService = require('../services/cryptoService');
const { v4: uuidv4 } = require('uuid');

class ChatModel {
    
    async createChat(name, type, creatorId, participants = []) {
        const conn3 = await db3Pool.getConnection();
        try {
            const chatId = uuidv4();
            const now = new Date();
            await conn3.beginTransaction();
            
            await conn3.execute(
                `INSERT INTO chats (chat_id, name, type, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [chatId, name || null, type, creatorId, now, now]
            );
            
            const allParticipants = [creatorId, ...participants.filter(p => p !== creatorId)];
            for (const userId of allParticipants) {
                await conn3.execute(
                    `INSERT INTO chat_participants (chat_id, user_id, joined_at, last_read)
                     VALUES (?, ?, ?, ?)`,
                    [chatId, userId, now, now]
                );
            }
            
            await conn3.commit();
            return { success: true, chatId };
        } catch (error) {
            await conn3.rollback();
            throw error;
        } finally {
            conn3.release();
        }
    }
    
    async findDirectMessageChat(userId1, userId2) {
        const conn3 = await db3Pool.getConnection();
        try {
            const [chats] = await conn3.execute(
                `SELECT c.chat_id FROM chats c
                 INNER JOIN chat_participants cp1 ON c.chat_id = cp1.chat_id
                 INNER JOIN chat_participants cp2 ON c.chat_id = cp2.chat_id
                 WHERE c.type = 'dm' AND cp1.user_id = ? AND cp2.user_id = ?
                 GROUP BY c.chat_id HAVING COUNT(*) = 2`,
                [userId1, userId2]
            );
            return chats[0] || null;
        } finally {
            conn3.release();
        }
    }
    
    async getUserChats(userId) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        
        try {
            const [chats] = await conn3.execute(
                `SELECT c.chat_id, c.name, c.type, c.updated_at,
                        (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.chat_id) as participant_count
                 FROM chats c
                 INNER JOIN chat_participants cp ON c.chat_id = cp.chat_id
                 WHERE cp.user_id = ?
                 ORDER BY c.updated_at DESC`,
                [userId]
            );
            
            for (const chat of chats) {
                const [lastMsg] = await conn4.execute(
                    `SELECT created_at FROM chat_messages_part_a 
                     WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`,
                    [chat.chat_id]
                );
                chat.last_message_time = lastMsg[0]?.created_at || null;
                chat.last_message = "🔒 Verschlüsselte Nachricht";
                
                if (chat.type === 'dm') {
                    const [other] = await conn3.execute(
                        `SELECT user_id FROM chat_participants 
                         WHERE chat_id = ? AND user_id != ?`,
                        [chat.chat_id, userId]
                    );
                    if (other[0]) {
                        const [userData] = await conn2.execute(
                            'SELECT username, avatar FROM users WHERE user_id = ?',
                            [other[0].user_id]
                        );
                        chat.display_name = userData[0]?.username || 'Unbekannt';
                        chat.avatar = userData[0]?.avatar || '?';
                        chat.other_user_id = other[0].user_id;
                    } else {
                        chat.display_name = 'Unbekannt';
                        chat.avatar = '?';
                    }
                } else {
                    chat.display_name = chat.name || 'Gruppe';
                    chat.avatar = '👥';
                }
            }
            return chats;
        } finally {
            conn2.release();
            conn3.release();
            conn4.release();
        }
    }
    
    async getChatById(chatId, userId) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        
        try {
            const [p] = await conn3.execute(
                'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?',
                [chatId, userId]
            );
            if (p.length === 0) return null;
            
            const [chats] = await conn3.execute('SELECT * FROM chats WHERE chat_id = ?', [chatId]);
            if (chats.length === 0) return null;
            
            const chat = chats[0];
            
            if (chat.type === 'dm') {
                const [other] = await conn3.execute(
                    `SELECT user_id FROM chat_participants 
                     WHERE chat_id = ? AND user_id != ?`,
                    [chatId, userId]
                );
                if (other[0]) {
                    const [userData] = await conn2.execute(
                        'SELECT username, avatar FROM users WHERE user_id = ?',
                        [other[0].user_id]
                    );
                    chat.other_participant = userData[0] || null;
                    chat.display_name = chat.other_participant?.username || 'Unbekannt';
                    chat.avatar = chat.other_participant?.avatar || '?';
                    chat.other_user_id = other[0].user_id;
                } else {
                    chat.display_name = 'Unbekannt';
                    chat.avatar = '?';
                }
            } else {
                const [parts] = await conn3.execute(
                    `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
                    [chatId]
                );
                const participants = [];
                for (const part of parts) {
                    const [userData] = await conn2.execute(
                        'SELECT username, avatar FROM users WHERE user_id = ?',
                        [part.user_id]
                    );
                    if (userData[0]) participants.push(userData[0]);
                }
                chat.participants = participants;
                chat.display_name = chat.name || 'Gruppe';
                chat.avatar = '👥';
            }
            return chat;
        } finally {
            conn2.release();
            conn3.release();
        }
    }
    
    async sendMessage(chatId, userId, message, messageType = 'text') {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        const conn5 = await db5Pool.getConnection();
        
        try {
            const [p] = await conn3.execute(
                'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?',
                [chatId, userId]
            );
            if (p.length === 0) throw new Error('Nicht im Chat');
            
            const [chat] = await conn3.execute('SELECT type, name FROM chats WHERE chat_id = ?', [chatId]);
            const isDM = chat[0]?.type === 'dm';
            const chatName = chat[0]?.name;
            
            const [currentUser] = await conn2.execute(
                'SELECT username, user_secret FROM users WHERE user_id = ?',
                [userId]
            );
            
            let chatKey;
            
            if (isDM) {
                const [other] = await conn3.execute(
                    `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`,
                    [chatId, userId]
                );
                if (other[0]) {
                    const [otherUser] = await conn2.execute(
                        'SELECT user_secret FROM users WHERE user_id = ?',
                        [other[0].user_id]
                    );
                    chatKey = cryptoService.generateDirectMessageChatKey(
                        chatId,
                        currentUser[0].user_secret,
                        otherUser[0].user_secret
                    );
                } else {
                    throw new Error('Anderer Teilnehmer nicht gefunden');
                }
            } else {
                chatKey = cryptoService.generateChatKey(chatId, currentUser[0].user_secret);
            }
            
            const encrypted = cryptoService.encryptMessage(message, chatKey);
            if (!encrypted.success) {
                throw new Error(`Verschlüsselung fehlgeschlagen: ${encrypted.error}`);
            }
            
            const messageId = uuidv4();
            const now = new Date();
            
            // Teil A in DB4 speichern
            await conn4.execute(
                `INSERT INTO chat_messages_part_a 
                 (message_id, chat_id, user_id, iv, auth_tag, integrity_hash, message_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [messageId, chatId, userId, encrypted.iv, encrypted.authTag, 
                 encrypted.integrityHash, messageType, now]
            );
            
            // Teil B in DB5 speichern
            await conn5.execute(
                `INSERT INTO chat_messages_part_b 
                 (message_id, encrypted_message, created_at)
                 VALUES (?, ?, ?)`,
                [messageId, encrypted.encryptedMessage, now]
            );
            
            await conn3.execute(
                'UPDATE chats SET updated_at = ? WHERE chat_id = ?',
                [now, chatId]
            );
            
            const [userInfo] = await conn2.execute(
                'SELECT username, avatar FROM users WHERE user_id = ?',
                [userId]
            );
            
            // Push-Benachrichtigungen senden
            try {
                const [participants] = await conn3.execute(
                    `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`,
                    [chatId, userId]
                );
                
                const shortMessage = message.length > 60 ? message.substring(0, 60) + '...' : message;
                const title = isDM ? userInfo[0]?.username : (chatName || 'Gruppe');
                
                for (const participant of participants) {
                    const { sendPushNotification } = require('../routes/pushRoutes');
                    await sendPushNotification(
                        participant.user_id,
                        title,
                        shortMessage,
                        chatId,
                        userInfo[0]?.username
                    );
                }
            } catch (pushError) {
                console.error('Push-Fehler:', pushError);
            }
            
            return {
                success: true,
                message: {
                    id: messageId,
                    chatId,
                    userId,
                    username: userInfo[0]?.username || 'Unknown',
                    avatar: userInfo[0]?.avatar || '?',
                    message: message,
                    messageType,
                    createdAt: now,
                    isOwn: true
                }
            };
        } catch (error) {
            console.error('Fehler beim Senden:', error);
            throw error;
        } finally {
            conn2.release();
            conn3.release();
            conn4.release();
            conn5.release();
        }
    }
    
    async getMessages(chatId, userId, limit = 50, before = null) {
        const conn2 = await db2Pool.getConnection();
        const conn3 = await db3Pool.getConnection();
        const conn4 = await db4Pool.getConnection();
        const conn5 = await db5Pool.getConnection();
        
        try {
            // Prüfe ob Benutzer im Chat ist
            const [p] = await conn3.execute(
                'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?',
                [chatId, userId]
            );
            if (p.length === 0) return [];
            
            // Hole User-Secret für Entschlüsselung
            const [user] = await conn2.execute(
                'SELECT user_secret FROM users WHERE user_id = ?',
                [userId]
            );
            
            if (!user[0] || !user[0].user_secret) {
                return [];
            }
            
            const [chat] = await conn3.execute('SELECT type FROM chats WHERE chat_id = ?', [chatId]);
            const isDM = chat[0]?.type === 'dm';
            
            let chatKey;
            
            if (isDM) {
                const [other] = await conn3.execute(
                    `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`,
                    [chatId, userId]
                );
                if (other[0]) {
                    const [otherUser] = await conn2.execute(
                        'SELECT user_secret FROM users WHERE user_id = ?',
                        [other[0].user_id]
                    );
                    chatKey = cryptoService.generateDirectMessageChatKey(
                        chatId,
                        user[0].user_secret,
                        otherUser[0].user_secret
                    );
                } else {
                    return [];
                }
            } else {
                chatKey = cryptoService.generateChatKey(chatId, user[0].user_secret);
            }
            
            // === ERSTE ABFRAGE: Nachrichten-Header aus DB4 holen ===
            let queryA = `
                SELECT message_id, user_id, iv, auth_tag, integrity_hash, message_type, created_at
                FROM chat_messages_part_a
                WHERE chat_id = ?
            `;
            const paramsA = [chatId];
            
            if (before) {
                queryA += ` AND created_at < ?`;
                paramsA.push(before);
            }
            queryA += ` ORDER BY created_at DESC LIMIT ?`;
            paramsA.push(limit);
            
            const [messagesA] = await conn4.execute(queryA, paramsA);
            
            if (messagesA.length === 0) return [];
            
            // === ZWEITE ABFRAGE: Verschlüsselte Inhalte aus DB5 holen ===
            const messageIds = messagesA.map(m => `'${m.message_id}'`).join(',');
            const [messagesB] = await conn5.execute(
                `SELECT message_id, encrypted_message FROM chat_messages_part_b 
                 WHERE message_id IN (${messageIds})`,
                []
            );
            
            // Map für schnellen Zugriff
            const contentMap = new Map();
            for (const msg of messagesB) {
                contentMap.set(msg.message_id, msg.encrypted_message);
            }
            
            // Nachrichten zusammenbauen und entschlüsseln
            const decryptedMessages = [];
            for (const msg of messagesA.reverse()) {
                const encryptedContent = contentMap.get(msg.message_id);
                if (!encryptedContent) continue;
                
                const [userInfo] = await conn2.execute(
                    'SELECT username, avatar FROM users WHERE user_id = ?',
                    [msg.user_id]
                );
                
                const decrypted = cryptoService.decryptMessage(
                    encryptedContent,
                    msg.iv,
                    msg.auth_tag,
                    msg.integrity_hash,
                    chatKey
                );
                
                decryptedMessages.push({
                    id: msg.message_id,
                    chatId,
                    userId: msg.user_id,
                    username: userInfo[0]?.username || 'Unknown',
                    avatar: userInfo[0]?.avatar || '?',
                    message: decrypted.success ? decrypted.message : '[Verschlüsselte Nachricht]',
                    messageType: msg.message_type,
                    createdAt: msg.created_at,
                    isOwn: msg.user_id === userId,
                    encrypted: true
                });
            }
            
            return decryptedMessages;
        } finally {
            conn2.release();
            conn3.release();
            conn4.release();
            conn5.release();
        }
    }
    
    async updateReadReceipt(chatId, userId) {
        const conn3 = await db3Pool.getConnection();
        try {
            await conn3.execute(
                'UPDATE chat_participants SET last_read = NOW() WHERE chat_id = ? AND user_id = ?',
                [chatId, userId]
            );
        } finally {
            conn3.release();
        }
    }
}

module.exports = new ChatModel();