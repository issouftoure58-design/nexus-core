/**
 * SENTINEL Two-Factor Authentication - Protection Phase 4
 * Gestion 2FA avec TOTP
 */

import crypto from 'crypto';
import auditTrail from '../reports/auditTrail.js';

class TwoFactorAuth {
  constructor() {
    this.secrets = new Map(); // userId -> { secret, enabled, backupCodes }
    this.pendingVerifications = new Map(); // token -> { userId, code, expiry }

    this.config = {
      codeLength: 6,
      codeExpiry: 5 * 60 * 1000, // 5 minutes
      backupCodesCount: 10,
      issuer: 'SENTINEL',
      algorithm: 'sha1',
      period: 30
    };

    this.stats = {
      enabled: 0,
      verified: 0,
      failed: 0,
      backupUsed: 0
    };
  }

  /**
   * Genere un secret 2FA pour un utilisateur
   */
  generateSecret(userId) {
    // Generer un secret base32
    const buffer = crypto.randomBytes(20);
    const secret = this.base32Encode(buffer);

    // Generer des codes de backup
    const backupCodes = this.generateBackupCodes();

    const entry = {
      secret,
      enabled: false,
      backupCodes,
      createdAt: new Date().toISOString()
    };

    this.secrets.set(userId, entry);

    // Generer l'URL pour QR code
    const otpAuthUrl = this.generateOtpAuthUrl(userId, secret);

    auditTrail.logAction({
      type: '2FA_SECRET_GENERATED',
      details: { userId }
    });

    return {
      success: true,
      secret,
      backupCodes,
      otpAuthUrl,
      qrCodeData: otpAuthUrl
    };
  }

  /**
   * Active le 2FA pour un utilisateur (apres verification initiale)
   */
  enable(userId, code) {
    const entry = this.secrets.get(userId);
    if (!entry) {
      return { success: false, error: 'No 2FA setup found' };
    }

    // Verifier le code
    const valid = this.verifyTOTP(entry.secret, code);
    if (!valid) {
      this.stats.failed++;
      return { success: false, error: 'Invalid code' };
    }

    entry.enabled = true;
    this.secrets.set(userId, entry);
    this.stats.enabled++;

    auditTrail.logAction({
      type: '2FA_ENABLED',
      details: { userId }
    });

    console.log(`[2FA] Enabled for user: ${userId}`);
    return { success: true };
  }

  /**
   * Desactive le 2FA pour un utilisateur
   */
  disable(userId) {
    const entry = this.secrets.get(userId);
    if (!entry) {
      return { success: false, error: 'No 2FA setup found' };
    }

    this.secrets.delete(userId);

    auditTrail.logAction({
      type: '2FA_DISABLED',
      details: { userId }
    });

    console.log(`[2FA] Disabled for user: ${userId}`);
    return { success: true };
  }

  /**
   * Verifie un code 2FA
   */
  verify(userId, code) {
    const entry = this.secrets.get(userId);
    if (!entry || !entry.enabled) {
      return { success: false, error: '2FA not enabled' };
    }

    // Verifier le code TOTP
    if (this.verifyTOTP(entry.secret, code)) {
      this.stats.verified++;

      auditTrail.logAction({
        type: '2FA_VERIFIED',
        details: { userId }
      });

      return { success: true };
    }

    // Verifier les codes de backup
    const backupIndex = entry.backupCodes.indexOf(code);
    if (backupIndex !== -1) {
      // Utiliser et supprimer le code de backup
      entry.backupCodes.splice(backupIndex, 1);
      this.secrets.set(userId, entry);
      this.stats.backupUsed++;

      auditTrail.logAction({
        type: '2FA_BACKUP_USED',
        details: { userId, remainingBackupCodes: entry.backupCodes.length }
      });

      return {
        success: true,
        backupCodeUsed: true,
        remainingBackupCodes: entry.backupCodes.length
      };
    }

    this.stats.failed++;

    auditTrail.logAction({
      type: '2FA_FAILED',
      details: { userId }
    });

    return { success: false, error: 'Invalid code' };
  }

