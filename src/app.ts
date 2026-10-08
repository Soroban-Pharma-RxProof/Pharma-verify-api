import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { FastifyInstance } from 'fastify';
import { authRoutes } from './routes/auth.routes.js';
import { batchRoutes } from './routes/batch.routes.js';
import { onboardingRoutes } from './routes/onboarding.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { regulatorRoutes } from './routes/regulator.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Security Plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB upload limit
    },
  });

  // OpenAPI / Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Soroban Pharma RxProof API',
        description: 'Enterprise counterfeit medicine verification backend powered by Stellar & Soroban smart contracts',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Local development server',
        },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Healthcheck endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'pharma-verify-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // API Route Groups
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
  await app.register(batchRoutes, { prefix: '/api/v1/batches' });
  await app.register(publicRoutes, { prefix: '/api/v1/public' });
  await app.register(regulatorRoutes, { prefix: '/api/v1/regulator' });

  // Global Error Handler
  app.setErrorHandler((error: any, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
      statusCode,
    });
  });

  return app;
}
// Security plugins: CORS, Helmet, RateLimiter, Multipart, ErrorHandler
