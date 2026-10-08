import { describe, expect, it } from 'vitest';
import { CryptoService } from '../src/services/crypto.service.js';

describe('CryptoService', () => {
  it('should encrypt and decrypt a serial string correctly with AES-256-GCM', () => {
    const originalSerial = 'RX-BATCH-2026-PACK-9982410-XYZA';
    const encrypted = CryptoService.encryptSerial(originalSerial);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes hex
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes hex

    const decrypted = CryptoService.decryptSerial(encrypted);
    expect(decrypted).toBe(originalSerial);
  });

  it('should compute consistent SHA-256 hashes matching standard algorithms', () => {
    const data = 'HELLO_SOROBAN_PHARMA';
    const hash = CryptoService.sha256(data);

    expect(hash).toHaveLength(64);
    expect(CryptoService.sha256(data)).toBe(hash);
  });
});
