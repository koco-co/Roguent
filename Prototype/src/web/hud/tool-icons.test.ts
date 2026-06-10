import { expect, test } from "bun:test";
import { TOOL_ICONS, toolNameToIcon } from "../../shared/mapping";
import { ICON_NAMES } from "./icons";

const KNOWN = new Set<string>(ICON_NAMES);

test("every TOOL_ICONS value is a registered icon name", () => {
  for (const [tool, icon] of Object.entries(TOOL_ICONS)) {
    expect(
      KNOWN.has(icon),
      `TOOL_ICONS["${tool}"] = "${icon}" is not in ICON_NAMES`,
    ).toBe(true);
  }
});

test("toolNameToIcon('mcp__x') resolves to a registered icon", () => {
  const icon = toolNameToIcon("mcp__x");
  expect(KNOWN.has(icon)).toBe(true);
});

test("toolNameToIcon of unknown tool resolves to a registered icon", () => {
  const icon = toolNameToIcon("UnknownTool");
  expect(KNOWN.has(icon)).toBe(true);
});

test("LootPanel kind icon names are all registered", () => {
  const kinds = ["read", "write", "quest", "chat", "pouch"];
  for (const kind of kinds) {
    expect(
      KNOWN.has(kind),
      `LootPanel kind icon "${kind}" is not in ICON_NAMES`,
    ).toBe(true);
  }
});
