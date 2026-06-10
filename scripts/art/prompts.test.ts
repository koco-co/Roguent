import { describe, expect, it } from "bun:test";
import {
  ASSETS,
  OVERRIDE_MAP,
  THEMES,
  assemblePrompt,
  listJobs,
} from "./prompts";

describe("prompts", () => {
  it("30 资产、2 主题、60 个 job", () => {
    expect(Object.keys(ASSETS)).toHaveLength(30);
    expect(THEMES).toEqual(["cyber", "lofi"]);
    expect(listJobs()).toHaveLength(60);
  });

  it("assemblePrompt 含风格前缀 + 主体 + 构图 + avoid(含 dungeon 防回退)", () => {
    const p = assemblePrompt("cyber", "knight_m");
    expect(p).toContain("Cyberpunk neon");
    expect(p).toContain("Orchestrator");
    expect(p).toContain("Full body");
    expect(p).toContain("avoid:");
    expect(p).toContain("dungeon");
  });

  it("同资产 cyber/lofi 主体不同", () => {
    expect(assemblePrompt("cyber", "floor_1")).toContain("metal");
    expect(assemblePrompt("lofi", "floor_1")).toContain("wood");
  });

  it("OVERRIDE_MAP 每个 value 都是合法 assetId", () => {
    const ids = new Set(Object.keys(ASSETS));
    for (const aid of Object.values(OVERRIDE_MAP)) {
      expect(ids.has(aid)).toBe(true);
    }
  });

  it("OVERRIDE_MAP 覆盖了 12 个角色 base + 关键场景帧", () => {
    for (const base of [
      "knight_m",
      "wizzard_m",
      "elf_f",
      "lizard_m",
      "goblin",
      "angel",
    ]) {
      expect(OVERRIDE_MAP[base]).toBe(base);
    }
    expect(OVERRIDE_MAP.wall_top_mid).toBe("wall_top");
    expect(OVERRIDE_MAP.coin_anim_f3).toBe("coin");
    expect(OVERRIDE_MAP["edge-tl"]).toBe("floor_1");
    expect(OVERRIDE_MAP.doors_leaf_closed).toBe("door_leaf");
  });
});
