/**
 * BLYNKS PWA Manager
 * Push-Benachrichtigungen, Offline-Fähigkeit und Session-Persistenz
 */

class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.isOnline = navigator.onLine;
        this.pushSubscription = null;
        this.registration = null;
        this.receivedPushForMessage = false;
        
        // DEIN VAPID Public Key
        this.vapidPublicKey = 'BOrJRDiPG4ENj7PyjtkV0Wy0cxt4Bsw5EYo-lbBpyP-tXTDpUQqw5-fvbSFcMSMZUJASEXsbUeT0HlbkHP3LwIk';
    }
    
    async init() {
        console.log('[PWA] Initialisiere...');
        await this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupOnlineOfflineListeners();
        this.setupSessionPersistence();
        this.checkInstallStatus();
        await this.setupPushNotifications();
        console.log('[PWA] Initialisierung abgeschlossen');
    }
    
    // ============ SERVICE WORKER ============
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                });
                console.log('[PWA] Service Worker registriert');
                
                // Background Sync für Offline-Nachrichten
                if ('sync' in this.registration) {
                    this.registration.sync.register('sync-messages');
                    console.log('[PWA] Background Sync registriert');
                }
            } catch (error) {
                console.error('[PWA] Service Worker Fehler:', error);
            }
        } else {
            console.log('[PWA] Service Worker nicht unterstützt');
        }
    }
    
    // ============ PUSH-BENACHRICHTIGUNGEN ============
    
    async setupPushNotifications() {
        if (!('Notification' in window)) {
            console.log('[PWA] Browser unterstützt keine Benachrichtigungen');
            return;
        }
        
        // Prüfe Berechtigung
        if (Notification.permission === 'granted') {
            console.log('[PWA] Benachrichtigungen bereits erlaubt');
            await this.subscribeToPush();
        } else if (Notification.permission !== 'denied') {
            console.log('[PWA] Warte auf Benutzerinteraktion für Benachrichtigungen');
            this.showNotificationPrompt();
        } else {
            console.log('[PWA] Benachrichtigungen wurden abgelehnt');
        }
    }
    
    showNotificationPrompt() {
        // Zeige einen visuellen Prompt an
        const promptDiv = document.createElement('div');
        promptDiv.id = 'notificationPrompt';
        promptDiv.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 20px;
            right: 20px;
            background: var(--surface, #111);
            border: 1px solid var(--accent, #c8f135);
            border-radius: 16px;
            padding: 16px;
            z-index: 1001;
            max-width: 320px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            backdrop-filter: blur(10px);
        `;
        promptDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <i class="fas fa-bell" style="color: var(--accent, #c8f135); font-size: 1.5rem;"></i>
                <strong style="color: var(--accent, #c8f135);">Benachrichtigungen</strong>
            </div>
            <p style="font-size: 0.8rem; margin-bottom: 12px; color: var(--text, #fff);">
                Erhalte Benachrichtigungen bei neuen Nachrichten
            </p>
            <div style="display: flex; gap: 8px;">
                <button id="enableNotificationsBtn" style="background: var(--accent, #c8f135); color: #000; border: none; padding: 8px 16px; border-radius: 30px; font-size: 0.7rem; cursor: pointer; font-weight: bold;">Aktivieren</button>
                <button id="laterNotificationsBtn" style="background: transparent; border: 1px solid var(--border, #1e1e1e); color: var(--text, #fff); padding: 8px 16px; border-radius: 30px; font-size: 0.7rem; cursor: pointer;">Später</button>
            </div>
        `;
        document.body.appendChild(promptDiv);
        
        document.getElementById('enableNotificationsBtn')?.addEventListener('click', async () => {
            promptDiv.remove();
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('[PWA] Benachrichtigungen erlaubt');
                await this.subscribeToPush();
                this.showNotification('BLYNKS', 'Benachrichtigungen aktiviert! Du wirst über neue Nachrichten informiert.');
            } else {
                console.log('[PWA] Benachrichtigungen verweigert');
            }
        });
        
        document.getElementById('laterNotificationsBtn')?.addEventListener('click', () => {
            promptDiv.remove();
            console.log('[PWA] Benachrichtigungen später aktivieren');
        });
    }
    
    async subscribeToPush() {
        if (!this.registration) {
            console.log('[PWA] Kein Service Worker registriert');
            return;
        }
        
        try {
            // Prüfe ob bereits eine Subscription existiert
            let subscription = await this.registration.pushManager.getSubscription();
            
            if (!subscription) {
                subscription = await this.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
                });
                console.log('[PWA] Neue Push-Subscription erstellt');
            } else {
                console.log('[PWA] Bestehende Push-Subscription gefunden');
            }
            
            this.pushSubscription = subscription;
            
            // Subscription an Server senden
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(subscription)
            });
            
            if (response.ok) {
                console.log('[PWA] Push-Subscription auf Server gespeichert');
            } else {
                console.error('[PWA] Fehler beim Speichern der Subscription');
            }
        } catch (error) {
            console.error('[PWA] Push-Subscription fehlgeschlagen:', error);
        }
    }
    
    async unsubscribeFromPush() {
        if (!this.pushSubscription) return;
        
        try {
            await this.pushSubscription.unsubscribe();
            await fetch('/api/push/unsubscribe', {
                method: 'POST',
                credentials: 'include'
            });
            this.pushSubscription = null;
            console.log('[PWA] Push-Subscription entfernt');
        } catch (error) {
            console.error('[PWA] Fehler beim Entfernen der Subscription:', error);
        }
    }
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    // Neue Nachricht - Benachrichtigung auslösen (Fallback)
    notifyNewMessage(sender, message, chatId) {
        if (Notification.permission !== 'granted') return;
        
        const isChatActive = (window.currentChatId === chatId && !document.hidden);
        if (isChatActive) return;
        
        const shortMessage = message.length > 60 ? message.substring(0, 60) + '...' : message;
        
        this.showNotification(
            `${sender}`,
            shortMessage,
            chatId
        );
    }
    
    showNotification(title, body, chatId = null) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        
        const options = {
            body: body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [200, 100, 200],
            data: { url: '/dashboard.html', chatId: chatId },
            requireInteraction: false,
            silent: false
        };
        
        const notification = new Notification(title, options);
        
        notification.onclick = (event) => {
            event.preventDefault();
            notification.close();
            if (chatId && window.chat) {
                window.chat.selectChat(chatId);
            }
            window.focus();
        };
        
        return notification;
    }
    
    // ============ INSTALLATION ============
    
    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
            console.log('[PWA] Installations-Prompt verfügbar');
        });
        
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App wurde installiert');
            this.isInstalled = true;
            this.deferredPrompt = null;
            this.hideInstallButton();
        });
    }
    
    showInstallButton() {
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'flex';
            installBtn.onclick = () => this.promptInstall();
        }
    }
    
    hideInstallButton() {
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) installBtn.style.display = 'none';
    }
    
    async promptInstall() {
        if (!this.deferredPrompt) return;
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`[PWA] Installations-Ergebnis: ${outcome}`);
        this.deferredPrompt = null;
        this.hideInstallButton();
    }
    
    // ============ ONLINE/OFFLINE STATUS ============
    
    setupOnlineOfflineListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateOnlineStatus(true);
            this.syncPendingMessages();
            console.log('[PWA] Wieder online');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateOnlineStatus(false);
            console.log('[PWA] Offline-Modus aktiv');
        });
    }
    
    updateOnlineStatus(isOnline) {
        const status = document.getElementById('connectionStatus');
        if (status) {
            if (isOnline) {
                status.innerHTML = '<i class="fas fa-wifi"></i> Online';
                status.style.color = '#4caf50';
                status.style.display = 'flex';
                status.style.opacity = '1';
                setTimeout(() => {
                    status.style.opacity = '0';
                    setTimeout(() => {
                        if (status.style.opacity === '0') status.style.display = 'none';
                    }, 500);
                }, 3000);
            } else {
                status.style.display = 'flex';
                status.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
                status.style.color = '#ff9800';
                status.style.opacity = '1';
            }
        }
    }
    
    // ============ SESSION PERSISTENZ ============
    
    setupSessionPersistence() {
        let activityTimer;
        const extendSession = () => {
            if (window.auth && window.auth.isAuthenticated()) {
                fetch('/api/session', { method: 'HEAD', credentials: 'include' })
                    .catch(e => console.log('Session-Erweiterung fehlgeschlagen'));
            }
        };
        
        const events = ['click', 'keypress', 'touchstart', 'scroll', 'mousemove'];
        events.forEach(event => {
            document.addEventListener(event, () => {
                clearTimeout(activityTimer);
                activityTimer = setTimeout(extendSession, 10000);
            });
        });
        
        setInterval(() => {
            if (window.auth && window.auth.isAuthenticated()) {
                window.auth.checkSession();
            }
        }, 5 * 60 * 1000);
        
        window.addEventListener('beforeunload', () => {});
    }
    
    // ============ OFFLINE NACHRICHTEN ============
    
    async syncPendingMessages() {
        if (!this.isOnline) return;
        
        const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
        if (pendingMessages.length === 0) return;
        
        console.log(`[PWA] Synchronisiere ${pendingMessages.length} Nachrichten`);
        
        for (const msg of pendingMessages) {
            try {
                const response = await fetch(`/api/chats/${msg.chatId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ message: msg.text })
                });
                
                if (response.ok) {
                    const index = pendingMessages.indexOf(msg);
                    pendingMessages.splice(index, 1);
                    localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
                    console.log(`[PWA] Nachricht synchronisiert`);
                }
            } catch (error) {
                console.error('[PWA] Sync fehlgeschlagen:', error);
            }
        }
    }
    
    saveMessageOffline(chatId, text) {
        const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
        pendingMessages.push({
            chatId,
            text,
            timestamp: Date.now()
        });
        localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
        
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                registration.sync.register('sync-messages');
                console.log('[PWA] Background Sync registriert');
            });
        }
        
        console.log(`[PWA] Nachricht offline gespeichert (${pendingMessages.length} ausstehend)`);
    }
    
    // ============ APP DATEN ============
    
    saveAppData(key, value) {
        localStorage.setItem(`blynks_${key}`, JSON.stringify(value));
    }
    
    loadAppData(key) {
        const data = localStorage.getItem(`blynks_${key}`);
        return data ? JSON.parse(data) : null;
    }
    
    clearAppData() {
        const keysToKeep = ['pendingMessages'];
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
            if (!keysToKeep.includes(key) && key.startsWith('blynks_')) {
                localStorage.removeItem(key);
            }
        });
        console.log('[PWA] App-Daten gelöscht');
    }
    
    // ============ INSTALLATIONSSTATUS ============
    
    checkInstallStatus() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] Läuft als installierte App');
        } else {
            console.log('[PWA] Läuft im Browser');
        }
        
        window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
            this.isInstalled = e.matches;
            console.log(`[PWA] Display-Mode geändert: ${e.matches ? 'Standalone' : 'Browser'}`);
        });
    }
}

// Globale Instanz
window.pwa = new PWAManager();

// Automatische Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    window.pwa.init();
});

// Nachrichten-Benachrichtigung vom Service Worker empfangen
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'OPEN_CHAT' && window.chat) {
            console.log('[PWA] Chat öffnen von Service Worker:', event.data.chatId);
            window.chat.selectChat(event.data.chatId);
        }
    });
    
    navigator.serviceWorker.ready.then(registration => {
        console.log('[PWA] Service Worker bereit');
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PWAManager };
}