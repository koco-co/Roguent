// Virtual room geometry, shared by the renderer and the tilemap. The room is
// laid out in TILE-px tiles and integer-scaled to fit the canvas (see Room.tsx).
// 高清档起步值 TILE=40(原 16);M4 preview 视觉验证后可微调(改这一个常数整体换挡)。
export const TILE = 40;
// 所有「虚拟像素」硬编码常数都按 HD_SCALE = TILE/16 缩放,保持相对 16px 基准的
// tile 比例不变。渲染层(Character/Lights/ToolBubble/Emote/DungeonRoom)用它把
// 阴影/选圈/泡泡/名牌/线宽等魔数参数化,避免散落手改。烘焙侧(apply-gpt-image
// -overrides.py 的 TILE_PX/HD_SCALE)必须与此相等(裁决 2)。
export const HD_SCALE = TILE / 16;
export const COLS = 24;
export const ROWS = 14;
export const VW = COLS * TILE; // 960 virtual px
export const VH = ROWS * TILE; // 560 virtual px

// Decor anchor columns, shared by the tilemap and the lighting layer so the
// glows line up with the doorway and fountain.
export const DOOR_COL = Math.floor(COLS / 2);
// 北墙中央单个壁泉(原型 room.jsx:88-92 的 fx=11*T)。保留数组语义供 GlowLayer/
// DungeonRoom map,但只含一个元素 col 11(原 [4,19] 双泉已还原成单泉)。
export const FOUNTAIN_COLS = [11] as const;
