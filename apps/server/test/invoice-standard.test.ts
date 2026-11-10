import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoiceSchema } from '@synectra/contracts';
import { terbilang } from '../src/modules/invoice/application/terbilang';
import { invoiceHtml } from '../src/modules/invoice/application/pdf-template';
import { resetBusinessDataForTests } from '../src/modules/business/application/business-service';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests } from '../src/modules/auth/application/auth-service';

const png = 'data:image/png;base64,iVBORw0KGgo=';

test('terbilang writes Indonesian rupiah amounts', () => {
  assert.equal(terbilang(0), 'nol rupiah');
  assert.equal(terbilang(11), 'sebelas rupiah');
  assert.equal(terbilang(115), 'seratus lima belas rupiah');
  assert.equal(terbilang(1_000), 'seribu rupiah');
  assert.equal(terbilang(2_500_000), 'dua juta lima ratus ribu rupiah');
  assert.equal(terbilang(1_234_567), 'satu juta dua ratus tiga puluh empat ribu lima ratus enam puluh tujuh rupiah');
  assert.equal(terbilang(7_000_000_000), 'tujuh miliar rupiah');
  assert.throws(() => terbilang(-1));
  assert.throws(() => terbilang(1.5));
});

test('business profile route saves invoice identity and payment fields (empty optional fields allowed)', async () => {
  resetBusinessDataForTests();
  const app = buildApp();
  const { token, session } = createSessionForTests('profile-owner');
  const headers = { cookie: `synectra_session=${token}`, 'x-csrf-token': session.csrfToken };
  const res = await app.inject({
    method: 'PUT',
    url: '/api/business/profile',
    headers,
    body: { businessName: 'Synectra Studio', signerName: 'Khairul', bankName: 'BCA', bankAccountNumber: '1234567890', bankAccountName: 'Synectra Studio', npwp: '', email: '' }
  });
  assert.equal(res.statusCode, 200);
  const profile = res.json().profile;
  assert.equal(profile.bankName, 'BCA');
  assert.equal(profile.npwp, undefined);
  const invalid = await app.inject({ method: 'PUT', url: '/api/business/profile', headers, body: { businessName: 'X', signerName: 'Y', bankAccountNumber: 'abc' } });
  assert.equal(invalid.statusCode, 422);
  await app.close();
});

test('invoice template prints seller/buyer identity, item table, terbilang and transfer instructions', () => {
  const invoice = invoiceSchema.parse({
    id: 'inv-std', clientId: 'c-1', number: 'INV-202611-000007',
    items: [{ description: 'Desain logo', quantity: 2, unitPrice: 1_250_000 }],
    subtotal: 2_500_000, total: 2_500_000, status: 'issued', version: 1,
    revisions: [{ version: 1, snapshot: {}, createdAt: '2026-11-03T03:00:00.000Z' }]
  });
  const profile = {
    businessName: 'Synectra Studio', signerName: 'Khairul', timezone: 'Asia/Jakarta', communicationPreference: 'whatsapp' as const,
    address: 'Jl. Merdeka 1, Medan', phone: '6281200000001', email: 'halo@synectra.test', npwp: '01.234.567.8-901.000',
    bankName: 'BCA', bankAccountNumber: '1234567890', bankAccountName: 'Synectra Studio', invoiceNotes: 'Denda 2% per bulan untuk keterlambatan.'
  };
  const client = { id: 'c-1', name: 'PT Arunika', phone: '6281377788899', email: 'finance@arunika.test', address: 'Jl. Sudirman 9, Jakarta', communicationPreference: 'whatsapp' as const, categoryIds: [] };
  const html = invoiceHtml(invoice, { verified: 0, remaining: 2_500_000, overpaid: 0 }, png, profile, client, []);

  for (const expected of [
    /Jl\. Merdeka 1, Medan/, /\+62 812-0000-0001/, /halo@synectra\.test/, /NPWP 01\.234\.567\.8-901\.000/,
    /PT Arunika/, /Jl\. Sudirman 9, Jakarta/, /\+62 813-7778-8899/,
    /<th class="no">No<\/th><th>Deskripsi<\/th>/, /Harga satuan/, /Rp 1\.250\.000/, /Subtotal/, /Rp 2\.500\.000/,
    /Dua juta lima ratus ribu rupiah/, /Instruksi pembayaran/, /1234567890/, /Cantumkan nomor INV-202611-000007/,
    /Denda 2% per bulan/
  ]) assert.match(html, expected);
  // Tanggal terbit dan status tercetak; jatuh tempo tidak.
  assert.match(html, /Tanggal terbit<\/dt><dd>3 November 2026/);
  assert.match(html, /Status<\/dt><dd>Belum lunas/);
  assert.doesNotMatch(html, /Jatuh tempo/);

  // Tanpa rekening, kotak instruksi tidak dicetak; NPWP kosong tidak dicetak.
  const bare = invoiceHtml(invoice, { verified: 0, remaining: 2_500_000, overpaid: 0 }, png, { ...profile, bankName: undefined, bankAccountNumber: undefined, npwp: undefined }, client, []);
  assert.doesNotMatch(bare, /Instruksi pembayaran|NPWP/);
});
