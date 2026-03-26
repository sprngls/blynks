
let currentUser = null;
let currentSupportChatId = null;
let selectedPushUserId = null;



document.addEventListener('DOMContentLoaded', async () => {
    await window.auth.checkSession();
    if (!window.auth.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }
    
    currentUser = window.auth.currentUser;
    document.getElementById('userName').textContent = currentUser?.username || 'Admin';
    document.getElementById('userAvatar').textContent = currentUser?.username?.charAt(0) || 'A';
    

    const userData = await window.auth.getCurrentUser();
    if (!userData?.is_admin) {
        alert('Keine Admin-Rechte!');
        window.location.href = '/dashboard.html';
        return;
    }
    
    await loadStats();
    await loadUsers();
    await loadSupportChats();
    

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
            if (btn.dataset.tab === 'support') loadSupportChats();
            if (btn.dataset.tab === 'push') loadPushUsers();
        });
    });
});



async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats', { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            document.getElementById('statUsers').textContent = data.stats.totalUsers;
            document.getElementById('statOnline').textContent = data.stats.onlineUsers;
            document.getElementById('statChats').textContent = data.stats.totalChats;
            document.getElementById('statMessages').textContent = data.stats.totalMessages;
            document.getElementById('statSupport').textContent = data.stats.activeSupport;
        }
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
    }
}



async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            renderUserTable(data.users);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Benutzer:', error);
    }
}

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    users.forEach(user => {
        const isRootAdmin = user.username === 'Jojo';
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(user.username)}</strong><br><small style="color:#888">${user.user_id.substring(0, 8)}...</small></td>
            <td>${user.email || '-'}</td>
            <td>
                <span class="badge ${user.status === 'online' ? 'online' : 'offline'}">${user.status || 'offline'}</span>
                ${user.is_admin ? '<span class="badge admin">Admin</span>' : ''}
                ${user.is_banned ? '<span class="badge banned">Gesperrt</span>' : ''}
            </td>
            <td>${user.chat_count || 0}</td>
            <td>${user.message_count || 0}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <button onclick="editUser('${user.user_id}')" ${isRootAdmin ? 'disabled' : ''}><i class="fas fa-edit"></i></button>
                <button onclick="banUser('${user.user_id}')" ${isRootAdmin || user.is_banned ? 'disabled' : ''}><i class="fas fa-ban"></i></button>
                <button onclick="unbanUser('${user.user_id}')" ${!user.is_banned || isRootAdmin ? 'disabled' : ''}><i class="fas fa-check"></i></button>
                <button onclick="deleteUser('${user.user_id}')" class="danger" ${isRootAdmin ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

function showCreateUserModal() {
    document.getElementById('userModalTitle').textContent = 'Benutzer erstellen';
    document.getElementById('modalUsername').value = '';
    document.getElementById('modalEmail').value = '';
    document.getElementById('modalPassword').value = '';
    document.getElementById('modalIsAdmin').checked = false;
    document.getElementById('modalSaveBtn').onclick = () => createUser();
    document.getElementById('userModal').style.display = 'flex';
}

async function createUser() {
    const username = document.getElementById('modalUsername').value.trim();
    const email = document.getElementById('modalEmail').value.trim();
    const password = document.getElementById('modalPassword').value;
    const isAdmin = document.getElementById('modalIsAdmin').checked;
    
    if (!username || username.length < 3) {
        alert('Benutzername muss mindestens 3 Zeichen haben');
        return;
    }
    if (!password || password.length < 8) {
        alert('Passwort muss mindestens 8 Zeichen haben');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, email, password, is_admin: isAdmin })
        });
        const data = await response.json();
        if (data.success) {
            closeUserModal();
            await loadUsers();
            await loadStats();
        } else {
            alert(data.error || 'Fehler beim Erstellen');
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Verbindungsfehler');
    }
}

async function editUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            const user = data.user;
            document.getElementById('userModalTitle').textContent = 'Benutzer bearbeiten';
            document.getElementById('modalUsername').value = user.username;
            document.getElementById('modalEmail').value = user.email || '';
            document.getElementById('modalPassword').value = '';
            document.getElementById('modalIsAdmin').checked = user.is_admin === 1;
            document.getElementById('modalSaveBtn').onclick = () => updateUser(userId);
            document.getElementById('userModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('Fehler:', error);
    }
}

async function updateUser(userId) {
    const username = document.getElementById('modalUsername').value.trim();
    const email = document.getElementById('modalEmail').value.trim();
    const isAdmin = document.getElementById('modalIsAdmin').checked;
    const password = document.getElementById('modalPassword').value;
    
    const data = { username, email, is_admin: isAdmin };
    if (password) data.password = password;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            closeUserModal();
            await loadUsers();
        } else {
            alert(result.error || 'Fehler beim Aktualisieren');
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Verbindungsfehler');
    }
}

