import { expect, test } from "bun:test";
import { readPluginCatalog } from "./catalog";

const CFG = "tests/fixtures/plugins/cfg";

function byId(id: string) {
  return readPluginCatalog({ configDir: CFG }).find((p) => p.id === id);
}

test("合并出全部市场的插件(official 3 + tide 1)", () => {
  const all = readPluginCatalog({ configDir: CFG });
  expect(all.length).toBe(4);
  expect(all.map((p) => p.id).sort()).toEqual(
    [
      "alpha-mcp@official",
      "beta-skill@official",
      "gamma-cmd@official",
      "tide@tide",
    ].sort(),
  );
});

test("alpha-mcp:已装已启用、MCP 类型、真实安装数、displayName 优先", () => {
  const p = byId("alpha-mcp@official");
  expect(p).toBeDefined();
  expect(p?.name).toBe("Alpha MCP");
  expect(p?.marketplace).toBe("official");
  expect(p?.author).toBe("anthropic");
  expect(p?.category).toBe("development");
  expect(p?.componentType).toBe("MCP");
  expect(p?.hasMcp).toBe(true);
  expect(p?.installs).toBe(1000);
  expect(p?.installed).toBe(true);
  expect(p?.enabled).toBe(true);
});

test("beta-skill:已装未启用 → installed=true enabled=false、Skills 类型", () => {
  const p = byId("beta-skill@official");
  expect(p?.componentType).toBe("Skills");
  expect(p?.hasSkills).toBe(true);
  expect(p?.installed).toBe(true);
  expect(p?.enabled).toBe(false);
});

test("gamma-cmd:纯命令 → 插件 类型、未安装", () => {
  const p = byId("gamma-cmd@official");
  expect(p?.componentType).toBe("插件");
  expect(p?.hasMcp).toBe(false);
  expect(p?.hasSkills).toBe(false);
  expect(p?.installed).toBe(false);
});

test("tide:无 catalog → installs=null,回落 name", () => {
  const p = byId("tide@tide");
  expect(p?.name).toBe("tide");
  expect(p?.installs).toBeNull();
});

test("缺文件容错:不存在的 configDir 返回空数组不抛", () => {
  expect(
    readPluginCatalog({ configDir: "tests/fixtures/plugins/__missing__" }),
  ).toEqual([]);
});
