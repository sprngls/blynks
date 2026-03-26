const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const crypto = require('crypto');  // Wichtig: crypto importieren!

dotenv.config();

const MASTER_SECRET = process.env.MASTER_SECRET || 'blynks_master_secret_2026';

function generateUserSecret(userId) {
    return crypto.createHmac('sha256', MASTER_SECRET).update(userId).digest('hex');
}

// DB1: Passwort-Hashes
const db1Pool = mysql.createPool({
    host: process.env.DB1_HOST,
    port: parseInt(process.env.DB1_PORT),
    user: process.env.DB1_USER,
    password: decodeURIComponent(process.env.DB1_PASSWORD),
    database: process.env.DB1_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: false
});

// DB2: Benutzer-Metadaten
const db2Pool = mysql.createPool({
    host: process.env.DB2_HOST,
    port: parseInt(process.env.DB2_PORT),
    user: process.env.DB2_USER,
    password: decodeURIComponent(process.env.DB2_PASSWORD),
    database: process.env.DB2_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: false
});

// DB3: Chats & Teilnehmer
const db3Pool = mysql.createPool({
    host: process.env.DB3_HOST,
    port: parseInt(process.env.DB3_PORT),
    user: process.env.DB3_USER,
    password: decodeURIComponent(process.env.DB3_PASSWORD),
    database: process.env.DB3_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: false
});

// DB4: Nachrichten Teil A (Header)
const db4Pool = mysql.createPool({
    host: process.env.DB4_HOST,
    port: parseInt(process.env.DB4_PORT),
    user: process.env.DB4_USER,
    password: decodeURIComponent(process.env.DB4_PASSWORD),
    database: process.env.DB4_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: false
});

// DB5: Nachrichten Teil B (Content) + Logs
const db5Pool = mysql.createPool({
    host: process.env.DB5_HOST,
    port: parseInt(process.env.DB5_PORT),
    user: process.env.DB5_USER,
    password: decodeURIComponent(process.env.DB5_PASSWORD),
    database: process.env.DB5_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: false
});

async function testConnections() {
    console.log('\n🔌 Teste Datenbankverbindungen...');
    
    try { const conn = await db1Pool.getConnection(); console.log('✅ DB1 (Credentials)'); conn.release(); } 
    catch(e) { console.error('❌ DB1:', e.message); }
    
    try { const conn = await db2Pool.getConnection(); console.log('✅ DB2 (Users)'); conn.release(); } 
    catch(e) { console.error('❌ DB2:', e.message); }
    
    try { const conn = await db3Pool.getConnection(); console.log('✅ DB3 (Chats)'); conn.release(); } 
    catch(e) { console.error('❌ DB3:', e.message); }
    
    try { const conn = await db4Pool.getConnection(); console.log('✅ DB4 (Messages A)'); conn.release(); } 
    catch(e) { console.error('❌ DB4:', e.message); }
    
    try { const conn = await db5Pool.getConnection(); console.log('✅ DB5 (Messages B)'); conn.release(); } 
    catch(e) { console.error('❌ DB5:', e.message); }
}

