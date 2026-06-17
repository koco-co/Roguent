---
title: Roguent Vibe-Coding 美术总替换(高清落地 + computer-use 出图)— 设计
date: 2026-06-17
status: design (brainstorm 完成,待 writing-plans)
supersedes_partially: 2026-06-08-roguent-vibe-coding-art-themes-design.md(承接其风格库 / SKILL 设计 / 高清意图;修订其出图通道与渲染落地路线)
baseline: 本地 main(领先 origin);artpack 体系(§3.8 art-style-pack)已合入,4 套生成包已存在但素材糊
---

# Roguent Vibe-Coding 美术总替换 — 设计

## 0. 一句话

把 Roguent 现有的开源/已生成美术资源,**全部替换**为两套统一 vibe-coding 风格(`cyber` 赛博霓虹·夜 / `lofi` 暖光·昼)、**高清不糊**的 roguelike 像素素材;素材由 **computer-use 驱动 codex 桌面端 gpt-image-2(订阅态、零 API key)单体出图**生成,落进**升级后的单 atlas 高清帧契约**;设置里可切换、预览确认、全场景一同换皮。**素材生成由 codex 负责,所有代码变更由本会话(我)负责**;全部完成后做端到端**视觉验证**。

> 承接 [2026-06-08 设计](2026-06-08-roguent-vibe-coding-art-themes-design.md):那份文档早已定下 cyber/lofi 两套风格、完整 STYLE PREFIX、30 条切片提示词、一致性机制、生成 SKILL,并明确「高清不糊、绝不降 16px」。但 2026-06-15 实施(§3.8 art-style-pack)为复用渲染管线,把高清图**降进 0x72 的 16px atlas + 后期糊化**,于是糊了。本轮是**把那份高清设计真正落地**,并把出图通道换成 computer-use(零 key)。

---

## 1. 目标与非目标

### 目标
1. **替换全部美术资源**:场景(房间地块/墙/装饰)、NPC/角色、敌人、彩蛋(扭蛋机/任务台/许愿池/宝箱怪)、道具/结构 —— 统一成两套 vibe-coding 风格。
2. **高清不糊**:达到 2026-06-08 D5 的「Dead Cells/Eastward 档高清像素」,清晰可读、不刺眼。**治糊三管齐下**(见 §4)。
3. **两套可切换**:`cyber`(冷·夜)/ `lofi`(暖·昼);设置面板切换 → 预览确认 → 全场景+NPC+彩蛋一同换皮。
4. **零 key 出图**:用 computer-use 操控 codex 桌面端的内置 `image_gen`(=gpt-image-2,走订阅态),不需要 `OPENAI_API_KEY`。
5. **固化 skill**:把 computer-use 出图操作固化成可复用 skill(`codex-gpt-image`),先落地并端到端验证一张,再批量。
6. **视觉验证**:全部完成后在真实 app 里走完整路径,确认 NPC/场景/按钮/聊天窗口正确加载,且切换后正常渲染,附证据。

### 非目标(本轮不做)
- **不做多区域工作楼层 + 相机跟随**(2026-06-08 §7.3 的大重构;本轮维持现有单间房间 + 大厅结构)。
- **不把按钮/HUD 图标逐套出图**:保持 `icons.tsx` 矢量 SVG,只让 accent 色全局跟随 artpack 变(§6.4)。
- **不追求真逐帧动画**:gpt-image 难保跨帧角色一致;沿用「静态单图填充 anim 帧」的伪动画 + 现有程序化动作(wander/bob/fade)。
- **不改 engine / 事件协议 / domain / store**:纯前端 + 美术资产 + `scripts/art` 出图烘焙管线。
- **不改逐资产 PNG + manifest 架构**(2026-06-08 §7.1):侦察证实现有单 atlas 切换无死角、改动最小,故沿用单 atlas、只升级帧尺寸契约。

---

## 2. 决策日志(本轮与用户敲定)

