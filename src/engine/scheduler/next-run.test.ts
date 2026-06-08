import { expect, test } from "bun:test";
import { computeNextRunAt } from "./next-run";

const utc = (iso: string) => Date.parse(iso);

test("once recurrence returns future run and drops past or disabled tasks", () => {
  const now = utc("2026-01-02T10:00:00.000Z");
  expect(
    computeNextRunAt({
      now,
      status: "enabled",
      schedule: { kind: "once", runAt: utc("2026-01-02T10:05:00.000Z") },
    }),
  ).toBe(utc("2026-01-02T10:05:00.000Z"));
  expect(
    computeNextRunAt({
      now,
      status: "enabled",
      schedule: { kind: "once", runAt: now },
    }),
  ).toBeNull();
  expect(
    computeNextRunAt({
      now,
      status: "disabled",
      schedule: { kind: "once", runAt: utc("2026-01-02T10:05:00.000Z") },
    }),
  ).toBeNull();
});

test("daily recurrence chooses same local day when still ahead, otherwise next day", () => {
  expect(
    computeNextRunAt({
      now: utc("2026-01-02T08:00:00.000Z"),
      status: "enabled",
      schedule: { kind: "daily", hour: 9, minute: 30, timezone: "UTC" },
    }),
  ).toBe(utc("2026-01-02T09:30:00.000Z"));
  expect(
    computeNextRunAt({
      now: utc("2026-01-02T10:00:00.000Z"),
      status: "enabled",
      schedule: { kind: "daily", hour: 9, minute: 30, timezone: "UTC" },
    }),
  ).toBe(utc("2026-01-03T09:30:00.000Z"));
});

test("daily recurrence honors non-UTC timezone local wall time", () => {
  expect(
    computeNextRunAt({
      now: utc("2026-01-01T00:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "daily",
        hour: 9,
        minute: 0,
        timezone: "Asia/Shanghai",
      },
    }),
  ).toBe(utc("2026-01-01T01:00:00.000Z"));
});

test("weekly recurrence scans configured weekdays in local time", () => {
  expect(
    computeNextRunAt({
      now: utc("2026-01-05T08:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "weekly",
        daysOfWeek: [1, 3],
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-01-05T09:00:00.000Z"));
  expect(
    computeNextRunAt({
      now: utc("2026-01-05T10:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "weekly",
        daysOfWeek: [1, 3],
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-01-07T09:00:00.000Z"));
  expect(
    computeNextRunAt({
      now: utc("2026-01-08T10:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "weekly",
        daysOfWeek: [1, 3],
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-01-12T09:00:00.000Z"));
});

test("monthly recurrence chooses next month and clamps long month days", () => {
  expect(
    computeNextRunAt({
      now: utc("2026-01-10T10:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "monthly",
        dayOfMonth: 15,
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-01-15T09:00:00.000Z"));
  expect(
    computeNextRunAt({
      now: utc("2026-01-16T10:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "monthly",
        dayOfMonth: 15,
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-02-15T09:00:00.000Z"));
  expect(
    computeNextRunAt({
      now: utc("2026-01-31T10:00:00.000Z"),
      status: "enabled",
      schedule: {
        kind: "monthly",
        dayOfMonth: 31,
        hour: 9,
        minute: 0,
        timezone: "UTC",
      },
    }),
  ).toBe(utc("2026-02-28T09:00:00.000Z"));
});
