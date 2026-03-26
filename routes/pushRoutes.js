const webPush = require('web-push');

// DEINE VAPID Keys
const vapidKeys = {
    publicKey: 'BOrJRDiPG4ENj7PyjtkV0Wy0cxt4Bsw5EYo-lbBpyP-tXTDpUQqw5-fvbSFcMSMZUJASEXsbUeT0HlbkHP3LwIk',
    privateKey: 'bGUYspN0crOGBSGbaCUWekXYq1xCb1ldetOmILtKwdc'
};

webPush.setVapidDetails(
    'mailto:info@blynks.de',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Speicher für Push-Subscriptions (in Produktion in DB speichern)
const subscriptions = new Map();

// Push-Subscription speichern
async function saveSubscription(userId, subscription) {
    subscriptions.set(userId, subscription);
    console.log(`✅ Push-Subscription für User ${userId} gespeichert`);
}

// Push-Subscription entfernen
async function removeSubscription(userId) {
    subscriptions.delete(userId);
    console.log(`🗑️ Push-Subscription für User ${userId} entfernt`);
}

// Push-Benachrichtigung senden
async function sendPushNotification(userId, title, body, chatId = null, sender = null) {
    const subscription = subscriptions.get(userId);
    if (!subscription) {
        console.log(`⚠️ Keine Push-Subscription für User ${userId}`);
        return false;
    }
    
    const payload = JSON.stringify({
        title: title,
        body: body,
        icon: '/logo.png',
        badge: '/logo.png',
        url: '/dashboard.html',
        chatId: chatId,
        sender: sender,
        timestamp: Date.now()
    });
    
    try {
        await webPush.sendNotification(subscription, payload);
        console.log(`✅ Push gesendet an User ${userId}: ${title}`);
        return true;
    } catch (error) {
        console.error(`❌ Push fehlgeschlagen für User ${userId}:`, error.statusCode);
        
        if (error.statusCode === 410 || error.statusCode === 404) {
            subscriptions.delete(userId);
            console.log(`🗑️ Ungültige Subscription für User ${userId} entfernt`);
        }
        return false;
    }
}

// Alle Teilnehmer eines Chats benachrichtigen
async function notifyChatParticipants(chatId, message, senderId, senderName, chatName = null, db2Pool, db3Pool) {
    const conn2 = await db2Pool.getConnection();
    const conn3 = await db3Pool.getConnection();
    
    try {
        const [participants] = await conn3.execute(
            `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`,
            [chatId, senderId]
        );
        
        const shortMessage = message.length > 60 ? message.substring(0, 60) + '...' : message;
        const title = chatName ? `${chatName}` : `${senderName}`;
        
        for (const participant of participants) {
            await sendPushNotification(
                participant.user_id,
                title,
                shortMessage,
                chatId,
                senderName
            );
        }
        
        return true;
    } catch (error) {
        console.error('Fehler beim Senden von Chat-Benachrichtigungen:', error);
        return false;
    } finally {
        conn2.release();
        conn3.release();
    }
}

module.exports = {
    saveSubscription,
    removeSubscription,
    sendPushNotification,
    notifyChatParticipants,
    subscriptions
};