import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/bootstrap/app';
import { WhatsappService } from '../src/modules/whatsapp/application/whatsapp-service';
import { BridgeManager } from '../src/modules/whatsapp/infrastructure/bridge-manager';

test('whatsapp pair-status returns initial unpaired status', async () => {
  const fakeBridgeManager = {
    getStatus: () => ({ status: 'unpaired' as const }),
    startPairing: () => ({ status: 'pairing' as const, qrCode: 'test-qr-code' }),
    sendMedia: async () => ({ success: true, messageId: 'msg-123' })
  } as unknown as BridgeManager;

  const service = new WhatsappService(fakeBridgeManager);
  const app = buildApp({ whatsappService: service, whatsappOwnerKey: 'test-owner-key-1234' });

  const getRes = await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { 'x-whatsapp-owner-key': 'test-owner-key-1234' } });
  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(getRes.json(), { status: 'unpaired' });

  const postRes = await app.inject({ method: 'POST', url: '/whatsapp/pair', headers: { 'x-whatsapp-owner-key': 'test-owner-key-1234' } });
  assert.equal(postRes.statusCode, 200);
  assert.deepEqual(postRes.json(), { status: 'pairing', qrCode: 'test-qr-code' });

  const sendPdfRes = await app.inject({ method: 'POST', url: '/whatsapp/send-synthetic-pdf', headers: { 'x-whatsapp-owner-key': 'test-owner-key-1234' } });
  assert.equal(sendPdfRes.statusCode, 200);
  assert.deepEqual(sendPdfRes.json(), { success: true, deliveryStatus: 'sent', messageId: 'msg-123', fileName: 'nota-sintetis-synectra.pdf', mimeType: 'application/pdf' });

  const unauthorizedRes = await app.inject({ method: 'GET', url: '/whatsapp/pair-status' });
  assert.equal(unauthorizedRes.statusCode, 401);

  const originRes = await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(originRes.statusCode, 401);

  const originPostRes = await app.inject({ method: 'POST', url: '/whatsapp/send-synthetic-pdf', headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(originPostRes.statusCode, 401);

  const badOriginRes = await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { origin: 'http://evil.com' } });
  assert.equal(badOriginRes.statusCode, 403);

  await app.close();
});


test('saved browser session can read WhatsApp status on a same-origin GET without an Origin header', async () => {
  const { createSessionForTests } = await import('../src/modules/auth/application/auth-service');
  const session = createSessionForTests('owner-whatsapp-refresh');
  let pairingCalls = 0;
  const manager = { getStatus: () => ({ status: 'connected' as const }), startPairing: () => { pairingCalls++; return { status: 'connected' as const }; }, disconnect: () => ({ status: 'unpaired' as const }) } as unknown as BridgeManager;
  const app = buildApp({ whatsappService: new WhatsappService(manager), whatsappOwnerKey: 'test-owner-key-1234' });
  const cookie = `synectra_session=${session.token}`;
  const status = await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { cookie, 'sec-fetch-site': 'same-origin' } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().status, 'connected');
  assert.equal((await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { cookie } })).json().status, 'connected');
  assert.equal(pairingCalls, 0);
  assert.equal((await app.inject({ method: 'GET', url: '/whatsapp/pair-status' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { cookie, origin: 'http://evil.com' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { cookie, 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/whatsapp/pair', headers: { cookie } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/whatsapp/pair', headers: { cookie, origin: 'http://127.0.0.1:5173' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/whatsapp/pair', headers: { cookie, origin: 'http://127.0.0.1:5173', 'x-csrf-token': session.session.csrfToken } })).statusCode, 200);
  await app.close();
});