| # | 决策 | 取值 |
| --- | --- | --- |
| D1 | 范围取舍 | 做 2 套新的(cyber/lofi)替换;**删除** 4 套旧生成包(neon-terminal/holo-blueprint/deep-space/synthwave);**保留** `pixel-fantasy`(0x72 CC0)但从设置 UI 隐藏,仅当**不可见 fallback** 防黑屏 |
| D2 | 两套风格 | `cyber`(赛博霓虹·夜)+ `lofi`(暖光·昼),复用 [2026-06-08 §5](2026-06-08-roguent-vibe-coding-art-themes-design.md) 的 STYLE PREFIX + §6.2 的 30 条切片提示词 |
| D3 | 清晰度档 | **原设计高清档**:角色 ~64–96px、瓦片 ~32–48px、Boss ~144px(=2026-06-08 D9);沿用**单 atlas** 框架 + `nearest` 整数缩放;精确倍率实现时按「清晰不糊 + 房间布局合理 + 整数缩放」调定并 preview 验证 |
| D4 | 按钮/HUD 图标 | 保持 `icons.tsx` 矢量 SVG,**不**逐套出图;补全局 `--ac` 跟随 artpack(见 §6.4) |
| D5 | 出图通道 | computer-use 驱动 codex 桌面端 gpt-image-2(订阅态、零 key);**单体出图**(非网格 sheet);初始 prompt 让 codex 用 shell **写进项目目录**(绕过取图卡点);纯键盘新对话循环;固化成 skill,先验证一张再批量 |
| D6 | 分工 | codex-gpt-image **只负责生成图片**;所有代码变更(帧契约改造 / 切换落位 / 烘焙脚本 / 删旧包 / 验证)由本会话负责 |
| D7 | 验证 | 全部完成后 preview 端到端视觉验证 + 切换验证 + 门禁(test/tsc/check/build) |

---

## 3. 现状与根因(已核实)

### 3.1 artpack 体系(已合入)
- 运行时渲染**单张图集** `atlas/dungeon.png`(381 帧 TexturePacker spritesheet)。
- 现有 5 套:`pixel-fantasy`(0x72 CC0,唯一真开源)+ 4 套已生成(neon-terminal/holo-blueprint/deep-space/synthwave);`DEFAULT_ARTPACK = neon-terminal`。
- 切换:`localStorage['roguent_artpack']` + `<html data-artpack>` + `ARTPACK_CHANGE_EVENT`;[artpack.ts](../../../src/web/hud/artpack.ts) + [artpack-assets.ts](../../../src/web/artpack-assets.ts)。

### 3.2 「没生效」的真根因 = 糊,不是机制坏(侦察证实)
- **切换链路无死角**:所有 atlas 消费端都正确监听 `ARTPACK_CHANGE_EVENT` 并重载 —— `room/atlas.ts`+`Room.tsx`、`lobby/atlas-dom.ts`+`atlas-image.ts`+`HubCanvas.tsx`+`PixelSprite.tsx`、`hud/HeroPortrait.tsx`。切换机制是好的。
- **糊的三个根源**(`scripts/art/apply-gpt-image-overrides.py`):
  1. **后期糊化**:`reduce_environment_noise` 用 `block_pixel_art(block_size=2)`(缩 1/2 再 NEAREST 放大 = 均值滤波)+ `mix_toward_average(0.46)`(混 46% 均值色)—— **这是糊的主因**。
  2. **网格 crop 丢细节**:源 sheet(~1000–1700px)按 4×3/8×4 网格切成 ~312px,再拟合到 16×28,损失大量细节。
  3. **帧太小**:16×28 角色帧,放大就是粗马赛克。

### 3.3 治糊方向(本轮)
三管齐下:① **去后期糊化**(取消/大幅降低 `block_pixel_art` + `mix_toward_average`);② **单体出图保细节**(每素材一张 1024px 图,缩到高清帧,损失远小于网格 crop);③ **提帧尺寸到高清档**(D3)。

---

## 4. 出图管线(核心)

