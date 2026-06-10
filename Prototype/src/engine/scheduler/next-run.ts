import type {
  SchedulerRecurrence,
  SchedulerTaskStatus,
} from "../../shared/scheduler";

export interface ComputeNextRunAtInput {
  now: number;
  status: SchedulerTaskStatus;
  schedule?: SchedulerRecurrence;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function computeNextRunAt({
  now,
  status,
  schedule,
}: ComputeNextRunAtInput): number | null {
  if (status !== "enabled" || !schedule) return null;
  switch (schedule.kind) {
    case "once":
      return schedule.runAt > now ? schedule.runAt : null;
    case "daily":
      return nextDailyRun(now, schedule);
    case "weekly":
      return nextWeeklyRun(now, schedule);
    case "monthly":
      return nextMonthlyRun(now, schedule);
  }
}

function nextDailyRun(
  now: number,
  schedule: Extract<SchedulerRecurrence, { kind: "daily" }>,
): number | null {
  const today = zonedParts(now, schedule.timezone);
  const candidate = zonedDateToUtc(
    schedule.timezone,
    today.year,
    today.month,
    today.day,
    schedule.hour,
    schedule.minute,
  );
  if (candidate > now) return candidate;
  const next = addLocalDays(today, 1);
  return zonedDateToUtc(
    schedule.timezone,
    next.year,
    next.month,
    next.day,
    schedule.hour,
    schedule.minute,
  );
}

function nextWeeklyRun(
  now: number,
  schedule: Extract<SchedulerRecurrence, { kind: "weekly" }>,
): number | null {
  const days = [...new Set(schedule.daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const current = zonedParts(now, schedule.timezone);
  for (let offset = 0; offset <= 7; offset++) {
    const date = addLocalDays(current, offset);
    if (!days.includes(date.weekday)) continue;
    const candidate = zonedDateToUtc(
      schedule.timezone,
      date.year,
      date.month,
      date.day,
      schedule.hour,
      schedule.minute,
    );
    if (candidate > now) return candidate;
  }
  return null;
}

function nextMonthlyRun(
  now: number,
  schedule: Extract<SchedulerRecurrence, { kind: "monthly" }>,
): number | null {
  const current = zonedParts(now, schedule.timezone);
  for (let offset = 0; offset <= 12; offset++) {
    const monthIndex = current.month - 1 + offset;
    const year = current.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const day = Math.min(
      Math.max(1, schedule.dayOfMonth),
      daysInMonth(year, month),
    );
    const candidate = zonedDateToUtc(
      schedule.timezone,
      year,
      month,
      day,
      schedule.hour,
      schedule.minute,
    );
    if (candidate > now) return candidate;
  }
  return null;
}

function zonedParts(ts: number, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ts));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: weekdayNumber(value("weekday")),
  };
}

function zonedDateToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = targetAsUtc;
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(candidate, timezone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    candidate -= localAsUtc - targetAsUtc;
  }
  return candidate;
}

function addLocalDays(parts: ZonedParts, days: number): ZonedParts {
  const ts = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  return {
    ...partsFromUtcDate(new Date(ts)),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function partsFromUtcDate(date: Date): ZonedParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    weekday: date.getUTCDay(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayNumber(value: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}
