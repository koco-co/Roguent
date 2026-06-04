// tool_name → 头顶图标 (spec §6.2). Map is intentionally overridable.
export const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Glob: "📖",
  Grep: "📖",
  Edit: "⌨️",
  Write: "⌨️",
  NotebookEdit: "⌨️",
  Bash: "🧪",
  WebSearch: "🔍",
  WebFetch: "🔍",
  Task: "🪄",
  Agent: "🪄",
  TodoWrite: "📋",
  TaskCreate: "📋",
};

export function toolNameToIcon(name: string): string {
  if (name.startsWith("mcp__")) return "🔌";
  return TOOL_ICONS[name] ?? "⚡";
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
