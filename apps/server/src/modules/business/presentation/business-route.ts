import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DuplicateClientNameError, createCategory, createClient, deleteClient, getClient, getProfile, listCategories, listClients, saveProfile, updateClient } from '../application/business-service';

type UserRequest = FastifyRequest & { userId?: string };
function owner(req: FastifyRequest) { return (req as UserRequest).userId; }
function body(req: FastifyRequest) { return (req.body as unknown) ?? {}; }

export function registerBusinessRoutes(app: FastifyInstance) {
  app.get('/api/business/profile', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    return { profile: await getProfile(userId) };
  });
  app.put('/api/business/profile', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return { profile: await saveProfile(userId, body(req)) }; } catch { return reply.code(422).send({ error: 'Invalid business profile' }); }
  });
  app.get('/api/business/categories', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    return { categories: await listCategories(userId) };
  });
  app.post('/api/business/categories', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return reply.code(201).send({ category: createCategory(userId, body(req)) }); } catch { return reply.code(422).send({ error: 'Invalid category' }); }
  });
  app.get('/api/clients', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const query = req.query as { search?: string };
    return { clients: await listClients(userId, query.search) };
  });
  app.post('/api/clients', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return reply.code(201).send({ client: await createClient(userId, body(req)) }); } catch (error) { if (error instanceof DuplicateClientNameError) return reply.code(409).send({ error: error.message }); if (error instanceof ZodError || (error instanceof Error && error.message === 'Nomor WhatsApp Indonesia tidak valid')) return reply.code(422).send({ error: 'Nama, nomor WhatsApp, email, atau alamat tidak valid.' }); throw error; }
  });
  app.get('/api/clients/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    const client = await getClient(userId, id);
    return client ? { client } : reply.code(404).send({ error: 'Client not found' });
  });
  app.put('/api/clients/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try { const client = await updateClient(userId, id, body(req)); return client ? { client } : reply.code(404).send({ error: 'Client not found' }); } catch (error) { if (error instanceof DuplicateClientNameError) return reply.code(409).send({ error: error.message }); if (error instanceof ZodError || (error instanceof Error && error.message === 'Nomor WhatsApp Indonesia tidak valid')) return reply.code(422).send({ error: 'Nama, nomor WhatsApp, email, atau alamat tidak valid.' }); throw error; }
  });
  app.delete('/api/clients/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try {
      return (await deleteClient(userId, id)) ? { ok: true } : reply.code(404).send({ error: 'Client not found' });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Client is referenced by invoices') {
        return reply.code(409).send({ error: 'Cannot delete client referenced by invoices' });
      }
      throw err;
    }
  });
}
