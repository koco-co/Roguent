# 聊天窗口右侧单栏抽屉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ChatDrawer` 从居中 Modal(双栏)改成忠实复刻设计原型的右侧单栏抽屉,气泡按 markdown 渲染真实消息,侧栏带走的「新建会话 / 归档复活」收进头部「会话」弹层。

**Architecture:** 新增两个纯函数模块(`model-label.ts`、`markdown.ts`)做可单测的逻辑,先 TDD 落地;再把组件 + CSS 作为一次原子改动替换(避免出现「样式删了但组件还在用旧类」的中间破窗)。抽屉沿用既有 `.scrim` 式真像素覆盖层套路(HUD/面板不进 1920×1080 缩放舞台),从视口右边缘滑入。不接 token 流式、不动引擎、不碰其它面板,导出名仍 `ChatDrawer`。

**Tech Stack:** React 19 + Zustand + Biome + `bun:test`;纯 CSS(`src/web/styles.css`)。

**基线:** `main` @ `97eed2d`(spec commit 之后)。设计 spec:`docs/superpowers/specs/2026-06-06-chat-right-drawer-design.md`。

**执行环境:** 按项目 `.claude/rules/workflow.md`,在 detached worktree 内实现(`git worktree add --detach .worktrees/chat-right-drawer main`),`bun install`/symlink `node_modules`,全部 commit 在 worktree 内完成,验证通过后回主树 `git merge --no-ff`。

---

## File Structure

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `src/web/hud/model-label.ts` | 模型 id → 简短展示名(抽屉副标用),未知回落原串 | Create |
| `src/web/hud/model-label.test.ts` | `modelLabel` 单测 | Create |
| `src/web/hud/markdown.ts` | 零依赖迷你 markdown→HTML(先转义后渲染,输出对齐 `.md-*` 类) | Create |
| `src/web/hud/markdown.test.ts` | `mdToHtml` 单测(含 XSS 转义) | Create |
| `src/web/hud/ChatDrawer.tsx` | 重写为右侧单栏抽屉 + markdown 气泡 + 头部会话管理弹层 | Modify(整体重写) |
| `src/web/styles.css` | 退役旧 `.chat-*`(保 `.chat-sess`),新增 `.cdrawer-*`/`.cmsg-*`/`.md-*`/`.cdrawer-mgr` | Modify(替换 chat 段) |

`Hud.tsx` 不改(仍 `import { ChatDrawer }`)。

---

## Task 1: `modelLabel` 模型短名映射(TDD)

**Files:**
- Create: `src/web/hud/model-label.ts`
- Test: `src/web/hud/model-label.test.ts`

- [ ] **Step 1: 写失败测试**

`src/web/hud/model-label.test.ts`:

```ts
import { expect, test } from "bun:test";
import { modelLabel } from "./model-label";

test("maps known model ids to short names", () => {
  expect(modelLabel("claude-opus-4-8")).toBe("Opus 4.8");
  expect(modelLabel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
});

test("falls back to raw id for unknown model", () => {
  expect(modelLabel("gpt-foo")).toBe("gpt-foo");
});

test("returns em dash for missing model", () => {
  expect(modelLabel(undefined)).toBe("—");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/hud/model-label.test.ts`
Expected: FAIL —— `Cannot find module './model-label'`。

- [ ] **Step 3: 写最小实现**

`src/web/hud/model-label.ts`:

```ts
/** 模型 id → 简短展示名(抽屉副标 / 任何只需短名处)。未知 id 回落原串,缺省回落 "—"。
 *  与 ModelPicker 的卡片数据同源 id,但此处只保留 id→短名,避免重复整块模型数据。 */
const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export function modelLabel(id: string | undefined): string {
  if (!id) return "—";
  return MODEL_LABELS[id] ?? id;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/hud/model-label.test.ts`
