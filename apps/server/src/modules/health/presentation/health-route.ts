import type { FastifyInstance } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@synectra/contracts';

export function registerHealthRoute(app: FastifyInstance, getHealth: () => HealthResponse) {
  app.get('/health', async () => healthResponseSchema.parse(getHealth()));
}
