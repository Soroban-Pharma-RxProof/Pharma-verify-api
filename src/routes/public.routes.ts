import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AnomalyService } from '../services/anomaly.service.js';
import { CryptoService } from '../services/crypto.service.js';
import { ProofService } from '../services/proof.service.js';
import { StellarService } from '../services/stellar.service.js';

export async function publicRoutes(fastify: FastifyInstance) {
  // GET /api/v1/public/verify - Public pack verification endpoint
  fastify.get(
    '/verify',
    {
      schema: {
        summary: 'Verify authenticity, expiry, recall status, and clone detection for a medicine pack',
        tags: ['Public Verification'],
        querystring: {
          type: 'object',
          required: ['batchId'],
          properties: {
            batchId: { type: 'string' },
            serial: { type: 'string' },
            serialHash: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const querySchema = z.object({
        batchId: z.string().min(1),
        serial: z.string().optional(),
        serialHash: z.string().optional(),
      });

      const parseResult = querySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
      }

      const { batchId, serial, serialHash: rawHash } = parseResult.data;

      if (!serial && !rawHash) {
        return reply.status(400).send({
          error: 'Either serial or serialHash must be provided',
        });
      }

      const serialHash = rawHash || CryptoService.sha256(serial!);

      // Look up batch in local DB
      const batch = await prisma.batch.findUnique({
        where: { batchId },
      });

      if (!batch) {
        // Record anomaly for unknown batch scan
        await AnomalyService.recordAlert({
          rule: 'UNKNOWN_BATCH',
          severity: 'HIGH',
          batchId,
          serialHash,
          details: `Verification query for non-existent batch ${batchId} with serial hash ${serialHash.slice(0, 8)}...`,
        });

        return reply.status(404).send({
          status: 'SUSPICIOUS_UNKNOWN_BATCH',
          message: 'Batch identifier not found in regulatory registry',
        });
      }

      // Verify Merkle tree membership via ProofService
      const proofData = await ProofService.getProofForSerial(batchId, serialHash);

      if (!proofData) {
        await AnomalyService.recordAlert({
          rule: 'INVALID_PROOF',
          severity: 'CRITICAL',
          batchId,
          serialHash,
          details: `Cryptographic Merkle proof lookup failed for serial hash ${serialHash.slice(0, 8)} in batch ${batchId}`,
        });

        return reply.send({
          status: 'SUSPICIOUS_INVALID_PROOF',
          message: 'Serial number is not part of this registered batch',
          batch: {
            batchId: batch.batchId,
            productName: batch.productName,
          },
        });
      }

      // Check on-chain batch status via simulation
      const onChainStatus = await StellarService.getBatchStatus(batchId);

      // Check local serial dispense status
      const packRecord = await prisma.packSerial.findUnique({
        where: { serialHash },
      });

      const now = Math.floor(Date.now() / 1000);
      const isExpired = Number(batch.expiryTimestamp) < now;

      if (batch.status === 'RECALLED' || onChainStatus?.recalled) {
        return reply.send({
          status: 'RECALLED',
          message: 'This medicine batch has been RECALLED by health authorities or manufacturer.',
          recallReason: batch.recallReason || 'Regulatory recall',
          batch: {
            batchId: batch.batchId,
            productName: batch.productName,
            dosage: batch.dosage,
            expiryTimestamp: Number(batch.expiryTimestamp),
          },
        });
      }

      if (packRecord?.isDispensed) {
        // Serial was already dispensed/burned, cloned pack detected!
        await AnomalyService.recordAlert({
          rule: 'DUPLICATE_BURN',
          severity: 'CRITICAL',
          batchId,
          serialHash,
          details: `CLONED SERIAL DETECTED: Serial ${serialHash.slice(0, 10)}... was previously dispensed at ${packRecord.updatedAt.toISOString()} and is now being scanned again.`,
        });

        return reply.send({
          status: 'SUSPICIOUS_CLONED',
          message: 'WARNING: This pack serial was previously dispensed and burned. This pack may be a counterfeit clone.',
          dispensedAt: packRecord.updatedAt,
          batch: {
            batchId: batch.batchId,
            productName: batch.productName,
            dosage: batch.dosage,
          },
        });
      }

      if (isExpired) {
        return reply.send({
          status: 'EXPIRED',
          message: 'Warning: This medicine has expired and must not be consumed.',
          batch: {
            batchId: batch.batchId,
            productName: batch.productName,
            dosage: batch.dosage,
            expiryTimestamp: Number(batch.expiryTimestamp),
          },
        });
      }

      // Authentic pack
      return reply.send({
        status: 'AUTHENTIC',
        message: 'This pack is genuine, unburned, and within its validity period.',
        batch: {
          batchId: batch.batchId,
          productName: batch.productName,
          dosage: batch.dosage,
          totalQuantity: batch.totalQuantity,
          totalStrips: batch.totalStrips,
          unitsPerStrip: batch.unitsPerStrip,
          expiryTimestamp: Number(batch.expiryTimestamp),
          currentCustodian: batch.currentCustodian,
          status: batch.status,
        },
        pack: {
          serialHash,
          isDispensed: false,
          dispensedStripsMask: packRecord?.dispensedStripsMask ?? 0,
        },
      });
    }
  );

  // GET /api/v1/public/batches/:batchId/journey - Public supply chain custody history
  fastify.get(
    '/batches/:batchId/journey',
    {
      schema: {
        summary: 'Track full provenance and supply chain journey of a batch',
        tags: ['Public Verification'],
        params: {
          type: 'object',
          required: ['batchId'],
          properties: { batchId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { batchId } = request.params as { batchId: string };

      const batch = await prisma.batch.findUnique({
        where: { batchId },
        include: {
          custodyLogs: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      return reply.send({
        batchId: batch.batchId,
        productName: batch.productName,
        manufacturerAddress: batch.manufacturerAddress,
        currentCustodian: batch.currentCustodian,
        status: batch.status,
        custodyHistory: batch.custodyLogs.map((log) => ({
          from: log.fromAddress,
          to: log.toAddress,
          txHash: log.txHash,
          timestamp: log.timestamp,
        })),
      });
    }
  );

  // POST /api/v1/public/report - Report suspicious pack or adverse event
  fastify.post(
    '/report',
    {
      schema: {
        summary: 'Submit consumer or healthcare professional suspicious pack report',
        tags: ['Public Verification'],
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            batchId: { type: 'string' },
            serial: { type: 'string' },
            reason: { type: 'string' },
            location: { type: 'string' },
            contactEmail: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const reportSchema = z.object({
        batchId: z.string().optional(),
        serial: z.string().optional(),
        reason: z.string().min(5),
        location: z.string().optional(),
        contactEmail: z.string().email().optional(),
      });

      const parseResult = reportSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
      }

      const input = parseResult.data;
      const serialHash = input.serial ? CryptoService.sha256(input.serial) : undefined;

      const alert = await AnomalyService.recordAlert({
        rule: 'CONSUMER_REPORT',
        severity: 'HIGH',
        batchId: input.batchId,
        serialHash,
        details: `Public consumer report: ${input.reason} (Location: ${input.location || 'Unknown'})`,
      });

      if (input.batchId) {
        await AnomalyService.checkBurstReporting(input.batchId);
      }

      return reply.status(201).send({
        message: 'Suspicious report recorded and routed to regulatory inspection queue.',
        reportId: alert.id,
      });
    }
  );
}
