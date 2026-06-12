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

// ── 回归测试:畸形 marketplace manifest 不崩 catalog ─────────────────────────

/** 构造一个最小 readText,把给定 marketplace 的 manifest 替换成指定内容。 */
function readTextWithBadMarketplace(badManifestJson: string) {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  return (filePath: string): string | null => {
    // 注入 known_marketplaces.json 使 "bad" 市场指向 /tmp/bad-market
    if (filePath.endsWith("known_marketplaces.json")) {
      return JSON.stringify({
        official: { installLocation: path.resolve(CFG, "../official-market") },
        bad: { installLocation: "/tmp/bad-market" },
      });
    }
    // 注入畸形 manifest
    if (filePath === "/tmp/bad-market/.claude-plugin/marketplace.json") {
      return badManifestJson;
    }
    // 注入 official marketplace.json (正常,一个插件)
    if (filePath.endsWith("official-market/.claude-plugin/marketplace.json")) {
      return JSON.stringify({
        plugins: [{ name: "good-plugin", displayName: "Good Plugin" }],
      });
    }
    // 其余文件走真实 FS
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  };
}

test("畸形 manifest — plugins 是对象而非数组:跳过该市场、不抛", () => {
  const result = readPluginCatalog({
    configDir: CFG,
    readText: readTextWithBadMarketplace(
      JSON.stringify({ plugins: { foo: "bar" } }),
    ),
  });
  // "bad" 市场被跳过,只保留 official 那一条
  expect(result.some((p) => p.marketplace === "bad")).toBe(false);
  expect(result.some((p) => p.marketplace === "official")).toBe(true);
});

test("畸形 manifest — plugins 数组含 null/非对象:跳过坏条目、正常条目保留", () => {
  const result = readPluginCatalog({
    configDir: CFG,
    readText: readTextWithBadMarketplace(
      JSON.stringify({
        plugins: [null, 42, "string", { name: "valid-plugin" }, null],
      }),
    ),
  });
  // null 等条目被跳过,valid-plugin 被收录
  expect(result.some((p) => p.id === "valid-plugin@bad")).toBe(true);
  expect(result.filter((p) => p.marketplace === "bad").length).toBe(1);
});

test("重复 id 去重:后出现的同 id 条目被丢弃", () => {
  // 两个市场输出同名插件 → id 相同 → 只保留第一个
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const dupReadText = (filePath: string): string | null => {
    if (filePath.endsWith("known_marketplaces.json")) {
      return JSON.stringify({
        mktA: { installLocation: "/tmp/dup-a" },
        mktB: { installLocation: "/tmp/dup-b" },
      });
    }
    if (filePath === "/tmp/dup-a/.claude-plugin/marketplace.json") {
      return JSON.stringify({
        plugins: [{ name: "dup-plugin", displayName: "From A" }],
      });
    }
    if (filePath === "/tmp/dup-b/.claude-plugin/marketplace.json") {
      return JSON.stringify({
        plugins: [{ name: "dup-plugin", displayName: "From B" }],
      });
    }
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  };
  const result = readPluginCatalog({ configDir: CFG, readText: dupReadText });
  const dups = result.filter((p) => p.name === "From A" || p.name === "From B");
  // 两个市场不同 id (dup-plugin@mktA vs dup-plugin@mktB) — no actual dup
  // 真正的 dup: 相同 id 只能来自同市场重复条目
  const sameIdReadText = (filePath: string): string | null => {
    if (filePath.endsWith("known_marketplaces.json")) {
      return JSON.stringify({ mkt: { installLocation: "/tmp/dup-same" } });
    }
    if (filePath === "/tmp/dup-same/.claude-plugin/marketplace.json") {
      return JSON.stringify({
        plugins: [
          { name: "same", displayName: "First" },
          { name: "same", displayName: "Second" },
        ],
      });
    }
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  };
  const r2 = readPluginCatalog({ configDir: CFG, readText: sameIdReadText });
  const sameIds = r2.filter((p) => p.id === "same@mkt");
  expect(sameIds.length).toBe(1);
  expect(sameIds[0]?.name).toBe("First"); // first-wins
});
