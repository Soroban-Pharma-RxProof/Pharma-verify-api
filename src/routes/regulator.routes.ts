import { stringify } from 'csv-stringify/sync';
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middlewares/auth.middleware.js';

export async function regulatorRoutes(fastify: FastifyInstance) {
  // GET /api/v1/regulator/anomalies - List anomalies
  fastify.get(
    '/anomalies',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'List detected supply chain anomalies and counterfeit alerts',
        tags: ['Regulator'],
        querystring: {
          type: 'object',
          properties: {
            severity: { type: 'string' },
            rule: { type: 'string' },
            resolved: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { severity, rule, resolved } = request.query as {
        severity?: string;
        rule?: string;
        resolved?: boolean;
      };

      const alerts = await prisma.anomalyAlert.findMany({
        where: {
          ...(severity && { severity }),
          ...(rule && { rule }),
          ...(resolved !== undefined && { resolved: Boolean(resolved) }),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return reply.send({ alerts });
    }
  );

  // POST /api/v1/regulator/anomalies/:id/resolve - Resolve anomaly
  fastify.post(
    '/:id/resolve',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'Mark an anomaly alert as investigated and resolved',
        tags: ['Regulator'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['resolutionNotes'],
          properties: { resolutionNotes: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { resolutionNotes } = request.body as { resolutionNotes: string };

      const alert = await prisma.anomalyAlert.findUnique({
        where: { id },
      });

      if (!alert) {
        return reply.status(404).send({ error: 'Anomaly alert not found' });
      }

      const updated = await prisma.anomalyAlert.update({
        where: { id },
        data: {
          resolved: true,
          details: `${alert.details} | [RESOLVED by ${request.user!.publicKey || request.user!.stellarAddress}]: ${resolutionNotes}`,
        },
      });

      return reply.send({
        message: 'Alert resolved successfully',
        alert: updated,
      });
    }
  );

  // GET /api/v1/regulator/audit-trail/export - Export audit logs as CSV or JSON
  fastify.get(
    '/audit-trail/export',
    {
      preHandler: requireRole('REGULATOR'),
      schema: {
        summary: 'Export regulatory audit trail and custody transitions',
        tags: ['Regulator'],
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
            batchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { format = 'json', batchId } = request.query as {
        format?: string;
        batchId?: string;
      };

      const custodyLogs = await prisma.custodyLog.findMany({
        where: batchId ? { batchId } : undefined,
        orderBy: { timestamp: 'desc' },
      });

      const dispenseLogs = await prisma.dispenseLog.findMany({
        where: batchId ? { batchId } : undefined,
        orderBy: { timestamp: 'desc' },
      });

      const anomalyLogs = await prisma.anomalyAlert.findMany({
        where: batchId ? { batchId } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      if (format === 'csv') {
        const rows = [
          ...custodyLogs.map((c) => ({
            type: 'CUSTODY_TRANSFER',
            batchId: c.batchId,
            actorOrPharmacy: c.toAddress,
            details: `From: ${c.fromAddress} -> To: ${c.toAddress}`,
            txHash: c.txHash,
            timestamp: c.timestamp.toISOString(),
          })),
          ...dispenseLogs.map((d) => ({
            type: 'DISPENSE',
            batchId: d.batchId,
            actorOrPharmacy: d.pharmacyAddress,
            details: `Serial: ${d.serialHash.slice(0, 8)}... (Strip: ${d.stripIndex ?? 'Full'})`,
            txHash: d.txHash,
            timestamp: d.timestamp.toISOString(),
          })),
          ...anomalyLogs.map((a) => ({
            type: `ALERT_${a.rule}`,
            batchId: a.batchId || 'N/A',
            actorOrPharmacy: a.resolved ? 'RESOLVED' : 'OPEN',
            details: a.details,
            txHash: 'N/A',
            timestamp: a.createdAt.toISOString(),
          })),
        ];

        const csvContent = stringify(rows, { header: true });
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="regulatory-audit-trail.csv"');
        return reply.send(csvContent);
      }

      return reply.send({
        custodyLogs,
        dispenseLogs,
        anomalyLogs,
      });
    }
  );
}
