import { describe, expect, it, vi } from 'vitest';
import { AnomalyService } from '../src/services/anomaly.service.js';
import { prisma } from '../src/lib/prisma.js';

describe('AnomalyService Logic & Supply Chain Rules', () => {
  it('correctly identifies custody chain skips from manufacturer direct to pharmacy', async () => {
    // Direct skip
    const isSkip = await AnomalyService.checkCustodySkip('BATCH-001', 'MANUFACTURER', 'PHARMACY');
    expect(isSkip).toBe(true);

    // Standard valid transitions
    const validStep1 = await AnomalyService.checkCustodySkip('BATCH-001', 'MANUFACTURER', 'DISTRIBUTOR');
    expect(validStep1).toBe(false);

    const validStep2 = await AnomalyService.checkCustodySkip('BATCH-001', 'DISTRIBUTOR', 'PHARMACY');
    expect(validStep2).toBe(false);
  });

  it('detects duplicate burns when serial is already marked as dispensed', async () => {
    // Mock prisma.packSerial.findUnique and anomalyAlert.create
    const findUniqueSpy = vi.spyOn(prisma.packSerial, 'findUnique').mockResolvedValueOnce({
      id: 'serial-uuid',
      batchId: 'BATCH-001',
      serialHash: 'hash-1234567890abcdef',
      encryptedSerial: 'enc',
      iv: 'iv',
      authTag: 'tag',
      leafIndex: 0,
      isDispensed: true,
      dispensedStripsMask: 0xffffffff,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const createAlertSpy = vi.spyOn(prisma.anomalyAlert, 'create').mockResolvedValueOnce({
      id: 'alert-uuid',
      rule: 'DUPLICATE_BURN',
      severity: 'CRITICAL',
      batchId: 'BATCH-001',
      serialHash: 'hash-1234567890abcdef',
      details: 'Potential counterfeit clone detected',
      resolved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const isClone = await AnomalyService.checkDuplicateScan('hash-1234567890abcdef', 'BATCH-001', 'PHARMACY');
    expect(isClone).toBe(true);
    expect(findUniqueSpy).toHaveBeenCalled();
    expect(createAlertSpy).toHaveBeenCalled();

    findUniqueSpy.mockRestore();
    createAlertSpy.mockRestore();
  });

  it('returns false for unburned authentic serials', async () => {
    const findUniqueSpy = vi.spyOn(prisma.packSerial, 'findUnique').mockResolvedValueOnce({
      id: 'serial-uuid-2',
      batchId: 'BATCH-002',
      serialHash: 'hash-unburned',
      encryptedSerial: 'enc',
      iv: 'iv',
      authTag: 'tag',
      leafIndex: 1,
      isDispensed: false,
      dispensedStripsMask: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const isClone = await AnomalyService.checkDuplicateScan('hash-unburned', 'BATCH-002');
    expect(isClone).toBe(false);

    findUniqueSpy.mockRestore();
  });

  it('detects burst reporting when threshold is exceeded in time window', async () => {
    const countSpy = vi.spyOn(prisma.anomalyAlert, 'count').mockResolvedValueOnce(6);
    const createAlertSpy = vi.spyOn(prisma.anomalyAlert, 'create').mockResolvedValueOnce({
      id: 'burst-alert-uuid',
      rule: 'REPORT_BURST',
      severity: 'HIGH',
      batchId: 'BATCH-BURST',
      serialHash: null,
      details: 'Burst anomaly detected',
      resolved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const hasBurst = await AnomalyService.checkBurstReporting('BATCH-BURST', 30, 5);
    expect(hasBurst).toBe(true);

    countSpy.mockRestore();
    createAlertSpy.mockRestore();
  });
});
