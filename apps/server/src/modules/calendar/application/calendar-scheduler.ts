import { processMissedRuns, executeScheduleRun, getCalendarStore } from './calendar-service';

export type CalendarScheduler = {
  runOnce(now?: Date): Promise<void>;
  start(): void;
  stop(): void;
};

export function createCalendarScheduler(intervalMs = 30_000): CalendarScheduler {
  let timer: ReturnType<typeof setInterval> | undefined;
  let cycle: Promise<void> | undefined;

  async function runOnce(now = new Date()): Promise<void> {
    if (cycle) return cycle;
    cycle = (async () => {
      const store = getCalendarStore();
      for (const ownerId of await store.listOwnerIds()) {
        await processMissedRuns(ownerId, now);
        const schedules = await store.listSchedules(ownerId, { status: 'active' });
        for (const schedule of schedules) {
          if (new Date(schedule.nextRunAt).getTime() > now.getTime()) continue;
          try {
            await executeScheduleRun(ownerId, schedule.id, { now });
          } catch {
            // Claim, pause, concurrency, and execution errors stay in run/history state.
          }
        }
      }
    })().finally(() => {
      cycle = undefined;
    });
    return cycle;
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => void runOnce(), intervalMs);
      void runOnce();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  };
}
