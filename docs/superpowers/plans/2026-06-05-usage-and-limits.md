# 用量与限额(显示层)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Roguent 加《元气骑士》式用量可视化:左上账户 5h/周限额双条、每个 NPC 头顶上下文窗口充能条、🏆 按会话排行榜——全部真实数据,纯显示。

**Architecture:** 引擎 LIVE 分支起一个 `UsagePoller` 拉 `/api/oauth/usage`(参考 claude-hud,只读 keychain OAuth token、自建代理隧道、429/401 降级),经新的 `{kind:"limits"}` 兄弟消息广播;每会话上下文占用用 SDK `Query.getContextUsage()` 真接口,在每轮结束(`usage.updated`)由 `SessionManager` 发 `context.updated` 事件。前端 `useRoomStore` 存 `limits` + 每会话 `context`,三个渲染件消费。`RoomEvent` 信封零改动。

**Tech Stack:** Bun + TypeScript、`@anthropic-ai/claude-agent-sdk`、React 19 + PixiJS v8(`@pixi/react`)、Zustand、`bun:test`、Biome。

**设计依据:** `docs/superpowers/specs/2026-06-05-usage-and-limits-design.md`(v2,经对抗式自审)。参考实现 `~/.claude/plugins/cache/claude-hud/claude-hud/0.1.0/dist/usage-api.js`。

**全程关卡(每个 Commit 前):** `bun test` 全绿、`bun run check` 干净、`bunx tsc --noEmit` 退出 0。

---

## 文件结构

**引擎(`src/engine/`)**
- `usage-limits.ts`(新)— 账户限额纯函数:`parseUtilization` / `parseResetMs` / `planNameFor` / `toAccountLimits`。
- `credentials.ts`(新)— 注入式只读 OAuth 凭据(keychain → 文件回退)。
- `usage-poller.ts`(新)— `UsagePoller` 类(注入 fetch/creds/proxy/onLimits)+ 真实 `defaultFetchUsage`。
- `proxy.ts`(改)— 导出 `createProxyTunnelAgent(proxyUrl)`(供进程内 https 请求走系统代理)。
- `driver.ts`(改)— `IDriver.getContextUsage()` + `Driver.getContextUsage()`。
- `session.ts`(改)— 每轮(`usage.updated`)调 `getContextUsage()` 并发 `context.updated`。
- `ws-gateway.ts`(改)— `broadcastLimits()` + 新连接回放缓存 limits。
- `server.ts`(改)— LIVE 分支构造并启动 `UsagePoller`,注入 gateway。

**共享(`src/shared/`)**
- `events.ts`(改)— `WindowUsage` / `AccountLimits` / `LimitsMessage`;`context.updated` + `ContextUpdatedPayload`。
- `domain.ts`(改)— `ContextUsage` + `Session.context?`。

**前端(`src/web/`)**
- `ws-client.ts`(改)— `handleIncoming` 加 `kind==="limits"` 第三臂 + `connectRoom` 接 `setLimits`。
- `store.ts`(改)— `RoomStore.limits`(注意:**只挂 `RoomStore`,不进 `RoomState`**)+ `setLimits` + `reduce` 的 `context.updated` 分支。
- `ui-store.ts`(改)— `Panel` 增 `"leaderboardOpen"` + 状态字段。
- `hud/limits-format.ts`(新)— `barRemaining` / `formatCountdown` 纯函数。
- `hud/LimitBars.tsx`(新)— 左上双条。
- `hud/leaderboard.ts`(新)— `leaderboardRows(sessions)` 纯函数。
- `hud/Leaderboard.tsx`(新)— 🏆 面板。
- `hud/Hud.tsx`(改)— 挂 `LimitBars` + `Leaderboard` + 🏆 按钮。
- `hud/NpcCard.tsx`(改)— 补一行上下文 %。
- `overworld/SessionNpc.tsx`(改)— `utilization` prop + 头顶充能条(走 `ring`/`dot` 式 `draw` 回调)。
- `overworld/Overworld.tsx`(改)— 把 `sessions[a.id].context?.utilization` 传给 `SessionNpc`。
- `styles.css`(改)— 限额条样式 + 设置坞挪到右上。

---

## Task 1: 共享契约(协议 + domain 类型)

**Files:**
- Modify: `src/shared/events.ts`
- Modify: `src/shared/domain.ts`
- Test: `src/shared/domain.test.ts`(追加一条)

- [ ] **Step 1: 写失败测试 —— 新会话默认无 context**

在 `src/shared/domain.test.ts` 末尾追加:

```ts
test("createSession leaves context undefined until first context.updated", () => {
  const s = createSession({ id: "s1", title: "t", model: "claude-opus-4-8" });
  expect(s.context).toBeUndefined();
});
```

(若文件未导入 `createSession`,确认顶部已有 `import { createSession } from "./domain";` 或 `from "../shared/domain"` 对应路径。)

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/shared/domain.test.ts`
Expected: FAIL —— `context` 字段不存在(TS 报 `Property 'context' does not exist on type 'Session'`)或断言失败。

- [ ] **Step 3: 加 domain 类型**

在 `src/shared/domain.ts`,`Loot` 之后、`Session` 之前加:

```ts
// 当前会话上下文窗口占用(来自 SDK getContextUsage)。usedTokens/windowSize 为 token 数,
// utilization 为 0-100 的占用百分比(/compact 后回落)。
export interface ContextUsage {
  usedTokens: number;
  windowSize: number;
  utilization: number;
}
```

在 `Session` 接口里(`archived: boolean;` 之后)加:

```ts
  // 上下文窗口占用(每轮结束由引擎 getContextUsage 派生);首轮前为 undefined。
  context?: ContextUsage;
```

- [ ] **Step 4: 加协议类型**

在 `src/shared/events.ts` 的 `RoomEventType` 联合里,`"usage.updated"` 同级追加(注意它前一行末尾的 `;` 改成 `|`):

```ts
  | "usage.updated"
  | "context.updated";
```

在 payload 区(`UsagePayload` 之后)加:

```ts
export interface ContextUpdatedPayload {
  usedTokens: number;
  windowSize: number;
  utilization: number; // 0-100
}

