const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Alle Admin-Routen erfordern Authentifizierung und Admin-Rechte
router.use(requireAuth);
router.use(requireAdmin);

// Benutzerverwaltung
router.get('/api/admin/users', adminController.getUsers);
router.get('/api/admin/users/:userId', adminController.getUser);
router.post('/api/admin/users', adminController.createUser);
router.put('/api/admin/users/:userId', adminController.updateUser);
router.delete('/api/admin/users/:userId', adminController.deleteUser);
router.post('/api/admin/users/:userId/ban', adminController.banUser);
router.post('/api/admin/users/:userId/unban', adminController.unbanUser);

// Support-Chat
router.get('/api/admin/support/chats', adminController.getSupportChats);
router.get('/api/admin/support/chats/:chatId/messages', adminController.getSupportMessages);
router.post('/api/admin/support/chats/:chatId/messages', adminController.sendSupportMessage);
router.post('/api/admin/support/chats', adminController.createSupportChat);

// Push-Nachrichten
router.post('/api/admin/push/send', adminController.sendPushNotification);

// Statistiken
router.get('/api/admin/stats', adminController.getStats);

module.exports = router;