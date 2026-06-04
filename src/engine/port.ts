// 决定 engine 的监听端口:显式 ROGUENT_PORT 优先,否则返回 0 让内核分配临时端口
// (Tauri sidecar 模式下端口由 stdout 的 "PORT=<n>" 回报给 host)。
export function resolvePort(env: Record<string, string | undefined>): number {
  const raw = env.ROGUENT_PORT;
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : 0;
}
