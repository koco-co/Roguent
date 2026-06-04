// WS 连接地址的来源:Tauri 桌面壳里向 Rust host 要 engine 的随机端口(端口可能
// 还没从 sidecar stdout 解析到,故退避重试);纯浏览器 dev 回落固定 8787。
const FALLBACK = "ws://localhost:8787";

type Invoke = (cmd: string) => Promise<unknown>;
interface MaybeTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
}

export async function resolveEngineUrl(
  opts: { win?: MaybeTauri; retries?: number; delayMs?: number } = {},
): Promise<string> {
  const win = opts.win ?? (globalThis as unknown as MaybeTauri);
  const invoke = win.__TAURI__?.core?.invoke;
  if (!invoke) return FALLBACK; // 纯浏览器 dev
  const retries = opts.retries ?? 50;
  const delayMs = opts.delayMs ?? 200;
  for (let i = 0; i < retries; i++) {
    try {
      const url = await invoke("engine_url");
      if (typeof url === "string" && url.length > 0) return url;
    } catch {
      /* engine 端口未就绪,退避重试 */
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("engine_url unavailable after retries");
}
