# Roguent 美术高清化 — 实现计划(现成源图重新烘焙)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用现有 4 套 artpack 的**高清 source sheet**,重新烘焙 **neon-terminal + synthwave 两套高清 atlas**(去糊化 + 提帧尺寸),替换现有糊的美术;设置可切换、全场景换皮。**纯代码、零出图、零手动。**

**Architecture:** 不实时出图(computer-use 驱动 codex 桌面端那条已实测不可行 —— image_gen 图不落盘、不交给 agent)。现有 source sheet 本就高清(`npcs.png` 1254px,角色 ~313px),`gpt-image-overrides.json` 的「sheet→帧」网格映射现成;**糊源是烘焙时降到 16px + `block_pixel_art`/`mix_toward_average` 后期糊化**。治糊三招:① 去糊化 ② 提帧尺寸到 HD 档(`HD_SCALE = TILE/16 = 2.5`,TILE 16→40)③ LANCZOS 降采样。配套:渲染层虚拟像素常数 ×HD_SCALE、切换落位(留 neon+synthwave、删 holo+deep-space、pixel-fantasy 隐藏兜底)、重烘焙 + app 视觉验证。

**Tech Stack:** Python 3 + PIL(烘焙,**`/usr/bin/python3`**);React 19 + PixiJS v8(渲染);bun(测试/构建)。

**Spec:** [2026-06-17-vibecoding-art-revamp-design.md](../specs/2026-06-17-vibecoding-art-revamp-design.md)(注:其「computer-use 出图」通道已废;本 plan 以「现成源图重烘焙」新方案为准,高清档/治糊/切换思路仍有效)

**实测根基(已验证):** 同一赛博角色 cell,旧 16×28 糊成噪点、新 40×70 清晰可辨(`/tmp/deblur-test.py`)。「高清源 + 提帧 + 去糊化」治糊**确定成立**。

---

## 文件结构

```
新建:
  scripts/art/repack_atlas.py      (+ test_repack_atlas.py)   HD 帧重排打包(改帧尺寸后重算 x/y + 放大 PNG 画布)
  scripts/art/test_bake_hd.py                                 烘焙 HD/去糊化单测
  src/web/room/config.test.ts                                 HD 基准测试
修改:
  scripts/art/apply-gpt-image-overrides.py   去糊化 + HD_SCALE/TILE_PX/hd_frame_size + repack 步骤 + LANCZOS + boost/harden 下调
  scripts/art/verify-artpack.ts              倍数感知帧尺寸匹配
  public/assets/artpacks/{neon-terminal,synthwave}/atlas/dungeon.{png,json}   重烘焙成 HD
  src/web/room/config.ts                     TILE=40 + 导出 HD_SCALE
  src/web/room/{Character,Lights,DungeonRoom,ToolBubble,Emote}.tsx, room-props.ts   虚拟像素 ×HD_SCALE
  src/web/lobby/{hub-paint.ts,PixelSprite.tsx}   大厅缩放
  src/web/hud/artpack.ts                     ART_PACKS 删 holo+deep-space, DEFAULT='neon-terminal'(现状)
  src/web/App.tsx                            全局 --ac 跟随 artpack
  src/web/hud/Settings.tsx                   隐藏 pixel-fantasy 卡片
  src/web/i18n.ts                            删 holo/deep-space 译条
  测试: artpack.test.ts / artpack-assets.test.ts / verify-artpack.test.ts / Settings.test.tsx / LoginGate.test.tsx
删除(M4): public/assets/artpacks/{holo-blueprint,deep-space}/
```

---

## 整合裁决(权威 — 覆盖各 milestone 起草的 openQuestions)

1. **Python 解释器**:一律 `/usr/bin/python3`(实测 PIL 11.3.0 + pytest 8.4.2 + numpy 2.0.2;homebrew python 无 PIL)。
2. **HD_SCALE 单一真相,两边一致**:烘焙侧 `TILE_PX=40`/`HD_SCALE=2.5`(`apply-gpt-image-overrides.py`)与渲染侧 `TILE=40`/`HD_SCALE=TILE/16=2.5`(`config.ts`)**必须相等**。M4 preview 调挡时两边同步改。
3. **atlas 必须 repack**(M1 关键发现):atlas 是 TexturePacker 紧密打包(neon `dungeon.png` 128×1178、96% 填充),只改 `dungeon.json` 的 w/h 不重排 x/y 会让帧**重叠**。M1 新增 `repack_atlas.py`(shelf/row 确定性打包,无依赖,浪费 ~10-20% 可接受),重算 x/y/w/h + `meta.size` + **生成放大后的 HD base PNG 画布**;`apply_pack` 在 HD 画布上按新坐标 paste。**HD base PNG 由 M1 的 repack 生成**(M4 不再单独生成)。
4. **verify-artpack 倍数感知匹配**:`verifyAtlasFrameSizes` 改成 `actual.w === round(expected.w*scale)`(scale 由 CLI 传),**不**新增 committed HD reference binary;`0x72/dungeon.json` 保持 16px 参照不动。
5. **帧数不变 381**:HD 只改帧尺寸,不改 381 帧数/分类分布。`coveredFramesByCategory` 计数由 M1/M2 重烘焙保证;`verify-artpack.test.ts` 的 env 噪声分阈值因去糊化升高,M1 复测并 re-baseline。
6. **删磁盘目录在 M4**:M3 只断 UI/默认引用(`ART_PACKS`/i18n);`rm -rf public/assets/artpacks/{holo-blueprint,deep-space}` 由 M4 统一做。
7. **M1 只重烘焙两个幸存包**:`PACKS=(neon-terminal, synthwave)`,不烘要删的 holo/deep-space。
8. **M1/M2 配套、验证分离**:M1 出 HD atlas 产物,但 HD 帧在未改的 16px-tile 房间里会渲染过大,**故 M1 阶段只验证烘焙产物**(PIL pytest + verify-artpack + atlas PNG 检查),**app 内视觉验证留到 M4**(M2 渲染 HD_SCALE 落地后)。
9. **渲染层 = M2**(下文复用旧 plan 的 M1a 方案):发光 scale 分母**保持 64**(实证纠正侦察,不改 128);`WANDER_R_*`/`SPEED` 按 HD_SCALE 放大。
10. **执行顺序**:`M1(烘焙HD+repack) + M2(渲染HD_SCALE)` 配套先做 → `M3(切换留2删2+全局--ac)` → `M4(重烘焙+app视觉验证+删目录+门禁)`。
11. **pixel-fantasy fallback 保持原生 16px(覆盖 M2 旧 Task 7)**:`resolveArtPackAtlasUrls('pixel-fantasy')` 仍返回 `0x72` 的原 16px `dungeon.{json,png}`,**不提档**(fallback 本就该用原生资产,与高清 artpack 解耦,避免 json 40px / png 16px 错位)。`0x72/dungeon.json` 保持 16px(同裁决 4);verify 的 HD 倍数匹配只对 neon/synthwave(scale=2.5),pixel-fantasy 走 scale=1。**故 M2(复用的旧 M1a)里「Task 7 提 0x72 reference 到 40px」作废** —— 0x72 的 json/png 都不动;verify 的 scale 参数由 M1 改造的 `verify-artpack.ts` 按包提供。

---


# Milestone M1 — 烘焙去糊化 + 提帧尺寸(HD bake)

# Milestone M1: 烘焙管线去糊化 + 提帧尺寸(HD bake)

**目标**:用现有高清 source sheet(`npcs.png` 1254×1254 等,每角色 ~313px),把运行时 atlas 帧从 16px 糊化档提到 HD 档(`HD_SCALE = TILE_PX/16`,起步 `TILE_PX=40` → 2.5×),并去掉后期糊化(`block_pixel_art` + 重 `mix_toward_average`),改 LANCZOS 降采样、按高清输入下调 boost/harden。**不出图、不改渲染层**(渲染层是 M3)。

**关键发现(超出 brief,定方案):**
1. atlas 是 TexturePacker 紧密打包(neon-terminal `dungeon.png` 128×1178,96.4% 填充,381 个 distinct rect)。**只改 `dungeon.json` 的 w/h 而不重排 x/y 会让帧互相重叠**。`apply-gpt-image-overrides.py` 的 `apply_pack` 当前**只写 PNG + report,不写 `dungeon.json`**(`atlas_json:1196` 只读,`atlas.save:1248` / `report write:1281` 才写)。→ **M1 必须新增 repack 步骤**:重算 x/y/w/h + meta.size,并把 atlas PNG canvas 放大重排,再 paste。
2. `verify-artpack.ts` 的 `verifyArtPackOnDisk` 拿 candidate 帧尺寸**严格逐帧等于** 0x72 参照(`public/assets/0x72/dungeon.json`,16px)。HD 后必失败 → 改成**倍数感知匹配**(`actual.w === round(expected.w*scale)`)。
3. `verify-artpack.test.ts` 三条硬契约会被 HD/去糊化撞动:env 噪声分(当前 neon-terminal **11.13**,阈值 ≤45,去糊后升高)、`semiAlphaPixels===0`(harden 后仍成立)、`nonTransparentColorCount<=2048`(当前 345;HD 像素更多,可能升高需复测)。M1 复测并按需 re-baseline。
4. **M1 与 M3 耦合**:HD 帧(knight 40×70)在 16px-tile 房间里会渲染成 2.5× 过大,直到 M3 把 `room/config.ts` `TILE 16→40` + Character/Lights scale 分母同步。**故 M1 只验证烘焙产物(PIL pytest + verify-artpack + atlas PNG 检查),不在 app 内做视觉验证**(那是 M3+M4 的事)。

Python 解释器统一 **`/usr/bin/python3`**(实测 PIL 11.3.0 + pytest 8.4.2 + numpy 2.0.2,homebrew python 无 PIL)。

---

### Task 1: 抽出 HD 配置常数 + HD 帧尺寸函数(TDD)

把 bake 的 HD 倍率参数化成单一常数,新增 `hd_frame_size`,为后续 repack/缩放复用。

**Files:**
- Modify `scripts/art/apply-gpt-image-overrides.py:19`(`PACKS` 行下方,加常数区)
- Test `scripts/art/test_bake_hd.py`(Create)

- [ ] **Step 1**: 先写失败测试。Create `scripts/art/test_bake_hd.py`:
  ```python
  """PIL pytest for the HD bake pipeline (run with /usr/bin/python3 -m pytest)."""
  import importlib.util
  from pathlib import Path

  _SPEC = importlib.util.spec_from_file_location(
      "bake", Path(__file__).with_name("apply-gpt-image-overrides.py")
  )
  bake = importlib.util.module_from_spec(_SPEC)
  _SPEC.loader.exec_module(bake)


  def test_hd_scale_constants():
      assert bake.TILE_PX == 40
      assert bake.HD_SCALE == bake.TILE_PX / 16  # 2.5


  def test_hd_frame_size_rounds_per_axis():
      # knight 16x28 -> 40x70 ; coin 6x7 -> 15x18 ; boss 32x36 -> 80x90
      assert bake.hd_frame_size(16, 28) == (40, 70)
      assert bake.hd_frame_size(6, 7) == (15, 18)
      assert bake.hd_frame_size(32, 36) == (80, 90)
      assert bake.hd_frame_size(5, 22) == (12, 55)  # fractional rounding per axis
  ```
