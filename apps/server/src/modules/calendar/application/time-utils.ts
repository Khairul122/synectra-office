export const DEFAULT_TIMEZONE = 'Asia/Jakarta';
export const WIB_OFFSET_HOURS = 7;
export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

export function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error(`Unsupported timezone: ${timezone}`);
  }
}

export function validateScheduleRule(schedule: string): void {
  const trimmed = schedule.trim().toLowerCase();
  if (/^(?:every\s+)?[1-9]\d*\s*(?:m|min|minutes?|h|hrs?|hours?|d|days?)$/.test(trimmed)) return;
  const daily = trimmed.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (daily && Number(daily[1]) <= 23 && Number(daily[2]) <= 59) return;
  const cron = trimmed.split(/\s+/);
  if (cron.length === 5 && cron[2] === '*' && cron[3] === '*' && cron[4] === '*' &&
      /^\d{1,2}$/.test(cron[0] ?? '') && /^\d{1,2}$/.test(cron[1] ?? '') &&
      Number(cron[0]) <= 59 && Number(cron[1]) <= 23) return;
  const exact = new Date(schedule);
  if (!Number.isNaN(exact.getTime())) return;
  throw new Error(`Unsupported schedule rule: ${schedule}`);
}

export function toUtcDate(input: Date | string | number): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date input: ${String(input)}`);
  }
  return date;
}

export function toWibDate(input: Date | string | number): Date {
  const utc = toUtcDate(input);
  return new Date(utc.getTime() + WIB_OFFSET_MS);
}

export function toWibIsoString(input: Date | string | number): string {
  const date = toUtcDate(input);
  const wibTime = new Date(date.getTime() + WIB_OFFSET_MS);
  const yyyy = wibTime.getUTCFullYear();
  const mm = String(wibTime.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(wibTime.getUTCDate()).padStart(2, '0');
  const hh = String(wibTime.getUTCHours()).padStart(2, '0');
  const min = String(wibTime.getUTCMinutes()).padStart(2, '0');
  const ss = String(wibTime.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+07:00`;
}

export function toWibDisplay(input: Date | string | number): string {
  const date = toUtcDate(input);
  const wibTime = new Date(date.getTime() + WIB_OFFSET_MS);
  const hh = String(wibTime.getUTCHours()).padStart(2, '0');
  const min = String(wibTime.getUTCMinutes()).padStart(2, '0');
  const dd = String(wibTime.getUTCDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const month = months[wibTime.getUTCMonth()] ?? 'Bln';
  const yyyy = wibTime.getUTCFullYear();
  return `${hh}:${min} WIB, ${dd} ${month} ${yyyy}`;
}

export function computeNextRun(
  schedule: string,
  fromDate: Date | string = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string {
  const baseDate = toUtcDate(fromDate);
  const trimmed = schedule.trim().toLowerCase();

  // Pattern: every Xm / Xm
  const minuteMatch = trimmed.match(/^(?:every\s+)?(\d+)\s*(?:m|min|minutes?)$/);
  if (minuteMatch && minuteMatch[1]) {
    const mins = parseInt(minuteMatch[1], 10);
    return new Date(baseDate.getTime() + mins * 60 * 1000).toISOString();
  }

  // Pattern: every Xh / Xh
  const hourMatch = trimmed.match(/^(?:every\s+)?(\d+)\s*(?:h|hrs?|hours?)$/);
  if (hourMatch && hourMatch[1]) {
    const hours = parseInt(hourMatch[1], 10);
    return new Date(baseDate.getTime() + hours * 60 * 60 * 1000).toISOString();
  }

  const dayMatch = trimmed.match(/^(?:every\s+)?(\d+)\s*(?:d|days?)$/);
  if (dayMatch && dayMatch[1]) {
    const days = parseInt(dayMatch[1], 10);
    return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  // Pattern: daily HH:mm
  const dailyMatch = trimmed.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  let targetHour: number | null = null;
  let targetMinute: number | null = null;

  if (dailyMatch && dailyMatch[1] && dailyMatch[2]) {
    targetHour = parseInt(dailyMatch[1], 10);
    targetMinute = parseInt(dailyMatch[2], 10);
  } else {
    // Pattern: standard cron 5 parts: "M H * * *"
    const cronParts = schedule.trim().split(/\s+/);
    if (cronParts.length === 5 && cronParts[2] === '*' && cronParts[3] === '*' && cronParts[4] === '*') {
      const partMin = cronParts[0];
      const partHour = cronParts[1];
      if (partMin !== undefined && partHour !== undefined && /^\d+$/.test(partMin) && /^\d+$/.test(partHour)) {
        targetMinute = parseInt(partMin, 10);
        targetHour = parseInt(partHour, 10);
      }
    }
  }

  if (targetHour !== null && targetMinute !== null) {
    // Interpret target hour & minute in WIB (UTC+7)
    const offsetHours = timezone === DEFAULT_TIMEZONE ? WIB_OFFSET_HOURS : 0;
    let utcHour = targetHour - offsetHours;
    let dayShift = 0;
    while (utcHour < 0) {
      utcHour += 24;
      dayShift -= 1;
    }
    while (utcHour >= 24) {
      utcHour -= 24;
      dayShift += 1;
    }

    const candidate = new Date(baseDate.getTime());
    candidate.setUTCHours(utcHour, targetMinute, 0, 0);

    // Apply any dayShift from timezone wrap
    if (dayShift !== 0) {
      candidate.setUTCDate(candidate.getUTCDate() + dayShift);
    }

    // If candidate is already in the past or now, advance by 1 day
    if (candidate.getTime() <= baseDate.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return candidate.toISOString();
  }

  const parsedDate = new Date(schedule);
  if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > baseDate.getTime()) {
    return parsedDate.toISOString();
  }
  throw new Error(`Unsupported schedule rule: ${schedule}`);
}

export function detectMissedRun(
  nextRunAt: string,
  now: Date | string = new Date(),
  toleranceMs: number = 2 * 60 * 1000
): { isMissed: boolean; latencyMs: number } {
  const scheduledTime = toUtcDate(nextRunAt).getTime();
  const currentTime = toUtcDate(now).getTime();
  const latencyMs = currentTime - scheduledTime;
  const isMissed = latencyMs > toleranceMs;
  return { isMissed, latencyMs: Math.max(0, latencyMs) };
}

export function generateRunIdentity(scheduleId: string, scheduledAt: string, attempt: number = 1): string {
  const timestamp = toUtcDate(scheduledAt).getTime();
  return `run_${scheduleId}_${timestamp}_a${attempt}`;
}
