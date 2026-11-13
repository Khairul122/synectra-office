import { getAppFirestore } from '../../../infrastructure/firestore';
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
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
// Mode memori (dev/test): maks 500/owner, hilang saat restart. Mode Firestore: owners/{id}/staff_work, tahan restart.
const workLogs = new Map<string, StaffWorkRecord[]>();
const workCollection = (ownerId: string) => getAppFirestore().collection('owners').doc(ownerId).collection('staff_work');

function recordWork(ownerId: string, record: StaffWorkRecord) {
  if (useFirestore) {
    // Log kerja tidak boleh menggagalkan operasi bisnis yang sudah selesai.
    workCollection(ownerId).add(record).catch(error => console.error('[staff-work] gagal menyimpan log:', error instanceof Error ? error.message : error));
    return;
  }
  const log = workLogs.get(ownerId) ?? [];
  log.push(record);
  if (log.length > 500) log.shift();
  workLogs.set(ownerId, log);
}

/** Operasi nyata yang sudah selesai sejak `sinceMs` (epoch), urut lama -> baru. */
export async function listStaffWork(ownerId: string, sinceMs = 0): Promise<StaffWorkRecord[]> {
  const since = new Date(sinceMs).toISOString();
  if (useFirestore) {
    const snapshot = await workCollection(ownerId).where('startedAt', '>=', since).orderBy('startedAt').limit(2000).get();
    return snapshot.docs.map(doc => doc.data() as StaffWorkRecord);
  }
  return (workLogs.get(ownerId) ?? []).filter(record => record.startedAt >= since);
}

export function subscribeStaffActivity(ownerId: string, listener: (snapshot: StaffSnapshot) => void): () => void {
  const owner = ownerActivity(ownerId);
  owner.listeners.add(listener);
  return () => { owner.listeners.delete(listener); cleanup(ownerId, owner); };
}