Expected: PASS(3 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/web/hud/model-label.ts src/web/hud/model-label.test.ts
git commit -m "feat: 🧩 add modelLabel id→短名 helper"
```

---

## Task 2: `mdToHtml` 迷你 markdown 渲染器(TDD)

**Files:**
- Create: `src/web/hud/markdown.ts`
- Test: `src/web/hud/markdown.test.ts`

移植自设计原型 `panels2.jsx` 的 `escHtml`/`mdInline`/`mdToHtml`。关键安全点:**先 `escHtml` 再渲染**,故输出可安全用于 `dangerouslySetInnerHTML`。

- [ ] **Step 1: 写失败测试**

`src/web/hud/markdown.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mdToHtml } from "./markdown";

test("renders plain paragraph", () => {
  expect(mdToHtml("hello world")).toBe('<p class="md-p">hello world</p>');
});

test("renders bold and inline code", () => {
  expect(mdToHtml("**bold** and `code`")).toBe(
    '<p class="md-p"><strong>bold</strong> and <code class="md-code">code</code></p>',
  );
});

test("renders headings h1 and h4 with level class", () => {
  expect(mdToHtml("# A")).toBe('<div class="md-h md-h1">A</div>');
  expect(mdToHtml("#### D")).toBe('<div class="md-h md-h4">D</div>');
});

test("renders unordered list under one ul wrapper", () => {
  expect(mdToHtml("- a\n- b")).toBe(
    '<ul class="md-ul"><li>a</li><li>b</li></ul>',
  );
});

test("renders ordered list under one ol wrapper", () => {
  expect(mdToHtml("1. a\n2. b")).toBe(
    '<ol class="md-ol"><li>a</li><li>b</li></ol>',
  );
});

test("renders fenced code block, escaping html inside", () => {
  expect(mdToHtml("```\nconst x = a < b;\n```")).toBe(
    '<pre class="md-pre"><code>const x = a &lt; b;</code></pre>',
  );
});

test("renders blockquote", () => {
  expect(mdToHtml("> quoted")).toBe(
    '<blockquote class="md-bq">quoted</blockquote>',
  );
});

test("renders horizontal rule", () => {
  expect(mdToHtml("---")).toBe('<hr class="md-hr">');
});

test("renders link with target/rel hardening", () => {
  expect(mdToHtml("[t](https://x.dev)")).toBe(
    '<p class="md-p"><a href="https://x.dev" target="_blank" rel="noopener">t</a></p>',
  );
});

test("escapes raw html to prevent injection", () => {
  expect(mdToHtml("<img src=x onerror=alert(1)>")).toBe(
    '<p class="md-p">&lt;img src=x onerror=alert(1)&gt;</p>',
  );
});

