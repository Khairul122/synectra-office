import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/bootstrap/app';
import { createExpiredSessionForTests, createSessionForTests, resetSessionsForTests, revokeSession } from '../src/modules/auth/application/auth-service';
import { getOfficeSnapshots, publishBusinessEvent, publishStatus, resetOfficeEventsForTests, setOfficeStatusStoreForTests, subscribeOffice } from '../src/modules/office/application/office-event-service';
import type { OfficeEvent, OfficeStatusRecord, OfficeStatusStore } from '../src/modules/office/infrastructure/office-status-store';
import { beginStaffActivity } from '../src/modules/office/application/staff-activity';
import { officeStaffSnapshotSchema } from '@synectra/contracts';

beforeEach(() => {
  resetSessionsForTests();
  resetOfficeEventsForTests();
});

function status(activity: string) {
  return { workState: 'working' as const, heartbeatAt: 1_000, activity };
}

function fakeStore() {
  let record: OfficeStatusRecord | null = null;
  const watchers = new Set<(next: OfficeStatusRecord) => void>();
  const emit = (next: OfficeStatusRecord) => {
    record = structuredClone(next);
    for (const watcher of watchers) watcher(structuredClone(next));
  };
  const store: OfficeStatusStore & { emit(next: OfficeStatusRecord): void; watcherCount(): number } = {
    async read() {
      return record ? structuredClone(record) : null;
    },
    async write(next) {
      emit(next);
    },
    watch(_ownerId, onChange) {
      watchers.add(onChange);
      return () => {
        watchers.delete(onChange);
      };
    },
    emit,
    watcherCount() {
      return watchers.size;
    }
  };
  return store;
}

test('publishes a status snapshot and streams it once per owner', async () => {
  const received: OfficeEvent[] = [];
  const unsubscribe = subscribeOffice('owner-a', (event) => received.push(event));

  const event = await publishStatus('owner-a', status('Menulis'));

  assert.equal(event.sequence, 0);
  assert.deepEqual(received, [event]);
  assert.deepEqual(await getOfficeSnapshots('owner-a'), [{
    ownerId: 'owner-a',
    sequence: 0,
    receivedAt: event.occurredAt,
    status: status('Menulis')
  }]);
  unsubscribe();
});

test('isolates owners and deduplicates remote Firestore snapshots', async () => {
  const store = fakeStore();
  setOfficeStatusStoreForTests(store);
  const ownerA: OfficeEvent[] = [];
  const ownerB: OfficeEvent[] = [];
  const stopA = subscribeOffice('owner-a', (event) => ownerA.push(event));
  const stopB = subscribeOffice('owner-b', (event) => ownerB.push(event));

  const remote = { ownerId: 'owner-b', eventId: 'remote-1', sequence: 0, occurredAt: 500, status: status('Membaca') };
  store.emit({ event: remote, receivedAt: 600 });
  store.emit({ event: remote, receivedAt: 600 });

  assert.equal(ownerA.length, 0);
  assert.equal(ownerB.length, 1);
  assert.deepEqual(await getOfficeSnapshots('owner-b'), [{
    ownerId: 'owner-b',
    sequence: 0,
    receivedAt: 600,
    status: status('Membaca')
  }]);

  stopA();
  stopB();
  assert.equal(store.watcherCount(), 0);
});

test('persists business events and keeps their type on the stream', async () => {
  const received: OfficeEvent[] = [];
  const stop = subscribeOffice('owner-c', (event) => received.push(event));

  const event = await publishBusinessEvent({
    type: 'pdf_generated',
    ownerId: 'owner-c',
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV-1',
    status: status('PDF selesai')
  });

  assert.equal(event.type, 'pdf_generated');
  assert.equal(received.length, 1);
  assert.equal((received[0] as { type?: string }).type, 'pdf_generated');
  assert.equal((await getOfficeSnapshots('owner-c'))[0]?.sequence, 0);
  stop();
});

test('serializes concurrent publications per owner', async () => {
  const [first, second] = await Promise.all([
    publishStatus('owner-d', status('Satu')),
    publishStatus('owner-d', status('Dua'))
  ]);

  assert.deepEqual([first.sequence, second.sequence], [0, 1]);
});

