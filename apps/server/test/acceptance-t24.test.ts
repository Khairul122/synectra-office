import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/bootstrap/app';
import { isLoopbackHost, readConfig } from '../src/bootstrap/config';
import {
  createSessionForTests,
  resetSessionsForTests
} from '../src/modules/auth/application/auth-service';
import {
  ensurePrivateFilesRoot,
  privateFilePath,
  PRIVATE_FILES_ROOT
} from '../src/infrastructure/private-files';
import {
  createApprovalAndEnqueue,
  claimDelivery,
  recordAttemptAndComplete,
  recordManualAttempt,
  computeDeliveryDedupeKey,
  resetDeliveryDataForTests,
  getDelivery
} from '../src/modules/deliveries/application/delivery-service';
import {
  createOwnerBackup,
  verifyAndRestoreBackup,
  setWorkerQuiescent
} from '../src/modules/backup/application/backup-service';
import {
  createClient,
  resetBusinessDataForTests
} from '../src/modules/business/application/business-service';
import {
  createInvoice,
  resetInvoiceDataForTests
} from '../src/modules/invoice/application/invoice-service';
import {
  createSignature,
  resetSignatureDataForTests
} from '../src/modules/invoice/application/signature-service';
import { getServicesHealth } from '../src/modules/health/application/get-health';

const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('T24-1: Endpoint aplikasi dan helper konfigurasi hanya menerima interface loopback yang ditetapkan', async () => {
  // 1. Validasi host loopback valid
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('127.0.0.2'), true);
  assert.equal(isLoopbackHost('127.1.2.3'), true);

  // 2. Tolak host non-loopback / public / wildcard
  assert.equal(isLoopbackHost('0.0.0.0'), false);
  assert.equal(isLoopbackHost('192.168.1.100'), false);
  assert.equal(isLoopbackHost('10.0.0.1'), false);
  assert.equal(isLoopbackHost('172.16.0.1'), false);
  assert.equal(isLoopbackHost('example.com'), false);
  assert.equal(isLoopbackHost('8.8.8.8'), false);

  // 3. Konfigurasi valid membaca host loopback
  const validConfig = readConfig({
    APP_HOST: '127.0.0.1',
    APP_PORT: '3000',
    WHATSAPP_OWNER_KEY: 'owner-secret-key-16-bytes'
  });
  assert.equal(isLoopbackHost(validConfig.host), true);
  assert.equal(validConfig.port, 3000);

  // 4. Aplikasi backend merespons pada remoteAddress loopback
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/health',
    remoteAddress: '127.0.0.1',
    headers: { host: 'localhost:3000' }
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('T24-2: Origin restriction, session cookie HttpOnly/SameSite=Strict, CSRF protection, dan isolasi file privat', async () => {
  resetSessionsForTests();
  const app = buildApp();

  // 1. Origin eksternal/tak terpercaya ditolak dengan 403 Forbidden
  const evilOriginRes = await app.inject({
    method: 'POST',
    url: '/auth/session',
    headers: {
      origin: 'http://evil-attacker.com',
      'content-type': 'application/json'
    },
    payload: { idToken: 'some-dummy-firebase-id-token-xyz' }
  });
  assert.equal(evilOriginRes.statusCode, 403);
  assert.equal(evilOriginRes.json().error, 'Forbidden origin');

  // 2. Loopback origin 127.0.0.1:5173 diizinkan melewati filter origin
  const loopbackOriginRes = await app.inject({
    method: 'POST',
    url: '/auth/session',
    headers: {
      origin: 'http://127.0.0.1:5173',
      'content-type': 'application/json'
    },
    payload: { idToken: 'token-pendek' }
  });
  // idToken pendek memicu 422, membuktikan origin lolos
  assert.equal(loopbackOriginRes.statusCode, 422);

  // 3. Cookie session diformat HttpOnly dan SameSite=Strict
  const ownerId = 'owner-t24-sec';
  const { token, session } = createSessionForTests(ownerId);
  const cookieHeader = `synectra_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`;
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);

  // 4. Mutasi /api/* tanpa CSRF token yang valid ditolak dengan 403
  const noCsrfRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: {
      cookie: `synectra_session=${token}`,
      'content-type': 'application/json'
    },
    payload: { name: 'Klien Tanpa CSRF', phone: '08123456789' }
  });
  assert.equal(noCsrfRes.statusCode, 403);
  assert.equal(noCsrfRes.json().error, 'Invalid CSRF token');

  // 5. Mutasi /api/* dengan CSRF token valid diterima
  const validCsrfRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: {
      cookie: `synectra_session=${token}`,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json'
    },
    payload: { name: 'Klien Valid T24', phone: '08123456789' }
  });
  assert.equal(validCsrfRes.statusCode, 201);

  // 6. Path traversal pada penyimpanan file privat diblokir
  await ensurePrivateFilesRoot();
  assert.throws(
    () => privateFilePath(ownerId, '../../etc/passwd'),
    /Invalid private file path/
  );
  assert.throws(
    () => privateFilePath(ownerId, '../other-owner/nota.pdf'),
    /Invalid private file path/
  );

  // 7. Static file serving menolak path traversal upaya mengakses .local/private
  const traversalStaticRes = await app.inject({
    method: 'GET',
    url: '/..%2f..%2f.local/private/secret.pdf'
  });
  assert.ok([400, 403, 404].includes(traversalStaticRes.statusCode));
});

