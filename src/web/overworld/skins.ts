// Overworld character skins. The player (the user's avatar) gets a fixed hero
// distinct from both the interior orchestrator (ORCHESTRATOR_HERO = knight_m)
// and the NPC pool, so "you" always read as a single recognisable character.
// Each session NPC hashes its id into the pool for a stable per-session look
// (spec §架构: 主角另选;NPC 用 hash(sessionId) 取英雄池).
export const PLAYER_HERO = "knight_f";

const NPC_HEROES = [
  "wizzard_m",
  "elf_f",
  "lizard_m",
  "dwarf_m",
  "wizzard_f",
  "elf_m",
  "orc_warrior",
  "lizard_f",
  "dwarf_f",
  "masked_orc",
  "goblin",
  "skelet",
] as const;

export function sessionHero(sessionId: string): string {
  let h = 0;
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NPC_HEROES[h % NPC_HEROES.length] ?? "wizzard_m";
}
