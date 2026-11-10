import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, resetBusinessDataForTests } from '../src/modules/business/application/business-service';
import { createInvoice, issueInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';
import { createSignature, resetSignatureDataForTests } from '../src/modules/invoice/application/signature-service';
import { createPayment, resetPaymentDataForTests, updatePayment } from '../src/modules/payment/application/payment-service';
import { listReceiptJobs, resetReceiptJobsForTests, retryReceiptJob, claimReceiptJob } from '../src/modules/deliveries/application/receipt-jobs';
import { createReceiptWorker } from '../src/modules/deliveries/application/receipt-worker';
import { resetDeliveryDataForTests } from '../src/modules/deliveries/application/delivery-service';
import type { WhatsappService } from '../src/modules/whatsapp/application/whatsapp-service';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('confirmed payment queues exactly one PDF, waits for WhatsApp, and never repeats an uncertain send', async () => {
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetPaymentDataForTests(); resetSignatureDataForTests(); resetReceiptJobsForTests(); resetDeliveryDataForTests();
  const owner = 'receipt-test-owner';
  const client = await createClient(owner, { name: 'Klien uji', phone: '081234567890' });
  await createSignature(owner, png);
  const draft = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Proyek uji', quantity: 1, unitPrice: 1000000 }] });
  const invoice = await issueInvoice(owner, draft.id, draft.version);
  const input = { amount: 300000, method: 'transfer', reference: 'DP', kind: 'dp' };
  const [first, duplicate] = await Promise.all([createPayment(owner, invoice.id, input, true, 'same-payment'), createPayment(owner, invoice.id, input, true, 'same-payment')]);
  assert.equal(first.id, duplicate.id);
  assert.equal((await listReceiptJobs(owner)).length, 1);
  assert.equal((await listReceiptJobs('other-owner')).length, 0);
  let connected = false; let uncertain = false; let calls = 0;
  const whatsapp = {
    getPairStatus: () => ({ status: connected ? 'connected' : 'unpaired' }),
    sendPdf: async (phone: string, data: Buffer) => {
      calls++; assert.equal(phone, client.phone); assert.equal(data.subarray(0, 4).toString(), '%PDF');
      return uncertain ? { success: false, deliveryStatus: 'unknown', error: 'timeout' } : { success: true, deliveryStatus: 'sent', messageId: 'fake-message' };
    }
  } as unknown as WhatsappService;
  const worker = createReceiptWorker(whatsapp);
  await worker.runOnce(); assert.equal(calls, 0); assert.equal((await listReceiptJobs(owner))[0]?.status, 'queued');
  connected = true; await Promise.all([worker.runOnce(), worker.runOnce()]);
  assert.equal(calls, 1); assert.equal((await listReceiptJobs(owner))[0]?.status, 'submitted');
  await worker.runOnce(); assert.equal(calls, 1);
  uncertain = true;
  const second = await createPayment(owner, invoice.id, { ...input, kind: 'termin_1' }, true, 'second-payment');
  await worker.runOnce(); assert.equal(calls, 2);
  assert.equal((await listReceiptJobs(owner)).find(job => job.paymentId === second.id)?.status, 'review');
  assert.equal(await retryReceiptJob(owner, second.id), false);
  await worker.runOnce(); assert.equal(calls, 2);
  const third = await createPayment(owner, invoice.id, { ...input, kind: 'termin_2' }, true, 'third-payment');
  await updatePayment(owner, third.id, third.version, { ...input, amount: 200000, kind: 'termin_2' });
  await worker.runOnce(); assert.equal(calls, 2);
  assert.equal((await listReceiptJobs(owner)).find(job => job.paymentId === third.id)?.status, 'failed');
});

test('expired processing lease requires review and cannot be resent automatically', async () => {
  resetReceiptJobsForTests();
  const owner = 'receipt-crash-owner';
  const { saveMemoryReceiptJob, newReceiptJob } = await import('../src/modules/deliveries/application/receipt-jobs');
  saveMemoryReceiptJob(owner, newReceiptJob('payment-1', 'invoice-1', '2026-01-01T00:00:00.000Z'));
  assert.ok(await claimReceiptJob(owner, 'payment-1', new Date('2026-01-01T00:00:00.000Z')));
  assert.equal(await claimReceiptJob(owner, 'payment-1', new Date('2026-01-01T00:03:00.000Z')), null);
  assert.equal((await listReceiptJobs(owner))[0]?.status, 'review');
  assert.equal(await retryReceiptJob(owner, 'payment-1'), false);
});

test('existing payments can be queued once by their owner without sending during the request', async () => {
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetPaymentDataForTests(); resetReceiptJobsForTests();
  const { verifyPayment } = await import('../src/modules/payment/application/payment-service');
  const { createSessionForTests } = await import('../src/modules/auth/application/auth-service');
  const { buildApp } = await import('../src/bootstrap/app');
  const owner = 'receipt-api-owner'; const client = await createClient(owner, { name: 'Uji', phone: '081234567890' });
  const draft = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Uji', quantity: 1, unitPrice: 100000 }] });
  const invoice = await issueInvoice(owner, draft.id, draft.version);
  const pending = await createPayment(owner, invoice.id, { amount: 10000, method: 'cash', reference: 'Uji' });
  await verifyPayment(owner, pending.id);
  const session = createSessionForTests(owner); const other = createSessionForTests('other-receipt-owner');
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken };
  const app = buildApp();
  const path = `/api/payment-receipts/${pending.id}`;
  assert.equal((await app.inject({ method: 'POST', url: path, headers: { cookie: `synectra_session=${other.token}`, 'x-csrf-token': other.session.csrfToken } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: path, headers })).statusCode, 201);
  assert.equal((await app.inject({ method: 'POST', url: path, headers })).statusCode, 409);
  assert.equal((await listReceiptJobs(owner))[0]?.status, 'queued');
  await app.close();
});

