import type { Session } from "../../shared/domain";

export interface LeaderboardRow {
  sessionId: string;
  title: string;
  tokens: number;
  cost: number;
  model: string;
  archived: boolean;
}

/** 全部会话(含归档)按 usage.tokens 降序。 */
export function leaderboardRows(
  sessions: Record<string, Session>,
): LeaderboardRow[] {
  return Object.values(sessions)
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      tokens: s.usage.tokens,
      cost: s.usage.cost,
      model: s.model,
      archived: s.archived,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}