async function banUser(userId) {
    if (confirm('Benutzer sperren?')) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/ban`, { method: 'POST', credentials: 'include' });
            const data = await response.json();
            if (data.success) await loadUsers();
            else alert(data.error);
        } catch (error) { alert('Fehler'); }
    }
}

async function unbanUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/unban`, { method: 'POST', credentials: 'include' });
        const data = await response.json();
        if (data.success) await loadUsers();
        else alert(data.error);
    } catch (error) { alert('Fehler'); }
}

async function deleteUser(userId) {
    if (confirm('Benutzer unwiderruflich löschen?')) {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
            const data = await response.json();
            if (data.success) {
                await loadUsers();
                await loadStats();
            } else alert(data.error);
        } catch (error) { alert('Fehler'); }
    }
}

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
}


async function loadSupportChats() {
    try {
        const response = await fetch('/api/admin/support/chats', { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            renderSupportChats(data.chats);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Support-Chats:', error);
    }
}

function renderSupportChats(chats) {
    const tbody = document.getElementById('supportChatsBody');
    tbody.innerHTML = '';
    chats.forEach(chat => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(chat.username)}</strong><br><small>${chat.user_id.substring(0, 8)}...</small></td>
            <td>${chat.last_message_time ? new Date(chat.last_message_time).toLocaleString() : '-'}</td>
            <td><span class="badge ${chat.status === 'closed' ? 'offline' : 'online'}">${chat.status || 'open'}</span></td>
            <td><button onclick="openSupportChat('${chat.id}', '${escapeHtml(chat.username)}')"><i class="fas fa-comment"></i> Öffnen</button></td>
        `;
    });
}

async function openSupportChat(chatId, username) {
    currentSupportChatId = chatId;
    document.getElementById('supportUserName').textContent = username;
    document.getElementById('supportChatView').style.display = 'block';
    
    try {
        const response = await fetch(`/api/admin/support/chats/${chatId}/messages`, { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            renderSupportMessages(data.messages);
        }
    } catch (error) {
        console.error('Fehler:', error);
    }
}

function renderSupportMessages(messages) {
    const container = document.getElementById('supportMessages');
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `support-message ${msg.isAdmin ? 'admin' : ''}`;
        div.innerHTML = `
            <div class="bubble">
                <div class="name">${escapeHtml(msg.username)}</div>
                <div>${escapeHtml(msg.message)}</div>
                <div class="time">${new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

async function sendSupportMessage() {
    const input = document.getElementById('supportMessageInput');
    const message = input.value.trim();
    if (!message || !currentSupportChatId) return;
    
    try {
        const response = await fetch(`/api/admin/support/chats/${currentSupportChatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message })
        });
        const data = await response.json();
        if (data.success) {
            input.value = '';
            const msgResponse = await fetch(`/api/admin/support/chats/${currentSupportChatId}/messages`, { credentials: 'include' });
            const msgData = await msgResponse.json();
            if (msgData.success) renderSupportMessages(msgData.messages);
        }
    } catch (error) {
        console.error('Fehler:', error);
    }
}

function closeSupportChat() {
    currentSupportChatId = null;
    document.getElementById('supportChatView').style.display = 'none';
    loadSupportChats();
}


async function loadPushUsers() {
    try {
        const response = await fetch('/api/admin/users', { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
            renderPushUserTable(data.users);
        }
    } catch (error) {
        console.error('Fehler:', error);
    }
}

function renderPushUserTable(users) {
    const tbody = document.getElementById('pushUserTableBody');
    tbody.innerHTML = '';
    users.forEach(user => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(user.username)}</strong><br><small>${user.user_id.substring(0, 8)}...</small></td>
            <td><span class="badge ${user.status === 'online' ? 'online' : 'offline'}">${user.status || 'offline'}</span></td>
            <td><button onclick="showPushForm('${user.user_id}', '${escapeHtml(user.username)}')"><i class="fas fa-bell"></i> Push senden</button></td>
        `;
    });
}

function showPushForm(userId, username) {
    selectedPushUserId = userId;
    document.getElementById('pushTargetName').textContent = username;
    document.getElementById('pushTitle').value = '';
    document.getElementById('pushMessage').value = '';
    document.getElementById('pushForm').style.display = 'block';
}

function closePushForm() {
    selectedPushUserId = null;
    document.getElementById('pushForm').style.display = 'none';
}

async function sendPush() {
    const title = document.getElementById('pushTitle').value.trim();
    const message = document.getElementById('pushMessage').value.trim();
    const sender = document.querySelector('input[name="sender"]:checked').value;
    
    if (!title || !message) {
        alert('Bitte Titel und Nachricht eingeben');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId: selectedPushUserId, title, message, sender })
        });
        const data = await response.json();
        if (data.success) {
            alert('Push-Nachricht gesendet!');
            closePushForm();
        } else {
            alert(data.message || 'Fehler beim Senden');
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Verbindungsfehler');
    }
}


function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}