const argon2 = require('argon2');
const crypto = require('crypto'); // Wichtig: crypto importieren!

class CryptoService {
    constructor() {
        this.argon2Options = {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            hashLength: 64
        };
    }
    
    generateSalt() { 
        return crypto.randomBytes(32).toString('hex'); 
    }
    
    async hashPassword(password, salt) {
        const saltedPassword = password + salt;
        return await argon2.hash(saltedPassword, this.argon2Options);
    }
    
    async verifyPassword(password, hash, salt) {
        const saltedPassword = password + salt;
        return await argon2.verify(hash, saltedPassword);
    }
    
    generateSessionToken() { 
        return crypto.randomBytes(32).toString('hex'); 
    }
    
    sha3(data) { 
        return crypto.createHash('sha3-512').update(data).digest('hex'); 
    }
    
    // ============ NACHRICHTEN-VERSCHLÜSSELUNG ============
    
    // Generiert einen 32-Byte (256-bit) Chat-Schlüssel
    generateChatKey(chatId, userSecret) {
        // Verwende SHA-256 um einen 32-Byte Schlüssel zu erzeugen
        const hmac = crypto.createHmac('sha256', userSecret);
        hmac.update(chatId);
        return hmac.digest(); // Gibt 32 Bytes zurück
    }
    
    // Generiert einen Chat-Schlüssel für Direktnachrichten (beide Benutzer)
    generateDirectMessageChatKey(chatId, userSecret1, userSecret2) {
        const secrets = [userSecret1, userSecret2].sort();
        const combinedSecret = secrets[0] + secrets[1] + chatId;
        return crypto.createHash('sha256').update(combinedSecret).digest();
    }
    
    // Verschlüsselt eine Nachricht
    encryptMessage(message, chatKey) {
        try {
            let key = chatKey;
            if (typeof chatKey === 'string') {
                key = Buffer.from(chatKey, 'hex');
            }
            if (key.length !== 32) {
                key = crypto.createHash('sha256').update(key).digest();
            }
            
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            let encrypted = cipher.update(message, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            
            const integrityHash = this.sha3(encrypted + authTag.toString('hex') + iv.toString('hex'));
            
            return {
                success: true,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encryptedMessage: encrypted,
                integrityHash
            };
        } catch (error) {
            console.error('Verschlüsselungsfehler:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Entschlüsselt eine Nachricht
    decryptMessage(encryptedMessage, ivHex, authTagHex, integrityHash, chatKey) {
        try {
            let key = chatKey;
            if (typeof chatKey === 'string') {
                key = Buffer.from(chatKey, 'hex');
            }
            if (key.length !== 32) {
                key = crypto.createHash('sha256').update(key).digest();
            }
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            
            let decrypted = decipher.update(encryptedMessage, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return { success: true, message: decrypted };
        } catch (error) {
            console.error('Entschlüsselungsfehler:', error.message);
            return { success: false, error: error.message, message: '[Verschlüsselte Nachricht]' };
        }
    }
    
    generateRandomChatKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = new CryptoService();