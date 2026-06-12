# MARKET 接真:展示 + 真实安装/启用本机插件目录

**日期**:2026-06-12
**状态**:设计已定,待实现
**依据 commit**:`7129b73`(main,2026-06-12)

## 1. 背景与目标

`Market.tsx`(插件市场面板)当前是**整面板 mock + banner**:6 条硬编码插件
(`src/web/hud/shop-data.ts` 的 `SHOP_PLUGINS`)、假评分 / 假安装数 / 假拥有态,
「安装」按钮不绑任何逻辑,顶部挂「示例插件 · 安装逻辑未接入(引擎暂无插件市场)」。

但本机 `~/.claude/plugins/` 下其实有**完整真实插件目录**(约 226 条,含真实安装数、
已装 / 已启用状态),`claude plugin` CLI 也提供完整的 install/enable/disable/uninstall。
本设计把 MARKET 接到这份真实数据,并让按钮**真的**调 CLI 改本机全局配置。

**范围**:展示 + 真实安装/启用(用户选定的最进取档)。

**非目标**:不做插件评分系统(无数据源);不自动重启运行中会话;不碰 Shop 装饰店
(`Shop.tsx` / 宝石经济 / 扭蛋,均不受影响)。

## 2. 数据源(读 —— 全部已核验)

引擎从 `<CLAUDE_CONFIG_DIR || ~/.claude>/plugins/` 与 `<configDir>/settings.json` 读取并合并:

| 文件 | 提供字段 |
| --- | --- |
| `plugins/known_marketplaces.json` | 已知市场及其 `installLocation`(官方 + claude-hud / karpathy-skills / openai-codex-plugin / tide) |
| 各市场 `<installLocation>/.claude-plugin/marketplace.json` 的 `plugins[]` | `name` / `displayName` / `description` / `author.name` / `category` / 组件清单(官方 222 条 + 其余各 1 条) |
| `plugins/plugin-catalog-cache.json` 的 `catalog.plugins{}` | `unique_installs`(真实安装数,208/222 官方有)+ `components`(各组件类型计数) |
| `settings.json` 的 `enabledPlugins{}`(key=`name@market` → bool) | 已启用状态 |
| `plugins/installed_plugins.json` 的 `plugins{}`(key=`name@market`) | 已安装状态 |

合并键统一为 **`<name>@<marketplace>`**(与 CLI、settings、installed 一致)。

**诚实化纪律**:
- 目录里**没有任何评分源** → 删掉卡片上的 ★(mock 是假的)。
- 安装数**真实保留**;无 catalog 条目的非官方市场显示「—」,绝不编造。
- `displayName` 存在时用之,否则回落 `name`。

### 配置目录解析

复用既有模式(见 `src/engine/credentials.ts:84`):
`process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude")`。
抽一个共享小工具 `claudeConfigDir()`(放 `src/engine/plugins/paths.ts` 或复用现有),
让 catalog 读取与 CLI 子进程的 `CLAUDE_CONFIG_DIR` 指向同一处。

## 3. 写路径:shell out 到官方 `claude` CLI(选定方案)

| UI 操作 | 命令(`execFile`,参数数组,**无 shell**) |
| --- | --- |
| 安装 | `claude plugin install <name>@<market> --scope user` |
| 启用 | `claude plugin enable <name>@<market> --scope user` |
| 停用 | `claude plugin disable <name>@<market> --scope user` |
| 卸载 | `claude plugin uninstall <name>@<market>` |

- **CLI 路径**:复用 `cliPathFromEnv()`(`ROGUENT_CLI_PATH` → 回落 PATH 里的 `claude`),与 Driver 一致;Tauri 打包态用 sidecar 注入的 `ROGUENT_CLI_PATH`。
- **子进程 env**:透传 `CLAUDE_CONFIG_DIR`(确保改的是同一份配置);**不**做 `stripSubscriptionEnv`(install 是 git + 写配置,需正常环境)。
- **串行化**:全局一把锁,任一时刻只跑一个 plugin mutation(并发写 settings/installed 会坏账)。
- **入参校验**:`pluginId` 必须命中**已读出的真实目录键**,否则拒绝(防任意参数注入到 CLI)。
- **超时 + 退出码**:install 可能 clone 仓库,给宽超时(~120s);捕获 exit code + stderr,失败走错误通道。

**拒绝的替代方案**:
- *手改 `installed_plugins.json` + `settings.enabledPlugins`*:要自行复刻 cache 下载与账本维护,极易把状态写坏。✗
- *SDK 原生插件 API*:Agent SDK 不暴露插件管理面,CLI 才是接口。✗

**⚠️ 可行性风险(实现首步必须先验证)**:install / enable 在**非交互(非 TTY)**下是否会弹确认提示。已知 `claude plugin list` 在 `< /dev/null` 下 exit 0 正常;所有目标插件都来自**已知市场**(无新市场 trust 提示)。若某 op 仍需交互,则该 op **回落为「复制命令」**(给出 `/plugin install <name>` 让用户在 Claude Code 内执行),其余 op 不受影响。

