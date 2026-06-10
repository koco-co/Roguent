// Virtual room geometry, shared by the renderer and the tilemap. The room is
// laid out in 16px tiles and integer-scaled to fit the canvas (see Room.tsx).
export const TILE = 16;
export const COLS = 24;
export const ROWS = 14;
export const VW = COLS * TILE; // 384 virtual px
export const VH = ROWS * TILE; // 224 virtual px

// Decor anchor columns, shared by the tilemap and the lighting layer so the
// glows line up with the doorway and fountains.
export const DOOR_COL = Math.floor(COLS / 2);
export const FOUNTAIN_COLS = [4, COLS - 5] as const;