test("returns empty string for empty input", () => {
  expect(mdToHtml("")).toBe("");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/web/hud/markdown.test.ts`
Expected: FAIL —— `Cannot find module './markdown'`。

- [ ] **Step 3: 写实现**

`src/web/hud/markdown.ts`:

```ts
/** 迷你 markdown → HTML 渲染器,从设计原型 panels2.jsx 移植(零依赖)。
 *  **先 escHtml 再渲染**,故输出可安全用于 dangerouslySetInnerHTML;输入为 agent/用户
 *  的消息文本。输出类名严格对齐 styles.css 的 .md-*,保证与原型像素一致。 */

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

export function mdToHtml(src: string): string {
  const lines = escHtml(src || "").split("\n");
  let out = "";
  let i = 0;
  let list: "ul" | "ol" | null = null;
  const closeL = () => {
    if (list) {
      out += `</${list}>`;
      list = null;
    }
  };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln.trim())) {
      closeL();
      i++;
      let code = "";
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code += `${lines[i]}\n`;
        i++;
      }
      i++;
      out += `<pre class="md-pre"><code>${code.replace(/\n$/, "")}</code></pre>`;
      continue;
    }
    const hm = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      closeL();
      out += `<div class="md-h md-h${hm[1].length}">${mdInline(hm[2])}</div>`;
      i++;
      continue;
    }
    if (/^---+$/.test(ln.trim())) {
      closeL();
      out += '<hr class="md-hr">';
      i++;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      closeL();
      out += `<blockquote class="md-bq">${mdInline(ln.replace(/^>\s?/, ""))}</blockquote>`;
      i++;
      continue;
    }
    const um = ln.match(/^[-*]\s+(.*)$/);
    if (um) {
      if (list !== "ul") {
        closeL();
        out += '<ul class="md-ul">';
        list = "ul";
      }
      out += `<li>${mdInline(um[1])}</li>`;
      i++;
      continue;
    }
    const om = ln.match(/^(\d+)\.\s+(.*)$/);
    if (om) {
      if (list !== "ol") {
        closeL();
        out += '<ol class="md-ol">';
        list = "ol";
      }
      out += `<li>${mdInline(om[2])}</li>`;
      i++;
      continue;
    }
    if (ln.trim() === "") {
      closeL();
      i++;
      continue;
    }
    closeL();
    out += `<p class="md-p">${mdInline(ln)}</p>`;
    i++;
  }
  closeL();
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/web/hud/markdown.test.ts`
Expected: PASS(11 tests)。若某条失败,逐条比对预期 HTML 字符串(注意原型先转义、列表合并到单个包裹标签)。

- [ ] **Step 5: lint 校验 + 提交**

Run: `bun run check`
Expected: 无 error(若 Biome 报格式差异,运行 `bunx @biomejs/biome check --write src/web/hud/markdown.ts src/web/hud/markdown.test.ts src/web/hud/model-label.ts src/web/hud/model-label.test.ts` 后重跑)。

```bash
git add src/web/hud/markdown.ts src/web/hud/markdown.test.ts
git commit -m "feat: 🧩 add mini markdown renderer (escaped, .md-* classes)"
```

---

## Task 3: 重写 `ChatDrawer.tsx` + 替换 chat 样式(单次原子提交)

组件与其样式是一次逻辑改动,**同一 commit** 落地,避免「样式删了组件还引用旧类」的中间破窗。

**Files:**
- Modify: `src/web/hud/ChatDrawer.tsx`(整体重写)
- Modify: `src/web/styles.css`(替换 chat 段:退役旧 `.chat-*`,保 `.chat-sess`,新增抽屉/markdown/弹层样式)

- [ ] **Step 1: 重写组件 `src/web/hud/ChatDrawer.tsx`**

整文件替换为:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Icon } from "./icons";
import { mdToHtml } from "./markdown";
import { modelLabel } from "./model-label";

/**
 * 聊天抽屉 ChatDrawer(对标设计原型 panels2.jsx 的 Chat,由居中 Modal 改回右侧单栏抽屉):
 * 贴右满高玻璃抽屉,头部=当前会话名 + `claude · 模型 · NP` + 「会话」管理弹层;对话流按
 * markdown 渲染**真实整轮消息**,输入框发真 sendMessage。**真数据面板,不是 mock**。
 *
 * 原左侧会话侧栏删除,其独有的「新建会话 / 归档复活」收进头部「会话」弹层(真功能一个不丢)。
 * 不接 token 流式(引擎 includePartialMessages=false,整轮到达),不加假光标。导出名仍
 * ChatDrawer(Hud 不改)。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。selector 守
 * zustand 铁律:session/sessions 取 store 的稳定引用,Object.values 在 useMemo 里做,
 * 绝不在 selector 里构造新值。
 */
export function ChatDrawer() {
  const active = useUiStore((s) => s.activePanel === "chat");
  const closePanel = useUiStore((s) => s.closePanel);
  const sessions = useRoomStore((s) => s.sessions);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const switchSession = useRoomStore((s) => s.switchSession);
  const unarchiveSession = useRoomStore((s) => s.unarchiveSession);
  const appendUserMessage = useRoomStore((s) => s.appendUserMessage);

  const [text, setText] = useState("");
  const [cwd, setCwd] = useState("");
  const [search, setSearch] = useState("");
  const [mgrOpen, setMgrOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // sessions 的 Object.values 在 useMemo 里做(不在 selector 里,守 zustand 铁律)。
  const list = useMemo(() => Object.values(sessions), [sessions]);
  const messages = session?.messages;

  // 新消息到达 / 切会话后自动滚到底(对标原型 threadRef)。messages 引用变即触发。
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!active) return null;

  const activeList = list.filter((s) => !s.archived);
  const q = search.trim().toLowerCase();
  const archivedList = list
    .filter((s) => s.archived)
    .filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.project ?? "").toLowerCase().includes(q),
    );

  const agentCount = session ? Object.keys(session.agents).length : 0;
  const authorName = (m: ChatMessage): string =>
    m.role === "user"
      ? "你"
      : ((m.agentId ? session?.agents[m.agentId]?.label : undefined) ??
        m.agentId ??
        m.role);

  const send = () => {
    const t = text.trim();
    if (currentId && t) {
      appendUserMessage(currentId, t); // 乐观回显用户气泡
      sendCommand({ cmd: "sendMessage", sessionId: currentId, text: t });
      setText("");
    }
  };

  const newSession = () => {
    // 取已有 s<n> 的最大编号 +1,避免删除后 id 复用碰撞。
    const nums = Object.keys(sessions)
      .map((id) => Number(id.replace(/^s/, "")))
      .filter((n) => Number.isFinite(n));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const dir = cwd.trim();
    sendCommand({
      cmd: "newSession",
      sessionId: `s${n}`,
      title: `会话 ${n}`,
      model: "claude-opus-4-8",
      ...(dir ? { cwd: dir } : {}),
    });
    setCwd("");
  };

  const pickSession = (id: string) => {
    switchSession(id);
    setMgrOpen(false);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是模态遮罩,点击空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="cdrawer-scrim" onClick={closePanel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞冒泡,防点抽屉误触 scrim 关闭 */}
      <div className="cdrawer" onClick={(e) => e.stopPropagation()}>
        <div className="cdrawer-hd">
          <div className="cdrawer-hd-l">
            <Icon name="chat" size={22} glow="#36c5e0" />
            <div className="cdrawer-titles">
              <div className="cdrawer-name cjk">{session?.title ?? "无会话"}</div>
              <div className="cdrawer-meta px">
                claude · {modelLabel(session?.model)} · {agentCount}P
              </div>
            </div>
          </div>
          <button
            type="button"
            className="pxbtn sm cjk"
            onClick={() => setMgrOpen((v) => !v)}
          >
            会话
          </button>
          <button type="button" className="closex px" onClick={closePanel}>
            ✕
          </button>
        </div>

        {/* 头部「会话」管理弹层:活动会话(切换)/ 新建 / 归档复活——单栏下保功能。 */}
        {mgrOpen && (
          <div className="cdrawer-mgr scroll">
            <div className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
              会话
            </div>
            {activeList.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chat-sess${s.id === currentId ? " sel" : ""}`}
                onClick={() => pickSession(s.id)}
              >
                <div style={{ fontSize: 12, color: "var(--text)" }}>
                  {s.title}
                </div>
                <div className="faint" style={{ fontSize: 10 }}>
                  {s.project ? `${s.project} · ` : ""}
                  {s.status}
                </div>
              </button>
            ))}

            <input
              className="pxinput"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="目录 cwd(默认服务端)"
              style={{ marginTop: 8, fontSize: 10 }}
            />
            <button
              type="button"
              className="pxbtn sm cjk"
              style={{ width: "100%", marginTop: 6 }}
              onClick={newSession}
            >
              ＋ 新会话
            </button>

            {list.some((s) => s.archived) ? (
              <>
                <div
                  className="px"
                  style={{ fontSize: 10, color: "var(--gold)", marginTop: 14 }}
                >
                  已归档
                </div>
                <input
                  className="pxinput"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索已归档…"
                  style={{ marginTop: 6, fontSize: 10 }}
                />
                {archivedList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="chat-sess"
                    style={{ opacity: 0.7 }}
                    title="点击复活到大厅"
                    onClick={() => unarchiveSession(s.id)}
                  >
                    <div style={{ fontSize: 12, color: "var(--text)" }}>
                      {s.title}
                    </div>
                    <div className="faint" style={{ fontSize: 10 }}>
                      {s.project ? `${s.project} · ` : ""}↺ 复活
                    </div>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        )}

        <div className="cdrawer-thread scroll" ref={threadRef}>
          {!currentId && <span className="faint">选一个会话</span>}
          {currentId && (messages?.length ?? 0) === 0 && (
            <span className="faint">还没有消息,发一条开始…</span>
          )}
          {messages?.map((m) => (
            // user → me(右、青气泡);assistant / system → agent(左、面板色气泡)。
            <div key={m.id} className={`cmsg ${m.role === "user" ? "me" : "agent"}`}>
              <div className="cmsg-author px">{authorName(m)}</div>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染,输入为本会话消息文本 */}
              <div
                className="cmsg-bubble md"
                dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }}
              />
            </div>
          ))}
        </div>

        <div className="cdrawer-input">
          <input
            className="pxinput"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="输入消息…"
          />
          <button
            type="button"
            className="pxbtn primary sm cjk"
            onClick={send}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 替换 `src/web/styles.css` 的 chat 段**

