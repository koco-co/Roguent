import { expect, test } from "bun:test";
import type { PluginEntry } from "../../shared/events";
import { installedPluginCount } from "./market-counts";

function plugin(overrides: Partial<PluginEntry>): PluginEntry {
  return {
    id: "p@market",
    name: "P",
    marketplace: "market",
    author: null,
    description: "",
    category: null,
    componentType: "插件",
    hasMcp: false,
    hasSkills: false,
    installs: null,
    installed: false,
    enabled: false,
    ...overrides,
  };
}

test("counts only installed plugins", () => {
  const list = [
    plugin({ id: "a", installed: true }),
    plugin({ id: "b", installed: false }),
    plugin({ id: "c", installed: true }),
  ];
  expect(installedPluginCount(list)).toBe(2);
});

test("returns 0 for empty catalog", () => {
  expect(installedPluginCount([])).toBe(0);
});

test("returns 0 when nothing is installed", () => {
  expect(installedPluginCount([plugin({}), plugin({ id: "b" })])).toBe(0);
});