> **✅ 探针结论(2026-06-12,本机实测)**:`claude plugin disable/enable context7@claude-plugins-official --scope user < /dev/null` 两条均 `exit=0`、无任何交互阻塞,操作后插件状态正确复原(`Status: ✔ enabled`)。**非交互路径可用,无需「复制命令」回落。**

**安装即启用**:UI 的「安装」语义 = `install`(CLI 默认会 enable)。实现首步同时核验 install 是否真的顺带写 `enabledPlugins=true`;若不会,则「安装」内部串行执行 `install` 后再 `enable`。

> **✅ 探针结论(同上)**:`claude plugin install --help` 仅有 `--config` / `--scope` / `--help` 三个选项,**无 `--no-enable` 类开关**;本机 `enabledPlugins` 中已装插件皆为 true。佐证 install 默认顺带 enable,「安装」无需追加 `enable` 串行步骤。

## 4. 协议(照搬 limits 非 seq 样板)

### 下行:`PluginsMessage`

非 seq 的 kind 标记消息,**不做成 `RoomEvent`**(全局账户态、无 `(sessionId,seq)`,
与 `LimitsMessage` 同纪律 —— 见 memory `account-limits-source.md`)。

```ts
// shared/events.ts
export interface PluginEntry {
  id: string;            // "<name>@<marketplace>"
  name: string;          // displayName || name
  marketplace: string;   // "claude-plugins-official" | ...
  author: string | null;
  description: string;
  category: string | null;        // manifest category(development/security/...)
  componentType: "MCP" | "Skills" | "插件"; // 主类型(见 §6 分类)
  hasMcp: boolean; hasSkills: boolean;       // 供组件类型过滤(一插件可多类型)
  installs: number | null;        // unique_installs;无 catalog → null
  installed: boolean;
  enabled: boolean;
}
export interface PluginActionState {
  id: string;
  phase: "installing" | "enabling" | "disabling" | "uninstalling";
}
export interface PluginsMessage {
  kind: "plugins";
  ts: number;
  plugins: PluginEntry[];
  busy: PluginActionState[];      // 正在进行的 mutation(供卡片显 pending)
}
```

- 连入即重放(`WsGateway.lastPlugins`,仿 `lastLimits` + `pushLimits`)。
- 每次 mutation 开始 / 结束都重算并广播(开始时把该卡置入 `busy`,结束后重读目录清 `busy`)。

### 上行:`cmd: "plugins"`

```ts
// shared/commands.ts
export interface PluginsCommand {
  cmd: "plugins";
  action: "install" | "enable" | "disable" | "uninstall";
  pluginId: string;     // "<name>@<marketplace>"
}
```

- 加进 `ClientCommand` union + `parseClientCommand`(严格校验 action ∈ 枚举、`pluginId` 非空字符串)。
- `ws-gateway.onCommand` 加 `cmd === "plugins"` 分支 → 调 actions 模块。
- 失败复用现有 `commandError` control 通道弹提示(前端已有 `setCommandError`)。

## 5. 引擎模块(新增,小而专)

- **`src/engine/plugins/catalog.ts`** —— 纯函数:给定 configDir(或注入的文件读取器)→ 读 4 文件 → 合并 → 分类 → 产出 `PluginEntry[]`。可单测(喂 fixture 目录 / 假读取器)。容错:任一文件缺失 / 解析失败 → 跳过该来源、不崩(MARKET 至少能展示能读到的部分)。
- **`src/engine/plugins/actions.ts`** —— 串行执行 CLI op(execFile 包一层,可注入假 runner 单测),含锁 + 校验 + 超时;完成后触发「重读 catalog + 广播」回调。
- **`src/engine/plugins/paths.ts`(或并入 catalog)** —— `claudeConfigDir()` 解析。
- 接线:`server.ts` / `SessionManager` 启动时读一次目录塞进 `WsGateway`(`lastPlugins`),连入即重放;mutation 后刷新。

## 6. 分类(用户决策:两者都要)

- **左栏分类**(保留现有体系,改由真实组件推导):`全部` / `已安装` / `Skills` / `MCP` / `插件`。
  - `componentType` 推导:有 `mcpServers` → `MCP`;否则有 `skills` → `Skills`;否则(commands/agents/hooks/lspServers)→ `插件`。
  - 过滤判定:`MCP` 档 = `hasMcp`;`Skills` 档 = `hasSkills`;`插件` 档 = `!hasMcp && !hasSkills`(纯 commands/agents/hooks/lsp);`已安装` = `installed`;`全部` 不过滤。**一插件可同时出现在 MCP 与 Skills 下**(二者不互斥),但只有都不含时才落入 `插件`。
- **卡片额外显示 `category` 徽章**(manifest 的真实 category:development / security / testing / database / design / monitoring / productivity / learning / location / math / deployment;缺失则不显示)。

