/** 剩余 = 100 - 利用率(0-100);null → null。 */
export function barRemaining(utilization: number | null): number | null {
  if (utilization == null) return null;
  return Math.max(0, Math.min(100, 100 - utilization));
}

/** 到重置的倒计时;已过/缺省 → "—"。 */
export function formatCountdown(resetsAt: number | null, now: number): string {
  if (resetsAt == null) return "—";
  const ms = resetsAt - now;
  if (ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
