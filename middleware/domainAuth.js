const authService = require('../services/authService');
const { logWithBranding } = require('../config/domains');

const requiresAuth = (domain, url) => {
    const normalizedUrl = url.split('?')[0];
    
    if (normalizedUrl.startsWith('/api/')) {
        const publicApis = ['/api/login', '/api/register', '/api/session'];
        return !publicApis.includes(normalizedUrl);
    }
    
    return domain.authRequiredPages.includes(normalizedUrl);
};

const domainAuthMiddleware = (domain, port) => {
    return async (req, res, next) => {
        const url = req.url;
        
        if (requiresAuth(domain, url)) {
            const isAuthenticated = authService.isAuthenticated(req);
            
            if (!isAuthenticated) {
                logWithBranding(port, domain, `🚫 Nicht authentifizierter Zugriff auf ${url}`, 'warning');
                
                if (url.startsWith('/api/')) {
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Nicht authentifiziert',
                        redirect: '/login.html'
                    });
                }
                
                return res.redirect(`/login.html?redirect=${encodeURIComponent(url)}`);
            }
            
            logWithBranding(port, domain, `🔐 Authentifizierter Zugriff auf ${url}`, 'success');
        }
        
        next();
    };
};

const getSessionScript = (req) => {
    if (authService.isAuthenticated(req)) {
        return `
            <script>
                window.isAuthenticated = true;
                window.currentUser = ${JSON.stringify(req.session.username)};
                window.csrfToken = "${req.session.csrfToken || ''}";
            </script>
        `;
    }
    return `
        <script>
            window.isAuthenticated = false;
            window.currentUser = null;
        </script>
    `;
};

module.exports = {
    domainAuthMiddleware,
    requiresAuth,
    getSessionScript
};