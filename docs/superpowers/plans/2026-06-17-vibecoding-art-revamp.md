# Roguent Vibecoding 美术总替换 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Roguent 全部美术替换为两套统一 vibe-coding 风格(`cyber` 夜 / `lofi` 昼)、高清不糊的 roguelike 像素素材;用 computer-use 驱动 codex 桌面端 gpt-image-2(订阅态、零 key)单体出图,落进升级后的单 atlas 高清帧契约;设置里可切换、预览确认、全场景+NPC+彩蛋一同换皮。

**Architecture:** 沿用现有单 atlas + `ARTPACK_CHANGE_EVENT` 切换框架(侦察证实切换链路无死角)。治糊三管齐下:① 去烘焙后期糊化(`block_pixel_art`+`mix_toward_average`)② 单体出图保细节(1024px 单体,不裁网格)③ 帧尺寸提到高清档(`config.ts` 单一 `HD_SCALE = TILE/16` 参数化,渲染层虚拟像素常数随之缩放)。出图由 computer-use 操控 codex 桌面端内置 `image_gen`,单体图经 shell 写进项目目录,再经 `remove_bg → scale-to-frame → apply(individual-render 去糊化)` 烘进 atlas。

**Tech Stack:** React 19 + PixiJS v8 + Zustand(前端);Python 3 + PIL(烘焙脚本);computer-use MCP + Codex 桌面端(出图);bun(测试/构建)。

**Spec:** [docs/superpowers/specs/2026-06-17-vibecoding-art-revamp-design.md](../specs/2026-06-17-vibecoding-art-revamp-design.md)

---

## 文件结构

```
新建:
  .claude/skills/codex-gpt-image/SKILL.md        computer-use 出图 skill(项目级,随仓库提交)
  scripts/art/remove_bg.py        (+ test_remove_bg.py)         去背
  scripts/art/scale_to_frame.py   (+ test_scale_to_frame.py)    缩放到帧
  src/web/room/config.test.ts                                   HD 基准测试
  public/assets/artpacks/{cyber,lofi}/**                        两套新资源(M1a 占位 → M2/M3 真图)
修改:
  scripts/art/apply-gpt-image-overrides.py        individual-render 分支 + 去糊化 + Override 字段
  scripts/art/verify-artpack.ts                   高清帧尺寸契约
  public/assets/{0x72,artpacks/cyber,lofi}/atlas/dungeon.json   帧尺寸(按 HD_SCALE 重生)
  src/web/room/config.ts                          TILE=40 + 导出 HD_SCALE
  src/web/room/{Character,Lights,DungeonRoom,ToolBubble,Emote}.tsx, room-props.ts   ×HD_SCALE
  src/web/lobby/{hub-paint.ts,PixelSprite.tsx}    大厅缩放
  src/web/hud/artpack.ts                          ART_PACKS 删4加2 + DEFAULT='cyber'
  src/web/App.tsx                                  全局 --ac 跟随 artpack
  src/web/hud/Settings.tsx                         隐藏 pixel-fantasy 卡片
  src/web/i18n.ts                                  pack 译条
  测试: artpack.test.ts / artpack-assets.test.ts / verify-artpack.test.ts / LoginGate.test.tsx / Settings.test.tsx
删除(M4): public/assets/artpacks/{neon-terminal,holo-blueprint,deep-space,synthwave}/
```

---

## 整合裁决(权威 — 覆盖各 milestone 起草中的 openQuestions / 冲突)

执行时以下面这些裁决为准,优先于各 Task 块里的局部假设:

1. **Python 解释器**:实测仅 `/usr/bin/python3` 有 PIL 11.3.0 + pytest 8.4.2(homebrew python 无 PIL、无 rembg)。**所有 Python 命令一律 `/usr/bin/python3`**,pytest 用 `/usr/bin/python3 -m pytest`。去背用 PIL 自实现(无 rembg)。M0 块里若写 `uv run --with pillow` 一律以此为准。
2. **HD_SCALE 单一真相源**:`config.ts` 的 `TILE=40`(`HD_SCALE=TILE/16=2.5`)是**唯一**缩放真相源。`dungeon.json` 帧尺寸、`scale_to_frame` 目标尺寸都按同一 SCALE。**M1 与 M2 共用此值**;M2 preview 视觉验证后若要换挡,只改 `config.ts` 一个常数 + 重生 `dungeon.json`,渲染层按 HD_SCALE 自适应。
3. **帧数不变**:高清档**只改帧尺寸,不改 381 帧数 / 分类分布**。`verify-artpack` 的 `atlasFrameCount=381` 与 `coveredFramesByCategory` 保持。
4. **发光 scale 分母保持 64**(采纳 M1a 的实证纠正,**不**按侦察 render-2x 改成 128):`glowTexture` 是 128px、64 是调参常数;分子按 HD_SCALE 放大即可保持 tile 覆盖。
5. **运动常数纳入 M1a**:`Character.tsx` 的 `WANDER_R_*`/`SPEED` 按 HD_SCALE 放大(保持漫步手感),作为 M1a 必做项。
6. **cyber/lofi atlas 占位由 M1a 建**:M1a 在改帧契约时,顺带建 `public/assets/artpacks/{cyber,lofi}/atlas/{dungeon.json,dungeon.png,gpt-image-overrides.json}` 占位(满足 `REQUIRED_ARTPACK_FILES` + 381 帧契约),保证 M1b 把 `DEFAULT='cyber'` 后默认包不黑屏;M2/M3 用真图替换占位。
7. **verify-artpack.test.ts 4 个循环**(488/529/556/574):M1b 把循环 id 改成 `['cyber','lofi']`;**内容型 3 个循环(角色帧数/硬边/噪声分)`it.skip` + TODO**,留到 M2/M3 出图烘焙后解 skip;帧契约循环(488)正常跑(靠 M1a 占位的 dungeon.json + 报告)。
8. **测试文件实为 5 个**:`Settings.test.tsx`(第 300-372 行硬编码点 deep-space/holo-blueprint 卡片)纳入 M1b,改成点 cyber/lofi。
9. **accent 色**:`cyber=#36c5e0`(冷青,沿用项目默认)、`lofi=#f2a65a`(暖橙);保持 `/^#[0-9a-f]{6}$/i`;M2 出图后可按实际主色微调。
10. **去糊化起步值**:`mix_toward_average 0.46→0.10/0.08/0.06`、`contrast 1.55→1.25`、`alpha 阈值 64→96`;M2 preview 验证后定死。
11. **individual-render 映射归属**:M1c 实现分支能力 + 临时 override 单测;M2 负责把 `renderSourcePath` 写进 OVERRIDES,并保证 individual-render 把一个 scaled raw 正确填充其所有 anim/复用帧别名(覆盖全部 381 帧)。
12. **一致性机制降级**:computer-use 喂参考图给 codex `image_gen` 不可靠 → 跨素材一致性靠 **STYLE_PREFIX 文本约束 + 先出 `knight_m` 基准图人工锁风格 + 后续 prompt 复述风格锚点**,不依赖 image-input 参考图(2026-06-08 §6.3 的图参考机制降级为文本约束)。
13. **skill 项目级**:`.claude/skills/codex-gpt-image/`,随仓库提交。
14. **M0 是强 gate**:M0 用现有 16×28 尺寸验证「出图→写盘→去背→缩放→烘焙→渲染」管线打通(不强求高清档,那依赖 M1)。若 codex `image_gen` 无法 shell 写盘 → **gate 失败,停在 M0 重设计出图通道,不进 M2/M3**(spec §9/§10)。
15. **非清单装饰常数**:M1a 用 grep 复核 `Particles.tsx`/`Minimap.tsx`/`QuipOverlay.tsx` 等;装饰性硬编码 px(粒子尺寸等)影响轻微,记为风险、preview 时按需补,不预先盲改。

---

## 里程碑与执行顺序

```
M0(gate) ──▶ M1a ──▶ M1b ──▶ M1c ──▶ M2(cyber) ──▶ M3(lofi) ──▶ M4(删旧+视觉验证+门禁)
   │           └ 先建 cyber/lofi atlas 占位,M1b 才能切默认包
   └ 不通则停下重设计出图通道,不进 M2
```

各 milestone 内部 Task 编号从 1 开始(局部编号);跨 milestone 用「Mxx-Task N」定位。

---


# Milestone M0 — codex-gpt-image skill + 单张端到端验证(GATE)

## Milestone M0: 落地 codex-gpt-image skill + 端到端验证 1 张(强 gate)

> **本 milestone 是 gate**:不通过则停下重设计出图路线,**不进 M2/M3**(spec §9/§10)。
> 大量步骤是 computer-use 操作(不可 TDD),按「明确操作步骤 + 验收标准 + 证据(截图/DOM/日志)」走;脚本部分(去背/缩放/烘焙手验)走「先验证管线能跑 → 留证据」。
>
> **关键环境事实(本会话已核实)**:
> - Codex 桌面端在 `/Applications/Codex.app`(`request_access`/`open_application` 用名字 `Codex`)。
> - 系统 `python3` **没有 PIL**;凡跑 PIL 脚本一律 `/usr/bin/python3 …`(`uv` 已装在 `/opt/homebrew/bin/uv`)。
> - `assemblePrompt('cyber','knight_m')`(`scripts/art/prompts.ts`)产出 M0 要用的 cyber 主控英雄 prompt(下文 Task 4 内联了它的完整文本)。
> - 现有 atlas(如 `public/assets/artpacks/synthwave/atlas/`)是 381 帧 TexturePacker sheet,`meta.size=128×1178`,`knight_m_idle_anim_f0..f3` 各 `16×28`,`meta.image=dungeon.png`。M0 在 M1 帧契约改造**之前**跑,故端到端只为验证管线打通,用现有 16×28 尺寸烘进一个**临时 atlas 副本**即可,高清档留给 M1/M2。
> - 出图落盘契约(跨 Task 一致):`scripts/art/gen-out/cyber/raw/<asset>.png`(原图)→ `…/nobg/<asset>.png`(去背)→ `…/scaled/<frame>.png`(缩放到帧规格)。
> - `.claude/skills/codex-gpt-image/SKILL.md` 是项目级 skill(随仓库提交)。

---

### Task 1: [M0] 建 codex-gpt-image skill 骨架(目录 + frontmatter + 占位正文)

**Files:**
- Create: `/Users/poco/Projects/Roguent/.claude/skills/codex-gpt-image/SKILL.md`

- [ ] **Step 1: 建目录并确认现状**
  ```bash
  mkdir -p /Users/poco/Projects/Roguent/.claude/skills/codex-gpt-image
  ls -la /Users/poco/Projects/Roguent/.claude/skills/
  ```
  期望:列出已有 `chinese-jargon-cleaner/ defuddle/ find-skills/` 之外,新增空目录 `codex-gpt-image/`。
  > 注:项目 `.claude/skills/` 已有别的 skill,本 skill 与它们平级。SKILL.md 格式参照 `/Users/poco/.claude/skills/defuddle/SKILL.md`:YAML frontmatter(`name` + `description`)+ markdown 正文。

- [ ] **Step 2: 写 SKILL.md 的 frontmatter + 正文**
  把下面整段写进 `/Users/poco/Projects/Roguent/.claude/skills/codex-gpt-image/SKILL.md`(后续 Task 2/3 会校正其中「Cmd+N 是否可行」与「写盘路径」的措辞,以验证结果为准):
  ````markdown
  ---
  name: codex-gpt-image
  description: Drive the Codex desktop app via computer-use to generate pixel-art sprites with its built-in image_gen (gpt-image-2, subscription/zero-key), saving each image straight to a project path. Use when a Roguent art job needs one or more 1024px single-subject sprites written to scripts/art/gen-out/<theme>/raw/<asset>.png. Inputs: a list of jobs (prompt, size, outPath). One new conversation per job via Cmd+N, polled to completion on disk.
  ---

  # codex-gpt-image

  Generate single-subject pixel-art sprites by driving the **Codex desktop app** (`/Applications/Codex.app`)
  with computer-use. Codex's built-in `image_gen` is gpt-image-2 on the user's subscription — **no `OPENAI_API_KEY`**.
  Each job: open a fresh conversation, send a compound prompt that tells Codex to generate the image **and**
  `shell`-write the raw PNG to an absolute project path, then poll that path from Bash until the file appears and stabilizes.

  ## When to use
  - A Roguent art job needs one or more **single-subject** 1024px sprites (one character / one tile / one prop per image — NOT a grid sheet).
  - Output must land at `scripts/art/gen-out/<theme>/raw/<asset>.png` (theme ∈ `cyber` | `lofi`), the agreed落盘 contract feeding `remove-bg.py` → `scale-to-frame.py` → `apply-gpt-image-overrides.py`.

  ## Input contract
  A list of jobs, each:
  ```
  { prompt: string,            // the full assembled image prompt (style prefix + body + framing + avoid)
    size: "1024x1024" | "1024x1536",  // characters use 1024x1536; tiles/props use 1024x1024 (matches scripts/art/gen.ts sizeFor)
    outPath: string }          // ABSOLUTE path, e.g. /Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/knight_m.png
  ```
  Build `prompt` with `assemblePrompt(theme, asset)` from `scripts/art/prompts.ts`
  (`bun -e "import {assemblePrompt} from './scripts/art/prompts.ts'; console.log(assemblePrompt('cyber','knight_m'))"`).

  ## Preconditions (once per session)
  1. `mcp__computer-use__request_access` with `apps: ["Codex"]`, full tier, reason e.g. "Generate Roguent pixel-art sprites in Codex".
  2. `mcp__computer-use__open_application` `app: "Codex"`.
  3. For each job's `outPath`, ensure the parent dir exists from Bash first:
     `mkdir -p "$(dirname <outPath>)"` — so Codex's shell write has a target and you control the location.

  ## Per-job loop (keyboard-driven; clicks are unreliable — see Caveats)
  For each job:
  1. **New conversation**: send `Cmd+N` (`mcp__computer-use__key` text `"cmd+n"`). This opens a fresh chat with focus in the main input box. **Verify** with a screenshot before typing (Cmd+N viability is the M0 gate — see VERIFICATION below).
  2. **Type the compound prompt** (`mcp__computer-use__type`). Template (fill `<…>`):
     ```
     Use your built-in image_gen tool to generate this image: <PROMPT>.
     Image size: <SIZE>.
     After generating, use your shell tool to save the ORIGINAL full-resolution PNG (no compression, no resize) to exactly this path: <OUTPATH>.
     Create the parent directory if needed. When the file is written, reply with just: DONE.
     ```
  3. **Send**: `mcp__computer-use__key` text `"Return"` (the MAIN input box treats Enter as send — verified; the follow-up box treats Enter as newline, so always send from a fresh main box).
  4. **Poll from Bash** (NOT computer-use) until the file appears and its size is stable across two reads ~3s apart:
     ```bash
     OUT=<OUTPATH>
     for i in $(seq 1 60); do
       if [ -f "$OUT" ]; then
         a=$(stat -f%z "$OUT"); sleep 3; b=$(stat -f%z "$OUT")
         if [ "$a" = "$b" ] && [ "$a" -gt 1000 ]; then echo "READY $OUT ($b bytes)"; break; fi
       fi
       sleep 5
     done
     ```
     Total budget ~5min/job. On timeout: `mcp__computer-use__screenshot` to diagnose (did Codex error? is it waiting on approval? did the shell write somewhere else?), then see Caveats.
  5. Next job.

  ## Caveats / known failure modes
  - **Cmd+N is the linchpin** — if it does NOT open a new conversation with input focus, do NOT proceed to batch. Fallbacks to探索: the Codex File menu's "New" item (read its shortcut via a screenshot of the menu bar), or single-conversation multi-turn (reuse one chat, but then Enter-in-follow-up = newline, so send via the conversation's send affordance instead). Record whichever works back into this skill.
  - **Clicks get intercepted** by the macOS Dock ("程序坞") overlay — prefer keyboard (Cmd+N, type, Return) over coordinate clicks.
  - **If Codex won't shell-write to the given path**: check `~/Downloads` and Codex's default export dir, then `cp` into `outPath` from Bash. If image_gen refuses shell access entirely, the zero-key write-to-disk channel is broken → escalate (this fails the M0 gate).
  - **Never click web links** surfaced inside Codex with computer-use.

  ## Output verification
  After all jobs: `ls -la scripts/art/gen-out/<theme>/raw/` shows each `<asset>.png` > 1KB. Spot-check one with `Read` (it renders the image) to confirm it's the intended subject, not an error card.
  ````

- [ ] **Step 3: Commit**
  ```bash
  git -C /Users/poco/Projects/Roguent add .claude/skills/codex-gpt-image/SKILL.md
  git -C /Users/poco/Projects/Roguent commit -m "feat: 🧩 add codex-gpt-image skill scaffold (computer-use → Codex image_gen)"
  ```

---

### Task 2: [M0] 第一关 gate — 验证 Codex `Cmd+N` 能开新对话并聚焦输入框

> 这是 spec §4.3/§10 标注的**唯一未验证点**(上次只验过主输入框 Enter 发送、follow-up 框 Enter 换行、点击全被「程序坞」拦)。**先单独把它跑通,再做整条端到端**。

**Files:** 无(纯 computer-use 验证 + 把结论回写 SKILL.md)

- [ ] **Step 1: 申请访问 + 打开 Codex**
  - `mcp__computer-use__request_access` → `apps: ["Codex"]`, reason: "Verify Codex new-conversation shortcut for Roguent art pipeline"。
  - `mcp__computer-use__open_application` → `app: "Codex"`。
  - `mcp__computer-use__screenshot` → 确认 Codex 在前台、能看到当前对话与主输入框。
  验收:截图里 Codex 是 frontmost,主输入框可见。

- [ ] **Step 2: 记录基线 + 发 Cmd+N**
  - 先 `mcp__computer-use__screenshot` 记当前对话状态(有没有历史消息、输入框里有没有残留文本)。
  - `mcp__computer-use__key` text `"cmd+n"`。
  - 再 `mcp__computer-use__screenshot`。
  验收(**gate 判定**):新截图相比基线,对话区清空成「新对话」(无旧消息),且光标/焦点在主输入框(下一步打字能落进去)。

- [ ] **Step 3: 证明焦点真在主输入框(打字探针)**
  - `mcp__computer-use__type` text `"PING_CMDN_TEST"`(无害探针,不发送)。
  - `mcp__computer-use__screenshot`(必要时 `mcp__computer-use__zoom` 放大输入框区域读字)。
  验收:`PING_CMDN_TEST` 出现在主输入框里 → 证明 Cmd+N 后焦点确实落在可输入的主框。
  - 清掉探针:`mcp__computer-use__key` text `"cmd+a"` 然后 `"Delete"`,再截图确认输入框空。

- [ ] **Step 4: 分流 —— 通过 or 退路**
  - **若 Step 2/3 全部通过**:在 SKILL.md「Per-job loop / Caveats」里把 Cmd+N 标注为 **已验证(date 2026-06-17,Codex.app)**;继续 Task 3/4。
  - **若 Cmd+N 不开新对话 / 焦点不在输入框**:按以下顺序探索退路,逐个截图验证,把可行的那条**写进 SKILL.md 替换 Cmd+N 步骤**:
    1. 菜单栏 File:`mcp__computer-use__screenshot` 看顶部菜单,`mcp__computer-use__left_click` 打开 File 菜单读「New …」项的快捷键(若被 Dock 拦,改用菜单激活键 `mcp__computer-use__key` 走系统菜单导航)。
    2. 其它常见新建组合键:`cmd+t`、`cmd+shift+n`(逐个发→截图比对)。
    3. 单对话多轮兜底:不开新对话,复用同一对话连续出多张;此时 follow-up 框 Enter=换行,改用对话内「发送」控件提交(承认这会引入一次坐标点击,需先验证该控件不被 Dock 拦)。
  验收:要么 Cmd+N 通过并写入 SKILL.md;要么找到一条可行替代并写入;**两者都失败 → 标记 M0 gate 未过,产出诊断(截图 + 试过的组合键清单),停在 M0 不进 M2/M3**(spec §10「不通则探索其它键盘开新对话方式 / 单对话多轮的替代」)。

- [ ] **Step 5: Commit(把验证结论固化进 skill)**
  ```bash
  git -C /Users/poco/Projects/Roguent add .claude/skills/codex-gpt-image/SKILL.md
  git -C /Users/poco/Projects/Roguent commit -m "docs: 📝 record Codex new-conversation gate result in codex-gpt-image skill"
  ```

---

### Task 3: [M0] 准备落盘契约目录 + 提供 M0 自包含「去背 / 缩放」回退脚手架

> M1c 会正式产出 `scripts/art/remove-bg.py` / `scale-to-frame.py` / `apply-gpt-image-overrides.py` 的 `individual-render` 分支。**M0 早于 M1c**,故本 Task 提供一段**自包含、零外部依赖**(只用 `/usr/bin/python3`(PIL 已装))的去背+缩放+单帧烘焙脚本 `scripts/art/m0-bake-one.py`,专供 M0 端到端验证用;M1c 落地后此脚本可删(临时脚手架)。

