import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createSignature, getCurrentSignature, readSignature } from '../application/signature-service';
import { findLatestPdfAssetForInvoice, generateInvoicePdf, getPdfAsset, readPdf } from '../application/pdf-service';
type UserRequest = FastifyRequest & { userId?: string };
function owner(req: FastifyRequest) { return (req as UserRequest).userId; }
export function registerPdfRoutes(app: FastifyInstance) {
  app.get('/api/signatures/current', async (req, reply) => {
    const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const signature = await getCurrentSignature(userId);
    if (!signature) return reply.code(404).header('Cache-Control', 'private, no-store').send({ error: 'Signature not found' });
    try { const image = await readSignature(userId, signature); return reply.header('Cache-Control', 'private, no-store').type('image/png').send(image); }
    catch { return reply.code(409).header('Cache-Control', 'private, no-store').send({ error: 'Signature unavailable' }); }
  });
  app.post('/api/signatures', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); try { return reply.code(201).send({ signature: await createSignature(userId, (req.body as { data?: unknown })?.data) }); } catch (error) { return reply.code(422).send({ error: error instanceof Error ? error.message : 'Invalid signature' }); } });
  app.post('/api/invoices/:id/pdf', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); try { return reply.code(201).send({ pdf: await generateInvoicePdf(userId, (req.params as { id: string }).id) }); } catch (error) { return reply.code(422).send({ error: error instanceof Error ? error.message : 'Cannot generate PDF' }); } });
  app.get('/api/invoices/:id/pdf', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const asset = await findLatestPdfAssetForInvoice(userId, (req.params as { id: string }).id);
    if (!asset) return reply.code(404).send({ error: 'PDF not found' });
    try {
      return reply.type('application/pdf').header('Content-Disposition', `inline; filename="invoice-${asset.invoiceId}.pdf"`).send(await readPdf(userId, asset));
    } catch {
      return reply.code(409).send({ error: 'PDF unavailable' });
    }
  });
  app.get('/api/invoice-pdfs/:id', async (req, reply) => { const userId = owner(req); if (!userId) return reply.code(401).send({ error: 'Unauthorized' }); const asset = await getPdfAsset(userId, (req.params as { id: string }).id); if (!asset) return reply.code(404).send({ error: 'PDF not found' }); try { return reply.type('application/pdf').header('Content-Disposition', `inline; filename="invoice-${asset.invoiceId}.pdf"`).send(await readPdf(userId, asset)); } catch { return reply.code(409).send({ error: 'PDF unavailable' }); } });
}
