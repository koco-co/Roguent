import { expect, test } from "bun:test";
import { barRemaining, formatCountdown } from "./limits-format";

test("barRemaining = 100 - utilization, clamped; null → null", () => {
  expect(barRemaining(30)).toBe(70);
  expect(barRemaining(0)).toBe(100);
  expect(barRemaining(150)).toBe(0);
  expect(barRemaining(null)).toBeNull();
});

test("formatCountdown renders h/m to reset; past/null → '—'", () => {
  const now = 1_000_000;
  expect(formatCountdown(now + 90 * 60_000, now)).toBe("1h30m");
  expect(formatCountdown(now + 5 * 60_000, now)).toBe("5m");
  expect(formatCountdown(now - 1000, now)).toBe("—");
  expect(formatCountdown(null, now)).toBe("—");
});
