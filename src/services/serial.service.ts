import crypto from 'crypto';
import { CryptoService } from './crypto.service.js';
import { MerkleService } from './merkle.service.js';
import { prisma } from '../lib/prisma.js';

export interface GeneratedPack {
  serial: string;
  serialHash: string;
  leafIndex: number;
}

export interface BatchGenerationResult {
  batchId: string;
  merkleRoot: string;
  totalQuantity: number;
  packs: GeneratedPack[];
}

export class SerialService {
  /**
   * Generate an alphanumeric cryptographically random serial identifier
   * Format: RX-YYYY-XXXX-XXXX
   */
  public static generateRandomSerial(): string {
    const bytes = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `RX-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}`;
  }

  /**
   * Generate unique pack serials, build the Merkle tree, and persist encrypted serials to DB
   */
  public static async generateBatchSerials(
    batchId: string,
    quantity: number,
  ): Promise<BatchGenerationResult> {
    if (quantity <= 0 || quantity > 50000) {
      throw new Error('Batch quantity must be between 1 and 50,000 packs');
    }

    const serials: string[] = [];
    const serialHashes: Buffer[] = [];
    const packRecords: Array<{
      serial: string;
      serialHashHex: string;
      encryptedSerial: string;
      iv: string;
      authTag: string;
      leafIndex: number;
    }> = [];

    for (let i = 0; i < quantity; i++) {
      const serial = this.generateRandomSerial();
      serials.push(serial);

      const hashBuf = CryptoService.sha256Buffer(serial);
      serialHashes.push(hashBuf);

      const encrypted = CryptoService.encryptSerial(serial);
      packRecords.push({
        serial,
        serialHashHex: hashBuf.toString('hex'),
        encryptedSerial: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        leafIndex: i,
      });
    }

    // Build Merkle tree and extract 32-byte hex root
    const rootBuf = MerkleService.getRoot(serialHashes);
    const merkleRoot = rootBuf.toString('hex');

    // Batch persist encrypted serials to PostgreSQL database
    await prisma.packSerial.createMany({
      data: packRecords.map((p) => ({
        batchId,
        serialHash: p.serialHashHex,
        encryptedSerial: p.encryptedSerial,
        iv: p.iv,
        authTag: p.authTag,
        leafIndex: p.leafIndex,
      })),
      skipDuplicates: true,
    });

    return {
      batchId,
      merkleRoot,
      totalQuantity: quantity,
      packs: packRecords.map((p) => ({
        serial: p.serial,
        serialHash: p.serialHashHex,
        leafIndex: p.leafIndex,
      })),
    };
  }

  /**
   * Export printable label and QR code definitions
   */
  public static generateLabelExport(
    batchId: string,
    packs: Array<{ serial: string; serialHash: string }>,
  ) {
    return packs.map((p) => ({
      batchId,
      serial: p.serial,
      serialHash: p.serialHash,
      qrPayload: `https://rxproof.org/verify?batch=${batchId}&serial=${p.serial}`,
      verificationUrl: `https://rxproof.org/verify?batch=${batchId}&serial=${p.serial}`,
    }));
  }
}
