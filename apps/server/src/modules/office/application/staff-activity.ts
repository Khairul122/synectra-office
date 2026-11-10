import type { OfficeStaffId as StaffId, OfficeStaffSnapshot as StaffSnapshot } from '@synectra/contracts';
type OwnerActivity = { revision: number; tasks: Record<StaffId, Map<symbol, string>>; listeners: Set<(snapshot: StaffSnapshot) => void> };

const owners = new Map<string, OwnerActivity>();
const staffIds: StaffId[] = ['hermes', 'admin', 'communication'];

function ownerActivity(ownerId: string): OwnerActivity {
  let owner = owners.get(ownerId);
  if (!owner) {
    owner = { revision: 0, tasks: { hermes: new Map(), admin: new Map(), communication: new Map() }, listeners: new Set() };
    owners.set(ownerId, owner);
  }
  return owner;
}

export function getStaffSnapshot(ownerId: string): StaffSnapshot {
  const owner = owners.get(ownerId);
  const staff = Object.fromEntries(staffIds.map(id => {
    const activity = owner ? [...owner.tasks[id].values()].at(-1) : undefined;
    return [id, activity === undefined ? { active: false, activity: null } : { active: true, activity }];
  })) as StaffSnapshot['staff'];
  return { revision: owner?.revision ?? 0, staff };
}

function notify(ownerId: string, owner: OwnerActivity) {
  owner.revision++;
  const snapshot = getStaffSnapshot(ownerId);
  for (const listener of owner.listeners) {
    try { listener(snapshot); } catch { /* A disconnected viewer must not interrupt business operations. */ }
  }
}

function cleanup(ownerId: string, owner: OwnerActivity) {
  if (owners.get(ownerId) === owner && !owner.listeners.size && staffIds.every(id => !owner.tasks[id].size)) owners.delete(ownerId);
}

export function beginStaffActivity(ownerId: string, id: StaffId, activity: string): () => void {
  const owner = ownerActivity(ownerId);
  const token = Symbol();
  const startedAt = Date.now();
  owner.tasks[id].set(token, activity);
  notify(ownerId, owner);
  return () => {
    if (!owner.tasks[id].delete(token)) return;
    recordWork(ownerId, { staff: id, activity, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt });
    notify(ownerId, owner);
    cleanup(ownerId, owner);
  };
}

export type StaffWorkRecord = { staff: StaffId; activity: string; startedAt: string; durationMs: number };
// ponytail: log kerja di memori (maks 500/owner), hilang saat server restart; pindahkan ke Firestore bila evaluasi butuh riwayat lintas restart.
const workLogs = new Map<string, StaffWorkRecord[]>();

function recordWork(ownerId: string, record: StaffWorkRecord) {
  const log = workLogs.get(ownerId) ?? [];
  log.push(record);
  if (log.length > 500) log.shift();
  workLogs.set(ownerId, log);
}

/** Operasi nyata yang sudah selesai sejak `sinceMs` (epoch), urut lama -> baru. */
export function listStaffWork(ownerId: string, sinceMs = 0): StaffWorkRecord[] {
  return (workLogs.get(ownerId) ?? []).filter(record => Date.parse(record.startedAt) >= sinceMs);
}

export function subscribeStaffActivity(ownerId: string, listener: (snapshot: StaffSnapshot) => void): () => void {
  const owner = ownerActivity(ownerId);
  owner.listeners.add(listener);
  return () => { owner.listeners.delete(listener); cleanup(ownerId, owner); };
}