  /**
   * Genere un code TOTP
   */
  generateTOTP(secret, time = null) {
    const epoch = Math.floor((time || Date.now()) / 1000);
    const counter = Math.floor(epoch / this.config.period);

    return this.generateHOTP(secret, counter);
  }

  /**
   * Genere un code HOTP
   */
  generateHOTP(secret, counter) {
    const decodedSecret = this.base32Decode(secret);

    // Counter en buffer 8 bytes big-endian
    const counterBuffer = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = counter & 0xff;
      counter = Math.floor(counter / 256);
    }

    // HMAC-SHA1
    const hmac = crypto.createHmac(this.config.algorithm, decodedSecret);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const binary = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    );

    // Generer code a 6 chiffres
    const code = (binary % Math.pow(10, this.config.codeLength))
      .toString()
      .padStart(this.config.codeLength, '0');

    return code;
  }

  /**
   * Verifie un code TOTP (avec window de tolerance)
   */
  verifyTOTP(secret, code, window = 1) {
    const now = Date.now();

    for (let i = -window; i <= window; i++) {
      const time = now + (i * this.config.period * 1000);
      const expected = this.generateTOTP(secret, time);

      if (code === expected) {
        return true;
      }
    }

    return false;
  }

  /**
   * Genere des codes de backup
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.config.backupCodesCount; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Regenere les codes de backup
   */
  regenerateBackupCodes(userId) {
    const entry = this.secrets.get(userId);
    if (!entry) {
      return { success: false, error: 'No 2FA setup found' };
    }

    entry.backupCodes = this.generateBackupCodes();
    this.secrets.set(userId, entry);

    auditTrail.logAction({
      type: '2FA_BACKUP_REGENERATED',
      details: { userId }
    });

    return { success: true, backupCodes: entry.backupCodes };
  }

  /**
   * Genere l'URL otpauth pour QR code
   */
  generateOtpAuthUrl(userId, secret) {
    const issuer = encodeURIComponent(this.config.issuer);
    const account = encodeURIComponent(userId);

    return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=${this.config.algorithm.toUpperCase()}&digits=${this.config.codeLength}&period=${this.config.period}`;
  }

  /**
   * Encode en base32
   */
  base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
  }

  /**
   * Decode base32
   */
  base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const lookup = {};
    for (let i = 0; i < alphabet.length; i++) {
      lookup[alphabet[i]] = i;
    }

    const cleanedInput = encoded.toUpperCase().replace(/=+$/, '');
    const bytes = [];
    let bits = 0;
    let value = 0;

    for (const char of cleanedInput) {
      if (!(char in lookup)) continue;

      value = (value << 5) | lookup[char];
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  /**
   * Verifie si 2FA est active pour un utilisateur
   */
  isEnabled(userId) {
    const entry = this.secrets.get(userId);
    return entry?.enabled || false;
  }

  /**
   * Retourne le status 2FA d'un utilisateur
   */
  getUserStatus(userId) {
    const entry = this.secrets.get(userId);
    if (!entry) {
      return { setup: false, enabled: false };
    }

    return {
      setup: true,
      enabled: entry.enabled,
      backupCodesRemaining: entry.backupCodes.length,
      createdAt: entry.createdAt
    };
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      totalUsers: this.secrets.size,
      enabledUsers: Array.from(this.secrets.values()).filter(e => e.enabled).length,
      config: {
        codeLength: this.config.codeLength,
        period: this.config.period,
        backupCodesCount: this.config.backupCodesCount
      }
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      totalUsers: this.secrets.size,
      enabledUsers: Array.from(this.secrets.values()).filter(e => e.enabled).length,
      stats: this.stats
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.secrets.clear();
    this.pendingVerifications.clear();
    this.stats = { enabled: 0, verified: 0, failed: 0, backupUsed: 0 };
  }
}

// Singleton
const twoFactorAuth = new TwoFactorAuth();
export { twoFactorAuth };
export default twoFactorAuth;