**Files:**
- Create: `/Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/.gitkeep`(目录契约占位)
- Create: `/Users/poco/Projects/Roguent/scripts/art/m0-bake-one.py`(M0 临时脚手架)

- [ ] **Step 1: 建落盘目录(契约对齐)**
  ```bash
  mkdir -p /Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/{raw,nobg,scaled}
  touch /Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/.gitkeep
  ls -R /Users/poco/Projects/Roguent/scripts/art/gen-out
  ```
  期望:`cyber/raw cyber/nobg cyber/scaled` 三层目录存在,`raw/.gitkeep` 在。
  > 注:`gen-out/` 出图是大文件,整合者在 M1c 应在 `.gitignore` 加 `scripts/art/gen-out/**/*.png`(只 keep `.gitkeep`)。M0 不强求,但 raw/.gitkeep 用来固化目录契约。

- [ ] **Step 2: 写 M0 自包含烘焙脚手架 `scripts/art/m0-bake-one.py`**
  把下面写进该文件(去背=PIL alpha 边界 + 近黑/近透明剔除;缩放=LANCZOS 居中到目标帧;烘焙=把缩放帧 alpha_composite 进 atlas 副本对应帧名所有 anim 帧):
  ```python
  #!/usr/bin/env python3
  """M0 throwaway: remove-bg + scale + bake ONE asset into a COPY of an atlas.

  Proves the gen-out -> nobg -> scaled -> atlas pipeline end-to-end before M1c
  ships the real remove-bg.py / scale-to-frame.py / individual-render branch.
  Run with PIL available, e.g.:
    /usr/bin/python3 scripts/art/m0-bake-one.py \
      --raw scripts/art/gen-out/cyber/raw/knight_m.png \
      --atlas-src public/assets/artpacks/synthwave/atlas \
      --atlas-dst /tmp/m0-atlas \
      --frame-prefix knight_m_idle_anim_f
  """
  from __future__ import annotations
  import argparse, json, shutil
  from pathlib import Path
  from PIL import Image


  def remove_bg(img: Image.Image, alpha_thresh: int = 16, dark_thresh: int = 18) -> Image.Image:
      img = img.convert("RGBA")
      px = img.load()
      w, h = img.size
      for y in range(h):
          for x in range(w):
              r, g, b, a = px[x, y]
              if a < alpha_thresh or (r < dark_thresh and g < dark_thresh and b < dark_thresh):
                  px[x, y] = (0, 0, 0, 0)
      return img


  def crop_to_content(img: Image.Image) -> Image.Image:
      bbox = img.getbbox()
      return img.crop(bbox) if bbox else img


  def scale_center(img: Image.Image, tw: int, th: int, pad: float = 0.0) -> Image.Image:
      img = crop_to_content(img)
      iw, ih = img.size
      avail_w, avail_h = tw * (1 - pad), th * (1 - pad)
      s = min(avail_w / iw, avail_h / ih)
      nw, nh = max(1, round(iw * s)), max(1, round(ih * s))
      resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
      out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
      out.alpha_composite(resized, ((tw - nw) // 2, (th - nh) // 2))
      return out


  def main() -> None:
      ap = argparse.ArgumentParser()
      ap.add_argument("--raw", required=True)
      ap.add_argument("--atlas-src", required=True)
      ap.add_argument("--atlas-dst", required=True)
      ap.add_argument("--frame-prefix", required=True, help="e.g. knight_m_idle_anim_f")
      ap.add_argument("--nobg-out", default="")
      ap.add_argument("--scaled-out", default="")
      args = ap.parse_args()

      src = Path(args.atlas_src)
      dst = Path(args.atlas_dst)
      dst.mkdir(parents=True, exist_ok=True)
      shutil.copy(src / "dungeon.json", dst / "dungeon.json")
      atlas = Image.open(src / "dungeon.png").convert("RGBA")
      meta = json.loads((dst / "dungeon.json").read_text())
      frames = meta["frames"]

      nobg = remove_bg(Image.open(args.raw))
      if args.nobg_out:
          Path(args.nobg_out).parent.mkdir(parents=True, exist_ok=True)
          nobg.save(args.nobg_out)

      targets = [k for k in frames if k.replace(".png", "").startswith(args.frame_prefix)]
      if not targets:
          raise SystemExit(f"no frames match prefix {args.frame_prefix!r}")
      print(f"baking {args.raw} into {len(targets)} frames: {targets}")
      for name in targets:
          fr = frames[name]["frame"]
          tile = scale_center(nobg, fr["w"], fr["h"])
          if args.scaled_out:
              Path(args.scaled_out).parent.mkdir(parents=True, exist_ok=True)
              tile.save(args.scaled_out)  # last one wins; fine for spot-check
          # clear then paste (replace, not blend over old pixels)
          atlas.paste((0, 0, 0, 0), (fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
          atlas.alpha_composite(tile, (fr["x"], fr["y"]))
      atlas.save(dst / "dungeon.png")
      print(f"wrote {dst / 'dungeon.png'}")


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 3: 自检脚手架(无图也能跑「无匹配帧」分支,确认脚本无语法/导入错误)**
  ```bash
  cd /Users/poco/Projects/Roguent && /usr/bin/python3 scripts/art/m0-bake-one.py \
    --raw /dev/null --atlas-src public/assets/artpacks/synthwave/atlas \
    --atlas-dst /tmp/m0-atlas-selftest --frame-prefix __no_such_frame__ 2>&1 | tail -5
  ```
  期望:打印 `no frames match prefix '__no_such_frame__'` 并以非零退出(证明脚本能加载 atlas/json、PIL 正常导入;真实出图后才走烘焙分支)。
  > 注:用 `/dev/null` 当 `--raw` 时 `Image.open` 会在到达匹配前抛错亦可接受;关键是脚本被 PIL 成功导入、CLI 解析正常。若想纯跑通可临时指向任一已存在 PNG。

- [ ] **Step 4: Commit**
  ```bash
  git -C /Users/poco/Projects/Roguent add scripts/art/m0-bake-one.py scripts/art/gen-out/cyber/raw/.gitkeep
  git -C /Users/poco/Projects/Roguent commit -m "chore: 🧹 add M0 gen-out dirs + throwaway single-asset bake scaffold"
  ```

---

### Task 4: [M0] 单张端到端 — codex 出 cyber knight_m → 落盘 → 去背 → 缩放 → 烘进临时 atlas

> 前置:Task 2 的 Cmd+N gate **已通过**(或已写入可行替代)。本 Task 跑完整链路并留证据。

**Files:**
- Create(运行产物,非源码):`scripts/art/gen-out/cyber/raw/knight_m.png`、`…/nobg/knight_m.png`、`…/scaled/knight_m_idle_anim_f0.png`、`/tmp/m0-atlas/dungeon.{png,json}`

- [ ] **Step 1: 准备 outPath 目录 + 取 prompt 文本**
  ```bash
  mkdir -p /Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw
  cd /Users/poco/Projects/Roguent && bun -e "import {assemblePrompt} from './scripts/art/prompts.ts'; console.log(assemblePrompt('cyber','knight_m'))"
  ```
  期望 prompt(本会话已实测,M0 直接用这串):
  > High-resolution detailed pixel art. Cyberpunk neon-on-dark vibe-coding WORKSPACE (not a dungeon): late-night neon dev floor / server room / terminal stations. Palette anchors #0b0a12, #36c5e0, #a06cd5. Orchestrator hooded operator in dark techwear hoodie, glowing cyan circuit trim, holographic visor, stylus-blade command tool. Full body chibi character, transparent background, tall 2:3 sprite portrait, readable silhouette, centered pose. avoid: dungeon, medieval, fantasy weapons, castles, torches, stone dungeon walls, low-resolution output, blurry pixels, smudged details, jpeg artifacts, muddy silhouettes.
  - knight_m 是 character → size `1024x1536`(对齐 `gen.ts` 的 `sizeFor`)。outPath = `/Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/knight_m.png`。

- [ ] **Step 2: 驱动 Codex 出这一张(走 skill 的 per-job loop)**
  - `mcp__computer-use__open_application` `app: "Codex"`(确保前台)。
  - `mcp__computer-use__key` text `"cmd+n"`(或 Task 2 验证出的替代),`mcp__computer-use__screenshot` 确认新对话+焦点。
  - `mcp__computer-use__type` 发送复合 prompt(填入 Step 1 的 prompt / size / outPath):
    ```
    Use your built-in image_gen tool to generate this image: <STEP1_PROMPT>.
    Image size: 1024x1536.
    After generating, use your shell tool to save the ORIGINAL full-resolution PNG (no compression, no resize) to exactly this path: /Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/knight_m.png. Create the parent directory if needed. When the file is written, reply with just: DONE.
    ```
  - `mcp__computer-use__key` text `"Return"` 发送。
  验收:截图显示消息已发出、Codex 开始处理(出现工具调用/生成中状态)。

- [ ] **Step 3: 轮询落盘(Bash,非 computer-use)**
  ```bash
  OUT=/Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/knight_m.png
  for i in $(seq 1 60); do
    if [ -f "$OUT" ]; then a=$(stat -f%z "$OUT"); sleep 3; b=$(stat -f%z "$OUT");
      if [ "$a" = "$b" ] && [ "$a" -gt 1000 ]; then echo "READY $OUT ($b bytes)"; break; fi; fi
    sleep 5; done
  ls -la "$OUT"
  ```
  验收:`READY … (>1KB)`。**失败退路**(spec §10):`mcp__computer-use__screenshot` 诊断 → 若 Codex 把图写去了 `~/Downloads` 或导出目录,`cp` 进 `$OUT`;若 image_gen 拒绝 shell 写盘 → **M0 gate 未过,停下重设计出图通道,不进 M2/M3**,产出诊断证据(截图 + Codex 回复文本)。
  - 通过后 `Read` 该 PNG(渲染出来)肉眼确认是「赛博霓虹主控英雄」而非错误卡 / 占位图。

- [ ] **Step 4: 去背 + 缩放 + 烘进临时 atlas(用 Task 3 脚手架)**
  ```bash
  cd /Users/poco/Projects/Roguent && /usr/bin/python3 scripts/art/m0-bake-one.py \
    --raw   scripts/art/gen-out/cyber/raw/knight_m.png \
    --nobg-out  scripts/art/gen-out/cyber/nobg/knight_m.png \
    --scaled-out scripts/art/gen-out/cyber/scaled/knight_m_idle_anim_f0.png \
    --atlas-src public/assets/artpacks/synthwave/atlas \
    --atlas-dst /tmp/m0-atlas \
    --frame-prefix knight_m_idle_anim_f
  ls -la scripts/art/gen-out/cyber/nobg/knight_m.png scripts/art/gen-out/cyber/scaled/knight_m_idle_anim_f0.png /tmp/m0-atlas/dungeon.png
  ```
  验收:打印 `baking … into 4 frames: ['knight_m_idle_anim_f0.png', …]` + `wrote /tmp/m0-atlas/dungeon.png`;三个产物文件 > 0 字节。
  - `Read` `scripts/art/gen-out/cyber/nobg/knight_m.png`(确认背景透明、主体保留)和 `…/scaled/knight_m_idle_anim_f0.png`(确认缩到 16×28 仍可辨识、非纯噪点)。
  > 说明:M0 此处用现有 16×28 帧(高清档 32×56→64×96 是 M1 的事)。M0 只证「管线打通 + 比旧糊化版清晰」,**不**验证最终高清档。

- [ ] **Step 5: 把临时 atlas 接进运行时 + preview 肉眼确认渲染**
  - 备份并替换一个**可见**包的 atlas(synthwave 即将在 M4 删除,M0 拿它当临时载体最安全):
    ```bash
    cp -r public/assets/artpacks/synthwave/atlas /tmp/m0-atlas-backup
    cp /tmp/m0-atlas/dungeon.png public/assets/artpacks/synthwave/atlas/dungeon.png
    ```
  - `mcp__Claude_Preview__preview_start` `name: "web"` → 拿 serverId(preview 从主仓根起 vite;见项目记忆 worktree-preview-verification:**所有 preview 验证放在合并回 main 之后做**,M0 在主工作树直接验亦可)。
  - 切到 synthwave 包让它渲染该 atlas:`mcp__Claude_Preview__preview_eval` serverId, expression:
    ```js
    (() => { localStorage.setItem('roguent_artpack','synthwave');
      window.dispatchEvent(new Event('roguent:artpack-changed')); return 'switched'; })()
    ```
  - `mcp__Claude_Preview__preview_screenshot` serverId → 看大厅/房间里的小人(knight_m 主控)是不是用上了新图、清晰可辨。必要时 `mcp__Claude_Preview__preview_eval` 确认 atlas URL 已重载、控制台无报错。
  验收(**M0 端到端 gate**):截图里 knight_m 角色显示为新生成的 cyber 主控英雄、**肉眼清晰不糊**(对比 §3.2 旧糊化版);控制台无 atlas 加载报错。
  - 还原被借用的 atlas(避免污染 main,真正 cyber 包在 M2 出):
    ```bash
    rm -rf public/assets/artpacks/synthwave/atlas
    mv /tmp/m0-atlas-backup public/assets/artpacks/synthwave/atlas
    git -C /Users/poco/Projects/Roguent status --short public/assets/artpacks/synthwave/atlas
    ```
    期望:`status` 对该 atlas 无改动(已还原)。

- [ ] **Step 6: 记录 M0 gate 结论 + commit 证据**
  - 把端到端结果(Cmd+N 通过/替代、出图落盘成功、去背缩放烘焙渲染清晰)简记进 SKILL.md 末尾「## Verified end-to-end」小节(含日期 2026-06-17、knight_m cyber、证据截图说明)。
  - gen-out 的 png 是大文件、且 `/tmp/m0-atlas` 是临时产物 → **不提交 png**;只提交 skill 的结论更新:
    ```bash
    git -C /Users/poco/Projects/Roguent add .claude/skills/codex-gpt-image/SKILL.md
    git -C /Users/poco/Projects/Roguent commit -m "docs: 📝 record M0 end-to-end gate pass (cyber knight_m: gen→nobg→scale→bake→render)"
    ```
  验收:`git log --oneline -1` 显示该 commit;M0 gate **通过**,放行 M1/M2/M3。
  > **若任一环节失败**(Cmd+N 无替代、Codex 不写盘、渲染仍糊到不可辨):**明确标记 M0 gate 未通过**,产出诊断(失败步骤 + 截图 + 日志 + 已试退路),**停在 M0,不进 M2/M3**(spec §9/§10)。

---

### M0 验收汇总(gate 判定)
- [ ] Cmd+N(或验证出的替代)能在 Codex 开新对话并聚焦主输入框 —— **第一关**(Task 2)。
- [ ] codex 用内置 image_gen 出 1 张 cyber knight_m 并 shell-写到 `scripts/art/gen-out/cyber/raw/knight_m.png`(>1KB,肉眼是主控英雄)。
- [ ] 去背→缩放→烘进临时 atlas 全链路跑通(`m0-bake-one.py` 无错,产物非空)。
- [ ] preview 里渲染出来、肉眼清晰不糊、控制台无报错(临时 atlas 用完已还原)。
- [ ] SKILL.md 固化了可复用 per-job 循环 + 验证结论;门禁脚本部分 `/usr/bin/python3` 可跑。
- **全过 → 放行 M1/M2/M3;任一不过 → 停在 M0,重设计出图路线。**


---

# Milestone M1a — 高清帧契约 + 渲染层常数

> **里程碑总览(M1a-frame-render):高清帧契约 + 渲染层常数参数化。**
>
> 把房间渲染从 16px 基准提到高清档。核心策略:**引入单一缩放因子 `SCALE = TILE/16`,让所有硬编码的「虚拟像素」常数随 TILE 自适应**,而不是散落地手改一堆魔数。起步值按共享契约取 **TILE 16→40(SCALE=2.5)**,注明「M2 preview 视觉验证后定」——改 `config.ts` 一个常数即可整体换挡。
>
> **⚠️ 与侦察清单的一处关键分歧(已用 node 数学核实):** 侦察 render-2x 说「发光 scale 分母 64→128(=源纹理尺寸)」。这是**错的**——`glowTexture()` 是 128px(`effects.ts:12-13`),`64` 只是调参常数。发光精灵渲染宽度 = `128 * radius/divisor`,占用 tile 数 = `width/TILE`。要保持发光池覆盖**相同 tile 数**,正确做法是**分母保持 64、把分子(Character `30/22`、Lights radius `36/22`)按 SCALE 放大**。若按侦察改成 128,门口发光会从 4.5 tile 缩到 2.25 tile(覆盖减半)。本里程碑采用正确做法。
>
> **TILE 必须等于地板帧尺寸:** `DungeonRoom` 的地板/墙是 `<pixiSprite texture={...} x y />` 无显式 width,按帧原生像素渲染。地板帧若提到 40×40,TILE 必须同步到 40,否则 40px 贴图塞进 16px 格 → 错位。所以「帧契约」与「TILE」是绑定的,一起改。

---

### Task 1: [M1a] config.ts —— 提 TILE 到高清档 + 导出 HD_SCALE 缩放因子

把房间虚拟基准从 16 提到 40(SCALE=2.5),并导出 `HD_SCALE` 供渲染层把虚拟像素常数参数化。几何衍生量(VW/VH/门坐标/floorBounds)全部由 TILE 计算,自动适应。

**Files:**
- Modify: `/Users/poco/Projects/Roguent/src/web/room/config.ts:3-14`
- Create: `/Users/poco/Projects/Roguent/src/web/room/config.test.ts`

- [ ] **Step 1: 先写失败测试钉住新基准与缩放因子**
  新建 `src/web/room/config.test.ts`:
  ```ts
  import { describe, expect, it } from "bun:test";
  import { COLS, HD_SCALE, ROWS, TILE, VH, VW } from "./config";

  describe("room/config HD baseline", () => {
    it("bumps the virtual tile to the high-clarity baseline", () => {
      // 起步值 TILE=40(SCALE=2.5),M2 preview 调定。改这一个常数即整体换挡。
      expect(TILE).toBe(40);
    });
    it("derives HD_SCALE = TILE / 16 so render constants stay tile-relative", () => {
      expect(HD_SCALE).toBeCloseTo(TILE / 16, 10);
      expect(HD_SCALE).toBe(2.5);
    });
    it("keeps VW/VH derived from TILE (geometry auto-adapts)", () => {
      expect(VW).toBe(COLS * TILE); // 24*40 = 960
      expect(VH).toBe(ROWS * TILE); // 14*40 = 560
    });
  });
  ```
  跑 `bun test src/web/room/config.test.ts` → 期望 **FAIL**(`HD_SCALE` 未导出、`TILE` 仍是 16)。

- [ ] **Step 2: 改 config.ts —— TILE=40 + 导出 HD_SCALE**
  把 `src/web/room/config.ts:1-7` 顶部改为:
  ```ts
  // Virtual room geometry, shared by the renderer and the tilemap. The room is
  // laid out in TILE-px tiles and integer-scaled to fit the canvas (see Room.tsx).
  // 高清档起步值 TILE=40(原 16);M2 preview 视觉验证后可微调(改这一个常数整体换挡)。
  export const TILE = 40;
  // 所有「虚拟像素」硬编码常数都按 HD_SCALE = TILE/16 缩放,保持相对 16px 基准的
  // tile 比例不变。渲染层(Character/Lights/ToolBubble/Emote/DungeonRoom)用它把
  // 阴影/选圈/泡泡/名牌/线宽等魔数参数化,避免散落手改。
  export const HD_SCALE = TILE / 16;
  export const COLS = 24;
  export const ROWS = 14;
  export const VW = COLS * TILE; // 960 virtual px
  export const VH = ROWS * TILE; // 560 virtual px
  ```
  (`DOOR_COL` / `FOUNTAIN_COLS` 段保持不变。)
  跑 `bun test src/web/room/config.test.ts` → 期望 **PASS**。

- [ ] **Step 3: 复核其它 config 消费者无遗漏硬编码虚拟 px**
  ```bash
  grep -rnE "\* ?TILE|/ ?TILE" /Users/poco/Projects/Roguent/src/web/room/Particles.tsx \
    /Users/poco/Projects/Roguent/src/web/room/DecorLayer.tsx \
    /Users/poco/Projects/Roguent/src/web/hud/Minimap.tsx \
    /Users/poco/Projects/Roguent/src/web/easter/QuipOverlay.tsx
  ```
  期望:这些文件对 TILE 的用法都是「比例式」(`c * TILE`、`x / TILE`),会随 TILE 自动适应。记录输出;若发现**裸虚拟 px 魔数**(如 `y={-30}` 之类),归入 openQuestions 交整合者(Particles 粒子 size 属此类,本里程碑不动)。

- [ ] **Step 4: 跑运动单测确认几何自适应**
  ```bash
  bun test src/web/room/motion.test.ts src/web/room/layout.test.ts
  ```
  期望 **PASS**(`floorBounds`/wander 全部由 TILE 衍生)。若 FAIL,检查是否有测试硬编码了旧 16px 边界值,按 TILE 重算期望。

- [ ] **Step 5: Commit**
  ```bash
  git add src/web/room/config.ts src/web/room/config.test.ts
  git commit -m "feat: 🧩 bump room TILE to HD baseline (40) + export HD_SCALE"
  ```

---

### Task 2: [M1a] Character.tsx —— 发光/阴影/选圈/名牌按 HD_SCALE 参数化

把所有硬编码虚拟像素按 `HD_SCALE` 缩放。**发光分母保持 64**(纠正侦察),分子按 SCALE 放大以保持 tile 覆盖不变。

**Files:**
- Modify: `/Users/poco/Projects/Roguent/src/web/room/Character.tsx:19,243,252,256,260,282-283,288,301`

- [ ] **Step 1: 导入 HD_SCALE**
  改 `src/web/room/Character.tsx:19`:
  ```ts
  import { DOOR_COL, HD_SCALE, TILE } from "./config";
  ```

- [ ] **Step 2: 发光精灵 —— 分子 ×HD_SCALE,分母保持 64,y 偏移 ×HD_SCALE**
  改 `Character.tsx:282-283`(当前 `y={-8}` / `scale={(isLead ? 30 : 22) / 64}`):
  ```tsx
        <pixiSprite
          texture={glowTexture()}
          anchor={0.5}
          y={-8 * HD_SCALE}
          scale={(isLead ? 30 : 22) * HD_SCALE / 64}
          tint={isLead ? 0xffd98a : 0xfff0d0}
          alpha={isLead ? 0.55 : 0.4}
          blendMode="add"
        />
  ```
  > **为什么分母仍是 64:** 渲染宽度 = `128(纹理) * 分子*HD_SCALE / 64`,占用 tile 数 = `宽度 / TILE = 128*分子*HD_SCALE/64 / (16*HD_SCALE)` —— HD_SCALE 约去,tile 覆盖恒定。改成 128 会让覆盖减半(详见里程碑总览的分歧说明)。

- [ ] **Step 3: 阴影椭圆 + y 偏移 ×HD_SCALE**
  改 `Character.tsx:243`(`g.ellipse(0, 0, 7, 3)`)→ `g.ellipse(0, 0, 7 * HD_SCALE, 3 * HD_SCALE);`
  改 `Character.tsx:288`(`<pixiGraphics y={1} draw={shadow} />`)→ `<pixiGraphics y={1 * HD_SCALE} draw={shadow} />`

- [ ] **Step 4: 三种选圈椭圆 ×HD_SCALE**
  - `Character.tsx:252`(`g.ellipse(0, 0, 11, 5)`)→ `g.ellipse(0, 0, 11 * HD_SCALE, 5 * HD_SCALE);`
  - `Character.tsx:256`(`g.ellipse(0, 0, 10, 4.5)`)→ `g.ellipse(0, 0, 10 * HD_SCALE, 4.5 * HD_SCALE);`
  - `Character.tsx:260`(`g.ellipse(0, 0, 9, 4)`)→ `g.ellipse(0, 0, 9 * HD_SCALE, 4 * HD_SCALE);`
  描边 `width`(1.5/1/1)是设备像素观感线宽,**保持不变**(已被整数缩放放大,无需再乘)。

- [ ] **Step 5: 名牌 y 与字号 ×HD_SCALE**
  改 `Character.tsx:301`(`y={-38}`)→ `y={-38 * HD_SCALE}`。
  同一 `<pixiText>` 的 `style.fontSize: 7`(308 行附近)→ `fontSize: 7 * HD_SCALE`,`stroke.width: 3` → `width: 3 * HD_SCALE`,使文字随房间放大保持相对大小(否则 TILE 放大后名牌字会显小)。

- [ ] **Step 6: 类型 + lint 自检**
  ```bash
  bunx tsc --noEmit && bun run check 2>&1 | tail -5
  ```
  期望:无类型/lint 错。

- [ ] **Step 7: Commit**
  ```bash
  git add src/web/room/Character.tsx
  git commit -m "refactor: ✨ scale Character glow/shadow/ring/nameplate by HD_SCALE"
  ```

---

### Task 3: [M1a] Lights.tsx —— 发光池 radius/x 偏移按 HD_SCALE,分母保持 64

**Files:**
- Modify: `/Users/poco/Projects/Roguent/src/web/room/Lights.tsx:1,20,40,46,48`

- [ ] **Step 1: 导入 HD_SCALE**
  改 `Lights.tsx:1`:
  ```ts
  import { DOOR_COL, FOUNTAIN_COLS, HD_SCALE, TILE } from "./config";
  ```

- [ ] **Step 2: Glow 组件 scale 分母保持 64(不改)**
  `Lights.tsx:20` `scale={radius / 64}` **保持原样**。radius 在 Step 3 已经 ×HD_SCALE,分母 64 与纹理 128px 配合,占用 tile 数恒定(与 Character 同理)。
  > 这与侦察「分母→128」分歧,本里程碑取正确解。

- [ ] **Step 3: door / fountain radius 与 x 偏移 ×HD_SCALE**
  改 `Lights.tsx:40`(door `radius: 36`)→ `radius: 36 * HD_SCALE,`
  改 `Lights.tsx:46`(fountain `x: c * TILE + 8`)→ `x: c * TILE + 8 * HD_SCALE,`
  改 `Lights.tsx:48`(fountain `radius: 22`)→ `radius: 22 * HD_SCALE,`
  `y: 1.4 * TILE`(38 行)、`y: 2.4 * TILE`(47 行附近)是 TILE 比例值,**保持不变**(自动适应)。

- [ ] **Step 4: 自检**
  ```bash
  bunx tsc --noEmit && bun run check 2>&1 | tail -5
  ```
  期望:无错。

- [ ] **Step 5: Commit**
  ```bash
  git add src/web/room/Lights.tsx
  git commit -m "refactor: ✨ scale Lights glow radius/offset by HD_SCALE (keep /64)"
  ```

---

### Task 4: [M1a] ToolBubble.tsx + Emote.tsx —— 泡泡/emote 尺寸与 y 偏移按 HD_SCALE

侦察风险点:ToolBubble 遗漏会与头部错配。整体 ×HD_SCALE。

**Files:**
- Modify: `/Users/poco/Projects/Roguent/src/web/room/ToolBubble.tsx:8,28,31,35,54,58`
- Modify: `/Users/poco/Projects/Roguent/src/web/room/Emote.tsx:35`

- [ ] **Step 1: ToolBubble 导入 HD_SCALE + 缩放 CELL**
  在 `ToolBubble.tsx` 顶部 import 段加:
  ```ts
  import { HD_SCALE } from "./config";
  ```
  改 `ToolBubble.tsx:8`(`const CELL = 0.75;`)→ `const CELL = 0.75 * HD_SCALE;`(图标网格随泡泡放大)。
  `ICON_OX = -6` / `ICON_OY = -8`(12-13 行)→ `const ICON_OX = -6 * HD_SCALE;` / `const ICON_OY = -8 * HD_SCALE;`(图标居中偏移同步)。

- [ ] **Step 2: 泡泡主体框 + 尾指针 ×HD_SCALE**
  改 `ToolBubble.tsx:28` 与 `:31`(两处 `g.roundRect(-9, -9, 18, 16, 4)`)→
  `g.roundRect(-9 * HD_SCALE, -9 * HD_SCALE, 18 * HD_SCALE, 16 * HD_SCALE, 4 * HD_SCALE);`(两处都改)。
  描边 `width: 1`(30 行)保持不变(观感线宽)。
  改 `ToolBubble.tsx:35`(`g.poly([-3, 6, 3, 6, 0, 11])`)→
  `g.poly([-3, 6, 3, 6, 0, 11].map((v) => v * HD_SCALE));`

- [ ] **Step 3: 泡泡 y 位置 + 浮动振幅 ×HD_SCALE**
  改 `ToolBubble.tsx:54`(`c.y = -26 + Math.sin(t.current * 0.08) * 1.2;`)→
  `c.y = -26 * HD_SCALE + Math.sin(t.current * 0.08) * 1.2 * HD_SCALE;`
  改 `ToolBubble.tsx:58`(`<pixiContainer ref={rootRef} y={-26} scale={0}>`)→
  `<pixiContainer ref={rootRef} y={-26 * HD_SCALE} scale={0}>`

- [ ] **Step 4: Emote y + 字号 ×HD_SCALE**
  在 `Emote.tsx` import 段加 `import { HD_SCALE } from "./config";`。
  改 `Emote.tsx:35`(`<pixiContainer ref={rootRef} y={-26} alpha={0}>`)→ `y={-26 * HD_SCALE}`。
  改其 `<pixiText>` 的 `style.fontSize: 8` → `fontSize: 8 * HD_SCALE`(随房间放大)。

- [ ] **Step 5: 自检**
  ```bash
  bunx tsc --noEmit && bun run check 2>&1 | tail -5
  ```
  期望:无错。

- [ ] **Step 6: Commit**
  ```bash
  git add src/web/room/ToolBubble.tsx src/web/room/Emote.tsx
  git commit -m "refactor: ✨ scale ToolBubble + Emote geometry/y by HD_SCALE"
  ```

---

### Task 5: [M1a] DungeonRoom.tsx + room-props.ts —— 装饰层线宽/内缩/符文半径按 HD_SCALE

侦察风险:地毯/指挥台/符文的所有虚拟 px 线宽与内缩遗漏会破坏装饰美感。`RUNE` 半径在 room-props.ts 用 `150/PROP_OFFSET_SCALE` 写死,改为乘 HD_SCALE。

**Files:**
- Modify: `/Users/poco/Projects/Roguent/src/web/room/DungeonRoom.tsx:73,90,115,124,140,146,156-179`
- Modify: `/Users/poco/Projects/Roguent/src/web/room/room-props.ts:8,95-96`
- Test: `/Users/poco/Projects/Roguent/src/web/room/room-props.test.ts:71-74`(已有,只复核不破坏)

- [ ] **Step 1: room-props.ts 的 RUNE 半径 ×HD_SCALE**
  在 `room-props.ts` import 段加(8 行 `import { holoHash } from "./holo";` 下方):
  ```ts
  import { HD_SCALE } from "./config";
  ```
  改 `room-props.ts:94-99` 的 `RUNE`:
  ```ts
  export const RUNE = {
    outer: (150 / PROP_OFFSET_SCALE) * HD_SCALE, // 30 → 75 @ TILE40
    inner: (108 / PROP_OFFSET_SCALE) * HD_SCALE, // 21.6 → 54 @ TILE40
    spokes: 12,
    color: 0x36c5e0,
  } as const;
  ```
  > `DAIS`/`CARPET` 用 tile 单位(绘制时 `* TILE`),自动适应,不改。

- [ ] **Step 2: 复核 room-props.test.ts 不破**
  ```bash
  bun test src/web/room/room-props.test.ts
  ```
  期望 **PASS**(测试只断言 `RUNE.outer > RUNE.inner`、spokes=12、color,缩放后仍成立)。

- [ ] **Step 3: DungeonRoom 导入 HD_SCALE**
  改 `DungeonRoom.tsx:6`:
  ```ts
  import { COLS, DOOR_COL, FOUNTAIN_COLS, HD_SCALE, ROWS, TILE } from "./config";
  ```

- [ ] **Step 4: HoloFloor 能量墙带高度 + 节点 ×HD_SCALE**
  改 `DungeonRoom.tsx:72-73`:
  ```ts
      g.rect(0, 2 * TILE - 3 * HD_SCALE, W, 3 * HD_SCALE).fill({ color: 0x36c5e0, alpha: 0.5 });
      g.rect(0, 2 * TILE, W, 16 * HD_SCALE).fill({ color: 0x36c5e0, alpha: 0.14 });
  ```
  改 `DungeonRoom.tsx:90`(节点 `g.rect(n.c * TILE - 2, n.r * TILE - 2, 4, 4)`)→
  `g.rect(n.c * TILE - 2 * HD_SCALE, n.r * TILE - 2 * HD_SCALE, 4 * HD_SCALE, 4 * HD_SCALE).fill({...})`
  网格线 `width: 1`(79/86 行)保持(观感线宽)。

- [ ] **Step 5: 地毯 trim + 纹理条 ×HD_SCALE**
  改 `DungeonRoom.tsx:115`(`const trim = 1.2;`)→ `const trim = 1.2 * HD_SCALE;`
  改 `DungeonRoom.tsx:124`(纹理条 `g.rect(rugX + 2, (CARPET.y + 0.5 + i) * TILE, rugW - 4, 0.8)`)→
  `g.rect(rugX + 2 * HD_SCALE, (CARPET.y + 0.5 + i) * TILE, rugW - 4 * HD_SCALE, 0.8 * HD_SCALE).fill({...})`

- [ ] **Step 6: 指挥台外/内框内缩与线宽 ×HD_SCALE**
  改 `DungeonRoom.tsx:140`:
  ```ts
      g.rect(dx + 0.4 * HD_SCALE, dy + 0.4 * HD_SCALE, dw - 0.8 * HD_SCALE, dh - 0.8 * HD_SCALE).stroke({
        color: RUNE.color, alpha: 0.5, width: 0.8 * HD_SCALE,
      });
  ```
  改 `DungeonRoom.tsx:146`:
  ```ts
      g.rect(dx + 2 * HD_SCALE, dy + 2 * HD_SCALE, dw - 4 * HD_SCALE, dh - 4 * HD_SCALE).stroke({
        color: CARPET.trim, alpha: 0.35, width: 0.4 * HD_SCALE,
      });
  ```

- [ ] **Step 7: 符文圈双圆 + 辐条 + 十字轴线宽 ×HD_SCALE**
  把 `DungeonRoom.tsx:156-179` 范围内所有 `width: 0.6` → `width: 0.6 * HD_SCALE`,`width: 0.4` → `width: 0.4 * HD_SCALE`(外圈、内圈各一处 0.6;辐条循环一处 0.4;十字轴两处 0.4)。`outer`/`inner` 已在 Step 1 经 RUNE 放大,自动随之。

- [ ] **Step 8: 自检**
  ```bash
  bun test src/web/room/room-props.test.ts && bunx tsc --noEmit && bun run check 2>&1 | tail -5
  ```
  期望:全 PASS、无错。

- [ ] **Step 9: Commit**
  ```bash
  git add src/web/room/DungeonRoom.tsx src/web/room/room-props.ts
  git commit -m "refactor: ✨ scale DungeonRoom decor + RUNE radii by HD_SCALE"
  ```

---

### Task 6: [M1a] hub-paint.ts + PixelSprite.tsx —— 确认大厅独立缩放轨迹

侦察明确风险:大厅 `hub-paint` 的 `T = TILE * S` 与房间虚拟 TILE 有**独立缩放轨迹**;大厅走 DOM atlas(`atlas-dom` 帧 = 原生像素),不读 `config.TILE`。本 Task 显式确认大厅是否需要随高清帧调整。

**Files:**
- Modify(条件): `/Users/poco/Projects/Roguent/src/web/lobby/hub-paint.ts:10-12`
- Modify(条件): `/Users/poco/Projects/Roguent/src/web/lobby/PixelSprite.tsx:54`

- [ ] **Step 1: 确认 hub-paint 用的是哪套帧尺寸**
  ```bash
  grep -n "TILE\|const S\|const T\|drawFrame" /Users/poco/Projects/Roguent/src/web/lobby/hub-paint.ts | head
  grep -n "frames\[.*\]\|\.w\|\.h\|scale\|imageUrl" /Users/poco/Projects/Roguent/src/web/lobby/atlas-image.ts
  ```
  关键判断:`hub-paint.ts` 的 `TILE=16`/`S=5`/`T=80` 是**本文件局部常量**(不 import `config.TILE`),`df()` 走 `drawFrame(ctx, atlas.frames, name, dx, dy, S)`——把原生帧按 `S` 倍放大画到 canvas。**当高清帧把瓦片从 16px 提到 40px(2.5x),`drawFrame` 会按 `fr.w * S` 画出 `40*5=200px` 的瓦片,但 `T=80` 的步进不变 → 瓦片严重重叠/越界。**

- [ ] **Step 2: 把 hub-paint 的 S 降到与高清帧匹配**
  高清帧瓦片 = `16 * HD_SCALE` px。要让大厅每格物理像素 `T` 不变(画布仍 1920×1120、布局不乱),需 `fr.w * S_new == 旧 16 * 5 = 80` → `S_new = 80 / (16*HD_SCALE) = 5 / HD_SCALE`。TILE=40 时 `S_new = 2`。改 `hub-paint.ts:10-12`:
  ```ts
  const TILE = 16; // 仅作 S 推导的旧基准锚点,勿与 config.TILE 混淆
  const HUB_FRAME_PX = 16 * 2.5; // = config 的 16*HD_SCALE,高清帧瓦片像素(TILE40→40)
  const S = 80 / HUB_FRAME_PX; // 旧 T=80 不变 → S = 80/40 = 2
  const T = TILE * 5; // 80px 瓦片(物理铺面步进不变,故仍用旧 S=5 的 80)
  ```
  > **要点:** `T`(布局步进,80px)与 `S`(帧绘制放大,降到 2)解耦。布局坐标全用 `T`(不变),只有 `df()` 传给 `drawFrame` 的放大倍数 `S` 随高清帧降低。这样大厅外观与改前一致,只是底图换成高清帧后不再被 5 倍放大糊化。
  > **依赖项:** `HUB_FRAME_PX` 的 `2.5` 必须等于 `config.HD_SCALE`。整合者若改起步 TILE(如 32→SCALE=2),同步改这里(`16*2`,`S=80/32=2.5`)。**建议在 hub-paint.ts 顶部加注释指明该值绑 `config.HD_SCALE`。**

- [ ] **Step 3: PixelSprite scale 复核**
  ```bash
  grep -n "scale = 4\|fr.w \* scale\|atlas.w \* scale" /Users/poco/Projects/Roguent/src/web/lobby/PixelSprite.tsx
  ```
  `PixelSprite.tsx:54` `scale = 4` 是 DOM 精灵 CSS 放大(原生帧 ×4)。高清帧从 16→40px 后,`scale=4` 会渲染 `40*4=160px` 精灵(原来 `16*4=64px`),大厅小人会大 2.5×。要保持原视觉大小,改默认 `scale = 4 / 2.5`(≈1.6)。改 `PixelSprite.tsx:50-54` 的默认值:
  ```ts
  scale = 4 / 2.5, // 高清帧(16→40)后保持原 DOM 视觉大小;2.5 = config.HD_SCALE
  ```
  同样在该常量旁加注释绑 `config.HD_SCALE`。逐个调用点若显式传 `scale=` 也需同比例(grep 复核):
  ```bash
  grep -rn "PixelSprite" /Users/poco/Projects/Roguent/src/web/lobby | grep "scale="
  ```
  记录是否有显式传值的调用点,有则同除 2.5。

- [ ] **Step 4: 自检(大厅相关单测 + 类型)**
  ```bash
  bun test src/web/lobby 2>&1 | tail -15 && bunx tsc --noEmit && bun run check 2>&1 | tail -5
  ```
  期望:PASS、无错。若 `hub-paint` 有快照/坐标测试因 S 变化失败,核对是布局(T)还是绘制(S)的断言——布局应不变,绘制放大值应更新。

- [ ] **Step 5: Commit**
  ```bash
  git add src/web/lobby/hub-paint.ts src/web/lobby/PixelSprite.tsx
  git commit -m "refactor: ✨ adapt lobby hub-paint S + PixelSprite scale to HD frames"
  ```

> **验收标准(此 Task 视觉项,留待 M4 preview):** 大厅地面铺面密度、小人大小与改前一致(仅底图变高清);非「大厅瓦片 2.5 倍重叠 / 小人撑爆」。M1a 阶段以单测 + 数学(`S * 帧px == 旧 T`、`scale * 帧px == 旧视觉`)为证据,视觉验证并入 M4。

---

### Task 7: [M1a] 帧契约重生 —— 0x72 reference 提到高清档(SCALE 倍数)

`verifyAtlasFrameSizes` 拿 `0x72/dungeon.json` 当 reference 逐帧严格匹配 artpack。TILE 提到 40 后,artpack 高清帧(由 bake 里程碑出)是 0x72 的 2.5×;reference 不动则全帧 mismatch。本 Task 提供**生成高清 reference 的脚本** + 重生 0x72 契约。

**Files:**
- Create: `/Users/poco/Projects/Roguent/scripts/art/scale-atlas-json.ts`
- Modify: `/Users/poco/Projects/Roguent/public/assets/0x72/dungeon.json`(经脚本重生)

- [ ] **Step 1: 先写脚本的纯函数 + 失败测试**
  新建 `scripts/art/scale-atlas-json.ts`,导出纯函数 `scaleAtlasFrames`:
  ```ts
  // 把 TexturePacker atlas 的每帧 x/y/w/h(及 sourceSize/spriteSourceSize)按整数
  // 倍率放大,生成高清帧契约。不动图集 PNG(由 bake 管线另出);此处只重排 json 契约,
  // 供 verify reference 与运行时帧尺寸对齐。
  export interface Frame {
    frame: { x: number; y: number; w: number; h: number };
    rotated?: boolean;
    trimmed?: boolean;
    spriteSourceSize?: { x: number; y: number; w: number; h: number };
    sourceSize?: { w: number; h: number };
  }
  export interface Atlas {
    frames: Record<string, Frame>;
    meta?: { size?: { w: number; h: number } } & Record<string, unknown>;
  }

  export function scaleAtlasFrames(atlas: Atlas, scale: number): Atlas {
    const out: Atlas = { ...atlas, frames: {} };
    for (const [name, f] of Object.entries(atlas.frames)) {
      const s = (n: number) => Math.round(n * scale);
      out.frames[name] = {
        ...f,
        frame: { x: s(f.frame.x), y: s(f.frame.y), w: s(f.frame.w), h: s(f.frame.h) },
        spriteSourceSize: f.spriteSourceSize && {
          x: s(f.spriteSourceSize.x), y: s(f.spriteSourceSize.y),
          w: s(f.spriteSourceSize.w), h: s(f.spriteSourceSize.h),
        },
        sourceSize: f.sourceSize && { w: s(f.sourceSize.w), h: s(f.sourceSize.h) },
      };
    }
    if (atlas.meta?.size) {
      out.meta = { ...atlas.meta, size: { w: s2(atlas.meta.size.w, scale), h: s2(atlas.meta.size.h, scale) } };
    }
    return out;
  }
  const s2 = (n: number, scale: number) => Math.round(n * scale);
  ```
  新建 `scripts/art/scale-atlas-json.test.ts`:
  ```ts
  import { describe, expect, it } from "bun:test";
  import { scaleAtlasFrames } from "./scale-atlas-json";

  describe("scaleAtlasFrames", () => {
    it("scales frame x/y/w/h by an integer-rounded factor", () => {
      const out = scaleAtlasFrames(
        { frames: { "knight_m_idle_anim_f0.png": { frame: { x: 16, y: 0, w: 16, h: 28 } } },
          meta: { size: { w: 128, h: 1178 } } },
        2.5,
      );
      expect(out.frames["knight_m_idle_anim_f0.png"]?.frame).toEqual({ x: 40, y: 0, w: 40, h: 70 });
      expect(out.meta?.size).toEqual({ w: 320, h: 2945 });
    });
    it("preserves frame names and count", () => {
      const out = scaleAtlasFrames(
        { frames: { "floor_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
                    "wall_mid.png": { frame: { x: 0, y: 16, w: 16, h: 16 } } } },
        2.5,
      );
      expect(Object.keys(out.frames).sort()).toEqual(["floor_1.png", "wall_mid.png"]);
    });
  });
  ```
  跑 `bun test scripts/art/scale-atlas-json.test.ts` → **FAIL**(脚本未实现)。

- [ ] **Step 2: 实现到 PASS,加 __main__ CLI 入口**
  在 `scale-atlas-json.ts` 末尾加 CLI:
  ```ts
  if (import.meta.main) {
    const [inPath, outPath, scaleArg] = process.argv.slice(2);
    if (!inPath || !outPath || !scaleArg) {
      console.error("usage: bun run scripts/art/scale-atlas-json.ts <in.json> <out.json> <scale>");
      process.exit(1);
    }
    const atlas = JSON.parse(await Bun.file(inPath).text()) as Atlas;
    const scaled = scaleAtlasFrames(atlas, Number(scaleArg));
    await Bun.write(outPath, `${JSON.stringify(scaled, null, 2)}\n`);
    console.error(`scaled ${Object.keys(scaled.frames).length} frames by ${scaleArg} → ${outPath}`);
  }
  ```
  跑 `bun test scripts/art/scale-atlas-json.test.ts` → **PASS**。

- [ ] **Step 3: 备份并重生 0x72 reference 契约**
  ```bash
  cp /Users/poco/Projects/Roguent/public/assets/0x72/dungeon.json /tmp/0x72-dungeon.16px.json
  bun run /Users/poco/Projects/Roguent/scripts/art/scale-atlas-json.ts \
    /Users/poco/Projects/Roguent/public/assets/0x72/dungeon.json \
    /Users/poco/Projects/Roguent/public/assets/0x72/dungeon.json 2.5
  node -e 'const a=require("/Users/poco/Projects/Roguent/public/assets/0x72/dungeon.json"); console.log("knight:", JSON.stringify(a.frames["knight_m_idle_anim_f0.png"].frame)); console.log("floor:", JSON.stringify(a.frames["floor_1.png"].frame)); console.log("frames:", Object.keys(a.frames).length);'
  ```
  期望输出:`knight: {"x":40,"y":0,"w":40,"h":70}`、`floor: {...,"w":40,"h":40}`、`frames: 381`。
  > **注意:** 0x72 的 atlas PNG **不**在 M1a 重切(0x72 是隐藏 fallback,糊一点可接受;运行时若需 1:1 像素对齐,fallback 路径 `resolveArtPackAtlasUrls('pixel-fantasy')` 仍指 0x72 原 PNG —— 此处只动 json 契约用于 verify reference)。**这是 M1a 与 PNG 重烘焙的边界:json 契约提档在 M1a,PNG 重烘由 bake 里程碑负责。** 若运行时发现 pixel-fantasy fallback 因 json/png 尺寸不符而错位,记为整合 openQuestion(见下)。

- [ ] **Step 4: Commit**
  ```bash
  git add scripts/art/scale-atlas-json.ts scripts/art/scale-atlas-json.test.ts public/assets/0x72/dungeon.json
  git commit -m "feat: 🧩 scale-atlas-json + regen 0x72 HD frame-size reference (2.5x)"
  ```

> **整合 openQuestion(Step 3 边界):** 0x72 的 `dungeon.png` 仍是 16px 网格,但其 `dungeon.json` 现声明 40px 帧 → `resolveArtPackAtlasUrls('pixel-fantasy')` 走 0x72 原图时,Pixi 会按 json 的 40px 裁切 16px 图 → 错位。**两个出路供整合者选:**(a) M1a 同时对 0x72 PNG 做 2.5× nearest 放大(快,糊但 fallback 可见);(b) pixel-fantasy fallback 单独保留一份 16px json(`resolveArtPackAtlasUrls` 对 pixel-fantasy 返回未缩放的 json)。**推荐 (b)**:fallback 本就该用原生 16px 资产,与高清 artpack 解耦;实现见 §6.2 隐藏 fallback 的切换里程碑。M1a 先按 reference 提档,fallback PNG/json 一致性交切换里程碑兜。

---

### Task 8: [M1a] verify-artpack.ts —— 帧尺寸校验支持高清 reference(倍数宽松匹配)

reference 已重生为高清档(Task 7),`verifyAtlasFrameSizes` 严格匹配即可工作(artpack 与 reference 都是 40px)。但为**过渡期容错**(artpack 可能先于全帧重烘),加一个可选 `allowScaledMultiple` 模式:候选帧尺寸是 reference 的整数正倍数即放行。默认仍严格。

**Files:**
- Modify: `/Users/poco/Projects/Roguent/scripts/art/verify-artpack.ts:126-160`
- Test: `/Users/poco/Projects/Roguent/scripts/art/verify-artpack.test.ts`(增用例)

- [ ] **Step 1: 先写失败测试钉住宽松模式语义**
  在 `verify-artpack.test.ts` 的 `describe("verify-artpack")` 内,`verifyAtlasFrameSizes reports missing and mismatched` 用例之后追加:
  ```ts
  it("verifyAtlasFrameSizes strict mode flags any size delta (default)", () => {
    const reference = new Map([["floor_1", { w: 40, h: 40 }]]);
    const candidate = new Map([["floor_1", { w: 80, h: 80 }]]);
    const result = verifyAtlasFrameSizes({ reference, candidate });
    expect(result.ok).toBe(false);
  });

  it("verifyAtlasFrameSizes allowScaledMultiple accepts a uniform integer multiple", () => {
    const reference = new Map([
      ["floor_1", { w: 40, h: 40 }],
      ["knight_m_idle_anim_f0", { w: 40, h: 70 }],
    ]);
    // candidate 是 reference 的 2 倍(均匀)→ 放行
    const candidate = new Map([
      ["floor_1", { w: 80, h: 80 }],
      ["knight_m_idle_anim_f0", { w: 80, h: 140 }],
    ]);
    const result = verifyAtlasFrameSizes({ reference, candidate, allowScaledMultiple: true });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("verifyAtlasFrameSizes allowScaledMultiple rejects non-integer or non-uniform scale", () => {
    const reference = new Map([
      ["floor_1", { w: 40, h: 40 }],
      ["knight_m_idle_anim_f0", { w: 40, h: 70 }],
    ]);
    const candidate = new Map([
      ["floor_1", { w: 80, h: 80 }],          // ×2
      ["knight_m_idle_anim_f0", { w: 40, h: 70 } ], // ×1 → 非均匀
    ]);
    const result = verifyAtlasFrameSizes({ reference, candidate, allowScaledMultiple: true });
    expect(result.ok).toBe(false);
  });
  ```
  跑 `bun test scripts/art/verify-artpack.test.ts -t "allowScaledMultiple"` → **FAIL**(参数未实现)。

- [ ] **Step 2: 实现 allowScaledMultiple**
  改 `verify-artpack.ts:126-160`:
  ```ts
  interface VerifyAtlasFrameSizesInput {
    reference: ReadonlyMap<string, Size>;
    candidate: ReadonlyMap<string, Size>;
    /** 过渡期容错:候选帧是 reference 的「统一整数倍」即放行(全帧同一倍率)。
        默认 false = 逐帧严格相等。 */
    allowScaledMultiple?: boolean;
  }

  export function verifyAtlasFrameSizes({
    reference,
    candidate,
    allowScaledMultiple = false,
  }: VerifyAtlasFrameSizesInput): VerifyResult {
    const issues: ArtPackIssue[] = [];

    // 宽松模式:先用首个匹配帧推导统一倍率,再逐帧验证倍率一致且为正整数。
    let uniformScale: number | null = null;
    if (allowScaledMultiple) {
      for (const [frame, expected] of reference.entries()) {
        const actual = candidate.get(frame);
        if (!actual || expected.w === 0 || expected.h === 0) continue;
        const sw = actual.w / expected.w;
        const sh = actual.h / expected.h;
        if (sw === sh && Number.isInteger(sw) && sw >= 1) {
          uniformScale = sw;
          break;
        }
      }
    }

    for (const [frame, expected] of reference.entries()) {
      const actual = candidate.get(frame);
      if (!actual) {
        issues.push({ kind: "missing-frame", frame, expected, message: "Missing atlas frame" });
        continue;
      }
      const okStrict = actual.w === expected.w && actual.h === expected.h;
      const okScaled =
        allowScaledMultiple && uniformScale !== null &&
        actual.w === expected.w * uniformScale &&
        actual.h === expected.h * uniformScale;
      if (!okStrict && !okScaled) {
        issues.push({
          kind: "frame-size-mismatch", frame, expected, actual,
          message: "Atlas frame size differs from reference atlas",
        });
      }
    }
    return { ok: issues.length === 0, issues };
  }
  ```
  跑 `bun test scripts/art/verify-artpack.test.ts -t "allowScaledMultiple"` → **PASS**。

- [ ] **Step 3: 既有严格用例不破 + 默认路径不变**
  ```bash
  bun test scripts/art/verify-artpack.test.ts 2>&1 | tail -20
  ```
  期望:原有 `verifyAtlasFrameSizes reports missing and mismatched`、`verifyArtPackOnDisk` 等用例仍 PASS(`allowScaledMultiple` 默认 false,`verifyArtPackOnDisk` 不传 = 严格,行为不变)。

- [ ] **Step 4: 类型自检**
  ```bash
  bunx tsc --noEmit 2>&1 | tail -5
  ```
  期望:无错(注意 `noUncheckedIndexedAccess`:`candidate.get` 返回 `Size | undefined` 已用 `if (!actual)` 守卫)。

- [ ] **Step 5: Commit**
  ```bash
  git add scripts/art/verify-artpack.ts scripts/art/verify-artpack.test.ts
  git commit -m "feat: 🧩 verifyAtlasFrameSizes allowScaledMultiple for HD transition"
  ```

> **整合衔接:** cyber/lofi 由 bake 里程碑落盘时,其 `dungeon.json` 帧尺寸 = 0x72 reference(已 2.5×)的 1:1(同档),`verifyArtPackOnDisk` 默认严格即过。`allowScaledMultiple` 仅作过渡期(artpack 先出 2×、reference 是 2.5× 之类)的临时放行阀,稳定后可在 CLI 不启用。`verify-artpack.test.ts:488-526` 的 4 套旧包循环(neon-terminal 等)由**切换/删旧包里程碑**改;本 M1a 不动那段(它读旧包目录,删包里程碑负责改 ID 列表)。

---

### Task 9: [M1a] 里程碑收口 —— 门禁 + render-2x 清单逐项核对

确保 M1a 全部改动绿,并对照侦察 render-2x items 清单逐项打勾(防遗漏导致泡泡/发光错配)。

**Files:** 无新增(纯验证 + 清单核对)

- [ ] **Step 1: 全量门禁**
  ```bash
  bun test 2>&1 | tail -15
  bunx tsc --noEmit 2>&1 | tail -5
  bun run check 2>&1 | tail -5
  ```
  期望:`bun test` 全 PASS、tsc 无错、check 无 lint。任一红先修再继续。

- [ ] **Step 2: render-2x 清单逐项核对(grep 证据)**
  确认每个侦察点都已 HD_SCALE 参数化(或确认无需改):
  ```bash
  echo "== Character glow 分母仍 64(纠正侦察,不应出现 /128)=="
  grep -n "HD_SCALE / 64\|/ 64" src/web/room/Character.tsx src/web/room/Lights.tsx
  echo "== 残留裸虚拟 px 魔数(应只剩描边 width 这类观感线宽)=="
  grep -nE "y=\{-?(8|26|38)\}|ellipse\(0, 0, (7|9|10|11),|roundRect\(-9|radius: (22|36)," \
    src/web/room/Character.tsx src/web/room/Lights.tsx src/web/room/ToolBubble.tsx src/web/room/Emote.tsx
  ```
  期望:第一条 grep 无 `/128`(只 `* HD_SCALE / 64`);第二条 grep **空**(所有列出的魔数已被 `* HD_SCALE` 包裹,grep 不再裸匹配)。逐项对照侦察 items 的 16 个 file:line:
  - `config.ts:3` TILE ✓(Task1) / `Character.tsx:243,252,256,260,282-283,288,301` ✓(Task2) / `Lights.tsx:20,40,46,48` ✓(Task3,分母 64 保留)/ `ToolBubble.tsx:28,31,35,54,58` ✓(Task4)/ `Emote.tsx:35` ✓(Task4)/ `DungeonRoom.tsx:73,90,115,124,140,146,159-171` ✓(Task5)/ `room-props.ts:95-96` ✓(Task5)/ `hub-paint.ts:10-12` ✓(Task6)/ `PixelSprite.tsx:54` ✓(Task6)。
  - **自动适应、无需改(侦察确认):** `Character.tsx:149`(anchor 归一化)、`Lights.tsx:39`(`1.4*TILE` 比例)、`room-props.ts:10`(PROP_OFFSET_SCALE)、`Room.tsx:149,184`(整数缩放)、`HeroPortrait.tsx:93`(自适应)、`stage-scale.ts:6-7`(固定舞台)、门坐标(`*TILE`)。

- [ ] **Step 3: 记录 HEAD 供整合合并**
  ```bash
  git log --oneline -9
  git rev-parse HEAD
  ```
  期望:9 条 M1a commit(Task1-8 各 1 + 本 Task 无 commit),HEAD SHA 记下供整合者 `git merge --no-ff`。

> **本 Task 不 commit**(纯验证)。视觉验证(房间清晰不糊、布局合理、泡泡贴头)按设计 §8 归 **M4 preview 端到端**;M1a 阶段以「门禁全绿 + 清单逐项核对 + 数学不变量(发光 tile 覆盖恒定、大厅 S×帧px==旧T)」为证据,**不在此声称视觉好用**(遵守「没跑过 preview 不说已验证」)。



---

# Milestone M1b — 切换落位(删4加2 + 全局 accent + 测试)

## Milestone M1b-switch — 切换落位(删4加2 + DEFAULT=cyber + 全局 --ac + 测试同步)

> 依据 commit `690a372`(2026-06-17,本地 main 领先 origin)+ 侦察 `wqmll03kz.output` 的 `switch-chain` 清单。
> 本 milestone **只动切换链路代码与测试**,不出图、不改烘焙脚本、不改帧契约(那些在 M1a/M2/M3)。
> **前置假设**:M1a 已产出 `public/assets/artpacks/{cyber,lofi}/atlas/{dungeon.json,dungeon.png,gpt-image-overrides.json}` 占位目录(满足 `REQUIRED_ARTPACK_FILES` + 381 帧)。整合者若把 M1b 排在 M1a 前,先做下方 Task 1 的占位 guard。
> 全程 TDD:先改/加测试断言 → 跑红 → 改实现 → 跑绿 → commit。所有路径绝对化,命令在仓库根 `/Users/poco/Projects/Roguent` 执行。

---

### Task 1: [M1b] 前置校准 — 锁定基线与占位资源 guard

**Files:**
- Read-only check: `public/assets/artpacks/`、`src/web/hud/artpack.ts`

- [ ] **Step 1: 确认基线在最新 main**
  ```bash
  git -C /Users/poco/Projects/Roguent fetch origin main
  git -C /Users/poco/Projects/Roguent log --oneline -1
  ```
  期望:HEAD = 设计文档 commit(`690a372` 或其后续),且 worktree 基于它。若 `origin/main` 更新,先 `git merge` 同步再开 worktree(遵 workflow.md)。

- [ ] **Step 2: guard — cyber/lofi atlas 占位是否就绪**
  ```bash
  ls -1 public/assets/artpacks/cyber/atlas/ public/assets/artpacks/lofi/atlas/ 2>&1
  ```
  期望:各列出 `dungeon.json`、`dungeon.png`、`gpt-image-overrides.json`(M1a 产物)。
  **若目录不存在**(M1b 被排在 M1a 前):本 milestone 的运行时加载与 `verify-artpack.test.ts:488` 帧契约循环会失败。此时**不要**继续写实现,先回整合者确认排序;或临时 `cp -R` 一份现有 `neon-terminal/atlas` 占位(仅为让测试可跑,M2 会覆盖):
  ```bash
  # 仅当 M1a 未先行时的应急占位(M2 会覆盖):
  for t in cyber lofi; do
    mkdir -p public/assets/artpacks/$t
    cp -R public/assets/artpacks/neon-terminal/. public/assets/artpacks/$t/
  done
  ```
  记录本步选择(就绪 / 应急占位),写进 commit body。

- [ ] **Step 3: 创建 worktree(遵 workflow.md)**
  ```bash
  git -C /Users/poco/Projects/Roguent worktree add --detach .worktrees/m1b-switch main
  cd /Users/poco/Projects/Roguent/.worktrees/m1b-switch && bun install
  ```
  期望:worktree 建好、依赖装好。后续所有改动在此 worktree 内完成。
  > 说明:本 Task 无代码改动,不单独 commit;它是后续 Task 的执行前提。

---

### Task 2: [M1b] 改红 artpack.test.ts — 长度 5→3 / ready 列表 / DEFAULT=cyber

**Files:**
- Modify: `src/web/hud/artpack.test.ts:16-46`、`:85-89`、`:91-112`

- [ ] **Step 1: 改 ART_PACKS 长度与字段断言(5→3)**
  把 `:16-27` 整段替换为:
  ```ts
  test("ART_PACKS:3 包(pixel-fantasy + cyber + lofi)、id 唯一、字段齐全", () => {
    expect(ART_PACKS).toHaveLength(3);
    const ids = ART_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(["pixel-fantasy", "cyber", "lofi"]);
    for (const p of ART_PACKS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.en.length).toBeGreaterThan(0);
      expect(p.ac).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });
  ```

- [ ] **Step 2: 改 GENERATED_ARTPACK_IDS 常量(4→2)**
  把 `:29-34` 替换为:
  ```ts
  const GENERATED_ARTPACK_IDS = ["cyber", "lofi"];
  ```

- [ ] **Step 3: 改 ready 列表 + DEFAULT 断言**
  把 `:36-46` 整段替换为:
  ```ts
  test("三个美术包均 ready;默认使用 cyber(赛博霓虹·夜)", () => {
    const ready = ART_PACKS.filter((p) => p.ready);
    expect(ready.map((p) => p.id)).toEqual(["pixel-fantasy", "cyber", "lofi"]);
    expect(DEFAULT_ARTPACK).toBe("cyber");
  });
  ```

- [ ] **Step 4: 改 loadArtPack / applyArtPack 用例里的旧 id**
  - `:85-89` 替换为:
    ```ts
    test("loadArtPack:空→默认 cyber;读已存值", () => {
      expect(loadArtPack()).toBe("cyber");
      localStorage.setItem(ARTPACK_KEY, "lofi");
      expect(loadArtPack()).toBe("lofi");
    });
    ```
  - `:91-97`(applyArtPack 写 localStorage)把两处 `"neon-terminal"` 改 `"cyber"`。
  - `:99-112`(派发事件)把 `applyArtPack("deep-space")` 改 `applyArtPack("lofi")`、`expect(detail).toEqual({ id: "deep-space" })` 改 `{ id: "lofi" }`。

- [ ] **Step 5: 跑红确认**
  ```bash
  bun test src/web/hud/artpack.test.ts 2>&1 | tail -20
  ```
  期望:失败,报 `ART_PACKS` 仍为 5、`DEFAULT_ARTPACK` 仍为 `neon-terminal`(证明断言已对准新契约、实现未改)。

  > 本 Task 不 commit,与 Task 3 实现合并提交(TDD 红→绿同一主题)。

---

### Task 3: [M1b] 改绿 artpack.ts — 删 4 套旧对象、加 cyber/lofi、DEFAULT='cyber'、隐藏列表导出

**Files:**
- Modify: `src/web/hud/artpack.ts:33`(DEFAULT)、`:35-140`(ART_PACKS)、尾部新增 `HIDDEN_ARTPACK_IDS` / `VISIBLE_ART_PACKS`

- [ ] **Step 1: 改 DEFAULT_ARTPACK**
  `src/web/hud/artpack.ts:33`:
  ```ts
  export const DEFAULT_ARTPACK = "cyber";
  ```

- [ ] **Step 2: 重写 ART_PACKS(保留 pixel-fantasy、删 4 套、加 cyber/lofi)**
  把 `:35-140` 整个 `export const ART_PACKS: ArtPack[] = [ ... ];` 替换为:
  ```ts
  export const ART_PACKS: ArtPack[] = [
    {
      id: "pixel-fantasy",
      name: "像素奇幻",
      en: "Pixel Fantasy",
      ac: "#f2c84b",
      desc: "当前内置风格 · 地牢羊皮卷 · 暖棕木质 HUD",
      ready: true,
    },
    {
      id: "cyber",
      name: "赛博霓虹",
      en: "Cyber Neon",
      ac: "#36c5e0",
      desc: "赛博霓虹 · 夜色冷调 · 高清像素 vibe-coding 工作空间",
      ready: true,
      previews: {
        lobby: "/assets/artpacks/cyber/previews/lobby.png",
        interior: "/assets/artpacks/cyber/previews/interior.png",
      },
      ui: {
        buttons: "/assets/artpacks/cyber/ui/buttons.png",
      },
      sourceSheets: {
        characters: "/assets/artpacks/cyber/characters/npcs.png",
        environment: "/assets/artpacks/cyber/tiles/environment.png",
        props: "/assets/artpacks/cyber/items/props.png",
        structures: "/assets/artpacks/cyber/structures/source-sheet.png",
        hud: "/assets/artpacks/cyber/hud/icons.png",
        easter: "/assets/artpacks/cyber/easter/sprites.png",
        ui: "/assets/artpacks/cyber/ui/buttons.png",
      },
    },
    {
      id: "lofi",
      name: "暖光日常",
      en: "Lofi Daylight",
      ac: "#f2a65a",
      desc: "暖光日常 · 白昼柔光 · 高清像素 vibe-coding 工作空间",
      ready: true,
      previews: {
        lobby: "/assets/artpacks/lofi/previews/lobby.png",
        interior: "/assets/artpacks/lofi/previews/interior.png",
      },
      ui: {
        buttons: "/assets/artpacks/lofi/ui/buttons.png",
      },
      sourceSheets: {
        characters: "/assets/artpacks/lofi/characters/npcs.png",
        environment: "/assets/artpacks/lofi/tiles/environment.png",
        props: "/assets/artpacks/lofi/items/props.png",
        structures: "/assets/artpacks/lofi/structures/source-sheet.png",
        hud: "/assets/artpacks/lofi/hud/icons.png",
        easter: "/assets/artpacks/lofi/easter/sprites.png",
        ui: "/assets/artpacks/lofi/ui/buttons.png",
      },
    },
  ];
  ```

- [ ] **Step 3: 新增隐藏列表 + 可见列表导出(供 Settings 过滤,共享契约)**
  在 `ART_PACKS` 定义块之后、`loadArtPack` 之前插入:
  ```ts
  // 从 Settings UI 隐藏的包:pixel-fantasy 仅作不可见 fallback(防黑屏),不展示卡片。
  export const HIDDEN_ARTPACK_IDS: readonly string[] = ["pixel-fantasy"];

  // Settings ArtPackGroup 实际渲染的卡片集合(过滤掉隐藏包)。
  export const VISIBLE_ART_PACKS: ArtPack[] = ART_PACKS.filter(
    (p) => !HIDDEN_ARTPACK_IDS.includes(p.id),
  );
  ```

- [ ] **Step 4: 跑绿 artpack.test.ts + artpack-assets fallback 自动更新自检**
  ```bash
  bun test src/web/hud/artpack.test.ts 2>&1 | tail -15
  bunx tsc --noEmit 2>&1 | grep -E "artpack" || echo "TS-ARTPACK-CLEAN"
  ```
  期望:`artpack.test.ts` 全绿;tsc 对 `artpack.ts` 无错(`artpack-assets.ts` 的 `readyPackIds`/fallback 引用 `ART_PACKS`/`DEFAULT_ARTPACK`,代码无需改、类型自洽)。

- [ ] **Step 5: Commit(红→绿同一主题)**
  ```bash
  git add src/web/hud/artpack.ts src/web/hud/artpack.test.ts
  git commit -m "refactor: ✨ swap art packs to cyber/lofi (drop 4 generated packs, DEFAULT=cyber)"
  ```

---

### Task 4: [M1b] 改红→绿 artpack-assets.test.ts — fallback 断言 + cyber/lofi case

**Files:**
- Modify: `src/web/artpack-assets.test.ts:14-56`
- (no production change — `artpack-assets.ts` 自动跟随 `ART_PACKS`/`DEFAULT_ARTPACK`,Task 3 已验证 tsc clean)

- [ ] **Step 1: 改 default + fallback 用例(neon-terminal→cyber)**
  把 `:14-25` 整段替换为:
  ```ts
  test("resolveArtPackAtlasUrls returns generated atlas for the default pack", () => {
    expect(resolveArtPackAtlasUrls("cyber")).toEqual({
      json: "/assets/artpacks/cyber/atlas/dungeon.json",
      image: "/assets/artpacks/cyber/atlas/dungeon.png",
      packId: "cyber",
    });
    expect(resolveArtPackAtlasUrls("missing-pack")).toEqual({
      json: "/assets/artpacks/cyber/atlas/dungeon.json",
      image: "/assets/artpacks/cyber/atlas/dungeon.png",
      packId: "cyber",
    });
  });
  ```

- [ ] **Step 2: 加 lofi case、改第三个用例(synthwave→lofi)**
  把 `:35-41` 整段替换为:
  ```ts
  test("resolveArtPackAtlasUrls returns runtime artpack atlas for generated packs", () => {
    expect(resolveArtPackAtlasUrls("lofi")).toEqual({
      json: "/assets/artpacks/lofi/atlas/dungeon.json",
      image: "/assets/artpacks/lofi/atlas/dungeon.png",
      packId: "lofi",
    });
  });
  ```

- [ ] **Step 3: 改持久化读取用例(neon-terminal→cyber, deep-space→lofi)**
  把 `:43-56` 整段替换为:
  ```ts
  test("resolveCurrentArtPackAtlasUrls reads persisted artpack selection", () => {
    expect(resolveCurrentArtPackAtlasUrls()).toEqual({
      json: "/assets/artpacks/cyber/atlas/dungeon.json",
      image: "/assets/artpacks/cyber/atlas/dungeon.png",
      packId: "cyber",
    });

    localStorage.setItem(ARTPACK_KEY, "lofi");
    expect(resolveCurrentArtPackAtlasUrls()).toEqual({
      json: "/assets/artpacks/lofi/atlas/dungeon.json",
      image: "/assets/artpacks/lofi/atlas/dungeon.png",
      packId: "lofi",
    });
  });
  ```
  > `pixel-fantasy` legacy 用例(`:27-33`)保持不变 — 它仍 ready、仍映射 0x72,是 fallback 兜底。

- [ ] **Step 4: 跑绿**
  ```bash
  bun test src/web/artpack-assets.test.ts 2>&1 | tail -15
  ```
  期望:全绿(production 代码未改,fallback 与 default 已自动指向 cyber)。

- [ ] **Step 5: Commit**
  ```bash
  git add src/web/artpack-assets.test.ts
  git commit -m "test: 🧪 point artpack-assets cases at cyber/lofi (fallback→cyber)"
  ```

---

### Task 5: [M1b] App.tsx — 根节点 --ac 全局跟随 artpack.ac(init + ARTPACK_CHANGE_EVENT)

**Files:**
- Modify: `src/web/App.tsx:9`(import)、`:73-75`(useEffect)
- Test: `src/web/lobby/LoginGate.test.tsx`(已是 App 集成测试,补 --ac 断言)

- [ ] **Step 1: 先在 LoginGate.test.tsx 加红 — 启动写 --ac、切换更新 --ac**
  在 `src/web/lobby/LoginGate.test.tsx` 末尾(`:85` 之后)追加。先把顶部 import 补上 `ART_PACKS`、`applyArtPack`、`ARTPACK_CHANGE_EVENT`(从 `../hud/artpack`),`act` 从 `@testing-library/react`:
  ```ts
  import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
  import {
    ARTPACK_CHANGE_EVENT,
    ARTPACK_KEY,
    ART_PACKS,
    applyArtPack,
  } from "../hud/artpack";
  ```
  追加用例:
  ```ts
  test("startup writes the active art pack accent into the root --ac variable", async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    localStorage.setItem(ARTPACK_KEY, "lofi");
    const lofi = ART_PACKS.find((p) => p.id === "lofi");

    render(<App />);

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--ac"),
      ).toBe(lofi?.ac),
    );
  });

  test("switching art pack updates the root --ac variable", async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const cyber = ART_PACKS.find((p) => p.id === "cyber");
    const lofi = ART_PACKS.find((p) => p.id === "lofi");

    render(<App />);
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--ac"),
      ).toBe(cyber?.ac),
    );

    act(() => {
      applyArtPack("lofi");
    });

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--ac"),
      ).toBe(lofi?.ac),
    );
  });
  ```
  并在 `afterEach`(`:36-55`)的清理里追加一行,避免 --ac 跨用例泄漏:
  ```ts
    document.documentElement.style.removeProperty("--ac");
  ```

- [ ] **Step 2: 跑红**
  ```bash
  bun test src/web/lobby/LoginGate.test.tsx 2>&1 | tail -25
  ```
  期望:新两条失败(根 `--ac` 为空字符串,实现未写);旧用例里 `synthwave` 那条也会红(下个 Task 改),先忽略它。

- [ ] **Step 3: 实现 — App.tsx 写根 --ac,init + 监听切换**
  `src/web/App.tsx:9` 把 import 补全:
  ```ts
  import {
    ARTPACK_CHANGE_EVENT,
    ART_PACKS,
    applyArtPack,
    loadArtPack,
  } from "./hud/artpack";
  ```
  把 `:73-75` 的 useEffect 替换为:
  ```ts
  useEffect(() => {
    applyArtPack(loadArtPack());
    // 全局 accent 跟随 artpack:把当前包 ac 写进根节点 --ac(与 settings 的 --accent 独立)。
    const syncAccent = () => {
      const pack =
        ART_PACKS.find((p) => p.id === loadArtPack()) ?? ART_PACKS[0];
      if (pack) {
        document.documentElement.style.setProperty("--ac", pack.ac);
      }
    };
    syncAccent();
    window.addEventListener(ARTPACK_CHANGE_EVENT, syncAccent);
    return () => window.removeEventListener(ARTPACK_CHANGE_EVENT, syncAccent);
  }, []);
  ```
  > 说明:`applyArtPack` 已派发 `ARTPACK_CHANGE_EVENT`,故 Settings 里切换 → 事件 → `syncAccent` 重读 `loadArtPack()`(切换前已写 localStorage)→ 更新根 --ac。`document` 在 web 运行时恒存在,App 仅在浏览器挂载,无需 guard。

- [ ] **Step 4: 跑绿(新两条)**
  ```bash
  bun test src/web/lobby/LoginGate.test.tsx -t "ac" 2>&1 | tail -15
  ```
  期望:两条 `--ac` 用例绿。`synthwave` 那条仍红(Task 6 修)。

  > 本 Task 不单独 commit,与 Task 6(同文件 synthwave→新 id)合并提交。

---

### Task 6: [M1b] LoginGate.test.tsx — synthwave→新 id,跑全绿

**Files:**
- Modify: `src/web/lobby/LoginGate.test.tsx:73-84`

- [ ] **Step 1: 改持久化重应用用例(synthwave→lofi)**
  把 `:73-84` 整段替换为:
  ```ts
  test("startup reapplies the persisted art pack to the document root", async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    localStorage.setItem(ARTPACK_KEY, "lofi");

    render(<App />);

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-artpack")).toBe(
        "lofi",
      ),
    );
  });
  ```

- [ ] **Step 2: 跑全绿(整文件)**
  ```bash
  bun test src/web/lobby/LoginGate.test.tsx 2>&1 | tail -15
  bunx tsc --noEmit 2>&1 | grep -E "App.tsx|LoginGate" || echo "TS-APP-CLEAN"
  ```
  期望:LoginGate 全部用例绿(含 start gate / 持久化 / 两条 --ac);tsc 对 App.tsx + LoginGate 无错。

- [ ] **Step 3: Commit**
  ```bash
  git add src/web/App.tsx src/web/lobby/LoginGate.test.tsx
  git commit -m "feat: 🧩 follow artpack accent into root --ac (init + change event)"
  ```

---

### Task 7: [M1b] Settings.tsx — ArtPackGroup 渲染 VISIBLE_ART_PACKS(隐藏 pixel-fantasy)

**Files:**
- Modify: `src/web/hud/Settings.tsx`(import 行补 `VISIBLE_ART_PACKS`、`:740-742` cur/pv 查找、`:755` map)
- Modify: `src/web/hud/Settings.test.tsx:300-372`(两个用例改点 cyber/lofi),并新增隐藏断言

- [ ] **Step 1: 先在 Settings.test.tsx 加红 — pixel-fantasy 卡片不渲染**
  在 `src/web/hud/Settings.test.tsx` 的 art-style 用例区(`:300` 之前)新增:
  ```ts
  test("art style group hides the pixel-fantasy fallback pack", async () => {
    useUiStore.setState({ activePanel: "settings" });
    const { container } = render(<Settings />);
    await userEvent.click(
      screen.getByRole("button", { name: /美术风格 Art Style/ }),
    );
    expect(
      container.querySelector('.artpack-card[data-pk="pixel-fantasy"]'),
    ).toBeNull();
    expect(
      container.querySelector('.artpack-card[data-pk="cyber"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('.artpack-card[data-pk="lofi"]'),
    ).toBeTruthy();
  });
  ```

- [ ] **Step 2: 改两个旧用例点击的卡片 id(deep-space→cyber, holo-blueprint→lofi)**
  - `:308-318`(ui kit 预览):`data-pk="deep-space"` → `data-pk="cyber"`;两处 `/assets/artpacks/deep-space/ui/buttons.png` → `/assets/artpacks/cyber/ui/buttons.png`。
  - `:332-371`(sheets 预览):`data-pk="holo-blueprint"` → `data-pk="lofi"`;全部 7 处 `/assets/artpacks/holo-blueprint/...` → `/assets/artpacks/lofi/...`(characters/npcs.png、tiles/environment.png、items/props.png、structures/source-sheet.png、hud/icons.png、easter/sprites.png、ui/buttons.png)。

- [ ] **Step 3: 跑红**
  ```bash
  bun test src/web/hud/Settings.test.tsx -t "art style" 2>&1 | tail -25
  ```
  期望:新隐藏用例失败(pixel-fantasy 卡片当前仍渲染);两个改了 id 的用例失败(cyber/lofi 卡片当前不存在 → querySelector null → click 抛错)。

- [ ] **Step 4: 实现 — ArtPackGroup 用 VISIBLE_ART_PACKS**
  `src/web/hud/Settings.tsx` 顶部 artpack import 补 `VISIBLE_ART_PACKS`(与现有 `ART_PACKS`/`applyArtPack`/`loadArtPack` 同一 import 语句)。
  `ArtPackGroup` 内:
  - `:740` `const curPack = ART_PACKS.find(...)` 保留用 `ART_PACKS`(cur 可能是隐藏的 fallback,需能解析名字);
  - `:741` `const pvPack = ART_PACKS.find(...)` 保留 `ART_PACKS`;
  - `:755` 渲染循环改为:
    ```tsx
    {VISIBLE_ART_PACKS.map((p) => (
    ```
  其余(`:760` `style={{ "--ac": p.ac }}`、card 内容)不变。

- [ ] **Step 5: 跑绿**
  ```bash
  bun test src/web/hud/Settings.test.tsx 2>&1 | tail -20
  bunx tsc --noEmit 2>&1 | grep -E "Settings" || echo "TS-SETTINGS-CLEAN"
  ```
  期望:Settings.test.tsx 全绿(隐藏 + cyber/lofi 预览);tsc 对 Settings 无错。

- [ ] **Step 6: Commit**
  ```bash
  git add src/web/hud/Settings.tsx src/web/hud/Settings.test.tsx
  git commit -m "feat: 🧩 hide pixel-fantasy fallback card; render visible art packs only"
  ```

---

### Task 8: [M1b] i18n.ts — 删旧包译条、补 cyber/lofi,grep 验证无残留

**Files:**
- Modify: `src/web/i18n.ts:663-681`

- [ ] **Step 1: 删 4 套旧包 + 旧 pixel-fantasy note 的译条,补 cyber/lofi**
  把 `:663-677`(`像素奇幻` 到 `"80s 落日网格..."`)整段替换为:
  ```ts
    像素奇幻: "Pixel Fantasy",
    赛博霓虹: "Cyber Neon",
    暖光日常: "Lofi Daylight",
    "当前内置风格 · 地牢羊皮卷 · 暖棕木质 HUD":
      "Built-in style · dungeon parchment · warm-wood HUD",
    "赛博霓虹 · 夜色冷调 · 高清像素 vibe-coding 工作空间":
      "Cyber neon · cool night palette · crisp-pixel vibe-coding workspace",
    "暖光日常 · 白昼柔光 · 高清像素 vibe-coding 工作空间":
      "Lofi daylight · soft warm light · crisp-pixel vibe-coding workspace",
  ```
  > `像素奇幻` 与其 desc `当前内置风格 · ...` 保留(pixel-fantasy 仍是 fallback,curPack 名字可能用到);删掉的是 `霓虹终端/全息蓝图/深空舰桥/合成波` 四个 name 键 + 它们的 4 条 desc 键。`✓ 使用中`、`预览`(`:678-679`)与 `当前使用内置「像素奇幻」素材,开箱即用。`(`:680-681`)保持不变。

- [ ] **Step 2: grep 验证旧译条无残留**
  ```bash
  grep -nE "霓虹终端|全息蓝图|深空舰桥|合成波|Neon Terminal|Holo Blueprint|Deep-Space Bridge|Synthwave Grid|CRT 扫描线|线框全息|星舰指挥|80s 落日" src/web/i18n.ts || echo "NO-LEGACY-I18N"
  grep -nE "赛博霓虹|暖光日常|Cyber Neon|Lofi Daylight" src/web/i18n.ts
  ```
  期望:第一条输出 `NO-LEGACY-I18N`(旧键全删);第二条命中 cyber/lofi 的 name + desc 共 4 行键。

- [ ] **Step 3: EN 模式无中文泄漏自检(对照 MEMORY i18n-leak-gotcha)**
  确认新 desc 的源串(中文)在 DICT 有对应英文:cyber/lofi 的 `name`(`赛博霓虹`/`暖光日常`)、`desc`(两条长串)各有译文(Step 1 已补)。Settings 卡片经 `t(p.name)` / `t(p.desc)` 渲染,EN 模式应出英文。
  ```bash
  grep -nE "赛博霓虹|暖光日常" src/web/hud/artpack.ts
  ```
  期望:命中 artpack.ts 里 cyber/lofi 的 `name`,与 i18n DICT 键一一对应(无悬空键)。

- [ ] **Step 4: Commit**
  ```bash
  git add src/web/i18n.ts
  git commit -m "chore: 🧹 swap artpack i18n entries to cyber/lofi (drop 4 legacy packs)"
  ```

---

### Task 9: [M1b] verify-artpack.test.ts — 循环包 id 换 cyber/lofi(381 帧契约跑、内容断言延后)

**Files:**
- Modify: `scripts/art/verify-artpack.test.ts:488-493`(帧契约循环)、`:529-534`、`:556-561`、`:574-579`(三个内容型循环)

- [ ] **Step 1: 改 381 帧契约循环(488)的包 id**
  把 `:488-493` 的数组替换为:
  ```ts
    for (const pack of ["cyber", "lofi"]) {
  ```
  此循环断言 `atlasFrameCount===381`、`coveredFrameCount===381`、`coveredFramesByCategory`、`sourceSheets` 含 easter/hud/ui。依赖 M1a 产出的 cyber/lofi `gpt-image-overrides.json`(占位或真实均需满足 381 帧契约)。

- [ ] **Step 2: 三个内容型循环改 id + skip 延后(避开 M2 才有的真实烘焙内容)**
  这三个 `it(...)` 断言已烘焙 atlas 的视觉内容(106 角色帧裁切 / 硬边像素 / 环境噪声分数),cyber/lofi 真实素材要 M2/M3 才出。把它们的包 id 改成 cyber/lofi,并整体 `it` → `it.skip`,带 TODO 注释,M2 出图后解 skip:
  - `:528` `it("generated character frames crop ...")` → `it.skip("generated character frames crop ... (TODO M2: unskip after cyber/lofi bake)")`,内部 `:529-534` 数组改 `["cyber", "lofi"]`。
  - `:555` `it("generated runtime atlases keep hard-edged ...")` → `it.skip(... TODO M2 ...)`,内部 `:556-561` 数组改 `["cyber", "lofi"]`。
  - `:573` `it("generated environment tiles avoid ...")` → `it.skip(... TODO M2 ...)`,内部 `:574-579` 数组改 `["cyber", "lofi"]`。
  > 理由见 OpenQuestions[0]:M1b 只落切换契约,内容质量断言归 M2/M3。若 Task 1 用了"应急占位"(拷 neon-terminal),这三个其实也能跑过,但语义上属内容验收,统一 skip 更诚实,M2 出真图后解。

- [ ] **Step 3: 跑(全文件)**
  ```bash
  bun test scripts/art/verify-artpack.test.ts 2>&1 | tail -25
  ```
  期望:`generated artpacks report GPT-image runtime frame coverage`(381 帧契约)对 cyber/lofi 绿;三个内容型用例 skip;其余结构型用例(REQUIRED_ARTPACK_FILES / verifyArtPackFiles)不受影响仍绿。
  > 若 381 帧循环对 cyber/lofi 红 → 说明 M1a 占位的 `gpt-image-overrides.json` 帧数/分类不符 381 契约 → 回 OpenQuestions[2],需 M1a 先补齐占位 report。

- [ ] **Step 4: Commit**
  ```bash
  git add scripts/art/verify-artpack.test.ts
  git commit -m "test: 🧪 retarget artpack verify loops to cyber/lofi (skip bake-content asserts until M2)"
  ```

---

### Task 10: [M1b] 删旧包资源 + 全门禁 + 合并 main

**Files:**
- Delete: `public/assets/artpacks/{neon-terminal,holo-blueprint,deep-space,synthwave}/`
- Verify: 全仓

- [ ] **Step 1: grep 兜底 — 确认源码/测试再无旧 id 引用**
  ```bash
  grep -rnE "neon-terminal|holo-blueprint|deep-space|synthwave" src/ scripts/ --include="*.ts" --include="*.tsx" || echo "NO-LEGACY-ID-REFS"
  ```
  期望:`NO-LEGACY-ID-REFS`。若仍有命中(如遗漏的 i18n desc 内文 `deep-space starfield`),逐条核对:纯英文描述文案里的 `deep-space` 已随 Task 8 删除,不应残留;真有残留则补删。

- [ ] **Step 2: 删 4 套旧包目录**
  ```bash
  rm -rf public/assets/artpacks/neon-terminal public/assets/artpacks/holo-blueprint public/assets/artpacks/deep-space public/assets/artpacks/synthwave
  ls -1 public/assets/artpacks/
  ```
  期望:仅剩 `cyber`、`lofi`(+ 可能的 `.gitkeep`/其它)。

- [ ] **Step 3: 全门禁(改后即测三件套 + build)**
  ```bash
  bun test 2>&1 | tail -25
  bunx tsc --noEmit 2>&1 | tail -15
  bun run check 2>&1 | tail -15
  bun run build 2>&1 | tail -10
  ```
  期望:`bun test` 全绿(verify-artpack 三个内容用例 skip 计入 skipped、非 fail);tsc 无错;Biome check 通过;build 成功。
  > 若 `bun test` 报别处用旧 id(如 fixtures / e2e),回查 Step 1 的 grep 是否漏扫目录;e2e 单独 `bun run typecheck:e2e` 不在本 milestone 范围(本 milestone 未动 `tests/e2e/`)。

- [ ] **Step 4: 记 SHA、回主树合并**
  ```bash
  WT_SHA=$(git -C /Users/poco/Projects/Roguent/.worktrees/m1b-switch rev-parse HEAD)
  cd /Users/poco/Projects/Roguent
  git merge --no-ff "$WT_SHA" -m "merge: 🔀 M1b switch landing — drop 4 packs, add cyber/lofi, global --ac"
  ```
  期望:fast-forward 关闭、merge commit 生成。

- [ ] **Step 5: 合并后复测(对照 CLAUDE.md 测试纪律:合并后重新验证)**
  ```bash
  cd /Users/poco/Projects/Roguent
  bun test 2>&1 | tail -15
  bunx tsc --noEmit 2>&1 | tail -8
  ```
  期望:main 上同样全绿。
  > push 与 worktree 清理(`git worktree remove .worktrees/m1b-switch`)按用户指示再做(workflow.md:合并后 push 前由用户确认;本 milestone 不自行 push)。

- [ ] **Step 6: Commit(删资源,若 Step 2 的 rm 尚未入提交)**
  ```bash
  cd /Users/poco/Projects/Roguent/.worktrees/m1b-switch
  git add -A public/assets/artpacks
  git commit -m "chore: 🧹 remove 4 legacy generated artpacks (neon-terminal/holo-blueprint/deep-space/synthwave)"
  ```
  > 注:Step 2 的 `rm -rf` 应在 Step 4 合并前先于 worktree 内 commit。实际执行顺序:Step 1→2→**本 Step 6 的 commit**→3(门禁)→4(合并)→5(复测)。这里列为 Step 6 是因删资源逻辑上属"删旧包",但 git 提交须在门禁/合并之前完成;实现时把删除 commit 排在门禁前。



---

# Milestone M1c — 烘焙管线改造(单体 + 去糊化)

## Milestone M1c-bake — 烘焙管线改造(单体出图 + 去糊化)

> 目标:把"网格 source-sheet 裁剪 + 后期糊化"管线,改造成"单体出图 → 去背 → 缩放到高清帧 → individual-render 写入 atlas(不糊化)"。新增 `remove-bg.py` / `scale-to-frame.py` 两个独立脚本,改 `apply-gpt-image-overrides.py` 加 `individual-render` 分支并去糊化。
>
> **Python 解释器(载荷,务必照用)**:仓库无 venv;`/Users/poco/.hermes/hermes-agent/venv/bin/python3` 与 `/opt/homebrew/bin/python3` **都没有 PIL**。**唯一可用的是 `/usr/bin/python3`**(已确认 PIL 11.3.0 + pytest 8.4.2)。本 milestone 所有 Python 命令一律用 `/usr/bin/python3`,pytest 用 `/usr/bin/python3 -m pytest`。
>
> **落盘契约(跨 Task 一致)**:`scripts/art/gen-out/<theme>/raw/<asset>.png`(codex 出图)→ `nobg/<asset>.png`(去背)→ `scaled/<frame>.png`(缩放)。theme ∈ {cyber, lofi}。

---

### Task 1: [M1c] remove-bg.py — PIL alpha 边界去背(TDD)

去背脚本第一步:输入 `gen-out/<theme>/raw/<asset>.png`(近纯色 / chroma 底),输出 `nobg/<asset>.png`(透明底)。用 PIL 自实现:采样四角主导背景色 → 把"接近背景色"的像素 alpha 置 0 → flood 从边缘进入避免误杀内部同色,先写失败测试再实现。

**Files:**
- Create: `scripts/art/remove_bg.py`(模块,下划线命名便于 import;CLI 入口同文件)
- Test: `scripts/art/test_remove_bg.py`

- [ ] **Step 1: 写失败测试** — 造一张「红色主体 + 纯绿背景」测试图,断言去背后四角透明、中心主体保留。

  写 `scripts/art/test_remove_bg.py`:
  ```python
  from pathlib import Path

  from PIL import Image

  from remove_bg import remove_bg


  def _make_green_bg_red_box(path: Path) -> None:
      # 64x64 纯绿底 (0,200,0)，中心 24x24 红块主体
      im = Image.new("RGBA", (64, 64), (0, 200, 0, 255))
      for y in range(20, 44):
          for x in range(20, 44):
              im.putpixel((x, y), (220, 30, 30, 255))
      im.save(path)


  def test_corners_transparent_subject_kept(tmp_path: Path) -> None:
      src = tmp_path / "raw.png"
      out = tmp_path / "nobg.png"
      _make_green_bg_red_box(src)

      remove_bg(str(src), str(out))

      result = Image.open(out).convert("RGBA")
      # 四角必须全透明
      for x, y in [(0, 0), (63, 0), (0, 63), (63, 63)]:
          assert result.getpixel((x, y))[3] == 0, f"corner {(x, y)} not transparent"
      # 中心主体必须保留（不透明且仍是红色）
      cr, cg, cb, ca = result.getpixel((32, 32))
      assert ca == 255, "subject center wrongly removed"
      assert cr > 150 and cg < 100, "subject color corrupted"


  def test_bbox_tightens_to_subject(tmp_path: Path) -> None:
      src = tmp_path / "raw.png"
      out = tmp_path / "nobg.png"
      _make_green_bg_red_box(src)
      remove_bg(str(src), str(out))
      bbox = Image.open(out).convert("RGBA").getchannel("A").getbbox()
      assert bbox == (20, 20, 44, 44), f"unexpected bbox {bbox}"
  ```

- [ ] **Step 2: 跑测试，确认失败(模块不存在)**

  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_remove_bg.py -q
  ```
  期望:`ModuleNotFoundError: No module named 'remove_bg'`(红)。

- [ ] **Step 3: 实现 remove_bg.py** — 四角采样背景色 + 边缘 flood-fill 去背。

  写 `scripts/art/remove_bg.py`:
  ```python
  #!/usr/bin/env python3
  """Remove near-solid background from a single-render PNG.

  Samples the dominant background colour from the four corners, then flood-fills
  transparency inward from every edge pixel whose colour is within `threshold`
  of that background. Flood-from-edges avoids deleting same-coloured interior
  pixels of the subject. Output is a transparent-background RGBA PNG.

  Fallback: if PIL alpha edge detection produces a poor result you may swap in
  `rembg` (see --engine rembg), but PIL is the default to avoid the extra dep.
  """

  from __future__ import annotations

  import argparse
  from collections import deque
  from pathlib import Path

  from PIL import Image


  def _corner_bg_color(pix, width: int, height: int) -> tuple[int, int, int]:
      corners = [
          pix[0, 0],
          pix[width - 1, 0],
          pix[0, height - 1],
          pix[width - 1, height - 1],
      ]
      r = sum(c[0] for c in corners) // 4
      g = sum(c[1] for c in corners) // 4
      b = sum(c[2] for c in corners) // 4
      return (r, g, b)


  def _close(c: tuple[int, int, int, int], bg: tuple[int, int, int], threshold: int) -> bool:
      return (
          abs(c[0] - bg[0]) <= threshold
          and abs(c[1] - bg[1]) <= threshold
          and abs(c[2] - bg[2]) <= threshold
      )


  def remove_bg(
      src_path: str,
      out_path: str,
      *,
      threshold: int = 18,
  ) -> int:
      """Return the count of pixels turned transparent. Writes RGBA PNG."""
      im = Image.open(src_path).convert("RGBA")
      width, height = im.size
      pix = im.load()
      bg = _corner_bg_color(pix, width, height)

      visited = bytearray(width * height)
      queue: deque[tuple[int, int]] = deque()

      def seed(x: int, y: int) -> None:
          idx = y * width + x
          if visited[idx]:
              return
          if _close(pix[x, y], bg, threshold):
              visited[idx] = 1
              queue.append((x, y))

      for x in range(width):
          seed(x, 0)
          seed(x, height - 1)
      for y in range(height):
          seed(0, y)
          seed(width - 1, y)

      removed = 0
      while queue:
          x, y = queue.popleft()
          r, g, b, _ = pix[x, y]
          pix[x, y] = (r, g, b, 0)
          removed += 1
          for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
              if 0 <= nx < width and 0 <= ny < height:
                  idx = ny * width + nx
                  if not visited[idx] and _close(pix[nx, ny], bg, threshold):
                      visited[idx] = 1
                      queue.append((nx, ny))

      Path(out_path).parent.mkdir(parents=True, exist_ok=True)
      im.save(out_path)
      return removed


  def main() -> None:
      parser = argparse.ArgumentParser(description="Remove near-solid background from a render.")
      parser.add_argument("src")
      parser.add_argument("out")
      parser.add_argument("--threshold", type=int, default=18)
      args = parser.parse_args()
      removed = remove_bg(args.src, args.out, threshold=args.threshold)
      print(f"removed {removed} background pixels -> {args.out}")


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 4: 跑测试，确认通过**

  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_remove_bg.py -q
  ```
  期望:`2 passed`。

- [ ] **Step 5: Commit**
  ```bash
  git add scripts/art/remove_bg.py scripts/art/test_remove_bg.py
  git commit -m "feat: 🧩 add remove-bg.py (PIL edge-flood transparency for single renders)"
  ```

---

### Task 2: [M1c] scale-to-frame.py — LANCZOS 缩放 + 居中到高清帧(TDD)

第二步:输入 `nobg/<asset>.png`(已去背),读目标尺寸(来自 dungeon.json 帧规格,或显式传 w/h),LANCZOS 等比缩放主体 + 居中到目标画布 → `scaled/<frame>.png`。**用 LANCZOS(下采样更优,不走 BOX,不走 block_pixel_art)**。先写失败测试。

**Files:**
- Create: `scripts/art/scale_to_frame.py`
- Test: `scripts/art/test_scale_to_frame.py`

- [ ] **Step 1: 写失败测试** — 断言输出尺寸 = 目标尺寸、主体居中、用 LANCZOS(不糊成单色)。

  写 `scripts/art/test_scale_to_frame.py`:
  ```python
  import json
  from pathlib import Path

  from PIL import Image

  from scale_to_frame import scale_to_frame, target_from_atlas_json


  def _make_subject(path: Path) -> None:
      # 已去背：透明底 + 80x40 红色主体（非方形，验证等比 letterbox）
      im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
      for y in range(44, 84):
          for x in range(24, 104):
              im.putpixel((x, y), (220, 30, 30, 255))
      im.save(path)


  def test_output_is_exact_target_size(tmp_path: Path) -> None:
      src = tmp_path / "nobg.png"
      out = tmp_path / "scaled.png"
      _make_subject(src)
      scale_to_frame(str(src), str(out), 64, 96)
      assert Image.open(out).size == (64, 96)


  def test_subject_centered(tmp_path: Path) -> None:
      src = tmp_path / "nobg.png"
      out = tmp_path / "scaled.png"
      _make_subject(src)
      scale_to_frame(str(src), str(out), 64, 96)
      bbox = Image.open(out).convert("RGBA").getchannel("A").getbbox()
      assert bbox is not None
      left, top, right, bottom = bbox
      # 水平方向左右留白近似相等（居中），容差 2px
      assert abs(left - (64 - right)) <= 2, f"not horizontally centered: {bbox}"


  def test_not_blurred_to_flat(tmp_path: Path) -> None:
      # 缩放后主体内部仍是红色（LANCZOS 不应糊成均值灰）
      src = tmp_path / "nobg.png"
      out = tmp_path / "scaled.png"
      _make_subject(src)
      scale_to_frame(str(src), str(out), 64, 96)
      res = Image.open(out).convert("RGBA")
      cr, cg, cb, ca = res.getpixel((32, 48))
      assert ca > 200 and cr > 150 and cg < 100, f"subject washed out: {(cr, cg, cb, ca)}"


  def test_target_from_atlas_json(tmp_path: Path) -> None:
      js = tmp_path / "dungeon.json"
      js.write_text(json.dumps({
          "frames": {"knight_m_idle_anim_f0.png": {"frame": {"x": 0, "y": 0, "w": 64, "h": 96}}}
      }))
      assert target_from_atlas_json(str(js), "knight_m_idle_anim_f0") == (64, 96)
      assert target_from_atlas_json(str(js), "knight_m_idle_anim_f0.png") == (64, 96)
  ```

- [ ] **Step 2: 跑测试，确认失败**
  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_scale_to_frame.py -q
  ```
  期望:`ModuleNotFoundError: No module named 'scale_to_frame'`(红)。

- [ ] **Step 3: 实现 scale_to_frame.py**
  ```python
  #!/usr/bin/env python3
  """Scale a background-free render into an exact HD atlas frame size.

  Trims to the alpha bbox, LANCZOS-resizes the subject to fit (preserving aspect
  ratio), then centres it on a transparent canvas of the target frame size.
  LANCZOS is used because it down-samples HD source far more cleanly than the
  legacy BOX + block_pixel_art path (which was the main blur source).
  """

  from __future__ import annotations

  import argparse
  import json
  from pathlib import Path

  from PIL import Image


  def target_from_atlas_json(json_path: str, frame: str) -> tuple[int, int]:
      data = json.loads(Path(json_path).read_text())
      key = frame if frame.endswith(".png") else f"{frame}.png"
      entry = data["frames"][key]["frame"]
      return (entry["w"], entry["h"])


  def scale_to_frame(
      src_path: str,
      out_path: str,
      target_w: int,
      target_h: int,
      *,
      pad: int = 0,
  ) -> tuple[int, int]:
      """Scale + centre into (target_w, target_h). Returns the resized subject size."""
      im = Image.open(src_path).convert("RGBA")
      bbox = im.getchannel("A").getbbox()
      subject = im.crop(bbox) if bbox is not None else im

      avail_w = max(1, target_w - 2 * pad)
      avail_h = max(1, target_h - 2 * pad)
      scale = min(avail_w / subject.width, avail_h / subject.height)
      new_w = max(1, min(avail_w, round(subject.width * scale)))
      new_h = max(1, min(avail_h, round(subject.height * scale)))
      resized = subject.resize((new_w, new_h), Image.Resampling.LANCZOS)

      canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
      canvas.alpha_composite(
          resized,
          ((target_w - new_w) // 2, (target_h - new_h) // 2),
      )
      Path(out_path).parent.mkdir(parents=True, exist_ok=True)
      canvas.save(out_path)
      return (new_w, new_h)


  def main() -> None:
      parser = argparse.ArgumentParser(description="Scale a render into an HD atlas frame.")
      parser.add_argument("src")
      parser.add_argument("out")
      group = parser.add_mutually_exclusive_group(required=True)
      group.add_argument("--size", nargs=2, type=int, metavar=("W", "H"))
      group.add_argument("--from-atlas", nargs=2, metavar=("DUNGEON_JSON", "FRAME"))
      parser.add_argument("--pad", type=int, default=0)
      args = parser.parse_args()

      if args.from_atlas:
          target_w, target_h = target_from_atlas_json(args.from_atlas[0], args.from_atlas[1])
      else:
          target_w, target_h = args.size

      w, h = scale_to_frame(args.src, args.out, target_w, target_h, pad=args.pad)
      print(f"scaled subject {w}x{h} into {target_w}x{target_h} -> {args.out}")


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 4: 跑测试，确认通过**
  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_scale_to_frame.py -q
  ```
  期望:`4 passed`。

- [ ] **Step 5: Commit**
  ```bash
  git add scripts/art/scale_to_frame.py scripts/art/test_scale_to_frame.py
  git commit -m "feat: 🧩 add scale-to-frame.py (LANCZOS scale+centre to HD frame)"
  ```

---

### Task 3: [M1c] apply-gpt-image-overrides.py — Override 新字段 + individual-render 分支(TDD)

给 `Override` TypedDict 加 `method` / `renderSourcePath`(`scripts/art/apply-gpt-image-overrides.py:23-31`);在 `apply_pack`(`:1189-1243`)加 `individual-render` 分支:**直接读 scaled PNG,不裁网格、不 cleanup、不糊化**。先写失败测试(把脚本作模块 import,用临时 atlas + scaled PNG 验证 individual-render 帧不糊)。

**Files:**
- Modify: `scripts/art/apply-gpt-image-overrides.py:23-31`(TypedDict)、`:1189-1243`(apply_pack 分支)
- Test: `scripts/art/test_individual_render.py`

- [ ] **Step 1: 先确认脚本可被 import(连字符文件名)** — 已知文件名是 `apply-gpt-image-overrides.py`,Python 无法直接 `import`。测试用 `importlib` 按路径加载。先写失败测试:

  写 `scripts/art/test_individual_render.py`:
  ```python
  import importlib.util
  import json
  from pathlib import Path

  from PIL import Image

  _SPEC = importlib.util.spec_from_file_location(
      "apply_gpt_image_overrides",
      Path(__file__).parent / "apply-gpt-image-overrides.py",
  )
  apply_mod = importlib.util.module_from_spec(_SPEC)
  _SPEC.loader.exec_module(apply_mod)


  def test_load_individual_render_centers_into_target():
      # 64x64 透明底 + 中心红块（模拟 scaled 输出），目标 64x96
      render = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
      for y in range(20, 44):
          for x in range(20, 44):
              render.putpixel((x, y), (220, 30, 30, 255))
      out = apply_mod.load_individual_render(render, (64, 96))
      assert out.size == (64, 96)
      # 主体应被居中且保留（不糊成单色）
      cr, cg, cb, ca = out.getpixel((32, 48))
      # 居中后 64x64 内容贴入 64x96，中心 y≈32+16 偏移；取保守采样点
      assert out.getchannel("A").getbbox() is not None


  def test_individual_render_not_blurred(tmp_path: Path):
      # 端到端：临时 pack with 1 individual-render frame，断言写入 atlas 后主体仍清晰
      render = Image.new("RGBA", (40, 60), (0, 0, 0, 0))
      for y in range(10, 50):
          for x in range(8, 32):
              render.putpixel((x, y), (220, 30, 30, 255))
      render_path = tmp_path / "scaled" / "hero.png"
      render_path.parent.mkdir(parents=True)
      render.save(render_path)

      sprite = apply_mod.load_individual_render(
          Image.open(render_path).convert("RGBA"), (40, 60)
      )
      # individual-render 路径：stylize 用 hd 模式，finalize 不糊化
      sprite = apply_mod.stylize_runtime_sprite(sprite, "characters", "hero", hd=True)
      sprite = apply_mod.finalize_runtime_sprite(sprite, "characters", hd=True)
      # 主体区域仍为红色系（未被 mix_toward_average 糊成均值）
      cr, cg, cb, ca = sprite.getpixel((20, 30))
      assert ca > 0, "subject erased"
      assert cr > cg and cr > cb, f"subject color washed: {(cr, cg, cb)}"


  def test_override_typeddict_has_new_fields():
      anns = apply_mod.Override.__annotations__
      assert "method" in anns
      assert "renderSourcePath" in anns
  ```

- [ ] **Step 2: 跑测试,确认失败**
  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_individual_render.py -q
  ```
  期望:`AttributeError: module ... has no attribute 'load_individual_render'` 或 TypedDict 缺字段(红)。

- [ ] **Step 3: 加 Override 新字段** — 改 `scripts/art/apply-gpt-image-overrides.py:23-31`:

  ```python
  class Override(TypedDict, total=False):
      category: str
      sourceSheet: str
      sourceCell: int
      sourceCols: int
      sourceRows: int
      cleanup: str
      variant: str
      frame: str
      method: str  # 'source-sheet-cell-fit' | 'individual-render'
      renderSourcePath: str  # individual-render: path (relative to project root) to a scaled PNG
  ```

- [ ] **Step 4: 加 `load_individual_render` + 给 stylize/finalize 加 hd 参数** — 在 `fitted_cell`(`:1146`)附近新增:

  ```python
  def load_individual_render(
      render: Image.Image,
      target_size: tuple[int, int],
  ) -> Image.Image:
      """individual-render path: take an already-scaled transparent PNG and centre
      it onto the exact target frame. No grid crop, no cleanup, no blur."""
      render = render.convert("RGBA")
      target_w, target_h = target_size
      if render.size == target_size:
          return render
      bbox = render.getchannel("A").getbbox()
      subject = render.crop(bbox) if bbox is not None else render
      scale = min(target_w / subject.width, target_h / subject.height)
      new_w = max(1, min(target_w, round(subject.width * scale)))
      new_h = max(1, min(target_h, round(subject.height * scale)))
      resized = subject.resize((new_w, new_h), Image.Resampling.LANCZOS)
      out = Image.new("RGBA", target_size, (0, 0, 0, 0))
      out.alpha_composite(resized, ((target_w - new_w) // 2, (target_h - new_h) // 2))
      return out
  ```

- [ ] **Step 5: 去糊化 + hd 参数化 stylize/finalize/boost/harden** — 改 `:1004-1143` 一组函数。

  `harden_pixel_art`(`:1004`)加可调 alpha 阈值:
  ```python
  def harden_pixel_art(sprite: Image.Image, *, alpha_threshold: int = 64) -> Image.Image:
      out = sprite.copy()
      pix = out.load()
      width, height = out.size
      for y in range(height):
          for x in range(width):
              r, g, b, a = pix[x, y]
              if a < alpha_threshold:
                  pix[x, y] = (0, 0, 0, 0)
                  continue
              pix[x, y] = (quantize_channel(r), quantize_channel(g), quantize_channel(b), 255)
      return out
  ```

  `boost_small_sprite_contrast`(`:1023`)加 hd 模式(高清输入下调增强):
  ```python
  def boost_small_sprite_contrast(sprite: Image.Image, *, hd: bool = False) -> Image.Image:
      alpha = sprite.getchannel("A")
      rgb = Image.new("RGB", sprite.size, (0, 0, 0))
      rgb.paste(sprite.convert("RGB"), mask=alpha)
      # HD 单体输入已清晰：对比度 1.55->1.25，避免过度增强毛糙
      rgb = ImageEnhance.Contrast(rgb).enhance(1.25 if hd else 1.55)
      rgb = ImageEnhance.Color(rgb).enhance(1.12 if hd else 1.18)
      rgb = ImageEnhance.Brightness(rgb).enhance(1.04 if hd else 1.06)
      out = rgb.convert("RGBA")
      out.putalpha(alpha)
      return out
  ```

  `reduce_environment_noise`(`:1117`)**去掉 block_pixel_art,mix 权重大降**(这是糊的主因):
  ```python
  def reduce_environment_noise(sprite: Image.Image, frame_name: str, *, hd: bool = False) -> Image.Image:
      frame = frame_name.removesuffix(".png")
      if hd:
          # HD individual-render：取消 block_pixel_art（均值滤波），只保留极轻微 cohesion
          out = sprite
          if frame.startswith(("floor", "ground", "grass", "edge")) or frame == "hole":
              return mix_toward_average(out, 0.10)
          if frame.startswith(("wall", "doors", "column")):
              return mix_toward_average(out, 0.08)
          return mix_toward_average(out, 0.06)
      # legacy grid path 保持原行为
      out = block_pixel_art(sprite, 2)
      if frame.startswith(("floor", "ground", "grass", "edge")) or frame == "hole":
          return mix_toward_average(out, 0.46)
      if frame.startswith(("wall", "doors", "column")):
          return mix_toward_average(out, 0.28)
      return mix_toward_average(out, 0.18)
  ```

  `stylize_runtime_sprite`(`:1127`)+ `finalize_runtime_sprite`(`:1139`)透传 hd:
  ```python
  def stylize_runtime_sprite(sprite: Image.Image, category: str, frame_name: str, *, hd: bool = False) -> Image.Image:
      if category == "environment":
          return reduce_environment_noise(sprite, frame_name, hd=hd)
      if category in {"characters", "enemies", "bosses", "props", "easter", "hud", "ui"}:
          return boost_small_sprite_contrast(sprite, hd=hd)
      return sprite


  def finalize_runtime_sprite(sprite: Image.Image, category: str, *, hd: bool = False) -> Image.Image:
      # HD 输入抗锯齿边缘半透明更多，alpha 阈值 64->96 避免误杀边缘
      hardened = harden_pixel_art(sprite, alpha_threshold=96 if hd else 64)
      if category in {"characters", "enemies", "bosses", "props", "easter", "hud", "ui"}:
          return add_readability_outline(hardened)
      return hardened
  ```

  > 注:`0.06~0.10` mix 权重、`1.25` 对比度、`96` alpha 阈值是**有依据的起步值**(spec §10 风险表:`mix 0.46→0.08~0.15`;bake-2x risk:contrast 1.55 过度、alpha<64 误杀边缘)。**M2 调参 preview 视觉验证后定最终值**,不锁死。

- [ ] **Step 6: apply_pack 加 individual-render 分支** — 改 `:1202-1243` 循环体,识别 `method=='individual-render'` 走新路径:

  把 `:1209-1243` 替换为(保留 source-sheet 旧路径,新增分支):
  ```python
      for override in OVERRIDES:
          key = frame_key(override["frame"])
          entry = frames.get(key)
          if not entry:
              missing.append(override["frame"])
              continue

          frame = entry["frame"]
          target_size = (frame["w"], frame["h"])
          method = override.get("method", "source-sheet-cell-fit")

          if method == "individual-render":
              render_rel = override["renderSourcePath"]
              render_img = Image.open(render_rel).convert("RGBA")
              sprite = load_individual_render(render_img, target_size)
              sprite = apply_variant(sprite, override.get("variant"))
              sprite = stylize_runtime_sprite(sprite, override["category"], override["frame"], hd=True)
              sprite = finalize_runtime_sprite(sprite, override["category"], hd=True)
              method_label = "individual-render"
          else:
              source_sheet = override["sourceSheet"]
              source = source_cache.get(source_sheet)
              if source is None:
                  source = Image.open(pack_root / source_sheet).convert("RGBA")
                  source_cache[source_sheet] = source
              sprite = fitted_cell(
                  source,
                  override["sourceCell"],
                  target_size,
                  override.get("sourceCols", 4),
                  override.get("sourceRows", 4),
                  override.get("cleanup"),
              )
              sprite = apply_variant(sprite, override.get("variant"))
              sprite = stylize_runtime_sprite(sprite, override["category"], override["frame"])
              sprite = finalize_runtime_sprite(sprite, override["category"])
              method_label = "source-sheet-cell-fit"

          atlas.paste(Image.new("RGBA", target_size, (0, 0, 0, 0)), (frame["x"], frame["y"]))
          atlas.alpha_composite(sprite, (frame["x"], frame["y"]))
          covered.append(
              {
                  **override,
                  "method": method_label,
                  "targetSize": {"w": target_size[0], "h": target_size[1]},
              }
          )
  ```

  > 报告顶层的 `"method": "source-sheet-cell-fit"`(`:1273`)保持不变(代表 pack 的主方法);逐帧 `method` 已在 `covered` 里区分,json 报告天然兼容新旧混用。

- [ ] **Step 7: 跑测试,确认通过**
  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest test_individual_render.py -q
  ```
  期望:`3 passed`。

- [ ] **Step 8: 跑全部 art 脚本单测 + 校验脚本未回归** — 确认改动没破坏旧 source-sheet 路径的可导入性/语法:
  ```bash
  cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest -q && /usr/bin/python3 -c "import importlib.util,pathlib; s=importlib.util.spec_from_file_location('m', pathlib.Path('apply-gpt-image-overrides.py')); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print('import ok; OVERRIDES len', len(m.OVERRIDES))"
  ```
  期望:`9 passed`(2+4+3) + `import ok; OVERRIDES len <N>`(无异常)。

- [ ] **Step 9: Commit**
  ```bash
  git add scripts/art/apply-gpt-image-overrides.py scripts/art/test_individual_render.py
  git commit -m "feat: 🧩 add individual-render bake path + de-blur (drop block_pixel_art, HD stylize)"
  ```

---

### Task 4: [M1c] gen-out 目录占位 + .gitignore 大图产物(收尾)

`gen-out/<theme>/{raw,nobg,scaled}/` 是出图中间产物(M2/M3 codex 写入),不该把大量临时 PNG 提交进仓库,但目录契约要在仓里有据可查。加 `.gitkeep` + `.gitignore` 规则。

**Files:**
- Create: `scripts/art/gen-out/.gitignore`、`scripts/art/gen-out/README.md`

- [ ] **Step 1: 建目录契约 + ignore PNG**

  ```bash
  mkdir -p /Users/poco/Projects/Roguent/scripts/art/gen-out
  ```

  写 `scripts/art/gen-out/.gitignore`:
  ```gitignore
  # Intermediate bake artifacts (codex renders + de-bg + scaled). Not source of truth.
  # The final art lives baked into public/assets/artpacks/<theme>/atlas/dungeon.png.
  */raw/
  */nobg/
  */scaled/
  *.png
  !.gitkeep
  ```

  写 `scripts/art/gen-out/README.md`:
  ```markdown
  # gen-out — bake pipeline staging

  Per-theme staging for the single-render bake pipeline (theme ∈ cyber | lofi):

  ```
  gen-out/<theme>/raw/<asset>.png     # codex single render (gpt-image-2), ~1024px
  gen-out/<theme>/nobg/<asset>.png    # after remove_bg.py (transparent bg)
  gen-out/<theme>/scaled/<frame>.png  # after scale_to_frame.py (exact HD frame size)
  ```

  Then `apply-gpt-image-overrides.py` reads the scaled PNG via an
  `individual-render` override (`renderSourcePath` → `scaled/<frame>.png`) and
  bakes it into `atlas/dungeon.png` with the HD (no-blur) stylize path.

  These PNGs are intermediate and git-ignored; the baked atlas is the artifact.
  ```

- [ ] **Step 2: 确认 git 看得到目录(非空)且 PNG 被忽略**
  ```bash
  cd /Users/poco/Projects/Roguent && git add scripts/art/gen-out/.gitignore scripts/art/gen-out/README.md && git status --porcelain scripts/art/gen-out/
  ```
  期望:列出 `.gitignore` 和 `README.md` 两个新文件(A 状态)。

- [ ] **Step 3: Commit**
  ```bash
  git add scripts/art/gen-out/.gitignore scripts/art/gen-out/README.md
  git commit -m "chore: 🧹 add gen-out staging contract (.gitignore + README)"
  ```

---

### 验收(milestone 级,整合后跑)

- [ ] **全 art 单测绿**:`cd /Users/poco/Projects/Roguent/scripts/art && /usr/bin/python3 -m pytest -q` → `9 passed`。
- [ ] **脚本可导入无语法错**:Task 3 Step 8 的 import 自检通过。
- [ ] **门禁(TS 侧不受影响,确认无连带破坏)**:`bun test`(art Python 测试不在 bun:test 范围,但确认 TS 测试仍绿)。
- [ ] **注意**:本 milestone **只实现 individual-render 能力 + 去糊化 + 两个新脚本**,不批量出图、不改 OVERRIDES 真实条目(那是 M2)。真实端到端"出图→去背→缩放→烘焙→渲染"在 M2/M3 用真实素材跑通并 preview 验证最终调参值。



---

# Milestone M2 / M3 / M4 — 批量出图 + 视觉验证

> **本 milestone 前置依赖(由 M0/M1 完成,不在本块范围,但本块每个 Task 都假设它们已就位)**:
> - M0/M1 已落地 `.claude/skills/codex-gpt-image/SKILL.md`(computer-use 驱动 codex 桌面端 gpt-image-2 单体出图,Cmd+N 开新对话已验证可用,能把图 shell 写到指定项目绝对路径)。
> - M1 已改 `scripts/art/apply-gpt-image-overrides.py`:`PACKS` 追加 `"cyber"`/`"lofi"`;`Override` 新增字段 `method: 'source-sheet-cell-fit'|'individual-render'` + `renderSourcePath: str`;`apply_pack` 加 `individual-render` 分支(直接读单体 scaled PNG,**取消/大幅降低** `reduce_environment_noise` 糊化);新增 `scripts/art/remove-bg.py`、`scripts/art/scale-to-frame.py`。
> - M1 已改 `src/web/hud/artpack.ts`:`ART_PACKS` 追加 `cyber`/`lofi`(`ready=true`),`DEFAULT_ARTPACK='cyber'`,`pixel-fantasy` 从 Settings 隐藏;`src/web/App.tsx` 把当前 `artpack.ac` 写进根节点 `--ac`(初始化 + `ARTPACK_CHANGE_EVENT`)。
> - M1 已把 `public/assets/artpacks/{cyber,lofi}/atlas/dungeon.json` 升到高清帧档(起步值:TILE 16→40 档,角色 64–96px / 瓦片 32–48px / Boss ~144px;**精确倍率本块 §M2 调参 preview 验证后定**),并备齐 `REQUIRED_ARTPACK_FILES` 全部占位文件(空占位 atlas 由本块出图烘焙覆盖)。
>
> 本 milestone(M2/M3/M4)= **批量出图 → 烘焙 → 视觉验证 → 删旧 → 门禁**。出图与 preview 是**操作性**(skill + computer-use + 证据),删旧+门禁可脚本化。

---

### Task 1: [M2] cyber 出图素材清单 + Style Anchor(knight_m)基准图

**Files:**
- Reference (read only): `scripts/art/prompts.ts`(`ASSETS` 30 项 / `STYLE_PREFIX` / `FRAMING` / `AVOID` / `assemblePrompt`)
- Reference (read only): `scripts/art/apply-gpt-image-overrides.py`(`OVERRIDE_MAP` 帧别名 → asset)
- Skill (consume): `.claude/skills/codex-gpt-image/SKILL.md`
- Output dir: `scripts/art/gen-out/cyber/raw/`

**出图素材清单(asset → prompt 组装 → 目标帧名)** — 30 个核心独立素材,prompt 一律用 `assemblePrompt("cyber", <asset>)`(= `STYLE_PREFIX.cyber` + `ASSETS[asset].body.cyber` + `FRAMING[category]` + `AVOID`),出到 `gen-out/cyber/raw/<asset>.png`。帧名来自 `OVERRIDE_MAP`(多帧/边块/别名复用同一 raw):

| # | asset | category | size | 目标帧名(OVERRIDE_MAP 反查,raw 复用) |
| --- | --- | --- | --- | --- |
| 1 | knight_m | character | 1024×1536 | knight_m_*(Anchor) |
| 2 | knight_f | character | 1024×1536 | knight_f_* |
| 3 | wizzard_m | character | 1024×1536 | wizzard_m_* |
| 4 | wizzard_f | character | 1024×1536 | wizzard_f_* |
| 5 | elf_m | character | 1024×1536 | elf_m_* |
| 6 | elf_f | character | 1024×1536 | elf_f_* |
| 7 | dwarf_m | character | 1024×1536 | dwarf_m_* |
| 8 | dwarf_f | character | 1024×1536 | dwarf_f_* |
| 9 | lizard_m | character | 1024×1536 | lizard_m_* |
| 10 | lizard_f | character | 1024×1536 | lizard_f_* |
| 11 | goblin | character | 1024×1536 | goblin_* |
| 12 | angel | character | 1024×1536 | angel_* |
| 13 | floor_1 | tile | 1024×1024 | floor_1 + edge-tl/tr/bl/br/top/bottom/left/right |
| 14 | floor_2 | tile | 1024×1024 | floor_2 |
| 15 | floor_3 | tile | 1024×1024 | floor_3 |
| 16 | grass | tile | 1024×1024 | grass |
| 17 | wall_mid | tile | 1024×1024 | wall_mid |
| 18 | wall_top | tile | 1024×1024 | wall_top_mid |
| 19 | banner | prop | 1024×1024 | wall_banner_blue/green/yellow |
| 20 | fountain_top | prop | 1024×1024 | wall_fountain_top_1 |
| 21 | fountain_mid | prop | 1024×1024 | wall_fountain_mid_blue_anim_f0 |
| 22 | fountain_basin | prop | 1024×1024 | wall_fountain_basin_blue_anim_f0 |
| 23 | crate | prop | 1024×1024 | crate |
| 24 | skull | prop | 1024×1024 | skull |
| 25 | flask | prop | 1024×1024 | flask_big_green/blue/red |
| 26 | coin | prop | 1024×1024 | coin_anim_f0..f3 |
| 27 | chest_empty | prop | 1024×1024 | chest_empty_open_anim_f0 |
| 28 | chest_full | prop | 1024×1024 | chest_full_open_anim_f0/f1, chest_mimic_open_anim_f1 |
| 29 | door_frame | prop | 1024×1024 | doors_frame_top |
| 30 | door_leaf | prop | 1024×1024 | doors_leaf_closed |

> 说明:381 atlas 帧由这 30 个 raw 经 `OVERRIDE_MAP` 复用展开(多帧资产先出 1 张基准,烘焙时填 anim 帧 = 伪动画);敌人/Boss/结构/彩蛋/HUD/UI 帧名在 `OVERRIDE_MAP` 中已映射到上述 30 个 asset 之一,无独立 raw。

- [ ] **Step 1: 校验 prompt 组装可跑、30 asset 齐**
  ```bash
  cd /Users/poco/Projects/Roguent && bun -e '
  import { ASSETS, assemblePrompt } from "./scripts/art/prompts.ts";
  const ids = Object.keys(ASSETS);
  console.log("asset count:", ids.length);
  console.log("--- knight_m cyber prompt ---");
  console.log(assemblePrompt("cyber", "knight_m"));
  '
  ```
  期望:`asset count: 30`,并打印出含 `Cyberpunk neon-on-dark vibe-coding WORKSPACE` + `Orchestrator hooded operator` + `Full body chibi character` + `avoid:` 的完整 prompt。若 ≠30 或抛错,停止并回报(说明 M0/M1 的 prompts.ts 与本清单不一致)。

- [ ] **Step 2: 出 Style Anchor 基准图(knight_m,一致性闸门)**
  调用 codex-gpt-image skill,单 job:
  ```
  jobs = [{
    prompt: <Step 1 打印的 assemblePrompt("cyber","knight_m")>,
    outPath: "/Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/knight_m.png",
    size: "1024x1536"
  }]
  ```
  验收:`ls -la scripts/art/gen-out/cyber/raw/knight_m.png` 存在且 > 50KB;`Read` 该 PNG 目视确认是「连帽 orchestrator、青色电路镶边、全身 chibi、近透明底、清晰不糊」。**证据**:贴该图 Read 结果。这是 2026-06-08 §6.3 的 Style Anchor —— 风格/配色/光照/像素密度以它为基准。

- [ ] **Step 3: Anchor 不满意则迭代(闸门)**
  若 Step 2 图糊 / 像插画 / 偏地牢 / 比例错,改 prompt 局部(不动 STYLE_PREFIX,微调 body 描述如加 `crisp clean defined pixels, NOT smooth illustration`)重出,直到清晰可读且符合 cyber vibe-coding 工作空间。满意为止;**不满意不进 Step 4**(避免整套跑偏返工)。

- [ ] **Step 4: Commit anchor**
  ```bash
  git add scripts/art/gen-out/cyber/raw/knight_m.png && git commit -m "feat: 🧩 cyber Style Anchor (knight_m) generated"
  ```

---

### Task 2: [M2] cyber 剩余 29 素材批量出图 → gen-out/cyber/raw/

**Files:**
- Skill (consume): `.claude/skills/codex-gpt-image/SKILL.md`
- Output dir: `scripts/art/gen-out/cyber/raw/`(Task 1 已建,含 knight_m.png)

- [ ] **Step 1: 生成全部 30 个 job 描述(打印备查)**
  ```bash
  cd /Users/poco/Projects/Roguent && bun -e '
  import { ASSETS, assemblePrompt } from "./scripts/art/prompts.ts";
  const sizeOf = (c:string)=> c==="character" ? "1024x1536" : "1024x1024";
  const jobs = Object.entries(ASSETS).map(([asset, e]) => ({
    asset,
    size: sizeOf(e.category),
    outPath: `/Users/poco/Projects/Roguent/scripts/art/gen-out/cyber/raw/${asset}.png`,
    prompt: assemblePrompt("cyber", asset),
  }));
  console.log(JSON.stringify(jobs, null, 2));
  '
  ```
  期望:打印 30 条 job;character 类 size=`1024x1536`,tile/prop 类 size=`1024x1024`。

- [ ] **Step 2: skill 批量出剩余 29 张(喂 anchor 作参考保持一致)**
  调用 codex-gpt-image skill,jobs = Step 1 的 30 条中**去掉 knight_m**(已出)的 29 条。按 2026-06-08 §6.3 一致性机制:在 skill prompt 里附「参考已生成的 `gen-out/cyber/raw/knight_m.png` 的配色/光向/像素密度」语义(若 skill 支持参考图输入则喂 knight_m.png;不支持则在 prompt 文本里要求同一 cyber 调性)。skill 内部对每个 job:Cmd+N 新对话 → type 复合 prompt(含 `用内置 image_gen 生成 + shell 写到 outPath + 完成回 DONE`)→ Enter → 轮询 outPath 出现且大小稳定。

- [ ] **Step 3: 校验 30 张 raw 齐全**
  ```bash
  cd /Users/poco/Projects/Roguent && bun -e '
  import { ASSETS } from "./scripts/art/prompts.ts";
  import { existsSync, statSync } from "node:fs";
  const dir = "scripts/art/gen-out/cyber/raw";
  let missing = 0;
  for (const a of Object.keys(ASSETS)) {
    const p = `${dir}/${a}.png`;
    const ok = existsSync(p) && statSync(p).size > 20000;
    if (!ok) { console.log("MISSING/SMALL:", a); missing++; }
  }
  console.log(missing === 0 ? "ALL 30 OK" : `MISSING ${missing}`);
  '
  ```
  期望:`ALL 30 OK`。任何缺/过小 → 对该 asset 单独重跑 Step 2 的 skill job。

- [ ] **Step 4: 抽查 4 张目视清晰度 + 风格一致**
  `Read` 4 张代表(`floor_1.png`、`fountain_mid.png`、`crate.png`、`angel.png`):确认清晰不糊、近透明/纯色底、与 knight_m 同一 cyber 冷色调。**证据**:贴 4 张 Read 结果。明显偏色/糊的单独重出。

- [ ] **Step 5: Commit cyber raw**
  ```bash
  git add scripts/art/gen-out/cyber/raw && git commit -m "feat: 🧩 generate full cyber raw asset set (30 sprites)"
  ```

---

### Task 3: [M2] cyber 去背 → 缩放 → 烘焙进 atlas

**Files:**
- Run: `scripts/art/remove-bg.py`(M1 新增)→ `gen-out/cyber/nobg/`
- Run: `scripts/art/scale-to-frame.py`(M1 新增)→ `gen-out/cyber/scaled/`
- Run: `scripts/art/apply-gpt-image-overrides.py --pack cyber`(M1 已加 cyber 到 PACKS + individual-render 分支)
- Modify (bake output): `public/assets/artpacks/cyber/atlas/dungeon.png`、`public/assets/artpacks/cyber/atlas/gpt-image-overrides.json`

- [ ] **Step 1: 去背 → nobg/**
  ```bash
  cd /Users/poco/Projects/Roguent && python3 scripts/art/remove-bg.py --theme cyber
  ls scripts/art/gen-out/cyber/nobg/ | wc -l
  ```
  期望:输出 30 个透明底 PNG。若脚本对纯色底去背残留边缘,调 alpha 阈值参数(remove-bg.py 的边界检测阈值)重跑。

- [ ] **Step 2: 缩放到高清帧规格 → scaled/**
  ```bash
  cd /Users/poco/Projects/Roguent && python3 scripts/art/scale-to-frame.py --theme cyber
  ls scripts/art/gen-out/cyber/scaled/ | wc -l
  ```
  期望:输出每个目标帧名的 scaled PNG(读 `public/assets/artpacks/cyber/atlas/dungeon.json` 的目标尺寸,LANCZOS 缩放 + 居中)。脚本用 LANCZOS(下采样更优),**不走** `block_pixel_art` 糊化。

- [ ] **Step 3: 烘焙进 atlas(individual-render,去糊化)**
  ```bash
  cd /Users/poco/Projects/Roguent && python3 scripts/art/apply-gpt-image-overrides.py --pack cyber
  ```
  期望:打印 `cyber: 381 frames from ...`;`public/assets/artpacks/cyber/atlas/dungeon.png` 时间戳更新、体积随高清档增大;`gpt-image-overrides.json` 重生(`method='individual-render'` + `renderSourcePath` 字段)。

- [ ] **Step 4: 自动校验帧契约 + 像素硬度**
  ```bash
  cd /Users/poco/Projects/Roguent && bun run verify:artpack
  ```
  期望:cyber 包过 `verify-artpack-cli`(381 帧、覆盖率、required files、帧尺寸契约)。若 `verifyAtlasFrameSizes` 因 reference 严格匹配失败,确认 M1 已建高清 reference 或宽松匹配;失败先回报(属 M1 契约缺口),不强行改 test。

- [ ] **Step 5: Commit cyber atlas**
  ```bash
  git add scripts/art/gen-out/cyber/nobg scripts/art/gen-out/cyber/scaled public/assets/artpacks/cyber/atlas/dungeon.png public/assets/artpacks/cyber/atlas/gpt-image-overrides.json && git commit -m "feat: 🧩 bake cyber raw set into high-res atlas (nobg+scale+individual-render)"
  ```

---

### Task 4: [M2] cyber preview 视觉验证 + 调倍率/去背参数

**Files:**
- Run app: `bun run dev:engine`(后台,固定 8787)+ `bun run dev:web`(后台,5173)
- Tune (按需): `public/assets/artpacks/cyber/atlas/dungeon.json` 帧尺寸 + 重跑 Task 3 链;`scripts/art/remove-bg.py` / `scale-to-frame.py` 参数

- [ ] **Step 1: 起 dev 服务(后台)**
  ```bash
  cd /Users/poco/Projects/Roguent && bun run dev:engine &
  cd /Users/poco/Projects/Roguent && bun run dev:web &
  ```
  等待 5173 可达:`until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done && echo "web up"`。

- [ ] **Step 2: preview 打开默认 cyber 大厅,截图**
  用 `mcp__Claude_Preview__preview_start`(url `http://localhost:5173`)→ `preview_screenshot`。验收:默认 artpack=cyber(根节点 `data-artpack="cyber"`),大厅地板/墙/门/任务台是 cyber 冷色霓虹素材、清晰不糊。**证据**:贴大厅截图。`preview_console_logs` 确认无 atlas 加载错误。

- [ ] **Step 3: 进内景房间,验角色/彩蛋/泡泡**
  preview 用 replay fixture 起一个会话(或点进已有会话)进内景:确认地块、主控小人(knight_m)、subagent 小人、扭蛋机/任务台彩蛋、工具泡泡都换成 cyber 素材且高清。**证据**:贴内景截图。

- [ ] **Step 4: 验 HUD 按钮 accent + 聊天窗口**
  截图确认 HUD 矢量图标的 accent 色 = cyber 的 `ac`(青/紫),聊天抽屉打开正常渲染。**证据**:贴 HUD/聊天截图 + `preview_eval` 读 `getComputedStyle(document.documentElement).getPropertyValue('--ac')` 应为 cyber.ac。

- [ ] **Step 5: 倍率/去背调参闭环(若不清晰)**
  若 Step 2–4 任一处仍糊 / 角色太小 / 去背残边:① 太糊→提 `dungeon.json` 帧尺寸(如角色 32×56→48×80)重跑 Task 3 链;② 残边→调 `remove-bg.py` 阈值重跑;③ 边缘锯齿→`scale-to-frame.py` 改 LANCZOS padding。每次调完重截图对比,直到「清晰不糊 + 房间布局合理 + 整数缩放」。**精确高清倍率在此步定死**并记录到 commit body。

- [ ] **Step 6: Commit 调参结果(若有改动)**
  ```bash
  git add public/assets/artpacks/cyber scripts/art/scale-to-frame.py scripts/art/remove-bg.py && git commit -m "fix: 🩹 tune cyber HD frame scale + remove-bg params after preview"
  ```
  commit body 记录最终帧尺寸档(如「角色 48×80 / 瓦片 40×40 / Boss 144×162」)。

---

### Task 5: [M3] lofi 全套出图 → 烘焙 → preview 验证

**Files:**
- Skill (consume): `.claude/skills/codex-gpt-image/SKILL.md`
- Output: `scripts/art/gen-out/lofi/{raw,nobg,scaled}/`
- Bake: `public/assets/artpacks/lofi/atlas/{dungeon.png,gpt-image-overrides.json}`
- Run: `remove-bg.py --theme lofi`、`scale-to-frame.py --theme lofi`、`apply-gpt-image-overrides.py --pack lofi`

> lofi 走与 cyber(Task 1–4)完全同构的链路,只换 theme=`lofi`(暖光·昼)。prompt = `assemblePrompt("lofi", <asset>)`。素材清单同 Task 1 的 30 行表(asset/帧名不变,body 取 `.body.lofi`)。

- [ ] **Step 1: lofi Style Anchor(knight_m)**
  打印 prompt 并出 anchor:
  ```bash
  cd /Users/poco/Projects/Roguent && bun -e 'import {assemblePrompt} from "./scripts/art/prompts.ts"; console.log(assemblePrompt("lofi","knight_m"));'
  ```
  skill 单 job 出 `gen-out/lofi/raw/knight_m.png`(`1024x1536`)。验收:`Read` 确认是「cozy hoodie + 耳机 + 咖啡、暖色光、清晰」。**证据**:贴 anchor Read。不满意先迭代(同 Task 1 Step 3 闸门)。

- [ ] **Step 2: lofi 剩余 29 素材批量出图(喂 lofi anchor 参考)**
  同 Task 2 Step 1–4:打印 30 job(theme=lofi)→ skill 出 29 张到 `gen-out/lofi/raw/` → 校验 `ALL 30 OK` → 抽查 4 张目视暖色一致。**证据**:贴抽查 4 张 Read。

- [ ] **Step 3: lofi 去背 → 缩放 → 烘焙**
  ```bash
  cd /Users/poco/Projects/Roguent && python3 scripts/art/remove-bg.py --theme lofi && python3 scripts/art/scale-to-frame.py --theme lofi && python3 scripts/art/apply-gpt-image-overrides.py --pack lofi && bun run verify:artpack
  ```
  期望:`lofi: 381 frames from ...`;verify:artpack 过 lofi 包。

- [ ] **Step 4: lofi preview 视觉验证**
  dev 服务仍在(Task 4 起的)→ preview `preview_eval` 设 `localStorage['roguent_artpack']='lofi'` + 触发 `roguent:artpack-changed` 事件(或经 Settings UI 切到 lofi)→ `preview_screenshot` 大厅+内景。验收:全场景换暖色 lofi 素材、清晰、accent=lofi.ac(暖黄/绿)、无报错。**证据**:贴 lofi 大厅+内景截图 + console 无错。不清晰则同 Task 4 Step 5 调参重烘焙。

- [ ] **Step 5: Commit lofi 全套**
  ```bash
  git add scripts/art/gen-out/lofi public/assets/artpacks/lofi/atlas/dungeon.png public/assets/artpacks/lofi/atlas/gpt-image-overrides.json && git commit -m "feat: 🧩 generate + bake full lofi art set with preview tuning"
  ```

---

### Task 6: [M4] 两套来回切幂等验证(无残留/无黑屏/accent 全局变)

**Files:**
- Run: dev 服务(Task 4 起的 8787/5173)
- Preview: `mcp__Claude_Preview__*`

- [ ] **Step 1: cyber → lofi → cyber 来回切**
  preview 依次:① 确认当前 cyber(`preview_eval` 读 `data-artpack` + `--ac`,截图);② 经 Settings ArtPackGroup 点 lofi 卡片(`preview_click`)→ 截图,断言全场景换皮、`--ac` 变 lofi.ac、无残留 cyber 素材;③ 再切回 cyber → 截图,断言回到 cyber 态且与 ① 一致(幂等)。**证据**:贴 3 张截图。

- [ ] **Step 2: 断言无加载失败黑屏(fallback)**
  `preview_console_logs` 全程无 atlas 加载红错;`preview_eval` 断言大厅 canvas 非全黑(取若干像素非 (0,0,0))、Room 无错误层 DOM。若某包 atlas 缺帧导致黑屏,说明烘焙不全 → 回 Task 3/5 补;`pixel-fantasy` fallback 仅防极端失败,不应在正常切换中露出。

- [ ] **Step 3: 确认 pixel-fantasy 在 Settings 隐藏、cyber/lofi 可见**
  `preview_eval` 读 Settings ArtPackGroup 渲染的卡片 id 列表:期望 `["cyber","lofi"]`,**不含** `pixel-fantasy` 与 4 个旧包。**证据**:贴 eval 输出。

- [ ] **Step 4: Commit(若验证中发现并修了切换 bug;纯验证无改动则跳过)**
  仅当本 Task 改了代码才提:`git add <精确文件> && git commit -m "fix: 🩹 <切换验证暴露的问题>"`。

---

### Task 7: [M4] 删 4 套旧包资源 + 同步 verify-artpack.test.ts

**Files:**
- Delete: `public/assets/artpacks/{neon-terminal,holo-blueprint,deep-space,synthwave}/`
- Modify: `scripts/art/verify-artpack.test.ts`(4 个硬编码 pack 循环 line 488/529/556/573 + 386 帧约束行)
- Modify (if remains): `scripts/art/apply-gpt-image-overrides.py:19`(`PACKS` 去掉 4 旧包,留 `cyber`/`lofi`)

- [ ] **Step 1: 先确认 cyber/lofi 完整再删旧(防误删唯一可用包)**
  ```bash
  cd /Users/poco/Projects/Roguent && for p in cyber lofi; do
    test -s "public/assets/artpacks/$p/atlas/dungeon.png" && echo "$p atlas OK" || echo "$p atlas MISSING";
  done
  bun run verify:artpack
  ```
  期望:两包 atlas OK 且 verify 过。**未过不删旧包**(否则无可用 artpack)。

- [ ] **Step 2: 删 4 套旧包目录**
  ```bash
  cd /Users/poco/Projects/Roguent && rm -rf public/assets/artpacks/neon-terminal public/assets/artpacks/holo-blueprint public/assets/artpacks/deep-space public/assets/artpacks/synthwave
  ls public/assets/artpacks/
  ```
  期望:只剩 `cyber  lofi`。

- [ ] **Step 3: 改 verify-artpack.test.ts 的 4 个 pack 循环 → cyber/lofi**
  把 4 处 `for (const pack of ["neon-terminal","holo-blueprint","deep-space","synthwave"])`(line 488/529/556/573 附近)全改为 `for (const pack of ["cyber", "lofi"])`。若高清档改了帧数/分类分布,同步 line 506–517 的 `atlasFrameCount`/`coveredFrameCount`/`coveredFramesByCategory`(以 M1 实际烘焙报告为准);若仍 381 帧则不动。`replace_all` 改前先 `bun test verify-artpack.test.ts 2>&1 | head` 看实际期望值。

- [ ] **Step 4: 改 apply 脚本 PACKS(若 M1 仍留旧包)**
  确认 `scripts/art/apply-gpt-image-overrides.py:19` 的 `PACKS`:应为 `("cyber", "lofi")`。若 M1 只追加未删旧,删掉 4 个旧 id(它们的源 sheet 已随目录删除,保留会让 `--pack neon-terminal` 报错)。

- [ ] **Step 5: 跑 verify-artpack 单测**
  ```bash
  cd /Users/poco/Projects/Roguent && bun test scripts/art/verify-artpack.test.ts
  ```
  期望:全绿,循环只跑 cyber/lofi。失败按报错对齐期望帧数/分类。

- [ ] **Step 6: Commit 删旧**
  ```bash
  git add public/assets/artpacks scripts/art/verify-artpack.test.ts scripts/art/apply-gpt-image-overrides.py && git commit -m "chore: 🧹 remove 4 legacy artpacks, point verify at cyber/lofi"
  ```

---

### Task 8: [M4] 门禁全绿(test + tsc + check + build)

**Files:**
- Run: `bun test`、`bunx tsc --noEmit`、`bun run check`、`bun run build`

- [ ] **Step 1: 全量单测**
  ```bash
  cd /Users/poco/Projects/Roguent && bun test 2>&1 | tail -30
  ```
  期望:0 fail。常见残留点:`artpack.test.ts`(长度/DEFAULT/ready 列表 — 应已 M1 改)、`artpack-assets.test.ts`(fallback → cyber)、`Settings.test.tsx`、`LoginGate.test.tsx`(旧 `synthwave` → cyber/lofi)。若某 test 仍引用已删旧包 id,改成 cyber/lofi(这是删旧的连带,属本块收尾)。

- [ ] **Step 2: 类型检查(noUncheckedIndexedAccess 强约束)**
  ```bash
  cd /Users/poco/Projects/Roguent && bunx tsc --noEmit 2>&1 | tail -20
  ```
  期望:无输出(0 错)。`bun run check` 只 Biome 不查类型,此条必跑。

- [ ] **Step 3: Biome lint+format**
  ```bash
  cd /Users/poco/Projects/Roguent && bun run check 2>&1 | tail -20
  ```
  期望:`No errors`。有 format 问题先 `bunx biome check --write .` 再复跑。

- [ ] **Step 4: 构建**
  ```bash
  cd /Users/poco/Projects/Roguent && bun run build 2>&1 | tail -15
  ```
  期望:Vite 构建成功,无 missing asset / 引用已删包路径的报错。

- [ ] **Step 5: Commit 门禁修复(若 Step 1–4 有改动)**
  ```bash
  git add -A && git commit -m "test: 🧪 green gates after artpack revamp (test/tsc/check/build)"
  ```

- [ ] **Step 6: 停 dev 服务**
  ```bash
  pkill -f "src/engine/server.ts" ; pkill -f "vite" ; echo "dev stopped"
  ```
  收尾:门禁四绿 + 两套 preview 视觉证据齐 → 本 milestone 完成,交回整合者合并 main 后复验。
