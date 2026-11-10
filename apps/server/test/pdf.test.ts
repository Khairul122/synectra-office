import assert from 'node:assert/strict';
import { unlink, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createInvoice, issueInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';
import { createSignature, getCurrentSignature, reconcileSignatureAssets, resetSignatureDataForTests } from '../src/modules/invoice/application/signature-service';
import { generateInvoicePdf, readPdf, reconcilePdfAssets, resetPdfDataForTests } from '../src/modules/invoice/application/pdf-service';
import { createPayment, resetPaymentDataForTests, verifyPayment } from '../src/modules/payment/application/payment-service';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('stores versioned private signature and renders invoice PDF with checksum', async () => {
  resetInvoiceDataForTests(); resetPaymentDataForTests(); resetSignatureDataForTests(); resetPdfDataForTests();
  const signature = await createSignature('pdf-owner', png);
  assert.equal(signature.version, 1);
  const invoice = await createInvoice('pdf-owner', { clientId: 'client-1', items: [{ description: 'Long service title '.repeat(8), quantity: 1, unitPrice: 125000 }] });
  await issueInvoice('pdf-owner', invoice.id, invoice.version);
  const asset = await generateInvoicePdf('pdf-owner', invoice.id);
  assert.equal(asset.status, 'ready');
  assert.equal(asset.mimeType, 'application/pdf');
  assert.equal(asset.signatureAssetId, signature.id);
  const pdf = await readPdf('pdf-owner', asset);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal(pdf.length, asset.size);
  await assert.rejects(() => readPdf('other-owner', asset), /outside|ENOENT|checksum/i);
  const signaturePath = `${process.env.PRIVATE_FILES_ROOT ?? '.local/private'}/pdf-owner/${signature.relativePath}`;
  await unlink(signaturePath);
  assert.deepEqual(await reconcileSignatureAssets('pdf-owner'), { checked: 1, removed: [signature.id] });
  await unlink(`${process.env.PRIVATE_FILES_ROOT ?? '.local/private'}/pdf-owner/${asset.relativePath}`);
  assert.deepEqual(await reconcilePdfAssets('pdf-owner'), { checked: 1, removed: [asset.id] });
  assert.equal(await getCurrentSignature('pdf-owner'), null);
});

test('renders 30 payment rows through summary and keeps signature versions traceable', async () => {
  resetInvoiceDataForTests(); resetPaymentDataForTests(); resetPdfDataForTests(); resetSignatureDataForTests();
  const invoice = await createInvoice('version-owner', { clientId: 'client-1', items: [{ description: 'Service', quantity: 1, unitPrice: 3000000 }] });
  await issueInvoice('version-owner', invoice.id, invoice.version);
  for (let index = 0; index < 30; index += 1) {
    const payment = await createPayment('version-owner', invoice.id, { amount: 100000, method: 'transfer', reference: `TRX-${index}` });
    await verifyPayment('version-owner', payment.id);
  }
  const first = await createSignature('version-owner', png);
  const second = await createSignature('version-owner', png);
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal((await getCurrentSignature('version-owner'))?.id, second.id);
  const pdf = await generateInvoicePdf('version-owner', invoice.id);
  assert.equal(pdf.signatureAssetId, second.id);
});

test('rejects invalid signature and leaves no usable asset', async () => {
  resetSignatureDataForTests();
  await assert.rejects(() => createSignature('pdf-owner', 'data:image/png;base64,invalid'), /Invalid PNG signature/);
});

test('signature preview returns only the current owner image and detects damaged files', async () => {
  resetSignatureDataForTests();
  const { buildApp } = await import('../src/bootstrap/app');
  const { createSessionForTests } = await import('../src/modules/auth/application/auth-service');
  const { privateFilePath } = await import('../src/infrastructure/private-files');
  const app = buildApp();
  const owner = 'signature-preview-owner';
  const session = createSessionForTests(owner);
  const other = createSessionForTests('signature-preview-other');
  const headers = { cookie: `synectra_session=${session.token}` };
  const request = (requestHeaders = headers) => app.inject({ method: 'GET', url: '/api/signatures/current', headers: requestHeaders });
  assert.equal((await request({ cookie: '' })).statusCode, 401);
  assert.equal((await request()).statusCode, 404);
  const first = await createSignature(owner, png);
  const bytes = Buffer.concat([Buffer.from(png.split(',')[1]!, 'base64'), Buffer.from('x')]);
  const second = await createSignature(owner, `data:image/png;base64,${bytes.toString('base64')}`);
  assert.equal((await request({ cookie: `synectra_session=${other.token}` })).statusCode, 404);
  const preview = await request();
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.headers['content-type'], 'image/png');
  assert.match(String(preview.headers['cache-control']), /no-store/);
  assert.deepEqual(preview.rawPayload, bytes);
  await writeFile(privateFilePath(owner, second.relativePath), 'damaged');
  assert.equal((await request()).statusCode, 409);
  await unlink(privateFilePath(owner, first.relativePath));
  await unlink(privateFilePath(owner, second.relativePath));
  await app.close();
});

 test('template renders the real invoice parties and escapes user content', async () => {
  const { invoiceHtml } = await import('../src/modules/invoice/application/pdf-template');
  const { invoiceSchema } = await import('@synectra/contracts');
  const invoice = invoiceSchema.parse({
    id: 'invoice-1', clientId: 'client-1', number: 'INV-202611-000001',
    items: [{ description: '<script>alert(1)</script>', quantity: 2, unitPrice: 125000 }],
    subtotal: 250000, total: 250000, status: 'issued', version: 1,
    revisions: [{ version: 1, snapshot: {}, createdAt: '2026-11-03T03:00:00.000Z' }],
  });
  const html = invoiceHtml(invoice, { verified: 100000, remaining: 150000, overpaid: 0 }, png,
    { businessName: 'Synectra & Co', signerName: 'Pemilik', timezone: 'Asia/Jakarta', communicationPreference: 'whatsapp' },
    { id: 'client-1', name: 'Klien <Utama>', phone: '6281234567890', communicationPreference: 'whatsapp', categoryIds: [] },
    [{ id: 'payment-1', invoiceId: 'invoice-1', amount: 100000, method: 'transfer', reference: 'TEST-1', status: 'verified', version: 1, createdAt: '2026-11-03T03:00:00.000Z', verifiedAt: '2026-11-03T03:00:00.000Z' }]);
  assert.match(html, /Synectra &amp; Co/);
  assert.match(html, /Klien &lt;Utama&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /INV-202611-000001/);
  assert.match(html, /3 November 2026/);
  assert.match(html, /Riwayat Pembayaran/);
  assert.match(html, /Transfer/);
  assert.match(html, /Terverifikasi/);
  assert.match(html, /Rp 100\.000/);
  assert.match(html, /Rp 250\.000/);
  assert.match(html, /Rp 150\.000/);
  assert.match(html, /Belum lunas/);
  const paidHtml = invoiceHtml(invoice, { verified: 250000, remaining: 0, overpaid: 0 }, png, null, null, []);
  assert.match(paidHtml, /Status<\/dt><dd>Lunas/);
  assert.match(paidHtml, /Sisa tagihan<\/td><td>Rp 0</);
  assert.doesNotMatch(html, /FAKTUR PAJAK|Freelancer/);
});

