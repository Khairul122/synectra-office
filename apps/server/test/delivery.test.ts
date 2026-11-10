import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paymentFingerprint } from '../src/modules/payment/application/payment-service';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import {
  claimDelivery,
  createApprovalAndEnqueue,
  getDelivery,
  listDeliveryAttemptsForTests,
  recordAttemptAndComplete,
  recoverExpiredLease,
  resetDeliveryDataForTests
} from '../src/modules/deliveries/application/delivery-service';
import { resetPdfDataForTests } from '../src/modules/invoice/application/pdf-service';

test('T10-1: Double-click menghasilkan satu delivery logis', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-a';
  const approvalInput = {
    notaId: 'nota-101',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-1',
    caption: 'Invoice INV-001',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date(Date.now() - 1000).toISOString()
  };

  const firstCall = await createApprovalAndEnqueue(ownerId, approvalInput);
  const secondCall = await createApprovalAndEnqueue(ownerId, approvalInput);

  assert.equal(firstCall.isDuplicate, false);
  assert.equal(secondCall.isDuplicate, true);
  assert.equal(firstCall.delivery.id, secondCall.delivery.id);
  assert.equal(firstCall.approval.id, secondCall.approval.id);
  assert.equal(firstCall.delivery.status, 'queued');
});

test('T10-2: Perubahan penerima, revisi, atau caption mengharuskan approval baru', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-a';
  const baseInput = {
    notaId: 'nota-102',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-2',
    caption: 'Caption Base',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date().toISOString()
  };

  const base = await createApprovalAndEnqueue(ownerId, baseInput);

  // Change recipient
  const changedRecipient = await createApprovalAndEnqueue(ownerId, {
    ...baseInput,
    recipient: '6289999999999'
  });
  assert.notEqual(base.approval.id, changedRecipient.approval.id);
  assert.notEqual(base.delivery.id, changedRecipient.delivery.id);

  // Change revision
  const changedRevision = await createApprovalAndEnqueue(ownerId, {
    ...baseInput,
    revision: 'v2'
  });
  assert.notEqual(base.approval.id, changedRevision.approval.id);
  assert.notEqual(base.delivery.id, changedRevision.delivery.id);

  // Change caption
  const changedCaption = await createApprovalAndEnqueue(ownerId, {
    ...baseInput,
    caption: 'Caption Modified'
  });
  assert.notEqual(base.approval.id, changedCaption.approval.id);
  assert.notEqual(base.delivery.id, changedCaption.delivery.id);
});

test('T10-3: Dua worker bersamaan memperoleh paling banyak satu claim yang sah melalui fencing token', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-a';
  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-103',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-3',
    caption: 'Caption Concurrent Claim',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  // Simultaneous claim requests from two workers
  const [claim1, claim2] = await Promise.all([
    claimDelivery(ownerId, delivery.id, 30_000),
    claimDelivery(ownerId, delivery.id, 30_000)
  ]);

  const successfulClaims = [claim1, claim2].filter((c) => c !== null);
  assert.equal(successfulClaims.length, 1, 'Only one worker can successfully claim the delivery');

  const validClaim = successfulClaims[0]!;
  assert.equal(validClaim.delivery.status, 'sending');
  assert.ok(validClaim.fencingToken.length > 0);
  assert.ok(validClaim.delivery.leaseExpires);
});

test('T10-4: Crash sebelum send pulih aman, crash setelah send diperlakukan sebagai hasil ambigu', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-a';
  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-104',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-4',
    caption: 'Caption Crash Recovery',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  // --- Sub-test 1: Crash sebelum send ---
  const claim1 = await claimDelivery(ownerId, delivery.id, 10_000);
  assert.ok(claim1);

  // Worker crashes before executing send
  await recordAttemptAndComplete(
    ownerId,
    delivery.id,
    claim1.fencingToken,
    async () => ({ success: true }),
    { simulateCrashBeforeSend: true }
  );

  // Delivery remains 'sending'
  const postCrash = await getDelivery(ownerId, delivery.id);
  assert.equal(postCrash?.status, 'sending');

  // Advance time past lease expiration (11 seconds later)
  const later = new Date(Date.now() + 11_000);
  const recovered = await recoverExpiredLease(ownerId, delivery.id, later);
  assert.ok(recovered);
  assert.equal(recovered.status, 'queued');

  // Re-claim and complete after recovery
  const claimRecovered = await claimDelivery(ownerId, delivery.id, 10_000, later);
  assert.ok(claimRecovered);
  const completed = await recordAttemptAndComplete(
    ownerId,
    delivery.id,
    claimRecovered.fencingToken,
    async () => ({ success: true, messageId: 'msg-success-123' }),
    undefined,
    later
  );
  assert.equal(completed.status, 'submitted');

  // --- Sub-test 2: Crash setelah send (hasil ambigu) ---
  const { delivery: deliveryAmbiguous } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-104-ambig',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-ambig',
    caption: 'Caption Ambiguous Send',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date().toISOString()
  });

  const claimAmbiguous = await claimDelivery(ownerId, deliveryAmbiguous.id, 10_000);
  assert.ok(claimAmbiguous);

  const ambiguousOutcome = await recordAttemptAndComplete(
    ownerId,
    deliveryAmbiguous.id,
    claimAmbiguous.fencingToken,
    async () => ({ success: true, messageId: 'msg-ambiguous-456' }),
    { simulateCrashAfterSend: true }
  );

  assert.equal(ambiguousOutcome.status, 'unknown');
  const attempts = listDeliveryAttemptsForTests(deliveryAmbiguous.id);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].result, 'unknown');
});

