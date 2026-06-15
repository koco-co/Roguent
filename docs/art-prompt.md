全局前缀（拼在每条最前）

16x16 dungeon-tileset pixel art, exact style and grid of "0x72 DungeonTileset II",

hard pixel edges, NO anti-aliasing, transparent background (NOT white),

front-facing slight top-down 3/4 view, top-left light, unified limited palette,

sci-fi "vibe coding" theme: glowing terminal runes, holographic UI, neon circuitry.

玩家英雄（16×28，idle f0–3 + run f0–7 一行）

{前缀}

Character sprite sheet, 8 frames in ONE horizontal row, each 16x28 px,

frames 0-3 = idle (breathing bob), frames 4-7 = run cycle.

Character: ROLE recast as sci-fi coding-agent operative —

knight→exosuit paladin w/ glowing visor & shield bracer; wizzard→hooded netrunner mage w/ floating glyphs, antenna staff; elf→sleek android scout w/ light-blade; dwarf→stocky engineer w/ AR goggles & plasma wrench; lizard→reptilian hacker w/ circuit-scale skin; goblin→tiny drone-gremlin.

Identical silhouette across frames, transparent bg, no baked shadow.

命名 knight_m_idle_f0..3 / knight_m_run_f0..3（前缀：knight_m knight_f wizzard_m wizzard_f elf_m elf_f dwarf_m dwarf_f lizard_m lizard_f goblin(16×16) doc(16×23)）

敌人 / Boss

{前缀}

Enemy sprite sheet, idle f0-3 (+ run f0-3 if original has them), each WxH px.

NAME as sci-fi corruption — imp/chort/demon→rogue daemon process, red error-glow, glitch; zombie/necromancer→corrupted legacy-code revenant leaking green data; orc/ogre→brute compute-node golem w/ exposed heatsinks & warning decals.

Menacing readable silhouette, transparent bg.

（16×16: imp angel ice_zombie muddy ｜ 16×23: chort masked_orc orc_shaman orc_warrior necromancer swampy zombie skelet wogol ｜ 32×36: big_demon big_zombie ogre）

道具

{前缀}

Small item, 16x16 px (or N frames in a row), transparent bg.

NAME reskin — coin→glowing data-token chip, spins (6x7, 4f); flask→vial of luminescent code-serum, color=type; chest→metal supply cache w/ holo-lock (closed→open, 3f); mimic→same cache w/ teeth + red sensor eye (3f); bomb→unstable process core, blinking fuse (3f); sword→plasma blade; crate→16x24 tech-container; skull→drone husk.

Crisp centered, no white bg.

环境地块（可平铺）

{前缀}

Seamless tileable 16x16 tile (must tile on all 4 edges).

NAME reskin — floor→dark hexagonal tech-panel deck w/ faint circuit seams; grass→bioluminescent data-turf w/ cyan glow specks; wall→brushed-metal bulkhead w/ rivets & top warning stripe; banner→hanging holo-flag (keep red/blue/green/yellow); fountain→glowing coolant core (animated); doors→neon-framed blast-door (closed & open, 32x32); column→16x48 support strut.

Fills full cell, NO white bg.

（floor_1..8 grass grass2 ground hole floor_stairs floor_ladder floor_spikes_f0..3 edge-* wall_mid wall_top_mid wall_banner_* column column_wall doors_leaf_closed/open doors_frame_* wall_fountain_top_1/mid_blue/basin_blue）

CSS 结构件（出独立透明 PNG）

{前缀}

Standalone structure, transparent bg, front 3/4 view, ~WxH px.

NAME reskin — gacha machine→holographic loot-dispenser pod, dome of floating capsule-orbs, neon dispense slot, glowing crank; wishing fountain→data/coolant spring w/ glowing bits rising; quest tower→holo-beacon spire projecting a rotating quest rune; market stall→tech-vendor kiosk w/ glowing awning (accent color per stall); announce board→floating LED bulletin panel; mailbox→drone-delivery dropbox w/ status LED; runtime door→labeled portal arch (Claude=cyan / Codex=green).

Chunky pixel-art, reads as a clickable building.

（扭蛋机大厅92×130/弹窗200×260 ｜ 许愿池92×104 ｜ 任务塔140×200 ｜ 摊位120×120 ｜ 公告板140×120 ｜ 邮箱64×96 ｜ 传送门80×120）

HUD 图标（16×16）

{前缀}

16x16 UI glyph, transparent bg, bold 2px dark outline, single focal shape, sci-fi vibe-coding HUD.

Meaning: NAME — heart=HP, gem=mana, coins=currency, gear=settings, quest=scroll, crystal=AI model, mcp=plug, claude/codex=runtime sigil, trophy/medal/mail/search/task/done/error/compact…

Reads clearly at 16px, flat limited palette.

（清单：heart gem coins gemcur laurel spellbook pouch chat crystal import quest shop trophy gear menu account pause read write bash search task mcp ask todo idle done error compact claude codex save vault mail medal link scene）

彩蛋

{前缀}

pet→small companion robo-cat/drone, idle 4 frames, blinks + tail twitch, cute, 16x16;

mimic→supply-cache disguised as normal chest then reveals teeth + red eye, 3 frames, 16x16.

Transparent bg.

五套风格修饰词（接在前缀后，保证每套包统一）

像素奇幻：warm torch-lit dungeon, parchment & wood, gold trim

霓虹终端：CRT scanlines, phosphor green/cyan, dark teal, command-line glow

全息蓝图：translucent wireframe holograms, blueprint grid, cool blue on near-black

深空舰桥：starship bridge, deep-space starfield, dark-matter metal, violet console glow

合成波：80s sunset gradient, magenta-cyan perspective grid, chrome, vector neon

输出规格

透明 PNG · 正面略俯视 3/4 · 角色 idle×4+run×4 排一行 · 每套包统一有限色板 · 命名 name_idle_f0..3/name_run_f0..3 · 尺寸与坐标必须与 atlas-frames.js 原值逐一对应，只换画风不换布局。