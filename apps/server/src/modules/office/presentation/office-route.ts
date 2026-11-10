import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionFrom } from '../../auth/presentation/auth-route';
import { getOfficeSnapshots, subscribeOffice } from '../application/office-event-service';

type RawResponse = FastifyRequest['raw'] & { statusCode: number; setHeader(name: string, value: string): void; write(chunk: string): boolean; end(): void; flushHeaders?: () => void };

function writeEvent(response: RawResponse, event: unknown) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerOfficeRoutes(app: FastifyInstance) {
  app.get('/api/office/snapshot', async (req, reply) => {
    const session = sessionFrom(req);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    return { snapshots: await getOfficeSnapshots(session.userId) };
  });

  app.get('/api/office/events', async (req, reply) => {
    const session = sessionFrom(req);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });

    const response = reply.raw as unknown as RawResponse;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    const ownerId = session.userId;
    const unsubscribe = subscribeOffice(ownerId, (event) => writeEvent(response, event));
    response.write(': connected\n\n');
    const heartbeat = setInterval(() => {
      if (sessionFrom(req)?.userId !== ownerId) {
        clearInterval(heartbeat);
        unsubscribe();
        response.end();
        return;
      }
      response.write(': heartbeat\n\n');
    }, 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    return reply.hijack();
  });
}
