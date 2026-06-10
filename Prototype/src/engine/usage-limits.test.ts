import { expect, test } from "bun:test";
import {
  parseResetMs,
  parseUtilization,
  planNameFor,
  toAccountLimits,
} from "./usage-limits";

test("parseUtilization clamps 0-100 and rejects non-finite", () => {
  expect(parseUtilization(42)).toBe(42);
  expect(parseUtilization(120)).toBe(100);
  expect(parseUtilization(-5)).toBe(0);
  expect(parseUtilization(Number.NaN)).toBeNull();
  expect(parseUtilization(Number.POSITIVE_INFINITY)).toBeNull();
  expect(parseUtilization(undefined)).toBeNull();
});

test("parseResetMs parses ISO to epoch ms, null on invalid", () => {
  expect(parseResetMs("2026-06-05T12:00:00.000Z")).toBe(
    Date.parse("2026-06-05T12:00:00.000Z"),
  );
  expect(parseResetMs("not-a-date")).toBeNull();
  expect(parseResetMs(undefined)).toBeNull();
});

test("planNameFor maps known tiers and capitalizes unknown, null for api/empty", () => {
  expect(planNameFor("claude_max")).toBe("Max");
  expect(planNameFor("pro")).toBe("Pro");
  expect(planNameFor("team")).toBe("Team");
  expect(planNameFor("api")).toBeNull();
  expect(planNameFor("")).toBeNull();
  expect(planNameFor("enterprise")).toBe("Enterprise");
});

test("toAccountLimits maps the API payload shape", () => {
  const limits = toAccountLimits(
    {
      five_hour: { utilization: 30, resets_at: "2026-06-05T12:00:00.000Z" },
      seven_day: { utilization: 80, resets_at: "2026-06-12T00:00:00.000Z" },
    },
    "Max",
  );
  expect(limits.planName).toBe("Max");
  expect(limits.fiveHour.utilization).toBe(30);
  expect(limits.sevenDay.utilization).toBe(80);
  expect(limits.fiveHour.resetsAt).toBe(Date.parse("2026-06-05T12:00:00.000Z"));
});
