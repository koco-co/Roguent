import { expect, test } from "bun:test";
import { modelLabel } from "./model-label";

test("maps known model ids to short names", () => {
  expect(modelLabel("claude-opus-4-8")).toBe("Opus 4.8");
  expect(modelLabel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
});

test("falls back to raw id for unknown model", () => {
  expect(modelLabel("gpt-foo")).toBe("gpt-foo");
});

test("returns em dash for missing model", () => {
  expect(modelLabel(undefined)).toBe("—");
});
