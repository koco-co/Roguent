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
});
