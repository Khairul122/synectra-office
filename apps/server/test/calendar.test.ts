import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import {
  createCalendarScheduleRequestSchema,
  type CreateCalendarScheduleRequest,
  type CalendarSchedule
} from '@synectra/contracts';
import {
  computeNextRun,
  detectMissedRun,
  generateRunIdentity,
  toWibIsoString,
  toWibDisplay,
  DEFAULT_TIMEZONE,
  WIB_OFFSET_HOURS
} from '../src/modules/calendar/application/time-utils';
import {
  createSchedule,
  pauseSchedule,
  resumeSchedule,
  deleteSchedule,
  setHermesCronRunner,
  executeScheduleRun,
  processMissedRuns,
  resolveMissedRun,
  getCalendarOverview,
  resetCalendarDataForTests,
  createMemoryCalendarStore,
  setCalendarStore,
  type HermesCronRunner
} from '../src/modules/calendar/application/calendar-service';
import { createCalendarScheduler } from '../src/modules/calendar/application/calendar-scheduler';
import {
  subscribeOffice,
  resetOfficeEventsForTests
} from '../src/modules/office/application/office-event-service';
import type { AppJobCompletedEvent } from '@synectra/contracts';

function createMockRunner() {
  const calls: Array<{ args: string[]; options?: Record<string, unknown> }> = [];
  let exitCode = 0;
  let stdout = 'tick executed: 1 job processed';
  let stderr = '';
  let delayMs = 0;

  const runner: HermesCronRunner = async (args, options) => {
    calls.push({ args, options });
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    // Hermes mencetak job id saat create berhasil.
    if (args[3] === 'create' && exitCode === 0) {
      return { stdout: `[32mCreated job: job_mock_${calls.length}[0m
  Name: x`, stderr, exitCode };
    }
    return { stdout, stderr, exitCode };
  };

  return {
    runner,
    calls,
    setResult: (code: number, out: string, err = '') => {
      exitCode = code;
      stdout = out;
      stderr = err;
    },
    setDelay: (ms: number) => {
      delayMs = ms;
    }
  };
}

test('time-utils: converts UTC and formats WIB display properly', () => {
  const sampleUtc = '2026-11-08T03:00:00.000Z'; // 10:00 WIB (UTC+7)
  const wibIso = toWibIsoString(sampleUtc);
  assert.equal(wibIso, '2026-11-08T10:00:00+07:00');

  const wibDisplay = toWibDisplay(sampleUtc);
  assert.equal(wibDisplay, '10:00 WIB, 08 Nov 2026');
});

test('time-utils: computeNextRun handles minutes, hours, and daily cron in WIB', () => {
  const baseTime = new Date('2026-11-08T03:00:00.000Z'); // 10:00 WIB

  // Every 15m
  const next15m = computeNextRun('every 15m', baseTime);
  assert.equal(next15m, new Date('2026-11-08T03:15:00.000Z').toISOString());

  // Every 2h
  const next2h = computeNextRun('2h', baseTime);
  assert.equal(next2h, new Date('2026-11-08T05:00:00.000Z').toISOString());

  // Daily 17:00 WIB -> 10:00 UTC on same day (since base is 10:00 WIB / 03:00 UTC)
  const nextDaily = computeNextRun('daily 17:00', baseTime, DEFAULT_TIMEZONE);
  assert.equal(nextDaily, new Date('2026-11-08T10:00:00.000Z').toISOString());

  // Daily 08:00 WIB -> already past 10:00 WIB, so advances to next day 08:00 WIB (01:00 UTC)
  const nextDailyPassed = computeNextRun('daily 08:00', baseTime, DEFAULT_TIMEZONE);
  assert.equal(nextDailyPassed, new Date('2026-11-09T01:00:00.000Z').toISOString());
});

test('time-utils: detects missed run based on latency threshold', () => {
  const baseScheduled = '2026-11-08T03:00:00.000Z';
  // 1 minute later -> not missed (within 2m tolerance)
  const normalNow = '2026-11-08T03:01:00.000Z';
  const normalCheck = detectMissedRun(baseScheduled, normalNow);
  assert.equal(normalCheck.isMissed, false);

  // 10 minutes later -> missed!
  const delayedNow = '2026-11-08T03:10:00.000Z';
  const missedCheck = detectMissedRun(baseScheduled, delayedNow);
  assert.equal(missedCheck.isMissed, true);
  assert.equal(missedCheck.latencyMs, 10 * 60 * 1000);
});