## 7. 卡片字段(诚实化后)

| 位置 | 内容 | 来源 |
| --- | --- | --- |
| 名称 | `displayName || name` | manifest |
| 作者 | `by <author>` | manifest |
| 右上 chip | 组件类型(MCP/Skills/插件) | catalog components |
| category 徽章 | development / security / … | manifest |
| 描述 | `description`(CSS 截断) | manifest |
| 安装数 | `<n> 安装` / `—` | catalog unique_installs |
| **市场 chip**(替换原 runtime「通用/Claude」) | `claude-plugins-official` / `tide` / … | known_marketplaces |
| ~~★ 评分~~ | **删除**(无数据源) | — |
| 状态 / 动作 | 见 §8 | installed + enabled |

## 8. 卡片状态机(2 轴:已装 / 已启用)

| 状态 | 徽章 / 按钮 | 点击行为 |
| --- | --- | --- |
| 未安装 | `[安装]` | `install`(即启用) |
| 已启用 | `已启用` 徽章 + `[停用]` | `disable` |
| 已安装但停用 | `[启用]` + `[卸载]` | `enable` / `uninstall` |

- mutation 进行中(该卡 `id ∈ busy`):按钮禁用 + 显 pending 态,防重复点。
- 失败:`commandError` 弹提示;UI 不乐观改状态(以广播回来的真实快照为准),或乐观改后被下一帧快照纠正。

## 9. 前端改动

- **`src/web/store.ts`**:加 `plugins: PluginEntry[]` + `pluginsBusy: PluginActionState[]` 状态 + `setPlugins(msg)` action。
- **`src/web/ws-client.ts`**:`handleIncoming` 加 `kind === "plugins"` 分支(仿 `onLimits`),`connectRoom` 接 `onPlugins → store.setPlugins`。
- **`src/web/hud/Market.tsx`**:删 banner、删 `SHOP_PLUGINS`/`SHOP_CATS` 依赖,改用 store 的 `plugins`;render 体里做分类 / 搜索过滤(Zustand selector 只取稳定引用,派生放 render);按钮接 `sendCommand({cmd:"plugins",action,pluginId})`。
- **`src/web/hud/shop-data.ts`**:`SHOP_PLUGINS` / `SHOP_CATS` 退役删除(`SHOP_ITEMS` / `SHOP_GEMS` 给装饰 Shop 保留)。
- i18n:新增 / 调整文案(市场名、category、状态词)入 `i18n.ts` 字典(产品术语不入典,沿用现有纪律)。

## 10. 已知局限(写进 UI 提示 + spec)

新装 / 新启用的插件**只对之后新建的会话生效**:SDK `query()` 已运行的会话需重启才加载
新组件(`claude plugin update` 自身也标 "restart required")。**不自动重启会话**。
MARKET 如实反映磁盘状态即可;可在面板底部加一行浅色提示「插件变更对新建会话生效」。

## 11. 测试

- `catalog.ts`:喂 fixture 目录(含 known_marketplaces + 两个假市场 manifest + catalog + settings + installed)验证合并 / 分类 / 安装数 / 缺文件容错 / displayName 回落。
- `actions.ts`:注入假 runner,验证命令参数拼装、串行锁、pluginId 校验拒绝非法键、超时与失败传播。
- `commands.ts`:`parseClientCommand` 对 `plugins` 命令的接受 / 拒绝用例。
- `store.ts` / `ws-client.ts`:`kind:"plugins"` 分支 → `setPlugins` 状态落地。
- 门禁:`bun test` + `bun run check` + `bunx tsc --noEmit`(改 TS 必跑后者);动 e2e 才跑 `bun run typecheck:e2e`。
- 端到端可用 fixture 路径验证 UI,不烧额度;真实 mutation 在本机手动验证一次(install 一个轻量插件 → 看广播 → disable → uninstall 复原)。

## 12. 实现顺序(交 writing-plans 细化)

1. **可行性探针**:本机跑一次 `claude plugin enable/disable` 某已装插件(非交互),确认无 TTY 阻塞、确认 install 是否顺带 enable。结论回写本节。
2. 引擎 `catalog.ts` + 单测(只读,先让 MARKET 能展示真实数据)。
3. 协议:`PluginsMessage` + `WsGateway` 重放 / 广播 + 前端 store / ws-client + `Market.tsx` 只读渲染。**到此「展示」闭环可先验收**。
4. 引擎 `actions.ts` + `cmd:"plugins"` 解析 / onCommand 分支 + 前端按钮接线 + pending / 失败处理。
5. 诚实化收尾:删 ★、市场 chip、category 徽章、局限提示、退役 `SHOP_PLUGINS`。
6. 全门禁 + 本机手动 mutation 验证 + 更新 `docs/ROADMAP.md`(把 §3.6 的「Market 整面板 mock」改为接真现状)。
