import * as https from "node:https";
import type { AccountLimits } from "../shared/events";
import { createProxyTunnelAgent, readMacSystemProxy } from "./proxy";
import { type RawUsage, planNameFor, toAccountLimits } from "./usage-limits";

export interface FetchUsageResult {
  status: number;
  data?: RawUsage;
}

export interface UsagePollerDeps {
  readCredentials: () => {
    accessToken: string;
    subscriptionType: string;
  } | null;
  fetchUsage: (token: string) => Promise<FetchUsageResult>;
  onLimits: (limits: AccountLimits) => void;
  intervalMs?: number;
  baseUrl?: string; // 默认空 = api.anthropic.com;非默认 → 跳过
}

const FIVE_MIN = 5 * 60_000;

export class UsagePoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastGood: AccountLimits | null = null;
  private d: Required<Omit<UsagePollerDeps, "baseUrl">> & { baseUrl: string };

  constructor(deps: UsagePollerDeps) {
    this.d = {
      intervalMs: FIVE_MIN,
      baseUrl: "",
      ...deps,
    };
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.d.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // 自定义端点(指向非 api.anthropic.com)→ OAuth usage 不适用,跳过。
  private usingCustomEndpoint(): boolean {
    const base = this.d.baseUrl.trim();
    if (!base) return false;
    try {
      return new URL(base).origin !== "https://api.anthropic.com";
    } catch {
      return true;
    }
  }

  /** 单次拉取(测试直接调它)。 */
  async tick(): Promise<void> {
    if (this.usingCustomEndpoint()) return;
    const creds = this.d.readCredentials(); // 每轮重读 → token 旋转自愈
    if (!creds) return;
    const planName = planNameFor(creds.subscriptionType);
    let res: FetchUsageResult;
    try {
      res = await this.d.fetchUsage(creds.accessToken);
    } catch {
      this.d.onLimits(this.degrade("network"));
      return;
    }
    if (res.status === 200 && res.data) {
      this.lastGood = toAccountLimits(res.data, planName);
      this.d.onLimits(this.lastGood);
      return;
    }
    if (res.status === 429) {
      this.d.onLimits({
        ...(this.lastGood ?? this.empty(planName)),
        stale: true,
      });
      return;
    }
    if (res.status === 401 || res.status === 403) {
      this.d.onLimits({ ...this.empty(planName), apiError: "unauthorized" });
      return;
    }
    this.d.onLimits(this.degrade(`http-${res.status}`));
  }

  private empty(planName: string | null): AccountLimits {
    return {
      planName,
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
    };
  }

  private degrade(error: string): AccountLimits {
    return {
      ...(this.lastGood ?? this.empty(null)),
      apiError: error,
      stale: !!this.lastGood,
    };
  }
}

/** 真实 HTTPS 拉取(走系统代理隧道)。单测不调它(注入假实现)。 */
export async function defaultFetchUsage(
  token: string,
): Promise<FetchUsageResult> {
  const proxy = readMacSystemProxy();
  const proxyUrl = proxy.https ?? proxy.http;
  return new Promise<FetchUsageResult>((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "claude-code/2.1",
        },
        timeout: 15_000,
        agent: proxyUrl ? createProxyTunnelAgent(new URL(proxyUrl)) : undefined,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status !== 200) return resolve({ status });
          try {
            resolve({ status, data: JSON.parse(body) as RawUsage });
          } catch {
            resolve({ status: 0 });
          }
        });
      },
    );
    req.on("error", () => resolve({ status: 0 }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0 });
    });
    req.end();
  });
}