定位现有 chat 段:从注释 `/* ── Chat 面板(T3.8 右抽屉 → 居中 Modal)...` 开始,到 `.chat-input .pxinput { flex: 1; }` 结束(约 2296–2389 行)。**整段替换**为下面内容(保留 `.chat-sess` 三连;退役其余 `.chat-*`;新增抽屉/markdown/弹层)。`--ink`(原型浅文本)→ `--text`,其余 token 直接用。

```css
/* ── Chat 抽屉(居中 Modal → 右侧单栏抽屉):贴右满高玻璃,头部会话名 + 「会话」
   管理弹层 + 对话流(markdown)+ 输入。移植自设计原型 layout.css 的 .cdrawer-*/
   .cmsg-*/.md-*。token 翻译:原型 .cdrawer-name/.cmsg-bubble 的 color:var(--ink)
   (原型 --ink = 浅文本)→ 本项目 var(--text)(本项目 --ink = 深背景);其余
   (--panel/--panel-edge/--panel-hi/--panel-2/--titlebar/--cyan/--gold/--ink-faint/
   --ink-dim/--font-px)值已对齐,直接用。复用既有:.closex/.pxinput/.pxbtn/.scroll/
   .faint/.px。无流式,故不移植 .md-caret/caret-blink。 */

/* 会话列表项(原侧栏遗留,现由抽屉头部「会话」弹层复用) */
.chat-sess {
  border: 0;
  background: transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
  padding: 8px 10px;
}
.chat-sess:hover {
  background: rgba(255, 255, 255, 0.04);
}
.chat-sess.sel {
  box-shadow: inset 3px 0 0 var(--cyan);
  background: rgba(54, 197, 224, 0.08);
}

.cdrawer-scrim {
  position: absolute;
  inset: 0;
  background: rgba(5, 5, 12, 0.5);
  backdrop-filter: blur(1px);
  z-index: 200;
  animation: fadein 0.15s ease;
}
.cdrawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(660px, 94vw);
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.12)),
    var(--panel);
  box-shadow: -3px 0 0 0 var(--panel-edge), inset 3px 0 0 0 var(--panel-hi),
    inset 6px 0 0 0 var(--panel-2), -14px 0 34px rgba(0, 0, 0, 0.5);
  animation: cdrawer-in 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
}
@keyframes cdrawer-in {
  from {
    transform: translateX(100%);
  }
}
.no-motion .cdrawer {
  animation: none;
}
.cdrawer-hd {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  margin: 6px 6px 0;
  background: linear-gradient(180deg, #3a2614, var(--titlebar));
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.4),
    inset 0 2px 0 rgba(255, 255, 255, 0.06);
}
.cdrawer-hd-l {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.cdrawer-titles {
  min-width: 0;
}
.cdrawer-name {
  font-size: 16px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdrawer-meta {
  font-size: 8px;
  color: var(--cyan);
  margin-top: 5px;
  letter-spacing: 0.05em;
}
.cdrawer-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 18px;
  overflow-y: auto;
  min-height: 0;
}
.cmsg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 92%;
}
.cmsg.me {
  align-self: flex-end;
  align-items: flex-end;
}
.cmsg-author {
  font-size: 8px;
  color: var(--ink-faint);
}
.cmsg.me .cmsg-author {
  color: var(--cyan);
}
.cmsg-bubble {
  font-size: 14px;
  line-height: 1.65;
  padding: 12px 15px;
  color: var(--text);
  background: rgba(11, 10, 18, 0.5);
  box-shadow: inset 0 0 0 2px var(--panel-edge);
}
.cmsg.me .cmsg-bubble {
  background: linear-gradient(180deg, #1f6d80, #15505e);
  box-shadow: inset 0 0 0 2px #36c5e0;
}
.cdrawer-input {
  display: flex;
  gap: 10px;
  padding: 14px 15px;
  margin: 0 6px 6px;
  background: rgba(11, 10, 18, 0.4);
  box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.3);
}
.cdrawer-input .pxinput {
  flex: 1;
  min-width: 0;
}

/* 头部「会话」管理弹层:活动/归档会话列表 + 新建,浮在对话流上方 */
.cdrawer-mgr {
  position: absolute;
  top: 72px;
  right: 12px;
  width: 280px;
  max-height: 60%;
  overflow-y: auto;
  z-index: 5;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--panel-2);
  box-shadow: 0 0 0 2px var(--panel-edge), 0 10px 30px rgba(0, 0, 0, 0.55);
}

/* markdown content(原型 layout.css 移植,类名严格对齐 mdToHtml 输出) */
.md > *:first-child {
  margin-top: 0;
}
.md > *:last-child {
  margin-bottom: 0;
}
.md-p {
  margin: 0 0 9px;
}
.md-h {
  font-family: var(--font-px);
  color: var(--gold);
  margin: 6px 0 9px;
  text-shadow: 1px 1px 0 #000;
  line-height: 1.4;
}
.md-h1 {
  font-size: 14px;
}
.md-h2 {
  font-size: 12px;
}
.md-h3,
.md-h4 {
  font-size: 11px;
}
.md-ul,
.md-ol {
  margin: 0 0 9px;
  padding-left: 20px;
}
.md-ul {
  list-style: none;
}
.md-ul li {
  position: relative;
}
.md-ul li::before {
  content: "▸";
  color: var(--cyan);
  position: absolute;
  left: -16px;
}
.md-ul li,
.md-ol li {
  margin: 3px 0;
}
.md-code {
  font-family: var(--font-px);
  font-size: 11px;
  background: rgba(0, 0, 0, 0.42);
  color: #9be7ff;
  padding: 1px 5px;
  box-shadow: inset 0 0 0 1px var(--panel-edge);
}
.md-pre {
  margin: 0 0 9px;
  padding: 11px 13px;
  background: rgba(0, 0, 0, 0.5);
  box-shadow: inset 0 0 0 2px var(--panel-edge);
  overflow-x: auto;
}
.md-pre code {
  font-family: var(--font-px);
  font-size: 11px;
  line-height: 1.7;
  color: #bfe9c4;
  white-space: pre;
}
.md-bq {
  margin: 0 0 9px;
  padding: 6px 12px;
  color: var(--ink-dim);
  box-shadow: inset 3px 0 0 var(--cyan);
  background: rgba(54, 197, 224, 0.06);
}
.md-hr {
  border: 0;
  border-top: 2px dashed rgba(122, 86, 56, 0.5);
  margin: 10px 0;
}
.md a {
  color: var(--cyan);
  text-decoration: underline;
}
```

