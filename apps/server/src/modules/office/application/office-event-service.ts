import { randomUUID } from 'node:crypto';
import { officeBusinessEventSchema, officeStatusSchema, type AppJobCompletedEvent, type DeliveryFailedEvent, type DeliveryReceiptEvent, type DeliverySentEvent, type OfficeBusinessEvent, type OfficeStatus, type OfficeStatusEvent, type OfficeStatusSnapshot, type PdfGeneratedEvent } from '@synectra/contracts';
export type OfficeEvent = OfficeStatusEvent | OfficeBusinessEvent;
export type OfficeStatusRecord = { event: OfficeEvent; receivedAt: number };
export type OfficeStatusStoreListener = (record: OfficeStatusRecord) => void;

export interface OfficeStatusStore {
  read(ownerId: string): Promise<OfficeStatusRecord | null>;
  write(record: OfficeStatusRecord): Promise<void>;
  watch(ownerId: string, onChange: OfficeStatusStoreListener): () => void;
}

export function createMemoryOfficeStatusStore(): OfficeStatusStore {
  const records = new Map<string, OfficeStatusRecord>();
  const watchers = new Map<string, Set<OfficeStatusStoreListener>>();

  return {
    async read(ownerId) {
      const record = records.get(ownerId);
      return record ? structuredClone(record) : null;
    },
    async write(record) {
      const copy = structuredClone(record);
      records.set(copy.event.ownerId, copy);
      for (const listener of watchers.get(copy.event.ownerId) ?? []) listener(structuredClone(copy));
    },
    watch(ownerId, onChange) {
      let ownerWatchers = watchers.get(ownerId);
      if (!ownerWatchers) {
        ownerWatchers = new Set();
        watchers.set(ownerId, ownerWatchers);
      }
      ownerWatchers.add(onChange);
      return () => {
        ownerWatchers?.delete(onChange);
        if (!ownerWatchers?.size) watchers.delete(ownerId);
      };
    }
  };
}

type Listener = (event: OfficeEvent) => void;

let store: OfficeStatusStore = createMemoryOfficeStatusStore();
const listeners = new Map<string, Set<Listener>>();
const watchers = new Map<string, () => void>();
const sequences = new Map<string, number>();
const delivered = new Map<string, { eventId: string; sequence: number }>();
const queues = new Map<string, Promise<unknown>>();

function snapshotOf(record: OfficeStatusRecord): OfficeStatusSnapshot {
  const event = record.event;
  const status = 'type' in event
    ? event.type === 'app_job_completed'
      ? event.statusSnapshot
      : event.status
    : event.status;
  return {
    ownerId: event.ownerId,
    sequence: event.sequence,
    receivedAt: record.receivedAt,
    status
  };
}

function deliver(event: OfficeEvent) {
  const previousSequence = sequences.get(event.ownerId) ?? -1;
  if (event.sequence > previousSequence) sequences.set(event.ownerId, event.sequence);
  const lastDelivered = delivered.get(event.ownerId);
  if (lastDelivered && (lastDelivered.eventId === event.eventId || event.sequence <= lastDelivered.sequence)) return;
  delivered.set(event.ownerId, { eventId: event.eventId, sequence: event.sequence });
  for (const listener of listeners.get(event.ownerId) ?? []) listener(event);
}

function enqueue<T>(ownerId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(ownerId) ?? Promise.resolve();
  const run = previous.then(task, task);
  queues.set(ownerId, run.then(() => undefined, () => undefined));
  return run;
}

async function nextSequence(ownerId: string) {
  if (!sequences.has(ownerId)) {
    const record = await store.read(ownerId);
    sequences.set(ownerId, record?.event.sequence ?? -1);
  }
  const sequence = (sequences.get(ownerId) ?? -1) + 1;
  sequences.set(ownerId, sequence);
  return sequence;
}

export function publishStatus(ownerId: string, status: OfficeStatus): Promise<OfficeStatusEvent> {
  return enqueue(ownerId, async () => {
    const event: OfficeStatusEvent = {
      ownerId,
      eventId: randomUUID(),
      sequence: await nextSequence(ownerId),
      occurredAt: Date.now(),
      status: officeStatusSchema.parse(status)
    };
    await store.write({ event, receivedAt: event.occurredAt });
    return event;
  });
}

type BusinessEventInput =
  | Omit<PdfGeneratedEvent, 'eventId' | 'sequence' | 'occurredAt'>
  | Omit<DeliverySentEvent, 'eventId' | 'sequence' | 'occurredAt'>
  | Omit<DeliveryFailedEvent, 'eventId' | 'sequence' | 'occurredAt'>
  | Omit<DeliveryReceiptEvent, 'eventId' | 'sequence' | 'occurredAt'>
  | Omit<AppJobCompletedEvent, 'eventId' | 'sequence' | 'occurredAt'>;

export function publishBusinessEvent(input: BusinessEventInput): Promise<OfficeBusinessEvent> {
  return enqueue(input.ownerId, async () => {
    const event = officeBusinessEventSchema.parse({
      ...input,
      eventId: randomUUID(),
      sequence: await nextSequence(input.ownerId),
      occurredAt: Date.now()
    });
    await store.write({ event, receivedAt: event.occurredAt });
    return event;
  });
}

export function subscribeOffice(ownerId: string, listener: Listener) {
  let ownerListeners = listeners.get(ownerId);
  if (!ownerListeners) {
    ownerListeners = new Set();
    listeners.set(ownerId, ownerListeners);
  }
  ownerListeners.add(listener);
  if (!watchers.has(ownerId)) {
    watchers.set(ownerId, store.watch(ownerId, (record) => deliver(record.event)));
  }
  return () => {
    ownerListeners?.delete(listener);
    if (ownerListeners?.size) return;
    listeners.delete(ownerId);
    watchers.get(ownerId)?.();
    watchers.delete(ownerId);
  };
}

export async function getOfficeSnapshots(ownerId: string): Promise<OfficeStatusSnapshot[]> {
  const record = await store.read(ownerId);
  return record ? [snapshotOf(record)] : [];
}

export function setOfficeStatusStore(nextStore: OfficeStatusStore) {
  for (const stop of watchers.values()) stop();
  watchers.clear();
  listeners.clear();
  sequences.clear();
  delivered.clear();
  queues.clear();
  store = nextStore;
}
export const setOfficeStatusStoreForTests = setOfficeStatusStore;

export function resetOfficeEventsForTests() {
  setOfficeStatusStoreForTests(createMemoryOfficeStatusStore());
}