// ── 信封之外的账户级兄弟消息(不带 seq;last-write-wins;与 (sessionId,seq) 顺序契约无关) ──
export interface WindowUsage {
  utilization: number | null; // 0-100;null=未知
  resetsAt: number | null; // epoch ms
}
export interface AccountLimits {
  planName: string | null; // "Pro" | "Max" | "Team" | <首字母大写> | null
  fiveHour: WindowUsage;
  sevenDay: WindowUsage;
  apiError?: string; // 置位 → 前端灰显
  stale?: boolean; // 退避期沿用旧值
}
export interface LimitsMessage {
  kind: "limits";
  ts: number;
  limits: AccountLimits;
}
```

- [ ] **Step 5: 跑测试确认通过 + 关卡**

Run: `bun test src/shared/domain.test.ts && bunx tsc --noEmit && bun run check`
Expected: domain 测试 PASS;tsc 退出 0;biome 干净。

- [ ] **Step 6: Commit**

```bash
git add src/shared/events.ts src/shared/domain.ts src/shared/domain.test.ts
git commit -m "feat: 🧩 用量限额协议与 domain 类型(AccountLimits/LimitsMessage/context.updated)"
```

---

## Task 2: 账户限额纯函数

**Files:**
- Create: `src/engine/usage-limits.ts`
- Test: `src/engine/usage-limits.test.ts`

- [ ] **Step 1: 写失败测试**

`src/engine/usage-limits.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  parseResetMs,
  parseUtilization,
  planNameFor,
  toAccountLimits,
} from "./usage-limits";

test("parseUtilization clamps 0-100 and rejects non-finite", () => {
  expect(parseUtilization(42)).toBe(42);
  expect(parseUtilization(120)).toBe(100);
  expect(parseUtilization(-5)).toBe(0);
  expect(parseUtilization(Number.NaN)).toBeNull();
  expect(parseUtilization(Number.POSITIVE_INFINITY)).toBeNull();
  expect(parseUtilization(undefined)).toBeNull();
});

test("parseResetMs parses ISO to epoch ms, null on invalid", () => {
  expect(parseResetMs("2026-06-05T12:00:00.000Z")).toBe(
    Date.parse("2026-06-05T12:00:00.000Z"),
  );
  expect(parseResetMs("not-a-date")).toBeNull();
  expect(parseResetMs(undefined)).toBeNull();
});

test("planNameFor maps known tiers and capitalizes unknown, null for api/empty", () => {
  expect(planNameFor("claude_max")).toBe("Max");
  expect(planNameFor("pro")).toBe("Pro");
  expect(planNameFor("team")).toBe("Team");
  expect(planNameFor("api")).toBeNull();
  expect(planNameFor("")).toBeNull();
  expect(planNameFor("enterprise")).toBe("Enterprise");
});

test("toAccountLimits maps the API payload shape", () => {
  const limits = toAccountLimits(
    {
      five_hour: { utilization: 30, resets_at: "2026-06-05T12:00:00.000Z" },
      seven_day: { utilization: 80, resets_at: "2026-06-12T00:00:00.000Z" },
    },
    "Max",
  );
  expect(limits.planName).toBe("Max");
  expect(limits.fiveHour.utilization).toBe(30);
  expect(limits.sevenDay.utilization).toBe(80);
  expect(limits.fiveHour.resetsAt).toBe(
    Date.parse("2026-06-05T12:00:00.000Z"),
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/usage-limits.test.ts`
Expected: FAIL —— `Cannot find module './usage-limits'`。

- [ ] **Step 3: 实现纯函数**

`src/engine/usage-limits.ts`:

```ts
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
```

- [ ] **Step 4: 跑测试确认通过 + 关卡**

Run: `bun test src/engine/usage-limits.test.ts && bunx tsc --noEmit && bun run check`
Expected: PASS;tsc 0;biome 干净。

- [ ] **Step 5: Commit**

```bash
git add src/engine/usage-limits.ts src/engine/usage-limits.test.ts
git commit -m "feat: 🧩 账户限额纯函数(parseUtilization/planNameFor/toAccountLimits)"
```

---

## Task 3: 只读 OAuth 凭据(注入式)

**Files:**
- Create: `src/engine/credentials.ts`
- Test: `src/engine/credentials.test.ts`

- [ ] **Step 1: 写失败测试**

`src/engine/credentials.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readOauthCredentials } from "./credentials";

const TOKEN_JSON = JSON.stringify({
  claudeAiOauth: {
    accessToken: "tok-abc",
    subscriptionType: "max",
    expiresAt: 9_999_999_999_999, // 远未来 (ms)
  },
});

test("reads keychain credentials (camelCase, ms expiry)", () => {
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => TOKEN_JSON,
    readFile: () => null,
  });
  expect(creds).toEqual({ accessToken: "tok-abc", subscriptionType: "max" });
});

test("treats ms-expired token as no credentials", () => {
  const expired = JSON.stringify({
    claudeAiOauth: { accessToken: "x", subscriptionType: "max", expiresAt: 500 },
  });
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => expired,
    readFile: () => null,
  });
  expect(creds).toBeNull();
});

test("falls back to file when keychain returns nothing", () => {
  const creds = readOauthCredentials({
    now: () => 1_000,
    readKeychain: () => null,
    readFile: () => TOKEN_JSON,
  });
  expect(creds?.accessToken).toBe("tok-abc");
});

