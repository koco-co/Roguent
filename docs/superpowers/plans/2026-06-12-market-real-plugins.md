# MARKET 接真(展示 + 真实安装/启用)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把插件市场面板(`Market.tsx`)从整面板 mock 接到本机 `~/.claude/plugins` 真实插件目录(~226 条),并让按钮通过 `claude plugin` CLI 真改本机全局配置。

**Architecture:** 引擎新增 `plugins/` 模块:`catalog.ts` 纯函数读 5 文件合并出 `PluginEntry[]`,`service.ts` 串行 shell out CLI 做 install/enable/disable/uninstall。下行走非 seq 的 `PluginsMessage`(照搬 `LimitsMessage`/`pushLimits` 样板,连入即重放 + mutation 后广播),上行走 `cmd:"plugins"` 命令。前端 store 加 `plugins`/`pluginsBusy`,`Market.tsx` 渲染真实数据并接按钮。

**Tech Stack:** Bun + TypeScript(`noUncheckedIndexedAccess`)、ws、React 19 + Zustand、`bun:test`、Biome。

**依据**:spec `docs/superpowers/specs/2026-06-12-market-real-plugins-design.md`(commit `43d29eb`);基线 `main` commit `7129b73`。

---

## 文件结构

**新增(引擎)**
- `src/engine/plugins/paths.ts` — `claudeConfigDir()` 解析(复用既有模式)。
- `src/engine/plugins/catalog.ts` — 纯函数读 5 文件 → 合并 → 分类 → `PluginEntry[]`。
- `src/engine/plugins/catalog.test.ts` — fixture 目录单测。
- `src/engine/plugins/service.ts` — `createPluginsService`:串行 CLI runner + 校验 + 超时,`snapshot()` 复用 catalog。
- `src/engine/plugins/service.test.ts` — 注入假 runner 单测。
- `tests/fixtures/plugins/` — catalog 单测用的假 configDir(由 Task 3 创建)。

**修改(共享协议)**
- `src/shared/events.ts` — 加 `PluginEntry` / `PluginActionState` / `PluginsMessage` 类型。
- `src/shared/commands.ts` — 加 `PluginsCommand`、并入 `ClientCommand` union、`parsePluginsCommand` + dispatch。

**修改(引擎接线)**
- `src/engine/ws-gateway.ts` — `GatewayPluginsService` 接口、`options.plugins`、`lastPlugins`、`pushPlugins()`、`handlePluginsCommand()`、connect 重放、onCommand 分支。
- `src/engine/server.ts` — 构造 service、注入 gateway、启动时广播初始快照。

**修改(前端)**
- `src/web/store.ts` — `plugins` / `pluginsBusy` 状态 + `setPlugins`。
- `src/web/ws-client.ts` — `kind:"plugins"` 分支 + `onPlugins`。
- `src/web/hud/Market.tsx` — 渲染真实数据 + 按钮接线 + pending。
- `src/web/hud/shop-data.ts` — 退役 `SHOP_PLUGINS` / `SHOP_CATS`(保留 `SHOP_ITEMS` / `SHOP_GEMS`)。
- `src/web/i18n.ts` — 新增状态 / 提示文案。
- `docs/ROADMAP.md` — §3.6 把「Market 整面板 mock」改为接真现状。

---

## Task 1: 可行性探针(手动,无 TDD)

**目的**:实现真实 mutation 前,先确认 `claude plugin` 在非交互(非 TTY)下不弹提示,并确认 install 是否顺带 enable。结论回写 spec §3。

**Files:** 无(只跑命令 + 回写 spec 文字)。

- [ ] **Step 1: 选一个当前已启用、可安全 toggle 的插件**

Run:
```bash
claude plugin list < /dev/null 2>&1 | grep -A2 "context7@claude-plugins-official"
```
Expected: 显示 `Status: ✔ enabled`(选 `context7@claude-plugins-official` 作探针对象,可复原)。

- [ ] **Step 2: 非交互 disable → 再 enable 复原,确认 exit 0 不阻塞**

Run:
```bash
claude plugin disable context7@claude-plugins-official --scope user < /dev/null; echo "disable exit=$?"
claude plugin enable  context7@claude-plugins-official --scope user < /dev/null; echo "enable  exit=$?"
```
Expected: 两条都 `exit=0`,无交互卡住;结束后该插件回到 enabled。

- [ ] **Step 3: 确认 install 是否顺带 enable**

Run:
```bash
claude plugin install --help 2>&1 | grep -i "enable\|no-enable"
```
Expected:install 帮助里**无** `--no-enable` 类开关 → 佐证 install 默认 enable(本机已装插件在 `enabledPlugins` 中皆为 true 也佐证)。

- [ ] **Step 4: 回写 spec 结论**

把结论(非交互可用 / install 是否顺带 enable / 若某 op 需交互则回落「复制命令」)写进 spec §3 的「可行性风险」段(改文字即可),`git add` + commit:
```bash
git add docs/superpowers/specs/2026-06-12-market-real-plugins-design.md
git commit -m "docs: 📝 record plugin CLI feasibility probe conclusion"
```

---

## Task 2: 协议类型(events.ts + commands.ts)

**Files:**
- Modify: `src/shared/events.ts`(在 `LimitsMessage` 块之后追加)
- Modify: `src/shared/commands.ts`(union + parse + dispatch)
- Test: `src/shared/commands.test.ts`(若不存在则创建)

- [ ] **Step 1: 写 parse 失败/成功测试(先红)**

