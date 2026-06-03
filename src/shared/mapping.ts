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
