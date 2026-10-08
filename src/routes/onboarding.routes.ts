import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ParticipantStatus, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { StellarService } from '../services/stellar.service.js';

export async function onboardingRoutes(fastify: FastifyInstance) {
  // POST /api/v1/onboarding/apply
  fastify.post(
    '/apply',
    {
      schema: {
        summary: 'Submit a new participant licensing application',
        tags: ['Onboarding'],
        body: {
          type: 'object',
          required: ['publicKey', 'role', 'orgName', 'licenseNumber'],
          properties: {
            publicKey: { type: 'string' },
            role: { type: 'string', enum: ['MANUFACTURER', 'DISTRIBUTOR', 'PHARMACY'] },
            orgName: { type: 'string' },
            licenseNumber: { type: 'string' },
            documentUrl: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const applySchema = z.object({
        publicKey: z.string().startsWith('G').length(56),
        role: z.enum(['MANUFACTURER', 'DISTRIBUTOR', 'PHARMACY']),
        orgName: z.string().min(2),
        licenseNumber: z.string().min(2),
        documentUrl: z.string().optional(),
      });

      const parseResult = applySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
      }

      const { publicKey, role, orgName, licenseNumber, documentUrl } = parseResult.data;

      // Check existing application
      const existing = await prisma.participantApplication.findFirst({
        where: { applicantAddress: publicKey, status: ParticipantStatus.PENDING },
      });

      if (existing) {
        return reply.status(409).send({
          error: 'Application already pending review for this public key',
        });
      }

      const application = await prisma.participantApplication.create({
        data: {
          applicantAddress: publicKey,
          organizationName: orgName,
          role: role as UserRole,
          licenseNumber,
          licenseDocUrl: documentUrl || '',
          metadataHash: '0x00',
          status: ParticipantStatus.PENDING,
        },
      });

      return reply.status(201).send({
        message: 'Application submitted successfully',
        application,
      });
    }
  );

  // GET /api/v1/onboarding/queue - Regulator only
  fastify.get(
    '/queue',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'List pending participant applications for regulatory review',
        tags: ['Onboarding'],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', default: 'PENDING' },
          },
        },
      },
    },
    async (request, reply) => {
      const { status = 'PENDING' } = request.query as { status?: string };

      const applications = await prisma.participantApplication.findMany({
        where: status ? { status: status as ParticipantStatus } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ applications });
    }
  );

  // POST /api/v1/onboarding/:id/approve - Regulator only
  fastify.post(
    '/:id/approve',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'Approve participant and register on Soroban smart contract',
        tags: ['Onboarding'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const app = await prisma.participantApplication.findUnique({
        where: { id },
      });

      if (!app) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      if (app.status !== ParticipantStatus.PENDING) {
        return reply.status(400).send({ error: `Application already ${app.status}` });
      }

      try {
        // Register participant on Soroban smart contract
        const txHash = await StellarService.registerParticipant(
          app.applicantAddress,
          app.role,
        );

        // Update application
        const updated = await prisma.participantApplication.update({
          where: { id },
          data: {
            status: ParticipantStatus.APPROVED,
            reviewedBy: request.user?.publicKey || request.user?.stellarAddress || 'REGULATOR',
            onChainTxHash: txHash,
          },
        });

        // Upsert User
        await prisma.user.upsert({
          where: { stellarAddress: app.applicantAddress },
          update: {
            role: app.role,
            active: true,
          },
          create: {
            stellarAddress: app.applicantAddress,
            role: app.role,
            active: true,
          },
        });

        return reply.send({
          message: 'Participant approved and registered on-chain',
          txHash,
          application: updated,
        });
      } catch (err: any) {
        return reply.status(500).send({
          error: 'Failed to register participant on-chain',
          message: err.message,
        });
      }
    }
  );

  // POST /api/v1/onboarding/:id/reject - Regulator only
  fastify.post(
    '/:id/reject',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'Reject participant licensing application',
        tags: ['Onboarding'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const app = await prisma.participantApplication.findUnique({
        where: { id },
      });

      if (!app) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const updated = await prisma.participantApplication.update({
        where: { id },
        data: {
          status: ParticipantStatus.REJECTED,
          rejectionReason: reason,
          reviewedBy: request.user?.publicKey || request.user?.stellarAddress || 'REGULATOR',
        },
      });

      return reply.send({
        message: 'Application rejected',
        application: updated,
      });
    }
  );
}
// Regulator review queue and on-chain contract approval handlers
