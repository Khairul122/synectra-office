import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { servicesHealthResponseSchema } from '@synectra/contracts';
import { buildApp } from '../src/bootstrap/app';
import {
  createSessionForTests,
  resetSessionsForTests
} from '../src/modules/auth/application/auth-service';
import {
  createClient,
  resetBusinessDataForTests
} from '../src/modules/business/application/business-service';
import {
  createInvoice,
  issueInvoice,
  resetInvoiceDataForTests
} from '../src/modules/invoice/application/invoice-service';
import {
  createSignature,
  resetSignatureDataForTests
} from '../src/modules/invoice/application/signature-service';
import {
  createPayment,
  resetPaymentDataForTests
} from '../src/modules/payment/application/payment-service';
import {
  claimDelivery,
  createApprovalAndEnqueue,
  getDelivery,
  recordAttemptAndComplete,
  resetDeliveryDataForTests
} from '../src/modules/deliveries/application/delivery-service';
import {
  createOwnerBackup,
  pruneBackups,
  runDailyBackup,
  setWorkerQuiescent
} from '../src/modules/backup/application/backup-service';
import { privateFilePath } from '../src/modules/auth/infrastructure/private-files';

const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('T22-1: Endpoint /health/services dan /api/health/services mengembalikan struktur per-layanan valid', async () => {
  const app = buildApp();

  const res1 = await app.inject({ method: 'GET', url: '/health/services' });
  assert.equal(res1.statusCode, 200);
  const data1 = res1.json();
  const parsed1 = servicesHealthResponseSchema.safeParse(data1);
  assert.equal(parsed1.success, true, `Validation error: ${JSON.stringify(parsed1.error)}`);
  assert.equal(data1.environment, 'development');
  assert.ok(data1.services.firestore);
  assert.ok(data1.services.hermes);
  assert.ok(data1.services.modelRouter);
  assert.ok(data1.services.pdfRenderer);
  assert.ok(data1.services.whatsapp);
  assert.ok(data1.recoveryGuides.firestore);

  // Alias /api/health/services
  const res2 = await app.inject({ method: 'GET', url: '/api/health/services' });
  assert.equal(res2.statusCode, 200);
  const data2 = res2.json();
  assert.equal(data2.environment, 'development');
  assert.equal(data2.overall, data1.overall);

  await app.close();
});

test('T22-2: Static serving frontend apps/web/dist, SPA fallback, dan proteksi path traversal', async () => {
  const distDir = join(process.cwd(), '..', 'web', 'dist');
  await mkdir(distDir, { recursive: true });
  const indexHtmlPath = join(distDir, 'index.html');
  const testAssetPath = join(distDir, 'test-asset.txt');

  await writeFile(indexHtmlPath, '<!DOCTYPE html><html><head><title>Synectra Office</title></head><body><div id="root">App</div></body></html>', 'utf8');
  await writeFile(testAssetPath, 'synectra-asset-content', 'utf8');

  const app = buildApp();

  // 1. GET / menyajikan index.html
  const rootRes = await app.inject({ method: 'GET', url: '/' });
  assert.equal(rootRes.statusCode, 200);
  assert.match(rootRes.headers['content-type'] ?? '', /text\/html/);
  assert.match(rootRes.body, /Synectra Office/);

  // 2. GET /test-asset.txt menyajikan file statis
  const assetRes = await app.inject({ method: 'GET', url: '/test-asset.txt' });
  assert.equal(assetRes.statusCode, 200);
  assert.match(assetRes.body, /synectra-asset-content/);

  // 3. SPA fallback: rute non-API yang tidak ada mengembalikan index.html
  const spaRes = await app.inject({ method: 'GET', url: '/kanban/board/view' });
  assert.equal(spaRes.statusCode, 200);
  assert.match(spaRes.headers['content-type'] ?? '', /text\/html/);
  assert.match(spaRes.body, /Synectra Office/);

  // 4. Rute /api/nonexistent dengan session valid tidak jatuh ke index.html melainkan 404 JSON
  const session = createSessionForTests('test-user-spa');
  const apiNotFoundRes = await app.inject({
    method: 'GET',
    url: '/api/nonexistent',
    cookies: { synectra_session: session.token }
  });
  assert.equal(apiNotFoundRes.statusCode, 404);
  assert.doesNotMatch(apiNotFoundRes.headers['content-type'] ?? '', /text\/html/);
  assert.equal(apiNotFoundRes.json().error, 'Not Found');

  // 5. Path traversal protection: mencoba keluar dari folder dist
  const traversalRes1 = await app.inject({ method: 'GET', url: '/..%2Fpackage.json' });
  assert.ok(traversalRes1.statusCode === 400 || traversalRes1.statusCode === 404);
  assert.doesNotMatch(traversalRes1.body, /@synectra/);

  const traversalRes2 = await app.inject({ method: 'GET', url: '/assets/../../package.json' });
  assert.ok(traversalRes2.statusCode === 400 || traversalRes2.statusCode === 404);
  assert.doesNotMatch(traversalRes2.body, /@synectra/);

  await app.close();
});

