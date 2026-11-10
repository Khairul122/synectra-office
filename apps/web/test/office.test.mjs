import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StatusStore } from '../src/office3d/status-store.ts';
import {
  officeStatusSchema,
  pdfGeneratedEventSchema,
  deliverySentEventSchema,
  deliveryFailedEventSchema,
  officeBusinessEventSchema
} from '../../../packages/contracts/src/index.ts';

test('status store deduplicates events and restores newer reconnect snapshot', () => {
  const store = new StatusStore(120_000);
  const first = { ownerId: 'owner', eventId: 'evt-1', sequence: 1, occurredAt: 1_000, status: { workState: 'working', heartbeatAt: 1_000, activity: 'Menulis' } };
  assert.equal(store.applyEvent(first), true);
  assert.equal(store.applyEvent(first), false);
  assert.equal(store.applyEvent({ ...first, eventId: 'evt-old', sequence: 0 }), false);
  assert.deepEqual(store.get('owner'), first.status);

  assert.equal(store.applySnapshot({ ownerId: 'owner', sequence: 2, receivedAt: 2_000, status: { workState: 'available', heartbeatAt: 2_000, activity: 'Siap' } }), true);
  assert.equal(store.applyEvent({ ...first, eventId: 'evt-2', sequence: 2 }), false);
  assert.deepEqual(store.get('owner'), { workState: 'available', heartbeatAt: 2_000, activity: 'Siap' });
});

test('status store marks stale heartbeat and recovers after reconnect snapshot', () => {
  const store = new StatusStore(120_000);
  store.applyEvent({ ownerId: 'owner', eventId: 'evt-1', sequence: 1, occurredAt: 1_000, status: { workState: 'working', heartbeatAt: 1_000, activity: 'Menulis' } });
  assert.equal(store.getEffectiveState('owner', 121_000), 'stale');
  assert.equal(store.getEffectiveState('owner', 121_001), 'stale');
  store.applySnapshot({ ownerId: 'owner', sequence: 2, receivedAt: 122_000, status: { workState: 'available', heartbeatAt: 122_000, activity: 'Siap' } });
  assert.equal(store.getEffectiveState('owner', 122_001), 'available');
});

test('status store processes business events and tracks last business event', () => {
  const store = new StatusStore();
  const pdfEvent = {
    type: 'pdf_generated',
    ownerId: 'owner-1',
    eventId: 'pdf-1',
    sequence: 1,
    occurredAt: 10_000,
    invoiceId: 'inv-123',
    invoiceNumber: 'INV/2026/001',
    status: { workState: 'working', heartbeatAt: 10_000, activity: 'Mencetak PDF INV/2026/001' }
  };

  assert.equal(store.applyBusinessEvent(pdfEvent), true);
  assert.deepEqual(store.get('owner-1'), pdfEvent.status);
  assert.deepEqual(store.getLastBusinessEvent('owner-1'), pdfEvent);

  // Deduplication
  assert.equal(store.applyBusinessEvent(pdfEvent), false);

  // Delivery sent
  const sentEvent = {
    type: 'delivery_sent',
    ownerId: 'owner-1',
    eventId: 'del-1',
    sequence: 2,
    occurredAt: 11_000,
    deliveryId: 'del-abc',
    recipient: '628123456789',
    status: { workState: 'available', heartbeatAt: 11_000, activity: 'WhatsApp terkirim ke 628123456789' }
  };
  assert.equal(store.applyBusinessEvent(sentEvent), true);
  assert.deepEqual(store.get('owner-1'), sentEvent.status);
  assert.deepEqual(store.getLastBusinessEvent('owner-1'), sentEvent);

  // Delivery failed
  const failedEvent = {
    type: 'delivery_failed',
    ownerId: 'owner-1',
    eventId: 'del-2',
    sequence: 3,
    occurredAt: 12_000,
    deliveryId: 'del-xyz',
    recipient: '628123456789',
    error: 'Nomor tidak terdaftar',
    status: { workState: 'available', heartbeatAt: 12_000, activity: 'Pengiriman gagal: Nomor tidak terdaftar' }
  };
  assert.equal(store.applyBusinessEvent(failedEvent), true);
  assert.deepEqual(store.get('owner-1'), failedEvent.status);
  assert.deepEqual(store.getLastBusinessEvent('owner-1'), failedEvent);

  // Stale sequence rejected
  const oldEvent = {
    type: 'delivery_sent',
    ownerId: 'owner-1',
    eventId: 'del-old',
    sequence: 2,
    occurredAt: 13_000,
    deliveryId: 'del-old',
    recipient: '628123456789',
    status: { workState: 'available', heartbeatAt: 13_000, activity: 'Lewat' }
  };
  assert.equal(store.applyBusinessEvent(oldEvent), false);
});

test('status store supports multi-owner independent statuses', () => {
  const store = new StatusStore(120_000);
  store.applyEvent({
    ownerId: 'owner-A',
    eventId: 'evt-a1',
    sequence: 1,
    occurredAt: 1_000,
    status: { workState: 'working', heartbeatAt: 1_000, activity: 'Review nota' }
  });
  store.applyEvent({
    ownerId: 'owner-B',
    eventId: 'evt-b1',
    sequence: 1,
    occurredAt: 50_000,
    status: { workState: 'available', heartbeatAt: 50_000, activity: 'Standby' }
  });

  assert.deepEqual(store.getOwners().sort(), ['owner-A', 'owner-B']);
  assert.equal(store.getEffectiveState('owner-A', 122_000), 'stale');
  assert.equal(store.getEffectiveState('owner-B', 122_000), 'available');
});

test('office contracts validate status and business events schemas', () => {
  const status = officeStatusSchema.parse({
    workState: 'working',
    heartbeatAt: 1700000000,
    activity: 'Menulis nota'
  });
  assert.equal(status.workState, 'working');

  const pdfEvent = officeBusinessEventSchema.parse({
    type: 'pdf_generated',
    ownerId: 'owner-1',
    eventId: 'pdf-1',
    sequence: 1,
    occurredAt: 1700000000,
    invoiceId: 'inv-1',
    status
  });
  assert.equal(pdfEvent.type, 'pdf_generated');

  const deliveryEvent = officeBusinessEventSchema.parse({
    type: 'delivery_sent',
    ownerId: 'owner-1',
    eventId: 'del-1',
    sequence: 2,
    occurredAt: 1700000005,
    deliveryId: 'del-1',
    recipient: '628123456789',
    status
  });
  assert.equal(deliveryEvent.type, 'delivery_sent');

  const failedEvent = officeBusinessEventSchema.parse({
    type: 'delivery_failed',
    ownerId: 'owner-1',
    eventId: 'del-2',
    sequence: 3,
    occurredAt: 1700000010,
    deliveryId: 'del-2',
    recipient: '628123456789',
    error: 'Koneksi putus',
    status
  });
  assert.equal(failedEvent.type, 'delivery_failed');

  assert.throws(() => {
    officeBusinessEventSchema.parse({
      type: 'unknown_event',
      ownerId: 'owner-1'
    });
  });
});



