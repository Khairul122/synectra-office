import { randomUUID } from 'node:crypto';
import {
  type CalendarSchedule,
  type CalendarRunRecord,
  type CreateCalendarScheduleRequest,
  type CalendarOverview,
  type ScheduleType,
  type ScheduleStatus,
  calendarScheduleSchema,
  calendarRunRecordSchema,
  createCalendarScheduleRequestSchema
} from '@synectra/contracts';
import {
  computeNextRun,
  detectMissedRun,
  generateRunIdentity,
  toWibIsoString,
  validateScheduleRule,
  validateTimezone,
  DEFAULT_TIMEZONE
} from './time-utils';
import { listDeliveries } from '../../deliveries/application/delivery-service';
import { publishBusinessEvent } from '../../office/application/office-event-service';
import {
  HERMES_PROFILE,
  stripAnsi,
  type HermesCliResult,
  type HermesCliRunner
} from '../../../infrastructure/hermes-cli';

export type HermesCronRunner = HermesCliRunner;

export type AppJobExecutor = (input: {
  ownerId: string;
  schedule: CalendarSchedule;
  runIdentity: string;
}) => Promise<{ summary: string; isChanged: boolean }>;

export interface CalendarStore {
  getSchedule(ownerId: string, id: string): Promise<CalendarSchedule | null>;
  listSchedules(
    ownerId: string,
    filter?: { type?: ScheduleType; status?: ScheduleStatus }
  ): Promise<CalendarSchedule[]>;
  listOwnerIds(): Promise<string[]>;
  saveSchedule(ownerId: string, schedule: CalendarSchedule): Promise<CalendarSchedule>;
  deleteSchedule(ownerId: string, id: string): Promise<boolean>;
  getRun(ownerId: string, runId: string): Promise<CalendarRunRecord | null>;
  listRuns(ownerId: string, scheduleId?: string, limit?: number): Promise<CalendarRunRecord[]>;
  saveRun(ownerId: string, run: CalendarRunRecord): Promise<CalendarRunRecord>;
  completeRun(
    ownerId: string,
    run: CalendarRunRecord,
    schedule: CalendarSchedule
  ): Promise<void>;
  claimRun(
    ownerId: string,
    scheduleId: string,
    runIdentity: string,
    lockUntil: Date
  ): Promise<{ claimed: boolean; fencingToken?: string }>;
  isRunClaimCurrent(ownerId: string, scheduleId: string, runIdentity: string, fencingToken: string): Promise<boolean>;
  resetForTests(): void;
}

