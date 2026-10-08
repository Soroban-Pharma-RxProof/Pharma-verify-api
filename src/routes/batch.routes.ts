import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';
import { ProofService } from '../services/proof.service.js';
import { SerialService } from '../services/serial.service.js';

export async function batchRoutes(fastify: FastifyInstance) {
  // POST /api/v1/batches - Manufacturer creates batch & generates Merkle tree
  fastify.post(
    '/',
    {
      preHandler: requireRole('MANUFACTURER'),
      schema: {
        summary: 'Register new batch and generate Merkle root with encrypted serials',
        tags: ['Batches'],
        body: {
          type: 'object',
          required: ['batchId', 'brandName', 'dosageForm', 'packSize', 'totalQuantity', 'expiryTimestamp'],
          properties: {
            batchId: { type: 'string' },
            brandName: { type: 'string' },
            dosageForm: { type: 'string' },
            packSize: { type: 'integer' },
            totalQuantity: { type: 'integer' },
            stripsPerPack: { type: 'integer', default: 1 },
            unitsPerStrip: { type: 'integer', default: 10 },
            expiryTimestamp: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const batchSchema = z.object({
        batchId: z.string().min(2),
        brandName: z.string().min(2),
        dosageForm: z.string().min(2),
        packSize: z.number().int().positive(),
        totalQuantity: z.number().int().positive().max(10000),
        stripsPerPack: z.number().int().min(1).max(32).default(1),
        unitsPerStrip: z.number().int().min(1).default(10),
        expiryTimestamp: z.number().int().positive(),
      });

      const parseResult = batchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
      }

      const input = parseResult.data;
      const manufacturerId = request.user!.publicKey || request.user!.stellarAddress || 'UNKNOWN';

      // Check if batch already exists
      const existing = await prisma.batch.findUnique({
        where: { batchId: input.batchId },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Batch ID already exists' });
      }

      // Generate cryptographically unique serials and build Merkle tree
      const generated = await SerialService.generateBatchSerials(input.batchId, input.totalQuantity);

      // Persist batch record in database
      const batch = await prisma.batch.create({
        data: {
          batchId: input.batchId,
          productName: input.brandName,
          dosage: input.dosageForm,
          totalQuantity: input.totalQuantity,
          totalStrips: input.stripsPerPack,
          unitsPerStrip: input.unitsPerStrip,
          expiryTimestamp: BigInt(input.expiryTimestamp),
          merkleRoot: generated.merkleRoot,
          metadataHash: '0x00',
          status: 'PENDING_REGISTRATION',
          manufacturerAddress: manufacturerId,
          currentCustodian: manufacturerId,
        },
      });

      return reply.status(201).send({
        message: 'Batch generated successfully',
        batch: {
          ...batch,
          expiryTimestamp: Number(batch.expiryTimestamp),
        },
        merkleRoot: generated.merkleRoot,
        totalPacks: generated.packs.length,
      });
    }
  );

  // GET /api/v1/batches - List batches
  fastify.get(
    '/',
    {
      preHandler: authenticate,
      schema: {
        summary: 'List batches with optional filters',
        tags: ['Batches'],
        querystring: {
          type: 'object',
          properties: {
            manufacturerId: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { manufacturerId, status } = request.query as {
        manufacturerId?: string;
        status?: string;
      };

      const batches = await prisma.batch.findMany({
        where: {
          ...(manufacturerId && { manufacturerAddress: manufacturerId }),
          ...(status && { status }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          custodyLogs: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      });

      const formatted = batches.map((b) => ({
        ...b,
        expiryTimestamp: Number(b.expiryTimestamp),
      }));

      return reply.send({ batches: formatted });
    }
  );

  // GET /api/v1/batches/:batchId - Get single batch
  fastify.get(
    '/:batchId',
    {
      schema: {
        summary: 'Get details of a specific batch',
        tags: ['Batches'],
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
        batch: {
          ...batch,
          expiryTimestamp: Number(batch.expiryTimestamp),
        },
      });
    }
  );

  // GET /api/v1/batches/:batchId/export - Export serials for packaging printing
  fastify.get(
    '/:batchId/export',
    {
      preHandler: requireRole('MANUFACTURER', 'REGULATOR'),
      schema: {
        summary: 'Export packaging serial numbers and QR payloads for factory printing',
        tags: ['Batches'],
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
        include: { serials: true },
      });

      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      const caller = request.user!.publicKey || request.user!.stellarAddress;
      if (request.user!.role === 'MANUFACTURER' && batch.manufacturerAddress !== caller) {
        return reply.status(403).send({ error: 'Cannot export serials for another manufacturer' });
      }

      const exportData = batch.serials.map((s, index) => ({
        packIndex: index,
        serialHash: s.serialHash,
        qrPayload: JSON.stringify({
          b: batchId,
          h: s.serialHash,
        }),
      }));

      return reply.send({
        batchId,
        merkleRoot: batch.merkleRoot,
        totalPacks: exportData.length,
        packs: exportData,
      });
    }
  );

  // GET /api/v1/batches/:batchId/proof/:serialHash - Isolated Merkle proof query
  fastify.get(
    '/:batchId/proof/:serialHash',
    {
      schema: {
        summary: 'Get isolated Merkle proof for a specific pack serial hash',
        tags: ['Batches'],
        params: {
          type: 'object',
          required: ['batchId', 'serialHash'],
          properties: {
            batchId: { type: 'string' },
            serialHash: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { batchId, serialHash } = request.params as { batchId: string; serialHash: string };

      try {
        const proofData = await ProofService.getProofForSerial(batchId, serialHash);
        if (!proofData) {
          return reply.status(404).send({ error: 'Proof not found for specified serial in batch' });
        }
        return reply.send(proofData);
      } catch (err: any) {
        return reply.status(500).send({
          error: 'Failed to retrieve proof',
          message: err.message,
        });
      }
    }
  );
}
