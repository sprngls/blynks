const authService = require('../services/authService');

const requireAuth = (req, res, next) => {
    if (authService.isAuthenticated(req)) {
        next();
    } else {
        if (req.url.startsWith('/api/')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }));
        } else {
            res.writeHead(302, { 'Location': '/login.html' });
            res.end();
        }
    }
};

const getSessionScript = (req) => {
    if (authService.isAuthenticated(req)) {
        return `
            <script>
                window.isAuthenticated = true;
                window.currentUser = "${req.session.username || ''}";
                window.currentUserId = "${req.session.userId || ''}";
                window.csrfToken = "${req.session.csrfToken || ''}";
            </script>
        `;
    }
    return `<script>window.isAuthenticated = false;</script>`;
};



module.exports = { requireAuth, getSessionScript };