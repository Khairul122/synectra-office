import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';
import { createPayment, getInvoicePaymentDetails, getPaymentSummary, listPaymentAuditForTests, resetPaymentDataForTests, reversePayment, verifyPayment } from '../src/modules/payment/application/payment-service';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests } from '../src/modules/auth/application/auth-service';

test('tracks verified payments and reversal in integer rupiah', async () => {
  resetPaymentDataForTests(); resetInvoiceDataForTests();
  const invoice = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Service', quantity: 1, unitPrice: 100000 }] });
  const payment = await createPayment('owner-a', invoice.id, { amount: 50000, method: 'transfer', reference: 'TRX-1' });
  assert.equal((await getPaymentSummary('owner-a', invoice.id)).verified, 0);
  await verifyPayment('owner-a', payment.id);
  assert.deepEqual(await getPaymentSummary('owner-a', invoice.id), { verified: 50000, remaining: 50000, overpaid: 0 });
  assert.equal((await getInvoicePaymentDetails('owner-a', invoice.id)).payments[0]?.status, 'verified');
  await assert.rejects(() => getInvoicePaymentDetails('owner-b', invoice.id), /Invoice not found/);
  const reversal = await reversePayment('owner-a', payment.id, 'Duplicate transfer');
  assert.equal(reversal.status, 'reversed');
  assert.deepEqual(await getPaymentSummary('owner-a', invoice.id), { verified: 0, remaining: 100000, overpaid: 0 });
  assert.deepEqual(listPaymentAuditForTests('owner-a').map((event) => event.action), ['payment.created', 'payment.verified', 'payment.reversed']);
});

test('concurrent verification records one logical verification event', async () => {
  resetPaymentDataForTests(); resetInvoiceDataForTests();
  const invoice = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Service', quantity: 1, unitPrice: 100000 }] });
  const payment = await createPayment('owner-a', invoice.id, { amount: 50000, method: 'transfer', reference: 'TRX-CONCURRENT' });
  await Promise.all([verifyPayment('owner-a', payment.id), verifyPayment('owner-a', payment.id)]);
  assert.deepEqual(await getPaymentSummary('owner-a', invoice.id), { verified: 50000, remaining: 50000, overpaid: 0 });
  assert.equal(listPaymentAuditForTests('owner-a').filter((event) => event.action === 'payment.verified').length, 1);
});

test('rejects invalid reversal and isolates payment ownership', async () => {
  resetPaymentDataForTests(); resetInvoiceDataForTests();
  const invoice = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Service', quantity: 1, unitPrice: 100000 }] });
  const payment = await createPayment('owner-a', invoice.id, { amount: 150000, method: 'cash', reference: 'CASH-1' });
  await assert.rejects(() => reversePayment('owner-a', payment.id, '  '), /Reversal reason required/);
  await assert.rejects(() => verifyPayment('owner-b', payment.id), /Payment not found/);
  await verifyPayment('owner-a', payment.id);
  await verifyPayment('owner-a', payment.id);
  assert.deepEqual(await getPaymentSummary('owner-a', invoice.id), { verified: 150000, remaining: 0, overpaid: 50000 });
  assert.equal(listPaymentAuditForTests('owner-a').filter((event) => event.action === 'payment.verified').length, 1);
});

