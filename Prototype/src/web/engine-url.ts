// WS 连接地址的来源:Tauri 桌面壳里向 Rust host 要 engine 的随机端口(端口可能
// 还没从 sidecar stdout 解析到,故退避重试);纯浏览器 dev 回落固定 8787。
// E2E 测试可通过 ?engine=<wsUrl> 查询参数或 localStorage["roguent:engineUrl"] 覆盖地址,
// 以便每个测试用自己的 engine 实例(replaying 不同 fixture)。两种途径仅在无 Tauri 时生效。
const FALLBACK = "ws://localhost:8787";

type Invoke = (cmd: string) => Promise<unknown>;
interface MaybeTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
}

/** E2E-only: read ?engine=<wsUrl> from location.search, return null if absent. */
function engineFromQuery(): string | null {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const v = params.get("engine");
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** E2E-only: read localStorage["roguent:engineUrl"], return null if absent. */
function engineFromStorage(): string | null {
  try {
    const v = globalThis.localStorage?.getItem("roguent:engineUrl");
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function resolveEngineUrl(
  opts: { win?: MaybeTauri; retries?: number; delayMs?: number } = {},
): Promise<string> {
  const win = opts.win ?? (globalThis as unknown as MaybeTauri);
  const invoke = win.__TAURI__?.core?.invoke;
  if (!invoke) {
    // 纯浏览器 dev / E2E:先尝试 query 参数,再尝试 localStorage,最后回落 8787。
    return engineFromQuery() ?? engineFromStorage() ?? FALLBACK;
  }
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
