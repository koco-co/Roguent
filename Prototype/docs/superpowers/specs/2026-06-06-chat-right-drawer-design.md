---
title: 聊天窗口 → 右侧单栏抽屉(Markdown 渲染)
date: 2026-06-06
status: design-approved
authors: [koco-co]
---

# 聊天窗口右侧抽屉重构 · 设计文档

> 来源:Claude Design handoff bundle(`api.anthropic.com/v1/design/h/nv-ZklkFwAZFPylkfLBuFg` → `Roguent.html`)。
> 设计对话 `chats/chat2.md` 把 Chat 从弹窗改成右侧抽屉;用户本轮指明:**仅改动聊天窗口的位置,以右侧抽屉式展开**。
> 依据代码快照:`main` @ `2ae9f1c`(2026-06-06)。

---

## 1. 背景与现状

**当前真实实现 `src/web/hud/ChatDrawer.tsx`**(导出名 `ChatDrawer`,挂在 `Hud.tsx`):

- 居中 `<Modal>`(1100×680),**双栏**:左会话侧栏(切会话 / cwd + ＋新会话 / 归档搜索 + 复活)+ 右对话区(**纯文本**气泡 + 输入)。
- 全是真功能、真数据:会话列表来自 `useRoomStore` 的 `sessions`,发送走 `appendUserMessage`(乐观回显)+ `sendCommand({cmd:"sendMessage"})`。
- 组件注释记载:历史上是右抽屉,T3.8 被重构为居中 Modal 并加了侧栏。

**新设计原型 `panels2.jsx` 的 `Chat` + `layout.css` 的 `.cdrawer-*`**(附用户截图):

- 右侧抽屉,`660px` 宽、贴右满高,半透明遮罩点击关闭,从右边缘滑入(`translateX(100%)→0`,0.24s `cubic-bezier(.2,.9,.3,1)`,`no-motion` 时禁用)。
- **单栏**:头部(chat 图标 + **当前会话名** + `runtime · model · NP` 副标 + 关闭 ✕)→ 对话流 → 输入框。**无左侧会话侧栏。**
- 气泡按 **markdown** 渲染(标题/加粗/行内码/有序无序列表/代码块/引用/分隔线/链接);原型另有流式光标。

**两个影响取舍的事实:**

1. 删侧栏会丢入口:`unarchiveSession`(归档复活)**当前唯一入口**就是此侧栏;"有会话时再新建"也主要在此(`EmptyState` 只在零会话时出现)。`switchSession`/`archiveSession` 在 `NpcCard`/进房间另有入口。
2. 引擎**已支持** `message.delta`,但 `includePartialMessages=false` —— 一条 delta = **一整轮发言**,非逐字流。故"流式光标"接真需额外开 partial 累加,属比"仅改位置"更大的改动。

---

## 2. 目标与范围

把 `ChatDrawer` 从居中 Modal(双栏)改成**贴右单栏抽屉**,忠实复刻原型 `.cdrawer-*`;气泡按 **markdown** 渲染(真实整轮消息);侧栏带走的两个孤儿功能(新建会话、归档复活)收进**头部「会话管理」弹层**。

### 已批准的两个决定

- **布局**:单栏抽屉 + 保功能(删左侧栏,把新建/归档复活收进头部弹层),不丢任何真功能。
- **气泡**:Markdown 渲染、**不接流式**(用真实整轮消息;不开 `includePartialMessages`、不加假光标)。

### 不做(Out of scope)

- token 流式(不开 `includePartialMessages`、不移植 `.md-caret`/`caret-blink`)。
- 引擎 / `normalize` / 事件协议改动。
- 其它面板、`Hud.tsx` 结构。导出名仍 `ChatDrawer`,`Hud.tsx` 引用不变。

---

## 3. 挂载与定位

项目约定:**HUD / 面板不进 1920×1080 缩放舞台**,按视口真像素响应(见 `Modal.tsx` 注释)。`ChatDrawer` 现以 `<Modal>`(`.scrim` 覆盖层)渲染,挂载点已在 Hud 内 `activePanel==="chat"` gate 下。

新抽屉沿用同套路:不再用 `<Modal>`,改为自有的 `.cdrawer-scrim` 覆盖层 + `.cdrawer` 面板,从**视口右边缘**滑入。挂载位置、gate、导出名都不变。

- 宽度钳制(对齐 Modal 做法):`width: min(660px, 94vw)`,满高(`top/bottom:0`)。
- 点遮罩 `closePanel`;内层 `onClick` 吞冒泡防误关。
- Esc 关闭沿用现有 App 集中处理(本组件不另监听)。

