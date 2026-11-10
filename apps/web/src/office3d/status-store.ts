import type { OfficeBusinessEvent, OfficeStatus, OfficeStatusEvent, OfficeStatusSnapshot, WorkState } from './types';

export class StatusStore {
  private readonly staleAfterMs: number;
  private readonly statuses = new Map<string, OfficeStatus>();
  private readonly sequences = new Map<string, number>();
  private readonly eventIds = new Set<string>();
  private readonly lastBusinessEvents = new Map<string, OfficeBusinessEvent>();

  constructor(staleAfterMs = 120_000) {
    this.staleAfterMs = staleAfterMs;
  }

  applyEvent(event: OfficeStatusEvent): boolean {
    if (this.eventIds.has(event.eventId) || event.sequence <= (this.sequences.get(event.ownerId) ?? -1)) return false;
    this.eventIds.add(event.eventId);
    this.sequences.set(event.ownerId, event.sequence);
    this.statuses.set(event.ownerId, event.status);
    return true;
  }

  applyBusinessEvent(event: OfficeBusinessEvent): boolean {
    if (!this.applyEvent(event)) return false;
    this.lastBusinessEvents.set(event.ownerId, event);
    return true;
  }

  applySnapshot(snapshot: OfficeStatusSnapshot): boolean {
    if (snapshot.sequence < (this.sequences.get(snapshot.ownerId) ?? -1)) return false;
    this.sequences.set(snapshot.ownerId, snapshot.sequence);
    this.statuses.set(snapshot.ownerId, snapshot.status);
    return true;
  }

  get(ownerId: string): OfficeStatus | undefined {
    return this.statuses.get(ownerId);
  }

  getLastBusinessEvent(ownerId: string): OfficeBusinessEvent | undefined {
    return this.lastBusinessEvents.get(ownerId);
  }

  getOwners(): string[] {
    return Array.from(this.statuses.keys());
  }

  getEffectiveState(ownerId: string, now: number): WorkState | undefined {
    const status = this.statuses.get(ownerId);
    if (!status) return undefined;
    return now - status.heartbeatAt >= this.staleAfterMs ? 'stale' : status.workState;
  }
}