- [ ] **Step 2**: 跑红。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py -q` → 期望 `AttributeError: module 'bake' has no attribute 'TILE_PX'`(2 failed / collection error)。
- [ ] **Step 3**: 实现。在 `scripts/art/apply-gpt-image-overrides.py` 第 21 行(`PACK_ROOT = Path(...)` 之后)插入:
  ```python
  # HD bake: runtime atlas frames are baked at HD_SCALE× the 0x72 16px contract
  # so the high-res source sheets keep detail instead of collapsing to 16px mush.
  # The renderer (room/config.ts TILE) is bumped to TILE_PX in the render-2x
  # milestone; here we only emit the higher-resolution atlas.
  TILE_PX = 40
  HD_SCALE = TILE_PX / 16  # 2.5


  def hd_frame_size(w: int, h: int) -> tuple[int, int]:
      """Scale a 16px-contract frame size to the HD bake size (per-axis round)."""
      return (round(w * HD_SCALE), round(h * HD_SCALE))
  ```
- [ ] **Step 4**: 跑绿。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py -q` → 期望 `2 passed`。
- [ ] **Step 5 (commit)**: `git add scripts/art/apply-gpt-image-overrides.py scripts/art/test_bake_hd.py && git commit -m "feat: 🧩 add HD_SCALE/TILE_PX bake constants + hd_frame_size"`

---

### Task 2: 去糊化 + LANCZOS + 高清下调 boost/harden(TDD)

去掉 `reduce_environment_noise` 的 `block_pixel_art(2)`,大幅降 `mix_toward_average` 权重;`fitted_cell` 降采样 BOX→LANCZOS;`boost_small_sprite_contrast` 与 `harden_pixel_art` 按高清输入下调。

**Files:**
- Modify `scripts/art/apply-gpt-image-overrides.py:1117-1124`(`reduce_environment_noise`)
- Modify `scripts/art/apply-gpt-image-overrides.py:1023-1032`(`boost_small_sprite_contrast`)
- Modify `scripts/art/apply-gpt-image-overrides.py:1011`(`harden_pixel_art` alpha 阈值)
- Modify `scripts/art/apply-gpt-image-overrides.py:1167`(`fitted_cell` 降采样)
- Test `scripts/art/test_bake_hd.py`(Modify)

- [ ] **Step 1**: 先写失败测试,追加到 `scripts/art/test_bake_hd.py`:
  ```python
  from PIL import Image


  def _synthetic_detail_tile(size=64):
      """A high-frequency RGBA tile (checker of two saturated colors) on opaque bg."""
      im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
      px = im.load()
      for y in range(size):
          for x in range(size):
              on = (x // 4 + y // 4) % 2 == 0
              px[x, y] = (220, 40, 60, 255) if on else (30, 80, 200, 255)
      return im


  def _mean_neighbor_delta(im):
      px = im.load(); w, h = im.size; tot = 0; n = 0
      for y in range(h):
          for x in range(w):
              r, g, b, a = px[x, y]
              if a == 0:
                  continue
              for nx, ny in ((x + 1, y), (x, y + 1)):
                  if nx >= w or ny >= h:
                      continue
                  r2, g2, b2, a2 = px[nx, ny]
                  if a2 == 0:
                      continue
                  tot += abs(r - r2) + abs(g - g2) + abs(b - b2); n += 1
      return tot / n if n else 0.0


  def test_reduce_environment_noise_keeps_detail_after_deblur():
      tile = _synthetic_detail_tile()
      out = bake.reduce_environment_noise(tile, "floor_1")
      # de-blurred output preserves far more edge energy than the old
      # block_pixel_art(2)+mix(0.46) path (which collapsed deltas toward ~0).
      assert _mean_neighbor_delta(out) > 0.5 * _mean_neighbor_delta(tile)


  def test_floor_mix_weight_is_low():
      # white-vs-black opaque pair must stay near-unmixed (weight ~0.10, not 0.46)
      im = Image.new("RGBA", (2, 1), (0, 0, 0, 255))
      im.putpixel((1, 0), (255, 255, 255, 255))
      out = bake.mix_toward_average(im, 0.10)
      r, _, _, _ = out.getpixel((0, 0))
      assert r <= 30  # 0.10 weight toward avg(127) -> ~13, was 0.46 -> ~58


  def test_block_pixel_art_no_longer_applied_to_environment():
      # a 1px-wide vertical line must survive (block_pixel_art(2) would smear it)
      im = Image.new("RGBA", (8, 8), (10, 10, 10, 255))
      for y in range(8):
          im.putpixel((3, y), (255, 0, 0, 255))
      out = bake.reduce_environment_noise(im, "wall_mid")
      # the line column stays clearly red (not averaged into neighbors)
      assert out.getpixel((3, 0))[0] > 180


  def test_fitted_cell_uses_lanczos_downsample():
      # build a 4x4 grid source where cell 0 has fine detail; fit to HD size,
      # assert the result is sharper than a BOX downsample of the same subject.
      src = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
      for y in range(16):
          for x in range(16):
              src.putpixel((x, y), ((x % 2) * 255, (y % 2) * 255, 120, 255))
      hd = bake.hd_frame_size(16, 16)  # (40, 40)
      out = bake.fitted_cell(src, 0, hd, cols=4, rows=4)
      assert out.size == hd
      assert _mean_neighbor_delta(out) > 30  # LANCZOS keeps high-freq energy


  def test_harden_pixel_art_alpha_threshold_raised():
      im = Image.new("RGBA", (1, 1), (200, 0, 0, 80))  # 64<80<96
      out = bake.harden_pixel_art(im)
      assert out.getpixel((0, 0))[3] == 0  # 80 < 96 now culled (was kept at 64)
  ```
