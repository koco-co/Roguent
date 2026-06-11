# Roguent.html 设计稿 v2 增量落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2026-06-11 版 Roguent-handoff.zip 设计稿相对已合入的 06-07 版的**增量**落到真实 React/Pixi/Zustand 代码,真/假分明(能接真数据就接真,无源的显著标注 mock)。

**Architecture:** 增量共 7 块:① 全局 i18n(`t()` 字典翻译 + 中|EN HUD 切换,产品术语不译)② dungeon/holo 场景皮肤(settings-store + `skin-holo` CSS 全套 + PixiJS holo 地板)③ 内景 BrowserScreen 大屏(DOM overlay,**接真**:当前会话最近 tool 活动)④ Shop 拆分 Market(插件市场,mock)+ Shop(装饰商店)+ 挂载真 GachaPanel ⑤ SessionGrid v2 多级过滤/排序/置灰/相对时间(全接真)⑥ Hotbar/ButtonDock 重排 + 大厅 market 摊位 ⑦ 零散文案(Context / 5h·Weekly 等)。

**Tech Stack:** Bun + React 19 + PixiJS v8(@pixi/react)+ Zustand + Biome;测试 bun:test;类型 `bunx tsc --noEmit`(`bun run check` 不查类型)。

**设计稿参照(实现者必读):**
- 新版设计源码:`Prototype/roguent/project/roguent/`(Task 0 会同步成 2026-06-11 版)。
- 增量 diff 要点(旧→新):`i18n.js`(新增)、`app.jsx`(skin 状态/skin-switch/T())、`hud.jsx`(BrowserScreen/LangToggle/Hotbar·Dock 重排)、`lobby.jsx`(SessionGrid v2/market 摊位)、`panels2.jsx`(Market/Shop 拆分)、`extra.css`(sg-filters/skin-holo/bigscreen/skin-switch)、`layout.css`(lang-toggle/gitbanner)。
- 真实代码不照抄原型内部结构,**对齐视觉与交互**;沿用本仓库约定(zustand selector 只取基元/稳定引用、hooks 全在 early return 前、`<button type="button">`、像素 chrome 类)。

**统一验证命令(每个 task 结尾都跑):**

```bash
bun test && bun run check && bunx tsc --noEmit
```

**工作流:** 主工作树先快照提交(Task 0),然后 `git worktree add --detach .worktrees/design-delta-v2 main`,全部任务在 worktree 内完成、按 task 提交;最后回 main `git merge --no-ff`。

---

### Task 0: 基线快照 —— 同步 Prototype/ 为新版设计稿 + 提交 zip

**Files:**
- Modify: `Roguent-handoff.zip`(已是新版,工作区 modified,提交即可)
- Modify: `Prototype/roguent/`(整目录同步为新 zip 内容)

- [ ] **Step 1: 用新 zip 内容覆盖 Prototype/**

```bash
cd /Users/poco/Projects/Roguent
rm -rf /tmp/roguent-handoff-sync && mkdir -p /tmp/roguent-handoff-sync
unzip -oq Roguent-handoff.zip -d /tmp/roguent-handoff-sync
rsync -a --delete /tmp/roguent-handoff-sync/roguent/ Prototype/roguent/
```

- [ ] **Step 2: 验证同步后 Prototype 与 zip 一致**

```bash
diff -rq /tmp/roguent-handoff-sync/roguent Prototype/roguent && echo SYNC_OK
```

Expected: `SYNC_OK`(无 diff 输出)。

- [ ] **Step 3: 快照提交(pre-worktree)**

```bash
git add -A
git commit -m "chore: 🧹 sync design handoff to 2026-06-11 revision (zip + Prototype/)"
```

- [ ] **Step 4: 创建 detached worktree 并装依赖**

```bash
git worktree add --detach .worktrees/design-delta-v2 main
cd .worktrees/design-delta-v2 && bun install
```

后续 Task 1–12 全部在 `.worktrees/design-delta-v2` 内执行。

---

### Task 1: i18n 模块 —— 字典 + 纯函数 + hooks + settings-store.uiLang

**Files:**
- Create: `src/web/i18n.ts`
- Create: `src/web/i18n.test.ts`
- Modify: `src/web/settings-store.ts`(加 `uiLang`)
- Modify: `src/web/settings-store.test.ts`(补 parsePersisted 用例)

设计参照:`Prototype/roguent/project/roguent/i18n.js`。原则:**产品/游戏术语不译**(Claude、Codex、askuser、compact、Token、Context、Usage、Weekly、模型名、slash 命令、runtime、MCP、diff、PR、CI 等中英文里都保持英文)。

- [ ] **Step 1: settings-store 加 `uiLang`(写失败测试先行)**

在 `src/web/settings-store.test.ts` 追加:

```ts
test("parsePersisted 接受合法 uiLang,拒绝非法值", () => {
  expect(parsePersisted(JSON.stringify({ uiLang: "en" })).uiLang).toBe("en");
  expect(parsePersisted(JSON.stringify({ uiLang: "cn" })).uiLang).toBe("cn");
  expect(parsePersisted(JSON.stringify({ uiLang: "jp" })).uiLang).toBeUndefined();
});
```

Run: `bun test src/web/settings-store.test.ts` → FAIL(uiLang 不在 Settings)。

- [ ] **Step 2: 实现 settings-store.uiLang**

`src/web/settings-store.ts` 四处修改:

```ts
// Settings 接口内追加:
  /** 界面语言;"cn" 中文(默认)/ "en" English。产品术语两种语言下都保持英文。 */
  uiLang: "cn" | "en";

// DEFAULT_SETTINGS 追加:
  uiLang: "cn",

// parsePersisted 追加:
  if (obj.uiLang === "cn" || obj.uiLang === "en") out.uiLang = obj.uiLang;

// savePersisted 的解构与 JSON.stringify 对象各追加 uiLang。
```

Run: `bun test src/web/settings-store.test.ts` → PASS。

- [ ] **Step 3: 写 i18n 纯函数失败测试**

`src/web/i18n.test.ts`:

```ts
import { expect, test } from "bun:test";
import { translate } from "./i18n";

test("cn 模式原样返回", () => {
  expect(translate("进入", "cn")).toBe("进入");
});
test("en 模式查字典", () => {
  expect(translate("进入", "en")).toBe("Enter");
  expect(translate("在岗", "en")).toBe("On duty");
});
test("字典外字符串原样返回(产品术语/未收录)", () => {
  expect(translate("Claude", "en")).toBe("Claude");
  expect(translate("某个没收录的句子", "en")).toBe("某个没收录的句子");
});
test("动态前缀:进入 X", () => {
  expect(translate("进入 roguent · 大厅重构", "en")).toBe("Enter roguent · 大厅重构");
});
```

Run: `bun test src/web/i18n.test.ts` → FAIL(模块不存在)。

- [ ] **Step 4: 实现 `src/web/i18n.ts`**

字典以设计稿 `i18n.js` 的 DICT 为底,**外加真实 app 独有文案**(本计划各 sweep task 里列出的新增条目)。核心结构:

```ts
import { useSettingsStore } from "./settings-store";

export type Lang = "cn" | "en";

/**
 * 全局中→英字典(对标设计原型 i18n.js 的 DICT)。
 * 产品/游戏术语(Claude/Codex/askuser/compact/Token/Context/Usage/Weekly/
 * 模型名/slash 命令/runtime/MCP/diff/PR/CI)刻意**不**入典——两种语言都保持英文。
 */