### 4.1 单体出图(非网格 sheet)
- **为什么不出网格 sheet**:现有 4 套就是让 gpt-image 出「4×3 网格」整张,AI 出整齐对齐网格不可靠,是糊/错位根源之一。
- **改成单体**:codex **每次出一个**素材(一个角色全身 / 一个扭蛋机 / 一组地块),1024px 级、纯色或近透明底。
- **工作量**:~30 个核心独立素材(侦察:12 角色 + 6 地块/环境 + 12 道具,外加敌人/Boss/结构/彩蛋按 OVERRIDE_MAP 核定)× 2 主题 ≈ **60 张出图**。多帧资产先出 1 张基准图,烘焙时填充其 anim 帧(伪动画)。

### 4.2 出图 → atlas 的新管线(脚本)
```
codex 出 1024px 单体图 ──(写进项目目录)──▶ scripts/art/gen-out/<theme>/<asset>.png
  │
  ├─ remove-bg.py(新增)      去背 → 透明底 PNG(PIL alpha 边界检测,或 rembg)
  ├─ scale-to-frame.py(新增) 读 dungeon.json 目标尺寸,LANCZOS 缩放 + 居中 → 高清帧规格 PNG
  └─ apply-gpt-image-overrides.py(改)
       新增 method='individual-render' 分支:直接读单体 PNG(不裁网格、不 cleanup)
       stylize/finalize 保留,但【取消或大幅降低 reduce_environment_noise 糊化】
       → 写入对应帧名位置 → 烘进 atlas/dungeon.png
```
- 新增 `Override` 字段:`method: 'source-sheet-cell-fit' | 'individual-render'`、`renderSourcePath`(支持新旧混用、json 报告区分)。
- `apply_pack` 主驱动加分支:`individual-render` 走新加载路径。
- 降采样:`individual-render` 路径用 **LANCZOS**(下采样更优),不走 `block_pixel_art` 糊化。

### 4.3 codex-gpt-image skill(先落地,固化 computer-use 操作)
固化上次摸通的操作,**绕过两个卡点**(点击被「程序坞」拦、桌面 app 图不落盘):
```
输入: jobs = [{ prompt, outPath(项目绝对路径), size }]
前置: request_access Codex(full tier) → open_application Codex
对每个 job:
  1. Cmd+N 开新对话(键盘,绕过点击被拦)→ 焦点落主输入框
  2. type 复合 prompt:
     "用内置 image_gen 生成:<prompt>。尺寸 <size>。
      生成后用 shell 把原图(不压缩不缩放)保存到 <outPath>。完成回复 DONE。"
  3. Enter 发送(主输入框 Enter=发送,已验证)
  4. 轮询:Bash 检查 <outPath> 是否出现且大小稳定;超时则截图诊断
  5. 下一个 job
```
- ⚠️ **唯一未验证点 = `Cmd+N` 能否开新对话并聚焦输入框**(上次只验证了主输入框 Enter 发送、follow-up 框 Enter 是换行、点击全被拦)。这是 M0 第一关。
- skill 形态:可复用(放 `.claude/skills/` 或全局),输入一批 job 自动循环出图。

---

## 5. 高清帧契约改造(代码,我负责)

> 沿用单 atlas;把 16px 基准提到 D3 高清档。侦察(render-2x)按「2x(TILE 16→32)」摸清了**改造点蓝图**;本轮目标是更高的高清档,**改造点相同、倍率按目标缩放**,最终倍率实现时按「清晰不糊 + 房间布局合理 + 整数缩放」调定。

### 5.1 帧尺寸契约
- `public/assets/{0x72,artpacks/*}/atlas/dungeon.json`:角色 16×28→高清档(如 ≥32×56 起,目标 64×96 级)、瓦片 16×16→32×32+、Boss 32×36→64×72+;atlas png 尺寸相应扩大(总体积约 4–25x,按倍率)。
- `verify-artpack.ts`:`verifyAtlasFrameSizes` 当前严格匹配 0x72 reference;需先生成**新高清 reference** 或加宽松/倍数匹配;`parseAtlasFrameSizes` 通用、自动适应。
- `gpt-image-overrides.json` 的 `targetSize` 随 dungeon.json 改(脚本重生,勿手改遗漏)。