- [ ] **Step 3: 确认无旧类残留**

Run: `grep -nE "chat-layout|chat-side|chat-wrap|chat-thread|chat-msg|chat-role|chat-bubble|chat-input" src/web/`
Expected: 仅命中注释 / `.chat-sess` 无关项;无 `.chat-layout`/`.chat-side`/`.chat-wrap`/`.chat-thread`/`.chat-msg`/`.chat-role`/`.chat-bubble`/`.chat-input` 的真实定义或引用(`ChatDrawer.tsx` 已不再用它们)。`.chat-sess` 仍在(预期保留)。

- [ ] **Step 4: 类型 + lint 校验**

Run: `bun run check`
Expected: 无 error。若 Biome 报格式差异,运行 `bunx @biomejs/biome check --write src/web/hud/ChatDrawer.tsx src/web/styles.css` 后重跑。若报 `useExhaustiveDependencies`/a11y/security,确认相应 `biome-ignore` 注释在位且贴在正确行上方。

- [ ] **Step 5: 跑全量测试**

Run: `bun test`
Expected: 全绿(新增 model-label / markdown 测试 + 既有 store/leaderboard/todos-view/replay.e2e 等)。重点确认 `src/web/replay.e2e.test.ts` 仍通过(它不断言旧 `.chat-*` DOM)。

