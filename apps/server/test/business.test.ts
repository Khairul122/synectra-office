import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeIndonesianPhone } from '@synectra/contracts';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import {
  createCategory,
  createClient,
  deleteClient,
  getClient,
  getProfile,
  listCategories,
  listClients,
  resetBusinessDataForTests,
  saveProfile,
  updateClient
} from '../src/modules/business/application/business-service';
import { createInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';

test('normalizes Indonesian WhatsApp numbers and rejects invalid', () => {
  assert.equal(normalizeIndonesianPhone('0812 3456 7890'), '6281234567890');
  assert.equal(normalizeIndonesianPhone('+6281234567890'), '6281234567890');
  assert.throws(() => normalizeIndonesianPhone('invalid-phone'), /tidak valid/);
});

test('manages business profile and service categories', async () => {
  resetBusinessDataForTests();
  const profile = await saveProfile('owner-a', {
    businessName: 'Synectra Digital',
    signerName: 'Khair',
    timezone: 'Asia/Jakarta',
    communicationPreference: 'whatsapp'
  });
  assert.equal(profile.businessName, 'Synectra Digital');
  const loaded = await getProfile('owner-a');
  assert.equal(loaded?.businessName, 'Synectra Digital');
  assert.equal(await getProfile('owner-b'), null);

  const category = await createCategory('owner-a', { name: 'Web Dev' });
  assert.equal(category.name, 'Web Dev');
  const categories = await listCategories('owner-a');
  assert.equal(categories.length, 1);
  assert.equal((await listCategories('owner-b')).length, 0);
});

test('CRUD client, search, and owner isolation', async () => {
  resetBusinessDataForTests();
  const clientA = await createClient('owner-a', { name: 'Acme Corp', phone: '081234567890' });
  assert.equal(clientA.phone, '6281234567890');

  const retrieved = await getClient('owner-a', clientA.id);
  assert.equal(retrieved?.name, 'Acme Corp');
  assert.equal(await getClient('owner-b', clientA.id), null);

  const searchHits = await listClients('owner-a', 'acme');
  assert.equal(searchHits.length, 1);
  const searchMiss = await listClients('owner-a', 'nonexistent');
  assert.equal(searchMiss.length, 0);

  const updated = await updateClient('owner-a', clientA.id, { name: 'Acme Global', phone: '081234567890' });
  assert.equal(updated?.name, 'Acme Global');

  const deleted = await deleteClient('owner-a', clientA.id);
  assert.equal(deleted, true);
  assert.equal(await getClient('owner-a', clientA.id), null);
});

test('restricts client deletion when linked to an invoice', async () => {
  resetBusinessDataForTests();
  resetInvoiceDataForTests();
  resetSessionsForTests();

  const client = await createClient('owner-a', { name: 'Client Invoice', phone: '081234567890' });
  await createInvoice('owner-a', {
    clientId: client.id,
    items: [{ description: 'Hosting', quantity: 1, unitPrice: 500000 }]
  });

  await assert.rejects(
    () => deleteClient('owner-a', client.id),
    /Client is referenced by invoices/
  );

  const session = createSessionForTests('owner-a');
  const app = buildApp();
  const response = await app.inject({
    method: 'DELETE',
    url: `/api/clients/${client.id}`,
    headers: {
      cookie: `synectra_session=${session.token}`,
      'x-csrf-token': session.session.csrfToken
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, 'Cannot delete client referenced by invoices');
  await app.close();
});

test('client email and address are optional; empty strings are treated as not filled', async () => {
  const { clientInputSchema } = await import('@synectra/contracts');
  const parsed = clientInputSchema.parse({ name: 'Eva Liyani', phone: '082291753401', email: '', address: '  ' });
  assert.equal(parsed.email, undefined);
  assert.equal(parsed.address, undefined);
  assert.equal(parsed.phone, '6282291753401');
  assert.throws(() => clientInputSchema.parse({ name: 'Eva', phone: '082291753401', email: 'bukan-email' }));
});

test('client names are unique per owner across case and spacing, including edits and concurrent requests', async () => {
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetSessionsForTests();
  const session = createSessionForTests('unique-owner');
  const other = createSessionForTests('other-owner');
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken };
  const otherHeaders = { cookie: `synectra_session=${other.token}`, 'x-csrf-token': other.session.csrfToken };
  const app = buildApp();
  const input = { name: 'Venda Amanda', phone: '081234567890', email: 'old@example.com', address: 'Alamat', categoryIds: ['web'], communicationPreference: 'both' };
  const [first, second] = await Promise.all([
    app.inject({ method: 'POST', url: '/api/clients', headers, payload: input }),
    app.inject({ method: 'POST', url: '/api/clients', headers, payload: { ...input, name: '  VENDA   AMANDA  ' } })
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [201, 409]);
  const client = (first.statusCode === 201 ? first : second).json().client;
  assert.equal((await app.inject({ method: 'POST', url: '/api/clients', headers: otherHeaders, payload: input })).statusCode, 201);
  const updated = await app.inject({ method: 'PUT', url: `/api/clients/${client.id}`, headers, payload: { ...input, name: 'venda   amanda', email: 'new@example.com' } });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().client.email, 'new@example.com');
  assert.deepEqual(updated.json().client.categoryIds, ['web']);
  const otherClient = await app.inject({ method: 'POST', url: '/api/clients', headers, payload: { ...input, name: 'Klien Dua' } });
  assert.equal(otherClient.statusCode, 201);
  const conflict = await app.inject({ method: 'PUT', url: `/api/clients/${otherClient.json().client.id}`, headers, payload: { ...input, name: 'Venda Amanda' } });
  assert.equal(conflict.statusCode, 409);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/clients/${otherClient.json().client.id}`, headers: otherHeaders })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/clients/${otherClient.json().client.id}`, headers })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/clients', headers, payload: { ...input, name: 'KLIEN DUA' } })).statusCode, 201);
  await app.close();
});