test('T10-5: Missed schedule dan persetujuan kedaluwarsa masuk review sesuai kebijakan', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-a';
  const now = new Date();

  // Case A: Missed schedule (> 24 jam)
  const missedScheduleTime = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  const { delivery: missedDelivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-105-missed',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-missed',
    caption: 'Caption Missed Schedule',
    validUntil: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: missedScheduleTime
  });

  const claimMissed = await claimDelivery(ownerId, missedDelivery.id, 30_000, now);
  assert.equal(claimMissed, null, 'Missed schedule delivery cannot be claimed directly');
  const updatedMissed = await getDelivery(ownerId, missedDelivery.id);
  assert.equal(updatedMissed?.status, 'review', 'Delivery with missed schedule > 24h must transition to review');

  // Case B: Persetujuan kedaluwarsa (validUntil <= now)
  const expiredValidUntil = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { delivery: expiredDelivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: 'nota-105-expired',
    revision: 'v1',
    recipient: '6281234567890',
    pdfHash: 'sha256-hash-pdf-expired',
    caption: 'Caption Expired Approval',
    validUntil: expiredValidUntil,
    scheduleAt: now.toISOString()
  });

  const claimExpired = await claimDelivery(ownerId, expiredDelivery.id, 30_000, now);
  assert.equal(claimExpired, null, 'Expired approval delivery cannot be claimed');
  const updatedExpired = await getDelivery(ownerId, expiredDelivery.id);
  assert.equal(updatedExpired?.status, 'review', 'Delivery with expired approval must transition to review');
});