export function createMemoryCalendarStore(): CalendarStore {
  const scheduleStore = new Map<string, Map<string, CalendarSchedule>>();
  const runStore = new Map<string, Map<string, CalendarRunRecord>>();
  const claims = new Map<string, { identity: string; fencingToken: string; expiresAt: number; completed: boolean }>();

  function ownerSchedules(ownerId: string): Map<string, CalendarSchedule> {
    let map = scheduleStore.get(ownerId);
    if (!map) {
      map = new Map<string, CalendarSchedule>();
      scheduleStore.set(ownerId, map);
    }
    return map;
  }

  function ownerRuns(ownerId: string): Map<string, CalendarRunRecord> {
    let map = runStore.get(ownerId);
    if (!map) {
      map = new Map<string, CalendarRunRecord>();
      runStore.set(ownerId, map);
    }
    return map;
  }

  return {
    async getSchedule(ownerId, id) {
      const item = ownerSchedules(ownerId).get(id);
      return item ? structuredClone(item) : null;
    },
    async listSchedules(ownerId, filter) {
      let list = Array.from(ownerSchedules(ownerId).values());
      if (filter?.type) {
        list = list.filter((s) => s.type === filter.type);
      }
      if (filter?.status) {
        list = list.filter((s) => s.status === filter.status);
      }
      return structuredClone(list);
    },
    async listOwnerIds() {
      return Array.from(scheduleStore.keys());
    },
    async saveSchedule(ownerId, schedule) {
      const parsed = calendarScheduleSchema.parse(schedule);
      ownerSchedules(ownerId).set(parsed.id, structuredClone(parsed));
      return structuredClone(parsed);
    },
    async deleteSchedule(ownerId, id) {
      return ownerSchedules(ownerId).delete(id);
    },
    async getRun(ownerId, runId) {
      const run = ownerRuns(ownerId).get(runId);
      return run ? structuredClone(run) : null;
    },
    async listRuns(ownerId, scheduleId, limit = 50) {
      let list = Array.from(ownerRuns(ownerId).values());
      if (scheduleId) {
        list = list.filter((r) => r.scheduleId === scheduleId);
      }
      list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      return structuredClone(list.slice(0, limit));
    },
    async saveRun(ownerId, run) {
      const parsed = calendarRunRecordSchema.parse(run);
      ownerRuns(ownerId).set(parsed.id, structuredClone(parsed));
      return structuredClone(parsed);
    },
    async completeRun(ownerId, run, schedule) {
      const parsedRun = calendarRunRecordSchema.parse(run);
      const parsedSchedule = calendarScheduleSchema.parse(schedule);
      const key = `${ownerId}:${parsedRun.scheduleId}:${parsedRun.runIdentity}`;
      const claim = claims.get(key);
      if (!parsedRun.fencingToken || claim?.fencingToken !== parsedRun.fencingToken || claim.completed) {
        throw new Error(`Fencing token mismatch for run ${parsedRun.runIdentity}`);
      }
      ownerRuns(ownerId).set(parsedRun.id, structuredClone(parsedRun));
      ownerSchedules(ownerId).set(parsedSchedule.id, structuredClone(parsedSchedule));
      claim.completed = true;
    },
    async claimRun(ownerId, scheduleId, runIdentity, lockUntil) {
      const key = `${ownerId}:${scheduleId}:${runIdentity}`;
      const existing = claims.get(key);
      const now = Date.now();
      if (existing && (existing.completed || existing.expiresAt > now)) {
        return { claimed: false };
      }
      const fencingToken = randomUUID();
      claims.set(key, {
        identity: runIdentity,
        fencingToken,
        expiresAt: lockUntil.getTime(),
        completed: false
      });
      return { claimed: true, fencingToken };
    },
    async isRunClaimCurrent(ownerId, scheduleId, runIdentity, fencingToken) {
      const claim = claims.get(`${ownerId}:${scheduleId}:${runIdentity}`);
      return claim?.fencingToken === fencingToken && !claim.completed;
    },
    resetForTests() {
      scheduleStore.clear();
      runStore.clear();
      claims.clear();
    }
  };
}

let activeStore: CalendarStore = createMemoryCalendarStore();
let activeRunner: HermesCronRunner = async () => ({
  stdout: '',
  stderr: '',
  exitCode: 0
});
let activeAppJobExecutor: AppJobExecutor = async ({ schedule }) => {
  const script = schedule.script?.trim();
  if (script && script !== 'noop' && script !== 'office_status') {
    throw new Error(`Unsupported app_job script: ${script}`);
  }
  return {
    summary: script === 'office_status'
      ? `Job aplikasi ${schedule.name} memperbarui status kantor.`
      : `Job aplikasi ${schedule.name} berhasil diselesaikan.`,
    isChanged: true
  };
};

export function setCalendarStore(store: CalendarStore): void {
  activeStore = store;
}

export function getCalendarStore(): CalendarStore {
  return activeStore;
}

export function setHermesCronRunner(runner: HermesCronRunner): void {
  activeRunner = runner;
}

export function getHermesCronRunner(): HermesCronRunner {
  return activeRunner;
}

export function setAppJobExecutor(executor: AppJobExecutor): void {
  activeAppJobExecutor = executor;
}

export function getAppJobExecutor(): AppJobExecutor {
  return activeAppJobExecutor;
}

export function resetCalendarDataForTests(): void {
  activeStore.resetForTests();
}

