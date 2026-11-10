import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  deliveryReceiptResponseSchema,
  deliveryReceiptSchema,
  whatsappPairStatusSchema,
  whatsappSendPdfResponseSchema
} from '@synectra/contracts';
import type { WhatsappService } from '../application/whatsapp-service';
import { constantTimeEqual } from '../../auth/application/auth-service';
import { sessionFrom } from '../../auth/presentation/auth-route';
import { applyDeliveryReceipt } from '../../deliveries/application/delivery-service';

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3000']);

function assertOwnerRequest(req: FastifyRequest, ownerKey: string) {
  const origin = req.headers.origin;
  if (origin) {
    if (!allowedOrigins.has(origin)) throw new Error('Forbidden origin');
    const session = sessionFrom(req);
    if (!session) throw new Error('Unauthorized');
    if (req.method !== 'GET' && !constantTimeEqual(req.headers['x-csrf-token'] as string | undefined, session.csrfToken)) {
      throw new Error('Invalid CSRF token');
    }
    return;
  }
  if (req.method === 'GET' && sessionFrom(req)) {
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') throw new Error('Forbidden origin');
    return;
  }
  if (!constantTimeEqual(req.headers['x-whatsapp-owner-key'] as string | undefined, ownerKey)) {
    throw new Error('Unauthorized');
  }
}

export function registerWhatsappRoutes(app: FastifyInstance, whatsappService: WhatsappService, ownerKey: string) {
  app.get('/whatsapp/pair-status', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      return reply.code(message === 'Forbidden origin' ? 403 : message === 'Invalid CSRF token' ? 403 : 401).send({ error: message });
    }
    return whatsappPairStatusSchema.parse(whatsappService.getPairStatus());
  });

  app.post('/whatsapp/pair', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      return reply.code(message === 'Forbidden origin' ? 403 : message === 'Invalid CSRF token' ? 403 : 401).send({ error: message });
    }
    return whatsappPairStatusSchema.parse(whatsappService.startPairing());
  });

  app.post('/whatsapp/disconnect', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      return reply.code(message === 'Forbidden origin' ? 403 : message === 'Invalid CSRF token' ? 403 : 401).send({ error: message });
    }
    return whatsappPairStatusSchema.parse(whatsappService.disconnect());
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
      if (error instanceof Error && (error.message === 'Forbidden origin' || error.message === 'Invalid CSRF token')) {
        return reply.code(403).send({ error: error.message });
      }
      return reply.code(502).send({ success: false, deliveryStatus: 'unknown', error: 'WhatsApp send outcome unknown' });
    }
  });

  app.post('/whatsapp/receipt', async (req, reply) => {
    try {
      assertOwnerRequest(req, ownerKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      return reply.code(message === 'Forbidden origin' ? 403 : message === 'Invalid CSRF token' ? 403 : 401).send({ error: message });
    }

    try {
      const parsed = deliveryReceiptSchema.parse(req.body);
      const result = await applyDeliveryReceipt(parsed);
      return reply.code(result.success ? 200 : 422).send(deliveryReceiptResponseSchema.parse(result));
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error ? error.message : 'Invalid receipt payload' });
    }
  });
}
