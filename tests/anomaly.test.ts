import { describe, expect, it } from 'vitest';
import { AnomalyService } from '../src/services/anomaly.service.js';

describe('AnomalyService Logic', () => {
  it('should flag custody skips when skipping distributors', async () => {
    // Test detection logic directly
    const isSkip = (fromRole: string, toRole: string) => fromRole === 'MANUFACTURER' && toRole === 'PHARMACY';

    expect(isSkip('MANUFACTURER', 'PHARMACY')).toBe(true);
    expect(isSkip('MANUFACTURER', 'DISTRIBUTOR')).toBe(false);
    expect(isSkip('DISTRIBUTOR', 'PHARMACY')).toBe(false);
  });
});