export const DICT: Record<string, string> = {
  // ── view / nav ──
  内景: "Room",
  大厅: "Lobby",
  // ── 通用动作/按钮 ──
  进入: "Enter",
  聊天: "Chat",
  归档: "Archive",
  删除: "Delete",
  "确认删除？": "Confirm delete?",
  安装: "Install",
  已拥有: "Owned",
  已启用: "Enabled",
  登出: "Log out",
  回应: "Reply",
  进入会话: "Open session",
  未读: "unread",
  导入: "Import",
  保存: "Save",
  发送: "Send",
  返回: "Back",
  继续游戏: "Resume",
  "账号 · 订阅": "Account · Plan",
  "runtime 管理": "Manage runtime",
  "保存 / 导出会话": "Save / Export session",
  选择一封信件: "Select a message",
  当前: "Current",
  通用: "Universal",
  还原: "Reset",
  已保存: "Saved",
  检查更新: "Check update",
  今日: "Today",
  查看: "View",
  稍后: "Later",
  打开邮箱: "Open Mailbox",
  已配对设备: "Paired devices",
  转发开: "Forwarding",
  已暂停: "Paused",
  进入房间: "Enter room",
  小队: "Squad",
  正在思考: "Thinking",
  主控: "Lead",
  // ── 模态副标题 ──
  会话档案: "Session profile",
  "共享任务清单 · agent teams": "Shared task list · agent teams",
  "法术书 · slash 命令 & skills": "Spellbook · slash commands & skills",
  "按 token 降序": "Sorted by token desc",
  "本会话产出 loot": "This session's loot",
  切换会话模型: "Switch session model",
  导入本地会话: "Import local sessions",
  "个人详情 · 订阅与用量": "Profile · plan & usage",
  关于_Roguent: "About Roguent",
  // ── 小标签 ──
  在岗: "On duty",
  会话产出: "Session loot",
  项目: "Project",
  模型: "Model",
  模式: "Mode",
  状态: "Status",
  子智能体: "Subagents",
  花费: "Cost",
  待你回应: "Needs you",
  剩余: "left",
  已用: "used",
  计划: "plan",
  已暂存: "Staged",
  已修改: "Modified",
  未跟踪: "Untracked",
  冲突: "Conflicts",
  会话: "sessions",
  // ── 状态词 ──
  工作中: "Working",
  思考: "Thinking",
  待办: "To-do",
  待命: "Idle",
  完成: "Done",
  出错: "Error",
  压缩中: "Compacting",
  进行中: "In progress",
  待领: "Pending",
  待认领: "Unclaimed",
  阻塞中: "Blocked",
  归属: "Owner",
  依赖: "Deps",
  无: "none",
  认领任务: "Claim task",
  选择一个任务: "Select a task",
  // ── tabs ──
  按会话: "By session",
  按模型: "By model",
  "按 runtime": "By runtime",
  插件市场: "Plugin market",
  装饰商店: "Decoration shop",
  已安装: "Installed",
  插件: "Plugins",
  "搜索…": "Search…",
  全部: "All",
  已解锁: "Unlocked",
  // ── menu / 大厅 ──
  设置祭坛: "Config Altar",
  成就殿: "Achievements Hall",
  邮箱: "Mailbox",
  排行榜: "Ranking",
  公告板: "Board",
  公告: "Board",
  任务台: "Quest Console",
  商店: "Shop",
  扭蛋机: "Gacha",
  "Claude 项目": "Claude projects",
  "Codex 项目": "Codex projects",
  活动: "Events",
  设置: "Settings",
  账号: "Account",
  菜单: "Menu",
  配对: "Pairing",
  暂停: "Pause",
  技能: "Skills",
  背包: "Backpack",
  任务: "Tasks",
  成就: "Achievements",
  信箱: "Mailbox",
  // ── misc ──
  空无一人: "No one here",
  "召唤你的第一个小队，开始 vibe coding": "Summon your first squad and start vibe coding",
  召唤小队: "Summon squad",
  // …(实现时把设计稿 i18n.js DICT 的全部条目搬进来;以上仅节选,
  //   下方 sweep task 各自列出的「新增条目」也都加入此处)
};

/** 纯函数翻译:en 查字典(含「进入 X」动态前缀),cn / 未命中原样返回。 */
export function translate(s: string, lang: Lang): string {
  if (lang !== "en") return s;
  const hit = DICT[s];
  if (hit != null) return hit;
  if (s.startsWith("进入 ")) return `Enter ${s.slice(3)}`;
  return s;
}

/** 组件内用:`const t = useT()` —— 订阅 uiLang,语言切换时触发重渲。 */
export function useT(): (s: string) => string {
  const lang = useSettingsStore((s) => s.uiLang);
  return (s: string) => translate(s, lang);
}

/** 中英内联二选一(对标原型 window.TL)。 */
export function useTL(): (cn: string, en: string) => string {
  const lang = useSettingsStore((s) => s.uiLang);
  return (cn: string, en: string) => (lang === "en" ? en : cn);
}
```

注意:`关于_Roguent` 这种带空格 key 直接写字符串字面量 key(`"关于 Roguent": "About Roguent"`),上面下划线只是示意。**实现时必须把设计稿 `i18n.js` 的 DICT 全量搬入**(~200 条),不止节选。

Run: `bun test src/web/i18n.test.ts` → PASS。

- [ ] **Step 5: 全量验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add src/web/i18n.ts src/web/i18n.test.ts src/web/settings-store.ts src/web/settings-store.test.ts
git commit -m "feat: 🧩 add i18n dictionary translator + uiLang setting"
```

---

### Task 2: LangToggle + SkinSwitch 占位 —— 左上控件栈扩容

**Files:**
- Create: `src/web/hud/LangToggle.tsx`
- Modify: `src/web/hud/Hud.tsx`(挂载)
- Modify: `src/web/styles.css`(`.lang-toggle` 样式 + `.taskwin` top 下移)

设计参照:`hud.jsx` LangToggle(分段 中|EN)+ `layout.css` `.lang-toggle`。设计稿里该组件定义后未挂载(原型用 Settings 的 radio);真实 app 的 Settings 是 mock 面板,故把 LangToggle 作为**真实入口**挂 HUD 左上控件栈(ViewSwitch 下方)。

- [ ] **Step 1: 实现 LangToggle 组件**

`src/web/hud/LangToggle.tsx`:

```tsx
import { useSettingsStore } from "../settings-store";
import { Icon } from "./icons";

/**
 * 界面语言切换(分段 中 | EN,对标设计原型 hud.jsx LangToggle + layout.css .lang-toggle)。
 * 真实接线:settings-store.uiLang(持久化);所有 useT()/useTL() 消费端联动重渲。
 * 两视图都显示;落左上控件栈(ViewSwitch 下方,见 styles.css 定位)。
 */
export function LangToggle() {
  const uiLang = useSettingsStore((s) => s.uiLang);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const en = uiLang === "en";
  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={() => setSetting("uiLang", en ? "cn" : "en")}
      title={en ? "Switch to 中文" : "切换到 English"}
    >
      <Icon name="spellbook" size={16} />
      <span className={`lang-opt${en ? "" : " on"}`}>中</span>
      <span className={`lang-opt px${en ? " on" : ""}`}>EN</span>
    </button>
  );
}
```

- [ ] **Step 2: 挂载 + CSS**

`Hud.tsx` 在 `<ViewSwitch />` 后追加 `<LangToggle />`(import 同步加)。