test('generated invoice with client and payment is the PDF previewed and sent', async () => {
  const { buildApp } = await import('../src/bootstrap/app');
  const { createSessionForTests } = await import('../src/modules/auth/application/auth-service');
  const { createClient, saveProfile } = await import('../src/modules/business/application/business-service');
  const owner = 'pdf-delivery-owner';
  const client = await createClient(owner, { name: 'Klien PDF', phone: '081234567890', email: 'klien@example.com' });
  await saveProfile(owner, { businessName: 'Synectra', signerName: 'Admin' });
  const invoice = await createInvoice(owner, { clientId: client.id, items: [{ description: 'Jasa', quantity: 1, unitPrice: 1300000 }] });
  await issueInvoice(owner, invoice.id, invoice.version);
  const payment = await createPayment(owner, invoice.id, { amount: 650000, method: 'transfer', reference: 'DP' });
  await verifyPayment(owner, payment.id);
  await createSignature(owner, png);
  const session = createSessionForTests(owner);
  let sent: Buffer | undefined;
  const whatsapp = { sendPdf: async (_phone: string, buffer: Buffer) => { sent = buffer; return { success: true, messageId: 'mock-message' }; }, disconnect: () => ({ status: 'unpaired' }) };
  const app = buildApp({ whatsappService: whatsapp as any });
  const headers = { cookie: `synectra_session=${session.token}`, 'x-csrf-token': session.session.csrfToken };
  const generated = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/pdf`, headers });
  assert.equal(generated.statusCode, 201);
  const approval = await app.inject({ method: 'POST', url: '/api/deliveries/approvals', headers, payload: { notaId: invoice.id, revision: String(invoice.version), recipient: client.phone, pdfHash: generated.json().pdf.sha256, caption: 'Nota', scheduleAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString() } });
  assert.equal(approval.statusCode, 201);
  const id = approval.json().delivery.id;
  const preview = await app.inject({ method: 'GET', url: `/api/deliveries/${id}/pdf`, headers });
  assert.equal(preview.statusCode, 200);
  const laterPayment = await createPayment(owner, invoice.id, { amount: 100000, method: 'transfer', reference: 'Termin' });
  await verifyPayment(owner, laterPayment.id);
  const staleSend = await app.inject({ method: 'POST', url: `/api/deliveries/${id}/send`, headers });
  assert.equal(staleSend.statusCode, 409); assert.equal(sent, undefined);
  const updatedPdf = await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/pdf`, headers });
  const updatedApproval = await app.inject({ method: 'POST', url: '/api/deliveries/approvals', headers, payload: { notaId: invoice.id, revision: String(invoice.version), recipient: client.phone, pdfHash: updatedPdf.json().pdf.sha256, caption: 'Nota', scheduleAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString() } });
  const updatedId = updatedApproval.json().delivery.id;
  const updatedPreview = await app.inject({ method: 'GET', url: `/api/deliveries/${updatedId}/pdf`, headers });
  const result = await app.inject({ method: 'POST', url: `/api/deliveries/${updatedId}/send`, headers });
  assert.equal(result.json().delivery.status, 'submitted');
  assert.deepEqual(sent, updatedPreview.rawPayload);
  await app.close();
});
