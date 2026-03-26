/**
 * BLYNKS Chat Client
 * Automatisches Polling alle 2 Sekunden mit Push-Benachrichtigungen
 */

class ChatClient {
    constructor() {
        this.currentChatId = null;
        this.chats = [];
        this.messages = [];
        this.pollingInterval = null;
        this.hasMore = true;
        this.lastMessageTime = null;
        this.isLoading = false;
        this.lastMessageId = null;
        this.lastNotifiedMessageId = null; // Für Push-Benachrichtigungen
    }
    
    async init() {
        await this.loadChats();
        this.startPolling();
        this.setupEventListeners();
        console.log('✅ Chat Client initialisiert, Polling aktiv');
    }
    
    async loadChats() {
        try {
            const response = await fetch('/api/chats', { credentials: 'include' });
            const data = await response.json();
            if (data.success) {
                this.chats = data.chats;
                this.renderChatList();
                
                if (this.currentChatId) {
                    const stillExists = this.chats.find(c => c.chat_id === this.currentChatId);
                    if (!stillExists) {
                        this.currentChatId = null;
                        document.getElementById('chatHeader').style.display = 'none';
                        document.getElementById('chatInputArea').style.display = 'none';
                        document.getElementById('chatMessages').innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-comment-dots"></i>
                                <p>Chat nicht mehr verfügbar</p>
                            </div>
                        `;
                    }
                }
            }
        } catch (error) {
            console.error('Fehler beim Laden der Chats:', error);
        }
    }
    
    renderChatList() {
        const container = document.getElementById('chatList');
        if (!container) return;
        
        if (this.chats.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <i class="fas fa-comments"></i>
                    <p>Keine Chats</p>
                    <button onclick="document.getElementById('newChatBtn').click()" style="margin-top: 1rem; background: var(--accent); color: var(--bg); border: none; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer;">Neuen Chat starten</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        this.chats.forEach(chat => {
            const isActive = this.currentChatId === chat.chat_id;
            const lastMsg = chat.last_message || 'Keine Nachrichten';
            const time = chat.last_message_time ? this.formatTime(chat.last_message_time) : '';
            const avatar = chat.type === 'group' ? '👥' : (chat.display_name?.charAt(0) || '?');
            
            const div = document.createElement('div');
            div.className = `chat-item ${isActive ? 'active' : ''}`;
            div.onclick = () => this.selectChat(chat.chat_id);
            div.innerHTML = `
                <div class="chat-avatar">${avatar}</div>
                <div class="chat-info">
                    <div class="chat-name">${this.escapeHtml(chat.display_name || chat.name || 'Unbekannt')}</div>
                    <div class="chat-preview">${this.escapeHtml(lastMsg.substring(0, 40))}${lastMsg.length > 40 ? '...' : ''}</div>
                </div>
                <div class="chat-time">${time}</div>
            `;
            container.appendChild(div);
        });
    }
    
    formatTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const now = new Date();
            const diff = now - date;
            
            if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
                return 'Gestern';
            }
            return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        } catch (e) {
            return '';
        }
    }
    
    formatMessageTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }
    
    async selectChat(chatId) {
        if (this.currentChatId === chatId) return;
        
        this.currentChatId = chatId;
        this.messages = [];
        this.hasMore = true;
        this.lastMessageTime = null;
        this.lastMessageId = null;
        
        this.renderChatList();
        await this.loadMessages();
        this.renderMessages();
        
        const chat = this.chats.find(c => c.chat_id === chatId);
        if (chat) {
            document.getElementById('chatHeader').style.display = 'flex';
            document.getElementById('chatHeaderName').textContent = chat.display_name || chat.name || 'Chat';
            document.getElementById('chatHeaderAvatar').textContent = chat.type === 'group' ? '👥' : (chat.display_name?.charAt(0) || '?');
            document.getElementById('chatHeaderStatus').innerHTML = `<i class="fas fa-lock"></i> Ende-zu-Ende verschlüsselt · ${chat.type === 'dm' ? 'Direktnachricht' : 'Gruppe'}`;
        }
        document.getElementById('chatInputArea').style.display = 'block';
        document.getElementById('messageInput').focus();
    }
    
    async loadMessages() {
        if (!this.currentChatId || this.isLoading) return;
        
        this.isLoading = true;
        try {
            let url = `/api/chats/${this.currentChatId}/messages?limit=50`;
            if (this.lastMessageId) {
                url += `&before=${encodeURIComponent(this.lastMessageTime)}`;
            }
            
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();
            
            if (data.success && data.messages && data.messages.length > 0) {
                const existingIds = new Set(this.messages.map(m => m.id));
                const newMessages = data.messages.filter(m => !existingIds.has(m.id));
                
                if (newMessages.length > 0) {
                    // Benachrichtigungen für neue Nachrichten (nur wenn nicht selbst gesendet und Chat nicht aktiv)
                    newMessages.forEach(msg => {
                        if (!msg.isOwn && window.pwa) {
                            const isChatActive = (this.currentChatId === msg.chatId && !document.hidden);
                            if (!isChatActive) {
                                // Push-Benachrichtigung auslösen
                                window.pwa.notifyNewMessage(
                                    msg.username,
                                    msg.message,
                                    msg.chatId
                                );
                            }
                        }
                    });
                    
                    this.messages = [...this.messages, ...newMessages];
                    this.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    this.lastMessageTime = data.messages[0]?.created_at;
                    this.lastMessageId = data.messages[0]?.id;
                    this.renderMessages();
                    this.renderChatList();
                }
                this.hasMore = data.messages.length === 50;
            }
        } catch (error) {
            console.error('Fehler beim Laden der Nachrichten:', error);
        } finally {
            this.isLoading = false;
        }
    }
    
    renderMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>Keine Nachrichten</p>
                    <p style="font-size: 0.7rem;">🔒 Schreibe die erste Nachricht</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        this.messages.forEach(msg => {
            const isOwn = msg.user_id === window.currentUserId;
            const time = this.formatMessageTime(msg.created_at);
            const div = document.createElement('div');
            div.className = `message ${isOwn ? 'own' : ''}`;
            
            if (msg.message_type === 'system') {
                div.innerHTML = `
                    <div class="message-bubble" style="background: rgba(200,241,53,0.1); text-align: center; width: 100%;">
                        <div class="message-text" style="color: var(--accent);">${this.escapeHtml(msg.message)}</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
                div.style.justifyContent = 'center';
                div.style.maxWidth = '100%';
            } else {
                div.innerHTML = `
                    <div class="message-avatar">${isOwn ? (window.currentUser?.charAt(0) || 'Du') : (msg.username?.charAt(0) || '?')}</div>
                    <div class="message-bubble">
                        ${!isOwn ? `<div class="message-author">${this.escapeHtml(msg.username)}</div>` : ''}
                        <div class="message-text">${this.escapeHtml(msg.message)}</div>
                        <div class="message-time">${time} <span class="encrypted-badge"><i class="fas fa-lock"></i></span></div>
                    </div>
                `;
            }
            container.appendChild(div);
        });
        
        container.scrollTop = container.scrollHeight;
    }
    
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !this.currentChatId) return;
        