`styles.css` 追加(参照设计 layout.css,适配本仓库 token;**同时把 `.taskwin` 的 `top: 366px` 改为 `top: 458px`**,给 LangToggle/SkinSwitch 腾位;SkinSwitch 在 Task 9 落地,本任务先预留布局):

```css
/* ── 界面语言切换(LangToggle,对标原型 layout.css .lang-toggle)──
   落左上控件栈:ViewSwitch top:314 下方;再下方是 SkinSwitch(top:410,T9)与 taskwin(top:458)。 */
.lang-toggle {
  position: absolute;
  top: 362px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  cursor: pointer;
  padding: 8px 11px;
  border: 0;
  background: linear-gradient(180deg, #2c2740, #1a1626);
  box-shadow: inset 0 0 0 2px var(--panel-edge), 0 2px 0 rgba(0, 0, 0, 0.5);
  color: var(--ink-dim);
  transition: filter 0.12s ease, transform 0.12s ease;
}
.lang-toggle:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
}
.lang-toggle .lang-opt {
  font-family: var(--font-cjk);
  font-size: 13px;
  line-height: 1;
  color: var(--ink-dim);
  opacity: 0.5;
  letter-spacing: 0.5px;
}
.lang-toggle .lang-opt.px {
  font-family: var(--font-px);
  font-size: 10px;
}
.lang-toggle .lang-opt.on {
  color: #f2c84b;
  opacity: 1;
  text-shadow: 0 0 6px rgba(242, 200, 75, 0.5);
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add src/web/hud/LangToggle.tsx src/web/hud/Hud.tsx src/web/styles.css
git commit -m "feat: 🧩 add LangToggle segmented control to top-left HUD stack"
```

---

### Task 3: i18n sweep A —— HUD chrome 组件接 useT()

**Files:**
- Modify: `src/web/hud/LimitBars.tsx`、`RosterCard.tsx`、`SessionBanner.tsx`、`ViewSwitch.tsx`、`TaskWindow.tsx`、`Hotbar.tsx`、`ButtonDock.tsx`、`Currency.tsx`、`Minimap.tsx`、`EmptyState.tsx`
- Modify: `src/web/lobby/HubPlaza.tsx`(结构标签/提示文案)
- Modify: `src/web/i18n.ts`(补真实 app 独有条目)
- Modify: `src/web/App.tsx`(`← 大厅` 按钮)

**机械规则(后续 sweep B/C 同):**
1. 组件顶部 `const t = useT();`(必须在任何 early return 之前,守 hooks 规则)。
2. 用户可见的中文字面量 → `t("原文")`。模块级常量数组里的 label 保持中文原文,**渲染处**包 `t(slot.label)`。
3. 字典没有的真实 app 独有文案 → 在 `i18n.ts` DICT 补英译(本任务新增条目示例:`"内景"/"大厅"` 已有;补 `"在岗"` 已有;补 `"WASD / 点击移动 · E 交互"` 用 `useTL("WASD / 点击移动 · E 交互", "WASD / click to move · E interact")`)。
4. **产品术语与英文标签不动**(Claude/Codex/SESSIONS/LIVE/Token…)。
5. 同步落设计稿 v2 的**固定文案改名**(与语言无关):
   - `LimitBars.tsx`:CTX bar 的 `label="CTX"` → `label="Context"`(5h/WEEK 不变,但 `WEEK` → `Weekly` 对齐设计)。
   - `ButtonDock` 重排在 Task 6 做,本任务只接 t()。

- [ ] **Step 1: 逐文件接 useT()/useTL() 并补字典**

每个文件的典型改法(以 `RosterCard.tsx` 为例):

```tsx
import { useT } from "../i18n";
// 组件内:
const t = useT();
// 渲染:<span>{t("在岗")}</span> … {npcs.length} {t("在岗")}
```

`HubPlaza.tsx`:结构标签 `struct-label` 渲染处包 `t(it.label)`;`hub-prompt` 的 `E 进入 X` 用 `${t("进入")} ${t(near.label)}`;`hub-controls` 用 `useTL`。**英文模式下隐藏 `struct-sub`**(对标设计 `window.__LANG!=='en'&&…`):`{lang !== "en" && <span className="struct-sub px">{it.sub}</span>}`(用 `useSettingsStore((s) => s.uiLang)` 取 lang 基元)。

- [ ] **Step 2: 全量验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 i18n sweep A — HUD chrome consumes useT/useTL"
```

---

### Task 4: i18n sweep B —— 面板组接 useT()

**Files:**
- Modify: `src/web/hud/Modal.tsx`(sub 渲染处包 t)、`NpcCard.tsx`、`AgentCard.tsx`、`Tasks.tsx`、`Skills.tsx`、`Leaderboard.tsx`、`LootPanel.tsx`、`Account.tsx`、`ImportPanel.tsx`、`SystemMenu.tsx`、`About.tsx`、`Settings.tsx`、`ModelPicker.tsx`、`SessionGrid.tsx`(只接现存文案;v2 重写在 Task 7/8)、`ChatDrawer.tsx`(仅 chrome:placeholder/按钮/小队条)、`mailbox/MailboxPanel.tsx`、`mailbox/BoardPanel.tsx`、`pairing/PairingPanel.tsx`、`economy/AchievementsPanel.tsx`、`economy/GachaPanel.tsx`、`scheduler/SchedulerPanel.tsx`、`ErrorOverlay.tsx`、`EmptyState.tsx`(若 sweep A 未覆盖)
- Modify: `src/web/i18n.ts`(补条目)

规则同 Task 3。重点对齐设计稿 v2 的固定改名(与语言无关):
- `NpcCard.tsx` / `AgentCard.tsx`:`上下文` 标签 → `Context`(px 字体,百分比不变)。
- `Account.tsx`:用量行 label `5h 限额`→`5h`、`周限额`→`Weekly`;`重置 X`→`Resets in X`;`用量限额 USAGE` 节标题→`Usage`;`CTX`→`Context`。说明性中文(`滚动 5 小时窗口` 等)保留并入典(`"滚动 5 小时窗口": "rolling 5-hour window"`、`"每周一 00:00 重置": "resets Mon 00:00"`)。
- Mock 面板(Settings/Tasks 信箱区/Market)的 mock banner 文案也入典(如 `"示例数据 · 引擎暂无插件市场 / 宝石经济(纯展示)"` → 合理英译)。

- [ ] **Step 1: 逐文件接 useT() 并补字典**(机械,规则见 Task 3)

- [ ] **Step 2: 抽查英文模式渲染**

临时在浏览器跑(或 bun:test 里直接断言 translate 关键串),确认 `translate("待你回应","en") === "Needs you"` 等;组件级靠 tsc + check 把关。

- [ ] **Step 3: 全量验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 i18n sweep B — panels consume useT/useTL"
```

---

### Task 5: Shop 拆分 —— Market(插件市场)+ Shop(装饰商店)+ 挂载 GachaPanel

**Files:**
- Modify: `src/web/ui-store.ts`(PanelId 加 `"market"`)
- Create: `src/web/hud/Market.tsx`
- Modify: `src/web/hud/Shop.tsx`(改纯装饰商店)
- Modify: `src/web/hud/Hud.tsx`(挂 `<Market />` 与 `<GachaPanel />`)
- Modify: `src/web/hud/shop-data.ts`(SHOP_ITEMS 滤 gacha 项的消费端处理;数据文件本身不动)
- Modify: `src/web/styles.css`(`.shop-cat-n`、`.shop-side-note`、`.shop-itemcats`)
- Test: `src/web/hud/_smoke.test.tsx` 若有面板冒烟约定则补 Market 一条