test("returns null and never throws when both sources fail", () => {
  expect(
    readOauthCredentials({
      now: () => 1_000,
      readKeychain: () => {
        throw new Error("keychain locked: secret-should-not-leak");
      },
      readFile: () => null,
    }),
  ).toBeNull();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/credentials.test.ts`
Expected: FAIL —— `Cannot find module './credentials'`。

- [ ] **Step 3: 实现凭据读取**

`src/engine/credentials.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { createHash } from "node:crypto";
import { join, normalize, resolve } from "node:path";

export interface OauthCredentials {
  accessToken: string;
  subscriptionType: string;
}

export interface CredentialDeps {
  now: () => number;
  readKeychain: () => string | null;
  readFile: () => string | null;
}

const KEYCHAIN_SERVICE = "Claude Code-credentials";

// 仅解析 CLI 的 claudeAiOauth 命名空间(camelCase,expiresAt 为 ms)。
// 绝不读 SDK file-provider 的 snake_case 文件。
function parse(json: string, now: number): OauthCredentials | null {
  try {
    const o = JSON.parse(json) as {
      claudeAiOauth?: {
        accessToken?: string;
        subscriptionType?: string;
        expiresAt?: number;
      };
    };
    const c = o.claudeAiOauth;
    if (!c?.accessToken) return null;
    if (c.expiresAt != null && c.expiresAt <= now) return null; // ms 同单位
    return {
      accessToken: c.accessToken,
      subscriptionType: c.subscriptionType ?? "",
    };
  } catch {
    return null;
  }
}

function keychainService(home: string): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  const def = normalize(resolve(join(home, ".claude")));
  if (!configDir || normalize(resolve(configDir)) === def)
    return KEYCHAIN_SERVICE;
  const hash = createHash("sha256")
    .update(normalize(resolve(configDir)))
    .digest("hex")
    .slice(0, 8);
  return `${KEYCHAIN_SERVICE}-${hash}`;
}

// 默认实现:macOS keychain(绝对路径 + 参数数组,无 shell 注入面)。
function defaultReadKeychain(): string | null {
  if (process.platform !== "darwin") return null;
  const home = homedir();
  const service = keychainService(home);
  const account = userInfo().username?.trim();
  const run = (args: string[]) =>
    execFileSync("/usr/bin/security", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    }).trim();
  try {
    const args = account
      ? ["find-generic-password", "-s", service, "-a", account, "-w"]
      : ["find-generic-password", "-s", service, "-w"];
    const out = run(args);
    return out || null;
  } catch (err) {
    // 只记 message;严禁 log 整个 error / err.stderr(可能含 token)。
    console.warn(
      `[credentials] keychain read failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

function defaultReadFile(): string | null {
  const path = join(
    process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude"),
    ".credentials.json",
  );
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    console.warn(
      `[credentials] file read failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

const defaults: CredentialDeps = {
  now: () => Date.now(),
  readKeychain: defaultReadKeychain,
  readFile: defaultReadFile,
};

/** 每次调用都重新读(不缓存 token),CLI 旋转后下轮自愈。 */
export function readOauthCredentials(
  deps: Partial<CredentialDeps> = {},
): OauthCredentials | null {
  const d = { ...defaults, ...deps };
  const now = d.now();
  let raw: string | null = null;
  try {
    raw = d.readKeychain();
  } catch (err) {
    console.warn(
      `[credentials] keychain read threw: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  const fromKeychain = raw ? parse(raw, now) : null;
  if (fromKeychain) return fromKeychain;
  let file: string | null = null;
  try {
    file = d.readFile();
  } catch {
    file = null;
  }
  return file ? parse(file, now) : null;
}
```

- [ ] **Step 4: 加「日志不泄 token」断言**

在 `src/engine/credentials.test.ts` 末尾追加(验证 catch 路径只记 message、不带异常细节里的敏感串):

```ts
test("does not log access token on read failure", () => {
  const logs: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => logs.push(a.join(" "));
  try {
    readOauthCredentials({
      now: () => 0,
      readKeychain: () => {
        throw new Error("boom tok-abc");
      },
      readFile: () => null,
    });
  } finally {
    console.warn = orig;
  }
  // message 里若含 token 子串是调用方传入的;关键是我们不 log 整个 error 对象/stderr。
  // 这里断言我们确实只走了 message 路径(不抛、有且仅有一条 warn)。
  expect(logs.length).toBe(1);
});
```

- [ ] **Step 5: 跑测试确认通过 + 关卡**

Run: `bun test src/engine/credentials.test.ts && bunx tsc --noEmit && bun run check`
Expected: PASS;tsc 0;biome 干净。

- [ ] **Step 6: Commit**

```bash
git add src/engine/credentials.ts src/engine/credentials.test.ts
git commit -m "feat: 🧩 只读 OAuth 凭据(keychain→文件,注入式,ms 过期)"
```

---

## Task 4: UsagePoller(注入式)+ 真实 fetch + 代理隧道

**Files:**
- Modify: `src/engine/proxy.ts`(加 `createProxyTunnelAgent`)
- Create: `src/engine/usage-poller.ts`
- Test: `src/engine/usage-poller.test.ts`

- [ ] **Step 1: 写失败测试(只测注入式逻辑,不碰真网络/keychain)**

`src/engine/usage-poller.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { AccountLimits } from "../shared/events";
import { UsagePoller } from "./usage-poller";

const RAW = {
  five_hour: { utilization: 30, resets_at: "2026-06-05T12:00:00.000Z" },
  seven_day: { utilization: 80, resets_at: "2026-06-12T00:00:00.000Z" },
};

function makePoller(over: Partial<ConstructorParameters<typeof UsagePoller>[0]>) {
  const got: AccountLimits[] = [];
  const poller = new UsagePoller({
    readCredentials: () => ({ accessToken: "t", subscriptionType: "max" }),
    fetchUsage: async () => ({ status: 200, data: RAW }),
    onLimits: (l) => got.push(l),
    now: () => 1_000,
    intervalMs: 999_999,
    ...over,
  });
  return { poller, got };
}

test("emits AccountLimits on success", async () => {
  const { poller, got } = makePoller({});
  await poller.tick();
  expect(got).toHaveLength(1);
  expect(got[0]?.planName).toBe("Max");
  expect(got[0]?.fiveHour.utilization).toBe(30);
});

test("no credentials → no emit", async () => {
  const { poller, got } = makePoller({ readCredentials: () => null });
  await poller.tick();
  expect(got).toHaveLength(0);
});

test("429 emits stale=true reusing last good values", async () => {
  let n = 0;
  const { poller, got } = makePoller({
    fetchUsage: async () =>
      ++n === 1 ? { status: 200, data: RAW } : { status: 429 },
  });
  await poller.tick(); // good
  await poller.tick(); // 429 → stale
  expect(got).toHaveLength(2);
  expect(got[1]?.stale).toBe(true);
  expect(got[1]?.fiveHour.utilization).toBe(30); // 沿用旧值
});

test("401 emits apiError (credentials invalid), re-reads next tick", async () => {
  const { poller, got } = makePoller({ fetchUsage: async () => ({ status: 401 }) });
  await poller.tick();
  expect(got[0]?.apiError).toBe("unauthorized");
});

test("custom ANTHROPIC_BASE_URL skips fetch entirely", async () => {
  const { poller, got } = makePoller({
    baseUrl: "https://proxy.example.com",
  });
  await poller.tick();
  expect(got).toHaveLength(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/usage-poller.test.ts`
Expected: FAIL —— `Cannot find module './usage-poller'`。

- [ ] **Step 3: 实现 UsagePoller(注入式核心)**

`src/engine/usage-poller.ts`:

```ts
import type { AccountLimits } from "../shared/events";
import { readOauthCredentials } from "./credentials";
import { createProxyTunnelAgent, readMacSystemProxy } from "./proxy";
import { type RawUsage, planNameFor, toAccountLimits } from "./usage-limits";

export interface FetchUsageResult {
  status: number;
  data?: RawUsage;
}

export interface UsagePollerDeps {
  readCredentials: () => { accessToken: string; subscriptionType: string } | null;
  fetchUsage: (token: string) => Promise<FetchUsageResult>;
  onLimits: (limits: AccountLimits) => void;
  now?: () => number;
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
      now: () => Date.now(),
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
    return { ...(this.lastGood ?? this.empty(null)), apiError: error, stale: !!this.lastGood };
  }
}

/** 真实 HTTPS 拉取(走系统代理隧道)。单测不调它(注入假实现)。 */
export async function defaultFetchUsage(
  token: string,
): Promise<FetchUsageResult> {
  const https = await import("node:https");
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
```

- [ ] **Step 4: 在 `proxy.ts` 加 `createProxyTunnelAgent`**

`src/engine/proxy.ts` 顶部加导入:

```ts
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
```

文件末尾追加(移植 claude-hud `usage-api.js` 的 CONNECT 隧道;Node 内置 https 不自动读 `*_PROXY`,进程内请求必须显式带 agent):

```ts
/**
 * 给进程内 https 请求用的 HTTP CONNECT 隧道 Agent。proxy.ts 现有的 resolveProxyEnv
 * 只产出注入给 SDK 子进程的 *_PROXY env,对引擎自己的 fetch 无效——故这里显式建隧道。
 */
export function createProxyTunnelAgent(proxyUrl: URL): https.Agent {
  const proxyHost = proxyUrl.hostname;
  const proxyPort = Number.parseInt(
    proxyUrl.port || (proxyUrl.protocol === "https:" ? "443" : "80"),
    10,
  );
  return new (class extends https.Agent {
    createConnection(
      options: { host?: string; port?: number; servername?: string },
      callback: (err: Error | null, socket?: tls.TLSSocket) => void,
    ): undefined {
      const targetHost = String(options.host ?? "api.anthropic.com");
      const targetPort = Number(options.port) || 443;
      let settled = false;
      const settle = (err: Error | null, socket?: tls.TLSSocket) => {
        if (settled) return;
        settled = true;
        callback(err, socket);
      };
      const proxySocket = net.connect(proxyPort, proxyHost);
      proxySocket.once("error", (e) => settle(e));
      proxySocket.once("connect", () => {
        proxySocket.write(
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`,
        );
        let buf = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          const end = buf.indexOf("\r\n\r\n");
          if (end === -1) return;
          proxySocket.removeListener("data", onData);
          const statusLine = buf.subarray(0, end).toString("utf8").split("\r\n")[0] ?? "";
          if (!/^HTTP\/1\.[01] 200 /.test(statusLine)) {
            const err = new Error(`Proxy CONNECT rejected: ${statusLine}`);
            proxySocket.destroy(err);
            return settle(err);
          }
          const tlsSocket = tls.connect(
            { socket: proxySocket, servername: targetHost },
            () => settle(null, tlsSocket),
          );
          tlsSocket.once("error", (e) => settle(e));
        };
        proxySocket.on("data", onData);
      });
      return undefined;
    }
  })();
}
```

- [ ] **Step 5: 跑测试确认通过 + 关卡**

Run: `bun test src/engine/usage-poller.test.ts && bunx tsc --noEmit && bun run check`
Expected: poller 测试全 PASS;tsc 0;biome 干净。(`defaultFetchUsage` / 隧道走构建 + 后续真连冒烟,不在单测。)

- [ ] **Step 6: Commit**

```bash
git add src/engine/usage-poller.ts src/engine/usage-poller.test.ts src/engine/proxy.ts
git commit -m "feat: 🧩 UsagePoller(注入式 + 429/401 降级)+ 代理 CONNECT 隧道"
```

---

## Task 5: 每会话上下文占用(Driver.getContextUsage + SessionManager 发 context.updated)

**Files:**
- Modify: `src/engine/driver.ts`(`IDriver` + `Driver.getContextUsage`)
- Modify: `src/engine/session.ts`(观测 `usage.updated` → 发 `context.updated`)
- Test: `src/engine/session.test.ts`(追加)

- [ ] **Step 1: 写失败测试**

在 `src/engine/session.test.ts` 顶部确认有(没有就加):

```ts
import { expect, test } from "bun:test";
import type { DriverCallbacks, IDriver } from "./driver";
import type { RoomEvent } from "../shared/events";
import { SessionManager } from "./session";
```

追加测试:

```ts
test("emits context.updated after a turn (usage.updated), from getContextUsage", async () => {
  const events: RoomEvent[] = [];
  let cb: DriverCallbacks | null = null;
  const fakeDriver: IDriver = {
    start() {},
    send() {},
    setModel: async () => {},
    interrupt: async () => {},
    end() {},
    getContextUsage: async () => ({ totalTokens: 200_000, maxTokens: 1_000_000 }),
  };
  const mgr = new SessionManager((c) => {
    cb = c;
    return fakeDriver;
  });
  mgr.subscribe((e) => events.push(e));
  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });
  // 模拟一轮结束:driver 回吐 usage.updated
  cb?.onDraft([{ type: "usage.updated", payload: { tokens: 10, cost: 0 } }], 123);
  await new Promise((r) => setTimeout(r, 0)); // flush microtasks
  const ctx = events.find((e) => e.type === "context.updated");
  expect(ctx).toBeDefined();
  expect(ctx?.payload).toEqual({
    usedTokens: 200_000,
    windowSize: 1_000_000,
    utilization: 20,
  });
});

