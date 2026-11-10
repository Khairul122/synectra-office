import { createHash, randomUUID } from 'node:crypto';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { getInvoice } from '../../invoice/application/invoice-service';
import { newReceiptJob, receiptJobRef, saveMemoryReceiptJob } from '../../deliveries/application/receipt-jobs';
import { invoiceSchema, paymentInputSchema, paymentSchema, type Payment, type PaymentInput } from '@synectra/contracts';

const payments = new Map<string, Map<string, Payment>>();
const auditEvents = new Map<string, Array<Record<string, unknown>>>();
const paymentKeys = new Map<string, { fingerprint: string; payment: Payment }>();
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
function audit(ownerId: string, event: Record<string, unknown>) { const events = auditEvents.get(ownerId) ?? []; events.push(event); auditEvents.set(ownerId, events); }
function auditRef(ownerId: string) { return ownerRef(ownerId).collection('audit'); }
function ownerPayments(ownerId: string) { let value = payments.get(ownerId); if (!value) { value = new Map(); payments.set(ownerId, value); } return value; }
function ownerRef(ownerId: string) { return getAppFirestore().collection('owners').doc(ownerId); }
function paymentRef(ownerId: string, id: string) { return ownerRef(ownerId).collection('payments').doc(id); }
function invoiceRef(ownerId: string, id: string) { return ownerRef(ownerId).collection('invoices').doc(id); }
function input(value: unknown): PaymentInput { return paymentInputSchema.parse(value); }

