import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Fastify Application Endpoints & Input Validation', () => {
  it('GET /health returns 200 OK with service name and uptime status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('pharma-verify-api');
    await app.close();
  });

  it('GET /api/v1/auth/challenge rejects invalid stellar account format', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/challenge?account=invalid_key',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Invalid Stellar public key');
    await app.close();
  });

  it('GET /api/v1/public/verify rejects requests missing both serial and serialHash', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/public/verify?batchId=BATCH-123',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Either serial or serialHash must be provided');
    await app.close();
  });

  it('POST /api/v1/public/report rejects payloads missing reason field', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/public/report',
      headers: { 'Content-Type': 'application/json' },
      payload: {
        batchId: 'BATCH-TEST',
        // missing reason
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