test('calendar-service: creates, pauses, and resumes Hermes cron and app jobs', async () => {
  resetCalendarDataForTests();
  const mockRunner = createMockRunner();
  const testStore = createMemoryCalendarStore();

  const app = buildApp({
    calendarStore: testStore,
    hermesCronRunner: mockRunner.runner
  });

  const ownerId = 'user-owner-1';
  const hermesReq: CreateCalendarScheduleRequest = {
    name: 'Audit Keuangan Harian',
    type: 'hermes_cron',
    actor: 'hermes',
    schedule: 'daily 09:00',
    timezone: 'Asia/Jakarta',
    prompt: 'Analisis mutasi bank dan saldo kas',
    budget: 50000,
    estimatedCost: 1500,
    effects: 'Membaca mutasi dan memposting rekonsiliasi',
    timeoutMs: 30000,
    maxConcurrency: 1,
    missedRunPolicy: 'review'
  };

  const schedule = await createSchedule(ownerId, hermesReq);
  assert.equal(schedule.name, 'Audit Keuangan Harian');
  assert.equal(schedule.status, 'active');
  assert.equal(mockRunner.calls.length, 1);
  assert.deepEqual(mockRunner.calls[0]?.args, [
    '-p',
    'synectra-office',
    'cron',
    'create',
    '--name=Audit Keuangan Harian',
    '--',
    'daily 09:00',
    'Analisis mutasi bank dan saldo kas'
  ]);
  assert.equal(schedule.hermesJobId, 'job_mock_1');

  // Pause
  const paused = await pauseSchedule(ownerId, schedule.id, 'Pemeriksaan sistem bulanan');
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pausedReason, 'Pemeriksaan sistem bulanan');
  assert.ok(mockRunner.calls.some((c) => c.args[3] === 'pause' && c.args.at(-1) === 'job_mock_1'), 'pause must target job id');

  // Resume
  const resumed = await resumeSchedule(ownerId, schedule.id);
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.pausedReason, null);
  assert.ok(mockRunner.calls.some((c) => c.args[3] === 'resume' && c.args.at(-1) === 'job_mock_1'), 'resume must target job id');

  await app.close();
});

test('calendar-store: fenced completion rejects stale worker and commits current worker atomically', async () => {
  const store = createMemoryCalendarStore();
  const ownerId = 'owner-fencing';
  const scheduleId = 'schedule-fencing';
  const runIdentity = 'cycle-1';
  const schedule: CalendarSchedule = {
    id: scheduleId,
    ownerId,
    name: 'Fenced job',
    type: 'app_job' as const,
    actor: 'system' as const,
    schedule: 'every 1h',
    timezone: DEFAULT_TIMEZONE,
    prompt: undefined,
    script: 'noop',
    budget: 0,
    estimatedCost: 0,
    effects: 'Test fencing',
    timeoutMs: 1000,
    maxConcurrency: 1,
    missedRunPolicy: 'skip' as const,
    status: 'active' as const,
    pausedReason: null,
    lastRunAt: null,
    nextRunAt: '2026-11-08T04:00:00.000Z',
    createdAt: '2026-11-08T03:00:00.000Z',
    updatedAt: '2026-11-08T03:00:00.000Z'
  };
  await store.saveSchedule(ownerId, schedule);
  const firstClaim = await store.claimRun(ownerId, scheduleId, runIdentity, new Date(Date.now() - 1));
  assert.equal(firstClaim.claimed, true);
  const secondClaim = await store.claimRun(ownerId, scheduleId, runIdentity, new Date(Date.now() + 1000));
  assert.equal(secondClaim.claimed, true);

  const run = {
    id: 'run-fencing',
    ownerId,
    scheduleId,
    scheduleName: schedule.name,
    type: schedule.type,
    actor: schedule.actor,
    runIdentity,
    startedAt: '2026-11-08T04:00:00.000Z',
    completedAt: '2026-11-08T04:00:01.000Z',
    status: 'success' as const,
    durationMs: 1000,
    summary: 'done',
    errorReason: null,
    isChanged: true,
    fencingToken: firstClaim.fencingToken
  };
  await assert.rejects(() => store.completeRun(ownerId, run, schedule), /fencing/i);
  assert.equal(await store.getRun(ownerId, run.id), null);

  run.fencingToken = secondClaim.fencingToken;
  schedule.lastRunAt = run.completedAt;
  schedule.nextRunAt = '2026-11-08T05:00:00.000Z';
  await store.completeRun(ownerId, run, schedule);
  assert.equal((await store.getRun(ownerId, run.id))?.status, 'success');
  assert.equal((await store.getSchedule(ownerId, scheduleId))?.nextRunAt, schedule.nextRunAt);
});

