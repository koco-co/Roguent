import { expect, test } from "bun:test";
import { resolvePort } from "./port";

test("resolvePort: 未设 ROGUENT_PORT → 0(临时端口)", () => {
  expect(resolvePort({})).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "   " })).toBe(0);
});

test("resolvePort: 合法端口原样返回", () => {
  expect(resolvePort({ ROGUENT_PORT: "8787" })).toBe(8787);
  expect(resolvePort({ ROGUENT_PORT: "0" })).toBe(0);
});

test("resolvePort: 非法值回落 0", () => {
  expect(resolvePort({ ROGUENT_PORT: "abc" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "-5" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "65536" })).toBe(0);
  expect(resolvePort({ ROGUENT_PORT: "70000" })).toBe(0);
});
