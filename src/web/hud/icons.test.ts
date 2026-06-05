import { describe, expect, it } from "bun:test";
import { ICON_ART, ICON_NAMES } from "./icons";

const EXPECTED_NAMES = [
  "heart",
  "gem",
  "coins",
  "gemcur",
  "laurel",
  "spellbook",
  "pouch",
  "chat",
  "crystal",
  "import",
  "quest",
  "shop",
  "trophy",
  "gear",
  "menu",
  "account",
  "pause",
  "read",
  "write",
  "bash",
  "search",
  "task",
  "mcp",
  "ask",
  "todo",
  "idle",
  "done",
  "error",
  "compact",
  "claude",
  "codex",
  "save",
  "vault",
] as const;

describe("ICON_NAMES", () => {
  it("contains exactly 33 icons", () => {
    expect(ICON_NAMES).toHaveLength(33);
  });

  it("contains every expected name", () => {
    const nameSet = new Set<string>(ICON_NAMES);
    for (const name of EXPECTED_NAMES) {
      expect(nameSet.has(name)).toBe(true);
    }
  });

  it("has no unexpected names", () => {
    const expectedSet = new Set<string>(EXPECTED_NAMES);
    for (const name of ICON_NAMES) {
      expect(expectedSet.has(name)).toBe(true);
    }
  });
});

describe("ICON_ART data integrity", () => {
  it("every icon has a non-empty rect array", () => {
    for (const name of ICON_NAMES) {
      const rects = ICON_ART[name];
      expect(rects).toBeDefined();
      expect(rects!.length).toBeGreaterThan(0);
    }
  });

  it("every rect has finite numeric x, y, w, h", () => {
    for (const name of ICON_NAMES) {
      const rects = ICON_ART[name] ?? [];
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i]!;
        expect(Number.isFinite(rect.x)).toBe(true);
        expect(Number.isFinite(rect.y)).toBe(true);
        expect(Number.isFinite(rect.w)).toBe(true);
        expect(Number.isFinite(rect.h)).toBe(true);
      }
    }
  });

  it("every rect has a non-empty color string", () => {
    for (const name of ICON_NAMES) {
      const rects = ICON_ART[name] ?? [];
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i]!;
        expect(typeof rect.c).toBe("string");
        expect(rect.c.length).toBeGreaterThan(0);
      }
    }
  });
});
