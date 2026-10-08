import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { AnomalyService } from './anomaly.service.js';

export class IndexerService {
  private rpcServer: rpc.Server;
  private isRunning: boolean = false;

  constructor() {
    this.rpcServer = new rpc.Server(config.STELLAR_RPC_URL, {
      allowHttp: config.NODE_ENV !== 'production',
    });
  }

  /**
   * Get the last indexed ledger or start ledger from config/database
   */
  public async getStartLedger(): Promise<number> {
    const checkpoint = await prisma.indexerCheckpoint.findUnique({
      where: { id: 'singleton' },
    });

    if (checkpoint) {
      return Number(checkpoint.lastLedger) + 1;
    }

    try {
      const latest = await this.rpcServer.getLatestLedger();
      return Math.max(1, latest.sequence - 100);
    } catch {
      return 1;
    }
  }

  /**
   * Update the indexer checkpoint in the database
   */
  public async updateCheckpoint(ledger: number, cursor?: string) {
    await prisma.indexerCheckpoint.upsert({
      where: { id: 'singleton' },
      update: {
        lastLedger: BigInt(ledger),
        lastCursor: cursor || null,
        updatedAt: new Date(),
      },
      create: {
        id: 'singleton',
        lastLedger: BigInt(ledger),
        lastCursor: cursor || null,
      },
    });
  }

  /**
   * Poll and process events from Soroban RPC
   */
  public async processEventsOnce(): Promise<number> {
    const startLedger = await this.getStartLedger();
    let eventsProcessed = 0;

    try {
      const response = await this.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [config.CONTRACT_ID],
          },
        ],
        limit: 100,
      });

      if (!response.events || response.events.length === 0) {
        const latest = await this.rpcServer.getLatestLedger();
        if (latest.sequence > startLedger) {
          await this.updateCheckpoint(latest.sequence);
        }
        return 0;
      }

      let maxLedger = startLedger;

      for (const event of response.events) {
        await this.handleEvent(event);
        eventsProcessed++;
        if (event.ledger > maxLedger) {
          maxLedger = event.ledger;
        }
      }

      await this.updateCheckpoint(maxLedger, response.cursor);
    } catch (err: any) {
      console.error('[INDEXER] Error fetching or processing events:', err.message);
    }

    return eventsProcessed;
  }

  /**
   * Parse and route Soroban event based on topic
   */
  private async handleEvent(event: any) {
    try {
      const topics = event.topic.map((t: any) => {
        try {
          return scValToNative(t);
        } catch {
          return null;
        }
      });

      const eventName = topics[0]?.toString?.();
      const eventData = scValToNative(event.value);

      console.log(`[INDEXER] Event observed: ${eventName} at ledger ${event.ledger}`);

      switch (eventName) {
        case 'batch_registered': {
          const batchId = topics[1]?.toString?.();
          const manufacturer = topics[2]?.toString?.();
          if (batchId) {
            await prisma.batch.updateMany({
              where: { batchId },
              data: {
                status: 'ACTIVE',
                manufacturerAddress: manufacturer || 'UNKNOWN',
              },
            });
          }
          break;
        }

        case 'custody_transferred': {
          const batchId = topics[1]?.toString?.();
          const toAddress = topics[2]?.toString?.();
          const fromAddress = eventData?.from || eventData;

          if (batchId && toAddress) {
            await prisma.custodyLog.create({
              data: {
                batchId,
                fromAddress: typeof fromAddress === 'string' ? fromAddress : 'UNKNOWN',
                toAddress,
                txHash: event.txHash || 'on-chain-event',
                ledgerSequence: BigInt(event.ledger || 0),
              },
            });

            await prisma.batch.updateMany({
              where: { batchId },
              data: { currentCustodian: toAddress },
            });
          }
          break;
        }

        case 'pack_dispensed': {
          const batchId = topics[1]?.toString?.();
          const pharmacy = topics[2]?.toString?.();
          const serialHash = typeof eventData === 'string' ? eventData : eventData?.serial_hash || Buffer.from(eventData || []).toString('hex');

          if (serialHash) {
            // Check duplicate scans before setting dispensed
            await AnomalyService.checkDuplicateScan(serialHash, batchId || 'UNKNOWN', 'PHARMACY');

            await prisma.packSerial.updateMany({
              where: { serialHash },
              data: {
                isDispensed: true,
                dispensedStripsMask: 0xffffffff,
              },
            });

            await prisma.dispenseLog.create({
              data: {
                batchId: batchId || 'UNKNOWN',
                serialHash,
                pharmacyAddress: pharmacy || 'UNKNOWN',
                txHash: event.txHash || 'on-chain',
                stripIndex: null,
              },
            });
          }
          break;
        }

        case 'partial_dispensed': {
          const batchId = topics[1]?.toString?.();
          const pharmacy = topics[2]?.toString?.();
          const serialHash = eventData?.serial_hash || Buffer.from(eventData?.[0] || []).toString('hex');
          const bitmask = Number(eventData?.bitmask ?? eventData?.[1] ?? 0);

          if (serialHash) {
            await prisma.packSerial.updateMany({
              where: { serialHash },
              data: {
                dispensedStripsMask: bitmask,
              },
            });

            await prisma.dispenseLog.create({
              data: {
                batchId: batchId || 'UNKNOWN',
                serialHash,
                pharmacyAddress: pharmacy || 'UNKNOWN',
                txHash: event.txHash || 'on-chain',
                stripIndex: bitmask,
              },
            });
          }
          break;
        }

        case 'batch_recalled': {
          const batchId = topics[1]?.toString?.();
          const caller = topics[2]?.toString?.();
          const reason = typeof eventData === 'string' ? eventData : JSON.stringify(eventData);

          if (batchId) {
            await prisma.batch.updateMany({
              where: { batchId },
              data: {
                status: 'RECALLED',
                recallReason: reason,
              },
            });

            await AnomalyService.recordAlert({
              rule: 'BATCH_RECALLED',
              severity: 'CRITICAL',
              batchId,
              details: `Batch ${batchId} was officially recalled by ${caller}. Reason: ${reason}`,
            });
          }
          break;
        }

        case 'suspicious_reported': {
          const batchId = topics[1]?.toString?.();
          const reporter = topics[2]?.toString?.();
          const reason = typeof eventData === 'string' ? eventData : JSON.stringify(eventData);

          await AnomalyService.recordAlert({
            rule: 'SUSPICIOUS_REPORTED',
            severity: 'HIGH',
            batchId: batchId || undefined,
            details: `Suspicious activity reported by ${reporter}: ${reason}`,
          });

          if (batchId) {
            await AnomalyService.checkBurstReporting(batchId);
          }
          break;
        }
      }
    } catch (parseErr: any) {
      console.warn('[INDEXER] Failed to parse event:', parseErr.message);
    }
  }

  /**
   * Continuous background polling loop
   */
  public async startPolling(intervalMs: number = 3000) {
    this.isRunning = true;
    console.log(`[INDEXER] Started Soroban event indexer for contract: ${config.CONTRACT_ID}`);

    while (this.isRunning) {
      try {
        await this.processEventsOnce();
      } catch (err: any) {
        console.error('[INDEXER] Polling cycle error:', err.message);
      }
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }

  public stop() {
    this.isRunning = false;
    console.log('[INDEXER] Stopped Soroban event indexer.');
  }
}
