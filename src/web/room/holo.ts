/** 确定性伪随机(对标设计 room.jsx 的 hash):同输入永远同输出,便于测试与回放一致。 */
export function holoHash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export interface HoloNode {
  c: number;
  r: number;
  a: number;
}

/** 发光网格交点(稀疏):行 3..ROWS-1 步进 2,列 2..COLS-1 步进 3,hash<0.5 取点。 */
export function holoNodes(cols: number, rows: number): HoloNode[] {
  const out: HoloNode[] = [];
  for (let r = 3; r < rows; r += 2) {
    for (let c = 2; c < cols; c += 3) {
      const h = holoHash(c * 9 + 1, r * 5 + 3);
      if (h < 0.5) out.push({ c, r, a: 0.18 + h * 0.5 });
    }
  }
  return out;
}