设计参照:`panels2.jsx` 新版 `Market` / `Shop`。真假边界:Market 整面板仍 **mock + banner**(引擎无插件市场);Shop 的 gem 余额/已拥有接真(沿用现状),购买按钮仍 mock;GachaPanel 是**已存在的真组件**(真 WS command),只是从未挂载——本任务把它挂上,`gacha` 路由从 Shop 摘除。

- [ ] **Step 1: PanelId 加 "market"**

`ui-store.ts` 的 `PanelId` 联合加 `| "market"`。

- [ ] **Step 2: 创建 Market.tsx(从现 Shop 的 market tab 拆出 + v2 视觉)**

要点(完整结构照抄现 Shop.tsx market 分支,叠加 v2 改动):

```tsx
import { useState } from "react";
import { useUiStore } from "../ui-store";
import { useT, useTL } from "../i18n";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { SHOP_CATS, SHOP_PLUGINS } from "./shop-data";

/**
 * 插件市场(MARKET)面板(对标设计原型 panels2.jsx v2 的 Market):
 * 从旧 Shop 的「插件市场」tab 拆出独立面板。整面板 mock + banner(引擎无插件市场)。
 */
export function Market() {
  const active = useUiStore((s) => s.activePanel === "market");
  const closePanel = useUiStore((s) => s.closePanel);
  const t = useT();
  const tl = useTL();
  const [cat, setCat] = useState("全部");
  const [q, setQ] = useState("");
  if (!active) return null;

  const owned = SHOP_PLUGINS.filter((p) => p.owned).length;
  const plugins = SHOP_PLUGINS.filter((p) => {
    if (cat === "已安装") return p.owned;
    if (cat !== "全部") return p.cat === cat;
    return true;
  }).filter((p) => !q || p.name.includes(q) || p.desc.includes(q));

  return (
    <Modal title="MARKET" sub={t("插件市场 · MCP / Skills / 插件 · 接入真实能力")}
      icon="mcp" accent="#36c5e0" width={1180} onClose={closePanel}>
      {/* mock banner 照旧;布局 = 旧 market tab,叠加:
          - 分类行「已安装」带计数 <span className="shop-cat-n px">{owned}</span>
          - 侧栏底部说明 <div className="shop-side-note faint">通过 settings.json / config.toml 启用…</div>
          - 插件卡 top 右上加 <span className="chip px">{p.cat}</span>
          - 已拥有 chip 文案 t("已启用") */}
    </Modal>
  );
}
```

(实现时把旧 Shop market 分支 JSX 全量搬入,不留省略号。`Modal` 若无 `accent` prop 则忽略该参数,沿用现有 Modal 签名。)

- [ ] **Step 3: Shop.tsx 改纯装饰商店**

- 删除 market tab/分类搜索/`SHOP_PLUGINS` 引用与 tabs 结构;`active` 判定改 **仅** `activePanel === "shop"`(gacha 摘除)。
- 分类 chips:`const cats = ["全部", "房间", "皮肤", "宠物", "UI"];` 渲染 `.shop-itemcats` 一行 `.shop-cat`。
- 商品列表 `SHOP_ITEMS.filter((it) => !it.gacha)` 再按 cat 过滤。
- 余额条尾部加按钮:`<button type="button" className="pxbtn sm cjk" onClick={() => openPanel("gacha")}>去扭蛋机</button>`(`openPanel` 从 ui-store 取)。
- Modal 标题 `SHOP` / sub `t("装饰商店 · 宝石消费 · 仅外观，不影响开发结果")`。
- mock banner 保留但文案改 `示例商品 · 购买逻辑未接入(宝石余额/已拥有为真)`(入典)。

- [ ] **Step 4: Hud.tsx 挂载**

`<Shop />` 旁追加 `<Market />` 和 `<GachaPanel />`(import `{ GachaPanel } from "./economy/GachaPanel"`)。

- [ ] **Step 5: CSS 补三个类**

```css
.shop-cat-n { font-size: 8px; color: var(--ink-faint); margin-left: auto; font-family: var(--font-px); }
.shop-side-note { font-size: 11px; line-height: 1.7; margin-top: 14px; padding: 0 4px; }
.shop-itemcats { display: flex; gap: 8px; margin-bottom: 14px; }
```

- [ ] **Step 6: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 split Shop into Market (plugins, mock) + decoration Shop; mount real GachaPanel"
```

---

### Task 6: Hotbar / ButtonDock 重排 + 大厅 market 摊位与坐标 delta

**Files:**
- Modify: `src/web/hud/Hotbar.tsx`
- Modify: `src/web/hud/ButtonDock.tsx`
- Modify: `src/web/lobby/HubPlaza.tsx`
- Modify: `src/web/styles.css`(`.dock-sys` 分隔、`.struct-label{white-space:nowrap}`)

设计参照:新版 `hud.jsx` Hotbar/ButtonDock、`lobby.jsx` INTERACT。

- [ ] **Step 1: Hotbar 重排**

```ts
// 左组:工作流(任务/聊天/技能/插件市场/模型/导入);右组:成长与资产(背包/装饰商店/排行/成就)。
const GROUP1: Slot[] = [
  { icon: "quest", panel: "tasks", label: "任务" },
  { icon: "chat", panel: "chat", label: "聊天" },
  { icon: "spellbook", panel: "skills", label: "技能" },
  { icon: "mcp", panel: "market", label: "插件市场" },
  { icon: "crystal", panel: "model", label: "模型" },
  { icon: "import", panel: "import", label: "导入" },
];
const GROUP2: Slot[] = [
  { icon: "pouch", panel: "backpack", label: "背包" },
  { icon: "shop", panel: "shop", label: "装饰商店" },
  { icon: "trophy", panel: "leaderboard", label: "排行榜" },
  { icon: "medal", panel: "achievements", label: "成就" },
];
```

`RoutePanel` 联合同步改(去 mailbox/pairing,加 market/achievements;icons 若无 `medal` 用现有最接近图标并注释)。label 渲染处包 `t()`。

- [ ] **Step 2: ButtonDock 重排**

```ts
// 顺序:通知类(邮箱/公告)→ 身份类(账号/配对)→ 系统类(设置/菜单)。
// 设计稿此槽位是「活动 events」登录活动弹窗;引擎无该数据源 → 用真实公告板(board)占该位,不造假。
const DOCK_BTNS: DockBtn[] = [
  { icon: "vault", panel: "mailbox", label: "信箱" },
  { icon: "trophy", panel: "board", label: "公告" },
  { icon: "account", panel: "account", label: "账号" },
  { icon: "mcp", panel: "pairing", label: "配对" },
  { icon: "gear", panel: "settings", label: "设置", sys: true },
  { icon: "menu", panel: "menu", label: "菜单" },
];
```

`DockBtn` 加可选 `sys?: boolean`,渲染时 `className={…(b.sys ? " dock-sys" : "")}`;`pause` 槽删除。CSS:`.iconbtn.dock-sys { margin-top: 10px; }`(视觉分组)。

- [ ] **Step 3: HubPlaza market 摊位 + 坐标 delta**

INTERACT 数组对齐设计 v2(保持现有结构字段名):
- `altar` y → 236;`ach` → (652, 248);`mail` → (1272, 248)。
- 新增 `{ id: "market", x: 660, y: 452, r: 132, label: "插件市场", sub: "MARKET", action: "market" }`(摊位渲染走现有 stall 分支,icon `mcp`、色 `#36c5e0`)。
- `shop` label → `装饰商店`,stall 色 → `#a06cd5`。
- 装饰小人坐标:`dwarf_m` → (1700, 392)、`wizzard_f` → (1668, 586)。
- CSS 加 `.struct-label { white-space: nowrap; }`。

