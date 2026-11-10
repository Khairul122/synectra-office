import type { WhatsappService } from '../../whatsapp/application/whatsapp-service';
import { findPdfAssetByHash, readPdf } from '../../invoice/application/pdf-service';
import { getInvoicePayments, paymentFingerprint } from '../../payment/application/payment-service';
import { claimDelivery, getApproval, getDelivery, recordAttemptAndComplete } from './delivery-service';
import { completeInvoiceSend, reserveInvoiceSend } from './invoice-send-guard';
import { beginStaffActivity } from '../../office/application/staff-activity';

export class DeliverySendError extends Error { constructor(message: string, readonly statusCode: number) { super(message); } }
export async function sendPreparedDelivery(ownerId: string, deliveryId: string, whatsapp: WhatsappService) {
  const finishActivity = beginStaffActivity(ownerId, 'communication', 'Memproses pengiriman WhatsApp');
  try {
  const delivery = await getDelivery(ownerId, deliveryId);
  if (!delivery) throw new DeliverySendError('Delivery not found', 404);
  const approval = await getApproval(ownerId, delivery.approvalId);
  if (!approval) throw new DeliverySendError('Delivery approval not found', 404);
  const pdf = await findPdfAssetByHash(ownerId, approval.notaId, approval.pdfHash);
  if (!pdf) throw new DeliverySendError('PDF file asset not found for invoice', 404);
  if (!pdf.paymentFingerprint || pdf.paymentFingerprint !== paymentFingerprint(await getInvoicePayments(ownerId, approval.notaId))) throw new DeliverySendError('Data pembayaran berubah atau PDF lama. Buat PDF dan antrekan ulang.', 409);
  let buffer: Buffer;
  try { buffer = await readPdf(ownerId, pdf); } catch { throw new DeliverySendError('PDF tidak tersedia atau checksum tidak cocok.', 409); }
  const reserved = await reserveInvoiceSend(ownerId, { invoiceId: approval.notaId, invoiceVersion: pdf.invoiceVersion, recipient: approval.recipient, fingerprint: pdf.paymentFingerprint, deliveryId });
  if (reserved.status !== 'reserved') return { status: reserved.status, delivery } as const;
  let dispatchStarted = false;
  try {
    const claim = await claimDelivery(ownerId, deliveryId);
    if (!claim) { await completeInvoiceSend(ownerId, reserved.key, reserved.token, 'failed'); throw new DeliverySendError('Antrean tidak dapat diproses atau sedang digunakan.', 409); }
    const updated = await recordAttemptAndComplete(ownerId, deliveryId, claim.fencingToken, async () => {
      if (pdf.paymentFingerprint !== paymentFingerprint(await getInvoicePayments(ownerId, approval.notaId))) return { success: false, error: 'Pembayaran berubah sebelum pengiriman.' };
      dispatchStarted = true;
      const sent = await whatsapp.sendPdf(approval.recipient, buffer, `nota-${approval.notaId}.pdf`, approval.caption);
      return { success: sent.success, messageId: sent.messageId, error: sent.error, unknown: sent.deliveryStatus === 'unknown' };
    });
    const status = updated.status === 'submitted' ? 'submitted' : updated.status === 'unknown' ? 'unknown' : 'failed';
    await completeInvoiceSend(ownerId, reserved.key, reserved.token, status, updated.messageId);
    return { status, delivery: updated } as const;
  } catch (error) {
    await completeInvoiceSend(ownerId, reserved.key, reserved.token, dispatchStarted ? 'unknown' : 'failed').catch(() => undefined);
    throw error;
  }
  } finally { finishActivity(); }
}
