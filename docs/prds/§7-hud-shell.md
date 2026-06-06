---
id: "§7"
title: 游戏化 HUD 外壳与面板路由
status: implemented
layer: web
updated: 2026-06-06
depends_on: ["§2"]
related: ["§8", "§9", "§10", "§11", "§12"]
code_refs:
  - src/web/hud/Hud.tsx
  - src/web/hud/icons.tsx
  - src/web/hud/ButtonDock.tsx
  - src/web/hud/Hotbar.tsx
  - src/web/hud/Minimap.tsx
  - src/web/ui-store.ts
specs:
  - docs/superpowers/specs/2026-06-04-roguent-design.md
---

# §7 游戏化 HUD 外壳与面板路由

## 1. 定位

`Hud.tsx` 是覆盖在 PixiJS 画布上方的全局 React HUD 外壳,承载两类职责:

1. **常驻 HUD 组件**:LimitBars、Currency、RosterCard、ViewSwitch、SessionBanner、ButtonDock、Hotbar、TaskWindow、Minimap——始终挂载,由各自内部 gate 控制显/隐。
2. **单一 activePanel 面板路由**:所有功能面板(NpcCard / ChatDrawer / ModelPicker / Skills / ImportPanel / Leaderboard / SessionGrid / Account / Tasks / Settings / Shop / SystemMenu / ErrorOverlay / LootPanel / AgentCard)以 `activePanel` 字段为唯一路由键,同一时刻最多渲染一个面板。

主屏永远零正文——图标代替文字,文字仅出现在面板/弹窗内部。

## 2. 为什么

**零正文原则**:游戏画面主屏是像素地牢动画,任何常驻正文都会破坏沉浸感。所有操作入口改为自绘像素图标;hover 时显示 `.tip` 标签,满足可发现性。

**单路由消除布尔碎片**:历史实现用多个独立 `boolean` 标志(`drawerOpen` 等)管理面板状态,导致「两面板同时开」等竞态。迁移到 `activePanel: PanelId | null` 后,开一个面板自动关前一个,不需要额外协调逻辑。

**组合优于继承**:面板各自持有 `activePanel` gate(`if (activePanel !== 'xxx') return null`),`Hud.tsx` 只负责把它们全部挂载,不关心面板内部逻辑——扩展新面板只需加一个组件挂载行。

## 3. 功能点

- **自绘像素 SVG 图标注册表**:33 个图标(`ICON_ART_DATA`),16×16 网格 rect 组合,统一暗色描边 `#2c1c10`,左上光源。图标名见 `IconName` 联合类型。
- **`Icon` 组件**:接受 `name / size / glow / title`,渲染 `<svg viewBox="0 0 16 16" shapeRendering="crispEdges">`,支持 `drop-shadow` 辉光。
- **`activePanel` 单路由**:14 个 PanelId(`npc / tasks / settings / skills / shop / leaderboard / backpack / chat / model / import / account / about / menu / sessiongrid`),`openPanel(id)` 设值、`closePanel()` 置 null。
- **ButtonDock**:顶右固定列,4 个 iconbtn(gear→settings、menu→menu、account→account、pause→menu),lit 态反映 `activePanel`。两视图均显示。
- **Hotbar**:底中操作坞,仅内景显示。两组共 8 槽:GROUP1(spellbook/pouch/chat/crystal/import)、GROUP2(quest/shop/trophy),全部走 `openPanel`。badge 角标结构就绪,引擎数据待补(planned)。
- **Minimap**:内景左下,复用 `roomLayout` 计算小人网格百分比坐标,orchestrator 金色点,其余暗色点,选中态 `.sel` 高亮。仅内景显示。
- **LimitBars / Currency / RosterCard / ViewSwitch / SessionBanner**:常驻 HUD 层(各自含显示 gate),不走 activePanel 路由。
- **TaskWindow / AgentCard / LootPanel**:内景侧边 HUD,各自含 activePanel 或内景 gate。
- **Hotbar badge 真实角标数据接入**(planned):引擎补齐后传 `badge?: number`,HotbarSlot 已保留 `.badge` 渲染路径。

## 4. 交互边界

### 上游

| 来源 | 契约 |
|------|------|
| **§2 事件协议** | `useRoomStore` 提供 `sessions / agents / currentSessionId`;Hud 层各组件通过 selector 订阅。 |
| `useUiStore.view` | `"overworld"` vs `{ interior: string }` 驱动 Hotbar / Minimap / SessionBanner / TaskWindow 的内景 gate。 |

### 下游(related)

| 面板 | PanelId | 归属 PRD |
|------|---------|----------|
| NpcCard / RosterCard 扩展 | `npc` | §8 NPC 与会话管理 |
| ChatDrawer | `chat` | §9 聊天抽屉 |
| Tasks / TaskWindow | `tasks` | §10 任务面板 |
| Skills / Shop / Leaderboard | `skills / shop / leaderboard` | §11 游戏化进度面板 |
| Account / Settings / SystemMenu / About | `account / settings / menu / about` | §12 账户与设置 |
| SessionGrid | `sessiongrid` | §8 |
| ModelPicker | `model` | §12 |
| ImportPanel | `import` | §8 |

### 面板路由契约

- `openPanel(id)` 幂等:重复传同一 id 无副作用。
- `closePanel()` 置 `activePanel = null`,所有面板组件均以此作关闭信号。
- 各面板组件在自身首行检查 `activePanel !== 'xxx'` 并 `return null`,不依赖父层条件渲染——扩展新面板不改 `Hud.tsx` 主体逻辑。