定位测试文件:`rg -l "parseClientCommand" src/shared/*.test.ts`;若有就在其中追加,否则 Create `src/shared/commands.test.ts`:
```ts
import { expect, test } from "bun:test";
import { parseClientCommand } from "./commands";

test("plugins command: 合法 install 解析通过", () => {
  const r = parseClientCommand(
    JSON.stringify({ cmd: "plugins", action: "install", pluginId: "context7@claude-plugins-official" }),
  );
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.command).toEqual({
    cmd: "plugins",
    action: "install",
    pluginId: "context7@claude-plugins-official",
  });
});

test("plugins command: 非法 action 被拒", () => {
  const r = parseClientCommand(
    JSON.stringify({ cmd: "plugins", action: "frobnicate", pluginId: "x@y" }),
  );
  expect(r.ok).toBe(false);
});

test("plugins command: 空 pluginId 被拒", () => {
  const r = parseClientCommand(JSON.stringify({ cmd: "plugins", action: "enable", pluginId: "   " }));
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test src/shared/commands.test.ts`
Expected: FAIL(`parsePluginsCommand` 未定义 / dispatch 无 `plugins` 分支)。

- [ ] **Step 3: 在 events.ts 追加协议类型**

在 `src/shared/events.ts` 的 `LimitsMessage` 接口(约 335-339 行)之后追加:
```ts
export type PluginComponentType = "MCP" | "Skills" | "插件";

export interface PluginEntry {
  id: string; // "<name>@<marketplace>"
  name: string; // displayName || name
  marketplace: string;
  author: string | null;
  description: string;
  category: string | null; // manifest category(development/security/…)
  componentType: PluginComponentType; // 主类型(mcp 优先 → skills → 插件)
  hasMcp: boolean;
  hasSkills: boolean;
  installs: number | null; // unique_installs;无 catalog → null
  installed: boolean;
  enabled: boolean;
}

export type PluginActionPhase =
  | "installing"
  | "enabling"
  | "disabling"
  | "uninstalling";

export interface PluginActionState {
  id: string;
  phase: PluginActionPhase;
}

export interface PluginsMessage {
  kind: "plugins";
  ts: number;
  plugins: PluginEntry[];
  busy: PluginActionState[];
}
```

- [ ] **Step 4: 在 commands.ts 加 PluginsCommand + union + parse + dispatch**

(a) 在 `SettingsCommand` 接口(约 200 行)之后追加:
```ts
export interface PluginsCommand {
  cmd: "plugins";
  action: "install" | "enable" | "disable" | "uninstall";
  pluginId: string;
}

export const PLUGIN_ACTIONS = [
  "install",
  "enable",
  "disable",
  "uninstall",
] as const satisfies readonly PluginsCommand["action"][];
```

(b) 把 `PluginsCommand` 并入 `ClientCommand` union(约 221 行,`| SettingsCommand;` 改为):
```ts
  | SettingsCommand
  | PluginsCommand;
```

(c) 在 `parseClientCommand` 的主 switch(约 353 行 `case "settings"` 之后)加:
```ts
    case "plugins":
      return parsePluginsCommand(o);
```

(d) 在 `parseEconomyCommand` 之后追加解析函数:
```ts
function parsePluginsCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.action === "string" &&
    (PLUGIN_ACTIONS as readonly string[]).includes(o.action) &&
    typeof o.pluginId === "string" &&
    o.pluginId.trim()
  ) {
    return {
      ok: true,
      command: {
        cmd: "plugins",
        action: o.action as PluginsCommand["action"],
        pluginId: o.pluginId,
      },
    };
  }
  return fail("Invalid plugins command", sessionIdOf(o));
}
```

- [ ] **Step 5: 跑测试确认绿 + 类型**

Run: `bun test src/shared/commands.test.ts && bunx tsc --noEmit`
Expected: PASS;tsc 无错。

- [ ] **Step 6: Commit**

```bash
git add src/shared/events.ts src/shared/commands.ts src/shared/commands.test.ts
git commit -m "feat: 🧩 plugins protocol — PluginsMessage + cmd:plugins parse"
```

---

## Task 3: catalog 读取/合并(纯函数 + fixture 单测)

**Files:**
- Create: `src/engine/plugins/paths.ts`
- Create: `src/engine/plugins/catalog.ts`
- Create: `src/engine/plugins/catalog.test.ts`
- Create fixture: `tests/fixtures/plugins/<configDir>/…`(见 Step 1)

- [ ] **Step 1: 造 fixture configDir(假本机目录)**

按真实布局造最小 fixture。Create 文件:

`tests/fixtures/plugins/cfg/plugins/known_marketplaces.json`:
```json
{
  "official": {
    "source": { "source": "github", "repo": "anthropics/claude-plugins-official" },
    "installLocation": "tests/fixtures/plugins/cfg/plugins/marketplaces/official"
  },
  "tide": {
    "source": { "source": "github", "repo": "koco-co/tide" },
    "installLocation": "tests/fixtures/plugins/cfg/plugins/marketplaces/tide"
  }
}
```

`tests/fixtures/plugins/cfg/plugins/marketplaces/official/.claude-plugin/marketplace.json`:
```json
{
  "name": "official",
  "plugins": [
    { "name": "alpha-mcp", "displayName": "Alpha MCP", "description": "An MCP plugin.", "author": { "name": "anthropic" }, "category": "development" },
    { "name": "beta-skill", "description": "A skill plugin.", "author": { "name": "community" }, "category": "testing", "skills": [{ "name": "beta" }] },
    { "name": "gamma-cmd", "description": "A command plugin.", "author": { "name": "studio" }, "category": "productivity" }
  ]
}
```

`tests/fixtures/plugins/cfg/plugins/marketplaces/tide/.claude-plugin/marketplace.json`:
```json
{
  "name": "tide",
  "plugins": [
    { "name": "tide", "description": "Tide plugin.", "author": { "name": "koco" } }
  ]
}
```

