import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  applyDeliveryReceipt,
  claimDelivery,
  createApprovalAndEnqueue,
  getApproval,
  getDelivery,
  listDeliveries,
  listDeliveryAttempts,
  listDeliveryAttemptsForTests,
  recordManualAttempt,
  recoverExpiredLease
} from '../application/delivery-service';
import type { WhatsappService } from '../../whatsapp/application/whatsapp-service';
import { DeliverySendError, sendPreparedDelivery } from '../application/send-prepared-delivery';
import { publishBusinessEvent } from '../../office/application/office-event-service';
import { deliveryReceiptSchema } from '@synectra/contracts';
import {
  findPdfAssetByHash,
  readPdf
} from '../../invoice/application/pdf-service';

type UserRequest = FastifyRequest & { userId?: string };
function owner(req: FastifyRequest) {
  return (req as UserRequest).userId;
}
function body(req: FastifyRequest) {
  return (req.body as Record<string, unknown> | undefined) ?? {};
}

export function registerDeliveryRoutes(app: FastifyInstance, whatsappService?: WhatsappService) {
  app.post('/api/deliveries/approvals', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const b = body(req);
      const result = await createApprovalAndEnqueue(userId, {
        notaId: String(b.notaId ?? ''),
        revision: String(b.revision ?? ''),
        recipient: String(b.recipient ?? ''),
        pdfHash: String(b.pdfHash ?? ''),
        caption: String(b.caption ?? ''),
        validUntil: String(b.validUntil ?? ''),
        scheduleAt: String(b.scheduleAt ?? '')
      });
      return reply.code(201).send(result);
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error ? error.message : 'Invalid approval input' });
    }
  });

  app.post('/api/deliveries/receipt', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const parsed = deliveryReceiptSchema.parse(req.body);
      const result = await applyDeliveryReceipt(parsed, userId);
      return reply.code(result.success ? 200 : 422).send(result);
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error ? error.message : 'Invalid receipt payload' });
    }
  });

  app.get('/api/deliveries', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const items = await listDeliveries(userId);
    return { deliveries: items };
  });

  app.get('/api/deliveries/:id', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const delivery = await getDelivery(userId, id);
    if (!delivery) return reply.code(404).send({ error: 'Delivery not found' });

    const approval = await getApproval(userId, delivery.approvalId);
    const attempts = listDeliveryAttempts(id);

    return { delivery, approval, attempts };
  });

  app.get('/api/deliveries/:id/pdf', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const delivery = await getDelivery(userId, (req.params as { id: string }).id);
    const approval = delivery && await getApproval(userId, delivery.approvalId);
    const asset = approval && await findPdfAssetByHash(userId, approval.notaId, approval.pdfHash);
    if (!asset) return reply.code(404).send({ error: 'PDF file asset not found for invoice' });
    try { return reply.type('application/pdf').send(await readPdf(userId, asset)); }
    catch { return reply.code(409).send({ error: 'PDF unavailable' }); }
  });

  app.post('/api/deliveries/:id/claim', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const b = body(req);
    const leaseDurationMs = typeof b.leaseDurationMs === 'number' ? b.leaseDurationMs : undefined;

    const claimed = await claimDelivery(userId, id, leaseDurationMs);
    if (!claimed) {
      return reply.code(409).send({ error: 'Delivery not eligible for claim or lease currently held' });
    }
    return claimed;
  });

  app.post('/api/deliveries/:id/send', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const current = await getDelivery(userId, id);
    if (!current) return reply.code(404).send({ error: 'Delivery not found' });

    const approval = await getApproval(userId, current.approvalId);
    if (!approval) return reply.code(404).send({ error: 'Delivery approval not found' });

    if (!whatsappService) {
      return reply.code(503).send({ error: 'WhatsApp service not configured' });
    }

    let result: Awaited<ReturnType<typeof sendPreparedDelivery>>;
    try { result = await sendPreparedDelivery(userId, id, whatsappService); }
    catch (error) { return reply.code(error instanceof DeliverySendError ? error.statusCode : 500).send({ error: error instanceof Error ? error.message : 'Pengiriman gagal' }); }
    if (result.status === 'duplicate') return reply.code(409).send({ error: 'Nota dengan pembayaran ini sudah dikirim. Pengiriman ganda dicegah.' });
    if (result.status === 'review') return reply.code(409).send({ error: 'Status pengiriman sebelumnya belum pasti. Periksa WhatsApp sebelum mengirim ulang.' });
    const updatedDelivery = result.delivery;

    if (updatedDelivery.status === 'submitted') {
      publishBusinessEvent({ type: 'delivery_sent', ownerId: userId, deliveryId: id, recipient: approval.recipient, status: { workState: 'working', heartbeatAt: Date.now(), activity: 'Nota terkirim via WhatsApp' } }).catch(() => undefined);
    } else {
      publishBusinessEvent({ type: 'delivery_failed', ownerId: userId, deliveryId: id, recipient: approval.recipient, error: 'WhatsApp delivery failed', status: { workState: 'working', heartbeatAt: Date.now(), activity: 'Pengiriman nota gagal' } }).catch(() => undefined);
    }

    return {
      delivery: updatedDelivery,
      attempts: listDeliveryAttempts(id)
    };
  });

  app.post('/api/deliveries/:id/manual-attempt', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const b = body(req);
    const result = b.result as 'sent' | 'failed' | 'unknown';
    if (!['sent', 'failed', 'unknown'].includes(result)) {
      return reply.code(422).send({ error: 'Invalid attempt result' });
    }

    try {
      const outcome = await recordManualAttempt(
        userId,
        id,
        result,
        typeof b.notes === 'string' ? b.notes : undefined
      );
      return {
        delivery: outcome.delivery,
        attempt: outcome.attempt,
        attempts: listDeliveryAttempts(id)
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'Failed to record manual attempt' });
    }
  });

  app.post('/api/deliveries/:id/recover', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const recovered = await recoverExpiredLease(userId, id);
    if (!recovered) {
      return reply.code(409).send({ error: 'No expired lease to recover' });
    }
    return { delivery: recovered };
  });
}