---

## 4. 组件设计

### 4.1 `ChatDrawer.tsx`(重写,导出名不变)

单栏结构:

```
<div className="cdrawer-scrim" onClick={closePanel}>          // 遮罩,点击关闭
  <div className="cdrawer" onClick={stopPropagation}>         // 贴右面板,吞冒泡
    <div className="cdrawer-hd">                              // 头部
      <div className="cdrawer-hd-l">
        <Icon name="chat" glow="#36c5e0" />
        <div className="cdrawer-titles">
          <div className="cdrawer-name cjk">{session.title}</div>
          <div className="cdrawer-meta px">claude · {modelLabel(session.model)} · {agentCount}P</div>
        </div>
      </div>
      <button className="cdrawer-mgr-btn" onClick={toggleMgr}>会话</button>  // 会话管理弹层开关
      <div className="closex px" onClick={closePanel}>✕</div>
    </div>

    {mgrOpen && <SessionMgrPopover/>}                         // §4.3,锚在头部下

    <div className="cdrawer-thread scroll" ref={threadRef}>   // 对话流,自动滚底
      {messages.map(m =>
        <div className="cmsg {m.role==='user'?'me':'agent'}">
          <div className="cmsg-author px">{m.role==='user' ? '你' : authorName(m)}</div>
          <div className="cmsg-bubble md" dangerouslySetInnerHTML={{__html: mdToHtml(m.text)}} />
        </div>
      )}
    </div>

    <div className="cdrawer-input">                           // 输入
      <input className="pxinput" .../>
      <button className="pxbtn primary sm cjk" onClick={send}>发送</button>
    </div>
  </div>
</div>
```

**真数据接线(不变)**:`active = activePanel==="chat"`;`messages = sessions[currentSessionId]?.messages`;`send` = `appendUserMessage(currentId, t)` 乐观回显 + `sendCommand({cmd:"sendMessage", sessionId, text})`。

**zustand 铁律**:selector 只取稳定引用 / 基元;`Object.values(sessions)`(供弹层列表)在 `useMemo` / 渲染体里做,绝不在 selector 里构造新值。`activePanel==="chat"` 的 `return null` 放在所有 hooks(含 `useState`/`useMemo`/`useRef`/`useEffect`)之后(React hooks 规则)。

**自动滚底**:`useEffect(() => { el.scrollTop = el.scrollHeight }, [messages])`,对齐原型 `threadRef`。

### 4.2 数据映射

| 渲染位 | 真实源 |
| --- | --- |
| 会话名 `.cdrawer-name` | `session.title` |
| 副标 runtime | 固定 `claude`(项目即 Claude runtime;无 runtime 字段,非 mock) |
| 副标 model | `modelLabel(session.model)`,复用 `ModelPicker` 的 `claude-opus-4-8→Opus 4.8` 映射;未知 id 回落原串 |
| 副标 NP | `Object.keys(session.agents).length + "P"` |
| 作者标签(agent) | `session.agents[m.agentId]?.label`,回落 `m.agentId` / `m.role` |
| 作者标签(user) | `你` |

模型映射:抽出一个小 `modelLabel(id): string`(可放 `markdown.ts` 同级新模块或就近常量),不重复 `ModelPicker` 的完整卡片数据,只要 id→短名。

### 4.3 会话管理弹层(保功能)

头部「会话」按钮 toggle 一个锚在头部下方的轻量弹层 `.cdrawer-mgr`,内容 = 旧侧栏三块,复用现有样式:

- **活动会话**:`activeList`(`!archived`)逐项 `.chat-sess`,点击 `switchSession(id)`(选中态 `.sel`)。
- **新建**:`pxinput`(cwd,可空→服务端默认)+ `＋新会话` `pxbtn` → `newSession`(沿用现有"取已有 s\<n\> 最大编号 +1"逻辑 + 可选 cwd)。
- **已归档**:`list.some(archived)` 时显示——搜索 `pxinput` + `archivedList`(按 title/project 过滤)逐项点击 `unarchiveSession(id)`。

弹层用本地 `useState` 开关;点弹层外 / 切会话后自动收起(切会话即收起)。样式新增 `.cdrawer-mgr`(绝对定位浮层 + 暖木面板边),内部沿用 `.chat-sess`/`pxinput`/`pxbtn`。

### 4.4 `markdown.ts`(新建 `src/web/hud/markdown.ts`)