- [ ] **Step 2**: 跑红。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py -q` → 期望新增 5 条 fail(`test_floor_mix_weight_is_low` 旧权重下 r≈58>30；`test_harden...` 旧阈值 64 下 alpha=80 被保留 == 255；`test_block_pixel_art...` 旧 block 涂抹后红列 <180 等)。
- [ ] **Step 3**: 实现去糊化。把 `reduce_environment_noise`(1117-1124)改为:
  ```python
  def reduce_environment_noise(sprite: Image.Image, frame_name: str) -> Image.Image:
      frame = frame_name.removesuffix(".png")
      # HD bake: the source sheets are already high-res, so drop the old
      # block_pixel_art(2) mean-filter blur and keep mixing only lightly.
      if frame.startswith(("floor", "ground", "grass", "edge")) or frame == "hole":
          return mix_toward_average(sprite, 0.10)
      if frame.startswith(("wall", "doors", "column")):
          return mix_toward_average(sprite, 0.08)
      return mix_toward_average(sprite, 0.06)
  ```
- [ ] **Step 4**: 实现 boost 下调。把 `boost_small_sprite_contrast`(1027-1029)三个 enhance 改为:
  ```python
      rgb = ImageEnhance.Contrast(rgb).enhance(1.25)
      rgb = ImageEnhance.Color(rgb).enhance(1.12)
      rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
  ```
- [ ] **Step 5**: 实现 harden 阈值上调。把 `harden_pixel_art` 第 1011 行 `if a < 64:` 改为 `if a < 96:`,并把上方注释(1010 行附近)更新为 `# HD bake: cull anti-alias edges below 96 alpha (was 64 at 16px)`。
- [ ] **Step 6**: 实现 LANCZOS。把 `fitted_cell` 第 1167 行 `resized = subject.resize(new_size, Image.Resampling.BOX)` 改为 `resized = subject.resize(new_size, Image.Resampling.LANCZOS)`,并把函数 docstring 顶部注释里 BOX→LANCZOS 说明同步。
- [ ] **Step 7**: 跑绿。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py -q` → 期望 `8 passed`。
- [ ] **Step 8 (commit)**: `git add scripts/art/apply-gpt-image-overrides.py scripts/art/test_bake_hd.py && git commit -m "fix: 🩹 de-blur bake (drop block_pixel_art, low mix, LANCZOS, HD boost/harden)"`

---

### Task 3: 新增 repack_atlas 模块 — HD 重排 dungeon.json(TDD)

新增可独立测的纯函数 repack:给定旧 frames + scale,产出新 frames(w/h × scale、x/y 重排无重叠)和 meta.size。这是 HD 化的核心(没它帧会重叠)。

**Files:**
- Create `scripts/art/repack_atlas.py`
- Test `scripts/art/test_repack_atlas.py`(Create)

- [ ] **Step 1**: 先写失败测试。Create `scripts/art/test_repack_atlas.py`:
  ```python
  import importlib.util
  from pathlib import Path

  _SPEC = importlib.util.spec_from_file_location(
      "repack", Path(__file__).with_name("repack_atlas.py")
  )
  repack = importlib.util.module_from_spec(_SPEC)
  _SPEC.loader.exec_module(repack)


  def _frames():
      return {
          "a.png": {"frame": {"x": 0, "y": 0, "w": 16, "h": 28},
                    "rotated": False, "trimmed": False,
                    "spriteSourceSize": {"x": 0, "y": 0, "w": 16, "h": 28},
                    "sourceSize": {"w": 16, "h": 28},
                    "anchor": {"x": 0.5, "y": 0.5}},
          "b.png": {"frame": {"x": 16, "y": 0, "w": 6, "h": 7},
                    "rotated": False, "trimmed": False,
                    "spriteSourceSize": {"x": 0, "y": 0, "w": 6, "h": 7},
                    "sourceSize": {"w": 6, "h": 7},
                    "anchor": {"x": 0.5, "y": 0.5}},
      }


  def test_repack_scales_each_frame_size():
      new_frames, size = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
      assert new_frames["a.png"]["frame"]["w"] == 40
      assert new_frames["a.png"]["frame"]["h"] == 70
      assert new_frames["b.png"]["frame"]["w"] == 15
      assert new_frames["b.png"]["frame"]["h"] == 18
      # sourceSize/spriteSourceSize scaled too (TexturePacker contract stays consistent)
      assert new_frames["a.png"]["sourceSize"] == {"w": 40, "h": 70}


  def test_repack_no_overlap_and_within_bounds():
      new_frames, (W, H) = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
      rects = [(e["frame"]["x"], e["frame"]["y"], e["frame"]["w"], e["frame"]["h"])
               for e in new_frames.values()]
      for x, y, w, h in rects:
          assert x >= 0 and y >= 0 and x + w <= W and y + h <= H
      # pairwise no-overlap
      for i in range(len(rects)):
          for j in range(i + 1, len(rects)):
              ax, ay, aw, ah = rects[i]; bx, by, bw, bh = rects[j]
              assert ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay


  def test_repack_meta_size_covers_all_frames():
      new_frames, (W, H) = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
      maxx = max(e["frame"]["x"] + e["frame"]["w"] for e in new_frames.values())
      maxy = max(e["frame"]["y"] + e["frame"]["h"] for e in new_frames.values())
      assert W >= maxx and H >= maxy
      assert W <= 1024
  ```
- [ ] **Step 2**: 跑红。`/usr/bin/python3 -m pytest scripts/art/test_repack_atlas.py -q` → 期望 collection 失败(`repack_atlas.py` 不存在)。
- [ ] **Step 3**: 实现。Create `scripts/art/repack_atlas.py`(确定性 shelf/row packer,1px gutter 防采样溢出):
  ```python
  """Deterministic shelf-pack a TexturePacker frame dict at an HD scale.

  Frames are packed in descending-height order into rows ("shelves") capped at
  max_width; this wastes ~10-20% vs a true rect packer but is dependency-free
  and reproducible. Returns (new_frames, (atlas_w, atlas_h)).
  """
  from __future__ import annotations

  GUTTER = 1  # 1px gap so nearest-neighbour sampling never bleeds across frames


  def _scaled(v: int, scale: float) -> int:
      return round(v * scale)


  def repack_atlas_frames(
      frames: dict, scale: float, max_width: int = 1024
  ) -> tuple[dict, tuple[int, int]]:
      # Stable order: tallest first, then by name for determinism.
      items = []
      for name, entry in frames.items():
          w = _scaled(entry["frame"]["w"], scale)
          h = _scaled(entry["frame"]["h"], scale)
          items.append((h, name, w))
      items.sort(key=lambda t: (-t[0], t[1]))

      new_frames: dict = {}
      cur_x = 0
      cur_y = 0
      row_h = 0
      atlas_w = 0
      for h, name, w in items:
          if cur_x + w > max_width and cur_x > 0:
              cur_x = 0
              cur_y += row_h + GUTTER
              row_h = 0
          src = frames[name]
          fw, fh = w, h
          new_frames[name] = {
              **src,
              "frame": {"x": cur_x, "y": cur_y, "w": fw, "h": fh},
              "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
              "sourceSize": {"w": fw, "h": fh},
          }
          cur_x += w + GUTTER
          atlas_w = max(atlas_w, cur_x - GUTTER)
          row_h = max(row_h, h)
      atlas_h = cur_y + row_h
      return new_frames, (atlas_w, atlas_h)
  ```
- [ ] **Step 4**: 跑绿。`/usr/bin/python3 -m pytest scripts/art/test_repack_atlas.py -q` → 期望 `3 passed`。
- [ ] **Step 5**: 真数据冒烟(无副作用,只读+repack 内存)。`/usr/bin/python3 -c "import json,importlib.util as u; s=u.spec_from_file_location('r','scripts/art/repack_atlas.py'); m=u.module_from_spec(s); s.loader.exec_module(m); fr=json.load(open('public/assets/artpacks/neon-terminal/atlas/dungeon.json'))['frames']; nf,sz=m.repack_atlas_frames(fr,2.5); print('frames',len(nf),'atlas',sz)"` → 期望 `frames 381 atlas (W, H)`,且 `W<=1024`、`H` 约 1000-1200。
- [ ] **Step 6 (commit)**: `git add scripts/art/repack_atlas.py scripts/art/test_repack_atlas.py && git commit -m "feat: 🧩 add deterministic HD atlas repacker (no-overlap shelf pack)"`

---

### Task 4: apply_pack 接入 HD repack — 重写 dungeon.json + 放大 PNG canvas(TDD)

让 `apply_pack` 先 repack dungeon.json(写回 HD 尺寸 + meta)、按新 meta.size 建空 atlas PNG、再 paste HD 帧;report 的 targetSize 随之变 HD。

**Files:**
- Modify `scripts/art/apply-gpt-image-overrides.py:14`(import repack)
- Modify `scripts/art/apply-gpt-image-overrides.py:1189-1248`(`apply_pack` 加 repack + canvas 重建)
- Test `scripts/art/test_bake_hd.py`(Modify,加端到端 HD bake 断言)

- [ ] **Step 1**: 先写失败测试,追加到 `scripts/art/test_bake_hd.py`(用临时 pack 副本跑真 `apply_pack`):
  ```python
  import json, shutil, tempfile, os


  def test_apply_pack_emits_hd_atlas(tmp_path, monkeypatch):
      src = Path("public/assets/artpacks/neon-terminal")
      dst = tmp_path / "neon-terminal"
      shutil.copytree(src, dst)
      monkeypatch.setattr(bake, "PACK_ROOT", tmp_path)
      report = bake.apply_pack("neon-terminal")

      atlas_json = json.loads((dst / "atlas" / "dungeon.json").read_text())
      kf = atlas_json["frames"]["knight_m_idle_anim_f0.png"]["frame"]
      assert (kf["w"], kf["h"]) == (40, 70)  # HD size written back to json
      # atlas png matches new meta size, no frame exceeds canvas
      from PIL import Image
      im = Image.open(dst / "atlas" / "dungeon.png")
      W, H = atlas_json["meta"]["size"]["w"], atlas_json["meta"]["size"]["h"]
      assert im.size == (W, H)
      for e in atlas_json["frames"].values():
          f = e["frame"]
          assert f["x"] + f["w"] <= W and f["y"] + f["h"] <= H
      # report targetSize is HD
      tgt = next(c["targetSize"] for c in report["coveredFrames"]
                 if c["frame"] == "knight_m_idle_anim_f0")
      assert tgt == {"w": 40, "h": 70}
      assert report["coveredFrameCount"] == 381
  ```
  > 注:`bake.PACKS` 在 M1 阶段仍含 4 包,但本测试只对 `neon-terminal` 调 `apply_pack(pack_id)`,不依赖 `PACKS` 内容;monkeypatch `PACK_ROOT` 指向临时副本,不污染仓库资源。
- [ ] **Step 2**: 跑红。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py::test_apply_pack_emits_hd_atlas -q` → 期望 fail:旧 `apply_pack` 不改 json,knight 仍 `(16,28)`。
- [ ] **Step 3**: import repack。在 `scripts/art/apply-gpt-image-overrides.py` 顶部 import 区(第 16 行 `from PIL import ...` 之后)加:
  ```python
  import importlib.util as _ilu
  _repack_spec = _ilu.spec_from_file_location(
      "repack_atlas", Path(__file__).with_name("repack_atlas.py")
  )
  _repack = _ilu.module_from_spec(_repack_spec)
  _repack_spec.loader.exec_module(_repack)
  ```
- [ ] **Step 4**: 在 `apply_pack` 里(第 1197 行 `frames = atlas_json["frames"]` 之后)插入 repack + canvas 重建,替换原来对原子 `atlas`(读自旧 PNG)的使用:
  ```python
      # HD repack: rewrite the TexturePacker layout at HD_SCALE so the high-res
      # source cells land in larger frame rects, then build a fresh canvas.
      new_frames, (atlas_w, atlas_h) = _repack.repack_atlas_frames(frames, HD_SCALE)
      atlas_json["frames"] = new_frames
      atlas_json.setdefault("meta", {})["size"] = {"w": atlas_w, "h": atlas_h}
      frames = new_frames
      atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
  ```
  并**删掉**原第 1195 行 `atlas = Image.open(atlas_path).convert("RGBA")`(canvas 现在从空建,不再继承旧像素;旧 PNG 仅 381 帧全覆盖,空建无残留)。
- [ ] **Step 5**: 让 paste 不再清旧区(空 canvas 无需先 paste 透明块)。把第 1232-1236 行的 `atlas.paste(Image.new(... transparent), (x,y))` + `alpha_composite` 简化为单行:`atlas.alpha_composite(sprite, (frame["x"], frame["y"]))`(空 canvas 已透明)。
- [ ] **Step 6**: 写回 dungeon.json。在 `atlas.save(atlas_path)`(第 1248 行)**之前**加:`atlas_json_path.write_text(json.dumps(atlas_json, indent=2) + "\n")`。
- [ ] **Step 7**: 跑绿。`/usr/bin/python3 -m pytest scripts/art/test_bake_hd.py -q` → 期望全 passed(9 passed)。
- [ ] **Step 8 (commit)**: `git add scripts/art/apply-gpt-image-overrides.py scripts/art/test_bake_hd.py && git commit -m "feat: 🧩 apply_pack repacks dungeon.json to HD + rebuilds atlas canvas"`

---

### Task 5: verify-artpack 改成倍数感知尺寸匹配(TDD,TS)

`verifyAtlasFrameSizes` 现严格等于 16px 参照;HD 后改成接受 `actual == round(expected*scale)`,scale 默认 1(不传时行为不变,保旧测绿)。CLI/`verifyArtPackOnDisk` 传 `HD_SCALE`。

**Files:**
- Modify `scripts/art/verify-artpack.ts:131-160`(`verifyAtlasFrameSizes` 加 `scale` 参数)
- Modify `scripts/art/verify-artpack.ts:232-260`(`verifyArtPackOnDisk` 传 scale)
- Modify `scripts/art/verify-artpack-cli.ts:48`(传 `scale: 2.5`)
- Test `scripts/art/verify-artpack.test.ts`(Modify)

- [ ] **Step 1**: 先写失败测试,在 `verify-artpack.test.ts` 的 `verifyAtlasFrameSizes` 用例后(第 339 行后)加:
  ```ts
  it("verifyAtlasFrameSizes matches HD candidates against a scaled reference", () => {
    const reference = new Map([
      ["floor_1", { w: 16, h: 16 }],
      ["knight_m_idle_anim_f0", { w: 16, h: 28 }],
    ]);
    const candidate = new Map([
      ["floor_1", { w: 40, h: 40 }],
      ["knight_m_idle_anim_f0", { w: 40, h: 70 }],
    ]);
    const result = verifyAtlasFrameSizes({ reference, candidate, scale: 2.5 });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("verifyAtlasFrameSizes flags HD frames off the scaled contract", () => {
    const reference = new Map([["floor_1", { w: 16, h: 16 }]]);
    const candidate = new Map([["floor_1", { w: 40, h: 41 }]]); // h wrong
    const result = verifyAtlasFrameSizes({ reference, candidate, scale: 2.5 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe("frame-size-mismatch");
  });
  ```
