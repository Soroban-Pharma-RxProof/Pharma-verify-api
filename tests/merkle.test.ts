import { describe, expect, it } from 'vitest';
import { CryptoService } from '../src/services/crypto.service.js';
import { MerkleService } from '../src/services/merkle.service.js';

describe('MerkleService', () => {
  it('should generate valid sorted-pair Merkle root and verify proofs for all leaves', () => {
    const leaves = ['serial-001', 'serial-002', 'serial-003', 'serial-004'].map((s) =>
      CryptoService.sha256(s)
    );

    const rootBuf = MerkleService.getRoot(leaves);
    const rootHex = rootBuf.toString('hex');

    expect(rootHex).toHaveLength(64);

    // Verify proof for each leaf
    leaves.forEach((leaf, idx) => {
      const proof = MerkleService.getProof(leaves, idx);
      expect(proof.length).toBeGreaterThan(0);

      const isValid = MerkleService.verifyProof(leaf, proof, rootHex);
      expect(isValid).toBe(true);
    });
  });

  it('should handle odd number of leaves gracefully by duplicating the last node', () => {
    const leaves = ['leaf-1', 'leaf-2', 'leaf-3'].map((s) => CryptoService.sha256(s));
    const rootBuf = MerkleService.getRoot(leaves);

    leaves.forEach((leaf, idx) => {
      const proof = MerkleService.getProof(leaves, idx);
      const isValid = MerkleService.verifyProof(leaf, proof, rootBuf);
      expect(isValid).toBe(true);
    });
  });

  it('should reject invalid or forged proofs', () => {
    const leaves = ['serial-A', 'serial-B'].map((s) => CryptoService.sha256(s));
    const root = MerkleService.getRoot(leaves);

    const fakeLeaf = CryptoService.sha256('fake-serial');
    const validProof = MerkleService.getProof(leaves, 0);

    const isValid = MerkleService.verifyProof(fakeLeaf, validProof, root);
    expect(isValid).toBe(false);
  });
});
