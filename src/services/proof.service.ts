import { CryptoService } from './crypto.service.js';
import { MerkleService } from './merkle.service.js';
import { prisma } from '../lib/prisma.js';

export interface ProofResponse {
  batchId: string;
  serialHash: string;
  merkleRoot: string;
  merkleProof: string[]; // Array of 32-byte hex hashes
  leafIndex: number;
}

export class ProofService {
  /**
   * Look up proof for a specific serial in a batch without exposing other pack serials.
   */
  public static async getProofForSerial(
    batchId: string,
    serialOrHash: string,
  ): Promise<ProofResponse | null> {
    const batch = await prisma.batch.findUnique({
      where: { batchId },
    });
    if (!batch) {
      return null;
    }

    // Determine whether input is raw serial (e.g. RX-...) or 64-char hex hash
    let serialHashHex = serialOrHash.toLowerCase();
    if (serialOrHash.startsWith('RX-') || serialOrHash.length !== 64) {
      serialHashHex = CryptoService.sha256(serialOrHash);
    }

    const pack = await prisma.packSerial.findUnique({
      where: { serialHash: serialHashHex },
    });
    if (!pack || pack.batchId !== batchId) {
      return null;
    }

    // Fetch all serial hashes in order of leafIndex to reconstruct tree path
    const allPacks = await prisma.packSerial.findMany({
      where: { batchId },
      orderBy: { leafIndex: 'asc' },
      select: { serialHash: true, leafIndex: true },
    });

    const leafBuffers = allPacks.map((p) => Buffer.from(p.serialHash, 'hex'));
    const proofBuffers = MerkleService.getProof(leafBuffers, pack.leafIndex);

    return {
      batchId,
      serialHash: serialHashHex,
      merkleRoot: batch.merkleRoot,
      merkleProof: proofBuffers.map((b) => b.toString('hex')),
      leafIndex: pack.leafIndex,
    };
  }
}
