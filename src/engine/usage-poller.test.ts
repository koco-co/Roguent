import { expect, test } from "bun:test";
import type { AccountLimits } from "../shared/events";
import { UsagePoller } from "./usage-poller";

const RAW = {
  five_hour: { utilization: 30, resets_at: "2026-06-05T12:00:00.000Z" },
  seven_day: { utilization: 80, resets_at: "2026-06-12T00:00:00.000Z" },
};

function makePoller(
  over: Partial<ConstructorParameters<typeof UsagePoller>[0]>,
) {
  const got: AccountLimits[] = [];
  const poller = new UsagePoller({
    readCredentials: () => ({ accessToken: "t", subscriptionType: "max" }),
    fetchUsage: async () => ({ status: 200, data: RAW }),
    onLimits: (l) => got.push(l),
    intervalMs: 999_999,
    ...over,
  });
  return { poller, got };
}

test("emits AccountLimits on success", async () => {
  const { poller, got } = makePoller({});
  await poller.tick();
  expect(got).toHaveLength(1);
  expect(got[0]?.planName).toBe("Max");
  expect(got[0]?.fiveHour.utilization).toBe(30);
});

test("no credentials → no emit", async () => {
  const { poller, got } = makePoller({ readCredentials: () => null });
  await poller.tick();
  expect(got).toHaveLength(0);
});

test("429 emits stale=true reusing last good values", async () => {
  let n = 0;
  const { poller, got } = makePoller({
    fetchUsage: async () =>
      ++n === 1 ? { status: 200, data: RAW } : { status: 429 },
  });
  await poller.tick(); // good
  await poller.tick(); // 429 → stale
  expect(got).toHaveLength(2);
  expect(got[1]?.stale).toBe(true);
  expect(got[1]?.fiveHour.utilization).toBe(30); // 沿用旧值
});

test("401 emits apiError (credentials invalid), re-reads next tick", async () => {
  const { poller, got } = makePoller({
    fetchUsage: async () => ({ status: 401 }),
  });
  await poller.tick();
  expect(got[0]?.apiError).toBe("unauthorized");
});

test("custom ANTHROPIC_BASE_URL skips fetch entirely", async () => {
  const { poller, got } = makePoller({
    baseUrl: "https://proxy.example.com",
  });
  await poller.tick();
  expect(got).toHaveLength(0);
});

test("403 also emits apiError unauthorized", async () => {
  const { poller, got } = makePoller({
    fetchUsage: async () => ({ status: 403 }),
  });
  await poller.tick();
  expect(got[0]?.apiError).toBe("unauthorized");
});

test("fetchUsage throwing degrades with apiError network", async () => {
  const { poller, got } = makePoller({
    fetchUsage: async () => {
      throw new Error("socket hang up");
    },
  });
  await poller.tick();
  expect(got).toHaveLength(1);
  expect(got[0]?.apiError).toBe("network");
});
