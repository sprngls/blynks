const chatService = require('../services/chatService');
const userModel = require('../models/userModel');

class ChatController {
    
    
    async getUserChats(req, res) {
        try {
            const chats = await chatService.getUserChats(req.session.userId);
            res.json({ success: true, chats });
        } catch (error) {
            console.error('Fehler beim Laden der Chats:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    async getChat(req, res) {
        try {
            const chat = await chatService.getChatById(req.params.chatId, req.session.userId);
            if (!chat) {
                return res.status(404).json({ success: false, error: 'Chat nicht gefunden' });
            }
            res.json({ success: true, chat });
        } catch (error) {
            console.error('Fehler beim Laden des Chats:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    async createDirectMessage(req, res) {
        try {
            const { username } = req.body;
            const result = await chatService.createDirectMessage(req.session.userId, username);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
        } catch (error) {
            console.error('Fehler beim Erstellen des DM-Chats:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    async createGroup(req, res) {
        try {
            const { groupName, participants } = req.body;
            const result = await chatService.createGroup(req.session.userId, groupName, participants || []);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
        } catch (error) {
            console.error('Fehler beim Erstellen der Gruppe:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    
    async getMessages(req, res) {
        try {
            const { chatId } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            const before = req.query.before;
            
            const messages = await chatService.getMessages(chatId, req.session.userId, limit, before);
            
            await chatService.markAsRead(chatId, req.session.userId);
            
            res.json({ success: true, messages });
        } catch (error) {
            console.error('Fehler beim Laden der Nachrichten:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    async sendMessage(req, res) {
        try {
            const { chatId } = req.params;
            const { message } = req.body;
            
            const result = await chatService.sendMessage(chatId, req.session.userId, message);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json(result);
        } catch (error) {
            console.error('Fehler beim Senden der Nachricht:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    
    async addToGroup(req, res) {
        try {
            const { chatId } = req.params;
            const { usernames } = req.body;
            
            const result = await chatService.addToGroup(chatId, req.session.userId, usernames);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error('Fehler beim Hinzufügen zur Gruppe:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    async leaveGroup(req, res) {
        try {
            const { chatId } = req.params;
            const result = await chatService.leaveGroup(chatId, req.session.userId);
            
            if (!result.success) {
                return res.status(400).json(result);
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error('Fehler beim Verlassen der Gruppe:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
    
    
    async searchUsers(req, res) {
        try {
            const { query } = req.query;
            if (!query || query.length < 2) {
                return res.json({ success: true, users: [] });
            }
            
            const users = await chatService.searchUsers(query, req.session.userId);
            res.json({ success: true, users });
        } catch (error) {
            console.error('Fehler bei der Benutzersuche:', error);
            res.status(500).json({ success: false, error: 'Serverfehler' });
        }
    }
}

module.exports = new ChatController();