export async function createPayment(ownerId: string, invoiceId: string, value: unknown, confirmed = false, idempotencyKey?: string) {
  const invoice = await getInvoice(ownerId, invoiceId); if (!invoice) throw new Error('Invoice not found');
  if (confirmed && invoice.status !== 'issued' && invoice.status !== 'paid') throw new Error('Invoice must be issued');
  const parsed = input(value);
  const fingerprint = createHash('sha256').update(JSON.stringify({ invoiceId, input: parsed, confirmed })).digest('hex');
  const key = idempotencyKey ? createHash('sha256').update(`payment:${idempotencyKey}`).digest('hex') : undefined;
  const createdAt = new Date().toISOString();
  const payment = paymentSchema.parse({ ...parsed, id: randomUUID(), invoiceId, status: confirmed ? 'verified' : 'pending', createdAt, ...(confirmed ? { verifiedAt: createdAt } : {}) });
  if (useFirestore) {
    const db = getAppFirestore();
    return db.runTransaction(async (transaction) => {
      const keyRef = key ? ownerRef(ownerId).collection('idempotency').doc(key) : null;
      const [invoiceSnapshot, keySnapshot] = await Promise.all([transaction.get(invoiceRef(ownerId, invoiceId)), keyRef ? transaction.get(keyRef) : Promise.resolve(null)]);
      if (!invoiceSnapshot.exists) throw new Error('Invoice not found');
      const currentInvoice = invoiceSchema.parse(invoiceSnapshot.data());
      if (confirmed && currentInvoice.status !== 'issued' && currentInvoice.status !== 'paid') throw new Error('Invoice must be issued');
      if (keySnapshot?.exists) {
        if (keySnapshot.data()?.fingerprint !== fingerprint) throw new Error('Conflict: idempotency key reused');
        return paymentSchema.parse(keySnapshot.data()?.payment);
      }
      transaction.create(paymentRef(ownerId, payment.id), payment);
      if (confirmed) transaction.create(receiptJobRef(ownerId, payment.id), newReceiptJob(payment.id, invoiceId, createdAt));
      transaction.create(auditRef(ownerId).doc(), { action: 'payment.created', paymentId: payment.id, invoiceId, actorId: ownerId, createdAt: payment.createdAt, confirmed });
      if (keyRef) transaction.create(keyRef, { fingerprint, payment, createdAt });
      return structuredClone(payment);
    });
  }
  const keyRecord = key ? paymentKeys.get(`${ownerId}:${key}`) : undefined;
  if (keyRecord) { if (keyRecord.fingerprint !== fingerprint) throw new Error('Conflict: idempotency key reused'); return structuredClone(keyRecord.payment); }
  ownerPayments(ownerId).set(payment.id, payment); if (confirmed) saveMemoryReceiptJob(ownerId, newReceiptJob(payment.id, invoiceId, createdAt)); audit(ownerId, { action: 'payment.created', paymentId: payment.id, invoiceId, actorId: ownerId, createdAt: payment.createdAt, confirmed });
  if (key) paymentKeys.set(`${ownerId}:${key}`, { fingerprint, payment });
  return structuredClone(payment);
}
export async function verifyPayment(ownerId: string, id: string) {
  const ref = paymentRef(ownerId, id);
  if (useFirestore) {
    const result = await getAppFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new Error('Payment not found');
      const payment = paymentSchema.parse(snapshot.data()); if (payment.status === 'reversed') throw new Error('Payment is reversed');
      if (payment.status === 'verified') return payment;
      const next = paymentSchema.parse({ ...payment, version: payment.version + 1, status: 'verified', verifiedAt: new Date().toISOString() }); transaction.set(ref, next); transaction.create(auditRef(ownerId).doc(), { action: 'payment.verified', paymentId: id, invoiceId: payment.invoiceId, actorId: ownerId, createdAt: next.verifiedAt! }); return next;
    }); return structuredClone(result);
  }
  const payment = ownerPayments(ownerId).get(id); if (!payment) throw new Error('Payment not found'); if (payment.status === 'reversed') throw new Error('Payment is reversed');
  if (payment.status === 'verified') return structuredClone(payment);
  const next = paymentSchema.parse({ ...payment, version: payment.version + 1, status: 'verified', verifiedAt: new Date().toISOString() }); ownerPayments(ownerId).set(id, next); audit(ownerId, { action: 'payment.verified', paymentId: id, invoiceId: payment.invoiceId, actorId: ownerId, createdAt: next.verifiedAt! }); return structuredClone(next);
}
export async function reversePayment(ownerId: string, id: string, reason: string, expectedVersion?: number) {
  const reversalReason = zReason(reason);
  const ref = paymentRef(ownerId, id);
  if (useFirestore) {
    const result = await getAppFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new Error('Payment not found');
      const payment = paymentSchema.parse(snapshot.data()); if (payment.status === 'reversed') throw new Error('Payment already reversed');
      if (expectedVersion !== undefined && payment.version !== expectedVersion) throw new Error('Conflict: stale payment version');
      const next = paymentSchema.parse({ ...payment, version: payment.version + 1, status: 'reversed', reversedAt: new Date().toISOString(), reversalReason }); transaction.set(ref, next); transaction.create(auditRef(ownerId).doc(), { action: 'payment.reversed', paymentId: id, invoiceId: payment.invoiceId, actorId: ownerId, reason: reversalReason, createdAt: next.reversedAt! }); return next;
    }); return structuredClone(result);
  }
  const payment = ownerPayments(ownerId).get(id); if (!payment) throw new Error('Payment not found'); if (payment.status === 'reversed') throw new Error('Payment already reversed');
  if (expectedVersion !== undefined && payment.version !== expectedVersion) throw new Error('Conflict: stale payment version');
  const next = paymentSchema.parse({ ...payment, version: payment.version + 1, status: 'reversed', reversedAt: new Date().toISOString(), reversalReason }); ownerPayments(ownerId).set(id, next); audit(ownerId, { action: 'payment.reversed', paymentId: id, invoiceId: payment.invoiceId, actorId: ownerId, reason: reversalReason, createdAt: next.reversedAt! }); return structuredClone(next);
}
export async function updatePayment(ownerId: string, id: string, expectedVersion: number, value: unknown) {
  const parsed = input(value);
  const update = (payment: Payment) => {
    if (payment.status === 'reversed') throw new Error('Payment is reversed');
    if (payment.version !== expectedVersion) throw new Error('Conflict: stale payment version');
    return paymentSchema.parse({ ...payment, ...parsed, version: payment.version + 1 });
  };
  const at = new Date().toISOString();
  if (useFirestore) {
    return getAppFirestore().runTransaction(async transaction => {
      const ref = paymentRef(ownerId, id); const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Payment not found');
      const previous = paymentSchema.parse(snapshot.data()); const next = update(previous);
      transaction.set(ref, next);
      transaction.create(auditRef(ownerId).doc(), { action: 'payment.updated', paymentId: id, invoiceId: previous.invoiceId, actorId: ownerId, createdAt: at, previous, next });
      return structuredClone(next);
    });
  }
  const previous = ownerPayments(ownerId).get(id); if (!previous) throw new Error('Payment not found');
  const next = update(previous); ownerPayments(ownerId).set(id, next);
  audit(ownerId, { action: 'payment.updated', paymentId: id, invoiceId: previous.invoiceId, actorId: ownerId, createdAt: at, previous: structuredClone(previous), next: structuredClone(next) });
  return structuredClone(next);
}
export async function listPayments(ownerId: string) {
  const list = useFirestore ? (await ownerRef(ownerId).collection('payments').get()).docs.map(doc => paymentSchema.parse(doc.data())) : [...ownerPayments(ownerId).values()];
  return list.map(payment => structuredClone(payment)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function zReason(reason: string) { const value = reason.trim(); if (!value) throw new Error('Reversal reason required'); return value; }
export function paymentFingerprint(payments: Payment[]) {
  const snapshot = payments.map(payment => [payment.id, payment.amount, payment.method, payment.reference, payment.kind ?? null, payment.paymentDate ?? null, payment.status, payment.version, payment.createdAt, payment.verifiedAt ?? null, payment.reversedAt ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
export async function getInvoicePayments(ownerId: string, invoiceId: string) {
  return useFirestore ? (await ownerRef(ownerId).collection('payments').where('invoiceId', '==', invoiceId).get()).docs.map((doc) => paymentSchema.parse(doc.data())) : [...ownerPayments(ownerId).values()].filter((payment) => payment.invoiceId === invoiceId);
}
export async function getInvoicePaymentDetails(ownerId: string, invoiceId: string) {
  const list = await getInvoicePayments(ownerId, invoiceId);
  const verified = list.filter((payment) => payment.status === 'verified').reduce((sum, payment) => sum + payment.amount, 0);
  const invoice = await getInvoice(ownerId, invoiceId); if (!invoice) throw new Error('Invoice not found');
  return { payments: list.map((payment) => structuredClone(payment)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), summary: { verified, remaining: Math.max(invoice.total - verified, 0), overpaid: Math.max(verified - invoice.total, 0) } };
}
export async function getPaymentSummary(ownerId: string, invoiceId: string) { return (await getInvoicePaymentDetails(ownerId, invoiceId)).summary; }
export function listPaymentAuditForTests(ownerId: string) { return structuredClone(auditEvents.get(ownerId) ?? []); }
export function resetPaymentDataForTests() { payments.clear(); auditEvents.clear(); paymentKeys.clear(); }
