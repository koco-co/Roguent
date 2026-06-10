import type {
  AchievementProgress,
  AchievementUpdatedPayload,
  EconomyLedgerEntry,
} from "../../shared/economy";
import type { RoomEvent } from "../../shared/events";
import type { EconomyLedgerService } from "./ledger";

export const ACHIEVEMENTS = [
  {
    id: "first-codex-session",
    metric: "runtime.session.created.codex",
    target: 1,
    reward: { currency: "gem", amount: 20 },
  },
] as const;

type AchievementDefinition = (typeof ACHIEVEMENTS)[number];
type AchievementId = AchievementDefinition["id"];

const ACHIEVEMENT_TITLES: Record<AchievementId, string> = {
  "first-codex-session": "First Codex Session",
};

const ACHIEVEMENT_DESCRIPTIONS: Record<AchievementId, string> = {
  "first-codex-session": "Create a Codex runtime session.",
};

interface AchievementState {
  progress: number;
  claimed: boolean;
  updatedAt: number;
}

export interface AchievementClaimOptions {
  sessionId?: string | null;
  actorId?: string | null;
  sourceEventId?: string;
}

export type AchievementClaimResult =
  | {
      ok: true;
      achievement: AchievementProgress;
      ledgerEntry: EconomyLedgerEntry;
    }
  | {
      ok: false;
      reason: "unknown_achievement" | "not_completed" | "already_claimed";
    }
  | {
      ok: false;
      reason: "ledger_rejected";
      detail: "negative_balance";
    };

export interface AchievementsServiceOptions {
  now?: () => number;
}

export class AchievementsService {
  private readonly state = new Map<string, AchievementState>();
  private readonly processedMetrics = new Set<string>();

  constructor(
    private readonly ledger: EconomyLedgerService,
    private readonly options: AchievementsServiceOptions = {},
  ) {}

  applyEvent(event: RoomEvent): AchievementUpdatedPayload[] {
    const metric = metricForEvent(event);
    if (!metric) return [];

    const updates: AchievementUpdatedPayload[] = [];
    for (const definition of ACHIEVEMENTS) {
      if (definition.metric !== metric) continue;
      const processedKey = `${definition.id}:${metric}:${event.sessionId}:${event.seq}`;
      if (this.processedMetrics.has(processedKey)) continue;
      this.processedMetrics.add(processedKey);

      const current = this.getState(definition);
      const nextProgress = Math.min(definition.target, current.progress + 1);
      if (nextProgress === current.progress) continue;
      const next = {
        ...current,
        progress: nextProgress,
        updatedAt: event.ts ?? this.now(),
      };
      this.state.set(definition.id, next);
      updates.push({ achievement: this.materialize(definition, next) });
    }
    return updates;
  }

  claim(
    achievementId: string,
    options: AchievementClaimOptions = {},
  ): AchievementClaimResult {
    const definition = achievementById(achievementId);
    if (!definition) return { ok: false, reason: "unknown_achievement" };

    const current = this.getState(definition);
    const achievement = this.materialize(definition, current);
    if (!achievement.completed) return { ok: false, reason: "not_completed" };
    if (achievement.claimed) return { ok: false, reason: "already_claimed" };

    const sourceEventId =
      options.sourceEventId ?? `achievement.claimed:${definition.id}`;
    const appended = this.ledger.append({
      sessionId: options.sessionId ?? null,
      actorId: options.actorId ?? null,
      amount: definition.reward.amount,
      currency: definition.reward.currency,
      reason: "achievement.claimed",
      sourceEventId,
      metadata: { achievementId: definition.id },
    });
    if (!appended.ok) {
      return { ok: false, reason: "ledger_rejected", detail: appended.reason };
    }

    const next = { ...current, claimed: true, updatedAt: this.now() };
    this.state.set(definition.id, next);
    return {
      ok: true,
      achievement: this.materialize(definition, next),
      ledgerEntry: appended.entry,
    };
  }

  list(): AchievementProgress[] {
    return ACHIEVEMENTS.flatMap((definition) => {
      const state = this.state.get(definition.id);
      return state ? [this.materialize(definition, state)] : [];
    });
  }

  private getState(definition: AchievementDefinition): AchievementState {
    return (
      this.state.get(definition.id) ?? {
        progress: 0,
        claimed: false,
        updatedAt: this.now(),
      }
    );
  }

  private materialize(
    definition: AchievementDefinition,
    state: AchievementState,
  ): AchievementProgress {
    return {
      id: definition.id,
      title: ACHIEVEMENT_TITLES[definition.id],
      description: ACHIEVEMENT_DESCRIPTIONS[definition.id],
      progress: state.progress,
      target: definition.target,
      completed: state.progress >= definition.target,
      claimed: state.claimed,
      updatedAt: state.updatedAt,
      reward: { [definition.reward.currency]: definition.reward.amount },
      metadata: { metric: definition.metric },
    };
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

export function createAchievementsService(
  ledger: EconomyLedgerService,
  options?: AchievementsServiceOptions,
): AchievementsService {
  return new AchievementsService(ledger, options);
}

function achievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((definition) => definition.id === id);
}

function metricForEvent(event: RoomEvent): string | null {
  if (event.type !== "session.created") return null;
  const payload = event.payload as { runtime?: unknown };
  return payload.runtime === "codex" ? "runtime.session.created.codex" : null;
}
