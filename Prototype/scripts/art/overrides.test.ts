import { describe, expect, it } from "bun:test";
import { renderOverridesJs } from "./overrides";

describe("overrides.js 生成", () => {
  it("产出 window.ART_OVERRIDE,含 theme 与 map", () => {
    const js = renderOverridesJs("cyber");
    expect(js).toContain("window.ART_OVERRIDE");
    expect(js).toContain('"theme": "cyber"');
    expect(js).toContain('"knight_m": "knight_m"');
    expect(js).toContain('"wall_top_mid": "wall_top"');
    expect(js).toContain('"coin_anim_f3": "coin"');
  });

  it("声明主角 run 覆盖动画帧", () => {
    const js = renderOverridesJs("cyber");
    expect(js).toContain('"animations"');
    expect(js).toContain('"knight_m"');
    expect(js).toContain('"run"');
    expect(js).toContain('"prefix": "knight_m_run_f"');
    expect(js).toContain('"count": 8');
    expect(js).toContain('"fps": 12');
  });

  it("拒绝未知 theme", () => {
    expect(() => renderOverridesJs("unknown")).toThrow(
      "--theme 必须是 cyber / lofi",
    );
  });
});
