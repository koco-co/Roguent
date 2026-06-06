import { expect, test } from "bun:test";
import type { AccountLimits } from "../shared/events";
import { LimitsAggregator, clampUtil, toResetMs } from "./limits-aggregator";

test("toResetMs: 秒 → ms,ms 原样,非法 → null", () => {
  // 秒级(< 1e12)→ ×1000
  expect(toResetMs(1_700_000_000)).toBe(1_700_000_000_000);
  // 已是 ms(> 1e12)→ 原样
  expect(toResetMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  expect(toResetMs(0)).toBeNull();
  expect(toResetMs(-5)).toBeNull();
  expect(toResetMs(undefined)).toBeNull();
  expect(toResetMs(Number.NaN)).toBeNull();
});

test("clampUtil: 0-100 取整,越界裁剪,非数 → null", () => {
  expect(clampUtil(42.4)).toBe(42);
  expect(clampUtil(-3)).toBe(0);
  expect(clampUtil(140)).toBe(100);
  expect(clampUtil(undefined)).toBeNull();
  expect(clampUtil(Number.POSITIVE_INFINITY)).toBeNull();
});

function collect() {
  const out: AccountLimits[] = [];
  const agg = new LimitsAggregator((l) => out.push(l));
  return { agg, out };
}

test("applyRateLimit five_hour 写入 fiveHour 窗口(util + resetsAt 转 ms)", () => {
  const { agg, out } = collect();
  agg.applyRateLimit({
    rateLimitType: "five_hour",
    utilization: 58,
    resetsAt: 1_700_000_000,
  });
  expect(out).toHaveLength(1);
  expect(out[0]?.fiveHour).toEqual({
    utilization: 58,
    resetsAt: 1_700_000_000_000,
  });
  expect(out[0]?.sevenDay).toEqual({ utilization: null, resetsAt: null });
  expect(out[0]?.planName).toBeNull();
});

test("applyRateLimit seven_day 及其变体(opus/sonnet)都进 sevenDay 窗口", () => {
  for (const type of ["seven_day", "seven_day_opus", "seven_day_sonnet"]) {
    const { agg, out } = collect();
    agg.applyRateLimit({ rateLimitType: type, utilization: 27 });
    expect(out[0]?.sevenDay.utilization).toBe(27);
    expect(out[0]?.fiveHour.utilization).toBeNull();
  }
});

test("applyRateLimit overage / 未知类型 → 不进两条主 bar,不触发变更", () => {
  const { agg, out } = collect();
  agg.applyRateLimit({ rateLimitType: "overage", utilization: 90 });
  agg.applyRateLimit({ rateLimitType: "mystery", utilization: 90 });
  expect(out).toHaveLength(0);
});

test("applyRateLimit 缺 utilization → 不更新(避免把已有真值清空)", () => {
  const { agg, out } = collect();
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 58 });
  agg.applyRateLimit({ rateLimitType: "five_hour" }); // 无 utilization
  expect(out).toHaveLength(1); // 第二次没触发
  expect(out[0]?.fiveHour.utilization).toBe(58);
});

test("重复相同值不重复广播(去抖)", () => {
  const { agg, out } = collect();
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 58 });
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 58 });
  expect(out).toHaveLength(1);
});

test("applyPoll 权威:认领过的窗口不被后续 SDK rate_limit 覆盖,planName 保留", () => {
  const { agg, out } = collect();
  agg.applyPoll({
    planName: "Max",
    fiveHour: { utilization: 42, resetsAt: 111 },
    sevenDay: { utilization: 73, resetsAt: 222 },
  });
  expect(out[0]?.planName).toBe("Max");
  expect(out[0]?.fiveHour.utilization).toBe(42);

  // poll 已认领两个窗口 → SDK 高频回包不得覆盖(否则把权威值刷成陈旧/异义值)
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 60 });
  agg.applyRateLimit({ rateLimitType: "seven_day", utilization: 88 });
  expect(out).toHaveLength(1); // 两次都被挡,无新广播
  const last = out.at(-1);
  expect(last?.planName).toBe("Max"); // planName 不被 SDK 抹掉
  expect(last?.fiveHour.utilization).toBe(42); // poll 权威,不被 SDK 覆盖
  expect(last?.sevenDay.utilization).toBe(73);
});

test("rate_limit 仅在 poll 未认领该窗口时兜底填充(逐窗口)", () => {
  const { agg, out } = collect();
  // poll 只成功拿到 sevenDay;fiveHour util 缺失(部分响应/受限)→ 未认领 fiveHour
  agg.applyPoll({
    planName: "Max",
    fiveHour: { utilization: null, resetsAt: null },
    sevenDay: { utilization: 69, resetsAt: 222 },
  });
  agg.applyRateLimit({ rateLimitType: "seven_day", utilization: 88 }); // 已认领 → 忽略
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 30 }); // 未认领 → 兜底
  const last = out.at(-1);
  expect(last?.sevenDay.utilization).toBe(69); // poll 权威
  expect(last?.fiveHour.utilization).toBe(30); // SDK 兜底
});

test("复现报告 bug:poll 成功后接管窗口,之后高频 SDK 陈旧值不再覆盖回去", () => {
  const { agg, out } = collect();
  // poll 尚未成功(启动初期):SDK 先兜底 fiveHour=42
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 42 });
  expect(out.at(-1)?.fiveHour.utilization).toBe(42);
  // poll 成功(/api/oauth/usage 权威值 14)→ 接管并锁定该窗口
  agg.applyPoll({
    planName: "Max",
    fiveHour: { utilization: 14, resetsAt: 111 },
    sevenDay: { utilization: 69, resetsAt: 222 },
  });
  expect(out.at(-1)?.fiveHour.utilization).toBe(14); // poll 覆盖 SDK 兜底
  // 此后高频 SDK 回包(可能是跨 reset 的陈旧值)不得把它刷回 42
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 42 });
  expect(out.at(-1)?.fiveHour.utilization).toBe(14); // 仍是 poll 权威值
});

test("退化的 poll(窗口为 null)不覆盖 SDK 已有真值,只更新 planName", () => {
  const { agg, out } = collect();
  agg.applyRateLimit({ rateLimitType: "five_hour", utilization: 58 });
  // 模拟 poller 401/网络退化:planName 有、窗口 null
  agg.applyPoll({
    planName: "Pro",
    fiveHour: { utilization: null, resetsAt: null },
    sevenDay: { utilization: null, resetsAt: null },
  });
  const last = out.at(-1);
  expect(last?.fiveHour.utilization).toBe(58); // SDK 真值保住
  expect(last?.planName).toBe("Pro"); // planName 仍更新
});

test("applyPoll planName 为 null 时不抹掉已知 planName", () => {
  const { agg, out } = collect();
  agg.applyPoll({
    planName: "Max",
    fiveHour: { utilization: 10, resetsAt: null },
    sevenDay: { utilization: 20, resetsAt: null },
  });
  agg.applyPoll({
    planName: null,
    fiveHour: { utilization: 11, resetsAt: null },
    sevenDay: { utilization: 21, resetsAt: null },
  });
  expect(out.at(-1)?.planName).toBe("Max");
});
