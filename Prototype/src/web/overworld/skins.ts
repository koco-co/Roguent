// Session NPC skins. Each session hashes its id into the pool for a stable
// per-session look (spec §架构: NPC 用 hash(sessionId) 取英雄池). The player's
// own avatar is chosen in CharacterSelect and persisted as settings.avatarHero
// (default "knight_m"), so it is not resolved here.
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