test('office routes require a live session and return the stored snapshot', async () => {
  const app = buildApp();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/office/snapshot' })).statusCode, 401);

    const expired = createExpiredSessionForTests('owner-route');
    assert.equal((await app.inject({
      method: 'GET',
      url: '/api/office/snapshot',
      headers: { cookie: `synectra_session=${expired.token}` }
    })).statusCode, 401);

    const { token } = createSessionForTests('owner-route');
    const cookie = `synectra_session=${token}`;
    const empty = await app.inject({ method: 'GET', url: '/api/office/snapshot', headers: { cookie } });
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json(), { snapshots: [] });

    await publishStatus('owner-route', status('Rapat'));

    const response = await app.inject({ method: 'GET', url: '/api/office/snapshot', headers: { cookie } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().snapshots[0].sequence, 0);
    assert.equal(response.json().snapshots[0].status.activity, 'Rapat');
  } finally {
    await app.close();
  }
});

test('closes the SSE stream when the session expires or is revoked', { timeout: 30_000 }, async () => {
  const app = buildApp();
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const { token } = createSessionForTests('owner-expire');
  const controller = new AbortController();
  try {
    const response = await fetch(`${address}/api/office/events`, {
      headers: { cookie: `synectra_session=${token}` },
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);
    assert.match(new TextDecoder().decode((await reader.read()).value), /: connected/);

    revokeSession(token);
    const next = await reader.read();
    assert.equal(next.done, true);
  } finally {
    controller.abort();
    await app.close();
  }
});

test('streams SSE events only for the authenticated owner', async () => {
  const app = buildApp();
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const { token } = createSessionForTests('owner-sse');
  const controller = new AbortController();
  try {
    const response = await fetch(`${address}/api/office/events`, {
      headers: { cookie: `synectra_session=${token}` },
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);

    const reader = response.body?.getReader();
    assert.ok(reader);
    assert.match(new TextDecoder().decode((await reader.read()).value), /: connected/);

    await publishStatus('owner-sse', status('Menyapa'));

    const chunk = new TextDecoder().decode((await reader.read()).value);
    assert.match(chunk, /"ownerId":"owner-sse"/);
    assert.match(chunk, /"activity":"Menyapa"/);
    await reader.cancel();
  } finally {
    controller.abort();
    await app.close();
  }
});


test('staff snapshot and stream expose only the authenticated owner activity', async () => {
  const app = buildApp();
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const tokenA = createSessionForTests('staff-owner-a').token;
  const tokenB = createSessionForTests('staff-owner-b').token;
  const controller = new AbortController();
  let finish: (() => void) | undefined;
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/office/staff' })).statusCode, 401);
    finish = beginStaffActivity('staff-owner-b', 'admin', 'Membuat PDF');
    const ownResponse = await app.inject({ method: 'GET', url: '/api/office/staff', headers: { cookie: `synectra_session=${tokenA}` } });
    const otherResponse = await app.inject({ method: 'GET', url: '/api/office/staff', headers: { cookie: `synectra_session=${tokenB}` } });
    assert.equal(officeStaffSnapshotSchema.parse(ownResponse.json()).staff.admin.active, false);
    assert.equal(officeStaffSnapshotSchema.parse(otherResponse.json()).staff.admin.active, true);

    const stream = await fetch(`${address}/api/office/events`, { headers: { cookie: `synectra_session=${tokenA}` }, signal: controller.signal });
    const reader = stream.body!.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial, /event: staff/);
    const release = beginStaffActivity('staff-owner-a', 'communication', 'Memproses pengiriman WhatsApp');
    const changed = new TextDecoder().decode((await reader.read()).value);
    assert.match(changed, /event: staff/);
    assert.match(changed, /Memproses pengiriman WhatsApp/);
    assert.doesNotMatch(changed, /Membuat PDF/);
    release();
    await reader.cancel();
  } finally {
    finish?.();
    controller.abort();
    await app.close();
  }
});
