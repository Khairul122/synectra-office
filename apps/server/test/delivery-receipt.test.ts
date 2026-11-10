import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import {
  applyDeliveryReceipt,
  claimDelivery,
  createApprovalAndEnqueue,
  findDeliveryByMessageId,
  getDelivery,
  recordAttemptAndComplete,
  resetDeliveryDataForTests
} from '../src/modules/deliveries/application/delivery-service';
import { subscribeOffice } from '../src/modules/office/application/office-event-service';

test('T19: Delivery receipt transisi status monotonik dan deduplikasi', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-receipt-1';

  // Buat approval dan delivery
  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-r1',
    revision: 'v1',
    recipient: '6281111111111',
    pdfHash: 'hash-pdf-r1',
    caption: 'Nota Receipt Test',
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  // 1. Cegah receipt pada status sebelum submitted (saat ini queued)
  const rejectQueued = await applyDeliveryReceipt(
    { messageId: 'msg-nonexistent', status: 'delivered' },
    ownerId
  );
  assert.equal(rejectQueued.success, false);
  assert.match(rejectQueued.error ?? '', /Delivery not found/);

  // Claim dan submit via bridge
  const claim = await claimDelivery(ownerId, delivery.id, 10000);
  assert.ok(claim);

  const submitted = await recordAttemptAndComplete(
    ownerId,
    delivery.id,
    claim.fencingToken,
    async () => ({ success: true, messageId: 'wa-msg-001' })
  );
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.messageId, 'wa-msg-001');

  // Cari delivery berdasarkan messageId
  const found = await findDeliveryByMessageId('wa-msg-001', ownerId);
  assert.ok(found);
  assert.equal(found.delivery.id, delivery.id);

  // 2. Receipt 'delivered' memajukan status ke delivered
  const receiptDelivered = await applyDeliveryReceipt(
    {
      receiptId: 'rcpt-del-1',
      messageId: 'wa-msg-001',
      status: 'delivered',
      timestamp: new Date().toISOString()
    },
    ownerId
  );

  assert.equal(receiptDelivered.success, true);
  assert.equal(receiptDelivered.previousStatus, 'submitted');
  assert.equal(receiptDelivered.currentStatus, 'delivered');
  assert.equal(receiptDelivered.deduplicated, false);

  const checkDelivered = await getDelivery(ownerId, delivery.id);
  assert.equal(checkDelivered?.status, 'delivered');
  assert.ok(checkDelivered?.deliveredAt);

  // 3. Deduplikasi receipt 'delivered' yang sama
  const duplicateDelivered = await applyDeliveryReceipt(
    {
      receiptId: 'rcpt-del-1',
      messageId: 'wa-msg-001',
      status: 'delivered'
    },
    ownerId
  );
  assert.equal(duplicateDelivered.success, true);
  assert.equal(duplicateDelivered.currentStatus, 'delivered');
  assert.equal(duplicateDelivered.deduplicated, true);

  // 4. Receipt 'read' memajukan status ke read
  const receiptRead = await applyDeliveryReceipt(
    {
      receiptId: 'rcpt-read-1',
      messageId: 'wa-msg-001',
      status: 'read',
      timestamp: new Date().toISOString()
    },
    ownerId
  );
  assert.equal(receiptRead.success, true);
  assert.equal(receiptRead.previousStatus, 'delivered');
  assert.equal(receiptRead.currentStatus, 'read');
  assert.equal(receiptRead.deduplicated, false);

  const checkRead = await getDelivery(ownerId, delivery.id);
  assert.equal(checkRead?.status, 'read');
  assert.ok(checkRead?.readAt);

  // 5. Monotonik: Cegah downgrade dari read ke delivered (receipt terlambat/out-of-order)
  const lateDelivered = await applyDeliveryReceipt(
    {
      receiptId: 'rcpt-del-late',
      messageId: 'wa-msg-001',
      status: 'delivered'
    },
    ownerId
  );
  assert.equal(lateDelivered.success, true);
  assert.equal(lateDelivered.previousStatus, 'read');
  assert.equal(lateDelivered.currentStatus, 'read');
  assert.equal(lateDelivered.deduplicated, true);

  const checkStillRead = await getDelivery(ownerId, delivery.id);
  assert.equal(checkStillRead?.status, 'read');
});

