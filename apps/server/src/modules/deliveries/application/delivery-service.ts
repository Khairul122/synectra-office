import { createHash, randomUUID } from 'node:crypto';
import {
  deliveryApprovalSchema,
  deliveryAttemptSchema,
  deliveryKeySchema,
  deliveryReceiptSchema,
  deliveryReceiptResponseSchema,
  deliverySchema,
  type Delivery,
  type DeliveryApproval,
  type DeliveryAttempt,
  type DeliveryKey,
  type DeliveryReceipt,
  type DeliveryReceiptResponse
} from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { publishBusinessEvent } from '../../office/application/office-event-service';

const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';

// In-memory data store for testing and local dev
const approvals = new Map<string, Map<string, DeliveryApproval>>();
const deliveryKeys = new Map<string, Map<string, DeliveryKey>>();
const deliveries = new Map<string, Map<string, Delivery>>();
const attempts = new Map<string, DeliveryAttempt[]>();

function ownerApprovals(ownerId: string) {
  let m = approvals.get(ownerId);
  if (!m) { m = new Map(); approvals.set(ownerId, m); }
  return m;
}

function ownerDeliveryKeys(ownerId: string) {
  let m = deliveryKeys.get(ownerId);
  if (!m) { m = new Map(); deliveryKeys.set(ownerId, m); }
  return m;
}

function ownerDeliveries(ownerId: string) {
  let m = deliveries.get(ownerId);
  if (!m) { m = new Map(); deliveries.set(ownerId, m); }
  return m;
}

function ownerRef(ownerId: string) {
  return getAppFirestore().collection('owners').doc(ownerId);
}

export function computeDeliveryDedupeKey(data: {
  notaId: string;
  revision: string;
  recipient: string;
  pdfHash: string;
  caption: string;
}): string {
  return createHash('sha256')
    .update([data.notaId, data.revision, data.recipient, data.pdfHash, data.caption].join('|'))
    .digest('hex');
}

