const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');


const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: 'Zu viele Anmeldeversuche. Bitte warte 15 Minuten.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip;
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 3, 
    message: 'Zu viele Registrierungsversuche. Bitte warte 1 Stunde.',
    standardHeaders: true,
    legacyHeaders: false
});

const cspConfig = {
    directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
    }
};

const securityHeaders = (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    res.setHeader('X-Frame-Options', 'DENY');
    
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
};

const csrfProtection = (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const token = req.headers['x-csrf-token'];
        const sessionToken = req.session?.csrfToken;
        
        if (!token || !sessionToken || token !== sessionToken) {
            return res.status(403).json({ error: 'Ungültige CSRF-Anfrage' });
        }
    }
    next();
};

const generateCSRFToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const sessionConfig = {
    name: 'blynks.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: parseInt(process.env.SESSION_TTL),
        domain: process.env.NODE_ENV === 'production' ? '.blynks.de' : undefined
    },
    rolling: true
};

module.exports = {
    loginLimiter,
    registerLimiter,
    cspConfig,
    securityHeaders,
    csrfProtection,
    generateCSRFToken,
    sessionConfig
};