- [ ] **Step 6: 提交**

```bash
git add src/web/hud/ChatDrawer.tsx src/web/styles.css
git commit -m "feat: 🧩 ChatDrawer 居中 Modal → 右侧单栏抽屉(markdown 气泡+会话管理弹层)"
```

---

## Task 4: 回放冒烟 + 收尾

**Files:** 无改动(纯验证)。

- [ ] **Step 1: 起回放冒烟(不烧额度)**

Run(两个终端,或后台起引擎):
```bash
bun run dev:engine -- --replay fixtures/taskwin-demo.jsonl   # 单会话 + TodoWrite 活动
bun run dev:web
```
(测会话管理弹层的「切会话」用 `fixtures/multi-session.jsonl`,有多个会话。)
浏览器开 `http://localhost:5173`,进入某会话内景,点聊天按钮(Hotbar/ButtonDock 的 chat),肉眼核对验收点:
1. 抽屉从右边缘滑入、满高、半透明遮罩,点遮罩关闭。
2. 头部显示会话名 + `claude · 模型短名 · NP`。
3. 含 markdown 的 agent 消息渲染正确(标题/加粗/行内码/有序无序/代码块/引用/分隔线/链接),用户气泡靠右青色。
4. 头部「会话」按钮展开弹层:切会话 / 新建(可空 cwd)/ 搜索并复活归档会话均生效。