## 5. 数据流与关键约定

```
用户点击 Hotbar/ButtonDock iconbtn
  └─ openPanel(panelId)
       └─ useUiStore.set({ activePanel: panelId })
            └─ 目标面板组件 selector 读到 activePanel === 'xxx'
                 └─ 渲染面板内容(其余面板继续 return null)

用户点击面板内 X / 遮罩
  └─ closePanel()
       └─ activePanel = null → 所有面板 return null
```

**Zustand selector 铁律**:selector 必须返回稳定引用(标量或模块级常量),不得在 selector 内构造新对象/数组——否则 `useSyncExternalStore` 每轮都见到新快照,触发无限渲染。Minimap 的 `EMPTY_AGENTS` 是典型实现。

**图标注册表只读**:`ICON_ART` 以 `Record<string, readonly Rect[]>` 导出供 `mapping.ts` 按工具名动态查表;`ICON_ART_DATA` 以 `as const` 固化,保持 `IconName` 联合类型精确。

**双视图 gate**:ButtonDock / Currency / RosterCard / ViewSwitch 两视图都显;Hotbar / Minimap / SessionBanner / TaskWindow 仅内景显,各组件内部通过 `useUiStore(s => s.view !== 'overworld')` 自管。

## 6. 现状与边界

| 子系统 | 状态 | 说明 |
|--------|------|------|
| HUD 外壳 (`Hud.tsx`) | 真 | 所有组件挂载完整 |
| 图标注册表 33 个 | 真 | icons.test.ts 覆盖完整性 |
| `activePanel` 单路由 | 真 | 14 个 PanelId,openPanel/closePanel |
| ButtonDock | 真 | 4 个槽,lit 态接 activePanel |
| Hotbar | 真(外壳) | 8 个槽,badge 结构就绪,数据待引擎 |
| Minimap | 真 | 真实 agents 坐标,复用 roomLayout |
| Hotbar badge 角标数据 | planned | 引擎尚未下发;HotbarSlot 留有 `badge?` 参数 |
| `about` PanelId | 部分 | About 组件 working,入口由 T3.12 SystemMenu 承接 |
| `backpack` 面板 | 真(详见 §10) | 由 `LootPanel` 承载,gate 在 `activePanel==="backpack"`(`LootPanel.tsx:44`);真数据面板(`session.loot`),非 mock |

**已收尾的历史债务**:`drawerOpen` 等独立 boolean 标志已于 T5 全部迁入 `activePanel` 路由后删除。

## 7. 代码锚点

| 文件 | 关键位置 | 说明 |
|------|----------|------|
| `src/web/ui-store.ts:9` | `PanelId` 联合类型定义(14 个值) | activePanel 路由键集合 |
| `src/web/ui-store.ts:27` | `activePanel: PanelId \| null` | 单路由状态字段 |
| `src/web/ui-store.ts:59-60` | `openPanel / closePanel` | 路由操作 |
| `src/web/hud/Hud.tsx:26` | `export function Hud()` | HUD 外壳挂载点,列出全部子组件 |
| `src/web/hud/icons.tsx:65` | `const ICON_ART_DATA = {` | 33 图标 rect 数据 |
| `src/web/hud/icons.tsx:647` | `export const ICON_ART` | 宽化 Record,供 mapping.ts 动态查表 |
| `src/web/hud/icons.tsx:649` | `export type IconName` | 精确联合类型 |
| `src/web/hud/icons.tsx:657` | `export function Icon` | SVG 渲染组件 |
| `src/web/hud/ButtonDock.tsx:20` | `DOCK_BTNS` | 4 个顶右按钮配置 |
| `src/web/hud/ButtonDock.tsx:31` | `export function ButtonDock` | 顶右设置坞 |
| `src/web/hud/Hotbar.tsx:29` | `GROUP1 / GROUP2` | 底中操作坞 8 槽配置 |
| `src/web/hud/Hotbar.tsx:71` | `export function Hotbar` | 底中操作坞,含内景 gate |
| `src/web/hud/Hotbar.tsx:54` | `badge: number \| null = null` | badge 占位,引擎补数据后接入 |
| `src/web/hud/Minimap.tsx:11` | `const EMPTY_AGENTS` | selector 稳定空引用(铁律示例) |
| `src/web/hud/Minimap.tsx:22` | `export function Minimap` | 真实 agent 小地图,含内景 gate |

## 8. 验收

| 测试文件 | 覆盖点 |
|----------|--------|
| `src/web/hud/icons.test.ts` | `ICON_NAMES` 恰好 33 个;每个图标有非空 rect 数组;rect x/y/w/h 均为有限数值;color string 非空 |
| `src/web/hud/tool-icons.test.ts` | `mapping.ts` 工具名 → IconName 映射合法(动态查表命中 ICON_ART) |
| `src/web/ui-store.test.ts` | `openPanel` / `closePanel` 状态转换;`activePanel` 初始为 null;PanelId 枚举完整 |

手动验收清单:

- [ ] 点击 Hotbar 任意槽,对应面板打开,其余面板关闭
- [ ] 点击同一槽不触发异常(幂等)
- [ ] 切换到大厅(overworld)后 Hotbar / Minimap 不渲染
- [ ] 进入内景后 Hotbar / Minimap / SessionBanner 出现
- [ ] ButtonDock 在大厅和内景均显示,lit 态随 activePanel 更新
- [ ] 所有 33 个图标在 Icon 组件中无 fallback 渲染(红色占位块)