- [ ] **Step 2**: 跑红。`bun test scripts/art/verify-artpack.test.ts` → 期望新两条 fail(`scale` 未被消费,40≠16 报 mismatch)。
- [ ] **Step 3**: 实现。`verify-artpack.ts` 第 126-160 行,给 input 加可选 `scale`,匹配用 round:
  ```ts
  interface VerifyAtlasFrameSizesInput {
    reference: ReadonlyMap<string, Size>;
    candidate: ReadonlyMap<string, Size>;
    scale?: number;
  }

  export function verifyAtlasFrameSizes({
    reference,
    candidate,
    scale = 1,
  }: VerifyAtlasFrameSizesInput): VerifyResult {
    const issues: ArtPackIssue[] = [];
    for (const [frame, ref] of reference.entries()) {
      const expected: Size = {
        w: Math.round(ref.w * scale),
        h: Math.round(ref.h * scale),
      };
      const actual = candidate.get(frame);
      if (!actual) {
        issues.push({ kind: "missing-frame", frame, expected, message: "Missing atlas frame" });
        continue;
      }
      if (actual.w !== expected.w || actual.h !== expected.h) {
        issues.push({
          kind: "frame-size-mismatch",
          frame,
          expected,
          actual,
          message: "Atlas frame size differs from reference atlas",
        });
      }
    }
    return { ok: issues.length === 0, issues };
  }
  ```
  > 注:`expected` 现在是 scaled 值,旧用例 `verifyAtlasFrameSizes reports missing and mismatched`(scale 默认 1)期望 `expected:{w:16,h:16}` 不变 → 仍绿。
- [ ] **Step 4**: `verifyArtPackOnDisk` 加 `scale`。第 204-235 行的 input interface 加 `scale?: number`,签名默认 `scale = 1`,调 `verifyAtlasFrameSizes({ reference, candidate, scale })`。
- [ ] **Step 5**: CLI 传 HD scale。`verify-artpack-cli.ts` 第 49 行改 `await verifyArtPackOnDisk({ packRoot, scale: 2.5 })`,并在文件顶注释补一行 `// HD bake: atlas frames are HD_SCALE(=2.5)× the 0x72 16px reference`。
- [ ] **Step 6**: 跑绿。`bun test scripts/art/verify-artpack.test.ts` → 期望全 passed(含新增两条 + 旧 `verifyArtPackOnDisk` 用例;后者临时 reference 与 candidate 都 16px,scale 默认 1 仍绿)。
- [ ] **Step 7 (commit)**: `git add scripts/art/verify-artpack.ts scripts/art/verify-artpack-cli.ts scripts/art/verify-artpack.test.ts && git commit -m "feat: 🧩 verify-artpack: multiple-aware HD frame-size matching"`

---

### Task 6: 重烘焙两套幸存包 + 复测/re-baseline 像素契约(操作性 + 证据)

实跑 HD bake,产出 neon-terminal + synthwave 的 HD `dungeon.json`/`dungeon.png`/`gpt-image-overrides.json`,复测 `verify-artpack.test.ts` 三条像素契约,撞阈值则按实测 re-baseline。

> M1 仅重烤两套幸存冷色包(neon-terminal、synthwave);holo-blueprint/deep-space 在 switch-chain 里删,不在此重烤(见 openQuestions)。

**Files:**
- Modify(产物)`public/assets/artpacks/{neon-terminal,synthwave}/atlas/{dungeon.json,dungeon.png,gpt-image-overrides.json}`
- Modify(若撞阈值)`scripts/art/verify-artpack.test.ts:506-517`(分类数不变,仅可能改 color/noise 阈值与包列表)

- [ ] **Step 1**: 重烤 neon-terminal。`/usr/bin/python3 scripts/art/apply-gpt-image-overrides.py --pack neon-terminal` → 期望末行 `neon-terminal: 381 frames from ...`。
- [ ] **Step 2**: 重烤 synthwave。`/usr/bin/python3 scripts/art/apply-gpt-image-overrides.py --pack synthwave` → 期望 `synthwave: 381 frames from ...`。
- [ ] **Step 3**: 量化证据(尺寸 + 清晰度 + 契约值)。跑:
  ```bash
  /usr/bin/python3 - <<'PY'
  import json
  from PIL import Image
  for pack in ("neon-terminal","synthwave"):
      root=f"public/assets/artpacks/{pack}"
      d=json.load(open(root+"/atlas/dungeon.json")); fr=d["frames"]
      k=fr["knight_m_idle_anim_f0.png"]["frame"]
      print(pack,"knight",k["w"],k["h"],"atlas meta",d["meta"]["size"])
      im=Image.open(root+"/atlas/dungeon.png").convert("RGBA"); px=im.load(); W,H=im.size
      colors=set(); semi=0
      for y in range(H):
          for x in range(W):
              r,g,b,a=px[x,y]
              if 0<a<255: semi+=1
              if a>0: colors.add((r,g,b,a))
      print(pack,"png",im.size,"semiAlpha",semi,"distinctColors",len(colors))
  PY
  ```
  期望:knight `40 70`;atlas png 尺寸 == meta.size;`semiAlpha 0`;记录 `distinctColors`(若 >2048 见 Step 5)。
- [ ] **Step 4**: env 噪声分复测。复用 Task 验证脚本(brief 中已贴的 score() 逻辑)对两包算分;期望 `>11.13`(更清晰)且记录值。若 ≤45 不动阈值;若 >45,把 `verify-artpack.test.ts:600` 的 `toBeLessThanOrEqual(45)` 改为 `ceil(实测最大值*1.1)` 并在 PR body 记原值→新值。
- [ ] **Step 5**: 跑像素契约测试。`bun test scripts/art/verify-artpack.test.ts`。
  - "keep hard-edged pixel-art": `semiAlphaPixels===0` 必绿(harden 量化);若 `nonTransparentColorCount` >2048,把第 569 行阈值改为实测最大值上取整到下一个 256 边界(如 ≤2304),记入 PR。
  - "report GPT-image runtime frame coverage": 分类数(characters:106 等)与 `381` 不变(帧数不变),应绿。
  - 若 Step 4 调了 env 阈值,此处复跑确认绿。
- [ ] **Step 6**: 全量 gate。`/usr/bin/python3 -m pytest scripts/art/ -q`(期望全绿)+ `bun test scripts/art/`(期望全绿)+ `bun run check`(Biome,期望 0 error)+ `bunx tsc --noEmit`(`noUncheckedIndexedAccess`,期望 0 error,重点看改过的 verify-artpack.ts)。
- [ ] **Step 7**: 视觉抽样证据(非 app 内,只看 atlas 帧像素)。导出 knight idle f0 的 HD 帧到临时 PNG 看清晰度:
  ```bash
  /usr/bin/python3 - <<'PY'
  import json
  from PIL import Image
  root="public/assets/artpacks/neon-terminal"
  d=json.load(open(root+"/atlas/dungeon.json"))["frames"]["knight_m_idle_anim_f0.png"]["frame"]
  im=Image.open(root+"/atlas/dungeon.png").crop((d["x"],d["y"],d["x"]+d["w"],d["y"]+d["h"]))
  out="/tmp/knight_hd_f0.png"; im.save(out); print("saved",out,im.size)
  PY
  ```
  Read `/tmp/knight_hd_f0.png` 确认是清晰 40×70 角色(非 16px 噪点糊块)。**这是 M1 唯一的视觉证据,刻意不进 app**(HD 帧在 16px 房间里会过大,渲染层是 M3)。
- [ ] **Step 8 (commit)**: `git add public/assets/artpacks/neon-terminal/atlas public/assets/artpacks/synthwave/atlas scripts/art/verify-artpack.test.ts && git commit -m "chore: 🧹 re-bake neon-terminal + synthwave at HD; re-baseline pixel contracts"`

---

## 验收(整 milestone)
- `/usr/bin/python3 -m pytest scripts/art/ -q` 全绿(test_bake_hd.py + test_repack_atlas.py)。
- `bun test scripts/art/verify-artpack.test.ts` 全绿(含倍数匹配 + re-baseline 后的像素契约)。
- `bun run verify:artpack public/assets/artpacks/neon-terminal public/assets/artpacks/synthwave` → `All 2 art pack(s) verified`(CLI 传 scale=2.5)。
- `bun run check` 0 error;`bunx tsc --noEmit` 0 error。
- `/tmp/knight_hd_f0.png` 是清晰 40×70 帧(证据)。
- 两包 `dungeon.json` knight 帧 `(40,70)`、boss `(80,90)`、floor `(40,40)`;atlas png 尺寸 == meta.size 且无帧越界/重叠。

## 不在 M1 范围(留给后续 milestone)
- 渲染层 `room/config.ts` `TILE 16→40` + Character/Lights/DungeonRoom/ToolBubble scale 同步(render-2x = M3)。
- 删 holo-blueprint/deep-space、`ART_PACKS`/`DEFAULT_ARTPACK` 编辑、i18n 删条目(switch-chain)。
- app 内大厅/房间视觉验证、preview 调 TILE 倍率(M4)。


---

# Milestone M2 — 渲染层 HD_SCALE 参数化

>
> 把房间渲染从 16px 基准提到高清档。核心策略:**引入单一缩放因子 `SCALE = TILE/16`,让所有硬编码的「虚拟像素」常数随 TILE 自适应**,而不是散落地手改一堆魔数。起步值按共享契约取 **TILE 16→40(SCALE=2.5)**,注明「M4 preview 视觉验证后定」——改 `config.ts` 一个常数即可整体换挡。
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
      // 起步值 TILE=40(SCALE=2.5),M4 preview 调定。改这一个常数即整体换挡。
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
  // 高清档起步值 TILE=40(原 16);M4 preview 视觉验证后可微调(改这一个常数整体换挡)。
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


---

# Milestone M3 — 切换落位(留 neon+synthwave / 删 holo+deep-space / 全局 --ac)

## Milestone M3: switch-2packs — 切换落位(留 neon-terminal+synthwave+pixel-fantasy隐藏,删 holo-blueprint+deep-space,DEFAULT='neon-terminal',全局 --ac 跟随)

把美术包从 5 套收窄到「2 套可见(neon-terminal/synthwave)+ pixel-fantasy 隐藏兜底」。`DEFAULT_ARTPACK` 维持 `'neon-terminal'`。同时补上侦察 switch-chain 指出的唯一死角:**`artpack.ac` 目前只在 Settings 卡片内联注入 `--ac`,根节点无全局跟随**——本 milestone 让 `#stage` 根节点随当前包写 `--ac` 并监听 `ARTPACK_CHANGE_EVENT` 热更新。

本 milestone **不重烘焙、不改帧尺寸、不 rm 磁盘资源目录**(那是 M1/M2 的事);只断开 holo-blueprint/deep-space 的代码与文案引用,并把 `--ac` 接到根节点。Python/PIL 无关。

