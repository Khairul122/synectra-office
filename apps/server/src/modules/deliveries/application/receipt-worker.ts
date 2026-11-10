import type { WhatsappService } from '../../whatsapp/application/whatsapp-service';
import { getInvoice } from '../../invoice/application/invoice-service';
import { getClient } from '../../business/application/business-service';
import { findLatestPdfAssetForInvoice, generateInvoicePdf, readPdf } from '../../invoice/application/pdf-service';
import { reportHermesReceipt } from '../../hermes/application/hermes-service';
import { getInvoicePayments, listPayments, paymentFingerprint } from '../../payment/application/payment-service';
import { createApprovalAndEnqueue } from './delivery-service';
import { DeliverySendError, sendPreparedDelivery } from './send-prepared-delivery';
import { claimReceiptJob, finishReceiptJob, listReceiptJobs, receiptOwners } from './receipt-jobs';

export function createReceiptWorker(whatsapp: WhatsappService, intervalMs = 15000) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let cycle: Promise<void> | undefined;
  let rerun = false;
  async function runOnce() {
    if (cycle) { rerun = true; return cycle; }
    cycle = (async () => {
      do {
        rerun = false;
      for (const ownerId of await receiptOwners()) {
        for (const job of await listReceiptJobs(ownerId)) {
          if (job.status === 'processing') { await claimReceiptJob(ownerId, job.paymentId); continue; }
          if (job.status !== 'queued' || whatsapp.getPairStatus().status !== 'connected') continue;
          const claimed = await claimReceiptJob(ownerId, job.paymentId);
          if (!claimed) continue;
          let sending = false;
          let invoiceNumber = job.invoiceId;
          try {
            const payment = (await listPayments(ownerId)).find(item => item.id === job.paymentId);
            if (!payment || payment.status !== 'verified' || payment.version !== (job.paymentVersion ?? 1)) throw new Error('Pembayaran telah berubah. Periksa nota sebelum mengirim.');
            const invoice = await getInvoice(ownerId, job.invoiceId);
            if (!invoice || (invoice.status !== 'issued' && invoice.status !== 'paid')) throw new Error('Nota belum terbit atau tidak ditemukan.');
            invoiceNumber = invoice.number ?? invoice.id;
            const client = await getClient(ownerId, invoice.clientId);
            if (!client) throw new Error('Klien tidak ditemukan.');
            const fingerprint = paymentFingerprint(await getInvoicePayments(ownerId, invoice.id));
            let pdf = await findLatestPdfAssetForInvoice(ownerId, invoice.id);
            if (pdf && pdf.invoiceVersion === invoice.version && pdf.paymentFingerprint === fingerprint) {
              try { await readPdf(ownerId, pdf); } catch { pdf = null; }
            } else pdf = null;
            if (!pdf) pdf = await generateInvoicePdf(ownerId, invoice.id);
            if (pdf.paymentFingerprint !== paymentFingerprint(await getInvoicePayments(ownerId, invoice.id))) throw new Error('Pembayaran berubah saat PDF dibuat. Coba lagi.');
            const now = new Date();
            const { delivery } = await createApprovalAndEnqueue(ownerId, { notaId: invoice.id, revision: `${invoice.version}:${payment.id}`, recipient: client.phone, pdfHash: pdf.sha256, caption: `Nota ${invoice.number ?? invoice.id} untuk ${client.name}`, scheduleAt: now.toISOString(), validUntil: new Date(now.getTime() + 7 * 86400000).toISOString() });
            sending = true;
            const result = await sendPreparedDelivery(ownerId, delivery.id, whatsapp);
            const outcome = result.status === 'submitted' ? 'submitted' : result.status === 'duplicate' ? 'duplicate' : result.status === 'unknown' || result.status === 'review' ? 'review' : 'failed';
            const saved = await finishReceiptJob(ownerId, claimed, { status: outcome === 'submitted' || outcome === 'duplicate' ? 'submitted' : outcome, deliveryId: delivery.id, ...(outcome === 'submitted' || outcome === 'duplicate' ? {} : { error: outcome === 'review' ? 'Status pengiriman tidak pasti. Periksa WhatsApp sebelum mengirim ulang.' : 'Pengiriman gagal. Periksa nomor WhatsApp dan coba lagi.' }) });
            if (saved) await reportHermesReceipt(ownerId, invoiceNumber, outcome).catch(() => undefined);
          } catch (error) {
            const message = error instanceof Error && error.message === 'Signature not configured' ? 'Simpan tanda tangan pada tab Tanda tangan terlebih dahulu.' : error instanceof Error ? error.message : 'Nota gagal disiapkan.';
            const uncertain = sending && !(error instanceof DeliverySendError);
            const saved = await finishReceiptJob(ownerId, claimed, { status: uncertain ? 'review' : 'failed', error: uncertain ? 'Status pengiriman tidak pasti. Periksa WhatsApp sebelum mengirim ulang.' : message });
            if (saved) await reportHermesReceipt(ownerId, invoiceNumber, uncertain ? 'review' : 'failed', message).catch(() => undefined);
          }
        }
      }
      } while (rerun);
    })().finally(() => { cycle = undefined; });
    return cycle;
  }
  return {
    runOnce,
    start() { if (timer) return; timer = setInterval(() => { void runOnce().catch(() => undefined); }, intervalMs); void runOnce().catch(() => undefined); },
    stop() { if (timer) clearInterval(timer); timer = undefined; }
  };
}