- [ ] **Step 4: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 reorganize hotbar/dock per design v2; add plugin-market stall to hub"
```

---

### Task 7: SessionGrid v2 纯函数 —— agoLabel / 排序 / 过滤

**Files:**
- Create: `src/web/hud/session-grid-view.ts`
- Create: `src/web/hud/session-grid-view.test.ts`

设计参照:新版 `lobby.jsx` SessionGrid(`agoLabel`/`STATUS_W`/多选过滤)。真实差异:状态枚举是 `busy|idle|done|error`(无 askuser);`lastActiveAt` 是时间戳,分钟数在调用处算。

- [ ] **Step 1: 写失败测试**

```ts
import { expect, test } from "bun:test";
import { agoLabel, applySessionFilters, sortSessions } from "./session-grid-view";
import type { GridSession } from "./session-grid-view";

const mk = (over: Partial<GridSession>): GridSession => ({
  id: "s1", project: "roguent", model: "claude-opus-4-8", runtime: "claude",
  status: "busy", lastActiveAt: 0, ...over,
});

test("agoLabel: now / m / h / d", () => {
  expect(agoLabel(0)).toBe("now");
  expect(agoLabel(38)).toBe("38m ago");
  expect(agoLabel(190)).toBe("3h ago");
  expect(agoLabel(2980)).toBe("2d ago");
  expect(agoLabel(null)).toBe("");
});

test("sortSessions: error 最前,同权重按 lastActiveAt 新→旧", () => {
  const now = 1_000_000;
  const a = mk({ id: "a", status: "idle", lastActiveAt: now - 60_000 });
  const b = mk({ id: "b", status: "error", lastActiveAt: now - 999_000 });
  const c = mk({ id: "c", status: "busy", lastActiveAt: now - 1_000 });
  expect(sortSessions([a, b, c], now).map((s) => s.id)).toEqual(["b", "c", "a"]);
});

test("applySessionFilters: runtime + 项目多选 + 模型多选 + 仅活跃 叠加", () => {
  const ss = [
    mk({ id: "1", runtime: "claude", project: "roguent", model: "m1", status: "busy" }),
    mk({ id: "2", runtime: "codex", project: "pay", model: "m2", status: "idle" }),
    mk({ id: "3", runtime: "claude", project: "pay", model: "m1", status: "done" }),
  ];
  expect(applySessionFilters(ss, { rt: "claude", projects: [], models: [], activeOnly: false }).map((s) => s.id)).toEqual(["1", "3"]);
  expect(applySessionFilters(ss, { rt: "all", projects: ["pay"], models: [], activeOnly: false }).map((s) => s.id)).toEqual(["2", "3"]);
  expect(applySessionFilters(ss, { rt: "all", projects: [], models: ["m1"], activeOnly: true }).map((s) => s.id)).toEqual(["1"]);
});
```

Run: `bun test src/web/hud/session-grid-view.test.ts` → FAIL。

- [ ] **Step 2: 实现**

```ts
import type { RuntimeKind, SessionStatus } from "../../shared/domain";

/** SessionGrid 排序/过滤所需的最小会话视图(Session 的子集,便于单测)。 */
export interface GridSession {
  id: string;
  project?: string;
  model: string;
  runtime: RuntimeKind;
  status: SessionStatus;
  lastActiveAt: number;
}