`tests/fixtures/plugins/cfg/plugins/plugin-catalog-cache.json`:
```json
{
  "version": 1,
  "catalog": {
    "plugins": {
      "alpha-mcp@official": { "plugin": "alpha-mcp", "unique_installs": 1000, "components": { "commands": [], "agents": [], "skills": [], "hooks": [], "mcpServers": [{ "name": "alpha" }], "lspServers": [] } },
      "beta-skill@official": { "plugin": "beta-skill", "unique_installs": 500, "components": { "commands": [], "agents": [], "skills": [{ "name": "beta" }], "hooks": [], "mcpServers": [], "lspServers": [] } },
      "gamma-cmd@official": { "plugin": "gamma-cmd", "unique_installs": 250, "components": { "commands": [{ "name": "g" }], "agents": [], "skills": [], "hooks": [], "mcpServers": [], "lspServers": [] } }
    }
  }
}
```

`tests/fixtures/plugins/cfg/plugins/installed_plugins.json`:
```json
{ "version": 2, "plugins": { "alpha-mcp@official": [{ "scope": "user" }], "beta-skill@official": [{ "scope": "user" }] } }
```

`tests/fixtures/plugins/cfg/settings.json`:
```json
{ "enabledPlugins": { "alpha-mcp@official": true } }
```

(注:`beta-skill` 已安装但未启用 → 测「已停用」态;`alpha-mcp` 已装且启用;`gamma-cmd`/`tide` 未安装;`tide` 无 catalog → installs=null。)

- [ ] **Step 2: 写 catalog 单测(先红)**

Create `src/engine/plugins/catalog.test.ts`:
```ts
import { expect, test } from "bun:test";
import { readPluginCatalog } from "./catalog";

const CFG = "tests/fixtures/plugins/cfg";

function byId(id: string) {
  return readPluginCatalog({ configDir: CFG }).find((p) => p.id === id);
}

test("合并出全部市场的插件(official 3 + tide 1)", () => {
  const all = readPluginCatalog({ configDir: CFG });
  expect(all.length).toBe(4);
  expect(all.map((p) => p.id).sort()).toEqual(
    ["alpha-mcp@official", "beta-skill@official", "gamma-cmd@official", "tide@tide"].sort(),
  );
});

test("alpha-mcp:已装已启用、MCP 类型、真实安装数、displayName 优先", () => {
  const p = byId("alpha-mcp@official");
  expect(p).toBeDefined();
  expect(p?.name).toBe("Alpha MCP");
  expect(p?.marketplace).toBe("official");
  expect(p?.author).toBe("anthropic");
  expect(p?.category).toBe("development");
  expect(p?.componentType).toBe("MCP");
  expect(p?.hasMcp).toBe(true);
  expect(p?.installs).toBe(1000);
  expect(p?.installed).toBe(true);
  expect(p?.enabled).toBe(true);
});

test("beta-skill:已装未启用 → installed=true enabled=false、Skills 类型", () => {
  const p = byId("beta-skill@official");
  expect(p?.componentType).toBe("Skills");
  expect(p?.hasSkills).toBe(true);
  expect(p?.installed).toBe(true);
  expect(p?.enabled).toBe(false);
});

test("gamma-cmd:纯命令 → 插件 类型、未安装", () => {
  const p = byId("gamma-cmd@official");
  expect(p?.componentType).toBe("插件");
  expect(p?.hasMcp).toBe(false);
  expect(p?.hasSkills).toBe(false);
  expect(p?.installed).toBe(false);
});

test("tide:无 catalog → installs=null,回落 name", () => {
  const p = byId("tide@tide");
  expect(p?.name).toBe("tide");
  expect(p?.installs).toBeNull();
});

test("缺文件容错:不存在的 configDir 返回空数组不抛", () => {
  expect(readPluginCatalog({ configDir: "tests/fixtures/plugins/__missing__" })).toEqual([]);
});
```

- [ ] **Step 3: 跑测试确认红**

Run: `bun test src/engine/plugins/catalog.test.ts`
Expected: FAIL(`./catalog` 模块不存在)。

- [ ] **Step 4: 实现 paths.ts**

Create `src/engine/plugins/paths.ts`:
```ts
import { homedir } from "node:os";
import { join } from "node:path";

/** Claude 配置目录:CLAUDE_CONFIG_DIR(若设)否则 ~/.claude。与 credentials.ts 同源。 */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
}
```

- [ ] **Step 5: 实现 catalog.ts**

