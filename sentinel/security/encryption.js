/**
 * SENTINEL Encryption - Protection Phase 4
 * Services de chiffrement et hachage
 */

import crypto from 'crypto';
import auditTrail from '../reports/auditTrail.js';

class Encryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltLength = 64;
    this.iterations = 100000;

    this.stats = {
      encryptions: 0,
      decryptions: 0,
      hashes: 0,
      verifications: 0
    };
  }

  /**
   * Derive une cle depuis un secret
   */
  deriveKey(secret, salt) {
    return crypto.pbkdf2Sync(
      secret,
      salt,
      this.iterations,
      this.keyLength,
      'sha512'
    );
  }

  /**
   * Chiffre des donnees
   */
  encrypt(data, secret) {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      const key = this.deriveKey(secret, salt);

      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      const text = typeof data === 'string' ? data : JSON.stringify(data);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      // Format: salt:iv:tag:encrypted
      const result = [
        salt.toString('hex'),
        iv.toString('hex'),
        tag.toString('hex'),
        encrypted
      ].join(':');

      this.stats.encryptions++;

      return { success: true, data: result };
    } catch (error) {
      console.error('[ENCRYPTION] Encrypt error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Dechiffre des donnees
   */
  decrypt(encryptedData, secret) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        return { success: false, error: 'Invalid encrypted data format' };
      }

      const [saltHex, ivHex, tagHex, encrypted] = parts;

      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const key = this.deriveKey(secret, salt);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.stats.decryptions++;

      // Essayer de parser en JSON
      try {
        return { success: true, data: JSON.parse(decrypted) };
      } catch {
        return { success: true, data: decrypted };
      }
    } catch (error) {
      console.error('[ENCRYPTION] Decrypt error:', error.message);
      return { success: false, error: 'Decryption failed' };
    }
  }

  /**
   * Hash un mot de passe
   */
  hashPassword(password) {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const hash = crypto.pbkdf2Sync(
        password,
        salt,
        this.iterations,
        64,
        'sha512'
      );

      this.stats.hashes++;

      // Format: iterations:salt:hash
      return {
        success: true,
        hash: [
          this.iterations.toString(),
          salt.toString('hex'),
          hash.toString('hex')
        ].join(':')
      };
    } catch (error) {
      console.error('[ENCRYPTION] Hash error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifie un mot de passe
   */
  verifyPassword(password, storedHash) {
    try {
      const parts = storedHash.split(':');
      if (parts.length !== 3) {
        return { success: false, valid: false, error: 'Invalid hash format' };
      }

      const [iterations, saltHex, hashHex] = parts;
      const salt = Buffer.from(saltHex, 'hex');

      const hash = crypto.pbkdf2Sync(
        password,
        salt,
        parseInt(iterations),
        64,
        'sha512'
      );

      this.stats.verifications++;

      const valid = crypto.timingSafeEqual(
        hash,
        Buffer.from(hashHex, 'hex')
      );

      return { success: true, valid };
    } catch (error) {
      console.error('[ENCRYPTION] Verify error:', error.message);
      return { success: false, valid: false, error: error.message };
    }
  }

  /**
   * Genere un token securise
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Genere un hash SHA-256
   */
  sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Genere un HMAC
   */
  hmac(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verifie un HMAC
   */
  verifyHmac(data, secret, signature) {
    const expected = this.hmac(data, secret);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Chiffre des donnees sensibles pour le stockage
   */
  encryptSensitiveData(data, purpose = 'storage') {
    const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'sentinel-default-key';
    const result = this.encrypt(data, secret + purpose);

    if (result.success) {
      auditTrail.logAction({
        type: 'DATA_ENCRYPTED',
        details: { purpose, dataType: typeof data }
      });
    }

    return result;
  }

  /**
   * Dechiffre des donnees sensibles
   */
  decryptSensitiveData(encryptedData, purpose = 'storage') {
    const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'sentinel-default-key';
    const result = this.decrypt(encryptedData, secret + purpose);

    if (result.success) {
      auditTrail.logAction({
        type: 'DATA_DECRYPTED',
        details: { purpose }
      });
    }

    return result;
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      iterations: this.iterations
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      stats: this.stats
    };
  }

  /**
   * Reset stats (pour tests)
   */
  resetStats() {
    this.stats = {
      encryptions: 0,
      decryptions: 0,
      hashes: 0,
      verifications: 0
    };
  }
}

// Singleton
const encryption = new Encryption();
export { encryption };
export default encryption;