export async function createApprovalAndEnqueue(
  ownerId: string,
  approvalInput: Omit<DeliveryApproval, 'id'>,
  now = new Date()
): Promise<{ delivery: Delivery; approval: DeliveryApproval; isDuplicate: boolean }> {
  const dedupeKey = computeDeliveryDedupeKey(approvalInput);

  if (useFirestore) {
    const db = getAppFirestore();
    const result = await db.runTransaction(async (transaction) => {
      const keyRef = ownerRef(ownerId).collection('delivery_keys').doc(dedupeKey);
      const keySnap = await transaction.get(keyRef);

      if (keySnap.exists) {
        const keyData = deliveryKeySchema.parse(keySnap.data());
        const existingApprovalSnap = await transaction.get(ownerRef(ownerId).collection('delivery_approvals').doc(keyData.approvalId));
        const existingDeliverySnap = await transaction.get(ownerRef(ownerId).collection('deliveries').doc(keyData.approvalId));
        return {
          delivery: deliverySchema.parse(existingDeliverySnap.data()),
          approval: deliveryApprovalSchema.parse(existingApprovalSnap.data()),
          isDuplicate: true
        };
      }

      const approvalId = randomUUID();
      const approval: DeliveryApproval = deliveryApprovalSchema.parse({
        ...approvalInput,
        id: approvalId
      });

      const initialStatus = new Date(approval.scheduleAt) > now ? 'scheduled' : 'queued';
      const delivery: Delivery = deliverySchema.parse({
        id: approvalId,
        approvalId,
        status: initialStatus,
        attemptCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });

      transaction.set(keyRef, { id: dedupeKey, approvalId });
      transaction.set(ownerRef(ownerId).collection('delivery_approvals').doc(approvalId), approval);
      transaction.set(ownerRef(ownerId).collection('deliveries').doc(approvalId), delivery);

      return { delivery, approval, isDuplicate: false };
    });

    return result;
  }

  // In-memory implementation
  const keys = ownerDeliveryKeys(ownerId);
  const existingKey = keys.get(dedupeKey);
  if (existingKey) {
    const existingDelivery = ownerDeliveries(ownerId).get(existingKey.approvalId)!;
    const existingApproval = ownerApprovals(ownerId).get(existingKey.approvalId)!;
    return {
      delivery: structuredClone(existingDelivery),
      approval: structuredClone(existingApproval),
      isDuplicate: true
    };
  }

  const approvalId = randomUUID();
  const approval: DeliveryApproval = deliveryApprovalSchema.parse({
    ...approvalInput,
    id: approvalId
  });

  const initialStatus = new Date(approval.scheduleAt) > now ? 'scheduled' : 'queued';
  const delivery: Delivery = deliverySchema.parse({
    id: approvalId,
    approvalId,
    status: initialStatus,
    attemptCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  keys.set(dedupeKey, { id: dedupeKey, approvalId });
  ownerApprovals(ownerId).set(approvalId, approval);
  ownerDeliveries(ownerId).set(approvalId, delivery);

  return {
    delivery: structuredClone(delivery),
    approval: structuredClone(approval),
    isDuplicate: false
  };
}

export async function claimDelivery(
  ownerId: string,
  deliveryId: string,
  leaseDurationMs = 30_000,
  now = new Date()
): Promise<{ delivery: Delivery; fencingToken: string } | null> {
  if (useFirestore) {
    const db = getAppFirestore();
    const result = await db.runTransaction(async (transaction) => {
      const delRef = ownerRef(ownerId).collection('deliveries').doc(deliveryId);
      const appRef = ownerRef(ownerId).collection('delivery_approvals').doc(deliveryId);

      const delSnap = await transaction.get(delRef);
      const appSnap = await transaction.get(appRef);

      if (!delSnap.exists || !appSnap.exists) return null;

      const del = deliverySchema.parse(delSnap.data());
      const app = deliveryApprovalSchema.parse(appSnap.data());

      // Missed schedule (> 24 jam) or expired approval -> review
      const isMissedSchedule = now.getTime() - new Date(app.scheduleAt).getTime() > 24 * 60 * 60 * 1000;
      const isExpired = new Date(app.validUntil).getTime() <= now.getTime();

      if (isMissedSchedule || isExpired) {
        transaction.update(delRef, { status: 'review', updatedAt: now.toISOString() });
        return null;
      }

      // Check if lease is currently valid
      if (del.status === 'sending' && del.leaseExpires && new Date(del.leaseExpires) > now) {
        return null; // lease active
      }

      if (!['queued', 'scheduled', 'sending'].includes(del.status)) {
        return null;
      }

      const fencingToken = randomUUID();
      const leaseExpires = new Date(now.getTime() + leaseDurationMs).toISOString();

      const updatedDelivery: Delivery = deliverySchema.parse({
        ...del,
        status: 'sending',
        fencingToken,
        leaseExpires,
        attemptCount: del.attemptCount + 1,
        updatedAt: now.toISOString()
      });

      transaction.set(delRef, updatedDelivery);
      return { delivery: updatedDelivery, fencingToken };
    });

    return result;
  }

  // In-memory
  const del = ownerDeliveries(ownerId).get(deliveryId);
  const app = ownerApprovals(ownerId).get(deliveryId);
  if (!del || !app) return null;

  const isMissedSchedule = now.getTime() - new Date(app.scheduleAt).getTime() > 24 * 60 * 60 * 1000;
  const isExpired = new Date(app.validUntil).getTime() <= now.getTime();

  if (isMissedSchedule || isExpired) {
    del.status = 'review';
    del.updatedAt = now.toISOString();
    return null;
  }

  if (del.status === 'sending' && del.leaseExpires && new Date(del.leaseExpires) > now) {
    return null;
  }

  if (!['queued', 'scheduled', 'sending'].includes(del.status)) {
    return null;
  }

  const fencingToken = randomUUID();
  const leaseExpires = new Date(now.getTime() + leaseDurationMs).toISOString();

  del.status = 'sending';
  del.fencingToken = fencingToken;
  del.leaseExpires = leaseExpires;
  del.attemptCount += 1;
  del.updatedAt = now.toISOString();

  return { delivery: structuredClone(del), fencingToken };
}

export async function recordAttemptAndComplete(
  ownerId: string,
  deliveryId: string,
  fencingToken: string,
  executeSend: () => Promise<{ success: boolean; messageId?: string; error?: string; unknown?: boolean }>,
  options?: { simulateCrashBeforeSend?: boolean; simulateCrashAfterSend?: boolean },
  now = new Date()
): Promise<Delivery> {
  const current = await getDelivery(ownerId, deliveryId);
  if (!current || current.fencingToken !== fencingToken) {
    throw new Error('Fencing token mismatch or delivery not found');
  }

  if (options?.simulateCrashBeforeSend) {
    // Crash before send: simulated worker death before external call
    // Delivery remains sending until lease expires
    return current;
  }

  let sendResult: { success: boolean; messageId?: string; error?: string; unknown?: boolean };
  try {
    sendResult = await executeSend();
  } catch (err: unknown) {
    sendResult = { success: false, unknown: true, error: err instanceof Error ? err.message : String(err) };
  }

  if (options?.simulateCrashAfterSend) {
    // Crash after send: ambiguous outcome
    const attempt: DeliveryAttempt = deliveryAttemptSchema.parse({
      id: randomUUID(),
      deliveryId,
      attemptNumber: current.attemptCount,
      result: 'unknown',
      source: 'bridge',
      error: 'Worker crashed or timed out after dispatch',
      createdAt: now.toISOString()
    });

    const updated = await updateDeliveryStatus(ownerId, deliveryId, fencingToken, 'unknown', now);
    recordAttempt(deliveryId, attempt);
    return updated;
  }

  const resultStatus = sendResult.success ? 'sent' : sendResult.unknown ? 'unknown' : 'failed';
  const attempt: DeliveryAttempt = deliveryAttemptSchema.parse({
    id: randomUUID(),
    deliveryId,
    attemptNumber: current.attemptCount,
    result: resultStatus,
    source: 'bridge',
    messageId: sendResult.messageId,
    error: sendResult.error,
    createdAt: now.toISOString()
  });

  const nextDeliveryStatus = sendResult.success ? 'submitted' : sendResult.unknown ? 'unknown' : (current.attemptCount >= 3 ? 'failed' : 'queued');
  const updated = await updateDeliveryStatus(ownerId, deliveryId, fencingToken, nextDeliveryStatus, now, sendResult.messageId);
  recordAttempt(deliveryId, attempt);
  return updated;
}

export async function recordManualAttempt(
  ownerId: string,
  deliveryId: string,
  result: 'sent' | 'failed' | 'unknown',
  notes?: string,
  now = new Date()
): Promise<{ delivery: Delivery; attempt: DeliveryAttempt }> {
  const current = await getDelivery(ownerId, deliveryId);
  if (!current) throw new Error('Delivery not found');

  const attemptNumber = current.attemptCount + 1;
  const attempt: DeliveryAttempt = deliveryAttemptSchema.parse({
    id: randomUUID(),
    deliveryId,
    attemptNumber,
    result,
    source: 'manual',
    notes,
    createdAt: now.toISOString()
  });

  let nextStatus: Delivery['status'] = current.status;
  if (result === 'sent') {
    nextStatus = 'submitted';
  } else if (result === 'failed') {
    nextStatus = attemptNumber >= 3 ? 'failed' : 'queued';
  } else {
    nextStatus = 'unknown';
  }

  let updatedDelivery: Delivery;
  if (useFirestore) {
    const db = getAppFirestore();
    updatedDelivery = await db.runTransaction(async (transaction) => {
      const ref = ownerRef(ownerId).collection('deliveries').doc(deliveryId);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Delivery not found');
      const del = deliverySchema.parse(snap.data());
      const next: Delivery = deliverySchema.parse({
        ...del,
        status: nextStatus,
        attemptCount: attemptNumber,
        leaseExpires: undefined,
        updatedAt: now.toISOString()
      });
      transaction.set(ref, next);
      return next;
    });
  } else {
    const del = ownerDeliveries(ownerId).get(deliveryId);
    if (!del) throw new Error('Delivery not found');
    del.status = nextStatus;
    del.attemptCount = attemptNumber;
    del.leaseExpires = undefined;
    del.updatedAt = now.toISOString();
    updatedDelivery = structuredClone(del);
  }

  recordAttempt(deliveryId, attempt);
  return { delivery: updatedDelivery, attempt };
}

export function listDeliveryAttempts(deliveryId: string): DeliveryAttempt[] {
  return structuredClone(attempts.get(deliveryId) ?? []);
}

export async function recoverExpiredLease(
  ownerId: string,
  deliveryId: string,
  now = new Date()
): Promise<Delivery | null> {
  const current = await getDelivery(ownerId, deliveryId);
  if (!current || current.status !== 'sending') return null;

  if (current.leaseExpires && new Date(current.leaseExpires) <= now) {
    // Lease expired without completion -> recover back to queued
    const nextStatus = current.attemptCount >= 3 ? 'failed' : 'queued';
    return updateDeliveryStatus(ownerId, deliveryId, current.fencingToken!, nextStatus, now);
  }
  return null;
}

export async function getDelivery(ownerId: string, deliveryId: string): Promise<Delivery | null> {
  if (useFirestore) {
    const snap = await ownerRef(ownerId).collection('deliveries').doc(deliveryId).get();
    return snap.exists ? deliverySchema.parse(snap.data()) : null;
  }
  const del = ownerDeliveries(ownerId).get(deliveryId);
  return del ? structuredClone(del) : null;
}

export async function getApproval(ownerId: string, approvalId: string): Promise<DeliveryApproval | null> {
  if (useFirestore) {
    const snap = await ownerRef(ownerId).collection('delivery_approvals').doc(approvalId).get();
    return snap.exists ? deliveryApprovalSchema.parse(snap.data()) : null;
  }
  const app = ownerApprovals(ownerId).get(approvalId);
  return app ? structuredClone(app) : null;
}

export async function listDeliveries(ownerId: string): Promise<Array<{ delivery: Delivery; approval: DeliveryApproval | null; attempts: DeliveryAttempt[] }>> {
  if (useFirestore) {
    const snap = await ownerRef(ownerId).collection('deliveries').get();
    const list: Array<{ delivery: Delivery; approval: DeliveryApproval | null; attempts: DeliveryAttempt[] }> = [];
    for (const doc of snap.docs) {
      const del = deliverySchema.parse(doc.data());
      const app = await getApproval(ownerId, del.approvalId);
      list.push({ delivery: del, approval: app, attempts: listDeliveryAttempts(del.id) });
    }
    list.sort((a, b) => new Date(b.delivery.createdAt).getTime() - new Date(a.delivery.createdAt).getTime());
    return list;
  }
  const dels = Array.from(ownerDeliveries(ownerId).values());
  const list = await Promise.all(
    dels.map(async (del) => ({
      delivery: structuredClone(del),
      approval: await getApproval(ownerId, del.approvalId),
      attempts: listDeliveryAttempts(del.id)
    }))
  );
  list.sort((a, b) => new Date(b.delivery.createdAt).getTime() - new Date(a.delivery.createdAt).getTime());
  return list;
}

async function updateDeliveryStatus(
  ownerId: string,
  deliveryId: string,
  fencingToken: string,
  status: Delivery['status'],
  now = new Date(),
  messageId?: string
): Promise<Delivery> {
  if (useFirestore) {
    const db = getAppFirestore();
    return db.runTransaction(async (transaction) => {
      const ref = ownerRef(ownerId).collection('deliveries').doc(deliveryId);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Delivery not found');
      const del = deliverySchema.parse(snap.data());
      if (del.fencingToken !== fencingToken) throw new Error('Fencing token mismatch');
      const next: Delivery = deliverySchema.parse({
        ...del,
        status,
        messageId: messageId ?? del.messageId,
        leaseExpires: undefined,
        updatedAt: now.toISOString()
      });
      transaction.set(ref, next);
      return next;
    });
  }

  const del = ownerDeliveries(ownerId).get(deliveryId);
  if (!del) throw new Error('Delivery not found');
  if (del.fencingToken !== fencingToken) throw new Error('Fencing token mismatch');
  del.status = status;
  if (messageId) {
    del.messageId = messageId;
  }
  del.leaseExpires = undefined;
  del.updatedAt = now.toISOString();
  return structuredClone(del);
}

const processedReceipts = new Set<string>();

export async function findDeliveryByMessageId(
  messageId: string,
  ownerId?: string
): Promise<{ ownerId: string; delivery: Delivery } | null> {
  if (useFirestore) {
    const db = getAppFirestore();
    if (ownerId) {
      const snap = await ownerRef(ownerId).collection('deliveries').where('messageId', '==', messageId).limit(1).get();
      if (!snap.empty) {
        return { ownerId, delivery: deliverySchema.parse(snap.docs[0].data()) };
      }
    } else {
      const snap = await db.collectionGroup('deliveries').where('messageId', '==', messageId).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const docOwnerId = doc.ref.parent.parent?.id ?? '';
        return { ownerId: docOwnerId, delivery: deliverySchema.parse(doc.data()) };
      }
    }
    return null;
  }

  const checkOwner = (oId: string, map: Map<string, Delivery>): { ownerId: string; delivery: Delivery } | null => {
    for (const d of map.values()) {
      if (d.messageId === messageId || d.id === messageId) {
        return { ownerId: oId, delivery: structuredClone(d) };
      }
    }
    return null;
  };

  if (ownerId) {
    const map = ownerDeliveries(ownerId);
    const found = checkOwner(ownerId, map);
    if (found) return found;
  } else {
    for (const [oId, map] of deliveries.entries()) {
      const found = checkOwner(oId, map);
      if (found) return found;
    }
  }

  for (const [delId, attList] of attempts.entries()) {
    const match = attList.find((a) => a.messageId === messageId);
    if (match) {
      if (ownerId) {
        const d = ownerDeliveries(ownerId).get(delId);
        if (d) return { ownerId, delivery: structuredClone(d) };
      } else {
        for (const [oId, map] of deliveries.entries()) {
          const d = map.get(delId);
          if (d) return { ownerId: oId, delivery: structuredClone(d) };
        }
      }
    }
  }

  return null;
}

export async function applyDeliveryReceipt(
  receiptInput: DeliveryReceipt,
  ownerId?: string,
  now = new Date()
): Promise<DeliveryReceiptResponse> {
  const receipt = deliveryReceiptSchema.parse(receiptInput);
  const found = await findDeliveryByMessageId(receipt.messageId, ownerId);
  if (!found) {
    return {
      success: false,
      messageId: receipt.messageId,
      currentStatus: 'unknown',
      deduplicated: false,
      error: 'Delivery not found for message ID'
    };
  }

  const { ownerId: actualOwnerId, delivery } = found;
  const dedupeKey = receipt.receiptId || `${delivery.id}:${receipt.status}`;

  const validPriorStatuses: Delivery['status'][] = ['submitted', 'delivered', 'read'];
  if (!validPriorStatuses.includes(delivery.status)) {
    return {
      success: false,
      deliveryId: delivery.id,
      messageId: receipt.messageId,
      previousStatus: delivery.status,
      currentStatus: delivery.status,
      deduplicated: false,
      error: `Cannot apply receipt to delivery in status ${delivery.status}`
    };
  }

  const previousStatus = delivery.status;

  if (processedReceipts.has(dedupeKey)) {
    return {
      success: true,
      deliveryId: delivery.id,
      messageId: receipt.messageId,
      previousStatus,
      currentStatus: delivery.status,
      deduplicated: true
    };
  }

  // Monotonic: prevent downgrade from read to delivered
  if (delivery.status === 'read' && receipt.status === 'delivered') {
    processedReceipts.add(dedupeKey);
    return {
      success: true,
      deliveryId: delivery.id,
      messageId: receipt.messageId,
      previousStatus: 'read',
      currentStatus: 'read',
      deduplicated: true
    };
  }

  if (delivery.status === receipt.status) {
    processedReceipts.add(dedupeKey);
    return {
      success: true,
      deliveryId: delivery.id,
      messageId: receipt.messageId,
      previousStatus,
      currentStatus: delivery.status,
      deduplicated: true
    };
  }

  const nextStatus: Delivery['status'] = receipt.status;
  const isoTime = receipt.timestamp || now.toISOString();

  if (useFirestore) {
    const db = getAppFirestore();
    await db.runTransaction(async (transaction) => {
      const ref = ownerRef(actualOwnerId).collection('deliveries').doc(delivery.id);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Delivery not found');
      const del = deliverySchema.parse(snap.data());
      if (del.status === 'read' && nextStatus === 'delivered') {
        return;
      }
      const updated: Delivery = deliverySchema.parse({
        ...del,
        status: nextStatus,
        messageId: receipt.messageId,
        deliveredAt: nextStatus === 'delivered' || nextStatus === 'read' ? (del.deliveredAt || isoTime) : del.deliveredAt,
        readAt: nextStatus === 'read' ? isoTime : del.readAt,
        updatedAt: now.toISOString()
      });
      transaction.set(ref, updated);
    });
  } else {
    const del = ownerDeliveries(actualOwnerId).get(delivery.id);
    if (del) {
      del.status = nextStatus;
      del.messageId = receipt.messageId;
      if (nextStatus === 'delivered' || nextStatus === 'read') {
        del.deliveredAt = del.deliveredAt || isoTime;
      }
      if (nextStatus === 'read') {
        del.readAt = isoTime;
      }
      del.updatedAt = now.toISOString();
    }
  }

  processedReceipts.add(dedupeKey);

  try {
    await publishBusinessEvent({
      type: 'delivery_receipt',
      ownerId: actualOwnerId,
      deliveryId: delivery.id,
      messageId: receipt.messageId,
      receiptStatus: receipt.status,
      status: {
        workState: 'working',
        heartbeatAt: Date.now(),
        activity: receipt.status === 'read' ? 'Nota dibaca pelanggan' : 'Nota terkirim ke WhatsApp'
      }
    });
  } catch {
    // Best effort event publication
  }

  return {
    success: true,
    deliveryId: delivery.id,
    messageId: receipt.messageId,
    previousStatus,
    currentStatus: nextStatus,
    deduplicated: false
  };
}

function recordAttempt(deliveryId: string, attempt: DeliveryAttempt) {
  const list = attempts.get(deliveryId) ?? [];
  list.push(attempt);
  attempts.set(deliveryId, list);
}

export function listDeliveryAttemptsForTests(deliveryId: string): DeliveryAttempt[] {
  return structuredClone(attempts.get(deliveryId) ?? []);
}

export function resetDeliveryDataForTests() {
  approvals.clear();
  deliveryKeys.clear();
  deliveries.clear();
  attempts.clear();
  processedReceipts.clear();
}