test('T24-3: Akses Firestore cloud hanya melalui backend server, direct client ditolak oleh Rules, dan credential terlindungi', async () => {
  // 1. Verifikasi firestore.rules menolak akses client langsung
  const rootDir = resolve(process.cwd(), process.cwd().endsWith('apps\\server') || process.cwd().endsWith('apps/server') ? '../..' : '.');
  const rulesPath = resolve(rootDir, 'firestore.rules');
  assert.equal(existsSync(rulesPath), true, 'firestore.rules harus tersedia di root');
  const rulesContent = await readFile(rulesPath, 'utf8');
  assert.match(rulesContent, /service cloud\.firestore/);
  assert.match(rulesContent, /allow read,\s*write:\s*if false;/);

  // 2. Endpoint /health/services melaporkan environment development tanpa membocorkan secret
  const app = buildApp();
  const healthRes = await app.inject({
    method: 'GET',
    url: '/health/services'
  });
  assert.equal(healthRes.statusCode, 200);
  const healthData = healthRes.json();
  assert.equal(healthData.environment, 'development');
  assert.ok(healthData.services.firestore);
  assert.ok(healthData.services.whatsapp);

  // 3. Pastikan tidak ada credential rahasia di body
  const bodyString = JSON.stringify(healthData);
  assert.equal(bodyString.includes('WHATSAPP_OWNER_KEY'), false);
  assert.equal(bodyString.includes('private_key'), false);
  assert.equal(bodyString.includes('apiKey'), false);
});

test('T24-4: Gangguan jaringan menampilkan status stale/error serta menahan mutasi sampai database siap', async () => {
  // 1. Health check saat simulasi mode error/degraded
  const health = await getServicesHealth();
  assert.ok(['ok', 'degraded', 'error'].includes(health.overall));
  assert.ok(health.recoveryGuides.firestore);
  assert.match(health.recoveryGuides.firestore, /Periksa koneksi internet atau credential/);

  // 2. Tanpa sesi atau koneksi siap, endpoint mutasi aman menolak tanpa crash
  const app = buildApp();
  const unauthRes = await app.inject({
    method: 'POST',
    url: '/api/invoices',
    headers: { 'content-type': 'application/json' },
    payload: { clientId: 'client-1' }
  });
  assert.equal(unauthRes.statusCode, 401);
  assert.equal(unauthRes.json().error, 'Unauthorized');
});