### 5.2 渲染层常数(虚拟像素随倍率缩放)
侦察清单(render-2x,按 2x 示范;实际按目标倍率):
- **基准**:`room/config.ts` `TILE=16`→提高(VW/VH 自动衍生)。
- **几何已参数化、自动适应**(无需改):门坐标、房间整数缩放 `Room.tsx:149`、`HeroPortrait` 自适应缩放、`Character` anchor(归一化)。
- **硬编码虚拟像素需缩放**:`Character.tsx`(发光 scale 分母 64→源纹理尺寸、阴影/选圈椭圆、名牌 y=-38)、`Lights.tsx`(scale 分母 64、radius、x 偏移)、`DungeonRoom.tsx`(地毯/指挥台/符文线宽与内缩)、`ToolBubble.tsx`/`Emote.tsx`(泡泡尺寸与 y 偏移)、`room-props.ts`(符文圈半径)、`lobby/hub-paint.ts`(T=TILE×S,确认大厅是否同步)、`PixelSprite.tsx` scale。
- ⚠️ 关键坑:发光精灵 `scale=radius/64` 的分母 64 是源 glow 纹理尺寸,改 TILE 必须同步,否则发光比例错乱;ToolBubble 泡泡尺寸遗漏会与头部错配;大厅 `hub-paint` 的 T 有独立缩放轨迹需明确确认。

---

## 6. 切换 + 兜底落位(代码,我负责)

### 6.1 删 4 套 + 加 2 套(侦察精确清单)
- `src/web/hud/artpack.ts`:`ART_PACKS` 删 4 个旧对象;追加 `cyber`/`lofi`(完整 id/name/en/ac/desc/ready=true/previews/sourceSheets);`DEFAULT_ARTPACK = 'cyber'`。
- `src/web/artpack-assets.ts`:无需改代码(`readyPackIds` + fallback 自动更新)。
- 测试同步:`artpack.test.ts`(长度 5→3、ready 列表、DEFAULT)、`artpack-assets.test.ts`(fallback 断言 + cyber/lofi case)、`verify-artpack.test.ts:488`(循环包 ID + 381 帧约束)、`LoginGate.test.tsx`(synthwave→新 ID)。
- `i18n.ts`:删旧包 name/en/desc 译条,补 cyber/lofi(grep 验证无残留键)。
- 资源:`rm -rf public/assets/artpacks/{neon-terminal,holo-blueprint,deep-space,synthwave}`;新建 `public/assets/artpacks/{cyber,lofi}/` 全套(严格遵 `verify-artpack.test.ts` 的 `REQUIRED_ARTPACK_FILES`)。

### 6.2 pixel-fantasy 当不可见 fallback
- 保留 `pixel-fantasy`(ready=true)但**从 Settings ArtPackGroup 隐藏**(过滤掉,不渲染卡片);仅当某 pack atlas 加载失败时,`resolveArtPackAtlasUrls` 的 DEFAULT/fallback 顶上(`Room` 错误层 + `HubCanvas` 草色兜底已在)。

### 6.3 切换链路(无死角,侦察证实)
- 复用 `ARTPACK_CHANGE_EVENT`,所有消费端已监听重载,无需新增监听。删旧加新后,验证两套来回切全部一同换皮。

### 6.4 accent 全局跟随(要补的坑)
- 侦察发现 `--ac` **目前只在 Settings 卡片内联注入、无全局跟随**。要让矢量图标(D4)全局跟 artpack 变色:在 `App.tsx` 初始化 + `ARTPACK_CHANGE_EVENT` 时,把当前 `artpack.ac` 写进根节点 `--ac`(与 settings-store 的 `--accent` 区分,两套独立)。

---

## 7. 数据流

```
codex 桌面端(gpt-image-2,订阅态)
  └─[skill: Cmd+N 循环]→ 单体 PNG 落 scripts/art/gen-out/<theme>/<asset>.png
       └─ remove-bg → scale-to-frame → apply(individual-render,去糊化)
            └─ 烘进 public/assets/artpacks/<theme>/atlas/dungeon.{png,json}
                 └─ 运行时 resolveCurrentArtPackAtlasUrls → loadAtlas → tex/anim
                      └─ Room/Character/DungeonRoom/lobby/HeroPortrait 渲染
   设置切换 → applyArtPack → ARTPACK_CHANGE_EVENT → 全消费端重载 + 根节点 --ac 更新
```

