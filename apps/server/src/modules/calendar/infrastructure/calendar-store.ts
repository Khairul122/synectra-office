import {
  calendarScheduleSchema,
  calendarRunRecordSchema,
  type CalendarSchedule,
  type CalendarRunRecord,
  type ScheduleType,
  type ScheduleStatus
} from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { withSchema, FIRESTORE_COLLECTIONS } from '../../../infrastructure/firestore-schema';
import {
  createMemoryCalendarStore,
  type CalendarStore
} from '../application/calendar-service';

export type { CalendarStore };
export { createMemoryCalendarStore };

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }
  return result as T;
}

export class FirestoreCalendarStore implements CalendarStore {
  private schedulesRef(ownerId: string) {
    const firestore = getAppFirestore();
    return firestore.collection(`${FIRESTORE_COLLECTIONS.OWNERS}/${ownerId}/calendar_schedules`);
  }

  private runsRef(ownerId: string) {
    const firestore = getAppFirestore();
    return firestore.collection(`${FIRESTORE_COLLECTIONS.OWNERS}/${ownerId}/calendar_runs`);
  }

  private claimsRef(ownerId: string) {
    const firestore = getAppFirestore();
    return firestore.collection(`${FIRESTORE_COLLECTIONS.OWNERS}/${ownerId}/calendar_claims`);
  }

  async getSchedule(ownerId: string, id: string): Promise<CalendarSchedule | null> {
    const snap = await this.schedulesRef(ownerId).doc(id).get();
    if (!snap.exists) return null;
    return calendarScheduleSchema.parse(snap.data());
  }

  async listSchedules(
    ownerId: string,
    filter?: { type?: ScheduleType; status?: ScheduleStatus }
  ): Promise<CalendarSchedule[]> {
    const snap = await this.schedulesRef(ownerId).get();
    let items = snap.docs.map((doc) => calendarScheduleSchema.parse(doc.data()));
    if (filter?.type) {
      items = items.filter((s) => s.type === filter.type);
    }
    if (filter?.status) {
      items = items.filter((s) => s.status === filter.status);
    }
    return items;
  }

  async listOwnerIds(): Promise<string[]> {
    const snap = await getAppFirestore().collection(FIRESTORE_COLLECTIONS.OWNERS).get();
    return snap.docs.map((doc) => doc.id);
  }

  async saveSchedule(ownerId: string, schedule: CalendarSchedule): Promise<CalendarSchedule> {
    const parsed = calendarScheduleSchema.parse(schedule);
    await this.schedulesRef(ownerId).doc(parsed.id).set(cleanUndefined(withSchema(parsed, ownerId)));
    return parsed;
  }

  async deleteSchedule(ownerId: string, id: string): Promise<boolean> {
    await this.schedulesRef(ownerId).doc(id).delete();
    return true;
  }

  async getRun(ownerId: string, runId: string): Promise<CalendarRunRecord | null> {
    const snap = await this.runsRef(ownerId).doc(runId).get();
    if (!snap.exists) return null;
    return calendarRunRecordSchema.parse(snap.data());
  }

  async listRuns(
    ownerId: string,
    scheduleId?: string,
    limit: number = 50
  ): Promise<CalendarRunRecord[]> {
    const snap = await this.runsRef(ownerId).get();
    let runs = snap.docs.map((doc) => calendarRunRecordSchema.parse(doc.data()));
    if (scheduleId) {
      runs = runs.filter((r) => r.scheduleId === scheduleId);
    }
    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return runs.slice(0, limit);
  }

  async saveRun(ownerId: string, run: CalendarRunRecord): Promise<CalendarRunRecord> {
    const parsed = calendarRunRecordSchema.parse(run);
    await this.runsRef(ownerId).doc(parsed.id).set(cleanUndefined(withSchema(parsed, ownerId)));
    return parsed;
  }

  async completeRun(ownerId: string, run: CalendarRunRecord, schedule: CalendarSchedule): Promise<void> {
    const parsedRun = calendarRunRecordSchema.parse(run);
    const parsedSchedule = calendarScheduleSchema.parse(schedule);
    const claimId = `${parsedRun.scheduleId}_${parsedRun.runIdentity}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const db = getAppFirestore();
    await db.runTransaction(async (t) => {
      const claimDoc = this.claimsRef(ownerId).doc(claimId);
      const runDoc = this.runsRef(ownerId).doc(parsedRun.id);
      const scheduleDoc = this.schedulesRef(ownerId).doc(parsedSchedule.id);
      const claim = await t.get(claimDoc);
      if (!parsedRun.fencingToken || !claim.exists || claim.data()?.fencingToken !== parsedRun.fencingToken || claim.data()?.completed) {
        throw new Error(`Fencing token mismatch for run ${parsedRun.runIdentity}`);
      }
      t.set(runDoc, cleanUndefined(withSchema(parsedRun, ownerId)));
      t.set(scheduleDoc, cleanUndefined(withSchema(parsedSchedule, ownerId)));
      t.update(claimDoc, { completed: true });
    });
  }

  async claimRun(
    ownerId: string,
    scheduleId: string,
    runIdentity: string,
    lockUntil: Date
  ): Promise<{ claimed: boolean; fencingToken?: string }> {
    const db = getAppFirestore();
    const docId = `${scheduleId}_${runIdentity}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const claimDoc = this.claimsRef(ownerId).doc(docId);

    const result = await db.runTransaction(async (t) => {
      const snap = await t.get(claimDoc);
      const now = Date.now();
      if (snap.exists) {
        const data = snap.data();
        if (data && (data.completed || data.expiresAt > now)) {
          return { claimed: false };
        }
      }
      const fencingToken = Math.random().toString(36).substring(2, 15);
      t.set(claimDoc, {
        scheduleId,
        runIdentity,
        fencingToken,
        expiresAt: lockUntil.getTime(),
        completed: false
      });
      return { claimed: true, fencingToken };
    });

    return result;
  }

  async isRunClaimCurrent(ownerId: string, scheduleId: string, runIdentity: string, fencingToken: string): Promise<boolean> {
    const claimId = `${scheduleId}_${runIdentity}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const snap = await this.claimsRef(ownerId).doc(claimId).get();
    const data = snap.data();
    return Boolean(data && data.fencingToken === fencingToken && !data.completed);
  }

  resetForTests(): void {
    // No-op for Firestore store in tests
  }
}

export function createFirestoreCalendarStore(): CalendarStore {
  return new FirestoreCalendarStore();
}

export function createCalendarStore(): CalendarStore {
  return process.env.FIREBASE_USE_FIRESTORE === 'true'
    ? createFirestoreCalendarStore()
    : createMemoryCalendarStore();
}

export const calendarStore = createCalendarStore();