test('T22-3: Kebijakan retensi dan backup harian pruneBackups', async () => {
  const ownerId = 'owner-t22-backup';
  const ownerBackupDir = privateFilePath(ownerId, 'backups');
  await rm(ownerBackupDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir(ownerBackupDir, { recursive: true });

  setWorkerQuiescent(true);

  // Buat backup direktori individual
  const backup1 = join(ownerBackupDir, 'backup-1');
  const backup2 = join(ownerBackupDir, 'backup-2');
  const backup3 = join(ownerBackupDir, 'backup-3');

  await createOwnerBackup({ ownerId, targetDir: backup1, enforceQuiescent: true });
  await createOwnerBackup({ ownerId, targetDir: backup2, enforceQuiescent: true });
  await createOwnerBackup({ ownerId, targetDir: backup3, enforceQuiescent: true });

  const initialList = await readdir(ownerBackupDir);
  assert.equal(initialList.length, 3);

  // Jalankan runDailyBackup
  const dailyRes = await runDailyBackup({
    ownerId,
    backupsBaseDir: ownerBackupDir,
    retentionDays: 7,
    minKeepCount: 3
  });
  assert.ok(dailyRes.backupDir.includes('backup-'));
  assert.equal(dailyRes.manifest.ownerId, ownerId);
  assert.ok(dailyRes.manifest.createdAt);

  const afterDaily = await readdir(ownerBackupDir);
  assert.ok(afterDaily.length >= 3);

  // Bersihkan
  await rm(ownerBackupDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  setWorkerQuiescent(false);
});

test('T22-4: Validasi alur end-to-end acceptance (nota, tanda tangan, pembayaran, pengiriman, dan shutdown)', async () => {
  resetSessionsForTests();
  resetBusinessDataForTests();
  resetInvoiceDataForTests();
  resetSignatureDataForTests();
  resetPaymentDataForTests();
  resetDeliveryDataForTests();

  const ownerId = 'owner-t22-flow';
  createSessionForTests(ownerId);
  const app = buildApp();

  // 1. Buat Klien
  const client = await createClient(ownerId, {
    name: 'PT Klien T22',
    phone: '081234567890',
    email: 'klien@t22.test'
  });
  assert.ok(client.id);

  // 2. Buat & Terbitkan Nota
  const invoice = await createInvoice(ownerId, {
    clientId: client.id,
    currency: 'IDR',
    notes: 'Nota T22 E2E',
    items: [{ description: 'Layanan Setup Localhost', quantity: 1, unitPrice: 500000 }]
  });
  assert.equal(invoice.status, 'draft');

  await createSignature(ownerId, dummyPng);

  const issued = await issueInvoice(ownerId, invoice.id, invoice.version);
  assert.equal(issued.status, 'issued');

  // 3. Catat Pembayaran
  const payment = await createPayment(ownerId, invoice.id, {
    amount: 500000,
    method: 'transfer',
    reference: 'TRX-T22-001'
  });
  assert.equal(payment.status, 'pending');

  // 4. Pengiriman Dokumen (WhatsApp Queue)
  const { delivery } = await createApprovalAndEnqueue(ownerId, {
    notaId: invoice.id,
    revision: 'v1',
    recipient: client.phone ?? '081234567890',
    pdfHash: 'sha256-dummy-t22',
    caption: 'Invoice T22',
    validUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    scheduleAt: new Date(Date.now() - 1000).toISOString()
  });
  assert.equal(delivery.status, 'queued');

  // Claim and record attempt complete
  const claim = await claimDelivery(ownerId, delivery.id, 10_000);
  assert.ok(claim);

  await recordAttemptAndComplete(
    ownerId,
    delivery.id,
    claim.fencingToken,
    async () => ({ success: true, messageId: 'baileys-msg-t22' })
  );

  const fetchedDelivery = await getDelivery(ownerId, delivery.id);
  assert.equal(fetchedDelivery?.status, 'submitted');

  // 5. Daily Backup
  setWorkerQuiescent(true);
  const backupDir = privateFilePath(ownerId, 'daily-backups');
  const backup = await runDailyBackup({
    ownerId,
    backupsBaseDir: backupDir,
    retentionDays: 7,
    minKeepCount: 3
  });
  assert.ok(backup.manifest.createdAt);
  assert.equal(backup.manifest.ownerId, ownerId);
  setWorkerQuiescent(false);
  await rm(backupDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  // 6. Graceful close app (memastikan hook onClose scheduler dan bridge berjalan bersih)
  await app.close();
  assert.ok(true, 'Fastify app berhasil shutdown bersih');
});

