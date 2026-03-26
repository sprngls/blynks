class AuthService {
    constructor() {
        this.isLoggedIn = false;
        this.currentUser = null;
        this.csrfToken = null;
        this.sessionCheckInterval = null;
    }
    
    async request(endpoint, method = 'GET', data = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (['POST', 'PUT', 'DELETE'].includes(method) && this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }
        
        const options = { method, headers, credentials: 'include' };
        if (data) options.body = JSON.stringify(data);
        
        try {
            const response = await fetch(endpoint, options);
            
            if (response.status === 401) {
                if (!endpoint.includes('/api/session')) {
                    this.isLoggedIn = false;
                    this.currentUser = null;
                }
                return null;
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return { success: response.ok };
        } catch (err) {
            console.error('API-Fehler:', err);
            return null;
        }
    }
    
    async register(username, email, password) {
        // Validierungen
        if (!username || username.length < 3) {
            this.showMessage('Benutzername muss mindestens 3 Zeichen haben', 'error');
            return false;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            this.showMessage('Benutzername darf nur Buchstaben, Zahlen und _ enthalten', 'error');
            return false;
        }
        if (password.length < 8) {
            this.showMessage('Passwort muss mindestens 8 Zeichen haben', 'error');
            return false;
        }
        
        const result = await this.request('/api/register', 'POST', { username, email, password });
        
        if (result?.success) {
            this.showMessage('Registrierung erfolgreich! Bitte melde dich an.', 'success');
            setTimeout(() => window.location.href = '/login.html', 2000);
            return true;
        } else {
            const errorMsg = result?.error || 'Registrierung fehlgeschlagen';
            this.showMessage(errorMsg, 'error');
            return false;
        }
    }
    
    async login(username, password) {
        const result = await this.request('/api/login', 'POST', { username, password });
        
        if (result?.success) {
            this.isLoggedIn = true;
            this.currentUser = result.user;
            this.csrfToken = result.csrfToken;
            
            if (this.sessionCheckInterval) clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = setInterval(() => {
                if (this.isLoggedIn) this.checkSession();
            }, 5 * 60 * 1000);
            
            this.showMessage(`Willkommen, ${result.user.username}!`, 'success');
            
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
            return true;
        } else {
            this.showMessage(result?.error || 'Login fehlgeschlagen', 'error');
            return false;
        }
    }
    
    async logout() {
        if (this.sessionCheckInterval) clearInterval(this.sessionCheckInterval);
        await this.request('/api/logout', 'POST');
        this.isLoggedIn = false;
        this.currentUser = null;
        window.location.href = '/login.html';
    }
    
    async checkSession() {
        const result = await this.request('/api/session');
        
        if (result?.authenticated) {
            this.isLoggedIn = true;
            this.currentUser = result.user;
            this.csrfToken = result.csrfToken;
            return true;
        } else if (this.isLoggedIn) {
            this.isLoggedIn = false;
            this.currentUser = null;
        }
        return false;
    }
    
    async getCurrentUser() {
        const result = await this.request('/api/user');
        if (result?.success) return result.user;
        return null;
    }
    
    isAuthenticated() {
        return this.isLoggedIn;
    }
    
    showMessage(message, type) {
        const popupContainer = document.getElementById('popupContainer');
        if (popupContainer && window.showPopup) {
            window.showPopup(type, type === 'success' ? 'Erfolg' : 'Fehler', message);
        } else {
            console.log(`[${type}] ${message}`);
            alert(message);
        }
    }
}

window.auth = new AuthService();

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
        await window.auth.checkSession();
    }
    
    // Login-Formular
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username')?.value;
            const password = document.getElementById('password')?.value;
            await window.auth.login(username, password);
        });
    }
    
    // Register-Formular
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername')?.value;
            const email = document.getElementById('regEmail')?.value;
            const password = document.getElementById('regPassword')?.value;
            const confirm = document.getElementById('regConfirm')?.value;
            
            if (password !== confirm) {
                window.auth.showMessage('Passwörter stimmen nicht überein', 'error');
                return;
            }
            
            await window.auth.register(username, email, password);
        });
    }
    
    // Logout-Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => window.auth.logout());
    }
    
    // Dashboard-Schutz
    if (window.location.pathname.includes('dashboard') && !window.auth.isAuthenticated()) {
        window.location.href = '/login.html';
    }
});