Create `src/engine/plugins/catalog.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginComponentType, PluginEntry } from "../../shared/events";

/** 注入式文本读取(默认读真盘,缺失/失败返回 null);测试可覆写。 */
export type ReadText = (path: string) => string | null;

const defaultReadText: ReadText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

function readJson<T>(readText: ReadText, path: string): T | null {
  const raw = readText(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface ManifestPlugin {
  name?: unknown;
  displayName?: unknown;
  description?: unknown;
  author?: { name?: unknown } | unknown;
  category?: unknown;
  skills?: unknown;
}
interface CatalogComponents {
  skills?: unknown[];
  mcpServers?: unknown[];
}
interface CatalogEntry {
  unique_installs?: unknown;
  components?: CatalogComponents;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function authorName(a: ManifestPlugin["author"]): string | null {
  if (a && typeof a === "object" && "name" in a) return str((a as { name?: unknown }).name);
  return str(a);
}

function classify(
  catalog: CatalogEntry | undefined,
  manifest: ManifestPlugin,
): { hasMcp: boolean; hasSkills: boolean; componentType: PluginComponentType } {
  // catalog.components 是权威组件源;无 catalog 时从 manifest.skills 兜底。
  const comps = catalog?.components;
  const hasMcp = Array.isArray(comps?.mcpServers) && comps.mcpServers.length > 0;
  const hasSkills = comps
    ? Array.isArray(comps.skills) && comps.skills.length > 0
    : Array.isArray(manifest.skills) && manifest.skills.length > 0;
  const componentType: PluginComponentType = hasMcp ? "MCP" : hasSkills ? "Skills" : "插件";
  return { hasMcp, hasSkills, componentType };
}

export function readPluginCatalog(opts: {
  configDir: string;
  readText?: ReadText;
}): PluginEntry[] {
  const readText = opts.readText ?? defaultReadText;
  const pluginsDir = join(opts.configDir, "plugins");

  const known =
    readJson<Record<string, { installLocation?: unknown }>>(
      readText,
      join(pluginsDir, "known_marketplaces.json"),
    ) ?? {};
  const catalog =
    readJson<{ catalog?: { plugins?: Record<string, CatalogEntry> } }>(
      readText,
      join(pluginsDir, "plugin-catalog-cache.json"),
    )?.catalog?.plugins ?? {};
  const installed =
    readJson<{ plugins?: Record<string, unknown> }>(
      readText,
      join(pluginsDir, "installed_plugins.json"),
    )?.plugins ?? {};
  const enabled =
    readJson<{ enabledPlugins?: Record<string, boolean> }>(
      readText,
      join(opts.configDir, "settings.json"),
    )?.enabledPlugins ?? {};

  const entries: PluginEntry[] = [];
  for (const [marketplace, mk] of Object.entries(known)) {
    const loc = str(mk?.installLocation);
    if (!loc) continue;
    const manifest = readJson<{ plugins?: ManifestPlugin[] }>(
      readText,
      join(loc, ".claude-plugin", "marketplace.json"),
    );
    if (!manifest?.plugins) continue;
    for (const p of manifest.plugins) {
      const name = str(p.name);
      if (!name) continue;
      const id = `${name}@${marketplace}`;
      const cat = catalog[id];
      const { hasMcp, hasSkills, componentType } = classify(cat, p);
      const installs =
        cat && typeof cat.unique_installs === "number" ? cat.unique_installs : null;
      entries.push({
        id,
        name: str(p.displayName) ?? name,
        marketplace,
        author: authorName(p.author),
        description: str(p.description) ?? "",
        category: str(p.category),
        componentType,
        hasMcp,
        hasSkills,
        installs,
        installed: id in installed,
        enabled: enabled[id] === true,
      });
    }
  }
  return entries;
}
```

- [ ] **Step 6: 跑测试确认绿 + 类型**

Run: `bun test src/engine/plugins/catalog.test.ts && bunx tsc --noEmit`
Expected: 全 PASS;tsc 无错。

- [ ] **Step 7: Commit**

```bash
git add src/engine/plugins/paths.ts src/engine/plugins/catalog.ts src/engine/plugins/catalog.test.ts tests/fixtures/plugins
git commit -m "feat: 🧩 plugins catalog reader — merge ~/.claude/plugins into PluginEntry[]"
```

---

## Task 4: plugins service(串行 CLI runner + 校验)

**Files:**
- Create: `src/engine/plugins/service.ts`
- Create: `src/engine/plugins/service.test.ts`

- [ ] **Step 1: 写 service 单测(先红)**

Create `src/engine/plugins/service.test.ts`:
```ts
import { expect, test } from "bun:test";
import { createPluginsService } from "./service";

const CFG = "tests/fixtures/plugins/cfg";

test("snapshot 复用 catalog", () => {
  const svc = createPluginsService({ configDir: CFG, cliPath: "claude" });
  expect(svc.snapshot().some((p) => p.id === "alpha-mcp@official")).toBe(true);
});

test("runAction 拼对 CLI 参数(install 带 --scope user)", async () => {
  const calls: { cli: string; args: string[] }[] = [];
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "/x/claude",
    run: async (cli, args) => {
      calls.push({ cli, args });
      return { code: 0, stderr: "" };
    },
  });
  await svc.runAction("install", "gamma-cmd@official");
  expect(calls[0]).toEqual({
    cli: "/x/claude",
    args: ["plugin", "install", "gamma-cmd@official", "--scope", "user"],
  });
});

test("uninstall 不带 --scope", async () => {
  const calls: string[][] = [];
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async (_cli, args) => {
      calls.push(args);
      return { code: 0, stderr: "" };
    },
  });
  await svc.runAction("uninstall", "alpha-mcp@official");
  expect(calls[0]).toEqual(["plugin", "uninstall", "alpha-mcp@official"]);
});

test("未知 pluginId 被拒(不调 CLI)", async () => {
  let ran = false;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => {
      ran = true;
      return { code: 0, stderr: "" };
    },
  });
  await expect(svc.runAction("enable", "nope@nowhere")).rejects.toThrow(/Unknown plugin/);
  expect(ran).toBe(false);
});

test("CLI 非 0 退出 → 抛错带 stderr", async () => {
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => ({ code: 1, stderr: "boom" }),
  });
  await expect(svc.runAction("enable", "alpha-mcp@official")).rejects.toThrow(/boom/);
});

test("并发 runAction 串行执行(不重叠)", async () => {
  let active = 0;
  let maxActive = 0;
  const svc = createPluginsService({
    configDir: CFG,
    cliPath: "claude",
    run: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { code: 0, stderr: "" };
    },
  });
  await Promise.all([
    svc.runAction("enable", "alpha-mcp@official"),
    svc.runAction("disable", "beta-skill@official"),
  ]);
  expect(maxActive).toBe(1);
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test src/engine/plugins/service.test.ts`
Expected: FAIL(`./service` 不存在)。

- [ ] **Step 3: 实现 service.ts**