依据 commit `08ae5d4`(2026-06-17)。侦察清单见 `/private/tmp/claude-501/-Users-poco-Projects-Roguent/464c59ba-db72-4787-870f-0d36a45378ad/tasks/wqmll03kz.output` 的 `switch-chain` 块。

---

### Task 1: 收窄 ART_PACKS 到 3 套(删 holo-blueprint + deep-space),确认 DEFAULT='neon-terminal'

**Files:**
- Modify `src/web/hud/artpack.ts:33`(确认 DEFAULT_ARTPACK)、`src/web/hud/artpack.ts:68-115`(删两个对象)
- Test `src/web/hud/artpack.test.ts:16-46`(长度 5→3、ready 列表、GENERATED_ARTPACK_IDS)

TDD:先改断言 → 跑红 → 改实现 → 跑绿。

- [ ] **Step 1**: 改 `src/web/hud/artpack.test.ts`。把 `GENERATED_ARTPACK_IDS`(第 29-34 行)收窄为两套:

```ts
const GENERATED_ARTPACK_IDS = ["neon-terminal", "synthwave"];
```

把「ART_PACKS:5 包」用例(第 16-19 行)改为长度 3:

```ts
test("ART_PACKS:3 包、id 唯一、字段齐全", () => {
  expect(ART_PACKS).toHaveLength(3);
  const ids = ART_PACKS.map((p) => p.id);
  expect(new Set(ids).size).toBe(3);
```

(用例体其余 `for (const p of ART_PACKS)` 字段断言第 20-26 行不变。)

把「五个美术包均 ready」用例(第 36-46 行)改为三个、移除被删包 id:

```ts
test("三个美术包均 ready;默认使用生成的霓虹终端资源", () => {
  const ready = ART_PACKS.filter((p) => p.ready);
  expect(ready.map((p) => p.id)).toEqual([
    "pixel-fantasy",
    "neon-terminal",
    "synthwave",
  ]);
  expect(DEFAULT_ARTPACK).toBe("neon-terminal");
});
```

第 99-112 行「派发素材包切换事件」用例当前 `applyArtPack("deep-space")` 引用了被删包(虽然 `applyArtPack` 不校验 id,但断言里硬编码了 `deep-space`)。改成留存包:

```ts
  applyArtPack("synthwave");

  expect(detail).toEqual({ id: "synthwave" });
```

- [ ] **Step 2**: 跑红,确认实现未改时断言失败:

```bash
bun test src/web/hud/artpack.test.ts
```

期望:`ART_PACKS:3 包` 与 `三个美术包均 ready` 失败(实际长度 5 / ready 含 5 个 id);其余通过。

- [ ] **Step 3**: 改实现 `src/web/hud/artpack.ts`。删除 `holo-blueprint` 对象(第 68-91 行,从 `{ id: "holo-blueprint",` 到其闭合 `},`)与 `deep-space` 对象(第 92-115 行,从 `{ id: "deep-space",` 到其闭合 `},`)。删后 `ART_PACKS` 仅剩 `pixel-fantasy`(第 36-43 行)、`neon-terminal`(第 44-67 行)、`synthwave`(原 116-139 行)三个对象。确认第 33 行保持:

```ts
export const DEFAULT_ARTPACK = "neon-terminal";
```

(已是该值,无需改,确认即可。)

- [ ] **Step 4**: 跑绿:

```bash
bun test src/web/hud/artpack.test.ts
```

期望:全部 8 个用例 pass。

- [ ] **Step 5**: Commit。

```bash
git add src/web/hud/artpack.ts src/web/hud/artpack.test.ts
git commit -m "refactor: ✨ collapse ART_PACKS to neon-terminal+synthwave(+pixel-fantasy fallback)

删 holo-blueprint/deep-space 两个生成包对象,DEFAULT 维持 neon-terminal。
artpack.test.ts 长度 5→3、ready 列表与 GENERATED_ARTPACK_IDS 同步收窄。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 根节点 #stage 全局跟随 artpack.ac 写 --ac(监听 ARTPACK_CHANGE_EVENT 热更新)

侦察 switch-chain 唯一死角:`--ac` 在 `styles.css` 被 40+ 处消费(`src/web/styles.css:1802/1815/3230/4473/5215/...`),但**只在 Settings `.artpack-card` 内联注入**(`Settings.tsx:760`),根节点没有,故大厅/HUD/内景的 `var(--ac, fallback)` 永远吃 CSS 兜底(`#f2c84b`/`var(--cyan)`),不随包切换。本 task 让 `#stage` 根节点写当前包的 `--ac`,并随 `ARTPACK_CHANGE_EVENT` 更新。

**Files:**
- Modify `src/web/App.tsx:9`(import)、`src/web/App.tsx:46-75`(新增 hook + 调用)、`src/web/App.tsx:141-145`(stage style 合并 --ac)
- Test `src/web/lobby/LoginGate.test.tsx`(已有 App 集成测试基座;此处加一条根节点 --ac 断言)

`LoginGate.test.tsx` 当前用 `synthwave`(留存包,第 75/80-82 行)验证 `data-artpack` 回灌,无需改既有用例。新增一条用例断言根节点 `--ac` 随持久包生效。TDD:先加断言 → 跑红 → 实现 → 跑绿。

- [ ] **Step 1**: 在 `src/web/lobby/LoginGate.test.tsx` 末尾(第 84 行 `});` 之后)追加用例。`synthwave` 的 `ac` 是 `#ff6a8a`(见 `artpack.ts`),断言 `#stage` 的内联 `--ac` 等于它:

```ts
test("startup writes the active art-pack accent onto the stage root --ac", async () => {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  localStorage.setItem(ARTPACK_KEY, "synthwave");

  const { container } = render(<App />);

  await waitFor(() => {
    const stage = container.querySelector("#stage") as HTMLElement | null;
    expect(stage?.style.getPropertyValue("--ac")).toBe("#ff6a8a");
  });
});
```

确认文件顶部已 import `App`、`ARTPACK_KEY`、`waitFor`(第 2/4/5 行已有,无需补)。

- [ ] **Step 2**: 跑红:

```bash
bun test src/web/lobby/LoginGate.test.tsx
```

期望:新用例失败(`#stage` 的 `--ac` 为空字符串,根节点尚未注入)。既有用例仍 pass。

- [ ] **Step 3**: 实现 `src/web/App.tsx`。第 9 行 import 补 `ART_PACKS` 与 `ARTPACK_CHANGE_EVENT`、`DEFAULT_ARTPACK`:

```ts
import {
  ART_PACKS,
  ARTPACK_CHANGE_EVENT,
  DEFAULT_ARTPACK,
  applyArtPack,
  loadArtPack,
} from "./hud/artpack";
```

在 `useStageScale` 函数之后、`App` 组件之前(第 46 行附近)新增 hook,返回当前包的 accent 并随事件更新:

```ts
// 当前 artpack 的强调色(--ac):全局根节点跟随。styles.css 多处 var(--ac, …) 消费,
// 但此前只有 Settings 卡片内联注入;这里让 #stage 根节点随包热更新(监听切换事件)。
function useArtPackAccent(): string {
  const [accent, setAccent] = useState<string>(() => artPackAccent(loadArtPack()));
  useEffect(() => {
    const sync = () => setAccent(artPackAccent(loadArtPack()));
    window.addEventListener(ARTPACK_CHANGE_EVENT, sync);
    return () => window.removeEventListener(ARTPACK_CHANGE_EVENT, sync);
  }, []);
  return accent;
}

function artPackAccent(id: string): string {
  const pack = ART_PACKS.find((p) => p.id === id);
  return (pack ?? ART_PACKS.find((p) => p.id === DEFAULT_ARTPACK) ?? ART_PACKS[0])?.ac ?? "#36c5e0";
}
```

补 `useState` 到第 2 行的 react import:

```ts
import { useEffect, useRef, useState } from "react";
```

在 `App()` 内(第 70-71 行 `useStageScale(viewportRef);` 附近)调用:

```ts
  const viewportRef = useRef<HTMLDivElement>(null);
  useStageScale(viewportRef);
  const artPackAc = useArtPackAccent();
```

把 `#stage` 的 style(第 142-145 行)合并 `--ac`。当前为:

```tsx
        <div
          id="stage"
          className={`stage ${settingsRootClass(settings)}`}
          style={settingsRootStyle(settings) as React.CSSProperties}
        >
```

改为(把 `--ac` 并入,放在 spread 之后以胜出):

```tsx
        <div
          id="stage"
          className={`stage ${settingsRootClass(settings)}`}
          style={
            {
              ...settingsRootStyle(settings),
              "--ac": artPackAc,
            } as React.CSSProperties
          }
        >
```

- [ ] **Step 4**: 跑绿 + 类型 + lint:

```bash
bun test src/web/lobby/LoginGate.test.tsx && bunx tsc --noEmit && bun run check
```

期望:LoginGate 全部 pass(含新用例 `--ac` = `#ff6a8a`);tsc 无错(注意 `ART_PACKS.find` 在 `noUncheckedIndexedAccess` 下返回 `ArtPack | undefined`,`artPackAccent` 已用 `?? "#36c5e0"` 兜底);Biome 通过。

- [ ] **Step 5**: Commit。

```bash
git add src/web/App.tsx src/web/lobby/LoginGate.test.tsx
git commit -m "feat: 🧩 follow active art-pack accent on stage root --ac

App 新增 useArtPackAccent():#stage 根节点写当前包 ac 到 --ac,监听
ARTPACK_CHANGE_EVENT 热更新。此前 --ac 只在 Settings 卡片内联,大厅/HUD/
内景的 var(--ac,…) 永远吃 CSS 兜底、不随包切换。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Settings ArtPackGroup 隐藏 pixel-fantasy 卡片(过滤不渲染)

pixel-fantasy 保留为可解析的兜底包(`artpack-assets.ts` 的 `LEGACY_ATLAS_ARTPACK`、`resolveArtPackAtlasUrls` 仍认它),但**不在 Settings 网格里露出**——用户只见 neon-terminal/synthwave 两张卡。

**Files:**
- Modify `src/web/hud/Settings.tsx:740-741`(curPack/pvPack 仍从全量 ART_PACKS 找,保持兜底可解析)、`src/web/hud/Settings.tsx:754-796`(grid map 改用过滤列表)
- Test `src/web/hud/Settings.test.tsx:300-372`(把点 deep-space/holo-blueprint 改成 neon-terminal/synthwave + 新增隐藏断言)

TDD:先改/加断言 → 跑红 → 实现 → 跑绿。

- [ ] **Step 1**: 改 `src/web/hud/Settings.test.tsx`。第 300-322 行「art style preview shows generated UI button kit art」用例,把点击的卡片从 `deep-space` 改为 `neon-terminal`,断言路径同步:

```ts
  await userEvent.click(
    container.querySelector(
      '.artpack-card[data-pk="neon-terminal"]',
    ) as HTMLElement,
  );

  const kit = container.querySelector(".apv-ui-kit") as HTMLElement | null;
  expect(kit).toBeTruthy();
  expect(kit?.style.backgroundImage).toContain(
    "/assets/artpacks/neon-terminal/ui/buttons.png",
  );
