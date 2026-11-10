import type { FastifyInstance } from 'fastify';
import {
  healthResponseSchema,
  servicesHealthResponseSchema,
  type HealthResponse,
  type ServicesHealthResponse
} from '@synectra/contracts';

export function registerHealthRoute(
  app: FastifyInstance,
  getHealth: () => HealthResponse,
  getServicesHealth?: () => Promise<ServicesHealthResponse>
) {
  app.get('/health', async () => healthResponseSchema.parse(getHealth()));

  if (getServicesHealth) {
    const handler = async () => {
      const res = await getServicesHealth();
      return servicesHealthResponseSchema.parse(res);
    };

    app.get('/health/services', handler);
    app.get('/api/health/services', handler);
  }
}
