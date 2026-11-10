import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  hermesMessageRequestSchema,
  hermesToolRequestSchema
} from '@synectra/contracts';
import {
  dispatchHermesTool,
  executeHermesTurn,
  getHermesConversationStatus
} from '../application/hermes-service';

type UserRequest = FastifyRequest & { userId?: string };
function owner(req: FastifyRequest) {
  return (req as UserRequest).userId;
}

export function registerHermesRoutes(app: FastifyInstance) {
  app.get('/api/hermes/conversation', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const status = await getHermesConversationStatus(userId);
    return status;
  });

  app.post('/api/hermes/conversation/message', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const parsed = hermesMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'Format pesan Hermes tidak valid' });
    }

    const response = await executeHermesTurn({
      ownerId: userId,
      text: parsed.data.text
    });
    return response;
  });

  app.post('/api/hermes/tools/dispatch', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const parsed = hermesToolRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'Format tool request tidak valid' });
    }

    const result = await dispatchHermesTool({
      actorId: userId,
      ownerId: userId,
      tool: parsed.data.tool,
      input: parsed.data.input
    });

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return { result: result.result };
  });
}