```

第 324-372 行「art style preview shows generated NPC tiles props …」用例,把 `holo-blueprint` 全部替换为 `synthwave`(点击选择器第 333-335 行 + 7 个 `expect(...).toContain` 路径第 351-371 行)。逐处把 `holo-blueprint` 改 `synthwave`:

```ts
  await userEvent.click(
    container.querySelector(
      '.artpack-card[data-pk="synthwave"]',
    ) as HTMLElement,
  );
```
```ts
  expect(sheets[0]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/characters/npcs.png",
  );
  expect(sheets[1]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/tiles/environment.png",
  );
  expect(sheets[2]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/items/props.png",
  );
  expect(sheets[3]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/structures/source-sheet.png",
  );
  expect(sheets[4]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/hud/icons.png",
  );
  expect(sheets[5]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/easter/sprites.png",
  );
  expect(sheets[6]?.style.backgroundImage).toContain(
    "/assets/artpacks/synthwave/ui/buttons.png",
  );
```

在第 372 行用例之后追加「隐藏 pixel-fantasy」断言:

```ts
test("art style grid hides the legacy pixel-fantasy pack", async () => {
  useUiStore.setState({ activePanel: "settings" });

  const { container } = render(<Settings />);

  await userEvent.click(
    screen.getByRole("button", { name: /美术风格 Art Style/ }),
  );

  const cards = Array.from(
    container.querySelectorAll(".artpack-card"),
  ) as HTMLElement[];
  const ids = cards.map((el) => el.dataset.pk);
  expect(ids).toEqual(["neon-terminal", "synthwave"]);
  expect(ids).not.toContain("pixel-fantasy");
});
```

- [ ] **Step 2**: 跑红:

```bash
bun test src/web/hud/Settings.test.tsx
```

期望:改后的两条用例此时仍 pass(neon-terminal/synthwave 卡片当前已渲染);新增「hides … pixel-fantasy」用例失败(当前 grid 渲染全量 3 张含 pixel-fantasy,`ids` 为 `["pixel-fantasy","neon-terminal","synthwave"]`)。

- [ ] **Step 3**: 实现 `src/web/hud/Settings.tsx` 的 `ArtPackGroup`。在第 740-741 行(`curPack`/`pvPack` 查找)之后、`return` 之前定义可见列表(过滤 pixel-fantasy);**curPack/pvPack 仍从全量 `ART_PACKS` 解析以保持兜底**:

```ts
  const curPack = ART_PACKS.find((p) => p.id === cur) ?? ART_PACKS[0];
  const pvPack = ART_PACKS.find((p) => p.id === preview) ?? null;
  if (!curPack) return null;

  // pixel-fantasy 保留为可解析的 legacy 兜底,但不在选择网格里露出。
  const visiblePacks = ART_PACKS.filter((p) => p.id !== "pixel-fantasy");
