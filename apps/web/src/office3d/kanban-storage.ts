import { kanbanBoardSnapshotSchema, type KanbanBoardSnapshot } from '@synectra/contracts';

export const KANBAN_STORAGE_PREFIX = 'synectra:kanban-snapshot:';
export const DEFAULT_BOARD = 'synectra-office';

export const KANBAN_PROFILES = [
  { id: 'synectra-office', label: 'synectra-office (Utama)' },
  { id: 'default', label: 'default' },
  { id: 'personal', label: 'personal' },
  { id: 'archive', label: 'archive' }
] as const;

export function getStoredSnapshot(
  board: string,
  storage?: { getItem(key: string): string | null }
): KanbanBoardSnapshot | null {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return null;
    const raw = store.getItem(`${KANBAN_STORAGE_PREFIX}${board}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = kanbanBoardSnapshotSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function setStoredSnapshot(
  board: string,
  snapshot: KanbanBoardSnapshot,
  storage?: { setItem(key: string, value: string): void }
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(`${KANBAN_STORAGE_PREFIX}${board}`, JSON.stringify(snapshot));
  } catch {
    // Abaikan kegagalan penulisan storage (kuota/private mode)
  }
}

export function isSnapshotStale(
  snapshot: KanbanBoardSnapshot | null,
  now: number = Date.now(),
  maxAgeMs: number = 120_000
): boolean {
  if (!snapshot || snapshot.isOffline) return true;
  const time = Date.parse(snapshot.lastSyncAt);
  return !Number.isFinite(time) || now - time > maxAgeMs;
}

export function getLockReason(options: {
  hasSnapshot: boolean;
  stale: boolean;
  isOffline?: boolean;
  mutating: boolean;
  csrfToken: string | null;
}): string | null {
  if (options.mutating) return 'Menyimpan perubahan...';
  if (!options.csrfToken) return 'Token CSRF tidak tersedia';
  if (!options.hasSnapshot) return 'Papan belum dimuat';
  if (options.isOffline) return 'Snapshot offline (hanya baca)';
  if (options.stale) return 'Snapshot stale (> 2 menit tanpa sinkronisasi)';
  return null;
}
