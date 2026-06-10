import type { AccountLimits } from "../shared/events";

/**
 * SDK `rate_limit_event` 的 `rate_limit_info` 结构子集(只取我们用到的字段)。
 * 来自 @anthropic-ai/claude-agent-sdk 的 SDKRateLimitInfo。
 *
 * **注意**:这是个**单窗口、变更触发**的事件——一次只带一个 `rateLimitType` +
 * 一个 `utilization`,表示当下最相关/绑定的那条限额,且跨窗口 reset 不自动归零。
 * 它**不是** `/api/oauth/usage` 那样一次返回 `{five_hour, seven_day}` 完整快照,
 * 故只能当兜底,不能当权威源(见下方 LimitsAggregator)。
 */
export interface RateLimitInfoLike {
  rateLimitType?: string; // 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage'
  utilization?: number; // 0-100
  resetsAt?: number; // epoch 秒或毫秒
  status?: string;
}

/** epoch 秒(< 1e12)→ ms;已是 ms 原样;非法/≤0 → null。复刻 claude-hud 的启发式。 */
export function toResetMs(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value > 1e12 ? value : Math.round(value * 1000);
}

/** 0-100 取整 + 裁剪;非数 → null。 */
export function clampUtil(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}

const EMPTY: AccountLimits = {
  planName: null,
  fiveHour: { utilization: null, resetsAt: null },
  sevenDay: { utilization: null, resetsAt: null },
};

/**
 * 把两个真实源合并成一份账户级 `AccountLimits`,变更时回调 onChange:
 * - keychain 轮询 `/api/oauth/usage`(每 5 分钟一次)→ `applyPoll`,是窗口用量的
 *   **权威源**(和 claude-hud 同源同语义,一次返回两窗口完整快照),也是唯一 planName 源。
 * - SDK `rate_limit_event`(实时、每轮 API 回包)→ `applyRateLimit`,**仅兜底**:
 *   poll 从未成功认领的窗口才用它填充(如受限环境读不到 keychain)。
 *
 * 合并规则:poll 一旦以真实 util 认领某窗口,该窗口锁定为权威值,后续 SDK 不再覆盖
 * ——否则高频、单窗口、可能跨 reset 陈旧的 SDK 值会把 5 分钟一次的权威值刷掉
 * (曾导致 5h 显 42% 而真值 14%)。planName 取自 poll(SDK 不带);**退化的 poll
 * (窗口 util=null)不覆盖已有值、也不认领**。去抖:值没变不广播。
 */
export class LimitsAggregator {
  private cur: AccountLimits = EMPTY;
  // poll(权威源)成功认领过的窗口。认领后 SDK rate_limit_event 不再覆盖该窗口。
  private pollOwned = { fiveHour: false, sevenDay: false };

  constructor(private onChange: (limits: AccountLimits) => void) {}

  applyRateLimit(info: RateLimitInfoLike): void {
    const key = windowKey(info.rateLimitType);
    if (!key) return; // overage / 未知 → 不进 5h/WEEK 两条主 bar
    if (this.pollOwned[key]) return; // poll 权威已锁定该窗口 → SDK 不兜底覆盖
    const utilization = clampUtil(info.utilization);
    if (utilization === null) return; // 没用量就不动,别清空已有真值
    this.commit({
      ...this.cur,
      [key]: { utilization, resetsAt: toResetMs(info.resetsAt) },
    });
  }

  applyPoll(limits: AccountLimits): void {
    const next: AccountLimits = {
      ...this.cur,
      planName: limits.planName ?? this.cur.planName,
    };
    if (limits.fiveHour.utilization != null) {
      next.fiveHour = limits.fiveHour;
      this.pollOwned.fiveHour = true; // 认领并锁定为权威值
    }
    if (limits.sevenDay.utilization != null) {
      next.sevenDay = limits.sevenDay;
      this.pollOwned.sevenDay = true;
    }
    this.commit(next);
  }

  private commit(next: AccountLimits): void {
    if (JSON.stringify(next) === JSON.stringify(this.cur)) return;
    this.cur = next;
    this.onChange(next);
  }
}

function windowKey(type: string | undefined): "fiveHour" | "sevenDay" | null {
  if (type === "five_hour") return "fiveHour";
  if (typeof type === "string" && type.startsWith("seven_day"))
    return "sevenDay";
  return null;
}
