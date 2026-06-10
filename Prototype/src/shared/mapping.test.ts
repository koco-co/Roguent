import { expect, test } from "bun:test";
import {
  HERO_POOL,
  ORCHESTRATOR_HERO,
  agentTypeToSkin,
  roleToHero,
  toolNameToIcon,
} from "./mapping";

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

test("HERO_POOL invariants: non-empty, unique, excludes orchestrator hero", () => {
  expect(HERO_POOL.length).toBeGreaterThan(0);
  // 无重复(NPC 英雄各异)。
  expect(new Set(HERO_POOL).size).toBe(HERO_POOL.length);
  // 主控英雄独占,不混进 NPC 池(玩家/主控与会话 NPC 视觉可区分)。
  expect(HERO_POOL).not.toContain(ORCHESTRATOR_HERO);
});

test("roleToHero is deterministic and always within HERO_POOL", () => {
  for (const role of ["researcher", "code-review", "", "同名角色", "x"]) {
    const h = roleToHero(role);
    expect(roleToHero(role)).toBe(h); // 同 role → 同 hero(确定性,房间/HUD 一致)
    expect(HERO_POOL as readonly string[]).toContain(h); // 永远落在池内
  }
});

test("roleToHero spreads across the pool (not a constant)", () => {
  // 取一批不同 role,应映出 >1 个不同英雄(哈希散布,不会全挤一个)。
  const roles = Array.from({ length: 40 }, (_, i) => `agent-${i}`);
  const distinct = new Set(roles.map(roleToHero));
  expect(distinct.size).toBeGreaterThan(1);
});
