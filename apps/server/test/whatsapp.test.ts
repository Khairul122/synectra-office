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
  assert.equal(originRes.statusCode, 200);

  const badOriginRes = await app.inject({ method: 'GET', url: '/whatsapp/pair-status', headers: { origin: 'http://evil.com' } });
  assert.equal(badOriginRes.statusCode, 401);

  await app.close();
});
