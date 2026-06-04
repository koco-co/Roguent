// 代理环境解析。打包成 .app 后由 LaunchServices 启动,进程**不继承 shell 环境**,
// 故 bundled claude CLI 拿不到 HTTP(S)_PROXY → 在需代理才能访问 Anthropic 的网络环境
// 下直连会 403。这里在组装 SDK env 时兜底:环境本就有代理则尊重之,否则读 macOS
// 系统代理(scutil --proxy)注入,让 CLI 走得通(Node/undici 只认 *_PROXY env,不会
// 自动读系统代理)。纯解析函数 + 注入逻辑都做成可注入依赖,便于单测。

export interface SystemProxy {
  http?: string;
  https?: string;
}

// 解析 `scutil --proxy` 的输出。仅当对应 Enable=1 且 host/port 齐备才产出
// `http://host:port`(代理 URL 一律 http scheme —— 它是 HTTP CONNECT 代理)。
export function parseScutilProxy(output: string): SystemProxy {
  const get = (key: string): string | undefined => {
    const m = output.match(new RegExp(`${key}\\s*:\\s*(\\S+)`));
    return m ? m[1] : undefined;
  };
  const out: SystemProxy = {};
  if (get("HTTPEnable") === "1") {
    const host = get("HTTPProxy");
    const port = get("HTTPPort");
    if (host && port) out.http = `http://${host}:${port}`;
  }
  if (get("HTTPSEnable") === "1") {
    const host = get("HTTPSProxy");
    const port = get("HTTPSPort");
    if (host && port) out.https = `http://${host}:${port}`;
  }
  return out;
}

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
];

// 决定要往 SDK env 里**追加**的代理变量。环境已显式设了任一代理变量 → 一律不动
//(尊重用户/dev shell 的配置);否则用 readSystemProxy() 读到的系统代理拼出
// 大小写两套 *_PROXY + NO_PROXY。读不到系统代理则返回空(不改 env)。
export function resolveProxyEnv(
  env: Record<string, string | undefined>,
  readSystemProxy: () => SystemProxy,
): Record<string, string> {
  if (PROXY_ENV_KEYS.some((k) => (env[k] ?? "").trim() !== "")) return {};
  const sys = readSystemProxy();
  const https = sys.https ?? sys.http;
  const http = sys.http ?? sys.https;
  if (!https && !http) return {};
  const out: Record<string, string> = {};
  if (http) {
    out.HTTP_PROXY = http;
    out.http_proxy = http;
  }
  if (https) {
    out.HTTPS_PROXY = https;
    out.https_proxy = https;
  }
  out.NO_PROXY = "localhost,127.0.0.1,::1,.local";
  out.no_proxy = out.NO_PROXY;
  return out;
}

// 默认的系统代理读取:仅 macOS 走 `scutil --proxy`;非 darwin / 出错 → 视作无代理。
export function readMacSystemProxy(): SystemProxy {
  if (process.platform !== "darwin") return {};
  try {
    const r = Bun.spawnSync(["scutil", "--proxy"]);
    if (r.exitCode !== 0) return {};
    return parseScutilProxy(r.stdout.toString());
  } catch {
    return {};
  }
}
