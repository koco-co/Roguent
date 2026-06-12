import { expect, test } from "bun:test";
import { npcLabel, titleCase } from "./strings";

test("titleCase upper-cases a single word", () => {
  expect(titleCase("orchestrator")).toBe("Orchestrator");
});

test("titleCase splits on dashes into Title Case words", () => {
  expect(titleCase("code-review")).toBe("Code Review");
});

test("titleCase splits on underscores and whitespace", () => {
  expect(titleCase("data_viz tool")).toBe("Data Viz Tool");
});

test("titleCase returns empty string for empty input", () => {
  expect(titleCase("")).toBe("");
});

test("titleCase ignores leading/trailing/duplicate separators", () => {
  expect(titleCase("--foo__bar  ")).toBe("Foo Bar");
});

test("npcLabel title-cases a non-lead role with no prefix", () => {
  expect(npcLabel("code-review", false)).toBe("Code Review");
});

test("npcLabel adds the gold ★ prefix for the lead", () => {
  expect(npcLabel("orchestrator", true)).toBe("★ Orchestrator");
});

test("npcLabel handles empty role safely", () => {
  expect(npcLabel("", false)).toBe("");
  expect(npcLabel("", true)).toBe("★ ");
});
