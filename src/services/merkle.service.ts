import crypto from 'crypto';

export class MerkleService {
  /**
   * Helper to ensure input is a 32-byte Buffer
   */
  public static toBuffer(val: string | Buffer): Buffer {
    if (Buffer.isBuffer(val)) {
      return val;
    }
    return Buffer.from(val, 'hex');
  }

  /**
   * Hashes two 32-byte buffers sorted lexicographically.
   * Matches the exact algorithm implemented in Soroban smart contract `hash_sorted_pair`.
   */
  public static hashSortedPair(a: Buffer | string, b: Buffer | string): Buffer {
    const bufA = this.toBuffer(a);
    const bufB = this.toBuffer(b);

    const cmp = Buffer.compare(bufA, bufB);
    const combined = cmp <= 0 ? Buffer.concat([bufA, bufB]) : Buffer.concat([bufB, bufA]);
    return crypto.createHash('sha256').update(combined).digest();
  }

  /**
   * Build complete Merkle tree levels from array of 32-byte leaf buffers or hex strings
   */
  public static buildTree(leaves: Array<Buffer | string>): Buffer[][] {
    if (leaves.length === 0) {
      throw new Error('Cannot construct Merkle tree with 0 leaves');
    }

    const levels: Buffer[][] = [];
    levels.push(leaves.map((l) => this.toBuffer(l)));

    let currentLevel = levels[0];
    while (currentLevel.length > 1) {
      const nextLevel: Buffer[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          nextLevel.push(this.hashSortedPair(currentLevel[i], currentLevel[i + 1]));
        } else {
          // Odd element: duplicate to form pair
          nextLevel.push(this.hashSortedPair(currentLevel[i], currentLevel[i]));
        }
      }
      levels.push(nextLevel);
      currentLevel = nextLevel;
    }

    return levels;
  }

  /**
   * Get 32-byte Merkle root for array of leaf buffers or hex strings
   */
  public static getRoot(leaves: Array<Buffer | string>): Buffer {
    const tree = this.buildTree(leaves);
    return tree[tree.length - 1][0];
  }

  /**
   * Compute audit proof for a given leaf index
   */
  public static getProof(leaves: Array<Buffer | string>, leafIndex: number): Buffer[] {
    if (leafIndex < 0 || leafIndex >= leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (total leaves: ${leaves.length})`);
    }

    const tree = this.buildTree(leaves);
    const proof: Buffer[] = [];
    let currentIndex = leafIndex;

    for (let levelIdx = 0; levelIdx < tree.length - 1; levelIdx++) {
      const level = tree[levelIdx];
      const isEven = currentIndex % 2 === 0;
      const siblingIndex = isEven ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex < level.length) {
        proof.push(level[siblingIndex]);
      } else {
        // Odd node paired with itself
        proof.push(level[currentIndex]);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Verify inclusion proof against root using sorted-pair hashing
   */
  public static verifyProof(
    leaf: Buffer | string,
    proof: Array<Buffer | string>,
    root: Buffer | string
  ): boolean {
    if (proof.length > 32) {
      return false; // Proof depth cap
    }

    const targetRoot = this.toBuffer(root);
    let current = this.toBuffer(leaf);

    for (const sibling of proof) {
      current = this.hashSortedPair(current, sibling);
    }

    return current.equals(targetRoot);
  }
}
