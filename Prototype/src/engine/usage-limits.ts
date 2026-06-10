import type { AccountLimits } from "../shared/events";

/** API 原始响应形状(/api/oauth/usage),字段可缺。 */
export interface RawUsage {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
}

/** 0-100 取整;NaN/Infinity/缺省 → null。 */
export function parseUtilization(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** ISO → epoch ms;非法/缺省 → null。 */
export function parseResetMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** subscriptionType → plan 名;api/空 → null;未知非空 → 首字母大写。 */
export function planNameFor(subscriptionType: string): string | null {
  const lower = subscriptionType.toLowerCase();
  if (lower.includes("max")) return "Max";
  if (lower.includes("pro")) return "Pro";
  if (lower.includes("team")) return "Team";
  if (!subscriptionType || lower.includes("api")) return null;
  return subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
}

export function toAccountLimits(
  raw: RawUsage,
  planName: string | null,
): AccountLimits {
  return {
    planName,
    fiveHour: {
      utilization: parseUtilization(raw.five_hour?.utilization),
      resetsAt: parseResetMs(raw.five_hour?.resets_at),
    },
    sevenDay: {
      utilization: parseUtilization(raw.seven_day?.utilization),
      resetsAt: parseResetMs(raw.seven_day?.resets_at),
    },
  };
}