/** 距最后活跃的分钟数 → "3h ago";null/负数 → ""。(对标设计 agoLabel) */
export function agoLabel(minutes: number | null): string {
  if (minutes == null || minutes < 0) return "";
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

// 状态权重:error(要处理)最前 → busy → idle → done。(设计含 askuser:0;本仓库无 askuser 状态)
const STATUS_W: Record<SessionStatus, number> = { error: 0, busy: 1, idle: 2, done: 3 };

/** 状态权重升序,同权重按 lastActiveAt 降序(新的在前)。不就地排序。 */
export function sortSessions<T extends GridSession>(list: T[], _now: number): T[] {
  return [...list].sort(
    (a, b) => STATUS_W[a.status] - STATUS_W[b.status] || b.lastActiveAt - a.lastActiveAt,
  );
}

export interface SessionFilters {
  rt: "all" | RuntimeKind;
  projects: string[];
  models: string[];
  activeOnly: boolean;
}

/** 活跃 = busy 或 error(等同设计的 active/askuser/error;本仓库无 askuser)。 */
const ACTIVE: SessionStatus[] = ["busy", "error"];

export function applySessionFilters<T extends GridSession>(list: T[], f: SessionFilters): T[] {
  return list.filter(
    (s) =>
      (f.rt === "all" || (s.runtime ?? "claude") === f.rt) &&
      (!f.projects.length || f.projects.includes(s.project ?? "")) &&
      (!f.models.length || f.models.includes(s.model)) &&
      (!f.activeOnly || ACTIVE.includes(s.status)),
  );
}

export function hasAnyFilter(f: SessionFilters): boolean {
  return f.rt !== "all" || f.projects.length > 0 || f.models.length > 0 || f.activeOnly;
}
```

Run: `bun test src/web/hud/session-grid-view.test.ts` → PASS。

- [ ] **Step 3: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add src/web/hud/session-grid-view.ts src/web/hud/session-grid-view.test.ts
git commit -m "feat: 🧩 session-grid v2 pure helpers (agoLabel/sort/filters)"
```

---

### Task 8: SessionGrid v2 组件 —— 多级过滤 UI + 置灰 + 相对时间

**Files:**
- Modify: `src/web/hud/SessionGrid.tsx`
- Modify: `src/web/styles.css`(`.sg-filters/.sg-frow/.sg-flab/.sg-fsp/.fchip/.fc-n/.sg-clear/.sg-card.inactive/.sg-foot/.sg-time/.sg-chips/.sg-proj 悬停态/.sg-empty` —— 照设计 `extra.css` SESSION GRID v2 段搬,适配 token)

设计参照:新版 `lobby.jsx` SessionGrid + `extra.css`。真假边界:全部接真(sessions/lastActiveAt/runtime/model);**修掉现存 bug:卡片 runtime chip 硬编码 "Claude"** → 按 `s.runtime` 渲染 Claude/Codex。Scheduled Tasks 页签(真)保留为模式切换,不被过滤行取代。

- [ ] **Step 1: 重写过滤区与卡片**

要点(完整对照设计 v2;保持 zustand selector 铁律——sessions 取稳定 map,派生在 useMemo):

```tsx
const sessions = useRoomStore((s) => s.sessions);
const [mode, setMode] = useState<"sessions" | "scheduled">("sessions");
const [rt, setRt] = useState<"all" | "claude" | "codex">("all");
const [projSel, setProjSel] = useState<string[]>([]);
const [modelSel, setModelSel] = useState<string[]>([]);
const [activeOnly, setActiveOnly] = useState(false);
const now = Date.now();

const all = useMemo(
  () => Object.values(sessions).filter((s) => !s.archived),
  [sessions],
);
const rtList = useMemo(
  () => applySessionFilters(all, { rt, projects: [], models: [], activeOnly: false }),
  [all, rt],
);
const projects = useMemo(() => [...new Set(rtList.map((s) => s.project ?? ""))].filter(Boolean), [rtList]);
const models = useMemo(() => [...new Set(rtList.map((s) => s.model))], [rtList]);
const filters = { rt, projects: projSel, models: modelSel, activeOnly };
const list = useMemo(
  () => sortSessions(applySessionFilters(all, filters), now),
  // eslint 注释非本仓库约定;biome 下直接列依赖
  [all, rt, projSel, modelSel, activeOnly, now],
);
```

- 切 rt 时清掉失效的 projSel/modelSel(对标设计 `setRt`)。
- 过滤区三行 `.sg-frow`:RUNTIME(全部/Claude/Codex 带计数,fchip)+ 仅活跃 + `✕ 清除筛选`(hasAnyFilter 时显);项目行(多选,色用 `--ac`)/ 模型行(多选,金色)。fchip:

```tsx
function FChip({ on, label, count, onClick, ac }: { on: boolean; label: string; count?: number; onClick: () => void; ac?: string }) {
  return (
    <button type="button" className={`fchip${on ? " on" : ""}`}
      style={ac ? ({ "--ac": ac } as React.CSSProperties) : undefined} onClick={onClick}>
      <span className="cjk">{label}</span>
      {count != null && <span className="fc-n px">{count}</span>}
    </button>
  );
}
```

- 卡片改动:
  - `inactive`(idle/done)加 `.inactive` class(置灰,hover 还原走 CSS)。
  - runtime chip:`s.runtime === "codex" ? "Codex" : "Claude"`,class `tag-codex`/`tag-claude`;旁加 model chip(`shortModel` 若已有工具函数则复用,否则原样 `s.model`)。
  - `sg-proj` 可点:`onClick={(e) => { e.stopPropagation(); togProj(s.project ?? ""); }}`,显示 `# ${project}`,选中态 `.on`。
  - 底部 `.sg-foot`:`{tokens}k tok · {n}P` + `<span className={"sg-time px" + (s.status === "busy" ? " live" : "")}>{agoLabel((now - s.lastActiveAt) / 60000)}</span>`。
  - 导入卡仅 `!hasAnyFilter(filters)` 时渲染。
  - `list.length === 0` 时 `.sg-empty`(搜索图标 + `没有匹配的会话` + 清除筛选按钮)。
- 顶部模式条:`会话` / `Scheduled Tasks` 两个 tab(原四 tab 中 runtime 部分移入过滤行)。
- 文案全部走 `t()`(`"仅活跃"`/`"清除筛选"`/`"没有匹配的会话"` 等入典)。
- sub 文案:`任务台 · ${list.length} / ${all.length} 会话`。

- [ ] **Step 2: CSS 搬运**

把设计 `extra.css` 的 `SESSION GRID v2` 段(`.sg-filters` 起到 `.sg-empty` 止)整段搬入 `styles.css`,token 名按本仓库(`--panel-edge/--panel-hi/--ink*` 已同名)。`color-mix` 可直接用(目标 WebKit/Chromium 均支持)。

- [ ] **Step 3: 已有单测核对**

`store.test.ts` 等不受影响;若 `_smoke.test.tsx` 渲染 SessionGrid,跑通即可。

- [ ] **Step 4: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 SessionGrid v2 — stacked filters, status sort, inactive dim, last-active time"
```

---

### Task 9: skin 基建 —— settings.skin + SkinSwitch + holo 强制青

**Files:**
- Modify: `src/web/settings-store.ts`(`skin` 字段 + rootClass/rootStyle)
- Modify: `src/web/settings-store.test.ts`
- Create: `src/web/hud/SkinSwitch.tsx`
- Modify: `src/web/hud/Hud.tsx`(挂载)
- Modify: `src/web/styles.css`(`.skin-switch` 段,照设计 extra.css)

- [ ] **Step 1: 失败测试**

`settings-store.test.ts` 追加:

```ts
test("parsePersisted 接受 skin", () => {
  expect(parsePersisted(JSON.stringify({ skin: "holo" })).skin).toBe("holo");
  expect(parsePersisted(JSON.stringify({ skin: "x" })).skin).toBeUndefined();
});
test("holo 皮肤强制青色 accent 与 core-glow", () => {
  const s = { ...DEFAULT_SETTINGS, skin: "holo" as const };
  expect(settingsRootClass(s)).toContain("skin-holo");
  expect(settingsRootStyle(s)["--accent"]).toBe("#36e0ff");
  expect(settingsRootStyle(s)["--core-glow"]).toBe("rgba(54,200,255,.3)");
});
```

Run → FAIL。

- [ ] **Step 2: 实现 settings-store**

```ts
// Settings 接口:
  /** 场景皮肤:dungeon 暖木地牢(默认)/ holo 全息蓝科技。驱动 skin-* class;holo 强制青色 accent。 */
  skin: "dungeon" | "holo";
// DEFAULT_SETTINGS: skin: "dungeon",
// parsePersisted: if (obj.skin === "dungeon" || obj.skin === "holo") out.skin = obj.skin;
// savePersisted: 解构/序列化加 skin。
// settingsRootClass: 数组加 `skin-${s.skin}`。
// settingsRootStyle(对标设计 app.jsx HOLO_RUNE 逻辑):
const HOLO_ACCENT = "#36e0ff";
export function settingsRootStyle(s: Settings): Record<"--accent" | "--core-glow", string> {
  if (s.skin === "holo") {
    return { "--accent": HOLO_ACCENT, "--core-glow": "rgba(54,200,255,.3)" };
  }
  return { "--accent": s.accent, "--core-glow": GLOW[s.theme] };
}
```

Run → PASS。

- [ ] **Step 3: SkinSwitch 组件 + 挂载 + CSS**

```tsx
import { useSettingsStore } from "../settings-store";
import { useTL } from "../i18n";

/** 场景皮肤切换(地牢/全息,对标设计 app.jsx skin-switch)。两视图都显示,落 LangToggle 下方。 */
export function SkinSwitch() {
  const skin = useSettingsStore((s) => s.skin);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const tl = useTL();
  return (
    <div className="skin-switch">
      <div className="skin-lab px">{tl("场景", "SCENE")}</div>
      <button type="button" className={`skin-opt${skin === "dungeon" ? " on" : ""}`}
        onClick={() => setSetting("skin", "dungeon")}>
        <span className="skin-dot dungeon" />{tl("地牢", "Dungeon")}
      </button>
      <button type="button" className={`skin-opt${skin === "holo" ? " on" : ""}`}
        onClick={() => setSetting("skin", "holo")}>
        <span className="skin-dot holo" />{tl("全息", "Holo")}
      </button>
    </div>
  );
}
```

Hud.tsx 在 `<LangToggle />` 后挂 `<SkinSwitch />`。CSS 照设计 extra.css `.skin-switch` 段搬,外加定位 `position:absolute; top:410px; left:12px;`(`.taskwin` top 已在 Task 2 改为 458)。`.skin-opt` 是 button → 补 `border:0; background:transparent`(按钮 UA 样式重置,见仓库 react-render-gotchas 约定)再叠设计的选中态背景。

- [ ] **Step 4: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 scene skin setting + SkinSwitch control (dungeon/holo)"
```

---

### Task 10: holo 皮肤视觉 —— CSS 全套 + PixiJS holo 地板

**Files:**
- Modify: `src/web/styles.css`(`skin-holo` 全段)
- Modify: `src/web/room/DungeonRoom.tsx`(holo 地板分支)
- Create: `src/web/room/holo.ts`(确定性 hash + 节点布点纯函数)
- Create: `src/web/room/holo.test.ts`

设计参照:`extra.css` HOLO 段 + `room.jsx` holo canvas 分支。适配差异:真实内景是**单张 PixiJS canvas**(地板+小人同画布),设计的 `.room-canvas` 与 `.pxsprite` 分开滤镜在此合并为:① Pixi 内部用 graphics 画 holo 地板(不靠 CSS 滤镜)② 小人/精灵的全息蓝靠 canvas 整体滤镜会把 graphics 地板二次染色——**故 Pixi 端不加 CSS 滤镜**,holo 地板直接用目标色绘制,小人保持原色叠青色 drop-shadow 由 Pixi 滤镜成本过高 → 取舍:**小人不染色**(保留可读性),房间氛围靠地板/扫描线/面板全息化。大厅(DOM)按设计全套滤镜照搬。

- [ ] **Step 1: holo.ts 纯函数 + 失败测试**

```ts
// holo.test.ts
import { expect, test } from "bun:test";
import { holoHash, holoNodes } from "./holo";

test("holoHash 确定性且落 [0,1)", () => {
  expect(holoHash(3, 5)).toBe(holoHash(3, 5));
  expect(holoHash(3, 5)).toBeGreaterThanOrEqual(0);
  expect(holoHash(3, 5)).toBeLessThan(1);
});
test("holoNodes 只产出 hash<0.5 的稀疏节点且坐标在界内", () => {
  const nodes = holoNodes(20, 12);
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) {
    expect(n.c).toBeGreaterThanOrEqual(2);
    expect(n.c).toBeLessThan(20);
    expect(n.r).toBeGreaterThanOrEqual(3);
    expect(n.r).toBeLessThan(12);
    expect(n.a).toBeGreaterThanOrEqual(0.18);
  }
});
```

```ts
// holo.ts
/** 确定性伪随机(对标设计 room.jsx 的 hash):同输入永远同输出,便于测试与回放一致。 */
export function holoHash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export interface HoloNode { c: number; r: number; a: number; }

/** 发光网格交点(稀疏):行 3..ROWS-1 步进 2,列 2..COLS-1 步进 3,hash<0.5 取点。 */
export function holoNodes(cols: number, rows: number): HoloNode[] {
  const out: HoloNode[] = [];
  for (let r = 3; r < rows; r += 2) {
    for (let c = 2; c < cols; c += 3) {
      const h = holoHash(c * 9 + 1, r * 5 + 3);
      if (h < 0.5) out.push({ c, r, a: 0.18 + h * 0.5 });
    }
  }
  return out;
}
```

Run → PASS(先 FAIL 后实现)。

- [ ] **Step 2: DungeonRoom holo 分支**

`DungeonRoom.tsx`:读 `const skin = useSettingsStore((s) => s.skin);`(import settings-store)。`skin === "holo"` 时:跳过 tiles/banners/fountains 渲染,改渲染 `<HoloFloor />`;门(`doors_leaf_open`)、宝箱、`DecorLayer` 保留。

```tsx
import type { Graphics } from "pixi.js";
import { useCallback } from "react";
import { holoNodes } from "./holo";

/** 全息蓝科技地板(对标设计 room.jsx holo 分支):海军蓝甲板 + 发光网格 + 稀疏节点 + 顶部能量墙带。 */
function HoloFloor() {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const W = COLS * TILE;
    const H = ROWS * TILE;
    g.rect(0, 0, W, H).fill(0x091628);
    // 顶部能量墙带
    g.rect(0, 0, W, 2 * TILE).fill(0x0a1c2e);
    g.rect(0, 2 * TILE - 3, W, 3).fill({ color: 0x36c5e0, alpha: 0.5 });
    g.rect(0, 2 * TILE, W, 16).fill({ color: 0x36c5e0, alpha: 0.14 });
    // 网格(行向后渐亮,对标设计 dep 渐变)
    for (let c = 0; c <= COLS; c++) {
      const a = 0.1 + 0.05 + 0.05 * Math.sin(c * 0.7);
      g.moveTo(c * TILE, 2 * TILE).lineTo(c * TILE, H).stroke({ color: 0x36c5e0, alpha: a, width: 1 });
    }
    for (let r = 2; r <= ROWS; r++) {
      const dep = (r - 2) / (ROWS - 2);
      g.moveTo(0, r * TILE).lineTo(W, r * TILE).stroke({ color: 0x36c5e0, alpha: 0.06 + dep * 0.16, width: 1 });
    }
    // 发光交点
    for (const n of holoNodes(COLS, ROWS)) {
      g.rect(n.c * TILE - 2, n.r * TILE - 2, 4, 4).fill({ color: 0x5fe0ff, alpha: n.a });
    }
  }, []);
  return <pixiGraphics draw={draw} />;
}
```

(PixiJS v8 Graphics API:`rect().fill()` / `moveTo().lineTo().stroke()`;如仓库内已有 pixiGraphics 用例则照其写法。)

- [ ] **Step 3: CSS skin-holo 全段**

照设计 `extra.css` HOLO 段搬入 `styles.css`,选择器适配真实 DOM:
- `.skin-holo` 重定义 `--panel/--panel-2/--panel-edge/--panel-hi/--panel-deep/--titlebar`(若本仓库 token 名有出入,按 styles.css 现名对应)。
- `.skin-holo .panel`、`.panel-titlebar`、`.pxbtn`、`.pxbtn.gold`、`.iconbtn`、`.tab` 等青玻璃覆盖 —— 直接照搬。
- 扫描线/网格 overlay:设计的 `.world::before` → 真实内景容器;内景 Room 外层是 `style={{position:"absolute",inset:0}}` 的 div,**给它加 className="room-host"** 再 `.skin-holo .room-host::before/::after`(Room.tsx 一行改动);大厅用 `.skin-holo .hub::before/::after`。
- 大厅 DOM 滤镜:`.skin-holo .hub-floor { filter: sepia(1) hue-rotate(150deg) saturate(2.1) brightness(1.06); }`、`.skin-holo .hub { background:#050b16; }`、`.skin-holo .vignette{…}` 照设计。
- `.no-motion` 守卫:`.no-motion .skin-holo …::before { animation: none; }` 注意真实结构是 `.stage.skin-holo.no-motion`(同节点),写成 `.skin-holo.no-motion .room-host::before { animation: none; }`。

- [ ] **Step 4: preview 冒烟**

`bun run dev:engine -- --replay fixtures/sample-run.jsonl` + preview 起 `dev:web`,切 SkinSwitch 看:内景地板变全息网格、面板变青玻璃、大厅变深蓝;切回 dungeon 恢复;no-motion 下无扫描动画。截图留证。

- [ ] **Step 5: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 holo scene skin — cyan glass panels, scanline overlay, PixiJS holo floor"
```

---

### Task 11: BrowserScreen 内景大屏 —— 接真 tool 活动

**Files:**
- Create: `src/web/hud/BrowserScreen.tsx`
- Create: `src/web/hud/browser-screen-view.ts`(纯函数:timeline → 大屏视图数据)
- Create: `src/web/hud/browser-screen-view.test.ts`
- Modify: `src/web/App.tsx` 或 `src/web/hud/Hud.tsx`(内景挂载)
- Modify: `src/web/styles.css`(`.bigscreen*`/`.bs-*` 段,照设计 extra.css)

设计参照:新版 `hud.jsx` BrowserScreen + `extra.css` BIG COMMAND VIEWSCREEN 段。**真假边界(关键取舍)**:设计稿是假浏览器轮播;引擎没有浏览器画面流,但有**真实 tool 活动**(`TimelineToolItem`:toolName/inputSummary/status/agentId)。故大屏实现为「指挥大屏 · 实时工具流」:
- tab 显示当前会话标题;url 栏显示最近 tool 的 `inputSummary`(截断);caption 显示 `agent 名 + toolName`;`DRIVING/LIVE` 徽标 = 最近 tool `running` 与否。
- 线框页面块/扫描线/光标为纯装饰动画(不声称任何数据),光标仅 motion 开启时游走。
- 无任何 tool 活动时显示空闲态(`IDLE` + 占位文案),不造数据。

- [ ] **Step 1: 纯函数 + 失败测试**

```ts
// browser-screen-view.ts
import type { Session, TimelineToolItem } from "../../shared/domain";

export interface ScreenView {
  tab: string;
  url: string;       // 最近 tool 的 inputSummary(≤64 字符,尾部省略)
  caption: string;   // "AgentName · ToolName"
  busy: boolean;     // 最近 tool 仍 running
  idle: boolean;     // 无任何 tool 活动
}

/** 从会话 timeline 提取大屏视图:取最后一个 kind==="tool" 的条目。 */
export function screenViewOf(session: Session | null): ScreenView {
  const empty: ScreenView = { tab: session?.title ?? "—", url: "", caption: "", busy: false, idle: true };
  if (!session) return empty;
  let last: TimelineToolItem | null = null;
  for (let i = session.timeline.length - 1; i >= 0; i--) {
    const it = session.timeline[i];
    if (it && it.kind === "tool") { last = it; break; }
  }
  if (!last) return empty;
  const agentName = (last.agentId && session.agents[last.agentId]?.name) || "Orchestrator";
  const raw = last.inputSummary || "";
  return {
    tab: session.title,
    url: raw.length > 64 ? `${raw.slice(0, 63)}…` : raw,
    caption: `${agentName} · ${last.toolName}`,
    busy: last.status === "running",
    idle: false,
  };
}
```

测试(构造最小 Session stub,用 `createSession` 若可直接构造则更好):

```ts
import { expect, test } from "bun:test";
import { screenViewOf } from "./browser-screen-view";
// 用 src/shared/domain 的 createSession/createAgent 构造,再手动 push timeline tool 条目。
test("无 tool 活动 → idle", () => { /* timeline 空 → idle true */ });
test("最近 running tool → busy + caption 含 agent 名与 toolName", () => { /* … */ });
test("inputSummary 截断到 64", () => { /* … */ });
```

(实现者用真实 `createSession`/`createAgent` 工厂;若字段必填项多,参考 `store.test.ts` 现有构造手法。)

- [ ] **Step 2: BrowserScreen 组件**

结构照设计 `hud.jsx` BrowserScreen JSX(chrome 红黄绿点/tab/LIVE 徽标/url 栏/线框页/扫描线/caption),数据换 `screenViewOf`:

```tsx
const sessionId = useRoomStore((s) => s.currentSessionId);
const session = useRoomStore((s) => (sessionId ? (s.sessions[sessionId] ?? null) : null));
const inInterior = useUiStore((s) => s.view !== "overworld");
const view = screenViewOf(session);
if (!inInterior) return null;
```

- 注意 selector:`s.sessions[id]` 是稳定引用,合规。timeline 更新会替换 session 对象 → 自动重渲。
- 光标游走:`useSpriteTick` 等价物若仓库无,用 `useEffect + setInterval`(motion gate:`useSettingsStore((s) => s.motion)`,关动效时静止)。
- 空闲态:`view.idle` 时 LIVE 徽标显示 `IDLE`(灰),url 栏显示 `—`,caption 显示 `t("等待工具调用…")`(入典 `"等待工具调用…": "Waiting for tool calls…"`)。

挂载:内景在 `Hud` 中加 `<BrowserScreen />`(组件自带 inInterior gate);`.bigscreen` 绝对定位 top:84 居中,z-index 低于模态 scrim。

- [ ] **Step 3: CSS 搬运**

设计 `extra.css` 的 BIG COMMAND VIEWSCREEN 全段(`.bigscreen` 起到 `.bs-flicker`/caption 止)搬入 `styles.css`;`.no-motion` 守卫扫描/浮动动画(同节点写法 `.stage.no-motion .bigscreen{animation:none}` 等)。

- [ ] **Step 4: preview 冒烟**

回放 fixture 跑起来,进内景:大屏出现、caption 随回放的 tool 事件变化、无 tool 时 IDLE。截图。

- [ ] **Step 5: 验证 + 提交**

```bash
bun test && bun run check && bunx tsc --noEmit
git add -A
git commit -m "feat: 🧩 interior command viewscreen fed by real tool timeline"
```

---

### Task 12: 收尾 —— ROADMAP 回写 + 全量门禁 + 合并

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: ROADMAP 回写**

- §3.5 后追加「设计稿 v2 增量(2026-06-11)」小节:列 7 块增量的落地状态与真假边界(Market mock / BrowserScreen 接真 tool 流 / events 弹窗与 git banner 未实现的原因:无数据源)。
- 顺手修正已过期条目:文档地图里 full-prototype-integration 行状态「📋 待实现」→「✅ 已实现合入(merge `53816d9`,Tasks 0-67)」;baseline 行注明新 HEAD。
- 变更记录加一行(含本次 merge SHA,合并后回填)。

- [ ] **Step 2: 全量门禁**

```bash
bun test && bun run check && bunx tsc --noEmit && bun run typecheck:e2e && bun run build
```

全绿才继续;任一失败先修。

- [ ] **Step 3: 回放冒烟清单(浏览器,零额度)**

`bun run dev:engine -- --replay fixtures/sample-run.jsonl` + `bun run dev:web`,逐项:
1. 中|EN 切换:HUD/面板文案切换,Claude/Codex/Token 等术语不变,刷新后保持。
2. 地牢/全息切换:内景地板、面板、大厅三处变化;刷新后保持。
3. 大屏:回放中 caption 随 tool 事件走,空闲 IDLE。
4. hotbar/dock 新顺序;插件市场(mock banner)与装饰商店、扭蛋机三面板各自打开。
5. SessionGrid:过滤 chips 叠加/清除、置灰、`xm ago`、空匹配态、导入卡条件显示。
6. 大厅:market 摊位可走近 E 交互。

- [ ] **Step 4: 合并回 main**

```bash
# worktree 内
git log --oneline   # 记下 HEAD SHA
cd /Users/poco/Projects/Roguent
git merge --no-ff <worktree-HEAD-SHA> -m "merge: 🔀 integrate design handoff v2 delta (i18n / holo skin / viewscreen / market split / session-grid v2)"
bun test && bun run check && bunx tsc --noEmit
git worktree remove .worktrees/design-delta-v2
```

push 到 origin 需用户确认(workflow 约定),**不要自行 push**。

---

## 明确不做(写给实现者,防止范围蔓延)

- **events 登录活动弹窗 / dailyRewards**:引擎无数据源,设计稿 dock 的「活动」槽位用真实公告板(board)占位。不造签到数据。
- **git 状态横幅(gitbanner)**:引擎无 git 状态事件;真实 SessionBanner 维持现状,只接 i18n。设计的 gitbanner CSS 不搬。
- **PlayerCard**:真实 app 用 LimitBars+RosterCard 承载同信息,不新建。
- **WishingSpot/loot 移位**:真实内景无 WishingSpot;宝箱在左侧 (2,3) 瓦格,与顶中大屏不冲突,不动。
- **Codex 真接入**:维持视觉占位现状(引擎只跑 Claude)。
- **设计稿 Settings 面板的 uiLanguage/uiFont radio**:Settings 是 mock 面板,语言真实入口是 LangToggle;不在 mock 面板里造真控件。
