const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');


const { domains, MIME_TYPES, getBrandingHeaders, logWithBranding, isPageAllowed } = require('./config/domains');
const { db1Pool, db2Pool, db3Pool, db4Pool, db5Pool, initAllTables, testConnections } = require('./config/database');
const authService = require('./services/authService');
const chatService = require('./services/chatService');
const { getSessionScript } = require('./middleware/auth');
const { saveSubscription, removeSubscription, sendPushNotification } = require('./routes/pushRoutes');
const adminController = require('./controllers/adminController');

dotenv.config();


const fileCache = new Map();
const cacheTimestamps = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
const sessions = new Map();



const isValidFilename = (filename) => {
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename);
};

const getFileFromCache = (filePath) => {
    const now = Date.now();
    const cached = fileCache.get(filePath);
    const timestamp = cacheTimestamps.get(filePath);
    if (cached && timestamp && (now - timestamp) < CACHE_DURATION) return cached;
    return null;
};

const getContentType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
};


const getSession = (req, res) => {
    let sessionId = null;
    const cookies = req.headers.cookie;
    if (cookies) {
        const match = cookies.match(/blynks\.sid=([^;]+)/);
        if (match) sessionId = match[1];
    }
    
    if (!sessionId) {
        sessionId = crypto.randomBytes(32).toString('hex');
        const maxAge = req.headers.cookie?.includes('blynks.remember=1') ? 30 * 24 * 60 * 60 : 3600;
        res.setHeader('Set-Cookie', `blynks.sid=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
    }
    
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            id: sessionId,
            userId: null,
            username: null,
            sessionToken: null,
            csrfToken: null,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        sessions.set(sessionId, session);
    }
    
    const maxAge = req.headers.cookie?.includes('blynks.remember=1') ? 30 * 24 * 60 * 60 * 1000 : 3600000;
    if (Date.now() - session.createdAt > maxAge) {
        sessions.delete(sessionId);
        session = {
            id: sessionId,
            userId: null,
            username: null,
            sessionToken: null,
            csrfToken: null,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        sessions.set(sessionId, session);
    }
    
    session.lastActivity = Date.now();
    req.session = session;
    return session;
};

authService.setSessionHandler({
    get: (req) => req.session,
    save: (req, session) => {
        if (req.session) {
            Object.assign(req.session, session);
            sessions.set(req.session.id, req.session);
        }
    },
    destroy: (req) => {
        if (req.session) {
            sessions.delete(req.session.id);
            req.session = null;
        }
    }
});


const ERROR_PAGES = {
    403: (domain, url) => `<!DOCTYPE html><html><head><title>403</title><style>body{background:#080808;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}</style></head><body><h1 style="color:#ff4d4d">403 - Zugriff verweigert</h1><p>Die Seite ${url} ist nicht freigegeben.</p><a href="/" style="color:#d0ff13">Zurück</a></body></html>`,
    404: (domain, url) => `<!DOCTYPE html><html><head><title>404</title><style>body{background:#080808;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}</style></head><body><h1 style="color:#d0ff13">404 - Seite nicht gefunden</h1><p>Der Pfad ${url} existiert nicht.</p><a href="/" style="color:#d0ff13">Zurück</a></body></html>`
};

const sendErrorPage = (res, statusCode, domain, url, port) => {
    const html = ERROR_PAGES[statusCode](domain, url);
    res.writeHead(statusCode, getBrandingHeaders(domain));
    res.end(html);
};


async function isAdmin(req) {
    if (!authService.isAuthenticated(req)) {
        console.log('❌ Admin-Check: Nicht authentifiziert');
        return false;
    }
    
    const conn = await db2Pool.getConnection();
    try {
        console.log(`🔍 Admin-Check für User ID: ${req.session.userId}`);
        
        const [users] = await conn.execute(
            'SELECT is_admin FROM users WHERE user_id = ?',
            [req.session.userId]
        );
        
        if (users.length === 0) {
            console.log('❌ Admin-Check: User nicht gefunden');
            return false;
        }
        
        const isAdminUser = users[0].is_admin === 1;
        console.log(`🔍 Admin-Check Ergebnis: ${isAdminUser ? 'JA (Admin)' : 'NEIN (kein Admin)'}`);
        return isAdminUser;
    } catch (e) {
        console.error('❌ Admin-Check Fehler:', e.message);
        return false;
    } finally {
        conn.release();
    }
}


const handleApiRequest = async (req, res, domain, port, url, body) => {
    console.log(`📡 API: ${req.method} ${url}`);
    
if (url.startsWith('/api/admin/')) {
    const isAdminUser = await isAdmin(req);
    if (!isAdminUser) {
        res.writeHead(403, getBrandingHeaders(domain, 'application/json'));
        res.end(JSON.stringify({ success: false, error: 'Keine Admin-Rechte' }));
        return true;
    }
  // Support-Chat Routen
if (url === '/api/admin/support/chats' && req.method === 'GET') {
    await adminController.getSupportChats(req, res);
    return true;
}

const supportChatMatch = url.match(/^\/api\/admin\/support\/chats\/([^\/]+)\/messages$/);
if (supportChatMatch && req.method === 'GET') {
    req.params = { chatId: supportChatMatch[1] };
    await adminController.getSupportMessages(req, res);
    return true;
}
if (supportChatMatch && req.method === 'POST') {
    req.params = { chatId: supportChatMatch[1] };
    const data = JSON.parse(body);
    req.body = data;
    await adminController.sendSupportMessage(req, res);
    return true;
}

const closeSupportMatch = url.match(/^\/api\/admin\/support\/chats\/([^\/]+)\/close$/);
if (closeSupportMatch && req.method === 'POST') {
    req.params = { chatId: closeSupportMatch[1] };
    await adminController.closeSupportChat(req, res);
    return true;
}
    
    // Benutzerverwaltung
    if (url === '/api/admin/users' && req.method === 'GET') {
        await adminController.getUsers(req, res);
        return true;
    }
    if (url === '/api/admin/users' && req.method === 'POST') {
        // Body parsen
        const data = JSON.parse(body);
        req.body = data;
        await adminController.createUser(req, res);
        return true;
    }
    
    const userMatch = url.match(/^\/api\/admin\/users\/([^\/]+)$/);
    if (userMatch && req.method === 'GET') {
        req.params = { userId: userMatch[1] };
        await adminController.getUser(req, res);
        return true;
    }
    if (userMatch && req.method === 'PUT') {
        req.params = { userId: userMatch[1] };
        const data = JSON.parse(body);
        req.body = data;
        await adminController.updateUser(req, res);
        return true;
    }
    if (userMatch && req.method === 'DELETE') {
        req.params = { userId: userMatch[1] };
        await adminController.deleteUser(req, res);
        return true;
    }
    
    const banMatch = url.match(/^\/api\/admin\/users\/([^\/]+)\/ban$/);
    if (banMatch && req.method === 'POST') {
        req.params = { userId: banMatch[1] };
        await adminController.banUser(req, res);
        return true;
    }
    
    const unbanMatch = url.match(/^\/api\/admin\/users\/([^\/]+)\/unban$/);
    if (unbanMatch && req.method === 'POST') {
        req.params = { userId: unbanMatch[1] };
        await adminController.unbanUser(req, res);
        return true;
    }
    
    if (url === '/api/admin/push/send' && req.method === 'POST') {
        const data = JSON.parse(body);
        req.body = data;
        await adminController.sendPushNotification(req, res);
        return true;
    }
    

    if (url === '/api/admin/stats' && req.method === 'GET') {
        await adminController.getStats(req, res);
        return true;
    }
    
    res.writeHead(404, getBrandingHeaders(domain, 'application/json'));
    res.end(JSON.stringify({ error: 'Admin-Endpunkt nicht gefunden' }));
    return true;
}
    
    if (url === '/api/push/subscribe' && req.method === 'POST') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const subscription = JSON.parse(body);
            const userId = req.session.userId;
            await saveSubscription(userId, subscription);
            console.log(`✅ Push-Subscription für User ${userId} gespeichert`);
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            console.error('Push-Subscription Fehler:', e);
            res.writeHead(400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }));
        }
        return true;
    }
    
    if (url === '/api/push/unsubscribe' && req.method === 'POST') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const userId = req.session.userId;
            await removeSubscription(userId);
            console.log(`🗑️ Push-Subscription für User ${userId} entfernt`);
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }));
        }
        return true;
    }
    
    if (url === '/api/login' && req.method === 'POST') {
        try {
            const { username, password } = JSON.parse(body);
            const result = await authService.login(username, password, req);
            if (result.success) {
                res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
                res.end(JSON.stringify({ success: true, user: result.user, csrfToken: result.csrfToken }));
            } else {
                res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
                res.end(JSON.stringify({ success: false, error: result.error }));
            }
        } catch (e) {
            res.writeHead(400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }));
        }
        return true;
    }
    
    if (url === '/api/register' && req.method === 'POST') {
        try {
            const { username, email, password } = JSON.parse(body);
            const result = await authService.register(username, email, password);
            res.writeHead(result.success ? 201 : 400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }));
        }
        return true;
    }
    
    if (url === '/api/logout' && req.method === 'POST') {
        await authService.logout(req);
        res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
        res.end(JSON.stringify({ success: true }));
        return true;
    }
    
    if (url === '/api/session') {
        const isAuthenticated = authService.isAuthenticated(req);
        if (isAuthenticated) {
            const user = await authService.getCurrentUser(req);
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ authenticated: true, user: { id: user?.user_id, username: user?.username }, csrfToken: req.session?.csrfToken }));
        } else {
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ authenticated: false }));
        }
        return true;
    }
    
    if (url === '/api/user' && req.method === 'GET') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        const user = await authService.getCurrentUser(req);
        res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
        res.end(JSON.stringify({ success: true, user }));
        return true;
    }
    

    
    if (url === '/api/chats' && req.method === 'GET') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const chats = await chatService.getUserChats(req.session.userId);
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true, chats }));
        } catch (error) {
            console.error('Fehler beim Laden der Chats:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    if (url === '/api/chats/dm' && req.method === 'POST') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const { username } = JSON.parse(body);
            const result = await chatService.createDirectMessage(req.session.userId, username);
            res.writeHead(result.success ? 200 : 400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify(result));
        } catch (error) {
            console.error('Fehler beim Erstellen des DM:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    const chatDetailMatch = url.match(/^\/api\/chats\/([^\/]+)$/);
    if (chatDetailMatch && req.method === 'GET') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const chatId = chatDetailMatch[1];
            const chat = await chatService.getChatById(chatId, req.session.userId);
            if (!chat) {
                res.writeHead(404, getBrandingHeaders(domain, 'application/json'));
                res.end(JSON.stringify({ success: false, error: 'Chat nicht gefunden' }));
                return true;
            }
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true, chat }));
        } catch (error) {
            console.error('Fehler beim Laden des Chats:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    const messagesMatch = url.match(/^\/api\/chats\/([^\/]+)\/messages$/);
    if (messagesMatch && req.method === 'GET') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const chatId = messagesMatch[1];
            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const limit = parseInt(parsedUrl.searchParams.get('limit')) || 50;
            const before = parsedUrl.searchParams.get('before');
            
            const messages = await chatService.getMessages(chatId, req.session.userId, limit, before);
            await chatService.markAsRead(chatId, req.session.userId);
            
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true, messages }));
        } catch (error) {
            console.error('Fehler beim Laden der Nachrichten:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    const sendMatch = url.match(/^\/api\/chats\/([^\/]+)\/messages$/);
    if (sendMatch && req.method === 'POST') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const { message } = JSON.parse(body);
            const chatId = sendMatch[1];
            const result = await chatService.sendMessage(chatId, req.session.userId, message);
            res.writeHead(result.success ? 200 : 400, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify(result));
        } catch (error) {
            console.error('Fehler beim Senden der Nachricht:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    if (url.startsWith('/api/users/search') && req.method === 'GET') {
        if (!authService.isAuthenticated(req)) {
            res.writeHead(401, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
            return true;
        }
        try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const query = parsedUrl.searchParams.get('query') || '';
            const users = await chatService.searchUsers(query, req.session.userId);
            res.writeHead(200, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: true, users }));
        } catch (error) {
            console.error('Fehler bei der Benutzersuche:', error);
            res.writeHead(500, getBrandingHeaders(domain, 'application/json'));
            res.end(JSON.stringify({ success: false, error: 'Serverfehler' }));
        }
        return true;
    }
    
    return false;
};



