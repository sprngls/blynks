const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/api/chats', chatController.getUserChats);
router.get('/api/chats/:chatId', chatController.getChat);
router.post('/api/chats/dm', chatController.createDirectMessage);
router.post('/api/chats/group', chatController.createGroup);

router.get('/api/chats/:chatId/messages', chatController.getMessages);
router.post('/api/chats/:chatId/messages', chatController.sendMessage);

router.post('/api/chats/:chatId/add', chatController.addToGroup);
router.post('/api/chats/:chatId/leave', chatController.leaveGroup);

router.get('/api/users/search', chatController.searchUsers);

module.exports = router;