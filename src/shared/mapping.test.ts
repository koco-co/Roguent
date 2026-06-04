import { expect, test } from "bun:test";
import { agentTypeToSkin, toolNameToIcon } from "./mapping";

test("toolNameToIcon maps known tools, mcp, and unknown", () => {
  expect(toolNameToIcon("Read")).toBe("📖");
  expect(toolNameToIcon("Edit")).toBe("⌨️");
  expect(toolNameToIcon("Bash")).toBe("🧪");
  expect(toolNameToIcon("WebSearch")).toBe("🔍");
  expect(toolNameToIcon("Task")).toBe("🪄");
  expect(toolNameToIcon("mcp__github__create_pr")).toBe("🔌");
  expect(toolNameToIcon("SomethingNew")).toBe("⚡");
});

test("agentTypeToSkin is deterministic and within palette", () => {
  const a = agentTypeToSkin("researcher");
  expect(a).toBe(agentTypeToSkin("researcher"));
  expect(["cyan", "mag", "grn", "gold", "purple"]).toContain(a);
});