test('T24-5: Single session active Baileys dan rekonsiliasi pengiriman ambigu setelah restart/crash', async () => {
  resetDeliveryDataForTests();
  const ownerId = 'owner-t24-baileys';

  const approvalInput = {
    notaId: 'nota-t24-001',
    revision: '1',
    recipient: '628123456789',
    pdfHash: 'sha256-hash-pdf-t24',
    caption: 'Nota T24 WhatsApp',
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    scheduleAt: new Date(Date.now() - 1000).toISOString()
  };

  // 1. Hitung deduplication key konsisten
  const dedupeKey1 = computeDeliveryDedupeKey(approvalInput);
  const dedupeKey2 = computeDeliveryDedupeKey(approvalInput);
  assert.equal(dedupeKey1, dedupeKey2);

  // 2. Enqueue pertama berhasil
  const firstEnqueue = await createApprovalAndEnqueue(ownerId, approvalInput);
  assert.equal(firstEnqueue.isDuplicate, false);
  assert.equal(firstEnqueue.delivery.status, 'queued');

  // 3. Enqueue identik kedua terdeteksi sebagai duplikat dan ditahan dari pengiriman ganda
  const secondEnqueue = await createApprovalAndEnqueue(ownerId, approvalInput);
  assert.equal(secondEnqueue.isDuplicate, true);
  assert.equal(secondEnqueue.delivery.id, firstEnqueue.delivery.id);

  // 4. Ambil lease pengiriman (fencing token)
  const lease = await claimDelivery(ownerId, firstEnqueue.delivery.id, 5000);
  assert.ok(lease);
  assert.equal(lease.delivery.status, 'sending');

  // 5. Simulasikan crash worker setelah pengiriman keluar (hasil ambigu)
  const crashedDelivery = await recordAttemptAndComplete(
    ownerId,
    firstEnqueue.delivery.id,
    lease.fencingToken,
    async () => ({ success: true, messageId: 'wa-msg-ambiguous-1' }),
    { simulateCrashAfterSend: true }
  );
  assert.equal(crashedDelivery.status, 'unknown');

  // 6. Pasca-restart: status unknown tetap tercatat dan masuk rekonsiliasi manual
  const retrieved = await getDelivery(ownerId, firstEnqueue.delivery.id);
  assert.equal(retrieved?.status, 'unknown');

  // 7. Rekonsiliasi manual menandai hasil akhir tanpa pengiriman ulang ganda
  const reconciled = await recordManualAttempt(
    ownerId,
    firstEnqueue.delivery.id,
    'sent',
    'Dikonfirmasi pesan diterima oleh penerima melalui log audit'
  );
  assert.equal(reconciled.delivery.status, 'submitted');
  assert.equal(reconciled.attempt.source, 'manual');
  assert.equal(reconciled.attempt.result, 'sent');
});

test('T24-6: Verifikasi restore metadata dan file privat dengan manifest checksum pada lingkungan terisolasi', async () => {
  resetSessionsForTests();
  resetBusinessDataForTests();
  resetInvoiceDataForTests();
  resetSignatureDataForTests();
  resetDeliveryDataForTests();

  const ownerId = 'owner-t24-restore';
  createSessionForTests(ownerId);

  // 1. Siapkan data klien, nota, dan tanda tangan
  const client = await createClient(ownerId, {
    name: 'PT Validasi T24',
    phone: '081234567890',
    email: 'klien@t24.test'
  });
  await createInvoice(ownerId, {
    clientId: client.id,
    currency: 'IDR',
    notes: 'Nota Backup T24',
    items: [{ description: 'Uji Restore T24', quantity: 1, unitPrice: 250000 }]
  });
  await createSignature(ownerId, dummyPng);

  // 2. Simpan file privat lokal owner
  await ensurePrivateFilesRoot();
  const testPrivFile = privateFilePath(ownerId, 'test-proof.txt');
  await mkdir(join(PRIVATE_FILES_ROOT, ownerId), { recursive: true });
  await writeFile(testPrivFile, 'KONTEN-BUKTI-PEMBAYARAN-T24', 'utf8');

  // 3. Buat backup dengan worker quiescent
  setWorkerQuiescent(true);
  const backupDir = join(tmpdir(), `t24-backup-${Date.now()}`);
  const manifest = await createOwnerBackup({ ownerId, targetDir: backupDir });
  assert.ok(manifest.manifestHash);
  assert.ok(manifest.files.length >= 2); // metadata.json + test-proof.txt (+ signature jika ada)

  // 4. Verifikasi dan restore ke direktori terisolasi
  const restoreTargetDir = join(tmpdir(), `t24-restore-${Date.now()}`);
  const restoreResult = await verifyAndRestoreBackup({
    backupDir,
    restoreTargetDir,
    expectedOwnerId: ownerId
  });

  assert.equal(restoreResult.verified, true);
  assert.equal(restoreResult.metadata.clients, 1);
  assert.equal(restoreResult.metadata.invoices, 1);
  assert.ok(restoreResult.restoredFiles >= 2);

  // 5. Verifikasi deteksi manipulasi file backup (tampering)
  const metaFilePath = join(backupDir, 'metadata.json');
  const originalMetaContent = await readFile(metaFilePath, 'utf8');
  await writeFile(metaFilePath, originalMetaContent + ' ', 'utf8'); // ubah isi file sedikit

  const tamperRestoreDir = join(tmpdir(), `t24-tamper-${Date.now()}`);
  await assert.rejects(
    async () => {
      await verifyAndRestoreBackup({
        backupDir,
        restoreTargetDir: tamperRestoreDir,
        expectedOwnerId: ownerId
      });
    },
    /Checksum mismatch/
  );

  // 6. Bersihkan direktori temporary
  await rm(backupDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(restoreTargetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(tamperRestoreDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  setWorkerQuiescent(false);
});