async function initAllTables() {
    console.log('\n📦 Erstelle/Prüfe alle Datenbank-Tabellen...\n');
    
    // === DB1: Credentials ===
    try {
        await db1Pool.execute(`
            CREATE TABLE IF NOT EXISTS user_credentials (
                user_id CHAR(36) PRIMARY KEY,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB1: user_credentials');
    } catch(e) { console.error('❌ DB1 Fehler:', e.message); }
    
    // === DB2: Users ===
    try {
        await db2Pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                user_id CHAR(36) PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                salt VARCHAR(128) NOT NULL,
                user_secret VARCHAR(128) NOT NULL,
                avatar VARCHAR(10) DEFAULT '?',
                status ENUM('online', 'offline', 'idle', 'dnd') DEFAULT 'offline',
                is_admin TINYINT DEFAULT 0,
                is_banned TINYINT DEFAULT 0,
                banned_at TIMESTAMP NULL,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                profile_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_status (status),
                INDEX idx_is_admin (is_admin)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB2: users');
    } catch(e) { console.error('❌ DB2 Fehler:', e.message); }
    
    // === DB3: Chats ===
    try {
        await db3Pool.execute(`
            CREATE TABLE IF NOT EXISTS chats (
                chat_id CHAR(36) PRIMARY KEY,
                name VARCHAR(100),
                type ENUM('dm', 'group') NOT NULL DEFAULT 'dm',
                created_by CHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB3: chats');
        
        await db3Pool.execute(`
            CREATE TABLE IF NOT EXISTS chat_participants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_participant (chat_id, user_id),
                INDEX idx_chat_id (chat_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB3: chat_participants');
        
        // Support-Chats Tabelle
        await db3Pool.execute(`
            CREATE TABLE IF NOT EXISTS support_chats (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                status ENUM('open', 'closed', 'pending') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB3: support_chats');
        
    } catch(e) { console.error('❌ DB3 Fehler:', e.message); }
    
    // === DB4: Messages Part A ===
    try {
        await db4Pool.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages_part_a (
                message_id CHAR(36) PRIMARY KEY,
                chat_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                iv VARCHAR(64) NOT NULL,
                auth_tag VARCHAR(64) NOT NULL,
                integrity_hash VARCHAR(128) NOT NULL,
                message_type ENUM('text', 'image', 'file', 'system', 'admin') DEFAULT 'text',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_chat_id (chat_id),
                INDEX idx_created (created_at),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB4: chat_messages_part_a');
    } catch(e) { console.error('❌ DB4 Fehler:', e.message); }
    
    // === DB5: Messages Part B & Logs ===
    try {
        await db5Pool.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages_part_b (
                message_id CHAR(36) PRIMARY KEY,
                encrypted_message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_message_id (message_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB5: chat_messages_part_b');
        
        await db5Pool.execute(`
            CREATE TABLE IF NOT EXISTS chat_logs (
                log_id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id CHAR(36),
                user_id CHAR(36),
                action VARCHAR(50),
                details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_chat_id (chat_id),
                INDEX idx_user_id (user_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ DB5: chat_logs');
    } catch(e) { console.error('❌ DB5 Fehler:', e.message); }
    
    // ============ ROOT-ADMIN JOJO ============
    try {
        const conn2 = await db2Pool.getConnection();
        
        // Prüfe ob Jojo existiert
        const [existing] = await conn2.execute('SELECT user_id FROM users WHERE username = "Jojo"');
        
        if (existing.length === 0) {
            // Jojo existiert nicht -> neu erstellen
            const userId = crypto.randomBytes(16).toString('hex');  // Jetzt funktioniert crypto.randomBytes
            const salt = crypto.randomBytes(32).toString('hex');
            
            // Passwort-Hash mit argon2 (asynchron)
            const cryptoService = require('../services/cryptoService');
            const passwordHash = await cryptoService.hashPassword('Admin123!', salt);
            const userSecret = crypto.randomBytes(32).toString('hex');
            
            await conn2.execute(
                `INSERT INTO users (user_id, username, email, salt, user_secret, avatar, is_admin, profile_data) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, 'Jojo', 'admin@blynks.de', salt, userSecret, 'J', 1, '{}']
            );
            await db1Pool.execute(
                'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash]
            );
            console.log('✅ Root-Admin "Jojo" erstellt (Passwort: Admin123!)');
        } else {
            console.log('✅ Root-Admin "Jojo" existiert bereits');
        }
        conn2.release();
    } catch(e) { 
        console.error('❌ Root-Admin Fehler:', e.message); 
    }
    
    console.log('\n✅ Alle Tabellen wurden erfolgreich erstellt/geprüft');
}

module.exports = {
    db1Pool,
    db2Pool,
    db3Pool,
    db4Pool,
    db5Pool,
    testConnections,
    initAllTables,
    generateUserSecret
};