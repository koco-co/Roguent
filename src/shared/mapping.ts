// tool_name → icon name (spec §6.2). Values are IconName strings from the
// pixel icon registry (src/web/hud/icons.tsx); shared/ cannot import web/.
export const TOOL_ICONS: Record<string, string> = {
  Read: "read",
  Glob: "read",
  Grep: "read",
  Edit: "write",
  Write: "write",
  NotebookEdit: "write",
  Bash: "bash",
  WebSearch: "search",
  WebFetch: "search",
  Task: "task",
  Agent: "task",
  TodoWrite: "todo",
  TaskCreate: "todo",
};

/** Returns an icon-name string (castable to IconName on the web side).
 *  mcp__ prefix → "mcp"; unknown tools → "task". */
export function toolNameToIcon(name: string): string {
  if (name.startsWith("mcp__")) return "mcp";
  return TOOL_ICONS[name] ?? "task";
}

export const SKINS = ["cyan", "mag", "grn", "gold", "purple"] as const;

export function agentTypeToSkin(agentType: string): string {
  let h = 0;
  for (const ch of agentType) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SKINS[h % SKINS.length] as string;
}

// 0x72 hero sprite bases used for subagents. The orchestrator is the gold
// knight (handled by the renderer); subagents pick a stable hero from this
// pool by hashing their agentType so each role reads as a distinct character.
export const HERO_POOL = [
  "wizzard_m",
  "elf_f",
  "lizard_m",
  "dwarf_m",
  "wizzard_f",
  "elf_m",
  "knight_f",
  "lizard_f",
  "dwarf_f",
  "orc_warrior",
] as const;

export const ORCHESTRATOR_HERO = "knight_m";

export function roleToHero(role: string): string {
  let h = 0;
  for (const ch of role) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HERO_POOL[h % HERO_POOL.length] as string;
}
