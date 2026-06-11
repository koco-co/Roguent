import { expect, test } from "bun:test";
import { holoHash, holoNodes } from "./holo";

test("holoHash 确定性且落 [0,1)", () => {
  expect(holoHash(3, 5)).toBe(holoHash(3, 5));
  expect(holoHash(3, 5)).toBeGreaterThanOrEqual(0);
  expect(holoHash(3, 5)).toBeLessThan(1);
});
test("holoNodes 只产出 hash<0.5 的稀疏节点且坐标在界内", () => {
  const nodes = holoNodes(20, 12);
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) {
    expect(n.c).toBeGreaterThanOrEqual(2);
    expect(n.c).toBeLessThan(20);
    expect(n.r).toBeGreaterThanOrEqual(3);
    expect(n.r).toBeLessThan(12);
    expect(n.a).toBeGreaterThanOrEqual(0.18);
  }
});