test('the same invoice and payment snapshot cannot be sent twice across separate deliveries', async () => {
  const { generateInvoicePdf, resetPdfDataForTests } = await import('../src/modules/invoice/application/pdf-service');
  const { createApprovalAndEnqueue } = await import('../src/modules/deliveries/application/delivery-service');
  const { sendPreparedDelivery } = await import('../src/modules/deliveries/application/send-prepared-delivery');
  const { resetInvoiceSendGuardsForTests } = await import('../src/modules/deliveries/application/invoice-send-guard');
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetPaymentDataForTests(); resetSignatureDataForTests(); resetPdfDataForTests(); resetReceiptJobsForTests(); resetDeliveryDataForTests(); resetInvoiceSendGuardsForTests();
  const owner = 'receipt-dedupe-owner'; const client = await createClient(owner, { name: 'Uji', phone: '081234567890' });
  await createSignature(owner, png);
  const draft = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Uji', quantity: 1, unitPrice: 100000 }] });
  const invoice = await issueInvoice(owner, draft.id, draft.version);
  await createPayment(owner, invoice.id, { amount: 10000, method: 'cash', reference: 'DP' }, true, 'first');
  const [pdf1, pdf2] = await Promise.all([generateInvoicePdf(owner, invoice.id), generateInvoicePdf(owner, invoice.id)]);
  const makeApproval = (pdfHash: string, caption: string) => createApprovalAndEnqueue(owner, { notaId: invoice.id, revision: '1', recipient: client.phone, pdfHash, caption, validUntil: new Date(Date.now() + 86400000).toISOString(), scheduleAt: new Date().toISOString() });
  const a = await makeApproval(pdf1.sha256, 'Nota satu'); const b = await makeApproval(pdf2.sha256, 'Nota dua');
  let calls = 0;
  const wa = { sendPdf: async () => { calls++; return { success: true, deliveryStatus: 'sent', messageId: 'test' }; } } as unknown as WhatsappService;
  await Promise.all([sendPreparedDelivery(owner, a.delivery.id, wa), sendPreparedDelivery(owner, b.delivery.id, wa)]);
  assert.equal(calls, 1);
  const duplicate = await sendPreparedDelivery(owner, b.delivery.id, wa);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(calls, 1);
  await createPayment(owner, invoice.id, { amount: 10000, method: 'cash', reference: 'Termin' }, true, 'second');
  const updated = await generateInvoicePdf(owner, invoice.id); const c = await makeApproval(updated.sha256, 'Nota termin');
  assert.equal((await sendPreparedDelivery(owner, c.delivery.id, wa)).status, 'submitted');
  assert.equal(calls, 2);
});