Create `src/engine/plugins/service.ts`:
```ts
import { execFile } from "node:child_process";
import type { PluginEntry, PluginsMessage } from "../../shared/events";
import type { PluginsCommand } from "../../shared/commands";
import { readPluginCatalog } from "./catalog";

export type PluginRun = (
  cli: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<{ code: number; stderr: string }>;

const defaultRun: PluginRun = (cli, args, env) =>
  new Promise((resolve) => {
    execFile(
      cli,
      args,
      { env, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0;
        resolve({ code, stderr: stderr?.toString() ?? (err?.message ?? "") });
      },
    );
  });

export interface PluginsService {
  snapshot(): PluginEntry[];
  runAction(
    action: PluginsCommand["action"],
    pluginId: string,
  ): Promise<PluginEntry[]>;
}

export function createPluginsService(opts: {
  configDir: string;
  cliPath: string;
  env?: NodeJS.ProcessEnv;
  run?: PluginRun;
}): PluginsService {
  const run = opts.run ?? defaultRun;
  const env = opts.env ?? process.env;
  const snapshot = () => readPluginCatalog({ configDir: opts.configDir });

  // 串行链:任一时刻只跑一个 mutation(并发写 settings/installed 会坏账)。
  let chain: Promise<unknown> = Promise.resolve();

  const runAction = (
    action: PluginsCommand["action"],
    pluginId: string,
  ): Promise<PluginEntry[]> => {
    const task = chain.then(async () => {
      if (!snapshot().some((p) => p.id === pluginId)) {
        throw new Error(`Unknown plugin: ${pluginId}`);
      }
      const args =
        action === "uninstall"
          ? ["plugin", "uninstall", pluginId]
          : ["plugin", action, pluginId, "--scope", "user"];
      const { code, stderr } = await run(opts.cliPath, args, env);
      if (code !== 0) {
        throw new Error(`claude plugin ${action} failed (${code}): ${stderr}`.trim());
      }
      return snapshot();
    });
    // 链保活:无论成败都让下一个排队任务能继续。
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  return { snapshot, runAction };
}

// 供 gateway 拼初始/广播消息的便捷构造(可选)。
export function pluginsMessage(
  plugins: PluginEntry[],
  busy: PluginsMessage["busy"],
  ts: number,
): PluginsMessage {
  return { kind: "plugins", ts, plugins, busy };
}
```

- [ ] **Step 4: 跑测试确认绿 + 类型**

Run: `bun test src/engine/plugins/service.test.ts && bunx tsc --noEmit`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/engine/plugins/service.ts src/engine/plugins/service.test.ts
git commit -m "feat: 🧩 plugins service — serial claude-plugin CLI runner + id validation"
```

---

## Task 5: gateway 接线(重放 + 广播 + onCommand)

**Files:**
- Modify: `src/engine/ws-gateway.ts`
- Test: `src/engine/ws-gateway.test.ts`(追加)

- [ ] **Step 1: 写 gateway 单测(先红)**

在 `src/engine/ws-gateway.test.ts` 追加(参照该文件既有 helper 起服务/连客户端的写法;若 helper 名不同按文件内现有模式调整):
```ts
test("plugins: 连入重放 lastPlugins + 命令触发 busy→fresh 广播", async () => {
  // 假 plugins service:install 后把 gamma 标记 installed
  let installedGamma = false;
  const base = () => [
    { id: "gamma-cmd@official", name: "gamma", marketplace: "official", author: null, description: "", category: null, componentType: "插件" as const, hasMcp: false, hasSkills: false, installs: 250, installed: installedGamma, enabled: installedGamma },
  ];
  const svc = {
    snapshot: () => base(),
    runAction: async (_a: string, _id: string) => {
      installedGamma = true;
      return base();
    },
  };
  // 用既有 helper 起 gateway,options 传 { plugins: svc };startWith 初始快照:
  // gateway.pushPlugins(svc.snapshot(), [])
  // 连客户端 → 第一帧应是 kind:"plugins" 且 plugins[0].installed===false
  // 发 {cmd:"plugins",action:"install",pluginId:"gamma-cmd@official"}
  // 应先收到 busy=[{id,phase:"installing"}] 再收到 busy=[] 且 installed===true
  // (断言按 ws-gateway.test.ts 既有收帧 helper 写。)
});
```
（注:此 Step 的精确收帧断言以 `ws-gateway.test.ts` 现有测试的连帧/收帧 helper 为准——实现时先读该文件 1 个既有用例照搬其 harness,再填上面逻辑。）

- [ ] **Step 2: 跑测试确认红**

Run: `bun test src/engine/ws-gateway.test.ts`
Expected: FAIL(`pushPlugins` / plugins 分支未实现)。

- [ ] **Step 3: gateway 加类型 import + service 接口 + options**

(a) `src/engine/ws-gateway.ts` 顶部 events 类型 import 块加:
```ts
  PluginEntry,
  PluginActionPhase,
  PluginsMessage,
```
(b) 在 `GatewayGachaService` 接口之后追加:
```ts
export interface GatewayPluginsService {
  snapshot(): PluginEntry[];
  runAction(
    action: "install" | "enable" | "disable" | "uninstall",
    pluginId: string,
  ): Promise<PluginEntry[]>;
}
```
(c) `WsGatewayOptions` 加字段:
```ts
  plugins?: GatewayPluginsService;
```

- [ ] **Step 4: 加 lastPlugins 字段 + pushPlugins + 重放**

(a) 字段(`private lastLimits` 旁,约 106 行后):
```ts
  private lastPlugins: PluginsMessage | null = null;
```
(b) `handleConnection` 里 `if (this.lastLimits)` 之后加:
```ts
    if (this.lastPlugins) ws.send(JSON.stringify(this.lastPlugins));
```
(c) `pushLimits` 方法之后加:
```ts
  pushPlugins(plugins: PluginEntry[], busy: PluginsMessage["busy"]): void {
    const msg: PluginsMessage = { kind: "plugins", ts: Date.now(), plugins, busy };
    this.lastPlugins = msg;
    const json = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(json);
  }
