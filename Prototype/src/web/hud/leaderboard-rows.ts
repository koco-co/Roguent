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

/** 聚合行(按模型 / 按 runtime)。key 是分组键,title 是展示名。 */
export interface AggRow {
  key: string;
  title: string;
  tokens: number;
  cost: number;
  model: string;
}

/**
 * 按模型聚合:同 model 的会话 tokens/cost 求和,按 tokens 降序。
 * key=raw model id(原样);title 留给面板用 shortModel 短名渲染。
 */
export function leaderboardByModel(
  sessions: Record<string, Session>,
): AggRow[] {
  const byModel = new Map<string, AggRow>();
  for (const s of Object.values(sessions)) {
    const row = byModel.get(s.model);
    if (row) {
      row.tokens += s.usage.tokens;
      row.cost += s.usage.cost;
    } else {
      byModel.set(s.model, {
        key: s.model,
        title: s.model,
        tokens: s.usage.tokens,
        cost: s.usage.cost,
        model: s.model,
      });
    }
  }
  return [...byModel.values()].sort((a, b) => b.tokens - a.tokens);
}

/**
 * 按 runtime 聚合:引擎只有 Claude → Claude 行 = 全部会话求和(真);
 * Codex 行恒为 0(占位,引擎暂未接入)。固定返回 [claude, codex] 两行,claude 在前。
 */
export function leaderboardByRuntime(
  sessions: Record<string, Session>,
): AggRow[] {
  let tokens = 0;
  let cost = 0;
  for (const s of Object.values(sessions)) {
    tokens += s.usage.tokens;
    cost += s.usage.cost;
  }
  return [
    { key: "claude", title: "Claude", tokens, cost, model: "claude" },
    { key: "codex", title: "Codex", tokens: 0, cost: 0, model: "—" },
  ];
}