test('T19: Direct receipt read memajukan submitted langsung ke read', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-receipt-direct-read';

  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-r2',
    revision: 'v1',
    recipient: '6282222222222',
    pdfHash: 'hash-pdf-r2',
    caption: 'Direct Read Test',
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  const claim = await claimDelivery(ownerId, delivery.id, 10000);
  assert.ok(claim);

  await recordAttemptAndComplete(ownerId, delivery.id, claim.fencingToken, async () => ({
    success: true,
    messageId: 'wa-msg-002'
  }));

  const res = await applyDeliveryReceipt({
    messageId: 'wa-msg-002',
    status: 'read'
  });

  assert.equal(res.success, true);
  assert.equal(res.previousStatus, 'submitted');
  assert.equal(res.currentStatus, 'read');

  const after = await getDelivery(ownerId, delivery.id);
  assert.equal(after?.status, 'read');
  assert.ok(after?.deliveredAt);
  assert.ok(after?.readAt);
});

test('T19: HTTP Endpoint /api/deliveries/receipt dan /whatsapp/receipt', async () => {
  resetDeliveryDataForTests();
  resetSessionsForTests();

  const ownerId = 'user-owner-http-receipt';
  const ownerKey = 'wa-owner-key-xyz';
  const mockWhatsappService = {
    getStatus: () => ({ status: 'paired' as const })
  } as any;
  const app = buildApp({ whatsappService: mockWhatsappService, whatsappOwnerKey: ownerKey });

  const session = createSessionForTests(ownerId, 'owner@example.com');

  // Setup delivery submitted
  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-r3',
    revision: 'v1',
    recipient: '6283333333333',
    pdfHash: 'hash-pdf-r3',
    caption: 'HTTP Receipt Test',
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  const claim = await claimDelivery(ownerId, delivery.id, 10000);
  assert.ok(claim);
  await recordAttemptAndComplete(ownerId, delivery.id, claim.fencingToken, async () => ({
    success: true,
    messageId: 'wa-msg-http-003'
  }));

  // Pantau event kantor
  const receivedEvents: string[] = [];
  const unsubscribe = subscribeOffice(ownerId, (event) => {
    if ('type' in event) {
      receivedEvents.push(event.type);
    }
  });

  // 1. Post receipt via /api/deliveries/receipt (dengan user auth)
  const apiRes = await app.inject({
    method: 'POST',
    url: '/api/deliveries/receipt',
    headers: {
      cookie: `synectra_session=${session.token}`,
      'x-csrf-token': session.session.csrfToken
    },
    payload: {
      messageId: 'wa-msg-http-003',
      status: 'delivered'
    }
  });

  assert.equal(apiRes.statusCode, 200);
  const apiJson = apiRes.json();
  assert.equal(apiJson.success, true);
  assert.equal(apiJson.currentStatus, 'delivered');

  // 2. Post receipt via /whatsapp/receipt (dengan owner key bridge callback)
  const bridgeRes = await app.inject({
    method: 'POST',
    url: '/whatsapp/receipt',
    headers: {
      'x-whatsapp-owner-key': ownerKey
    },
    payload: {
      messageId: 'wa-msg-http-003',
      status: 'read'
    }
  });

  assert.equal(bridgeRes.statusCode, 200);
  const bridgeJson = bridgeRes.json();
  assert.equal(bridgeJson.success, true);
  assert.equal(bridgeJson.currentStatus, 'read');

  // 3. Cek unauthorized jika tanpa auth / key
  const unauthRes = await app.inject({
    method: 'POST',
    url: '/whatsapp/receipt',
    payload: {
      messageId: 'wa-msg-http-003',
      status: 'read'
    }
  });
  assert.equal(unauthRes.statusCode, 401);

  // Verifikasi event kantor delivery_receipt dipublikasikan
  assert.ok(receivedEvents.includes('delivery_receipt'));

  unsubscribe();
  await app.close();
});