test('calendar-service: run execution prevents duplicates via run identity and fencing', async () => {
  resetCalendarDataForTests();
  const mockRunner = createMockRunner();
  const testStore = createMemoryCalendarStore();

  buildApp({
    calendarStore: testStore,
    hermesCronRunner: mockRunner.runner
  });

  const ownerId = 'user-owner-2';
  const schedule = await createSchedule(ownerId, {
    name: 'Backup Database App',
    type: 'app_job',
    actor: 'system',
    schedule: 'every 30m',
    timezone: 'Asia/Jakarta',
    effects: 'Export dump database ke storage',
    timeoutMs: 15000,
    maxConcurrency: 1,
    missedRunPolicy: 'skip'
  });

  const originalNextRun = schedule.nextRunAt;

  // First execution
  const run1 = await executeScheduleRun(ownerId, schedule.id);
  assert.equal(run1.status, 'success');
  assert.ok(run1.fencingToken);

  // Restore nextRunAt to simulate scheduler restart triggering the same cycle
  const currentSchedule = await testStore.getSchedule(ownerId, schedule.id);
  assert.ok(currentSchedule);
  currentSchedule.nextRunAt = originalNextRun;
  await testStore.saveSchedule(ownerId, currentSchedule);

  // Duplicate execution attempt for same cycle without force should fail
  await assert.rejects(
    async () => {
      await executeScheduleRun(ownerId, schedule.id);
    },
    /already claimed or executed/
  );
});

test('calendar-service: missed-run policies (review, skip, catch_up)', async () => {
  resetCalendarDataForTests();
  const mockRunner = createMockRunner();
  const testStore = createMemoryCalendarStore();

  buildApp({
    calendarStore: testStore,
    hermesCronRunner: mockRunner.runner
  });

  const ownerId = 'user-owner-3';
  const pastTime = new Date('2026-11-08T01:00:00.000Z').toISOString();

  // 1. Schedule with policy 'review'
  const schedReview = await createSchedule(ownerId, {
    name: 'Sync Transaksi Bank',
    type: 'hermes_cron',
    actor: 'hermes',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    prompt: 'Ambil mutasi terbaru',
    effects: 'Kirim notifikasi ringkasan saldo',
    missedRunPolicy: 'review'
  });
  // Manually backdate nextRunAt to 3 hours ago
  schedReview.nextRunAt = pastTime;
  await testStore.saveSchedule(ownerId, schedReview);

  // 2. Schedule with policy 'skip'
  const schedSkip = await createSchedule(ownerId, {
    name: 'Bersihkan Cache Log',
    type: 'app_job',
    actor: 'system',
    schedule: 'every 2h',
    timezone: 'Asia/Jakarta',
    effects: 'Hapus file log sementara',
    missedRunPolicy: 'skip'
  });
  schedSkip.nextRunAt = pastTime;
  await testStore.saveSchedule(ownerId, schedSkip);

  // 3. Schedule with policy 'catch_up'
  const schedCatchUp = await createSchedule(ownerId, {
    name: 'Hitung Tagihan Pro-rata',
    type: 'app_job',
    actor: 'admin',
    schedule: 'daily 00:00',
    timezone: 'Asia/Jakarta',
    effects: 'Hitung akumulasi biaya hari sebelumnya',
    missedRunPolicy: 'catch_up'
  });
  schedCatchUp.nextRunAt = pastTime;
  await testStore.saveSchedule(ownerId, schedCatchUp);

  // Process missed runs when host returns online at 04:00 UTC
  const now = new Date('2026-11-08T04:00:00.000Z');
  const summary = await processMissedRuns(ownerId, now);

  assert.equal(summary.processed, 3);
  assert.equal(summary.reviewed, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.caughtUp, 1);

  // SchedReview should now be in status 'review'
  const updatedReview = await testStore.getSchedule(ownerId, schedReview.id);
  assert.equal(updatedReview?.status, 'review');

  // Resolve review: owner chooses 'run'
  const resolvedRun = await resolveMissedRun(ownerId, schedReview.id, 'run');
  assert.equal(resolvedRun.status, 'active');

  // SchedSkip should be updated with new nextRunAt
  const updatedSkip = await testStore.getSchedule(ownerId, schedSkip.id);
  assert.equal(updatedSkip?.status, 'active');
  assert.notEqual(updatedSkip?.nextRunAt, pastTime);
});

