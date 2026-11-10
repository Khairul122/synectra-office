import { createHash, randomUUID } from 'node:crypto';
import { invoiceInputSchema, invoiceSchema, type Invoice, type InvoiceInput } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { getClient } from '../../business/application/business-service';

const invoices = new Map<string, Map<string, Invoice>>();
const sequences = new Map<string, number>();
const idempotencyRecords = new Map<string, Invoice>();
const automaticInvoiceKeys = new Map<string, { fingerprint: string; invoice: Invoice }>();
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
function ownerInvoices(ownerId: string) { let value = invoices.get(ownerId); if (!value) { value = new Map(); invoices.set(ownerId, value); } return value; }
function period() { return new Date().toISOString().slice(0, 7).replace('-', ''); }
function parsedInput(input: unknown): InvoiceInput { return invoiceInputSchema.parse(input); }
function build(id: string, input: InvoiceInput, version = 1): Invoice {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return invoiceSchema.parse({ ...input, id, subtotal, total: subtotal, status: 'draft', version, revisions: [] });
}
function invoiceRef(ownerId: string, id: string) { return getAppFirestore().collection('owners').doc(ownerId).collection('invoices').doc(id); }

export async function createInvoice(ownerId: string, input: unknown) {
  const invoice = build(randomUUID(), parsedInput(input));
  if (useFirestore) {
    const db = getAppFirestore();
    await db.runTransaction(async tx => {
      const client = await tx.get(db.collection('owners').doc(ownerId).collection('clients').doc(invoice.clientId));
      if (!client.exists) throw new Error('Client not found');
      tx.create(invoiceRef(ownerId, invoice.id), invoice);
    });
  } else ownerInvoices(ownerId).set(invoice.id, invoice);
  return structuredClone(invoice);
}
export async function createIssuedInvoice(ownerId: string, value: unknown, idempotencyKey: string) {
  const input = parsedInput(value);
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('Invalid idempotency key');
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const key = createHash('sha256').update(`automatic-invoice:${idempotencyKey}`).digest('hex');
  const invoice = build(randomUUID(), input);
  const issuedAt = new Date().toISOString();
  const invoicePeriod = issuedAt.slice(0, 7).replace('-', '');
  const makeIssued = (sequence: number): Invoice => ({ ...invoice, number: `INV-${invoicePeriod}-${String(sequence).padStart(6, '0')}`, status: 'issued', revisions: [{ version: invoice.version, snapshot: structuredClone(invoice), createdAt: issuedAt }] });
  if (useFirestore) {
    const db = getAppFirestore(); const root = db.collection('owners').doc(ownerId);
    const keyRef = root.collection('idempotency').doc(key); const sequenceRef = root.collection('sequences').doc(invoicePeriod);
    return db.runTransaction(async transaction => {
      const [client, sequence, saved] = await Promise.all([transaction.get(root.collection('clients').doc(input.clientId)), transaction.get(sequenceRef), transaction.get(keyRef)]);
      if (saved.exists) { if (saved.data()?.fingerprint !== fingerprint) throw new Error('Conflict: idempotency key reused'); return invoiceSchema.parse(saved.data()?.invoice); }
      if (!client.exists) throw new Error('Client not found');
      const nextSequence = ((sequence.data()?.value as number | undefined) ?? 0) + 1;
      const issued = makeIssued(nextSequence);
      transaction.set(sequenceRef, { value: nextSequence }, { merge: true });
      transaction.create(invoiceRef(ownerId, issued.id), issued);
      transaction.create(keyRef, { fingerprint, invoice: issued, createdAt: issuedAt });
      transaction.create(root.collection('audit').doc(), { action: 'invoice.issued', invoiceId: issued.id, number: issued.number, createdAt: issuedAt });
      return structuredClone(issued);
    });
  }
  if (!await getClient(ownerId, input.clientId)) throw new Error('Client not found');
  const cached = automaticInvoiceKeys.get(`${ownerId}:${key}`);
  if (cached) { if (cached.fingerprint !== fingerprint) throw new Error('Conflict: idempotency key reused'); return structuredClone(cached.invoice); }
  const sequenceKey = `${ownerId}:${invoicePeriod}`; const sequence = (sequences.get(sequenceKey) ?? 0) + 1; sequences.set(sequenceKey, sequence);
  const issued = makeIssued(sequence); ownerInvoices(ownerId).set(issued.id, issued);
  automaticInvoiceKeys.set(`${ownerId}:${key}`, { fingerprint, invoice: issued });
  return structuredClone(issued);
}
export async function listInvoices(ownerId: string) {
  if (!useFirestore) return [...ownerInvoices(ownerId).values()].map((invoice) => structuredClone(invoice));
  const snapshot = await getAppFirestore().collection('owners').doc(ownerId).collection('invoices').get();
  return snapshot.docs.map((doc) => invoiceSchema.parse(doc.data()));
}
export async function getInvoice(ownerId: string, id: string) {
  if (!useFirestore) { const invoice = ownerInvoices(ownerId).get(id); return invoice ? structuredClone(invoice) : null; }
  const snapshot = await invoiceRef(ownerId, id).get();
  return snapshot.exists ? invoiceSchema.parse(snapshot.data()) : null;
}
export async function updateDraftInvoice(ownerId: string, id: string, expectedVersion: number, input: unknown) {
  const next = build(id, parsedInput(input), expectedVersion + 1);
  if (useFirestore) {
    const ref = invoiceRef(ownerId, id);
    await getAppFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? invoiceSchema.parse(snapshot.data()) : null;
      if (!current || current.status !== 'draft') throw new Error('Invoice is not draft');
      if (current.version !== expectedVersion) throw new Error('Conflict: stale invoice version');
      if (current.clientId !== next.clientId) {
        const client = await transaction.get(getAppFirestore().collection('owners').doc(ownerId).collection('clients').doc(next.clientId));
        if (!client.exists) throw new Error('Client not found');
      }
      transaction.set(ref, next);
    });
    return structuredClone(next);
  }
  const current = ownerInvoices(ownerId).get(id); if (!current || current.status !== 'draft') throw new Error('Invoice is not draft');
  if (current.version !== expectedVersion) throw new Error('Conflict: stale invoice version');
  ownerInvoices(ownerId).set(id, next); return structuredClone(next);
}
export async function issueInvoice(ownerId: string, id: string, expectedVersion: number, idempotencyKey?: string) {
  if (useFirestore) {
    const ref = invoiceRef(ownerId, id);
    const sequenceRef = getAppFirestore().collection('owners').doc(ownerId).collection('sequences').doc(period());
    const idempotencyRef = idempotencyKey ? getAppFirestore().collection('owners').doc(ownerId).collection('idempotency').doc(createHash('sha256').update(idempotencyKey).digest('hex')) : null;
    return getAppFirestore().runTransaction(async (transaction) => {
      const [invoiceSnapshot, sequenceSnapshot, idempotencySnapshot] = await Promise.all([transaction.get(ref), transaction.get(sequenceRef), idempotencyRef ? transaction.get(idempotencyRef) : Promise.resolve(null)]);
      if (idempotencySnapshot?.exists) return invoiceSchema.parse(idempotencySnapshot.data()?.invoice);
      const current = invoiceSnapshot.exists ? invoiceSchema.parse(invoiceSnapshot.data()) : null;
      if (!current || current.status !== 'draft') throw new Error('Invoice is not draft');
      if (current.version !== expectedVersion) throw new Error('Conflict: stale invoice version');
      const nextSequence = ((sequenceSnapshot.data()?.value as number | undefined) ?? 0) + 1;
      const issuedAt = new Date().toISOString();
      const issued: Invoice = { ...current, number: `INV-${period()}-${String(nextSequence).padStart(6, '0')}`, status: 'issued', revisions: [...current.revisions, { version: current.version, snapshot: structuredClone(current), createdAt: issuedAt }] };
      transaction.set(sequenceRef, { value: nextSequence }, { merge: true });
      transaction.set(ref, issued);
      if (idempotencyRef) transaction.create(idempotencyRef, { invoice: issued, createdAt: new Date().toISOString() });
      transaction.create(getAppFirestore().collection('owners').doc(ownerId).collection('audit').doc(), { action: 'invoice.issued', invoiceId: id, number: issued.number, createdAt: new Date().toISOString() });
      return structuredClone(issued);
    });
  }
  if (idempotencyKey) {
    const cached = idempotencyRecords.get(`${ownerId}:${idempotencyKey}`);
    if (cached) return structuredClone(cached);
  }
  const current = ownerInvoices(ownerId).get(id); if (!current || current.status !== 'draft') throw new Error('Invoice is not draft');
  if (current.version !== expectedVersion) throw new Error('Conflict: stale invoice version');
  const key = `${ownerId}:${period()}`; const nextSequence = (sequences.get(key) ?? 0) + 1; sequences.set(key, nextSequence);
  const issuedAt = new Date().toISOString();
      const issued: Invoice = { ...current, number: `INV-${period()}-${String(nextSequence).padStart(6, '0')}`, status: 'issued', revisions: [...current.revisions, { version: current.version, snapshot: structuredClone(current), createdAt: issuedAt }] };
  ownerInvoices(ownerId).set(id, issued);
  if (idempotencyKey) idempotencyRecords.set(`${ownerId}:${idempotencyKey}`, issued);
  return structuredClone(issued);
}
export async function isClientReferenced(ownerId: string, clientId: string): Promise<boolean> {
  if (useFirestore) {
    const snapshot = await getAppFirestore().collection('owners').doc(ownerId).collection('invoices').where('clientId', '==', clientId).limit(1).get();
    return !snapshot.empty;
  }
  const all = [...ownerInvoices(ownerId).values()];
  return all.some((inv) => inv.clientId === clientId);
}
export function resetInvoiceDataForTests() { invoices.clear(); sequences.clear(); idempotencyRecords.clear(); automaticInvoiceKeys.clear(); }
