import { expect, test } from "bun:test";
import { agentTypeToSkin, toolNameToIcon } from "./mapping";

test("toolNameToIcon maps known tools, mcp, and unknown", () => {
  expect(toolNameToIcon("Read")).toBe("read");
  expect(toolNameToIcon("Edit")).toBe("write");
  expect(toolNameToIcon("Bash")).toBe("bash");
  expect(toolNameToIcon("WebSearch")).toBe("search");
  expect(toolNameToIcon("Task")).toBe("task");
  expect(toolNameToIcon("Agent")).toBe("task"); // SDK renamed Task→Agent (CLAUDE.md §8.4)
  expect(toolNameToIcon("TodoWrite")).toBe("todo");
  expect(toolNameToIcon("mcp__foo__bar")).toBe("mcp");
  expect(toolNameToIcon("Frobnicate")).toBe("task");
});

test("agentTypeToSkin is deterministic and within palette", () => {
  const a = agentTypeToSkin("researcher");
  expect(a).toBe(agentTypeToSkin("researcher"));
  expect(["cyan", "mag", "grn", "gold", "purple"]).toContain(a);
});