```

- [ ] **Step 5: onCommand 加 plugins 分支 + handler**

(a) `onCommand` 里 `else if (c.cmd === "economy")` 分支之后、`else {` 之前加:
```ts
    } else if (c.cmd === "plugins") {
      void this.handlePluginsCommand(c, ws);
```
(b) `handleEconomyCommand` 之后追加 handler + phase 表:
```ts
  private async handlePluginsCommand(
    c: Extract<ClientCommand, { cmd: "plugins" }>,
    ws: WebSocket,
  ): Promise<void> {
    const svc = this.options.plugins;
    if (!svc) {
      this.replyCommandError(ws, undefined, "Plugins service unavailable");
      return;
    }
    const current = this.lastPlugins?.plugins ?? svc.snapshot();
    const phase: PluginActionPhase = PLUGIN_PHASE[c.action];
    this.pushPlugins(current, [{ id: c.pluginId, phase }]);
    try {
      const fresh = await svc.runAction(c.action, c.pluginId);
      this.pushPlugins(fresh, []);
    } catch (error) {
      this.pushPlugins(current, []);
      this.replyCommandError(
        ws,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
```
(c) 文件底部(`commandLabel` 等 helper 旁)加常量:
```ts
const PLUGIN_PHASE: Record<
  "install" | "enable" | "disable" | "uninstall",
  PluginActionPhase
> = {
  install: "installing",
  enable: "enabling",
  disable: "disabling",
  uninstall: "uninstalling",
};
```

- [ ] **Step 6: 跑测试确认绿 + 类型**

Run: `bun test src/engine/ws-gateway.test.ts && bunx tsc --noEmit`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/engine/ws-gateway.ts src/engine/ws-gateway.test.ts
git commit -m "feat: 🧩 gateway — plugins replay/broadcast + cmd:plugins handler"
```

---

## Task 6: server.ts 接线(构造 service + 初始广播)

**Files:**
- Modify: `src/engine/server.ts`

- [ ] **Step 1: import + 构造 service + 注入 gateway + 初始广播**

(a) 顶部加 import:
```ts
import { cliPathFromEnv } from "./driver";
import { claudeConfigDir } from "./plugins/paths";
import { createPluginsService } from "./plugins/service";
```
(b) `const gateway = new WsGateway(...)` 改为在 options 里加 `plugins`。先在其上方构造 service:
```ts
  const pluginsService = createPluginsService({
    configDir: claudeConfigDir(),
    cliPath: cliPathFromEnv(process.env) ?? "claude",
  });
```
options 对象加:
```ts
    plugins: pluginsService,
```
(c) gateway 构造后、`console.log("[server] LIVE")` 之前,广播一次初始快照:
```ts
  // 启动即读一次真实插件目录并广播(连入的客户端经 lastPlugins 重放)。
  gateway.pushPlugins(pluginsService.snapshot(), []);
```

- [ ] **Step 2: 类型 + 全量单测**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc 无错;全测试 PASS。

- [ ] **Step 3: 手动冒烟(真实引擎)**

Run(后台起引擎,确认无崩):
```bash
ROGUENT_PORT=8799 bun run src/engine/server.ts &
sleep 2
bun -e 'const ws=new WebSocket("ws://localhost:8799"); ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.kind==="plugins"){console.log("plugins count=",m.plugins.length, "sample=", m.plugins[0]?.id); process.exit(0);}}; setTimeout(()=>{console.log("no plugins frame");process.exit(1)},4000)'
kill %1 2>/dev/null
```
Expected: 打印 `plugins count= 2xx`(本机真实条数)+ 一个真实 id。

- [ ] **Step 4: Commit**

```bash
git add src/engine/server.ts
git commit -m "feat: 🧩 server — wire plugins service + initial snapshot broadcast"
```

---

## Task 7: 前端 store + ws-client

**Files:**
- Modify: `src/web/store.ts`
- Modify: `src/web/ws-client.ts`
- Test: `src/web/ws-client.test.ts`(追加)

- [ ] **Step 1: 写 ws-client 分发测试(先红)**

在 `src/web/ws-client.test.ts` 追加:
```ts
test("handleIncoming: kind:plugins → onPlugins", () => {
  const got: unknown[] = [];
  handleIncoming(
    JSON.stringify({ kind: "plugins", ts: 1, plugins: [{ id: "a@b" }], busy: [] }),
    () => {},
    undefined,
    undefined,
    (m) => got.push(m),
  );
  expect(got.length).toBe(1);
});
```
（`handleIncoming` 的 import 与既有用例一致。)

- [ ] **Step 2: 跑测试确认红**

Run: `bun test src/web/ws-client.test.ts`
Expected: FAIL(`handleIncoming` 仅 4 参 / 无 plugins 分支)。

- [ ] **Step 3: store 加 plugins 状态**

`src/web/store.ts`:
(a) 类型 import 块(约 22 行)加 `PluginEntry, PluginActionState, PluginsMessage`。
(b) `RoomStore` 接口(`setLimits` 旁)加:
```ts
  plugins: PluginEntry[];
  pluginsBusy: PluginActionState[];
  setPlugins: (msg: PluginsMessage) => void;
```
(c) `useRoomStore` 初值(`limits: null,` 旁)加:
```ts
  plugins: [],
  pluginsBusy: [],
  setPlugins: (msg) => set({ plugins: msg.plugins, pluginsBusy: msg.busy }),
```

- [ ] **Step 4: ws-client 加 onPlugins**

`src/web/ws-client.ts`:
(a) import 加 `PluginsMessage`:
```ts
import type { AccountLimits, PluginsMessage, RoomEvent } from "../shared/events";
```
(b) `handleIncoming` 签名加第 5 参 + 分支:
```ts
export function handleIncoming(
  raw: string,
  apply: (e: RoomEvent) => void,
  onControl?: (c: ControlMessage) => void,
  onLimits?: (l: AccountLimits) => void,
  onPlugins?: (m: PluginsMessage) => void,
): void {
```
在 `if (kind === "limits")` 块之后加:
```ts
  if (kind === "plugins") {
    onPlugins?.(parsed as PluginsMessage);
    return;
  }
```
(c) `connectRoom` 里 `const onLimits = ...` 之后加:
```ts
  const onPlugins = (m: PluginsMessage) =>
    useRoomStore.getState().setPlugins(m);
```
并把 `ws.onmessage` 调用补上第 5 参:
```ts
    ws.onmessage = (ev) =>
      handleIncoming(String(ev.data), apply, onControl, onLimits, onPlugins);
```

- [ ] **Step 5: 跑测试确认绿 + 类型**

Run: `bun test src/web/ws-client.test.ts && bunx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/web/store.ts src/web/ws-client.ts src/web/ws-client.test.ts
git commit -m "feat: 🧩 web store/ws-client — consume PluginsMessage"
```

---

## Task 8: Market.tsx 渲染真实数据 + 按钮接线

**Files:**
- Modify: `src/web/hud/Market.tsx`
- Modify: `src/web/i18n.ts`

- [ ] **Step 1: 改 Market.tsx 用真实 store 数据**

整体替换 `src/web/hud/Market.tsx` 为(保留 Modal/Icon/类名,删 banner、删 mock 依赖、接 store + sendCommand):
```tsx
import { useState } from "react";
import type { PluginEntry } from "../../shared/events";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";
import { Icon } from "./icons";

const CATS = ["全部", "已安装", "Skills", "MCP", "插件"] as const;

function matchesCat(p: PluginEntry, cat: string): boolean {
  if (cat === "全部") return true;
  if (cat === "已安装") return p.installed;
  if (cat === "MCP") return p.hasMcp;
  if (cat === "Skills") return p.hasSkills;
  if (cat === "插件") return !p.hasMcp && !p.hasSkills;
  return true;
}

export function Market() {
  const active = useUiStore((s) => s.activePanel === "market");
  const closePanel = useUiStore((s) => s.closePanel);
  const plugins = useRoomStore((s) => s.plugins);
  const busy = useRoomStore((s) => s.pluginsBusy);
  const t = useT();
  const [cat, setCat] = useState<string>("全部");
  const [q, setQ] = useState("");

  if (!active) return null;

  const installedCount = plugins.filter((p) => p.installed).length;
  const busyIds = new Set(busy.map((b) => b.id));

  const list = plugins
    .filter((p) => matchesCat(p, cat))
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.description.toLowerCase().includes(q.toLowerCase()),
    );

  const act = (action: "install" | "enable" | "disable" | "uninstall", id: string) =>
    sendCommand({ cmd: "plugins", action, pluginId: id });

  return (
    <Modal
      title="MARKET"
      sub={t("插件市场 · MCP / Skills / 插件 · 接入真实能力")}
      icon="mcp"
      width={1180}
      onClose={closePanel}
    >
      <div className="shop-wrap">
        <div className="shop-market">
          <div className="shop-side">
            <div className="shop-search">
              <Icon name="search" size={16} />
              <input
                className="pxinput"
                placeholder={t("搜索…")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                className={`shop-cat${cat === c ? " on" : ""}`}
                onClick={() => setCat(c)}
              >
                {t(c)}
                {c === "已安装" && (
                  <span className="shop-cat-n px">{installedCount}</span>
                )}
              </button>
            ))}
            <div className="shop-side-note faint">
              {t("插件变更对新建会话生效")}
            </div>
          </div>

          <div className="shop-grid scroll">
            {list.map((p) => {
              const isBusy = busyIds.has(p.id);
              return (
                <div key={p.id} className="plugin-card">
                  <div className="plugin-top">
                    <div className="plugin-ic">
                      <Icon name="mcp" size={30} glow="#36c5e0" />
                    </div>
                    <div className="plugin-meta">
                      <div className="plugin-name">{p.name}</div>
                      <div className="faint" style={{ fontSize: 11 }}>
                        by {p.author ?? "—"}
                      </div>
                    </div>
                    <span className="chip px" style={{ fontSize: 8 }}>
                      {p.componentType}
                    </span>
                  </div>
                  <div className="plugin-desc">{p.description}</div>
                  <div className="plugin-bottom">
                    {p.category && (
                      <span className="chip px" style={{ fontSize: 8 }}>
                        {p.category}
                      </span>
                    )}
                    <span className="faint" style={{ fontSize: 11 }}>
                      {p.installs !== null ? `${formatInstalls(p.installs)} 安装` : "—"}
                    </span>
                    <span className="chip px" style={{ fontSize: 8 }}>
                      {p.marketplace}
                    </span>
                    <div style={{ flex: 1 }} />
                    {renderAction(p, isBusy, t, act)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function formatInstalls(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderAction(
  p: PluginEntry,
  isBusy: boolean,
  t: (s: string) => string,
  act: (a: "install" | "enable" | "disable" | "uninstall", id: string) => void,
) {
  if (isBusy)
    return <span className="chip">{t("处理中…")}</span>;
  if (!p.installed)
    return (
      <button type="button" className="pxbtn gold sm cjk" onClick={() => act("install", p.id)}>
        {t("安装")}
      </button>
    );
  if (p.enabled)
    return (
      <>
        <span className="chip greenc">{t("已启用")}</span>
        <button type="button" className="pxbtn sm cjk" onClick={() => act("disable", p.id)}>
          {t("停用")}
        </button>
      </>
    );
  return (
    <>
      <button type="button" className="pxbtn gold sm cjk" onClick={() => act("enable", p.id)}>
        {t("启用")}
      </button>
      <button type="button" className="pxbtn sm cjk" onClick={() => act("uninstall", p.id)}>
        {t("卸载")}
      </button>
    </>
  );
}
```
（注:`Icon name` 用固定 `"mcp"`——真实目录无逐插件图标字段;`pxbtn sm cjk`(无 `gold`)作次级按钮样式,若该组合在 CSS 不存在则沿用现有次级按钮类名,实现时 grep `pxbtn` 现有用法对齐。)

- [ ] **Step 2: i18n 加新文案**

`src/web/i18n.ts` 字典加(英文翻译;市场名/category/插件名属产品术语**不入典**):
```ts
  停用: "Disable",
  启用: "Enable",
  卸载: "Uninstall",
  "处理中…": "Working…",
  "插件变更对新建会话生效": "Plugin changes apply to new sessions",
```
（`安装` / `已启用` / `搜索…` / 分类词 已在典中,勿重复加。实现时先 grep 确认。）

- [ ] **Step 3: 类型 + check + 单测**

Run: `bunx tsc --noEmit && bun run check && bun test`
Expected: 全绿。

- [ ] **Step 4: 手动验证 UI(真实引擎 + 前端)**

```bash
bun run dev:engine   # 终端 A
bun run dev:web      # 终端 B → 打开 http://localhost:5173
```
打开 MARKET 面板,确认:展示真实插件(数百条)、搜索/分类生效、已装插件显「已启用」、安装数真实、市场 chip / category 徽章在位、无假 ★、无 mock banner。

- [ ] **Step 5: Commit**

```bash
git add src/web/hud/Market.tsx src/web/i18n.ts
git commit -m "feat: 🧩 Market — render real plugin catalog + wire install/enable/disable/uninstall"
```

---

## Task 9: 诚实化收尾 + 退役 mock

**Files:**
- Modify: `src/web/hud/shop-data.ts`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: 退役 SHOP_PLUGINS / SHOP_CATS**

`src/web/hud/shop-data.ts`:删除 `ShopPlugin` interface、`SHOP_PLUGINS` 常量、`SHOP_CATS` 常量,并更新文件头注释(去掉「plugins」相关描述,说明本文件仅余装饰 Shop 的 `SHOP_ITEMS` / `SHOP_GEMS`)。**保留** `SHOP_ITEMS` / `SHOP_GEMS` / `ShopItem`。

- [ ] **Step 2: 确认无残留引用**

Run: `rg -n "SHOP_PLUGINS|SHOP_CATS|ShopPlugin" src/`
Expected: 无输出(全部已迁移)。若有 → 清掉。

- [ ] **Step 3: 更新 ROADMAP**

`docs/ROADMAP.md` §3.6 把「Market 整面板 mock + banner(引擎无插件市场)」相关行改为接真现状(展示真实目录 + 真实 install/enable/disable/uninstall;评分无源已删;变更对新建会话生效)。

- [ ] **Step 4: 全门禁**

Run: `bun test && bun run check && bunx tsc --noEmit`
Expected: 全绿(注:动了 `tests/e2e/` 才需 `bun run typecheck:e2e`;本计划未动 e2e)。

- [ ] **Step 5: Commit**

```bash
git add src/web/hud/shop-data.ts docs/ROADMAP.md
git commit -m "chore: 🧹 retire SHOP_PLUGINS mock + record MARKET-real in ROADMAP"
```

---

## Task 10: 端到端真实 mutation 验证(手动)

**Files:** 无(本机验证)。

- [ ] **Step 1: 起真实引擎 + 前端,挑一个未安装的轻量插件**

`bun run dev:engine` + `bun run dev:web`,在 MARKET 搜一个未安装的小插件(如某纯 skill 插件)。

- [ ] **Step 2: 点「安装」→ 观察状态机**

预期:按钮转「处理中…」→ 数秒后变「已启用 + 停用」(install 顺带 enable);卡片安装态来自引擎重读的真实快照。

- [ ] **Step 3: 点「停用」→「卸载」复原**

预期:停用 → 「启用 + 卸载」;卸载 → 回「安装」。本机 `claude plugin list` 复核与 UI 一致:
```bash
claude plugin list < /dev/null 2>&1 | grep -i "<该插件名>"
```

- [ ] **Step 4: 失败路径**

断网或对一个会失败的 op 触发,确认前端弹 `commandError` 提示、卡片状态回滚(不卡在 busy)。

- [ ] **Step 5: 无新提交(纯验证);如发现 bug 回到对应 Task 修。**

---

## Self-Review(已执行)

**Spec 覆盖**:§2 数据源→Task 3;§3 写路径→Task 4;§4 协议→Task 2/5/7;§5 引擎模块→Task 3/4/6;§6 分类→Task 3(`classify`)+Task 8(`matchesCat`);§7 卡片字段→Task 8;§8 状态机→Task 8(`renderAction`);§9 前端→Task 7/8;§10 局限→Task 8(底部提示);§11 测试→各 Task 的 test step;§12 顺序→Task 1→10。可行性探针(§12.1)= Task 1。

**占位符**:无 TBD/TODO;唯二「以现有 harness 为准」处(Task 5 Step 1 的 ws-gateway 收帧断言、Task 8 的 `pxbtn` 次级类名)已显式标注「实现时读现有用例/grep 对齐」——因为它们依赖现有测试 harness 与 CSS 类,照搬比臆造更可靠。

**类型一致**:`PluginEntry` 字段(id/name/marketplace/author/description/category/componentType/hasMcp/hasSkills/installs/installed/enabled)在 events.ts 定义后,catalog.ts 产出、gateway/store/Market 消费全程同名;`PluginsCommand.action` 四值与 `PLUGIN_PHASE`、`PLUGIN_ACTIONS`、`renderAction` 一致;`pushPlugins(plugins, busy)` 签名在 gateway / server / 测试一致。