```

把第 755 行的 grid map 数据源从 `ART_PACKS` 换成 `visiblePacks`:

```tsx
        {visiblePacks.map((p) => (
```

(map 内部第 756-794 行卡片渲染不变。)

- [ ] **Step 4**: 跑绿 + lint:

```bash
bun test src/web/hud/Settings.test.tsx && bun run check
```

期望:三条用例全 pass(`ids` 为 `["neon-terminal","synthwave"]`);Biome 通过。

- [ ] **Step 5**: Commit。

```bash
git add src/web/hud/Settings.tsx src/web/hud/Settings.test.tsx
git commit -m "feat: 🧩 hide legacy pixel-fantasy card in art-pack picker

ArtPackGroup 网格过滤 pixel-fantasy(仅留 neon-terminal/synthwave);
curPack/pvPack 仍从全量 ART_PACKS 解析,保持 legacy 兜底可选中。
Settings.test 点击目标 deep-space→neon-terminal、holo-blueprint→synthwave。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 删 holo-blueprint / deep-space 的 i18n 译条 + 同步 artpack-assets / verify-artpack 测试

清掉被删包的中英译条(否则残留死键),并把 atlas 解析测试与 verify 脚本测试里引用被删包的 case 收窄到留存包。

**Files:**
- Modify `src/web/i18n.ts:665-666`(name 译条)、`src/web/i18n.ts:672-675`(desc 译条)
- Test `src/web/artpack-assets.test.ts:35-56`(swap deep-space→synthwave/已留存)、`scripts/art/verify-artpack.test.ts:488-493,529-533,556-560,574-578`(4 个循环包列表 → 2 套)

`artpack-assets.test.ts` 的 fallback 用例(第 20-24 行)已断言 missing-pack → `neon-terminal`(= 新 DEFAULT),无需改;但第 43-56 行 `resolveCurrentArtPackAtlasUrls` 用例第 50 行设了 `deep-space`(被删包)——需换成留存包。TDD:先改断言 → 跑红 → 改实现/数据 → 跑绿。

- [ ] **Step 1**: 改 `src/web/artpack-assets.test.ts`。第 43-56 行用例把 `deep-space` 换成 `synthwave`:

```ts
  localStorage.setItem(ARTPACK_KEY, "synthwave");
  expect(resolveCurrentArtPackAtlasUrls()).toEqual({
    json: "/assets/artpacks/synthwave/atlas/dungeon.json",
    image: "/assets/artpacks/synthwave/atlas/dungeon.png",
    packId: "synthwave",
  });
```

(第 35-41 行「returns runtime artpack atlas for generated packs」已用 `synthwave`,保持不变;第 14-33 行 default/missing/pixel-fantasy 三条不变。)

- [ ] **Step 2**: 改 `scripts/art/verify-artpack.test.ts`。四个循环(第 488-493、529-533、556-560、574-578 行)的包列表全部从四套改为两套留存包:

```ts
    for (const pack of ["neon-terminal", "synthwave"]) {
```

(四处 `for (const pack of [...])` 都改成这一行;循环体内的断言——`atlasFrameCount` 506 行 `381`、`coveredFramesByCategory` 508-517 行计数、`characterFrames.length` 548 行 `106` 等——**不变**,这些是 M1/M2 重烘焙保证的契约,M3 不动。)

- [ ] **Step 3**: 跑红,确认旧测试数据/实现仍引用被删包时失败(这里测试已改但实现/i18n 未改;`artpack-assets` 解析对 synthwave 本就正确,故该文件应已绿;verify 循环改 2 套也应绿——真正的红在 i18n 死键,需 grep 验证):

```bash
bun test src/web/artpack-assets.test.ts scripts/art/verify-artpack.test.ts
```

期望:两个文件 pass(synthwave/neon-terminal 资源在磁盘仍存在,解析与 verify 通过)。若 verify 报某留存包帧数不符,说明 M1/M2 尚未落地——记录后继续(M3 不负责帧数)。

- [ ] **Step 4**: 删 i18n 死键 `src/web/i18n.ts`。删第 665-666 行:

```ts
  全息蓝图: "Holo Blueprint",
  深空舰桥: "Deep-Space Bridge",
```

删第 672-675 行两条 desc 译条:

```ts
  "线框全息投影 · 坐标网格 · 半透冷蓝":
    "Wireframe hologram · coordinate grid · translucent cold blue",
  "星舰指挥桥 · 深空星野 · 暗物质金属":
    "Starship bridge · deep-space starfield · dark-matter metal",
```

(保留第 663-664 行 `像素奇幻`/`霓虹终端`、第 667 行 `合成波`,以及第 668/670/676-677 行留存包的 desc。)

- [ ] **Step 5**: grep 验证无残留被删包引用、无孤儿译键,再跑全量回归 + 类型 + lint:

```bash
grep -rn "holo-blueprint\|deep-space\|全息蓝图\|深空舰桥\|线框全息投影\|星舰指挥桥" src/ scripts/art/*.ts scripts/art/*.test.ts || echo "NO residual references in code/tests"
bun test && bunx tsc --noEmit && bun run check
```

期望:grep 在 `src/`、`scripts/art/` 的 `.ts/.tsx` 里**无任何匹配**(打印 `NO residual references`);`bun test` 全绿;tsc 无错;Biome 通过。
注:`public/assets/artpacks/{holo-blueprint,deep-space}/` 磁盘目录与 `gpt-image-overrides.json` 仍在 git(本 milestone 不 rm,见 openQuestions),grep 限定 `src/`+`scripts/art/*.ts` 故不会命中磁盘资源。

- [ ] **Step 6**: Commit。

```bash
git add src/web/i18n.ts src/web/artpack-assets.test.ts scripts/art/verify-artpack.test.ts
git commit -m "chore: 🧹 drop holo-blueprint/deep-space i18n + narrow atlas/verify tests

删被删包的 name/desc 中英译条;artpack-assets.test 把 current-pack 用例
deep-space→synthwave;verify-artpack.test 四个循环包列表收窄到
['neon-terminal','synthwave'](帧数/分类契约不变,归 M1/M2)。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 端到端验证 + 合并 main

CLAUDE.md 强约束:改用户可见功能合并前须在真实运行的应用里走通用户路径并附证据。本 milestone 用户可见面:(a) Settings 美术风格只剩两张卡、无 pixel-fantasy;(b) 切到 synthwave 后大厅/HUD 的 `--ac` 真的变成 `#ff6a8a`(品红)而非默认青绿;(c) 默认冷启是 neon-terminal。

**Files:** 无(纯验证 + 合并),证据落 worktree 外。

- [ ] **Step 1**: 全量门禁齐绿(在 worktree 内):

```bash
bun test && bun run check && bunx tsc --noEmit
```

期望:三条全绿。记录 worktree HEAD SHA:`git rev-parse HEAD`。

- [ ] **Step 2**: 起 replay engine + web,preview 走真实路径。用回放 fixture 避免烧额度(沿用项目 e2e 配方):

```bash
ROGUENT_PORT=8787 bun run dev:engine -- --replay fixtures/<已有富 markdown fixture>.jsonl &
bun run dev:web
```

用 Claude Preview MCP `preview_start` 指向 `http://localhost:5173`,过 LoginGate 选英雄进大厅,打开 Settings → 美术风格:
- `preview_screenshot` 截图证明 grid **只有 2 张卡(neon-terminal/synthwave)**,无 pixel-fantasy。
- `preview_eval` 断言根节点 --ac 默认(neon-terminal)为青绿:`getComputedStyle(document.querySelector('#stage')).getPropertyValue('--ac')` → `#36c5e0`。
- 点 synthwave 卡 → 确认切换 → `preview_eval` 同一表达式应变为 `#ff6a8a`;`preview_screenshot` 截图证明大厅/HUD 的 `var(--ac,…)` 描边/辉光已转品红(对比切换前后两张图)。

期望证据:两张大厅截图(青绿→品红)+ 两次 `--ac` eval 值 + Settings grid 截图(2 卡)+ 控制台无报错(`preview_console_logs`)。**没拿到这些证据不得宣称完成。**

- [ ] **Step 3**: 回主工作树合并(worktree 优先工作流第 5 步):

```bash
git merge --no-ff <worktree-HEAD-SHA>
```

- [ ] **Step 4**: 合并后重新验证(`bun --watch` engine 合 main 会重启清内存态,UI 验证须重做):

```bash
bun test && bun run check && bunx tsc --noEmit
```

期望:全绿。再次 preview 复核 Settings 两卡 + synthwave 切换 --ac 变色各一张截图(合并后实例)。

- [ ] **Step 5**: 清理 worktree(若用了 worktree):`git worktree remove .worktrees/<slug>`。push 仅在用户要求时执行,本 milestone 不自动 push。


---

# Milestone M4 — 重烘焙 + 视觉验证 + 删旧 + 门禁

## Milestone M4: 重烘 neon+synthwave 高清 atlas + 视觉验证 + 删旧 + 门禁

> 本里程碑**操作性为主**:消费 M1 改好的烘焙脚本(`/usr/bin/python3`)+ HD `dungeon.json` 契约 + HD base atlas png,重新烘焙 `neon-terminal` 与 `synthwave` 两套高清 atlas;跑 verify 自检;preview 真实 app 逐场景视觉验证清晰不糊 + 两套切换无残留;删 `holo-blueprint`/`deep-space` 资源;最后门禁全绿。
>
> **前置依赖(M1 必须先完成,见 openQuestions)**:① 每包 `atlas/dungeon.json` 已是 HD 帧(381 帧,w/h × HD_SCALE,x/y 重排,`meta.size` 放大);② 每包 `atlas/dungeon.png` 已是 HD 画布(`apply_pack` 第 1195 行 `Image.open(atlas_path)` 直接复用现有画布并在 `frame["x"],frame["y"]` 处 paste,旧 128×1178 画布放 HD 坐标会越界);③ HD 版 `public/assets/0x72/dungeon.json` 参照(否则 `verifyAtlasFrameSizes` 逐帧尺寸不匹配)。
>
> Python 解释器固定 **`/usr/bin/python3`**(实测唯一带 PIL 11.3.0 + pytest 8.4.2;homebrew python 无 PIL)。

---

### Task 1: 重新烘焙 neon-terminal 与 synthwave 两套高清 atlas

操作性任务:用 M1 改好的脚本 + 现有高清 source sheet,重生这两套的 `atlas/dungeon.png` + `gpt-image-overrides.json`。烘焙就地改写 `atlas/dungeon.png`(脚本不重排 atlas,只 paste 进帧矩形)和 `atlas/gpt-image-overrides.json`(脚本重生,含 HD `targetSize`)。

**Files:**
- Modify(脚本就地改写产物):`public/assets/artpacks/neon-terminal/atlas/dungeon.png`
- Modify:`public/assets/artpacks/neon-terminal/atlas/gpt-image-overrides.json`
- Modify:`public/assets/artpacks/synthwave/atlas/dungeon.png`
- Modify:`public/assets/artpacks/synthwave/atlas/gpt-image-overrides.json`
- (只读消费)`scripts/art/apply-gpt-image-overrides.py:1189`(`apply_pack`)、`:1285`(`main --pack`)

- [ ] **Step 1**:确认前置——HD 契约与 HD base 画布已就位。脚本第 1216 行 `target_size = (frame["w"], frame["h"])` 从 `dungeon.json` 取目标尺寸;第 1195 行 `atlas = Image.open(atlas_path)` 复用现有画布。先核对两者都是 HD:

```bash
cd /Users/poco/Projects/Roguent
for p in neon-terminal synthwave; do
  /usr/bin/python3 - <<PY
from PIL import Image
import json
d=json.load(open("public/assets/artpacks/$p/atlas/dungeon.json"))
meta=d["meta"]["size"]; png=Image.open("public/assets/artpacks/$p/atlas/dungeon.png").size
knight=d["frames"]["knight_m_idle_anim_f0.png"]["frame"]
print("$p", "json_meta",meta,"png",png,"knight_frame",(knight["w"],knight["h"]),"frames",len(d["frames"]))
PY
done
```

期望输出(HD_SCALE=TILE/16=40/16=2.5;knight 16×28 → 40×70):
```
neon-terminal json_meta {'w': 320, 'h': 2945} png (320, 2945) knight_frame (40, 70) frames 381
synthwave     json_meta {'w': 320, 'h': 2945} png (320, 2945) knight_frame (40, 70) frames 381
```
**验收**:`json_meta == png`(画布与契约一致)、`knight_frame`=(40,70)(HD,非旧 16,28)、`frames`=381。若 `png` 仍是旧 `(128,1178)` 或 `knight_frame`=(16,28) → M1 base png/契约未交付,**停止**,回 M1(见 openQuestions 第 1 条)。

- [ ] **Step 2**:烘焙 neon-terminal(确切命令):

```bash
cd /Users/poco/Projects/Roguent
/usr/bin/python3 scripts/art/apply-gpt-image-overrides.py --pack neon-terminal
```
期望 stdout(脚本 `main` 第 1292-1295 行 print):
```
neon-terminal: 381 frames from characters/npcs.png, easter/sprites.png, enemies/bosses-32x36.png, enemies/enemies-16x16.png, enemies/enemies-16x23.png, hud/icons.png, items/props.png, tiles/environment.png, ui/buttons.png
```
**验收**:打印 `381 frames`、无 `SystemExit: ... missing atlas frames`(第 1246 行)、退出码 0(`echo $?`)。

- [ ] **Step 3**:烘焙 synthwave(确切命令):

```bash
cd /Users/poco/Projects/Roguent
/usr/bin/python3 scripts/art/apply-gpt-image-overrides.py --pack synthwave
```
期望 stdout:`synthwave: 381 frames from ...`(同 Step 2 sourceSheet 列表)。**验收**:同 Step 2。

- [ ] **Step 4**:核对烘焙产物——画布未越界、帧覆盖 381、HD targetSize 已重生:

```bash
cd /Users/poco/Projects/Roguent
for p in neon-terminal synthwave; do
  /usr/bin/python3 - <<PY
from PIL import Image
import json
r=json.load(open("public/assets/artpacks/$p/atlas/gpt-image-overrides.json"))
png=Image.open("public/assets/artpacks/$p/atlas/dungeon.png")
ts=next(f["targetSize"] for f in r["coveredFrames"] if f["frame"]=="knight_m_idle_anim_f0")
print("$p","covered",r["coveredFrameCount"],"atlasFrameCount",r["atlasFrameCount"],"byCat",r["coveredFramesByCategory"]==
  {"characters":106,"enemies":108,"bosses":24,"props":52,"environment":81,"easter":3,"hud":3,"ui":4},
  "knight_targetSize",ts,"png_canvas",png.size)
PY
done
```
期望(每行):`covered 381 atlasFrameCount 381 byCat True knight_targetSize {'w': 40, 'h': 70} png_canvas (320, 2945)`。**验收**:`covered`=`atlasFrameCount`=381、`byCat`=True、`knight_targetSize`=40×70(HD,脚本重生,非旧 16×28)、`png_canvas`=meta.size。

- [ ] **Step 5 (Commit)**:`feat: 🧩 rebake neon-terminal+synthwave HD atlas (381 frames, HD targetSize)`
  - body:`/usr/bin/python3 apply-gpt-image-overrides.py --pack {neon-terminal,synthwave};帧数 381 不变,帧尺寸提到高清档(knight 16×28→40×70,HD_SCALE=2.5);去糊化+LANCZOS 由 M1 脚本承载。`

---

### Task 2: 跑 verify-artpack 自检(帧数 / HD 尺寸契约 / 覆盖率 / 像素硬边 / 降噪)

操作性任务:跑 TS 单测 + CLI 自检,确认两套 HD atlas 符合契约。`verify-artpack.test.ts` 断言 `atlasFrameCount===381` + 分类分布 + `semiAlphaPixels===0` + `environmentTileNoiseScore<=45`;CLI(`verifyArtPackOnDisk`)逐帧尺寸对 HD `0x72` 参照匹配 + override 引用可解析。

**Files:**
- Test(只读跑):`scripts/art/verify-artpack.test.ts:487`(coverage 断言)、`:555`(`semiAlphaPixels===0`)、`:573`(noise≤45)
- Test:`scripts/art/verify-artpack-cli.ts`(`verifyArtPackOnDisk` 逐帧对 `public/assets/0x72/dungeon.json` HD 参照)

- [ ] **Step 1**:跑 verify-artpack 单测(只这一个文件,快反馈):

```bash
cd /Users/poco/Projects/Roguent
bun test scripts/art/verify-artpack.test.ts
```
期望:全绿(含 `generated artpacks report GPT-image runtime frame coverage`、`generated runtime atlases keep hard-edged pixel-art pixels`、`generated environment tiles avoid high-frequency visual noise`)。**验收**:`0 fail`。
**注意**:此文件第 488/529/556/574 行**硬编码遍历 4 套包名**(neon-terminal/holo-blueprint/deep-space/synthwave)。删 holo-blueprint/deep-space 后(Task 4)这些循环会读不到目录而失败——包名循环的改写归属 M1/切换里程碑(见 openQuestions 第 2 条);本 Task 1 阶段(删包前)4 套仍在,应全绿。若此处 neon/synthwave 因 HD `semiAlphaPixels>0` 或 `noise>45` 红 → 回 M1 调 `harden_pixel_art` alpha 阈值(64→96)/ `mix_toward_average` 权重(0.46→0.10/0.08/0.06)。

- [ ] **Step 2**:跑 CLI 全包自检(逐帧尺寸对 HD `0x72` 参照匹配 + override 源可解析):

```bash
cd /Users/poco/Projects/Roguent
bun run verify:artpack
```
期望:`✓ public/assets/artpacks/neon-terminal`、`✓ public/assets/artpacks/synthwave`(+ holo-blueprint/deep-space,删包前)、退出码 0。**验收**:neon-terminal 与 synthwave 两行均 `✓`,无 `frame-size-mismatch`(若有 → `0x72` 参照仍是 16px,M1 未交付 HD 参照,见 openQuestions 第 1 条)、无 `missing-gpt-image-override-frame`/`missing-gpt-image-override-source`。

- [ ] **Step 3**:仅 neon/synthwave 定向 CLI(隔离两套目标包,排除其他包噪声):

```bash
cd /Users/poco/Projects/Roguent
bun run verify:artpack public/assets/artpacks/neon-terminal public/assets/artpacks/synthwave
echo "exit=$?"
```
期望:两行 `✓`、`exit=0`。**验收**:`exit=0`。

- [ ] **Step 4 (Commit)**:无产物改动则跳过 commit(本 Task 纯验证)。若 Step 1-3 暴露需 M1 回调的参数问题,记录在整合 openQuestions,不在 M4 内改脚本。

---

### Task 3: preview 视觉验证——默认 neon-terminal 逐场景清晰不糊 + 切 synthwave 全场景换皮

操作性任务:用 preview MCP 在真实运行的 app 里走完整路径,逐项截图为证。证据要求:**每场景一张截图 + 控制台无报错 DOM 断言**。

**Files:**
- (只读消费,验证目标界面)`src/web/lobby/HubPlaza.tsx`(大厅广场/任务台/扭蛋机)、`src/web/room/Room.tsx`+`DungeonRoom.tsx`+`Character.tsx`(内景房间/NPC 小人)、`src/web/hud/HeroPortrait.tsx`(聊天窗口 portrait)、`src/web/hud/Settings.tsx`(artpack 切换卡片)
- (只读)`tests/e2e/helpers.ts:35`(`DEFAULT_SETTINGS` localStorage 种子)

- [ ] **Step 1**:起 replay engine(零额度,富场景 fixture)。后台跑,记下 stdout 的 `PORT=<n>`:

```bash
cd /Users/poco/Projects/Roguent
bun run src/engine/server.ts --replay fixtures/e2e-full.jsonl
```
期望 stdout 出现 `PORT=<n>`(临时端口)。**验收**:打印 `PORT=` 行;记下端口号备 Step 3 用。(并行另起 Vite:`bun run dev:web` → `http://localhost:5173`。)

- [ ] **Step 2**:用 preview 工具 `mcp__Claude_Preview__preview_start` 起会话,然后 `mcp__Claude_Preview__preview_eval` 注入 localStorage 种子(默认包 = neon-terminal,跳过登录门):

```js
// preview_eval 注入(在 preview_start 后、导航前)
localStorage.setItem("roguent:settings", JSON.stringify({
  accent:"#36c5e0", theme:"teal", motion:true, density:"comfy",
  cjkPixel:true, avatarHero:"knight_m"
}));
localStorage.setItem("roguent_artpack", "neon-terminal");
```
然后导航到 `http://localhost:5173/?engine=ws://127.0.0.1:<Step1 端口>`。**验收**:页面加载,无 ErrorOverlay。

- [ ] **Step 3**:默认 neon-terminal 逐场景截图(`mcp__Claude_Preview__preview_screenshot`),每项确认清晰不糊:
  1. **大厅广场场景** + **任务台**(`HubPlaza.tsx:94`)+ **扭蛋机**(`:127`):截图 `m4-neon-lobby.png`。
  2. **内景房间**:点任务台 → 选一会话进内景(`Room`);截图 `m4-neon-interior.png`(地块/墙/装饰/能量带)。
  3. **NPC 小人**(`Character.tsx` 精灵):内景中至少一个角色精灵,截图 `m4-neon-npc.png`,确认角色不是粗马赛克。
  4. **彩蛋**:回大厅,扭蛋机穹顶 / 任务台(`InteriorEasterLayer`/HubPlaza)截图 `m4-neon-easter.png`。
  5. **聊天窗口 HeroPortrait**(`HeroPortrait.tsx`):打开聊天抽屉,截图 `m4-neon-portrait.png`,确认头像帧清晰。
  **验收**:5 张截图;逐项肉眼确认**清晰不糊**(对比旧糊态:角色边缘锐利、瓦片无均值模糊、portrait 可辨)。`mcp__Claude_Preview__preview_console_logs` 断言**无 error**(无 atlas 加载失败/纹理报错)。

- [ ] **Step 4**:切到 synthwave——开 Settings → artpack 卡片选 synthwave(`mcp__Claude_Preview__preview_click` 点 synthwave 卡片),触发 `applyArtPack`→`ARTPACK_CHANGE_EVENT`→全消费端重载。截图 `m4-synth-settings.png` 确认预览卡片。**验收**:卡片选中态;`localStorage.roguent_artpack === "synthwave"`(`preview_eval` 读断言)。

- [ ] **Step 5**:synthwave 全场景换皮验证——重复 Step 3 的 5 个场景(大厅/内景/NPC/彩蛋/portrait),截图前缀 `m4-synth-*.png`。**验收**:5 张截图;每张确认**已换成 synthwave 配色**(品红/青,非 neon 青绿)、**无 neon 残留素材**、**清晰不糊**;`preview_console_logs` 无 error。**accent 全局**:断言根节点 `--ac` 已变(`document.documentElement` 或卡片 `--ac`=`#ff6a8a` synthwave 色;若 M1/切换里程碑已把 `--ac` 写进根节点则验全局,否则验 Settings 卡片内联)。

- [ ] **Step 6**:两套来回切幂等无黑屏——synthwave→neon-terminal→synthwave 各切一次(`preview_click` 卡片),每切后大厅截图 `m4-swap-1.png`/`m4-swap-2.png`/`m4-swap-3.png`。**验收**:每次切换后场景正常渲染、**无黑屏/无加载失败**(fallback 未触发)、`preview_console_logs` 无 error;末态 = synthwave 与首态一致(幂等)。

- [ ] **Step 7**:收尾——`mcp__Claude_Preview__preview_stop`;杀掉 Step 1 的 replay engine 与 Vite。**验收**:进程清理。证据:Step 3/5/6 的 13 张截图 + 控制台无 error 日志,作为本里程碑视觉证据(写进 PR/汇报,不写 .md 报告文件)。

> ⚠️ headless preview 注意(项目记忆 e2e-verification-harness):rAF 节流下大厅小人移动测不了——本验证只断言**静态渲染清晰度 + 换皮正确性**,不依赖角色游走动画;先拿截图证据再下结论,不把局部成功说成全量。

---

### Task 4: 删 holo-blueprint + deep-space 资源目录

操作性任务:删两套旧包的整个资源目录。`artpack.ts`/`i18n.ts`/`verify-artpack.test.ts` 的代码侧删除归属 M1/切换里程碑(见 openQuestions 第 2 条);本 Task 只删 `public/assets` 资源。

**Files:**
- Delete:`public/assets/artpacks/holo-blueprint/`(整目录)
- Delete:`public/assets/artpacks/deep-space/`(整目录)

- [ ] **Step 1**:删两套资源目录:

```bash
cd /Users/poco/Projects/Roguent
git rm -r public/assets/artpacks/holo-blueprint public/assets/artpacks/deep-space
ls public/assets/artpacks/
```
期望 `ls` 输出仅:`neon-terminal` 与 `synthwave`(两行)。**验收**:`holo-blueprint`/`deep-space` 已不在;`git status` 显示两目录全部文件 staged 为 deleted。

- [ ] **Step 2**:确认无悬挂代码引用旧包资源路径(资源层):

```bash
cd /Users/poco/Projects/Roguent
grep -rn "artpacks/holo-blueprint\|artpacks/deep-space" src/ scripts/ public/ 2>/dev/null
echo "grep_exit=$?"
```
期望:无输出、`grep_exit=1`(无匹配)。**验收**:`grep_exit=1`。若有匹配(如 `artpack.ts` 的 ART_PACKS 仍含 holo/deep、或 `verify-artpack.test.ts` 循环含旧包名)→ 这些是 M1/切换里程碑的代码删除范围,记录到整合 openQuestions,不在 M4 资源 Task 内改 TS。

- [ ] **Step 3 (Commit)**:`chore: 🧹 remove holo-blueprint+deep-space artpack assets`
  - body:`保留 neon-terminal+synthwave(冷色,色差最大);pixel-fantasy 隐藏当兜底。代码侧 ART_PACKS/i18n/verify 循环删除由切换里程碑承载。`

---

### Task 5: 门禁——bun test + tsc + check + build 全绿

操作性任务:四道门禁全绿。前提:M1/切换里程碑已对齐 `verify-artpack.test.ts` 包名循环 + `artpack.test.ts`/`artpack-assets.test.ts` 断言(删包后)。

**Files:**
- (只读跑)全仓单测、`tsconfig`、Biome、Vite build

- [ ] **Step 1**:全量单测:

```bash
cd /Users/poco/Projects/Roguent
bun test 2>&1 | tail -20
```
期望:`0 fail`。**验收**:无 fail。**注意**:`verify-artpack.test.ts:488/529/556/574` 的 4 套包名循环、`artpack.test.ts`(长度/DEFAULT/ready 列表)、`artpack-assets.test.ts`(fallback)删 holo/deep 后必须已由 M1/切换里程碑改成现存包集(neon-terminal/synthwave[/pixel-fantasy]),否则此处红——若红且根因是这些循环未改,**回切换里程碑**修正后重跑(见 openQuestions 第 2 条)。

- [ ] **Step 2**:类型检查(`noUncheckedIndexedAccess` 强约束,Biome 抓不到):

```bash
cd /Users/poco/Projects/Roguent
bunx tsc --noEmit
echo "tsc_exit=$?"
```
期望:无输出、`tsc_exit=0`。**验收**:`tsc_exit=0`。

- [ ] **Step 3**:Biome lint+format:

```bash
cd /Users/poco/Projects/Roguent
bun run check
echo "check_exit=$?"
```
期望:`check_exit=0`(Checked N files,无 error)。**验收**:`check_exit=0`。

- [ ] **Step 4**:Vite 生产构建(确认 HD atlas 资源被正确打包、无引用断裂):

```bash
cd /Users/poco/Projects/Roguent
bun run build 2>&1 | tail -15
echo "build_exit=$?"
```
期望:`✓ built in ...`、`build_exit=0`、无 `Could not resolve`/缺失资源报错。**验收**:`build_exit=0`。

- [ ] **Step 5 (Commit)**:无源码改动则跳过(纯验证);若四道门禁通过,本里程碑收口。汇报附:Task 1-2 的 verify 输出、Task 3 的 13 张 preview 截图 + 控制台无 error、Task 4 的删包确认、本 Task 四道门禁退出码全 0。

> 测试纪律(CLAUDE.md):不把局部通过说成全量通过;`bun run check` 只 Biome 不查类型,改 TS 必单独 `bunx tsc --noEmit`(本里程碑 M4 不改 TS,但门禁仍全跑)。worktree 工作流:本里程碑在 detached worktree 完成,验证通过 → 回主树 `git merge --no-ff <sha>` → 合并后**重跑 Task 5 门禁 + Task 3 preview 复验**(`bun --watch` engine 合并时会重启清内存,preview 需重新种 localStorage)。