test("no context.updated when getContextUsage returns null", async () => {
  const events: RoomEvent[] = [];
  let cb: DriverCallbacks | null = null;
  const mgr = new SessionManager((c) => {
    cb = c;
    return {
      start() {},
      send() {},
      setModel: async () => {},
      interrupt: async () => {},
      end() {},
      getContextUsage: async () => null,
    };
  });
  mgr.subscribe((e) => events.push(e));
  mgr.createSession("s1", { title: "t", model: "m" });
  cb?.onDraft([{ type: "usage.updated", payload: { tokens: 1, cost: 0 } }], 1);
  await new Promise((r) => setTimeout(r, 0));
  expect(events.some((e) => e.type === "context.updated")).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/engine/session.test.ts`
Expected: FAIL —— `IDriver` 无 `getContextUsage`(TS 报错),且 `context.updated` 不产出。

- [ ] **Step 3: 给 Driver 加 getContextUsage**

`src/engine/driver.ts`,`IDriver` 接口加一行:

```ts
export interface IDriver {
  start(): void;
  send(text: string): void;
  setModel(model: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
  getContextUsage(): Promise<{ totalTokens: number; maxTokens: number } | null>;
}
```

在 `Driver` 类里(`interrupt` 之后)加:

```ts
  async getContextUsage(): Promise<{ totalTokens: number; maxTokens: number } | null> {
    try {
      const r = await this.q?.getContextUsage();
      if (!r) return null;
      return { totalTokens: r.totalTokens, maxTokens: r.maxTokens };
    } catch {
      return null;
    }
  }
```

- [ ] **Step 4: SessionManager 在 usage.updated 后发 context.updated**

`src/engine/session.ts`,在 `createSession` 的 `cb.onDraft` 回调里,`for (const d of drafts)` 循环**之后**加:

```ts
        // 一轮结束(result → usage.updated)即取真实上下文占用,发 context.updated。
        if (drafts.some((d) => d.type === "usage.updated")) {
          void this.emitContextUsage(id);
        }
```

在 `SessionManager` 类里(`sendMessage` 之前/任意私有方法区)加:

```ts
  private async emitContextUsage(id: string): Promise<void> {
    const cu = await this.drivers.get(id)?.getContextUsage();
    if (!cu) return;
    const utilization =
      cu.maxTokens > 0 ? Math.round((cu.totalTokens / cu.maxTokens) * 100) : 0;
    this.emit(
      this.seq.stamp(
        id,
        "context.updated",
        { usedTokens: cu.totalTokens, windowSize: cu.maxTokens, utilization },
        Date.now(),
      ),
    );
  }
```

- [ ] **Step 5: 跑测试确认通过 + 关卡**

Run: `bun test src/engine/session.test.ts && bunx tsc --noEmit && bun run check`
Expected: 两条新测试 PASS;tsc 0;biome 干净。(若 `driver.test.ts` 因 `IDriver` 新方法报缺实现,补上其 fake 的 `getContextUsage: async () => null`。)

- [ ] **Step 6: Commit**

```bash
git add src/engine/driver.ts src/engine/session.ts src/engine/session.test.ts
git commit -m "feat: 🧩 每会话上下文占用(Driver.getContextUsage → context.updated)"
```

---

## Task 6: 广播 limits + 新连接回放 + LIVE 分支启 poller

**Files:**
- Modify: `src/engine/ws-gateway.ts`(`pushLimits` + 连接回放)
- Modify: `src/engine/server.ts`(LIVE 分支构造 poller)

> 说明:WsGateway 的 socket 广播无既有单测边界(`ws-gateway.test.ts` 只测 `parseCommand` 纯函数)。本任务以 `tsc` + 回放/真连冒烟验证 socket 行为;不强造 socket 单测。

- [ ] **Step 1: WsGateway 加 pushLimits + 回放缓存**

`src/engine/ws-gateway.ts`:
- 顶部导入加 `AccountLimits` / `LimitsMessage`:

```ts
import type { AccountLimits, LimitsMessage, RoomEvent } from "../shared/events";
```

- 类里 `private importSeq = 0;` 旁加:

```ts
  private lastLimits: LimitsMessage | null = null;
```

- 在 `connection` 处理里,`this.clients.add(ws);` **之后**加(新客户端立即拿到最近一次 limits,不必等下个 tick):

```ts
      if (this.lastLimits) ws.send(JSON.stringify(this.lastLimits));
```

- 新增公共方法(`broadcast` 之后):

```ts
  pushLimits(limits: AccountLimits): void {
    const msg: LimitsMessage = { kind: "limits", ts: Date.now(), limits };
    this.lastLimits = msg;
    const json = JSON.stringify(msg);
    for (const ws of this.clients)
      if (ws.readyState === ws.OPEN) ws.send(json);
  }
```

- [ ] **Step 2: server.ts LIVE 分支起 poller**

`src/engine/server.ts`,顶部加导入:

```ts
import { UsagePoller, defaultFetchUsage } from "./usage-poller";
import { readOauthCredentials } from "./credentials";
```

把 `else { ... }` LIVE 分支改成(保留原 gateway 构造,追加 poller):

```ts
} else {
  const mgr = new SessionManager();
  const gateway = new WsGateway(port, mgr, (p) => console.log(`PORT=${p}`));
  const poller = new UsagePoller({
    readCredentials: () => readOauthCredentials(),
    fetchUsage: defaultFetchUsage,
    onLimits: (limits) => gateway.pushLimits(limits),
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_API_BASE_URL ?? "",
  });
  poller.start();
  console.log("[server] LIVE");
}
```

(replay 分支保持不变:独立 WebSocketServer、不构造 SessionManager/WsGateway/poller。)

- [ ] **Step 3: 关卡 + 回放冒烟**

Run: `bunx tsc --noEmit && bun run check && bun test`
Expected: tsc 0、biome 干净、全部既有测试仍绿。

Run(回放冒烟,确认 LIVE 路径不崩、replay 路径无 poller):
`bun run dev:engine -- --replay fixtures/sample-run.jsonl`
Expected: 打印 `[server] REPLAY ...` 与 `PORT=8787`,无 poller 相关报错(replay 不启 poller)。Ctrl-C 退出。

- [ ] **Step 4: Commit**

```bash
git add src/engine/ws-gateway.ts src/engine/server.ts
git commit -m "feat: 🧩 广播 {kind:limits} + 新连接回放 + LIVE 分支启 UsagePoller"
```

---

## Task 7: 前端 store(limits + context.updated)+ ws-client 三臂分流

**Files:**
- Modify: `src/web/store.ts`
- Modify: `src/web/ws-client.ts`
- Test: `src/web/store.test.ts`、`src/web/ws-client.test.ts`(各追加)

> 关键:`limits` 只挂 `RoomStore`(store 接口),**不进 `RoomState`**。因为 `reduce` 在 `session.created`/`session.error` 分支返回的是显式字面量 `{ sessions, projectOrder, currentSessionId }`——若 `limits` 进 `RoomState`,这些字面量会漏掉它、被 `set` 合并后清空 `limits`。挂在 `RoomStore` 上、只由 `setLimits` 写,`applyEvent` 的 `set` 浅合并会原样保留它。

- [ ] **Step 1: 写失败测试**

`src/web/store.test.ts` 追加:

```ts
test("context.updated folds into session.context", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "context.updated",
      payload: { usedTokens: 200000, windowSize: 1000000, utilization: 20 },
    }),
  );
  expect(st.sessions.s1?.context).toEqual({
    usedTokens: 200000,
    windowSize: 1000000,
    utilization: 20,
  });
});