test('payment API lists only the selected owner invoice and reflects verification', async () => {
  resetPaymentDataForTests(); resetInvoiceDataForTests();
  const invoice = await createInvoice('payment-api-owner', { clientId: 'client-1', items: [{ description: 'Jasa', quantity: 1, unitPrice: 1300000 }] });
  const session = createSessionForTests('payment-api-owner');
  const other = createSessionForTests('payment-api-other');
  const app = buildApp();
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken };
  const created = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/payments`, headers, payload: { amount: 650000, method: 'transfer', reference: 'DP' } });
  assert.equal(created.statusCode, 201);
  const verified = await app.inject({ method: 'POST', url: `/api/payments/${created.json().payment.id}/verify`, headers });
  assert.equal(verified.statusCode, 200);
  const result = await app.inject({ method: 'GET', url: `/api/invoices/${invoice.id}/payments`, headers });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().payments[0].status, 'verified');
  assert.deepEqual(result.json().summary, { verified: 650000, remaining: 650000, overpaid: 0 });
  const forbidden = await app.inject({ method: 'GET', url: `/api/invoices/${invoice.id}/payments`, headers: { cookie: `synectra_session=${other.token}` } });
  assert.equal(forbidden.statusCode, 404);
  await app.close();
});

test('automatic invoices and payment changes stay owner-scoped, idempotent and auditable', async () => {
  const { createClient, resetBusinessDataForTests } = await import('../src/modules/business/application/business-service');
  resetPaymentDataForTests(); resetInvoiceDataForTests(); resetBusinessDataForTests();
  const owner = 'finance-owner';
  const client = await createClient(owner, { name: 'Klien', phone: '081234567890' });
  const session = createSessionForTests(owner); const other = createSessionForTests('finance-other');
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken };
  const app = buildApp();
  const invoiceInput = { clientId: client.id, items: [{ description: 'Proyek A', quantity: 1, unitPrice: 1000000 }] };
  const draft = await createInvoice(owner, invoiceInput);
  const draftPayment = await app.inject({ method: 'POST', url: `/api/invoices/${draft.id}/payments`, headers: { ...headers, 'idempotency-key': 'draft-payment' }, payload: { amount: 100000, method: 'cash', reference: 'DP', kind: 'dp', confirmed: true } });
  assert.equal(draftPayment.statusCode, 422);
  const createInvoiceRequest = () => app.inject({ method: 'POST', url: '/api/invoices/automatic', headers: { ...headers, 'idempotency-key': 'invoice-a' }, payload: invoiceInput });
  const [first, duplicate] = await Promise.all([createInvoiceRequest(), createInvoiceRequest()]);
  assert.equal(first.statusCode, 201); assert.equal(duplicate.statusCode, 201);
  const invoice = first.json().invoice; assert.equal(duplicate.json().invoice.id, invoice.id); assert.equal(invoice.status, 'issued');
  const conflict = await app.inject({ method: 'POST', url: '/api/invoices/automatic', headers: { ...headers, 'idempotency-key': 'invoice-a' }, payload: { ...invoiceInput, items: [{ description: 'Berbeda', quantity: 1, unitPrice: 1000000 }] } });
  assert.equal(conflict.statusCode, 409);
  const second = await app.inject({ method: 'POST', url: '/api/invoices/automatic', headers: { ...headers, 'idempotency-key': 'invoice-b' }, payload: invoiceInput });
  assert.notEqual(second.json().invoice.number, invoice.number);
  const forbiddenInvoice = await app.inject({ method: 'POST', url: '/api/invoices/automatic', headers: { cookie: `synectra_session=${other.token}`, 'x-csrf-token': other.session.csrfToken, 'idempotency-key': 'other' }, payload: invoiceInput });
  assert.equal(forbiddenInvoice.statusCode, 422);
  const paymentInput = { kind: 'dp', amount: 300000, method: 'transfer', reference: 'DP', paymentDate: '2026-11-09', confirmed: true };
  const paymentHeaders = { ...headers, 'idempotency-key': 'payment-a' };
  const sendPayment = () => app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/payments`, headers: paymentHeaders, payload: paymentInput });
  const [created, repeated] = await Promise.all([sendPayment(), sendPayment()]);
  assert.equal(created.statusCode, 201); const payment = created.json().payment;
  assert.equal(repeated.json().payment.id, payment.id); assert.equal(payment.status, 'verified');
  assert.equal((await getPaymentSummary(owner, invoice.id)).remaining, 700000);
  const update = await app.inject({ method: 'PUT', url: `/api/payments/${payment.id}`, headers, payload: { ...paymentInput, kind: 'termin_1', amount: 400000, version: payment.version } });
  assert.equal(update.statusCode, 200); assert.equal(update.json().payment.kind, 'termin_1');
  assert.equal((await getPaymentSummary(owner, invoice.id)).remaining, 600000);
  for (const [kind, amount] of [['termin_2', 200000], ['settlement', 400000]] as const) {
    const added = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/payments`, headers: { ...headers, 'idempotency-key': kind }, payload: { ...paymentInput, kind, amount } });
    assert.equal(added.statusCode, 201);
  }
  assert.equal((await getPaymentSummary(owner, invoice.id)).remaining, 0);
  const stale = await app.inject({ method: 'DELETE', url: `/api/payments/${payment.id}`, headers, payload: { version: payment.version } });
  assert.equal(stale.statusCode, 409);
  const foreign = await app.inject({ method: 'PUT', url: `/api/payments/${payment.id}`, headers: { cookie: `synectra_session=${other.token}`, 'x-csrf-token': other.session.csrfToken }, payload: { ...paymentInput, version: 2 } });
  assert.equal(foreign.statusCode, 422);
  const removed = await app.inject({ method: 'DELETE', url: `/api/payments/${payment.id}`, headers, payload: { version: update.json().payment.version } });
  assert.equal(removed.statusCode, 200); assert.equal(removed.json().payment.status, 'reversed');
  assert.equal((await getPaymentSummary(owner, invoice.id)).remaining, 400000);
  assert.deepEqual(listPaymentAuditForTests(owner).map(event => event.action), ['payment.created', 'payment.updated', 'payment.created', 'payment.created', 'payment.reversed']);
  await app.close();
});