test('HTTP Calendar API endpoints: auth, overview, create, pause, run, and resolve', async () => {
  resetSessionsForTests();
  resetCalendarDataForTests();
  const mockRunner = createMockRunner();
  const testStore = createMemoryCalendarStore();

  const app = buildApp({
    calendarStore: testStore,
    hermesCronRunner: mockRunner.runner
  });

  const userId = 'user-api-test';
  const { token, session } = createSessionForTests(userId);
  const cookie = `synectra_session=${token}`;
  const csrf = session.csrfToken;

  // 1. Unauthenticated test
  const unauthRes = await app.inject({ method: 'GET', url: '/api/calendar' });
  assert.equal(unauthRes.statusCode, 401);

  // 2. Authenticated GET /api/calendar
  const getRes = await app.inject({
    method: 'GET',
    url: '/api/calendar',
    headers: { cookie }
  });
  assert.equal(getRes.statusCode, 200);
  const overview = getRes.json();
  assert.equal(overview.timezone, 'Asia/Jakarta');
  assert.ok(Array.isArray(overview.schedules));

  const missedRunsRes = await app.inject({
    method: 'POST',
    url: '/api/calendar/missed-runs/check',
    headers: { cookie, 'x-csrf-token': csrf }
  });
  assert.equal(missedRunsRes.statusCode, 200);
  assert.equal(typeof missedRunsRes.json().processed, 'number');

  // 3. POST /api/calendar/schedules
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/calendar/schedules',
    headers: { cookie, 'x-csrf-token': csrf },
    body: {
      name: 'Laporan Penjualan Mingguan',
      type: 'hermes_cron',
      actor: 'communication',
      schedule: 'every 7d',
      timezone: 'Asia/Jakarta',
      prompt: 'Kompilasi ringkasan omset mingguan',
      effects: 'Kirim rekap PDF ke channel manajemen',
      missedRunPolicy: 'review'
    }
  });
  assert.equal(createRes.statusCode, 201);
  const createdSched = createRes.json().schedule;
  assert.equal(createdSched.name, 'Laporan Penjualan Mingguan');

  // 4. POST /api/calendar/schedules/:id/pause
  const pauseRes = await app.inject({
    method: 'POST',
    url: `/api/calendar/schedules/${createdSched.id}/pause`,
    headers: { cookie, 'x-csrf-token': csrf },
    body: { reason: 'Sedang libur cuti bersama' }
  });
  assert.equal(pauseRes.statusCode, 200);
  assert.equal(pauseRes.json().schedule.status, 'paused');

  // 5. POST /api/calendar/schedules/:id/resume
  const resumeRes = await app.inject({
    method: 'POST',
    url: `/api/calendar/schedules/${createdSched.id}/resume`,
    headers: { cookie, 'x-csrf-token': csrf }
  });
  assert.equal(resumeRes.statusCode, 200);
  assert.equal(resumeRes.json().schedule.status, 'active');

  // 6. POST /api/calendar/schedules/:id/run (on-demand execute)
  const runRes = await app.inject({
    method: 'POST',
    url: `/api/calendar/schedules/${createdSched.id}/run`,
    headers: { cookie, 'x-csrf-token': csrf }
  });
  assert.equal(runRes.statusCode, 200);
  assert.equal(runRes.json().run.status, 'success');

  await app.close();
});