const serveStaticFile = (filePath, res, domain, port) => {
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return sendErrorPage(res, 404, domain, path.basename(filePath), port);
        
        const cached = getFileFromCache(filePath);
        if (cached) {
            const contentType = getContentType(filePath);
            res.writeHead(200, getBrandingHeaders(domain, contentType));
            return res.end(cached);
        }
        
        fs.readFile(filePath, (err, data) => {
            if (err) return sendErrorPage(res, 500, domain, '', port);
            fileCache.set(filePath, data);
            cacheTimestamps.set(filePath, Date.now());
            const contentType = getContentType(filePath);
            res.writeHead(200, getBrandingHeaders(domain, contentType));
            res.end(data);
        });
    });
};

const serveHtmlWithSession = (filePath, res, domain, port, req) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return sendErrorPage(res, 404, domain, path.basename(filePath), port);
        
        const sessionScript = getSessionScript(req);
        const htmlWithSession = data.replace('</body>', `${sessionScript}</body>`);
        
        const headers = {
            ...getBrandingHeaders(domain, 'text/html'),
            'Cache-Control': 'public, max-age=3600',
            'Service-Worker-Allowed': '/'
        };
        
        res.writeHead(200, headers);
        res.end(htmlWithSession);
    });
};


const createRequestHandler = (port, domain) => {
    return async (req, res) => {
        const session = getSession(req, res);
        const rawUrl = decodeURIComponent(req.url.split('?')[0]);
        
        if (rawUrl === '/manifest.json') {
            const manifestPath = path.join(__dirname, 'public', 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                return serveStaticFile(manifestPath, res, domain, port);
            }
        }
        
        if (rawUrl === '/sw.js') {
            const swPath = path.join(__dirname, 'public', 'sw.js');
            if (fs.existsSync(swPath)) {
                return serveStaticFile(swPath, res, domain, port);
            }
        }
        

        if (rawUrl.includes('..') || rawUrl.includes('//')) {
            return sendErrorPage(res, 403, domain, rawUrl, port);
        }
        

        if (rawUrl.startsWith('/api/')) {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const handled = await handleApiRequest(req, res, domain, port, rawUrl, body);
                if (!handled) {
                    res.writeHead(404, getBrandingHeaders(domain, 'application/json'));
                    res.end(JSON.stringify({ error: 'API-Endpunkt nicht gefunden' }));
                }
            });
            return;
        }
        

        if (rawUrl.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|webp)$/)) {
            const filename = path.basename(rawUrl);
            if (!isValidFilename(filename)) return sendErrorPage(res, 400, domain, rawUrl, port);
            
            const possiblePaths = [
                path.join(__dirname, 'public', filename),
                path.join(__dirname, 'public', 'js', filename),
                path.join(__dirname, 'public', 'css', filename),
                path.join(__dirname, 'public', 'assets', filename),
                path.join(__dirname, 'public', 'images', filename)
            ];
            
            let filePath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) { filePath = p; break; }
            }
            
            if (filePath) return serveStaticFile(filePath, res, domain, port);
            return sendErrorPage(res, 404, domain, rawUrl, port);
        }
        
        // HTML-Seiten
        const pageMap = {
            '/': 'index.html',
            '/index.html': 'index.html',
            '/login': 'login.html',
            '/login.html': 'login.html',
            '/register': 'register.html',
            '/register.html': 'register.html',
            '/dashboard': 'dashboard.html',
            '/dashboard.html': 'dashboard.html',
            '/admin': 'admin.html',
            '/admin.html': 'admin.html',
            '/app': 'dashboard.html',
            '/app.html': 'dashboard.html',
            '/impressum': 'impressum.html',
            '/team': 'team.html'
        };
        
        const pageFile = pageMap[rawUrl];
        if (pageFile) {
            const filePath = path.join(__dirname, 'public', pageFile);
            if (fs.existsSync(filePath)) {
                return serveHtmlWithSession(filePath, res, domain, port, req);
            }
        }
        
        sendErrorPage(res, 404, domain, rawUrl, port);
    };
};


setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [filePath, timestamp] of cacheTimestamps.entries()) {
        if (now - timestamp > CACHE_DURATION * 2) {
            fileCache.delete(filePath);
            cacheTimestamps.delete(filePath);
            cleaned++;
        }
    }
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActivity > 2 * 60 * 60 * 1000) {
            sessions.delete(sessionId);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`\x1b[35m[Cache] ${cleaned} Einträge bereinigt\x1b[0m`);
}, 10 * 60 * 1000);





async function startServer() {
    try {
        await initAllTables();
        console.log('\n✅ Datenbank-Tabellen bereit');
        await testConnections();
    } catch (err) {
        console.error('\n❌ Datenbank-Fehler:', err.message);
        console.log('\n⚠️  Server startet trotzdem - einige Funktionen könnten eingeschränkt sein');
    }
    
    const servers = [];
    Object.entries(domains).forEach(([port, domain]) => {
        const server = http.createServer((req, res) => {
            const handler = createRequestHandler(parseInt(port), domain);
            handler(req, res);
        });
        
        server.listen(parseInt(port), () => {
            logWithBranding(parseInt(port), domain, `🚀 Server gestartet auf Port ${port}`, 'success');
        });
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logWithBranding(parseInt(port), domain, `❌ Port ${port} belegt`, 'error');
            } else {
                logWithBranding(parseInt(port), domain, `❌ Fehler: ${err.message}`, 'error');
            }
        });
        
        servers.push({ port: parseInt(port), server, domain });
    });
    
    setTimeout(() => {
        console.log(`\n\x1b[36m╔══════════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    📊 BLYNKS SERVER STATUS REPORT                         ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════════════╝\x1b[0m`);
        servers.forEach(({ port, server, domain }) => {
            const status = server.listening ? '✅ AKTIV' : '❌ INAKTIV';
            console.log(`\x1b[${domain.color === '\x1b[36m' ? '36' : '35'}m${domain.name.padEnd(20)} (Port ${port}): ${status}\x1b[0m`);
        });
        console.log(`\n\x1b[32m✨ BLYNKS Chat System v2.0 - Bereit\x1b[0m`);
        console.log(`\x1b[36m💾 ${servers.length} Server | ${sessions.size} Sessions\x1b[0m\n`);
        console.log(`\x1b[33m👑 Admin-Zugang: Jojo / Admin123!\x1b[0m\n`);
    }, 1000);
}

startServer();