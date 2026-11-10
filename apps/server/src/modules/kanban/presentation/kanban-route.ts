import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getBoardSnapshot,
  createTask,
  transitionTask,
  linkTaskInvoice
} from '../application/kanban-service';

type UserRequest = FastifyRequest & { userId?: string };

function owner(req: FastifyRequest): string | undefined {
  return (req as UserRequest).userId;
}

export function registerKanbanRoutes(app: FastifyInstance): void {
  app.get('/api/kanban', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const snapshot = await getBoardSnapshot(userId);
      return reply.code(200).send(snapshot);
    } catch (err: any) {
      return reply
        .code(err.statusCode || 500)
        .send({ error: err.message || 'Failed to fetch kanban snapshot' });
    }
  });

  app.post('/api/kanban/tasks', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const task = await createTask(userId, req.body as any);
      return reply.code(201).send({ task });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Failed to create task' });
    }
  });

  app.post('/api/kanban/tasks/:id/transition', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try {
      const task = await transitionTask(userId, id, req.body as any);
      return reply.code(200).send({ task });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Failed to transition task' });
    }
  });

  app.post('/api/kanban/links', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const link = await linkTaskInvoice(userId, req.body as any);
      return reply.code(201).send({ link });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Failed to link task invoice' });
    }
  });
}