> fixture 文件名以 `ls fixtures/` 实际为准(spec 提到 `TaskWindow demo replay fixture` 已存在)。若无合适 fixture,可临时连真引擎发一条带 markdown 的消息核对(会烧少量额度,非必须)。

- [ ] **Step 2: 合入主树(worktree 工作流)**

记 worktree HEAD SHA,回主工作树:
```bash
git -C /Users/poco/Projects/Roguent merge --no-ff <worktree-sha>
bun test && bun run check
```
全绿后按需 `git push origin main`,再 `git worktree remove .worktrees/chat-right-drawer`。

---

## Self-Review(计划完成后自查记录)

- **Spec 覆盖**:右抽屉(Task 3 CSS `.cdrawer-*` + 组件)✓;单栏 + 头部会话名/meta(Task 3 组件 `.cdrawer-hd`)✓;保功能弹层(Task 3 `.cdrawer-mgr` + activeList/newSession/unarchive)✓;markdown 渲染(Task 2 `mdToHtml` + Task 3 气泡)✓;模型短名(Task 1 `modelLabel`)✓;退役旧样式(Task 3 Step 2/3)✓;不接流式(全程不动引擎、不移植 `.md-caret`)✓;测试(Task 1/2 单测 + Task 3 Step 5 全量 + Task 4 回放)✓。
- **占位符**:无 TBD/TODO;每步含完整代码 / 命令 / 预期。
- **类型一致**:`modelLabel(id: string | undefined): string`(Task 1)与组件调用 `modelLabel(session?.model)`(Task 3,`session?.model` 为 `string | undefined`)一致;`mdToHtml(src: string): string`(Task 2)与气泡 `mdToHtml(m.text)`(`m.text: string`)一致;`authorName(m: ChatMessage)` 用到的 `ChatMessage` 从 `../../shared/domain` 导入(Task 3 顶部)且字段 `role/agentId/text` 均存在。