test('Hermes reports and answers owner-scoped delivery status', async () => {
  const { createMemoryHermesStore, setHermesStore, reportHermesReceipt, executeHermesTurn, getHermesConversationStatus } = await import('../src/modules/hermes/application/hermes-service');
  setHermesStore(createMemoryHermesStore()); resetReceiptJobsForTests();
  const { saveMemoryReceiptJob, newReceiptJob } = await import('../src/modules/deliveries/application/receipt-jobs');
  saveMemoryReceiptJob('hermes-owner', newReceiptJob('p1', 'i1', new Date().toISOString()));
  await reportHermesReceipt('hermes-owner', 'INV-1', 'submitted');
  const turn = await executeHermesTurn({ ownerId: 'hermes-owner', text: 'cek status pengiriman nota' });
  assert.equal(turn.message.tool, 'deliveries.status');
  assert.match(turn.message.text, /1 dalam antrean/);
  const history = await getHermesConversationStatus('hermes-owner');
  assert.ok(history.messages.some(message => message.text.includes('INV-1') && message.text.includes('WhatsApp')));
  const other = await executeHermesTurn({ ownerId: 'another-owner', text: 'cek status pengiriman nota' });
  assert.match(other.message.text, /0 dalam antrean/);
});

test('saving a confirmed payment wakes the receipt worker immediately', async () => {
  const { createSessionForTests } = await import('../src/modules/auth/application/auth-service');
  const { buildApp } = await import('../src/bootstrap/app');
  const { resetInvoiceSendGuardsForTests } = await import('../src/modules/deliveries/application/invoice-send-guard');
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetPaymentDataForTests(); resetSignatureDataForTests(); resetReceiptJobsForTests(); resetDeliveryDataForTests(); resetInvoiceSendGuardsForTests();
  const owner = 'receipt-wakeup-owner'; const client = await createClient(owner, { name: 'Uji', phone: '081234567890' });
  await createSignature(owner, png);
  const draft = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Uji', quantity: 1, unitPrice: 100000 }] });
  const invoice = await issueInvoice(owner, draft.id, draft.version);
  let sent = 0; let cycle: Promise<void> | undefined;
  const whatsapp = { getPairStatus: () => ({ status: 'connected' }), sendPdf: async () => { sent++; return { success: true, deliveryStatus: 'sent', messageId: 'fake' }; } } as unknown as WhatsappService;
  const worker = createReceiptWorker(whatsapp); const session = createSessionForTests(owner);
  const app = buildApp({ onReceiptQueued: () => { cycle = worker.runOnce(); } });
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken, 'idempotency-key': 'payment-once' };
  const payload = { amount: 10000, method: 'cash', reference: 'DP', confirmed: true };
  const result = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/payments`, headers, payload });
  assert.equal(result.statusCode, 201); assert.ok(cycle);
  await cycle; assert.equal(sent, 1);
  assert.equal((await listReceiptJobs(owner))[0]?.status, 'submitted');
  const duplicate = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/payments`, headers, payload });
  assert.equal(duplicate.statusCode, 201); await cycle; assert.equal(sent, 1);
  await app.close();
});

test('a payment saved during an active send is processed without waiting for the timer', async () => {
  const { resetInvoiceSendGuardsForTests } = await import('../src/modules/deliveries/application/invoice-send-guard');
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetPaymentDataForTests(); resetSignatureDataForTests(); resetReceiptJobsForTests(); resetDeliveryDataForTests(); resetInvoiceSendGuardsForTests();
  const owner = 'receipt-busy-owner'; const client = await createClient(owner, { name: 'Uji', phone: '081234567890' });
  await createSignature(owner, png);
  const draft = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Uji', quantity: 1, unitPrice: 100000 }] });
  const invoice = await issueInvoice(owner, draft.id, draft.version);
  let started!: () => void; let release!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let sends = 0;
  const whatsapp = { getPairStatus: () => ({ status: 'connected' }), sendPdf: async () => { sends++; if (sends === 1) { started(); await gate; } return { success: true, deliveryStatus: 'sent', messageId: `fake-${sends}` }; } } as unknown as WhatsappService;
  const worker = createReceiptWorker(whatsapp);
  await createPayment(owner, invoice.id, { amount: 10000, method: 'cash', reference: 'DP' }, true, 'first');
  const running = worker.runOnce(); await firstStarted;
  await createPayment(owner, invoice.id, { amount: 10000, method: 'cash', reference: 'Termin' }, true, 'second');
  const wake = worker.runOnce(); release(); await Promise.all([running, wake]);
  assert.equal(sends, 2);
  assert.deepEqual((await listReceiptJobs(owner)).map(job => job.status), ['submitted', 'submitted']);
});
