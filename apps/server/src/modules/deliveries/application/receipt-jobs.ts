import { randomUUID } from 'node:crypto';
import { getAppFirestore } from '../../../infrastructure/firestore';

export type ReceiptJob = {
  paymentId: string; invoiceId: string; paymentVersion: number; status: 'queued' | 'processing' | 'submitted' | 'failed' | 'review';
  createdAt: string; updatedAt: string; leaseUntil?: string; token?: string; deliveryId?: string; error?: string;
};
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
const jobs = new Map<string, Map<string, ReceiptJob>>();
function ownerJobs(ownerId: string) { let records = jobs.get(ownerId); if (!records) { records = new Map(); jobs.set(ownerId, records); } return records; }
export function receiptJobRef(ownerId: string, paymentId: string) { return getAppFirestore().collection('owners').doc(ownerId).collection('receipt_jobs').doc(paymentId); }
export function newReceiptJob(paymentId: string, invoiceId: string, createdAt: string, paymentVersion = 1): ReceiptJob { return { paymentId, invoiceId, paymentVersion, status: 'queued', createdAt, updatedAt: createdAt }; }
export function saveMemoryReceiptJob(ownerId: string, job: ReceiptJob) { ownerJobs(ownerId).set(job.paymentId, job); }
export async function enqueueExistingReceipt(ownerId: string, paymentId: string, invoiceId: string, paymentVersion: number) {
  const job = newReceiptJob(paymentId, invoiceId, new Date().toISOString(), paymentVersion);
  if (useFirestore) return getAppFirestore().runTransaction(async tx => { const ref = receiptJobRef(ownerId, paymentId); const existing = await tx.get(ref); if (existing.exists) return false; tx.create(ref, job); return true; });
  if (ownerJobs(ownerId).has(paymentId)) return false; ownerJobs(ownerId).set(paymentId, job); return true;
}
export async function listReceiptJobs(ownerId: string): Promise<ReceiptJob[]> {
  const items = useFirestore ? (await getAppFirestore().collection('owners').doc(ownerId).collection('receipt_jobs').get()).docs.map(doc => doc.data() as ReceiptJob) : [...ownerJobs(ownerId).values()];
  return items.map(item => structuredClone(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function receiptOwners(): Promise<string[]> {
  return useFirestore ? (await getAppFirestore().collection('owners').listDocuments()).map(ref => ref.id) : [...jobs.keys()];
}
export async function claimReceiptJob(ownerId: string, paymentId: string, now = new Date()): Promise<ReceiptJob | null> {
  const change = (job: ReceiptJob | undefined): ReceiptJob | null => {
    if (!job) return null;
    if (job.status === 'processing' && job.leaseUntil && job.leaseUntil <= now.toISOString()) return { ...job, status: 'review', error: 'Status pengiriman tidak pasti setelah server berhenti. Periksa WhatsApp sebelum mengirim ulang.', updatedAt: now.toISOString() };
    if (job.status !== 'queued') return null;
    return { ...job, status: 'processing', token: randomUUID(), leaseUntil: new Date(now.getTime() + 120000).toISOString(), updatedAt: now.toISOString() };
  };
  if (useFirestore) return getAppFirestore().runTransaction(async tx => {
    const ref = receiptJobRef(ownerId, paymentId); const snap = await tx.get(ref); const next = change(snap.data() as ReceiptJob | undefined);
    if (!next) return null; tx.set(ref, next); return next.status === 'processing' ? next : null;
  });
  const next = change(ownerJobs(ownerId).get(paymentId)); if (!next) return null;
  ownerJobs(ownerId).set(paymentId, next); return next.status === 'processing' ? structuredClone(next) : null;
}
export async function finishReceiptJob(ownerId: string, claimed: ReceiptJob, result: { status: 'submitted' | 'failed' | 'review'; deliveryId?: string; error?: string }) {
  const next = (job: ReceiptJob | undefined) => job?.status === 'processing' && job.token === claimed.token ? { ...job, ...result, updatedAt: new Date().toISOString(), token: undefined, leaseUntil: undefined } : null;
  if (useFirestore) return getAppFirestore().runTransaction(async tx => { const ref = receiptJobRef(ownerId, claimed.paymentId); const snap = await tx.get(ref); const value = next(snap.data() as ReceiptJob | undefined); if (!value) return false; tx.set(ref, value); return true; });
  const value = next(ownerJobs(ownerId).get(claimed.paymentId)); if (!value) return false; ownerJobs(ownerId).set(claimed.paymentId, value); return true;
}
export async function retryReceiptJob(ownerId: string, paymentId: string, paymentVersion?: number): Promise<boolean> {
  const reset = (job: ReceiptJob | undefined): ReceiptJob | null => job?.status === 'failed' ? { ...job, status: 'queued', paymentVersion: paymentVersion ?? job.paymentVersion, error: undefined, updatedAt: new Date().toISOString() } : null;
  if (useFirestore) return getAppFirestore().runTransaction(async tx => { const ref = receiptJobRef(ownerId, paymentId); const snap = await tx.get(ref); const value = reset(snap.data() as ReceiptJob | undefined); if (!value) return false; tx.set(ref, value); return true; });
  const value = reset(ownerJobs(ownerId).get(paymentId)); if (!value) return false; ownerJobs(ownerId).set(paymentId, value); return true;
}
export function resetReceiptJobsForTests() { jobs.clear(); }