/** Jalankan `hermes -p synectra-office cron ...`. User input selalu berupa `--opt=value` atau sesudah `--`. */
function runCron(
  subcommand: string,
  options: string[],
  positionals: string[] = [],
  runnerOptions?: { timeout?: number }
): Promise<HermesCliResult> {
  const args = ['-p', HERMES_PROFILE, 'cron', subcommand, ...options];
  if (positionals.length > 0) args.push('--', ...positionals);
  return activeRunner(args, runnerOptions);
}

function cronFailure(action: string, res: HermesCliResult): Error {
  const detail = stripAnsi(res.stderr || res.stdout).trim().slice(0, 300) || `exit code ${res.exitCode}`;
  return Object.assign(new Error(`Hermes cron ${action} gagal: ${detail}`), { statusCode: 502 });
}

/** Job ID Hermes. Nama tidak dipakai sebagai fallback karena bisa ambigu antar-owner. */
function cronJobRef(schedule: CalendarSchedule): string {
  if (schedule.hermesJobId) return schedule.hermesJobId;
  throw Object.assign(new Error('Jadwal ini tidak punya hermesJobId; hapus lalu buat ulang jadwalnya.'), { statusCode: 409 });
}

/** Hapus jadwal; untuk hermes_cron, job di Hermes ikut dihapus agar tidak tertinggal berjalan. */
export async function deleteSchedule(ownerId: string, scheduleId: string): Promise<void> {
  const schedule = await activeStore.getSchedule(ownerId, scheduleId);
  if (!schedule) throw Object.assign(new Error(`Schedule not found: ${scheduleId}`), { statusCode: 404 });

  if (schedule.type === 'hermes_cron' && schedule.hermesJobId) {
    const res = await runCron('remove', [], [schedule.hermesJobId]);
    // Job yang sudah tidak ada di Hermes tidak menghalangi penghapusan lokal.
    const alreadyGone = /not found|no such|unknown job|does not exist/i.test(stripAnsi(`${res.stdout}
${res.stderr}`));
    if (res.exitCode !== 0 && !alreadyGone) throw cronFailure('remove', res);
  }
  await activeStore.deleteSchedule(ownerId, scheduleId);
}

