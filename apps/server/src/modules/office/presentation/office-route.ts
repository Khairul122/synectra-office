import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionFrom } from '../../auth/presentation/auth-route';
import { getOfficeSnapshots, subscribeOffice } from '../application/office-event-service';
import { getStaffSnapshot, subscribeStaffActivity } from '../application/staff-activity';

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

  app.get('/api/office/staff', async (req, reply) => {
    const session = sessionFrom(req);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    return getStaffSnapshot(session.userId);
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
    const unsubscribeStaff = subscribeStaffActivity(ownerId, snapshot => response.write(`event: staff\ndata: ${JSON.stringify(snapshot)}\n\n`));
    response.write(`: connected\n\nevent: staff\ndata: ${JSON.stringify(getStaffSnapshot(ownerId))}\n\n`);
    const heartbeat = setInterval(() => {
      if (sessionFrom(req)?.userId !== ownerId) {
        clearInterval(heartbeat);
        unsubscribe();
        unsubscribeStaff();
        response.end();
        return;
      }
      response.write(`event: heartbeat\ndata: ${JSON.stringify({ heartbeatAt: Date.now() })}\n\n`);
    }, 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeStaff();
    });

    return reply.hijack();
  });
}