test('T10-6: HTTP API delivery routes integration', async () => {
  resetDeliveryDataForTests();
  resetSessionsForTests();

  const session = createSessionForTests('owner-api');
  const app = buildApp();
  const headers = {
    cookie: `synectra_session=${session.token}`,
    'x-csrf-token': session.session.csrfToken
  };

  // POST /api/deliveries/approvals
  const approvalRes = await app.inject({
    method: 'POST',
    url: '/api/deliveries/approvals',
    headers,
    payload: {
      notaId: 'nota-api-1',
      revision: 'v1',
      recipient: '6281234567890',
      pdfHash: 'sha256-hash-api',
      caption: 'Nota API Test',
      validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      scheduleAt: new Date().toISOString()
    }
  });
  assert.equal(approvalRes.statusCode, 201);
  const data = approvalRes.json();
  assert.equal(data.isDuplicate, false);
  assert.equal(data.delivery.status, 'queued');

  // GET /api/deliveries/:id
  const getRes = await app.inject({
    method: 'GET',
    url: `/api/deliveries/${data.delivery.id}`,
    headers
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().delivery.id, data.delivery.id);
  assert.equal(getRes.json().approval.id, data.approval.id);

  // POST /api/deliveries/:id/claim
  const claimRes = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${data.delivery.id}/claim`,
    headers,
    payload: { leaseDurationMs: 15_000 }
  });
  assert.equal(claimRes.statusCode, 200);
  assert.equal(claimRes.json().delivery.status, 'sending');
  assert.ok(claimRes.json().fencingToken);
});

test('T11-1: Pengiriman PDF via WhatsApp bridge memetakan status ke submitted (bukan delivered/read)', async () => {
  resetDeliveryDataForTests();
  resetSessionsForTests();
  resetPdfDataForTests();

  const ownerId = 'owner-t11';
  const session = createSessionForTests(ownerId);

  // Siapkan file PDF nyata di folder private file owner
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { privateFilePath } = await import('../src/modules/auth/infrastructure/private-files');
  const { setPdfAssetForTests } = await import('../src/modules/invoice/application/pdf-service');

  const pdfDir = privateFilePath(ownerId, '');
  await mkdir(pdfDir, { recursive: true });

  const dummyPdfContent = Buffer.from('%PDF-1.4 dummy invoice content');
  const dummyPdfHash = createHash('sha256').update(dummyPdfContent).digest('hex');
  const pdfRelativePath = 'invoices/nota-t11.pdf';
  await mkdir(privateFilePath(ownerId, 'invoices'), { recursive: true });
  await writeFile(privateFilePath(ownerId, pdfRelativePath), dummyPdfContent);

  setPdfAssetForTests({
    id: 'pdf-asset-t11',
    ownerId,
    invoiceId: 'nota-t11',
    invoiceVersion: 1,
    signatureAssetId: 'sig-1',
    paymentFingerprint: paymentFingerprint([]),
    relativePath: pdfRelativePath,
    sha256: dummyPdfHash,
    size: dummyPdfContent.length,
    mimeType: 'application/pdf',
    status: 'ready',
    createdAt: new Date().toISOString()
  });

  let dispatchedPdf: { phone: string; filename?: string; caption?: string; buffer: Buffer } | null = null;
  const mockWhatsappService = {
    sendPdf: async (phone: string, pdfBuffer: Buffer, filename?: string, caption?: string) => {
      dispatchedPdf = { phone, filename, caption, buffer: pdfBuffer };
      return { success: true, messageId: 'msg-wa-bridge-111' };
    }
  };

  const app = buildApp({ whatsappService: mockWhatsappService as any, whatsappOwnerKey: 'owner-key' });
  const headers = {
    cookie: `synectra_session=${session.token}`,
    'x-csrf-token': session.session.csrfToken
  };

  const wrongHash = await app.inject({
    method: 'POST', url: '/api/deliveries/approvals', headers,
    payload: { notaId: 'nota-t11', revision: 'v1', recipient: '6281234567890', pdfHash: 'wrong-hash', caption: 'Nota', validUntil: new Date(Date.now() + 86400000).toISOString(), scheduleAt: new Date().toISOString() }
  });
  const wrongHashId = wrongHash.json().delivery.id;
  const rejected = await app.inject({ method: 'POST', url: `/api/deliveries/${wrongHashId}/send`, headers });
  assert.equal(rejected.statusCode, 404);
  assert.equal(dispatchedPdf, null);
  const stillQueued = await app.inject({ method: 'GET', url: `/api/deliveries/${wrongHashId}`, headers });
  assert.equal(stillQueued.json().delivery.status, 'queued');

  // Buat approval outbox
  const approvalRes = await app.inject({
    method: 'POST',
    url: '/api/deliveries/approvals',
    headers,
    payload: {
      notaId: 'nota-t11',
      revision: 'v1',
      recipient: '6281234567890',
      pdfHash: dummyPdfHash,
      caption: 'Nota T11 Siap Kirim',
      validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      scheduleAt: new Date().toISOString()
    }
  });
  assert.equal(approvalRes.statusCode, 201);
  const deliveryId = approvalRes.json().delivery.id;

  const preview = await app.inject({ method: 'GET', url: `/api/deliveries/${deliveryId}/pdf`, headers });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.rawPayload, dummyPdfContent);

  // Eksekusi kirim PDF via bridge route
  const sendRes = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${deliveryId}/send`,
    headers
  });

  assert.equal(sendRes.statusCode, 200);
  const sendData = sendRes.json();

  // Status harus submitted (tidak boleh langsung delivered / read)
  assert.equal(sendData.delivery.status, 'submitted');
  assert.notEqual(sendData.delivery.status, 'delivered');
  assert.notEqual(sendData.delivery.status, 'read');
  assert.equal(sendData.delivery.attemptCount, 1);

  // Attempt harus tercatat sebagai bridge dan sent
  assert.equal(sendData.attempts.length, 1);
  assert.equal(sendData.attempts[0].source, 'bridge');
  assert.equal(sendData.attempts[0].result, 'sent');
  assert.equal(sendData.attempts[0].messageId, 'msg-wa-bridge-111');

  // Pastikan payload PDF diteruskan ke bridge
  assert.ok(dispatchedPdf);
  const sentPayload = dispatchedPdf as { phone: string; filename?: string; caption?: string; buffer: Buffer };
  assert.equal(sentPayload.phone, '6281234567890');
  assert.equal(sentPayload.caption, 'Nota T11 Siap Kirim');
  assert.deepEqual(sentPayload.buffer, dummyPdfContent);
});