test('calendar-service: atomic completion prevents stale worker overwrite (fencing token)', async () => {
  resetCalendarDataForTests();
  const testStore = createMemoryCalendarStore();
  setCalendarStore(testStore);

  const ownerId = 'user-fencing-test';
  const schedule = await createSchedule(ownerId, {
    name: 'Fencing Test Schedule',
    type: 'app_job',
    actor: 'system',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    script: 'noop',
    effects: 'Pengujian fencing token'
  });

  const runIdentity = generateRunIdentity(schedule.id, schedule.nextRunAt, 1);
  const lockExpires = new Date(Date.now() + 60000);
  const claim = await testStore.claimRun(ownerId, schedule.id, runIdentity, lockExpires);

  assert.equal(claim.claimed, true);
  assert.ok(claim.fencingToken);

  const runRecord = {
    id: 'run-1',
    ownerId,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    type: schedule.type,
    actor: schedule.actor,
    runIdentity,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'success' as const,
    durationMs: 120,
    summary: 'Selesai',
    errorReason: null,
    isChanged: true,
    fencingToken: claim.fencingToken
  };

  // Valid completion succeeds
  await testStore.completeRun(ownerId, runRecord, schedule);

  // Stale completion with outdated fencing token fails
  const staleRunRecord = {
    ...runRecord,
    id: 'run-stale',
    fencingToken: 'outdated-stale-token'
  };

  await assert.rejects(
    async () => {
      await testStore.completeRun(ownerId, staleRunRecord, schedule);
    },
    /Fencing token mismatch/i
  );
});

test('calendar-scheduler: runOnce processes due schedules and respects owner isolation', async () => {
  resetCalendarDataForTests();
  const testStore = createMemoryCalendarStore();
  setCalendarStore(testStore);

  const ownerA = 'user-owner-alpha';
  const ownerB = 'user-owner-beta';

  const now = new Date('2026-11-08T05:00:00.000Z');
  const pastTime = new Date('2026-11-08T04:59:30.000Z').toISOString();
  const futureTime = new Date('2026-11-08T06:00:00.000Z').toISOString();

  // Owner A: one due schedule, one future schedule
  const schedDueA = await createSchedule(ownerA, {
    name: 'Jadwal Due A',
    type: 'app_job',
    actor: 'admin',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    script: 'noop',
    effects: 'Efek A'
  });
  schedDueA.nextRunAt = pastTime;
  await testStore.saveSchedule(ownerA, schedDueA);

  const schedFutureA = await createSchedule(ownerA, {
    name: 'Jadwal Future A',
    type: 'app_job',
    actor: 'admin',
    schedule: 'every 2h',
    timezone: 'Asia/Jakarta',
    script: 'noop',
    effects: 'Efek Future A'
  });
  schedFutureA.nextRunAt = futureTime;
  await testStore.saveSchedule(ownerA, schedFutureA);

  // Owner B: one due schedule
  const schedDueB = await createSchedule(ownerB, {
    name: 'Jadwal Due B',
    type: 'app_job',
    actor: 'system',
    schedule: 'every 30m',
    timezone: 'Asia/Jakarta',
    script: 'office_status',
    effects: 'Efek B'
  });
  schedDueB.nextRunAt = pastTime;
  await testStore.saveSchedule(ownerB, schedDueB);

  const scheduler = createCalendarScheduler(60000);
  await scheduler.runOnce(now);

  // Verify Owner A due schedule ran, future did not
  const runsA = await testStore.listRuns(ownerA, schedDueA.id);
  assert.equal(runsA.length, 1);
  assert.equal(runsA[0].status, 'success');

  const runsFutureA = await testStore.listRuns(ownerA, schedFutureA.id);
  assert.equal(runsFutureA.length, 0);

  // Verify Owner B schedule ran under Owner B only
  const runsB = await testStore.listRuns(ownerB, schedDueB.id);
  assert.equal(runsB.length, 1);
  assert.equal(runsB[0].status, 'success');

  // Verify no crossover between owners
  const crossRuns = await testStore.listRuns(ownerA, schedDueB.id);
  assert.equal(crossRuns.length, 0);
});

