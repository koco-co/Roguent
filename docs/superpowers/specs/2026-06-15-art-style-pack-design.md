---
title: 美术风格切换器(Art Style Pack)落地设计
date: 2026-06-15
status: spec
source: Roguent-handoff.zip(2026-06-15 修订)相对 2026-06-11 版的唯一增量
baseline: main 经 §3.7 prototype-parity-restore(2026-06-13);本设计只覆盖新增的 artpack 一项
---

# 美术风格切换器(Art Style Pack)

## 1. 背景与范围

2026-06-15 的 Claude Design handoff 相对已落地的 2026-06-11 版,**唯一新增**是 Settings(CONFIG)面板里的「美术风格 / Art Style」分组。差异落在原型 4 个文件:

| 原型文件 | 增量 |
| --- | --- |
| `data.js` | SETTINGS 新增一组 `{id:'artpack', name:'美术风格 Art Style', icon:'scene', items:[]}`(special-rendered) |
| `icons.jsx` | 新增 `ART.scene` 图标(画框风景:太阳 + 山脊 + 山丘) |
| `panels2.jsx` | 新增 `ArtPackGroup`(5 卡网格)+ `ArtPackPreview`(全屏确认浮层) |
| `extra.css` | 新增 `.artpack-*`(网格/卡片)与 `.apv-*`(预览浮层)样式 |

**本设计只实现这一项增量**;其余设计在 §3.5/3.6/3.7 已落地,不重复动。纯前端改动(`src/web`),**不动 engine / 事件协议 / domain**。

## 2. 真 / 假边界(用户已拍板:忠实占位,按原型 1:1)

- **`pixel-fantasy`(像素奇幻)= 唯一真内置素材**:即当前 app 全套贴图,`ready:true`。选中它什么都不用做(本就在用)。
- **另外 4 个包**(`neon-terminal` 霓虹终端 / `holo-blueprint` 全息蓝图 / `deep-space` 深空舰桥 / `synthwave` 合成波)= **占位**:原型卡片标 `drop assets`,文案明说「素材由你自备,未导入对应风格时回退到占位图」。确认切换只**持久化选择 + 盖 `<html data-artpack>` 属性**;无替换素材存在,世界继续渲染内置贴图。诚实呈现,不造数据、不假装切换成功。
- 与现有真 `skin`(dungeon/holo)系统**不互联**——原型刻意把 art-pack(全局素材替换)与 skin(PixiJS 渲染的另一套场景)分成两个独立设置;本轮保持分离,降低风险、忠实原型。

## 3. 行为规格(对照原型 `ArtPackGroup` / `ArtPackPreview`)

### 3.1 ArtPackGroup(分组主体)
- 顶部 `comp-intro` 说明条(`scene` 图标 + 一句说明:选包→预览→确认→应用)。
- `.artpack-grid` 两列网格,5 张 `.artpack-card`,每张:
  - 左侧 `.artpack-prev` 预览缩略(斜纹 stripe + 底部色带 + `art pack`/`drop assets` tag),`--ac` 取该包强调色。
  - 中间 `.artpack-meta`:中文名 + 英文名 + 描述。
  - 右侧 `.artpack-badge`:当前包显示「✓ 使用中」,否则「预览」。
  - 当前包 `.on` 高亮。
- 底部 `.artpack-note`:当前包 ready 时显示「当前使用内置『像素奇幻』素材,开箱即用」;否则显示「当前生效:『X』。把该风格的场景 / NPC / 道具贴图导入素材目录后即可全局生效」。
- 点击**非当前**卡 → 打开 `ArtPackPreview`(传该包);点当前卡无操作。

### 3.2 ArtPackPreview(全屏确认浮层)
- `.apv-scrim`(点遮罩取消)+ `.apv-panel`(`--ac` 取包色,`stopPropagation`)。
- 头部:中文名 + 英文名 + `✕`。
- `.apv-scene` mock 场景:sky / sun / ridge / grid / 占位 hero + `SCENE / 场景` 标签。
- `.apv-strip` 3 个占位 NPC(审查官/商人/向导,各一个 Icon)。
- `.apv-props` 道具行(`scene`/`coins`/`crystal`/`trophy`/`quest` 五个 Icon)。
- `.apv-metaline` 包描述。
- 底部 `.apv-foot`:左侧 hint(当前包/内置/占位三种文案),右侧「取消」+「确认切换」(当前包时禁用、显示「当前风格」)。
- 确认 → `apply(id)`:`setCur` + `localStorage` + 盖 `data-artpack` + 关浮层。

