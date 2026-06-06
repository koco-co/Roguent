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