test('calendar-service: app_job executor allowlist and app_job_completed event emission', async () => {
  resetCalendarDataForTests();
  resetOfficeEventsForTests();
  const testStore = createMemoryCalendarStore();
  setCalendarStore(testStore);

  const ownerId = 'user-app-job-events';
  const emittedEvents: AppJobCompletedEvent[] = [];

  const unsubscribe = subscribeOffice(ownerId, (evt) => {
    if ('type' in evt && evt.type === 'app_job_completed') {
      emittedEvents.push(evt);
    }
  });

  // 1. Success execution with allowlisted script 'noop'
  const schedSuccess = await createSchedule(ownerId, {
    name: 'App Job Noop',
    type: 'app_job',
    actor: 'system',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    script: 'noop',
    effects: 'Operasi noop aman'
  });

  const successRun = await executeScheduleRun(ownerId, schedSuccess.id);
  assert.equal(successRun.status, 'success');

  // 2. Failure execution with disallowed/unsupported script
  const schedFail = await createSchedule(ownerId, {
    name: 'App Job Shell Attempt',
    type: 'app_job',
    actor: 'admin',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    script: 'bash -c rm -rf /',
    effects: 'Script terlarang'
  });

  const failRun = await executeScheduleRun(ownerId, schedFail.id);
  assert.equal(failRun.status, 'failed');
  assert.ok(failRun.errorReason?.includes('Unsupported app_job script'));

  // Wait tick for async queue in office-event-service
  await new Promise((r) => setTimeout(r, 50));
  unsubscribe();

  assert.equal(emittedEvents.length, 2);
  assert.equal(emittedEvents[0].scheduleId, schedSuccess.id);
  assert.equal(emittedEvents[0].status, 'success');
  assert.equal(emittedEvents[0].statusSnapshot.workState, 'working');

  assert.equal(emittedEvents[1].scheduleId, schedFail.id);
  assert.equal(emittedEvents[1].status, 'failed');
  assert.equal(emittedEvents[1].statusSnapshot.workState, 'away');
});

test('calendar-scheduler: lifecycle stops on Fastify app close', async () => {
  resetCalendarDataForTests();
  const testStore = createMemoryCalendarStore();
  const scheduler = createCalendarScheduler(60000);

  const app = buildApp({
    calendarStore: testStore,
    calendarScheduler: scheduler
  });

  scheduler.start();
  await app.close();
  // Double stop should be safe
  scheduler.stop();
});

test('calendar-service: Hermes CLI failures are surfaced, not silently saved', async () => {
  resetCalendarDataForTests();
  const mockRunner = createMockRunner();
  const testStore = createMemoryCalendarStore();
  buildApp({ calendarStore: testStore, hermesCronRunner: mockRunner.runner });
  const ownerId = 'user-cron-failure';
  const req: CreateCalendarScheduleRequest = {
    name: 'Job Gagal',
    type: 'hermes_cron',
    actor: 'hermes',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    prompt: 'cek',
    effects: 'tidak ada'
  };

  mockRunner.setResult(1, '', 'Failed to create job: invalid schedule');
  await assert.rejects(createSchedule(ownerId, req), /Hermes cron create gagal/);
  assert.equal((await testStore.listSchedules(ownerId)).length, 0, 'failed create must not persist schedule');

  mockRunner.setResult(0, 'ok');
  const schedule = await createSchedule(ownerId, req);
  mockRunner.setResult(1, '', 'Job not found');
  await assert.rejects(pauseSchedule(ownerId, schedule.id), /Hermes cron pause gagal/);
  assert.equal((await testStore.getSchedule(ownerId, schedule.id))?.status, 'active');
});

