import type { AccountLimits } from "../shared/events";

/**
 * SDK `rate_limit_event` 的 `rate_limit_info` 结构子集(只取我们用到的字段)。
 * 来自 @anthropic-ai/claude-agent-sdk 的 SDKRateLimitInfo——和 claude-hud 从
 * statusline stdin 拿到的 `rate_limits` 同根(都是 CLI/服务端算好的订阅用量),
 * 不读 keychain、不打 OAuth API。
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
 * - SDK `rate_limit_event`(实时、每轮 API 回包刷新)→ `applyRateLimit`,是窗口用量的主源。
 * - keychain 轮询(可读时)→ `applyPoll`,提供唯一的 planName + 窗口兜底/初值。
 *
 * 合并规则:planName 取自 poll(SDK 不带);窗口 last-write-wins,但**退化的 poll
 * (窗口 util=null)不覆盖 SDK 已有真值**,避免把实时数据清空。去抖:值没变不广播。
 */
export class LimitsAggregator {
  private cur: AccountLimits = EMPTY;

  constructor(private onChange: (limits: AccountLimits) => void) {}

  applyRateLimit(info: RateLimitInfoLike): void {
    const key = windowKey(info.rateLimitType);
    if (!key) return; // overage / 未知 → 不进 5h/WEEK 两条主 bar
    const utilization = clampUtil(info.utilization);
    if (utilization === null) return; // 没用量就不动,别清空已有真值
    this.commit({
      ...this.cur,
      [key]: { utilization, resetsAt: toResetMs(info.resetsAt) },
    });
  }

  applyPoll(limits: AccountLimits): void {
    this.commit({
      ...this.cur,
      planName: limits.planName ?? this.cur.planName,
      fiveHour:
        limits.fiveHour.utilization != null
          ? limits.fiveHour
          : this.cur.fiveHour,
      sevenDay:
        limits.sevenDay.utilization != null
          ? limits.sevenDay
          : this.cur.sevenDay,
    });
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