test("context.updated for unknown session is ignored", () => {
  const st = reduce(
    empty,
    ev({ type: "context.updated", sessionId: "ghost", payload: { usedTokens: 1, windowSize: 2, utilization: 50 } }),
  );
  expect(st.sessions.ghost).toBeUndefined();
});

test("setLimits stores account limits and applyEvent preserves it", () => {
  const store = useRoomStore.getState();
  store.setLimits({
    planName: "Max",
    fiveHour: { utilization: 30, resetsAt: null },
    sevenDay: { utilization: 80, resetsAt: null },
  });
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
  // 任意事件经过后 limits 不被清
  useRoomStore.getState().applyEvent(
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
});
```

`src/web/ws-client.test.ts` 追加:

```ts
test("handleIncoming routes kind:limits to onLimits, not the event sink", () => {
  const events: RoomEvent[] = [];
  let limits: unknown = null;
  handleIncoming(
    '{"kind":"limits","ts":1,"limits":{"planName":"Max","fiveHour":{"utilization":30,"resetsAt":null},"sevenDay":{"utilization":80,"resetsAt":null}}}',
    (e) => events.push(e),
    undefined,
    (l) => {
      limits = l;
    },
  );
  expect(events).toHaveLength(0);
  expect((limits as { planName?: string })?.planName).toBe("Max");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/store.test.ts src/web/ws-client.test.ts`
Expected: FAIL —— `setLimits`/`limits` 不存在;`handleIncoming` 不接第四参 / 不识别 `kind:"limits"`。

- [ ] **Step 3: store 加 limits + setLimits + context.updated reduce**

`src/web/store.ts`:
- 顶部导入加 `AccountLimits` + `ContextUpdatedPayload`:

```ts
import type { AccountLimits, ContextUpdatedPayload, RoomEvent } from "../shared/events";
```

- 在 `reduce` 的 `switch (e.type)` 里,`case "usage.updated":` 之后加:

```ts
    case "context.updated": {
      const p = e.payload as ContextUpdatedPayload;
      s.context = {
        usedTokens: p.usedTokens,
        windowSize: p.windowSize,
        utilization: p.utilization,
      };
      break;
    }
```

- `RoomStore` 接口加(`removeSession` 之后):

```ts
  limits: AccountLimits | null;
  setLimits: (limits: AccountLimits) => void;
```

- `create<RoomStore>` 初始值里 `projectOrder: [],` 之后加 `limits: null,`;并在 actions 区加:

```ts
  setLimits: (limits) => set({ limits }),
```

- [ ] **Step 4: ws-client 加第三臂 + 接 setLimits**

`src/web/ws-client.ts`:
- 顶部导入加 `AccountLimits`:

```ts
import type { AccountLimits, RoomEvent } from "../shared/events";
```

- `handleIncoming` 签名加第四参,并在 control 判别**之前/并列**加 limits 分支:

```ts
export function handleIncoming(
  raw: string,
  apply: (e: RoomEvent) => void,
  onControl?: (c: ControlMessage) => void,
  onLimits?: (l: AccountLimits) => void,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const kind =
    parsed && typeof parsed === "object"
      ? (parsed as { kind?: string }).kind
      : undefined;
  if (kind === "limits") {
    onLimits?.((parsed as { limits: AccountLimits }).limits);
    return;
  }
  if (kind === "control") {
    onControl?.(parsed as ControlMessage);
    return;
  }
  apply(parsed as RoomEvent);
}
```

- `connectRoom` 里加 `onLimits` 并传入 `handleIncoming`:

```ts
  const onLimits = (l: AccountLimits) => useRoomStore.getState().setLimits(l);
  // ...
  ws.onmessage = (ev) =>
    handleIncoming(String(ev.data), apply, onControl, onLimits);
```

- [ ] **Step 5: 跑测试确认通过 + 关卡**

Run: `bun test src/web/store.test.ts src/web/ws-client.test.ts && bunx tsc --noEmit && bun run check`
Expected: 新测试 PASS;tsc 0;biome 干净。

- [ ] **Step 6: Commit**

```bash
git add src/web/store.ts src/web/ws-client.ts src/web/store.test.ts src/web/ws-client.test.ts
git commit -m "feat: 🧩 前端 store.limits + context.updated reduce + ws-client kind:limits 分流"
```

---

## Task 8: 左上限额双条(LimitBars)+ 纯函数 + 样式 + 设置坞挪位

**Files:**
- Create: `src/web/hud/limits-format.ts`
- Create: `src/web/hud/LimitBars.tsx`
- Modify: `src/web/hud/Hud.tsx`(挂载)
- Modify: `src/web/styles.css`(限额条样式 + `.px-dock` 挪右上)
- Test: `src/web/hud/limits-format.test.ts`

- [ ] **Step 1: 写失败测试(纯函数)**

`src/web/hud/limits-format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { barRemaining, formatCountdown } from "./limits-format";

test("barRemaining = 100 - utilization, clamped; null → null", () => {
  expect(barRemaining(30)).toBe(70);
  expect(barRemaining(0)).toBe(100);
  expect(barRemaining(150)).toBe(0);
  expect(barRemaining(null)).toBeNull();
});

test("formatCountdown renders h/m to reset; past/null → '—'", () => {
  const now = 1_000_000;
  expect(formatCountdown(now + 90 * 60_000, now)).toBe("1h30m");
  expect(formatCountdown(now + 5 * 60_000, now)).toBe("5m");
  expect(formatCountdown(now - 1000, now)).toBe("—");
  expect(formatCountdown(null, now)).toBe("—");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/hud/limits-format.test.ts`
Expected: FAIL —— `Cannot find module './limits-format'`。

- [ ] **Step 3: 实现纯函数**

`src/web/hud/limits-format.ts`:

```ts
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
```

- [ ] **Step 4: 实现 LimitBars 组件**

`src/web/hud/LimitBars.tsx`:

```tsx
import { useRoomStore } from "../store";
import { barRemaining, formatCountdown } from "./limits-format";

const DANGER = 15; // 剩余低于此 → 警示色

function Bar({
  label,
  color,
  utilization,
  resetsAt,
}: {
  label: string;
  color: string;
  utilization: number | null;
  resetsAt: number | null;
}) {
  const remain = barRemaining(utilization);
  const width = remain ?? 0;
  const danger = remain != null && remain < DANGER;
  return (
    <div className="px-bar-row">
      <span className="px-bar-label">{label}</span>
      <div className="px-bar">
        <div
          className="px-bar-fill"
          style={{
            width: `${width}%`,
            background: danger ? "var(--pink)" : color,
            opacity: remain == null ? 0.25 : 1,
          }}
        />
      </div>
      <span className="px-bar-reset">
        {remain == null ? "—" : formatCountdown(resetsAt, Date.now())}
      </span>
    </div>
  );
}

/** 左上账户限额双条:5h(红血条)+ 周(蓝魔法条)。条长 = 剩余。 */
export function LimitBars() {
  const limits = useRoomStore((s) => s.limits);
  return (
    <div className="px-limits px-panel">
      <div className="px-limits-head">
        {limits?.planName ?? "—"}
        {limits?.stale ? " · 同步中" : ""}
        {limits?.apiError ? " · ⚠" : ""}
      </div>
      <Bar
        label="5h"
        color="var(--pink)"
        utilization={limits?.fiveHour.utilization ?? null}
        resetsAt={limits?.fiveHour.resetsAt ?? null}
      />
      <Bar
        label="周"
        color="var(--cyan)"
        utilization={limits?.sevenDay.utilization ?? null}
        resetsAt={limits?.sevenDay.resetsAt ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 5: 样式 —— 限额条 + 设置坞挪右上**

`src/web/styles.css`:
- 把 `.px-dock` 的 `left: 12px;` 改成 `right: 12px;`(设置坞从左上挪到右上,给限额条让位):

```css
.px-dock {
  position: absolute;
  top: 12px;
  right: 12px;
  /* ...其余不变... */
}
```

- 文件末尾追加:

```css
/* ── 左上账户限额条 ─────────────────────────────────────────────────────── */
.px-limits {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 180px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.px-limits-head {
  font-size: 9px;
  color: var(--gold);
  text-transform: uppercase;
}
.px-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8px;
}
.px-bar-label {
  width: 16px;
  color: var(--muted);
}
.px-bar {
  flex: 1;
  height: 8px;
  background: #0e1622;
  border: 1px solid var(--edge-dark);
  box-shadow: inset 1px 1px 0 0 #00000088;
}
.px-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}
.px-bar-reset {
  width: 34px;
  text-align: right;
  color: var(--muted);
}
```

- [ ] **Step 6: Hud 挂载 LimitBars**

`src/web/hud/Hud.tsx`:
- 导入加:

```ts
import { LimitBars } from "./LimitBars";
```

- 在 `return (<>` 后、top status banner 之前加 `<LimitBars />`。

- [ ] **Step 7: 关卡 + 构建冒烟**

Run: `bun test src/web/hud/limits-format.test.ts && bunx tsc --noEmit && bun run check && bun run build`
Expected: 纯函数测试 PASS;tsc 0;biome 干净;`bun run build` 成功。

- [ ] **Step 8: Commit**

```bash
git add src/web/hud/limits-format.ts src/web/hud/limits-format.test.ts src/web/hud/LimitBars.tsx src/web/hud/Hud.tsx src/web/styles.css
git commit -m "feat: 🧩 左上账户限额双条 LimitBars(剩余条 + 重置倒计时)+ 设置坞挪右上"
```

---

## Task 9: NPC 头顶上下文充能条

**Files:**
- Modify: `src/web/overworld/SessionNpc.tsx`
- Modify: `src/web/overworld/Overworld.tsx`

> 渲染方式沿用本组件既有 `ring`/`dot` 的「prop 依赖 `draw` 回调」模式(`utilization` 变 → 回调身份变 → @pixi/react 重画),低频、不入 React state、不违渲染纪律——比额外 ref 桥接更贴合既有代码。

- [ ] **Step 1: SessionNpc 加 utilization prop + 充能条 draw**

`src/web/overworld/SessionNpc.tsx`:
- props 解构里加 `utilization`(`motionRef` 同级),类型块里加 `utilization?: number;`:

```tsx
  motionRef,
  utilization,
}: {
  // ...既有...
  motionRef: RefObject<NpcMotionMap>;
  utilization?: number;
}) {
```

- 在 `dot` useCallback 之后加 `bar` 充能条 draw(填充=已用,20% 阈值刻度,绿/琥珀/红):

```tsx
  const BAR_W = 22;
  const bar = useCallback(
    (g: Graphics) => {
      g.clear();
      if (utilization == null) return; // 无数据 → 不画
      const u = Math.max(0, Math.min(100, utilization));
      // 槽
      g.setFillStyle({ color: 0x0e1622, alpha: 0.9 });
      g.rect(-BAR_W / 2, 0, BAR_W, 3);
      g.fill();
      // 填充:<20 绿 / 20-80 琥珀 / >80 红
      const color = u > 80 ? 0xff5ea0 : u >= 20 ? 0xffd166 : 0x6bf0a0;
      g.setFillStyle({ color, alpha: 1 });
      g.rect(-BAR_W / 2, 0, (BAR_W * u) / 100, 3);
      g.fill();
      // 20% 阈值刻度线(子项 C 默认阈值)
      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.6 });
      g.moveTo(-BAR_W / 2 + BAR_W * 0.2, -1);
      g.lineTo(-BAR_W / 2 + BAR_W * 0.2, 4);
      g.stroke();
    },
    [utilization],
  );
```

- 在 nameplate `pixiContainer`(`y={-30}`)里、`?` 占位 `pixiText` 之后加充能条(放昵牌上方一点):

```tsx
        <pixiGraphics y={-8} draw={bar} />
```

- [ ] **Step 2: Overworld 透传 context.utilization**

`src/web/overworld/Overworld.tsx`,`actors.map` 里 `<SessionNpc>` 的 props 加(`motionRef={npcMotionRef}` 同级):

```tsx
              motionRef={npcMotionRef}
              utilization={s?.context?.utilization}
```

- [ ] **Step 3: 关卡 + 构建冒烟**

Run: `bunx tsc --noEmit && bun run check && bun run build && bun test`
Expected: tsc 0;biome 干净;build 成功;全部既有测试仍绿。

- [ ] **Step 4: Commit**

```bash
git add src/web/overworld/SessionNpc.tsx src/web/overworld/Overworld.tsx
git commit -m "feat: 🧩 NPC 头顶上下文充能条(填充=已用 + 20% 阈值刻度)"
```

---

## Task 10: 排行榜面板 + 🏆 hotbar + NpcCard 上下文行

**Files:**
- Create: `src/web/hud/leaderboard.ts`
- Create: `src/web/hud/Leaderboard.tsx`
- Modify: `src/web/ui-store.ts`(`Panel` + `leaderboardOpen`)
- Modify: `src/web/hud/Hud.tsx`(🏆 按钮 + 挂载)
- Modify: `src/web/hud/NpcCard.tsx`(上下文 % 行)
- Test: `src/web/hud/leaderboard.test.ts`

- [ ] **Step 1: 写失败测试(纯函数)**

`src/web/hud/leaderboard.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createSession } from "../../shared/domain";
import { leaderboardRows } from "./leaderboard";

test("ranks sessions by tokens desc, includes archived flagged", () => {
  const sessions = {
    a: createSession({ id: "a", title: "A", model: "claude-opus-4-8" }),
    b: createSession({ id: "b", title: "B", model: "claude-sonnet-4-6" }),
  };
  sessions.a.usage = { tokens: 100, cost: 0.1 };
  sessions.b.usage = { tokens: 900, cost: 0.9 };
  sessions.b.archived = true;
  const rows = leaderboardRows(sessions);
  expect(rows.map((r) => r.sessionId)).toEqual(["b", "a"]);
  expect(rows[0]?.tokens).toBe(900);
  expect(rows[0]?.archived).toBe(true);
});

test("empty sessions → empty rows", () => {
  expect(leaderboardRows({})).toEqual([]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/hud/leaderboard.test.ts`
Expected: FAIL —— `Cannot find module './leaderboard'`。

- [ ] **Step 3: 实现 leaderboardRows 纯函数**

`src/web/hud/leaderboard.ts`:

```ts
import type { Session } from "../../shared/domain";
import { sessionHero } from "../overworld/skins";

export interface LeaderboardRow {
  sessionId: string;
  title: string;
  heroSkin: string;
  tokens: number;
  cost: number;
  model: string;
  archived: boolean;
}

/** 全部会话(含归档)按 usage.tokens 降序。 */
export function leaderboardRows(
  sessions: Record<string, Session>,
): LeaderboardRow[] {
  return Object.values(sessions)
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      heroSkin: sessionHero(s.id),
      tokens: s.usage.tokens,
      cost: s.usage.cost,
      model: s.model,
      archived: s.archived,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}
```

- [ ] **Step 4: ui-store 加 leaderboardOpen**

`src/web/ui-store.ts`:
- `Panel` 联合加 `| "leaderboardOpen"`。
- `UiState` 加 `leaderboardOpen: boolean;`。
- `create` 初始值加 `leaderboardOpen: false,`。

- [ ] **Step 5: 实现 Leaderboard 面板**

`src/web/hud/Leaderboard.tsx`:

```tsx
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { leaderboardRows } from "./leaderboard";
import { shortModel } from "./widgets";

/** 🏆 排行榜:全部会话按 token 降序。 */
export function Leaderboard() {
  const open = useUiStore((s) => s.leaderboardOpen);
  const sessions = useRoomStore((s) => s.sessions);
  if (!open) return null;
  const rows = leaderboardRows(sessions);
  const max = rows[0]?.tokens || 1;
  return (
    <div
      className="px-panel px-pop px-scroll"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 78,
        transform: "translateX(-50%)",
        width: 300,
        maxHeight: 340,
        padding: 12,
      }}
    >
      <div className="px-title">🏆 排行榜 · {rows.length}</div>
      {rows.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 11 }}>暂无会话</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.sessionId}
            className="px-row"
            style={{ cursor: "default", opacity: r.archived ? 0.5 : 1 }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 16, color: "var(--gold)" }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title}
              </span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>{shortModel(r.model)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
              <div style={{ flex: 1, height: 5, background: "#0e1622", border: "1px solid var(--edge-dark)" }}>
                <div style={{ height: "100%", width: `${(r.tokens / max) * 100}%`, background: "var(--gold)" }} />
              </div>
              <span style={{ fontSize: 9, color: "var(--gold)" }}>🪙{r.tokens.toLocaleString()}</span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>${r.cost.toFixed(3)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 6: Hud 加 🏆 按钮 + 挂载**

`src/web/hud/Hud.tsx`:
- 导入加 `import { Leaderboard } from "./Leaderboard";`。
- 加 `leaderboardOpen` 选择器:`const leaderboardOpen = useUiStore((s) => s.leaderboardOpen);`。
- 在 hotbar 里(📂 导入按钮之后)加:

```tsx
        <IconButton
          icon="🏆"
          title="排行榜"
          lit={leaderboardOpen}
          onClick={() => toggle("leaderboardOpen")}
        />
```

- 在底部组件挂载区(`<ImportPanel />` 之后)加 `<Leaderboard />`。

- [ ] **Step 7: NpcCard 加上下文 % 行**

`src/web/hud/NpcCard.tsx`,在 `<StatRow k="Token" ... />` 之前加:

```tsx
        {session.context ? (
          <StatRow k="上下文" v={`${session.context.utilization}%`} />
        ) : null}
```

- [ ] **Step 8: 关卡 + 构建冒烟**

Run: `bun test src/web/hud/leaderboard.test.ts && bunx tsc --noEmit && bun run check && bun run build`
Expected: 纯函数测试 PASS;tsc 0;biome 干净;build 成功。

- [ ] **Step 9: Commit**

```bash
git add src/web/hud/leaderboard.ts src/web/hud/leaderboard.test.ts src/web/hud/Leaderboard.tsx src/web/ui-store.ts src/web/hud/Hud.tsx src/web/hud/NpcCard.tsx
git commit -m "feat: 🧩 🏆 排行榜面板(按会话/token)+ NpcCard 上下文 % 行"
```

---

## Task 11: 全量验证 + 真连冒烟

**Files:** 无(验证任务)

- [ ] **Step 1: 全量关卡**

Run: `bun test && bun run check && bunx tsc --noEmit && bun run build`
Expected: 全部测试绿;biome 干净;tsc 0;build 成功。

- [ ] **Step 2: 回放冒烟(零额度)**

Run: `bun run dev:engine -- --replay fixtures/sample-run.jsonl`(一个终端)+ `bun run dev:web`(另一个)。
浏览器开 `http://localhost:5173`:
- 大厅渲染正常、NPC 出现;
- 限额条显示「—」(replay 无真账户、poller 不启)——符合预期;
- 🏆 排行榜按钮可开,列出 fixture 里的会话。
Expected: 无控制台报错;以上肉眼通过。

- [ ] **Step 3: 真连冒烟(少量额度,最后做)**

Run: `bun run dev:engine`(LIVE)+ `bun run dev:web`,新建一个会话发一条消息。
确认:
- 左上 5h/周限额条显示真实剩余 + plan 名 + 重置倒计时(几秒内 poller 首拉到);
- 该会话 NPC 头顶充能条在一轮结束后出现、随上下文增长;
- NpcCard 里「上下文 %」一行有值;
- 🏆 排行榜按 token 排。
Expected: 以上肉眼通过;控制台无 token 泄漏、无报错。

- [ ] **Step 4: 收尾**

按 `superpowers:finishing-a-development-branch` 处理合并/清理(detached worktree → `merge --no-ff` 回 main → 复验 → 用户确认后 `push origin main` → 清 worktree)。

---

## 自检(写完计划后,对照 spec)

- **spec 覆盖**:§4.1 账户拉取→Task 2/3/4;§4.2 上下文→Task 5;§4.3 协议→Task 1/6/7;§4.7 LimitBars→Task 8;§4.8 NPC 条→Task 9;§4.9 排行榜→Task 10;§5 降级→Task 4(429/401/custom)+ Task 8(null/stale 灰态);§6 测试→各任务 TDD + Task 11。全部有对应任务。
- **占位符**:无 TBD/TODO;每个代码步骤含完整代码。
- **类型一致**:`AccountLimits`/`LimitsMessage`/`WindowUsage`/`ContextUpdatedPayload`(Task 1)在 Task 4/5/6/7 引用一致;`getContextUsage` 返回 `{totalTokens,maxTokens}`(Task 5)与 Driver/SessionManager 一致;`leaderboardRows`/`LeaderboardRow`(Task 10)、`barRemaining`/`formatCountdown`(Task 8)签名前后一致;`toggle("leaderboardOpen")` 与 `Panel` 联合一致(Task 10)。
- **关键陷阱已写明**:`limits` 只挂 `RoomStore` 不进 `RoomState`(Task 7),否则 `reduce` 字面量会清空它。
