import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CookieEncryptionService {
  private readonly logger = new Logger(CookieEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  encrypt(plaintext: Record<string, unknown>): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const data = JSON.stringify(plaintext);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(encryptedData: { encrypted: string; iv: string; authTag: string }): Record<string, unknown> {
    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(encryptedData.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData.encrypted, 'base64')),
        decipher.final(),
      ]);
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      this.logger.error('Failed to decrypt cookies', error);
      throw new Error('Cookie decryption failed - data may be corrupted or key changed');
    }
  }
}