export async function createSchedule(
  ownerId: string,
  rawInput: CreateCalendarScheduleRequest
): Promise<CalendarSchedule> {
  const input = createCalendarScheduleRequestSchema.parse(rawInput);
  validateTimezone(input.timezone);
  validateScheduleRule(input.schedule);
  const now = new Date();
  const nextRunAt = computeNextRun(input.schedule, now, input.timezone);

  const schedule: CalendarSchedule = {
    id: randomUUID(),
    ownerId,
    name: input.name,
    type: input.type,
    actor: input.actor,
    schedule: input.schedule,
    timezone: input.timezone,
    prompt: input.prompt,
    script: input.script,
    nextRunAt,
    lastRunAt: null,
    status: 'active',
    pausedReason: null,
    budget: input.budget,
    estimatedCost: input.estimatedCost ?? 0,
    effects: input.effects,
    timeoutMs: input.timeoutMs ?? 30000,
    maxConcurrency: input.maxConcurrency ?? 1,
    missedRunPolicy: input.missedRunPolicy,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (input.type === 'hermes_cron') {
    const positionals = input.prompt ? [input.schedule, input.prompt] : [input.schedule];
    const res = await runCron('create', [`--name=${input.name}`], positionals);
    if (res.exitCode !== 0) throw cronFailure('create', res);
    const jobId = stripAnsi(res.stdout).match(/Created job:\s*([A-Za-z0-9_-]+)/)?.[1];
    if (!jobId) {
      throw Object.assign(new Error('Hermes cron create tidak mengembalikan job id'), { statusCode: 502 });
    }
    schedule.hermesJobId = jobId;
  }

  return activeStore.saveSchedule(ownerId, schedule);
}

export async function pauseSchedule(
  ownerId: string,
  scheduleId: string,
  reason?: string
): Promise<CalendarSchedule> {
  const schedule = await activeStore.getSchedule(ownerId, scheduleId);
  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  if (schedule.type === 'hermes_cron') {
    const res = await runCron('pause', [], [cronJobRef(schedule)]);
    if (res.exitCode !== 0) throw cronFailure('pause', res);
  }

  schedule.status = 'paused';
  schedule.pausedReason = reason?.trim() || 'Ditunda oleh pemilik';
  schedule.updatedAt = new Date().toISOString();

  return activeStore.saveSchedule(ownerId, schedule);
}

export async function resumeSchedule(
  ownerId: string,
  scheduleId: string
): Promise<CalendarSchedule> {
  const schedule = await activeStore.getSchedule(ownerId, scheduleId);
  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  if (schedule.type === 'hermes_cron') {
    const res = await runCron('resume', [], [cronJobRef(schedule)]);
    if (res.exitCode !== 0) throw cronFailure('resume', res);
  }

  const now = new Date();
  schedule.status = 'active';
  schedule.pausedReason = null;
  schedule.nextRunAt = computeNextRun(schedule.schedule, now, schedule.timezone);
  schedule.updatedAt = now.toISOString();

  return activeStore.saveSchedule(ownerId, schedule);
}

export async function executeScheduleRun(
  ownerId: string,
  scheduleId: string,
  options?: { now?: Date; runIdentity?: string }
): Promise<CalendarRunRecord> {
  const now = options?.now ?? new Date();
  const schedule = await activeStore.getSchedule(ownerId, scheduleId);
  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  if (schedule.status === 'paused') {
    throw new Error('Cannot run paused schedule');
  }

  // Batasi concurrency
  const activeRuns = (await activeStore.listRuns(ownerId, scheduleId, 10)).filter(
    (r) => r.status === 'running'
  );
  if (activeRuns.length >= schedule.maxConcurrency) {
    throw new Error(
      `Concurrency limit reached for schedule: ${schedule.maxConcurrency} run(s) already active`
    );
  }

  // Run identity & fencing token claim to prevent duplicate execution on restart
  const runIdentity = options?.runIdentity ?? generateRunIdentity(scheduleId, schedule.nextRunAt, 1);
  const lockExpires = new Date(now.getTime() + schedule.timeoutMs + 10000);
  const claim = await activeStore.claimRun(ownerId, scheduleId, runIdentity, lockExpires);

  if (!claim.claimed) {
    throw new Error(`Schedule run already claimed or executed for current cycle (${runIdentity})`);
  }

  const runRecord: CalendarRunRecord = {
    id: randomUUID(),
    ownerId,
    scheduleId,
    scheduleName: schedule.name,
    type: schedule.type,
    actor: schedule.actor,
    runIdentity,
    startedAt: now.toISOString(),
    completedAt: null,
    status: 'running',
    durationMs: 0,
    summary: 'Eksekusi pekerjaan sedang berlangsung...',
    errorReason: null,
    isChanged: false,
    fencingToken: claim.fencingToken
  };

  await activeStore.saveRun(ownerId, runRecord);

  const startTime = Date.now();
  let runSuccess = true;
  let errorMsg: string | null = null;
  let summary = 'Pekerjaan selesai tanpa perubahan.';
  let isChanged = false;

  try {
    if (schedule.type === 'hermes_cron') {
      // `tick` menjalankan job jatuh tempo di seluruh profil; lock Hermes mencegah eksekusi ganda.
      // Output tick bisa memuat job owner lain, jadi tidak disimpan. Status diambil dari riwayat job ini saja.
      const runnerOptions = { timeout: schedule.timeoutMs };
      const tick = await runCron('tick', [], [], runnerOptions);
      const gatewayOwnsTick = /yielded its tick|owns the runtime lock/i.test(stripAnsi(`${tick.stdout}\n${tick.stderr}`));
      if (tick.exitCode !== 0 && !gatewayOwnsTick) {
        runSuccess = false;
        errorMsg = `Hermes cron tick gagal (exit ${tick.exitCode})`;
        summary = `Gagal menjalankan Hermes cron: ${errorMsg}`;
      } else if (!schedule.hermesJobId) {
        summary = 'Hermes cron tick dijalankan; jadwal lama ini belum menyimpan job id Hermes.';
      } else {
        const runs = await runCron('runs', ['--limit=1'], [schedule.hermesJobId], runnerOptions);
        if (runs.exitCode !== 0) {
          runSuccess = false;
          errorMsg = cronFailure('runs', runs).message;
          summary = errorMsg;
        } else {
          const out = stripAnsi(runs.stdout).trim();
          isChanged = out.length > 0;
          summary = out ? `Riwayat terakhir Hermes: ${out.slice(0, 300)}` : 'Belum ada eksekusi Hermes untuk job ini.';
        }
      }
    } else if (schedule.type === 'app_job') {
      const result = await activeAppJobExecutor({ ownerId, schedule, runIdentity });
      isChanged = result.isChanged;
      summary = result.summary;
    }
  } catch (err: any) {
    runSuccess = false;
    errorMsg = err.message || 'Unknown error during schedule execution';
    summary = `Eksekusi gagal: ${errorMsg}`;
  }

  if (schedule.type === 'app_job') {
    try {
      await publishBusinessEvent({
        type: 'app_job_completed',
        ownerId,
        scheduleId: schedule.id,
        runIdentity,
        status: runSuccess ? 'success' : 'failed',
        summary,
        statusSnapshot: {
          workState: runSuccess ? 'working' : 'away',
          heartbeatAt: Date.now(),
          activity: summary
        }
      });
    } catch {
      // Event publishing best-effort, does not block run completion
    }
  }

  const durationMs = Date.now() - startTime;
  runRecord.completedAt = new Date().toISOString();
  runRecord.status = runSuccess ? 'success' : 'failed';
  runRecord.durationMs = durationMs;
  runRecord.summary = summary;
  runRecord.errorReason = errorMsg;
  runRecord.isChanged = isChanged;

  // Update schedule status and next run time
  schedule.lastRunAt = runRecord.completedAt;
  schedule.nextRunAt = computeNextRun(schedule.schedule, new Date(), schedule.timezone);
  schedule.status = 'active';
  schedule.updatedAt = new Date().toISOString();
  await activeStore.completeRun(ownerId, runRecord, schedule);

  return runRecord;
}

export async function processMissedRuns(
  ownerId: string,
  now = new Date()
): Promise<{ processed: number; reviewed: number; skipped: number; caughtUp: number }> {
  const schedules = await activeStore.listSchedules(ownerId, { status: 'active' });
  let processed = 0;
  let reviewed = 0;
  let skipped = 0;
  let caughtUp = 0;

  for (const schedule of schedules) {
    const { isMissed, latencyMs } = detectMissedRun(schedule.nextRunAt, now);
    if (!isMissed) continue;

    processed++;
    if (schedule.missedRunPolicy === 'skip') {
      skipped++;
      const runRecord: CalendarRunRecord = {
        id: randomUUID(),
        ownerId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        type: schedule.type,
        actor: schedule.actor,
        runIdentity: generateRunIdentity(schedule.id, schedule.nextRunAt, 1),
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        status: 'missed',
        durationMs: 0,
        summary: `Jadwal terlewat (${Math.round(latencyMs / 60000)}m terlambat) dan dilewati sesuai kebijakan skip.`,
        errorReason: null,
        isChanged: false
      };
      await activeStore.saveRun(ownerId, runRecord);
      schedule.lastRunAt = now.toISOString();
      schedule.nextRunAt = computeNextRun(schedule.schedule, now, schedule.timezone);
      schedule.updatedAt = now.toISOString();
      await activeStore.saveSchedule(ownerId, schedule);
    } else if (schedule.missedRunPolicy === 'catch_up') {
      caughtUp++;
      try {
        await executeScheduleRun(ownerId, schedule.id, { now });
      } catch {
        // Run record captures failure
      }
    } else {
      // 'review'
      reviewed++;
      schedule.status = 'review';
      schedule.updatedAt = now.toISOString();
      await activeStore.saveSchedule(ownerId, schedule);

      const runRecord: CalendarRunRecord = {
        id: randomUUID(),
        ownerId,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        type: schedule.type,
        actor: schedule.actor,
        runIdentity: generateRunIdentity(schedule.id, schedule.nextRunAt, 1),
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        status: 'review',
        durationMs: 0,
        summary: `Jadwal terlewat (${Math.round(latencyMs / 60000)}m) saat host offline. Menunggu keputusan review pemilik.`,
        errorReason: 'Host offline / waktu terlewat',
        isChanged: false
      };
      await activeStore.saveRun(ownerId, runRecord);
    }
  }

  return { processed, reviewed, skipped, caughtUp };
}

export async function resolveMissedRun(
  ownerId: string,
  scheduleId: string,
  action: 'run' | 'skip'
): Promise<CalendarSchedule> {
  const schedule = await activeStore.getSchedule(ownerId, scheduleId);
  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  const now = new Date();
  if (action === 'run') {
    schedule.status = 'active';
    await activeStore.saveSchedule(ownerId, schedule);
    await executeScheduleRun(ownerId, scheduleId, { now });
  } else if (action === 'skip') {
    schedule.status = 'active';
    schedule.lastRunAt = now.toISOString();
    schedule.nextRunAt = computeNextRun(schedule.schedule, now, schedule.timezone);
    schedule.updatedAt = now.toISOString();
    await activeStore.saveSchedule(ownerId, schedule);
  } else {
    throw new Error(`Invalid missed-run action: ${action}`);
  }

  return (await activeStore.getSchedule(ownerId, scheduleId)) ?? schedule;
}

export async function getCalendarOverview(ownerId: string): Promise<CalendarOverview> {
  const now = new Date();

  // 1. Ambil jadwal dari CalendarStore
  const schedules = await activeStore.listSchedules(ownerId);

  // 2. Proyeksikan outbox delivery yang scheduled dari DeliveryService
  let outboxSchedules: CalendarSchedule[] = [];
  try {
    const deliveries = await listDeliveries(ownerId);
    outboxSchedules = deliveries
      .filter((d) => ['scheduled', 'approved', 'queued', 'review'].includes(d.delivery.status))
      .map((d) => {
        const schedTime = d.approval?.scheduleAt || d.delivery.createdAt;
        const validUntil = d.approval?.validUntil;
        const isExpired = validUntil ? new Date(validUntil).getTime() < now.getTime() : false;
        const status: ScheduleStatus = isExpired
          ? 'review'
          : d.delivery.status === 'scheduled'
            ? 'scheduled'
            : d.delivery.status === 'review'
              ? 'review'
              : 'active';

        return {
          id: `del_${d.delivery.id}`,
          ownerId,
          name: `Kirim nota #${d.approval?.notaId || d.delivery.id} ke ${d.approval?.recipient || 'penerima'}`,
          type: 'outbox_delivery' as const,
          actor: 'communication' as const,
          schedule: schedTime,
          timezone: DEFAULT_TIMEZONE,
          prompt: d.approval?.caption,
          nextRunAt: schedTime,
          lastRunAt: null,
          status,
          pausedReason: isExpired ? 'Approval kedaluwarsa saat offline' : null,
          budget: undefined,
          estimatedCost: 0,
          effects: 'Kirim nota PDF melalui WhatsApp Baileys transport',
          timeoutMs: 30000,
          maxConcurrency: 1,
          missedRunPolicy: 'review' as const,
          referenceId: d.delivery.id,
          createdAt: d.delivery.createdAt,
          updatedAt: d.delivery.updatedAt
        };
      });
  } catch {
    // Delivery service might be empty or in-memory
  }

  const allSchedules = [...schedules, ...outboxSchedules];
  const recentRuns = await activeStore.listRuns(ownerId, undefined, 20);
  const pendingReviewCount = allSchedules.filter((s) => s.status === 'review').length;

  return {
    timezone: DEFAULT_TIMEZONE,
    currentTimeWib: toWibIsoString(now),
    currentTimeUtc: now.toISOString(),
    schedules: allSchedules,
    recentRuns,
    pendingReviewCount
  };
}
