import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  whatsappPairStatusSchema,
  whatsappSendPdfResponseSchema
} from '@synectra/contracts';
import type { WhatsappService } from '../application/whatsapp-service';

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

function assertOwnerRequest(req: FastifyRequest, ownerKey: string) {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    throw new Error('Forbidden origin');
  }
  if (origin && allowedOrigins.has(origin)) return;
  if (req.headers['x-whatsapp-owner-key'] !== ownerKey) {
    throw new Error('Unauthorized');
  }
}

export function registerWhatsappRoutes(app: FastifyInstance, whatsappService: WhatsappService, ownerKey: string) {
  app.get('/whatsapp/pair-status', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return whatsappPairStatusSchema.parse(whatsappService.getPairStatus());
  });

  app.post('/whatsapp/pair', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return whatsappPairStatusSchema.parse(whatsappService.startPairing());
  });

  app.post('/whatsapp/send-synthetic-pdf', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
      const body = (req.body as { phone?: unknown } | null) || {};
      if (body.phone !== undefined && (typeof body.phone !== 'string' || !/^0\d{9,14}$/.test(body.phone))) {
        return reply.code(422).send({ error: 'Invalid phone' });
      }
      const result = await whatsappService.sendSyntheticPdf(body.phone as string | undefined);
      return whatsappSendPdfResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (error instanceof Error && error.message === 'Forbidden origin') {
        return reply.code(403).send({ error: 'Forbidden origin' });
      }
      return reply.code(502).send({ success: false, deliveryStatus: 'unknown', error: 'WhatsApp send outcome unknown' });
    }
  });
}
