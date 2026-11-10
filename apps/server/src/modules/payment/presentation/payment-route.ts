import type { FastifyInstance, FastifyRequest } from 'fastify';
import { enqueueExistingReceipt, listReceiptJobs, retryReceiptJob } from '../../deliveries/application/receipt-jobs';
import { createPayment, getInvoicePaymentDetails, getPaymentSummary, listPayments, reversePayment, updatePayment, verifyPayment } from '../application/payment-service';

type UserRequest = FastifyRequest & { userId?: string };
function owner(req: FastifyRequest) { return (req as UserRequest).userId; }
function body(req: FastifyRequest) { return (req.body as Record<string, unknown> | undefined) ?? {}; }

export function registerPaymentRoutes(app: FastifyInstance, onReceiptQueued?: () => void) {
  const notifyWorker = () => { try { onReceiptQueued?.(); } catch { /* The persisted queue remains available for the next worker cycle. */ } };
  app.get('/api/payment-receipts', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); return { receipts: await listReceiptJobs(userId) }; });
  app.post('/api/payment-receipts/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const payment = (await listPayments(userId)).find(item => item.id === (req.params as { id: string }).id);
    if (!payment || payment.status !== 'verified') return reply.code(404).send({ error: 'Pembayaran terverifikasi tidak ditemukan.' });
    const created = await enqueueExistingReceipt(userId, payment.id, payment.invoiceId, payment.version);
    if (created) notifyWorker();
    return created ? reply.code(201).send({ ok: true }) : reply.code(409).send({ error: 'Nota untuk pembayaran ini sudah pernah dimasukkan ke antrean.' });
  });
  app.post('/api/payment-receipts/:id/retry', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); const payment = (await listPayments(userId)).find(item => item.id === (req.params as { id: string }).id); if (!payment || payment.status !== 'verified') return reply.code(404).send({ error: 'Pembayaran terverifikasi tidak ditemukan.' }); const ok = await retryReceiptJob(userId, payment.id, payment.version); if (ok) notifyWorker(); return ok ? { ok: true } : reply.code(409).send({ error: 'Pengiriman tidak dapat dicoba ulang secara otomatis.' }); });
  app.get('/api/payments', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); return { payments: await listPayments(userId) }; });
  app.get('/api/invoices/:invoiceId/payments', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return await getInvoicePaymentDetails(userId, (req.params as { invoiceId: string }).invoiceId); } catch { return reply.code(404).send({ error: 'Invoice not found' }); }
  });
  app.get('/api/invoices/:invoiceId/payments/summary', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { invoiceId } = req.params as { invoiceId: string };
    try { return { summary: await getPaymentSummary(userId, invoiceId) }; } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : 'Invoice not found' }); }
  });
  app.post('/api/invoices/:invoiceId/payments', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { invoiceId } = req.params as { invoiceId: string };
    const b = body(req); const key = req.headers['idempotency-key'];
    if (b.confirmed === true && (typeof key !== 'string' || !key || key.length > 200)) return reply.code(422).send({ error: 'Idempotency key required' });
    try { const payment = await createPayment(userId, invoiceId, b, b.confirmed === true, typeof key === 'string' ? key : undefined); if (b.confirmed === true) notifyWorker(); return reply.code(201).send({ payment }); } catch (error) { const message = error instanceof Error ? error.message : 'Invalid payment'; return reply.code(message.startsWith('Conflict') ? 409 : 422).send({ error: message }); }
  });
  app.put('/api/payments/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const b = body(req); if (!Number.isSafeInteger(b.version) || Number(b.version) < 1) return reply.code(422).send({ error: 'Invalid payment version' });
    try { return { payment: await updatePayment(userId, (req.params as { id: string }).id, Number(b.version), b) }; } catch (error) { const message = error instanceof Error ? error.message : 'Invalid payment'; return reply.code(message.startsWith('Conflict') ? 409 : 422).send({ error: message }); }
  });
  app.delete('/api/payments/:id', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const b = body(req); if (!Number.isSafeInteger(b.version) || Number(b.version) < 1) return reply.code(422).send({ error: 'Invalid payment version' });
    try { return { payment: await reversePayment(userId, (req.params as { id: string }).id, 'Dihapus oleh pemilik', Number(b.version)) }; } catch (error) { const message = error instanceof Error ? error.message : 'Cannot delete payment'; return reply.code(message.startsWith('Conflict') ? 409 : 422).send({ error: message }); }
  });
  app.post('/api/payments/:id/verify', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return { payment: await verifyPayment(userId, (req.params as { id: string }).id) }; } catch (error) { return reply.code(422).send({ error: error instanceof Error ? error.message : 'Cannot verify payment' }); }
  });
  app.post('/api/payments/:id/reverse', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try { return { payment: await reversePayment(userId, (req.params as { id: string }).id, String(body(req).reason ?? '')) }; } catch (error) { return reply.code(422).send({ error: error instanceof Error ? error.message : 'Cannot reverse payment' }); }
  });
}