从原型 `panels2.jsx` 移植零依赖迷你渲染器,TS 化:

- `escHtml(s)`:转义 `& < >`(**先转义**,故 `dangerouslySetInnerHTML` 安全;输入是 agent 自己的文本)。
- `mdInline(s)`:行内码 `` `x` ``→`.md-code`、`**x**`→`<strong>`、`*x*`→`<em>`、`[t](u)`→`<a target=_blank rel=noopener>`。
- `mdToHtml(src)`:逐行块级——代码块 ```` ``` ````→`.md-pre`、`#..####`→`.md-h md-h{n}`、`---`→`.md-hr`、`> `→`.md-bq`、`- /*`→`.md-ul`(▸ 前缀由 CSS 给)、`N.`→`.md-ol`、空行断段、其余→`.md-p`。

输出类名严格对齐原型 `.md-*`,保证 CSS 复用与像素一致。**不移植**流式光标相关。

---

## 5. 样式(`src/web/styles.css`)

移植原型 `layout.css` 的:`.cdrawer-scrim`、`.cdrawer`、`@keyframes cdrawer-in`、`.no-motion .cdrawer`、`.cdrawer-hd`、`.cdrawer-hd-l`、`.cdrawer-titles`、`.cdrawer-name`、`.cdrawer-meta`、`.cdrawer-thread`、`.cmsg`/`.cmsg.me`、`.cmsg-author`、`.cmsg-bubble`/`.cmsg.me .cmsg-bubble`、`.cdrawer-input`,以及 `.md-*` 块。新增 `.cdrawer-mgr`(弹层)+ `.cdrawer-mgr-btn`(头部按钮)。

**Token 翻译**(延续既有 chat 移植约定):原型 `--ink`=浅文本 → 本项目 `--text`(本项目 `--ink`=#0b0a12 深背景,**勿直用**);`--cyan`/`--gold`/`--ink-faint`/`--ink-dim`/`--panel`/`--panel-edge`/`--font-px` 值已对齐,直接用。`.cdrawer` 面板背景沿用暖木面板色 + `--panel-edge` 描边,与现有 `.panel` 一致。

**退役**旧 chat 样式:`.chat-layout`/`.chat-side`/`.chat-wrap`/`.chat-thread`/`.chat-msg`/`.chat-msg.in|out`/`.chat-role`/`.chat-bubble`/`.chat-input`。**保留 `.chat-sess`**(弹层活动/归档列表项复用;新建输入用 `pxinput`、发送用 `pxbtn`,不依赖 `.chat-input`)。

**无流式**:不移植 `.md-caret` / `@keyframes caret-blink`。

---

## 6. 测试

- **`src/web/hud/markdown.test.ts`**(新增,`bun:test`):标题(h1–h4)、加粗、行内码、`<>&` 转义、有序/无序列表、代码块(含内部不被当块级误解析)、引用、分隔线、链接;断言输出类名与结构。
- **回放 fixture 端到端**:已有 `replay.e2e.test.ts`;确认其不断言旧 `.chat-*` DOM(当前不依赖),如打开 chat 面板做断言则同步更新到 `.cdrawer-*`。
- 改后即测:`bun test` + `bun run check`,失败先修;不把局部通过说成全量通过。

---

## 7. 风险与缓解

- **`dangerouslySetInnerHTML` 注入**:`mdToHtml` 先 `escHtml` 再渲染,链接 `rel=noopener`;输入为 agent/用户文本,风险可控。markdown.test 覆盖转义。
- **弹层遮挡对话**:弹层锚头部、半透明面板浮在对话流上方,`z-index` 高于 thread、低于不存在的全局层;点遮罩或切会话收起,避免长期占屏。
- **退役旧样式漏网**:退役后全仓 grep `chat-layout|chat-side|chat-wrap|chat-thread|chat-msg|chat-role|chat-bubble|chat-input` 应只剩注释(`.chat-sess` 仍在用);`bun run check` 兜底。

---

## 8. 验收

1. 点聊天 → 抽屉从右边缘滑入(`no-motion` 时无动画),满高、遮罩点击关闭。
2. 头部显示当前会话名 + `claude · {模型短名} · {N}P`。
3. 含 markdown 的 agent 消息正确渲染(标题/加粗/码/列表/代码块/引用/分隔线/链接),用户气泡右青。
4. 头部「会话」弹层可切会话 / 新建(可选 cwd)/ 搜索并复活归档会话——三功能皆真、一个不丢。
5. `bun test` + `bun run check` 全绿;回放 fixture 端到端不烧额度。
