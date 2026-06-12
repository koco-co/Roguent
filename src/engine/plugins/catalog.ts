import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginComponentType, PluginEntry } from "../../shared/events";

/** 注入式文本读取(默认读真盘,缺失/失败返回 null);测试可覆写。 */
export type ReadText = (path: string) => string | null;

const defaultReadText: ReadText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

function readJson<T>(readText: ReadText, path: string): T | null {
  const raw = readText(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface ManifestPlugin {
  name?: unknown;
  displayName?: unknown;
  description?: unknown;
  author?: { name?: unknown } | unknown;
  category?: unknown;
  skills?: unknown;
}
interface CatalogComponents {
  skills?: unknown[];
  mcpServers?: unknown[];
}
interface CatalogEntry {
  unique_installs?: unknown;
  components?: CatalogComponents;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function authorName(a: ManifestPlugin["author"]): string | null {
  if (a && typeof a === "object" && "name" in a)
    return str((a as { name?: unknown }).name);
  return str(a);
}

function classify(
  catalog: CatalogEntry | undefined,
  manifest: ManifestPlugin,
): { hasMcp: boolean; hasSkills: boolean; componentType: PluginComponentType } {
  // catalog.components 是权威组件源;无 catalog 时从 manifest.skills 兜底。
  const comps = catalog?.components;
  const hasMcp =
    Array.isArray(comps?.mcpServers) && comps.mcpServers.length > 0;
  const hasSkills = comps
    ? Array.isArray(comps.skills) && comps.skills.length > 0
    : Array.isArray(manifest.skills) && manifest.skills.length > 0;
  const componentType: PluginComponentType = hasMcp
    ? "MCP"
    : hasSkills
      ? "Skills"
      : "插件";
  return { hasMcp, hasSkills, componentType };
}

export function readPluginCatalog(opts: {
  configDir: string;
  readText?: ReadText;
}): PluginEntry[] {
  const readText = opts.readText ?? defaultReadText;
  const pluginsDir = join(opts.configDir, "plugins");

  const known =
    readJson<Record<string, { installLocation?: unknown }>>(
      readText,
      join(pluginsDir, "known_marketplaces.json"),
    ) ?? {};
  const catalog =
    readJson<{ catalog?: { plugins?: Record<string, CatalogEntry> } }>(
      readText,
      join(pluginsDir, "plugin-catalog-cache.json"),
    )?.catalog?.plugins ?? {};
  const installed =
    readJson<{ plugins?: Record<string, unknown> }>(
      readText,
      join(pluginsDir, "installed_plugins.json"),
    )?.plugins ?? {};
  const enabled =
    readJson<{ enabledPlugins?: Record<string, boolean> }>(
      readText,
      join(opts.configDir, "settings.json"),
    )?.enabledPlugins ?? {};

  const entries: PluginEntry[] = [];
  for (const [marketplace, mk] of Object.entries(known)) {
    const loc = str(mk?.installLocation);
    if (!loc) continue;
    const manifest = readJson<{ plugins?: ManifestPlugin[] }>(
      readText,
      join(loc, ".claude-plugin", "marketplace.json"),
    );
    if (!manifest?.plugins) continue;
    for (const p of manifest.plugins) {
      const name = str(p.name);
      if (!name) continue;
      const id = `${name}@${marketplace}`;
      const cat = catalog[id];
      const { hasMcp, hasSkills, componentType } = classify(cat, p);
      const installs =
        cat && typeof cat.unique_installs === "number"
          ? cat.unique_installs
          : null;
      entries.push({
        id,
        name: str(p.displayName) ?? name,
        marketplace,
        author: authorName(p.author),
        description: str(p.description) ?? "",
        category: str(p.category),
        componentType,
        hasMcp,
        hasSkills,
        installs,
        installed: id in installed,
        enabled: enabled[id] === true,
      });
    }
  }
  return entries;
}