        // Offline-Check
        if (!navigator.onLine && window.pwa) {
            window.pwa.saveMessageOffline(this.currentChatId, text);
            input.value = '';
            alert('📡 Du bist offline. Die Nachricht wird gesendet, sobald du wieder online bist.');
            return;
        }
        
        const tempId = 'temp_' + Date.now();
        const tempMessage = {
            id: tempId,
            chatId: this.currentChatId,
            userId: window.currentUserId,
            username: window.currentUser,
            avatar: window.currentUser?.charAt(0) || '?',
            message: text,
            messageType: 'text',
            createdAt: new Date().toISOString(),
            isOwn: true,
            sending: true
        };
        
        this.messages.push(tempMessage);
        this.renderMessages();
        input.value = '';
        
        try {
            const response = await fetch(`/api/chats/${this.currentChatId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: text })
            });
            const data = await response.json();
            
            if (data.success) {
                this.messages = this.messages.filter(m => m.id !== tempId);
                this.messages.push(data.message);
                this.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                this.renderMessages();
                this.renderChatList();
            } else {
                this.messages = this.messages.filter(m => m.id !== tempId);
                this.renderMessages();
                console.error('Fehler beim Senden:', data.error);
                alert('Nachricht konnte nicht gesendet werden');
            }
        } catch (error) {
            console.error('Fehler beim Senden:', error);
            this.messages = this.messages.filter(m => m.id !== tempId);
            this.renderMessages();
            alert('Verbindungsfehler');
        }
    }
    
    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        
        this.pollingInterval = setInterval(async () => {
            if (this.currentChatId) {
                await this.loadMessages();
            }
            await this.loadChats();
        }, 2000);
        
        console.log('🔄 Polling gestartet (alle 2 Sekunden)');
    }
    
    setupEventListeners() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
    }
    
    showNewChatPopup() {
        document.getElementById('newChatPopup').style.display = 'flex';
        document.getElementById('newChatUsername').focus();
    }
    
    hideNewChatPopup() {
        document.getElementById('newChatPopup').style.display = 'none';
        document.getElementById('newChatUsername').value = '';
    }
    
    async createDirectMessage(username) {
        try {
            const response = await fetch('/api/chats/dm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username })
            });
            const data = await response.json();
            if (data.success) {
                await this.loadChats();
                await this.selectChat(data.chatId);
                this.hideNewChatPopup();
            } else {
                alert(data.error || 'Benutzer nicht gefunden');
            }
        } catch (error) {
            console.error('Fehler:', error);
            alert('Verbindungsfehler');
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Globale Chat-Instanz
let chat;

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
    await window.auth.checkSession();
    
    if (!window.auth.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }
    
    window.currentUser = window.auth.currentUser?.username;
    window.currentUserId = window.auth.currentUser?.id;
    
    document.getElementById('userName').textContent = window.currentUser || 'Benutzer';
    document.getElementById('userAvatar').textContent = window.currentUser?.charAt(0) || '?';
    
    // Setze currentChatId für PWA-Benachrichtigungen
    if (window.pwa) {
        window.currentChatId = null;
        window.pwa.setCurrentChatId = (id) => { window.currentChatId = id; };
    }
    
    chat = new ChatClient();
    await chat.init();
});

// Globale Funktionen für HTML
function logout() { 
    window.auth.logout(); 
}

function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('collapsed'); 
}

function showNewChatPopup() { 
    if (chat) chat.showNewChatPopup(); 
}

function createNewChat() { 
    const username = document.getElementById('newChatUsername')?.value.trim();
    if (username && chat) chat.createDirectMessage(username); 
}

// Export für PWA
if (typeof window !== 'undefined') {
    window.chat = chat;
}