// Virtual room geometry, shared by the renderer and the tilemap. The room is
// laid out in 16px tiles and integer-scaled to fit the canvas (see Room.tsx).
export const TILE = 16;
export const COLS = 24;
export const ROWS = 14;
export const VW = COLS * TILE; // 384 virtual px
export const VH = ROWS * TILE; // 224 virtual px

// Decor anchor columns, shared by the tilemap and the lighting layer so the
// glows line up with the doorway and fountain.
export const DOOR_COL = Math.floor(COLS / 2);
// 北墙中央单个壁泉(原型 room.jsx:88-92 的 fx=11*T)。保留数组语义供 GlowLayer/
// DungeonRoom map,但只含一个元素 col 11(原 [4,19] 双泉已还原成单泉)。
export const FOUNTAIN_COLS = [11] as const;
