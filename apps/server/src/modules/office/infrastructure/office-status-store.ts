import { officeBusinessEventSchema, officeStatusEventSchema } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { FIRESTORE_COLLECTIONS, withSchema } from '../../../infrastructure/firestore-schema';
import {
  createMemoryOfficeStatusStore,
  type OfficeEvent,
  type OfficeStatusRecord,
  type OfficeStatusStore,
  type OfficeStatusStoreListener
} from '../application/office-event-service';

export type { OfficeEvent, OfficeStatusRecord, OfficeStatusStore, OfficeStatusStoreListener };
export { createMemoryOfficeStatusStore };

function parseEvent(data: unknown): OfficeEvent | null {
  const business = officeBusinessEventSchema.safeParse(data);
  if (business.success) return business.data;
  const status = officeStatusEventSchema.safeParse(data);
  return status.success ? status.data : null;
}

function parseRecord(data: unknown): OfficeStatusRecord | null {
  const event = parseEvent(data);
  if (!event) return null;
  const receivedAt = (data as { receivedAt?: unknown } | null)?.receivedAt;
  return { event, receivedAt: typeof receivedAt === 'number' ? receivedAt : event.occurredAt };
}

function statusRef(ownerId: string) {
  return getAppFirestore()
    .collection(FIRESTORE_COLLECTIONS.OWNERS)
    .doc(ownerId)
    .collection(FIRESTORE_COLLECTIONS.OFFICE_STATUS)
    .doc('current');
}

export function createFirestoreOfficeStatusStore(): OfficeStatusStore {
  return {
    async read(ownerId) {
      const snapshot = await statusRef(ownerId).get();
      return snapshot.exists ? parseRecord(snapshot.data()) : null;
    },
    async write(record) {
      const ownerId = record.event.ownerId;
      await statusRef(ownerId).set(withSchema({ ...record.event, receivedAt: record.receivedAt }, ownerId));
    },
    watch(ownerId, onChange) {
      return statusRef(ownerId).onSnapshot(
        (snapshot) => {
          if (!snapshot.exists) return;
          const record = parseRecord(snapshot.data());
          if (record) onChange(record);
        },
        (error) => {
          console.error('office status watcher failed', error instanceof Error ? error.message : 'unknown error');
        }
      );
    }
  };
}

export function createOfficeStatusStore(): OfficeStatusStore {
  return process.env.FIREBASE_USE_FIRESTORE === 'true'
    ? createFirestoreOfficeStatusStore()
    : createMemoryOfficeStatusStore();
}
