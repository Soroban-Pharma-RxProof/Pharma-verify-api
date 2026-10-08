import crypto from 'crypto';
import { config } from '../config/index.js';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export class CryptoService {
  private static getKey(): Buffer {
    const rawKey = config.AES_ENCRYPTION_KEY;
    if (rawKey.length === 64) {
      return Buffer.from(rawKey, 'hex');
    }
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypt a sensitive serial string at rest using AES-256-GCM
   */
  public static encryptSerial(serial: string): EncryptedData {
    const key = this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(serial, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /**
   * Decrypt an encrypted serial string
   */
  public static decryptSerial(encrypted: EncryptedData): string {
    const key = this.getKey();
    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Compute standard SHA-256 hash of a string or buffer, returning 32-byte hex
   */
  public static sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compute standard SHA-256 hash, returning 32-byte Buffer
   */
  public static sha256Buffer(data: string | Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  }
}