test('calendar-service: hermes_cron run reports only this job history, not shared tick output', async () => {
  resetCalendarDataForTests();
  const testStore = createMemoryCalendarStore();
  const calls: string[][] = [];
  const runner: HermesCronRunner = async (args) => {
    calls.push(args);
    if (args[3] === 'create') return { stdout: 'Created job: job_own', stderr: '', exitCode: 0 };
    if (args[3] === 'tick') return { stdout: 'ran job_other_owner: rahasia owner lain', stderr: '', exitCode: 0 };
    if (args[3] === 'runs') return { stdout: 'job_own completed ok', stderr: '', exitCode: 0 };
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  buildApp({ calendarStore: testStore, hermesCronRunner: runner });
  const ownerId = 'user-cron-run';
  const schedule = await createSchedule(ownerId, {
    name: 'Laporan',
    type: 'hermes_cron',
    actor: 'hermes',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    prompt: 'ringkas',
    effects: 'laporan'
  });

  const run = await executeScheduleRun(ownerId, schedule.id);
  assert.equal(run.status, 'success');
  assert.match(run.summary, /job_own completed ok/);
  assert.doesNotMatch(run.summary, /owner lain/);
  assert.deepEqual(calls.at(-1)?.slice(3), ['runs', '--limit=1', '--', 'job_own']);
});

test('calendar-service: tick yielded to running gateway is not a failed run', async () => {
  resetCalendarDataForTests();
  const testStore = createMemoryCalendarStore();
  const runner: HermesCronRunner = async (args) => {
    if (args[3] === 'create') return { stdout: 'Created job: job_gw', stderr: '', exitCode: 0 };
    if (args[3] === 'tick') {
      return { stdout: 'A fresher gateway process owns the runtime lock and will fire due jobs; this stale process yielded its tick.', stderr: '', exitCode: 1 };
    }
    return { stdout: 'job_gw scheduled', stderr: '', exitCode: 0 };
  };
  buildApp({ calendarStore: testStore, hermesCronRunner: runner });
  const ownerId = 'user-cron-gateway';
  const schedule = await createSchedule(ownerId, {
    name: 'Gateway',
    type: 'hermes_cron',
    actor: 'hermes',
    schedule: 'every 1h',
    timezone: 'Asia/Jakarta',
    effects: 'x'
  });
  const run = await executeScheduleRun(ownerId, schedule.id);
  assert.equal(run.status, 'success');
});

test('calendar: delete removes the Hermes job by id; legacy schedules without job id are rejected', async () => {
  resetCalendarDataForTests();
  const store = createMemoryCalendarStore();
  setCalendarStore(store);
  const calls: string[][] = [];
  let removeResult = { stdout: '', stderr: '', exitCode: 0 };
  setHermesCronRunner(async (args) => {
    calls.push(args);
    if (args[3] === 'create') return { stdout: 'Created job: job_del', stderr: '', exitCode: 0 };
    if (args[3] === 'remove') return removeResult;
    return { stdout: '', stderr: '', exitCode: 0 };
  });
  const ownerId = 'owner-delete';
  const req = createCalendarScheduleRequestSchema.parse({
    name: 'Job Hapus',
    type: 'hermes_cron',
    schedule: '0 9 * * *',
    timezone: 'Asia/Jakarta',
    prompt: 'cek',
    effects: 'uji hapus'
  });

  const schedule = await createSchedule(ownerId, req);
  await deleteSchedule(ownerId, schedule.id);
  assert.deepEqual(calls.at(-1), ['-p', 'synectra-office', 'cron', 'remove', '--', 'job_del']);
  assert.equal(await store.getSchedule(ownerId, schedule.id), null);
  await assert.rejects(deleteSchedule(ownerId, schedule.id), /Schedule not found/);

  // Job sudah hilang di Hermes: hapus lokal tetap jalan. Error lain: ditolak dan jadwal tetap ada.
  const gone = await createSchedule(ownerId, req);
  removeResult = { stdout: '', stderr: 'Job not found: job_del', exitCode: 1 };
  await deleteSchedule(ownerId, gone.id);
  assert.equal(await store.getSchedule(ownerId, gone.id), null);

  const failing = await createSchedule(ownerId, req);
  removeResult = { stdout: '', stderr: 'database locked', exitCode: 1 };
  await assert.rejects(deleteSchedule(ownerId, failing.id), /Hermes cron remove gagal/);
  assert.ok(await store.getSchedule(ownerId, failing.id));

  // Jadwal lama tanpa hermesJobId tidak lagi dicari berdasarkan nama.
  const legacy = { ...failing, id: 'legacy-1', hermesJobId: undefined };
  await store.saveSchedule(ownerId, legacy);
  const before = calls.length;
  await assert.rejects(pauseSchedule(ownerId, 'legacy-1'), /tidak punya hermesJobId/);
  assert.equal(calls.length, before);
  resetCalendarDataForTests();
});
