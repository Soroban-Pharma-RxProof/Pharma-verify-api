import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SEP10Service } from '../services/sep10.service.js';

export async function authRoutes(fastify: FastifyInstance) {
  // GET /api/v1/auth/challenge
  fastify.get(
    '/challenge',
    {
      schema: {
        summary: 'Request SEP-10 challenge transaction',
        tags: ['Authentication'],
        querystring: {
          type: 'object',
          required: ['account'],
          properties: {
            account: { type: 'string', description: 'Stellar G... public key' },
          },
        },
      },
    },
    async (request, reply) => {
      const querySchema = z.object({
        account: z.string().startsWith('G').length(56),
      });

      const parseResult = querySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid Stellar public key',
          details: parseResult.error.errors,
        });
      }

      const challenge = await SEP10Service.buildChallengeTx(parseResult.data.account);
      return reply.send(challenge);
    }
  );

  // POST /api/v1/auth/token
  fastify.post(
    '/token',
    {
      schema: {
        summary: 'Submit signed SEP-10 challenge to receive JWT token',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['transaction'],
          properties: {
            transaction: { type: 'string', description: 'Base64 encoded signed challenge transaction' },
          },
        },
      },
    },
    async (request, reply) => {
      const bodySchema = z.object({
        transaction: z.string().min(10),
      });

      const parseResult = bodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      try {
        const result = await SEP10Service.authenticateChallenge(parseResult.data.transaction);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: err.message,
        });
      }
    }
  );
}
