import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import {
  createInvoice,
  getInvoice,
  issueInvoice,
  listInvoices,
  resetInvoiceDataForTests,
  updateDraftInvoice
} from '../src/modules/invoice/application/invoice-service';

test('calculates integer rupiah totals and issues atomic invoice number', async () => {
  resetInvoiceDataForTests();
  const invoice = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Logo', quantity: 2, unitPrice: 125000 }] });
  assert.equal(invoice.total, 250000);
  const issued = await issueInvoice('owner-a', invoice.id, invoice.version);
  assert.equal(issued.number, 'INV-202611-000001');
  assert.equal(issued.status, 'issued');
  assert.equal((issued.revisions[0].snapshot as { total: number }).total, 250000);
});

test('rejects stale draft update and preserves immutable issued snapshot', async () => {
  resetInvoiceDataForTests();
  const invoice = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Web', quantity: 1, unitPrice: 100000 }] });
  const issued = await issueInvoice('owner-a', invoice.id, invoice.version);
  await assert.rejects(() => updateDraftInvoice('owner-a', invoice.id, invoice.version, { clientId: 'client-1', items: [{ description: 'Changed', quantity: 1, unitPrice: 1 }] }), /Conflict|draft/);
  assert.equal((issued.revisions[0].snapshot as { items: Array<{ description: string }> }).items[0].description, 'Web');
});

test('handles sequential atomic issuing and enforces idempotency key', async () => {
  resetInvoiceDataForTests();
  const inv1 = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Item 1', quantity: 1, unitPrice: 10000 }] });
  const inv2 = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Item 2', quantity: 1, unitPrice: 20000 }] });

  const issued1 = await issueInvoice('owner-a', inv1.id, inv1.version, 'idem-key-1');
  assert.equal(issued1.number, 'INV-202611-000001');

  // Same idempotency key returns exact same issued invoice without advancing sequence
  const reissued1 = await issueInvoice('owner-a', inv1.id, inv1.version, 'idem-key-1');
  assert.equal(reissued1.number, 'INV-202611-000001');

  const issued2 = await issueInvoice('owner-a', inv2.id, inv2.version);
  assert.equal(issued2.number, 'INV-202611-000002');
});

test('isolates invoices strictly between owners', async () => {
  resetInvoiceDataForTests();
  const invoiceA = await createInvoice('owner-a', { clientId: 'client-1', items: [{ description: 'Job A', quantity: 1, unitPrice: 50000 }] });

  assert.equal(await getInvoice('owner-b', invoiceA.id), null);
  assert.equal((await listInvoices('owner-b')).length, 0);
  assert.equal((await listInvoices('owner-a')).length, 1);

  await assert.rejects(() => updateDraftInvoice('owner-b', invoiceA.id, 1, { clientId: 'client-1', items: [{ description: 'Hack', quantity: 1, unitPrice: 1 }] }));
  await assert.rejects(() => issueInvoice('owner-b', invoiceA.id, 1));
});

test('HTTP API routes: create, update draft, issue, and conflict detection', async () => {
  resetInvoiceDataForTests();
  resetSessionsForTests();

  const session = createSessionForTests('owner-a');
  const app = buildApp();
  const headers = {
    cookie: `synectra_session=${session.token}`,
    'x-csrf-token': session.session.csrfToken
  };

  // POST /api/invoices
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/invoices',
    headers,
    payload: { clientId: 'client-x', items: [{ description: 'Design', quantity: 1, unitPrice: 500000 }] }
  });
  assert.equal(createRes.statusCode, 201);
  const created = createRes.json().invoice;
  assert.equal(created.total, 500000);
  assert.equal(created.version, 1);

  // PUT /api/invoices/:id (update draft with matching version)
  const updateRes = await app.inject({
    method: 'PUT',
    url: `/api/invoices/${created.id}`,
    headers: { ...headers, 'if-match-version': '1' },
    payload: { clientId: 'client-x', items: [{ description: 'Design Revision', quantity: 2, unitPrice: 300000 }] }
  });
  assert.equal(updateRes.statusCode, 200);
  const updated = updateRes.json().invoice;
  assert.equal(updated.total, 600000);
  assert.equal(updated.version, 2);

  // PUT /api/invoices/:id with stale version returns 409
  const staleUpdateRes = await app.inject({
    method: 'PUT',
    url: `/api/invoices/${created.id}`,
    headers: { ...headers, 'if-match-version': '1' },
    payload: { clientId: 'client-x', items: [{ description: 'Stale update', quantity: 1, unitPrice: 100000 }] }
  });
  assert.equal(staleUpdateRes.statusCode, 409);

  // POST /api/invoices/:id/issue
  const issueRes = await app.inject({
    method: 'POST',
    url: `/api/invoices/${created.id}/issue`,
    headers: { ...headers, 'if-match-version': '2', 'idempotency-key': 'req-issue-1' }
  });
  assert.equal(issueRes.statusCode, 200);
  const issued = issueRes.json().invoice;
  assert.equal(issued.status, 'issued');
  assert.equal(issued.number, 'INV-202611-000001');

  // Repeated issue with same idempotency-key returns 200 same invoice
  const reIssueRes = await app.inject({
    method: 'POST',
    url: `/api/invoices/${created.id}/issue`,
    headers: { ...headers, 'if-match-version': '2', 'idempotency-key': 'req-issue-1' }
  });
  assert.equal(reIssueRes.statusCode, 200);
  assert.equal(reIssueRes.json().invoice.number, 'INV-202611-000001');

  // Attempting to issue already issued invoice with different key returns 409
  const conflictIssueRes = await app.inject({
    method: 'POST',
    url: `/api/invoices/${created.id}/issue`,
    headers: { ...headers, 'if-match-version': '2', 'idempotency-key': 'req-issue-diff' }
  });
  assert.equal(conflictIssueRes.statusCode, 409);

  await app.close();
});