test('T11-2: Kegagalan bridge send memetakan attempt ke failed dan delivery ke queued', async () => {
  resetDeliveryDataForTests();
  resetSessionsForTests();
  resetPdfDataForTests();

  const ownerId = 'owner-t11-fail';
  const session = createSessionForTests(ownerId);

  const { mkdir, writeFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { privateFilePath } = await import('../src/modules/auth/infrastructure/private-files');
  const { setPdfAssetForTests } = await import('../src/modules/invoice/application/pdf-service');

  const dummyPdfContent = Buffer.from('%PDF-1.4 dummy fail test');
  const dummyPdfHash = createHash('sha256').update(dummyPdfContent).digest('hex');
  const pdfRelativePath = 'invoices/nota-t11-fail.pdf';
  await mkdir(privateFilePath(ownerId, 'invoices'), { recursive: true });
  await writeFile(privateFilePath(ownerId, pdfRelativePath), dummyPdfContent);

  setPdfAssetForTests({
    id: 'pdf-asset-t11-fail',
    ownerId,
    invoiceId: 'nota-t11-fail',
    invoiceVersion: 1,
    signatureAssetId: 'sig-1',
    paymentFingerprint: paymentFingerprint([]),
    relativePath: pdfRelativePath,
    sha256: dummyPdfHash,
    size: dummyPdfContent.length,
    mimeType: 'application/pdf',
    status: 'ready',
    createdAt: new Date().toISOString()
  });

  const mockWhatsappService = {
    sendPdf: async () => ({ success: false, error: 'Connection refused by bridge' })
  };

  const app = buildApp({ whatsappService: mockWhatsappService as any, whatsappOwnerKey: 'owner-key' });
  const headers = {
    cookie: `synectra_session=${session.token}`,
    'x-csrf-token': session.session.csrfToken
  };

  const approvalRes = await app.inject({
    method: 'POST',
    url: '/api/deliveries/approvals',
    headers,
    payload: {
      notaId: 'nota-t11-fail',
      revision: 'v1',
      recipient: '6281234567890',
      pdfHash: dummyPdfHash,
      caption: 'Nota Gagal Kirim',
      validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      scheduleAt: new Date().toISOString()
    }
  });
  const deliveryId = approvalRes.json().delivery.id;

  const sendRes = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${deliveryId}/send`,
    headers
  });

  assert.equal(sendRes.statusCode, 200);
  const sendData = sendRes.json();

  // Attempt pertama gagal: delivery kembali ke queued untuk retry
  assert.equal(sendData.delivery.status, 'queued');
  assert.equal(sendData.delivery.attemptCount, 1);
  assert.equal(sendData.attempts.length, 1);
  assert.equal(sendData.attempts[0].source, 'bridge');
  assert.equal(sendData.attempts[0].result, 'failed');
  assert.equal(sendData.attempts[0].error, 'Connection refused by bridge');
});

test('T11-3: Pencatatan attempt manual memperbarui status delivery dan riwayat attempt', async () => {
  resetDeliveryDataForTests();
  resetSessionsForTests();

  const ownerId = 'owner-t11-manual';
  const session = createSessionForTests(ownerId);
  const app = buildApp();
  const headers = {
    cookie: `synectra_session=${session.token}`,
    'x-csrf-token': session.session.csrfToken
  };

  const approvalRes = await app.inject({
    method: 'POST',
    url: '/api/deliveries/approvals',
    headers,
    payload: {
      notaId: 'nota-t11-manual',
      revision: 'v1',
      recipient: '6281234567890',
      pdfHash: 'dummy-hash',
      caption: 'Nota Kirim Manual',
      validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      scheduleAt: new Date().toISOString()
    }
  });
  const deliveryId = approvalRes.json().delivery.id;

  // Catat manual attempt: sent
  const manualRes1 = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${deliveryId}/manual-attempt`,
    headers,
    payload: {
      result: 'sent',
      notes: 'Terkirim via wa.me web browser'
    }
  });

  assert.equal(manualRes1.statusCode, 200);
  const res1Data = manualRes1.json();
  assert.equal(res1Data.delivery.status, 'submitted');
  assert.equal(res1Data.delivery.attemptCount, 1);
  assert.equal(res1Data.attempt.source, 'manual');
  assert.equal(res1Data.attempt.result, 'sent');
  assert.equal(res1Data.attempt.notes, 'Terkirim via wa.me web browser');
  assert.equal(res1Data.attempts.length, 1);

  // Catat manual attempt: unknown
  const manualRes2 = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${deliveryId}/manual-attempt`,
    headers,
    payload: {
      result: 'unknown',
      notes: 'Status pesan di ponsel belum centang dua'
    }
  });

  assert.equal(manualRes2.statusCode, 200);
  const res2Data = manualRes2.json();
  assert.equal(res2Data.delivery.status, 'unknown');
  assert.equal(res2Data.delivery.attemptCount, 2);
  assert.equal(res2Data.attempt.source, 'manual');
  assert.equal(res2Data.attempt.result, 'unknown');
  assert.equal(res2Data.attempts.length, 2);
});