---

## 8. 视觉验证(全部素材完成后)

用 preview 工具在**真实运行的 app** 里走完整路径,附证据(截图/DOM 断言/控制台无错):
1. 默认风格(cyber):大厅场景、内景房间地块、NPC 小人、彩蛋(扭蛋机/任务台)、HUD 按钮(矢量+accent)、聊天窗口 —— 逐项确认正确加载、清晰不糊。
2. 设置切到 lofi → 预览浮层 → 确认 → 回大厅/内景:确认**所有美术一同换皮**、无残留旧素材、无报错、accent 全局变色。
3. 两套来回切:幂等、无加载失败黑屏(fallback 生效)。
4. 门禁:`bun test` + `bunx tsc --noEmit` + `bun run check` + `bun run build` 全绿。

---

## 9. 里程碑

```
M0  落地 codex-gpt-image skill + 端到端验证 1 张                          ← 风险前置
    (Cmd+N 开新对话→生成→写项目目录→remove-bg→scale→烘焙→渲染出来)
    第一关 = 验证 Cmd+N 能开新对话并聚焦输入框;不通先解决再批量
M1  高清帧契约改造(dungeon.json 尺寸 + verify 契约 + 渲染层常数)
    + 切换落位(ART_PACKS 删4加2 + DEFAULT=cyber + 全局 --ac + 测试同步)
    + 烘焙管线改造(remove-bg/scale-to-frame/individual-render + 去糊化)
M2  skill 批量出 cyber 全套(~30 素材)→ 烘焙 → 渲染验证 + 调倍率/去背参数
M3  同样出 lofi 全套 → 烘焙 → 渲染验证
M4  删 4 套旧包资源 + 全链路视觉验证(两套切换)+ 门禁
```

---

## 10. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `Cmd+N` 开新对话是否可行(skill 命脉) | M0 第一关验证;不通则探索其它键盘开新对话方式 / 单对话多轮的替代 |
| codex 桌面 app 能否把内置 image_gen 图用 shell 写到指定盘路径 | M0 端到端验证(上次未跑通是消息没发出去,非 codex 不能写);不通则探索 codex 导出/复制路径 |
| 去后期糊化后是否仍需降噪 | M2 调参:`mix_toward_average` 权重 0.46→0.08~0.15 或取消;preview 对比 |
| 去背质量(remove-bg) | 优先 PIL alpha 边界;不稳则 rembg;统一纯色/chroma-key 底降低难度 |
| atlas png+json 4–25x 体积、坐标重排 | 脚本/TexturePacker 正确重排;先小批验证帧位不错 |
| verify-artpack 严格匹配 reference | 先生成新高清 reference 或加宽松/倍数匹配 |
| 跨素材像素密度/比例一致性 | 沿用 2026-06-08 §6.3:先出基准图(主控英雄)锁风格,后续喂基准图作参考 |
| 倍率定多大才「清晰不糊又布局合理」 | M1/M2 调 + preview 视觉验证;render-2x 清单按目标倍率缩放 |
| 全局 `--ac` 跟随缺失 | §6.4 在 App.tsx 补根节点写入 |

---

## 11. 本轮交付与下一步
- **交付**:本设计文档 + (writing-plans 阶段)实施计划。
- **下一步**:进入 **writing-plans**,产出实施计划 —— M0 skill 落地与单张验证、M1 帧契约+切换+烘焙改造、M2/M3 批量出图、M4 删旧+视觉验证,每步带验收。
- **承接**:风格库 / STYLE PREFIX / 30 条提示词 / 一致性机制直接复用 [2026-06-08 设计](2026-06-08-roguent-vibe-coding-art-themes-design.md) §5/§6;本轮修订其出图通道(computer-use 替代 API/Codex)与落地路线(单 atlas 高清档替代逐资产 manifest),并明确不做多区域+相机。
