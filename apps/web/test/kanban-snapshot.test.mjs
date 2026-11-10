import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getStoredSnapshot, setStoredSnapshot, isSnapshotStale, getLockReason, KANBAN_STORAGE_PREFIX } from '../src/office3d/kanban-storage.ts';

// Mock storage using Map
class MockStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, value); }
}

const mock = new MockStorage();
const board = 'test-board';
const snapshot = {
  board: board,
  tasks: [],
  links: [],
  lastSyncAt: new Date().toISOString(),
  isOffline: false,
};

test('setStoredSnapshot and getStoredSnapshot roundtrip', () => {
  setStoredSnapshot(board, snapshot, mock);
  const stored = getStoredSnapshot(board, mock);
  assert.deepEqual(stored, snapshot);
});

test('getStoredSnapshot returns null on malformed JSON', () => {
  const key = `${KANBAN_STORAGE_PREFIX}${board}`;
  mock.map.set(key, '{invalid json');
  const result = getStoredSnapshot(board, mock);
  assert.equal(result, null);
});

test('isSnapshotStale detects stale and offline', () => {
  // fresh snapshot
  const fresh = { ...snapshot, isOffline: false, lastSyncAt: new Date().toISOString() };
  assert.equal(isSnapshotStale(fresh, Date.now(), 5 * 60 * 1000), false);
  // stale by time (>2 min)
  const old = { ...snapshot, isOffline: false, lastSyncAt: new Date(Date.now() - 3 * 60 * 1000).toISOString() };
  assert.equal(isSnapshotStale(old), true);
  // offline flag
  const offline = { ...snapshot, isOffline: true, lastSyncAt: new Date().toISOString() };
  assert.equal(isSnapshotStale(offline), true);
  // null snapshot
  assert.equal(isSnapshotStale(null), true);
});

test('getLockReason returns correct messages', () => {
  const optsBase = { hasSnapshot: true, stale: false, isOffline: false, mutating: false, csrfToken: 'token' };
  assert.equal(getLockReason(optsBase), null);
  const mutating = { ...optsBase, mutating: true };
  assert.equal(getLockReason(mutating), 'Menyimpan perubahan...');
  const noCsrf = { ...optsBase, csrfToken: null };
  assert.equal(getLockReason(noCsrf), 'Token CSRF tidak tersedia');
  const noSnapshot = { ...optsBase, hasSnapshot: false };
  assert.equal(getLockReason(noSnapshot), 'Papan belum dimuat');
  const offline = { ...optsBase, isOffline: true };
  assert.equal(getLockReason(offline), 'Snapshot offline (hanya baca)');
  const stale = { ...optsBase, stale: true };
  assert.equal(getLockReason(stale), 'Snapshot stale (> 2 menit tanpa sinkronisasi)');
});

test('getLockReason reports a pending Hermes sync instead of stale while syncing', () => {
  const opts = { hasSnapshot: true, stale: true, isOffline: false, mutating: false, syncing: true, csrfToken: 'token' };
  assert.equal(getLockReason(opts), 'Menunggu sinkronisasi Hermes');
  assert.equal(getLockReason({ ...opts, syncing: false }), 'Snapshot stale (> 2 menit tanpa sinkronisasi)');
});
