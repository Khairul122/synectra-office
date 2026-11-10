import type { BusinessProfile, Client, Invoice, Payment } from '@synectra/contracts';
import { terbilang } from './terbilang';

type PaymentSummary = { verified: number; remaining: number; overpaid: number };

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

/** 6281234567890 -> +62 812-3456-7890 */
function formatPhone(phone?: string) {
  if (!phone) return '';
  const local = phone.replace(/^62/, '');
  return phone.startsWith('62') ? `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}` : phone;
}

/**
 * Nota/invoice A4: identitas penjual & pembeli, nomor unik, tanggal terbit, status, tabel item, total + terbilang,
 * riwayat pembayaran, dan instruksi transfer.
 * Bukan faktur pajak; PPN/e-Faktur di luar cakupan template ini.
 */
export function invoiceHtml(
  invoice: Invoice,
  summary: PaymentSummary,
  signature: string,
  profile: BusinessProfile | null,
  client: Client | null,
  payments: Payment[]
) {
  const money = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
  const date = (value?: string) => value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value))
    : 'Tidak tersedia';
  const issuedAt = invoice.revisions.find((revision) => revision.version === invoice.version)?.createdAt;
  const businessName = profile?.businessName ?? 'Identitas usaha belum diatur';
  const sellerContact = [formatPhone(profile?.phone), profile?.email].filter(Boolean).join(' · ');
  const clientContact = [formatPhone(client?.phone), client?.email].filter(Boolean);
  const hasBank = Boolean(profile?.bankName && profile?.bankAccountNumber);
  const paymentMethods: Record<Payment['method'], string> = { cash: 'Tunai', transfer: 'Transfer', card: 'Kartu', other: 'Lainnya' };
  const paymentKinds = { dp: 'DP', termin_1: 'Termin 1', termin_2: 'Termin 2', settlement: 'Pelunasan' };
  const paymentStatuses: Record<Payment['status'], string> = { pending: 'Menunggu', verified: 'Terverifikasi', reversed: 'Dibatalkan' };
  const words = terbilang(invoice.total);

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 15mm 16mm; }
* { box-sizing: border-box; }
body { min-height: 267mm; margin: 0; display: flex; flex-direction: column; color: #111827; font: 9.5pt/1.4 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
p { margin: 0; overflow-wrap: anywhere; }
h2 { margin: 0; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; padding-bottom: 5mm; border-bottom: 2.5pt solid #111827; }
.seller strong { display: block; font-size: 17pt; line-height: 1.15; overflow-wrap: anywhere; }
.seller p { color: #4b5563; font-size: 8.5pt; }
.doc { flex: 0 0 auto; text-align: right; }
.doc .title { font-size: 20pt; font-weight: 700; letter-spacing: .08em; }
.doc .number { font-size: 11pt; font-weight: 700; }
.label { color: #6b7280; font-size: 7.5pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.parties { display: flex; justify-content: space-between; gap: 10mm; margin: 5mm 0; }
.bill-to { max-width: 55%; }
.meta { display: grid; grid-template-columns: auto auto; gap: 1mm 4mm; align-content: start; margin: 0; }
.meta dt { color: #6b7280; } .meta dd { margin: 0; font-weight: 700; text-align: right; }
.bill-to strong { display: block; margin-top: 1mm; font-size: 12pt; overflow-wrap: anywhere; }
.bill-to p { color: #4b5563; }
.section-title { margin: 6mm 0 2mm; font-size: 11pt; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { padding: 2mm 1.5mm; border-bottom: 1.5pt solid #111827; font-size: 8.5pt; text-align: left; }
td { padding: 2.2mm 1.5mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; overflow-wrap: anywhere; }
.num { text-align: right; white-space: nowrap; }
.items .no { width: 8mm; color: #6b7280; }
.items .qty { width: 14mm; }
.items .price, .items .amount { width: 32mm; }
.summary { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-top: 3mm; break-inside: avoid; }
.words { max-width: 52%; padding: 2.5mm 3mm; border-left: 2pt solid #111827; background: #f3f4f6; font-style: italic; }
.totals { width: 44%; }
.totals td { padding: 1.6mm 1.5mm; border: 0; }
.totals td:first-child { color: #4b5563; }
.totals td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
.totals .grand td { border-top: 1.5pt solid #111827; font-size: 11pt; color: #111827; }
.payments th:last-child, .payments td:last-child { text-align: right; }
.badge { display: inline-block; padding: .6mm 2.5mm; border-radius: 9mm; background: #eef2f6; font-size: 7.5pt; font-weight: 700; }
.badge.verified { background: #d1fae5; color: #066045; }
.badge.reversed { background: #fee4e2; color: #912018; }
.balance { width: 44%; margin: 3mm 0 0 auto; break-inside: avoid; }
.balance td { padding: 1.6mm 1.5mm; border: 0; }
.balance td:first-child { color: #4b5563; }
.balance td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
.balance .remaining td { background: #f3f4f6; color: #111827; font-size: 12pt; }
.pay-box { display: flex; gap: 8mm; margin-top: 6mm; padding: 3.5mm 4mm; border: 1px solid #d1d5db; border-radius: 2mm; break-inside: avoid; }
.pay-box dl { display: grid; grid-template-columns: 30mm 1fr; gap: .8mm 2mm; margin: 1.5mm 0 0; }
.pay-box dt { color: #4b5563; } .pay-box dd { margin: 0; font-weight: 700; }
.pay-box .hint { margin-top: 1.5mm; color: #4b5563; font-size: 8pt; }
.footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; margin-top: auto; padding-top: 10mm; break-inside: avoid; }
.notes { max-width: 55%; color: #4b5563; font-size: 8pt; }
.notes p + p { margin-top: 1.2mm; }
.signature { width: 36%; text-align: center; }
.signature img { display: block; max-width: 170px; max-height: 60px; margin: 2mm auto; }
.signature-name { padding-top: 1.5mm; border-top: 1.5pt solid #111827; font-weight: 700; overflow-wrap: anywhere; }
</style></head><body>
<header class="header">
  <div class="seller">
    <strong>${escapeHtml(businessName)}</strong>
    ${profile?.address ? `<p>${escapeHtml(profile.address)}</p>` : ''}
    ${sellerContact ? `<p>${escapeHtml(sellerContact)}</p>` : ''}
    ${profile?.npwp ? `<p>NPWP ${escapeHtml(profile.npwp)}</p>` : ''}
  </div>
  <div class="doc"><div class="title">INVOICE</div><div class="number">${escapeHtml(invoice.number ?? 'Draft')}</div></div>
</header>
<div class="parties">
  <div class="bill-to">
    <span class="label">Ditagihkan kepada</span>
    <strong>${escapeHtml(client?.name ?? 'Klien tidak tersedia')}</strong>
    ${client?.address ? `<p>${escapeHtml(client.address)}</p>` : ''}
    ${clientContact.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
  </div>
  <dl class="meta">
    <dt>Tanggal terbit</dt><dd>${escapeHtml(date(issuedAt))}</dd>
    <dt>Status</dt><dd>${summary.remaining === 0 ? 'Lunas' : 'Belum lunas'}</dd>
  </dl>
</div>

<h2 class="section-title">Rincian Tagihan</h2>
<table class="items"><thead><tr><th class="no">No</th><th>Deskripsi</th><th class="qty num">Qty</th><th class="price num">Harga satuan</th><th class="amount num">Jumlah</th></tr></thead>
<tbody>${invoice.items.map((item, index) => `<tr><td class="no">${index + 1}</td><td>${escapeHtml(item.description)}</td><td class="num">${item.quantity}</td><td class="num">${money(item.unitPrice)}</td><td class="num">${money(item.quantity * item.unitPrice)}</td></tr>`).join('')}</tbody></table>
<div class="summary">
  <p class="words"><span class="label">Terbilang</span><br>${escapeHtml(words.charAt(0).toUpperCase() + words.slice(1))}</p>
  <table class="totals"><tbody>
    <tr><td>Subtotal</td><td>${money(invoice.subtotal)}</td></tr>
    <tr class="grand"><td>Total tagihan</td><td>${money(invoice.total)}</td></tr>
  </tbody></table>
</div>

<h2 class="section-title">Riwayat Pembayaran</h2>
<table class="payments"><thead><tr><th>Jenis</th><th>Metode</th><th>Status</th><th>Tanggal</th><th>Jumlah</th></tr></thead><tbody>${payments.length ? payments.map((payment) => `<tr><td>${escapeHtml(payment.kind ? paymentKinds[payment.kind] : '-')}</td><td>${escapeHtml(paymentMethods[payment.method])}</td><td><span class="badge ${payment.status}">${escapeHtml(paymentStatuses[payment.status])}</span></td><td>${escapeHtml(date(payment.paymentDate ?? (payment.status === 'verified' ? payment.verifiedAt : payment.status === 'reversed' ? payment.reversedAt : payment.createdAt)))}</td><td>${money(payment.amount)}</td></tr>`).join('') : '<tr><td colspan="5">Belum ada pembayaran.</td></tr>'}</tbody></table>
<table class="balance"><tbody>
  <tr><td>Total tagihan</td><td>${money(invoice.total)}</td></tr>
  <tr><td>Total dibayar</td><td>${money(summary.verified)}</td></tr>
  ${summary.overpaid > 0 ? `<tr><td>Kelebihan bayar</td><td>${money(summary.overpaid)}</td></tr>` : ''}
  <tr class="remaining"><td>Sisa tagihan</td><td>${money(summary.remaining)}</td></tr>
</tbody></table>

${hasBank ? `<section class="pay-box"><div><span class="label">Instruksi pembayaran</span><dl>
  <dt>Bank</dt><dd>${escapeHtml(profile!.bankName)}</dd>
  <dt>Nomor rekening</dt><dd>${escapeHtml(profile!.bankAccountNumber)}</dd>
  ${profile!.bankAccountName ? `<dt>Atas nama</dt><dd>${escapeHtml(profile!.bankAccountName)}</dd>` : ''}
</dl><p class="hint">Cantumkan nomor ${escapeHtml(invoice.number ?? 'invoice')} pada berita transfer.</p></div></section>` : ''}

<footer class="footer">
  <div class="notes">
    ${profile?.invoiceNotes ? `<p>${escapeHtml(profile.invoiceNotes)}</p>` : ''}
    <p>Terima kasih atas kepercayaan Anda.</p>
  </div>
  <div class="signature"><div class="label">Hormat kami</div><img src="${escapeHtml(signature)}" alt="Tanda tangan pemilik"><div class="signature-name">${escapeHtml(profile?.signerName ?? 'Pemilik')}</div></div>
</footer>
</body></html>`;
}
