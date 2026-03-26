const chatModel = require('../models/chatModel');
const userModel = require('../models/userModel');

class ChatService {
    async createDirectMessage(currentUserId, targetUsername) {
        const targetUser = await userModel.findByUsername(targetUsername);
        if (!targetUser) return { success: false, error: 'Benutzer nicht gefunden' };
        if (currentUserId === targetUser.user_id) return { success: false, error: 'Kein Chat mit sich selbst' };
        
        const existing = await chatModel.findDirectMessageChat(currentUserId, targetUser.user_id);
        if (existing) return { success: true, chatId: existing.chat_id, existing: true };
        
        const result = await chatModel.createChat(null, 'dm', currentUserId, [targetUser.user_id]);
        return { success: true, chatId: result.chatId, existing: false };
    }
    
    async createGroup(currentUserId, groupName, participants = []) {
        if (!groupName || groupName.trim().length < 3) return { success: false, error: 'Gruppenname mindestens 3 Zeichen' };
        const result = await chatModel.createChat(groupName, 'group', currentUserId, participants);
        return { success: true, chatId: result.chatId };
    }
    
    async getUserChats(userId) { return await chatModel.getUserChats(userId); }
    async getChatById(chatId, userId) { return await chatModel.getChatById(chatId, userId); }
    async sendMessage(chatId, userId, message) { return await chatModel.sendMessage(chatId, userId, message); }
    async getMessages(chatId, userId, limit, before) { return await chatModel.getMessages(chatId, userId, limit, before); }
    async markAsRead(chatId, userId) { return await chatModel.updateReadReceipt(chatId, userId); }
    async addToGroup(chatId, userId, usernames) { return await chatModel.addParticipants(chatId, usernames, userId); }
    async leaveGroup(chatId, userId) { return await chatModel.leaveGroup(chatId, userId); }
    async searchUsers(query, currentUserId) { return await userModel.searchUsers(query, currentUserId); }
}

module.exports = new ChatService();