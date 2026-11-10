import { createHash, randomUUID } from 'node:crypto';
import { normalizeIndonesianPhone } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { findPdfAssetByHash } from '../../invoice/application/pdf-service';
import { listDeliveries } from './delivery-service';

type SendGuard = { status: 'sending' | 'submitted' | 'unknown' | 'failed'; token: string; deliveryId: string; messageId?: string };
type Snapshot = { invoiceId: string; invoiceVersion: number; recipient: string; fingerprint: string; deliveryId: string };
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
const memory = new Map<string, SendGuard>();
function keyOf(item: Snapshot) { return createHash('sha256').update(JSON.stringify([item.invoiceId, item.invoiceVersion, normalizeIndonesianPhone(item.recipient), item.fingerprint])).digest('hex'); }
function ref(ownerId: string, key: string) { return getAppFirestore().collection('owners').doc(ownerId).collection('invoice_send_guards').doc(key); }

export async function reserveInvoiceSend(ownerId: string, snapshot: Snapshot): Promise<{ status: 'reserved'; token: string; key: string } | { status: 'duplicate' | 'review' }> {
  const recipient = normalizeIndonesianPhone(snapshot.recipient);
  for (const entry of await listDeliveries(ownerId)) {
    const { delivery, approval } = entry;
    if (delivery.id === snapshot.deliveryId || !approval || approval.notaId !== snapshot.invoiceId) continue;
    let priorRecipient: string; try { priorRecipient = normalizeIndonesianPhone(approval.recipient); } catch { continue; }
    if (priorRecipient !== recipient) continue;
    if (!['submitted', 'delivered', 'read', 'sending', 'unknown', 'review'].includes(delivery.status)) continue;
    const prior = await findPdfAssetByHash(ownerId, approval.notaId, approval.pdfHash);
    if (prior && (prior.invoiceVersion !== snapshot.invoiceVersion || prior.paymentFingerprint !== snapshot.fingerprint)) continue;
    return { status: prior && ['submitted', 'delivered', 'read'].includes(delivery.status) ? 'duplicate' : 'review' };
  }
  const key = keyOf(snapshot), token = randomUUID();
  const reserve = (current?: SendGuard) => {
    if (current?.status === 'submitted') return { status: 'duplicate' as const };
    if (current && current.status !== 'failed') return { status: 'review' as const };
    return { status: 'reserved' as const, token, key };
  };
  if (useFirestore) return getAppFirestore().runTransaction(async tx => {
    const document = ref(ownerId, key), snap = await tx.get(document); const result = reserve(snap.data() as SendGuard | undefined);
    if (result.status === 'reserved') tx.set(document, { status: 'sending', token, deliveryId: snapshot.deliveryId, updatedAt: new Date().toISOString() });
    return result;
  });
  const memoryKey = `${ownerId}:${key}`, result = reserve(memory.get(memoryKey));
  if (result.status === 'reserved') memory.set(memoryKey, { status: 'sending', token, deliveryId: snapshot.deliveryId });
  return result;
}

export async function completeInvoiceSend(ownerId: string, key: string, token: string, status: 'submitted' | 'unknown' | 'failed', messageId?: string) {
  const update = (current?: SendGuard): SendGuard | undefined => current?.status === 'sending' && current.token === token ? { ...current, status, ...(messageId ? { messageId } : {}) } : undefined;
  if (useFirestore) return getAppFirestore().runTransaction(async tx => {
    const document = ref(ownerId, key), snap = await tx.get(document); const next = update(snap.data() as SendGuard | undefined);
    if (next) tx.set(document, { ...next, updatedAt: new Date().toISOString() });
  });
  const memoryKey = `${ownerId}:${key}`, next = update(memory.get(memoryKey)); if (next) memory.set(memoryKey, next);
}
export function resetInvoiceSendGuardsForTests() { memory.clear(); }