### 3.3 持久化(忠实原型)
- key:`localStorage['roguent_artpack']`,默认 `'pixel-fantasy'`(读取异常兜底默认)。
- 挂载时 `document.documentElement.setAttribute('data-artpack', cur)`。
- 选择切换时写 localStorage + 盖属性。
- **不**走 `settings-store.ts`——原型用独立 key 自成一体,且无真实消费者,不为占位功能改 schema/持久化。

## 4. 真实 app 落地映射

| 原型 | 真实 app |
| --- | --- |
| `h(...)` / `T(...)` / `Icon` | JSX/TSX + `useT()`(`t()`)+ `<Icon/>` |
| `ART.scene` 图标 | `src/web/hud/icons.tsx` 新增 `scene`(`r`/`box`/`C` 助手两边一致,直译) |
| `data.js` artpack 组 | `src/web/hud/settings-schema.ts` `SETTINGS_GROUPS` 在 `compact` 之后、`perm` 之前插入(真实 app 无 `ambiance` 组,故 artpack 紧邻 perm 的相对次序与原型一致) |
| `grp==='artpack'?h(ArtPackGroup)` | `Settings.tsx` special-render 分支:`grp === "compact" ? <CompactGroup/> : grp === "artpack" ? <ArtPackGroup/> : <Field 列表>` |
| `ArtPackGroup`/`ArtPackPreview` | 写在 `Settings.tsx`;pack 列表 + `load/apply` 抽到纯模块 `src/web/hud/artpack.ts`(可单测) |
| `extra.css` `.artpack-*`/`.apv-*` | `src/web/styles.css` 末尾照搬(token/类名沿用,`amb-group` 外层换真实 app 等价的 `compact-group` 列布局) |
| 中文 UI 文案 | `src/web/i18n.ts` `DICT` 补全 EN(组名 + intro + 5 包名/描述 + 徽标 + 预览 hint/按钮);产品术语保持英文 |

### 4.1 受影响文件
- `src/web/hud/icons.tsx` — 加 `scene` 图标。
- `src/web/hud/settings-schema.ts` — 加 `artpack` 组(`compact` 之后)。
- `src/web/hud/Settings.tsx` — `ArtPackGroup` + `ArtPackPreview` + special-render 分支。
- `src/web/hud/artpack.ts`(新)— `ART_PACKS` 列表 + `loadArtPack`/`applyArtPack` 纯逻辑;`artpack.test.ts`(新)。
- `src/web/styles.css` — `.artpack-*` + `.apv-*`。
- `src/web/i18n.ts` — 新 DICT 条目。

## 5. 测试 / 验证

- **纯函数单测**(`artpack.test.ts`):`ART_PACKS` 形状(5 包、唯一 ready=pixel-fantasy)、`loadArtPack` 默认/读取/异常兜底、`applyArtPack` 写 localStorage + 盖 `data-artpack`。
- **门禁**:`bun test` + `bunx tsc --noEmit`(`noUncheckedIndexedAccess`)+ `bun run check` + `bun run build` 全绿。
- **浏览器 e2e(强约束,合并 main 后跑)**:Settings → 美术风格 → 5 卡网格 → 点占位卡 → 预览浮层(场景/NPC/道具/按钮)→ 确认 → 该卡「✓ 使用中」+ `localStorage`/`data-artpack` 落地;中 / EN 双语各截图。
- 工作流:detached worktree 实现 → 门禁 → 记 HEAD SHA → 回 main `git merge --no-ff` → 浏览器 e2e 复验 → push 经用户确认。

## 6. 明确不做
- 不接 `settings-store` / 不动事件协议 / 不为 4 个占位包做真实素材管线(无素材源,按占位呈现)。
- 不与 `skin`(dungeon/holo)互联。
- 不在 ROADMAP 之外扩范围;完成后回写 ROADMAP 一条。
