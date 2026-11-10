import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFinanceData } from '../src/office3d/finance-data.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('finance data loads all three synchronized collections', async () => {
  const responses = { '/api/clients': { clients: [{ id: 'c' }] }, '/api/invoices': { invoices: [{ id: 'i' }] }, '/api/payments': { payments: [{ id: 'p' }] }, '/api/payment-receipts': { receipts: [{ paymentId: 'p', status: 'queued' }] } };
  const result = await loadFinanceData(async url => json(responses[url]));
  assert.equal(result.clients[0].id, 'c');
  assert.equal(result.invoices[0].id, 'i');
  assert.equal(result.payments[0].id, 'p');
  assert.equal(result.receipts[0].status, 'queued');
});

test('finance data reports expired sessions and server errors instead of empty data', async () => {
  await assert.rejects(loadFinanceData(async url => url === '/api/payments' ? json({}, 401) : json({})), /Sesi server terputus/);
  await assert.rejects(loadFinanceData(async url => url === '/api/invoices' ? json({}, 500) : json({})), /HTTP 500/);
  await assert.rejects(loadFinanceData(async () => { throw new TypeError('Network error'); }), /Network error/);
});
