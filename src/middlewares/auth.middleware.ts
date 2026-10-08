import { FastifyReply, FastifyRequest } from 'fastify';
import { SEP10Service, TokenPayload } from '../services/sep10.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = SEP10Service.verifyToken(token);
    request.user = payload;
  } catch (err: any) {
    return reply.status(401).send({ error: 'Invalid or expired token', message: err.message });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (!request.user) return; // already replied 401

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden: Insufficient permissions',
        requiredRoles: allowedRoles,
        currentRole: request.user.role,
      });
    }
  };
}
