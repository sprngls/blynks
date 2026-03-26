const domains = {
    3000: {
        name: 'blynks.de',
        brand: 'BLYNKS',
        color: '\x1b[36m',
        requiresAuth: false,
        authRequiredPages: [],
        pages: 'ALL',
        allowAllPages: true,
        staticFiles: true,
        logo: 'BLYNKS'
    },
    1046: {
        name: 'blynks.online',
        brand: 'BLYNKS',
        color: '\x1b[35m',
        requiresAuth: false,
        authRequiredPages: [],
        pages: ['/', '/no.html', '/impressum'],
        staticFiles: true,
        logo: 'BLYNKS'
    },
    1047: {
        name: 'blynks.info',
        brand: 'BLYNKS',
        color: '\x1b[33m',
        requiresAuth: false,
        authRequiredPages: [],
        pages: ['/', '/no.html'],
        staticFiles: true,
        logo: 'BLYNKS'
    },
    1048: {
        name: 'blynks.store',
        brand: 'BLYNKS',
        color: '\x1b[32m',
        requiresAuth: false,
        authRequiredPages: [],
        pages: ['/', '/no.html'],
        staticFiles: true,
        logo: 'BLYNKS'
    },
    1053: {
        name: 'jojosstudio.de',
        brand: 'JOJOS Studio x BLYNKS',
        color: '\x1b[35m',
        requiresAuth: false,
        authRequiredPages: [],
        pages: ['/', '/jojo.html', '/impressum'],
        staticFiles: true,
        logo: 'JOJOS'
    }
};

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.webp': 'image/webp'
};

const isPageAllowed = (domain, url) => {
    if (url.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|webp)$/)) return true;
    if (domain.allowAllPages === true || domain.pages === 'ALL') return true;
    const normalizedUrl = url.split('?')[0];
    return domain.pages.includes(normalizedUrl);
};

const getBrandingHeaders = (domain, contentType = 'text/html') => ({
    'Content-Type': contentType,
    'X-Powered-By': 'BLYNKS Secure Server v2.0',
    'X-Brand': domain.brand,
    'X-Domain': domain.name
});

const logWithBranding = (port, domain, message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const color = type === 'error' ? '\x1b[31m' : type === 'success' ? '\x1b[32m' : domain.color;
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : '📡';
    console.log(`${color}[${timestamp}] [${domain.brand}:${port}] ${icon} ${message}\x1b[0m`);
};

module.exports = { domains, MIME_TYPES, getBrandingHeaders, logWithBranding, isPageAllowed };