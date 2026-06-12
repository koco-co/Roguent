import { create } from "zustand";
import {
  type Loot,
  ORCHESTRATOR_ID,
  type PermissionPromptData,
  type QuestionData,
  type Session,
  type TimelineItem,
  type TimelineMessageItem,
  type TimelinePromptItem,
  type TimelineSource,
  type TimelineThinkingItem,
  type TimelineToolItem,
  createAgent,
  createSession,
} from "../shared/domain";
import {
  reduceEconomyLedgerBalances,
  reduceInventoryFromLedger,
} from "../shared/economy";
import type {
  AccountLimits,
  AchievementProgress,
  AchievementUpdatedPayload,
  ContextUpdatedPayload,
  CurrencyBalances,
  EconomyLedgerAppendedPayload,
  EconomyLedgerEntry,
  IntegrationChannel,
  IntegrationConnectorStatus,
  IntegrationEventReceivedPayload,
  IntegrationStatusPayload,
  InventoryItem,
  MailboxItem,
  MailboxItemCreatedPayload,
  MailboxItemUpdatedPayload,
  PairingBinding,
  PairingBindingUpdatedPayload,
  PairingQr,
  PairingQrUpdatedPayload,
  PromptRequestedPayload,
  PromptResolvedPayload,
  RoguentSettings,
  RoomEvent,
  RuntimeConfigUpdatedPayload,
  RuntimeStatusPayload,
  SchedulerRun,
  SchedulerRunFinishedPayload,
  SchedulerRunStartedPayload,
  SchedulerTask,
  SchedulerTaskCreatedPayload,
  SchedulerTaskUpdatedPayload,
  SettingsUpdatedPayload,
} from "../shared/events";
import { agentTypeToSkin } from "../shared/mapping";
import {
  isCodexApprovalPolicy,
  isReasoningEffort,
  isRuntimeKind,
  isSandboxMode,
  normalizePermissionMode,
} from "../shared/runtime";

// WS 连接生命周期状态:connecting(建连/退避重连中)/ open(已连)/ closed(已断,
// 含 engine URL 解析失败)。ErrorOverlay 据此去抖显示离线错误层(T4.3)。
export type ConnectionStatus = "connecting" | "open" | "closed";

export interface PairingState {
  qrByChannel: Partial<Record<IntegrationChannel, PairingQr>>;
  byId: Record<string, PairingBinding>;
  byExternalKey: Record<string, PairingBinding>;
}

export interface MailboxState {
  items: Record<string, MailboxItem>;
  order: string[];
}

export interface SchedulerState {
  tasks: Record<string, SchedulerTask>;
  runs: Record<string, SchedulerRun>;
}

export interface LedgerState {
  entries: EconomyLedgerEntry[];
  balances: CurrencyBalances;
}

export interface RoomState {
  sessions: Record<string, Session>;
  currentSessionId: string | null;
  // 项目首见顺序 —— 总览世界房间的槽位顺序。追加式:新项目入尾,既有项目永不
  // 重排,房间因此不抖动(spec §总览世界:布局对已存在项目稳定/追加式)。
  projectOrder: string[];
  connection: ConnectionStatus;
  runtimeStatusBySession?: Record<string, RuntimeStatusPayload>;
  connectorStatus?: Record<string, IntegrationConnectorStatus>;
  pairings?: PairingState;
  mailbox?: MailboxState;
  scheduler?: SchedulerState;
  ledger?: LedgerState;
  achievements?: Record<string, AchievementProgress>;
  inventory?: Record<string, InventoryItem>;
  settings?: RoguentSettings | null;
}

type PrototypeStateKeys =
  | "runtimeStatusBySession"
  | "connectorStatus"
  | "pairings"
  | "mailbox"
  | "scheduler"
  | "ledger"
  | "achievements"
  | "inventory"
  | "settings";

export type RoomStateWithPrototype = RoomState &
  Required<Pick<RoomState, PrototypeStateKeys>>;

// 大厅最多同时显示这么多活跃(未归档)会话;新建/激活第 11 个会把活跃度最低者
// 软归档(spec §生命周期:≤10/LRU)。
export const ACTIVE_CAP = 10;

/**
 * 就地把活跃度最低的会话软归档,直到「活跃(未归档)且有 project」的会话数 ≤
 * ACTIVE_CAP。只统计带 project 的会话:无 project 的(如早到的 session.error 占位)
 * 渲染不出 NPC,不该占大厅槽。protectId 永不被选为牺牲品 —— 用于保护刚建/刚激活者,
 * 防止非单调 wall-clock(时钟回拨)把它自己挤掉。
 */
function enforceActiveCap(
  sessions: Record<string, Session>,
  protectId?: string,
): void {
  while (true) {
    const active = Object.values(sessions).filter(
      (s) => !s.archived && s.project,
    );
    if (active.length <= ACTIVE_CAP) break;
    let victim: Session | undefined;
    for (const s of active) {
      if (s.id === protectId) continue;
      if (!victim || s.lastActiveAt < victim.lastActiveAt) victim = s;
    }
    if (!victim) break;
    sessions[victim.id] = { ...victim, archived: true };
  }
}

function createPairingState(): PairingState {
  return { qrByChannel: {}, byId: {}, byExternalKey: {} };
}

function createMailboxState(): MailboxState {
  return { items: {}, order: [] };
}

function createSchedulerState(): SchedulerState {
  return { tasks: {}, runs: {} };
}

function createLedgerState(): LedgerState {
  return { entries: [], balances: {} };
}

function createPrototypeStateSlices(): Required<
  Pick<RoomState, PrototypeStateKeys>
> {
  return {
    runtimeStatusBySession: {},
    connectorStatus: {},
    pairings: createPairingState(),
    mailbox: createMailboxState(),
    scheduler: createSchedulerState(),
    ledger: createLedgerState(),
    achievements: {},
    inventory: {},
    settings: null,
  };
}

export interface MailboxBoardItemsOptions {
  now?: number;
  limit?: number;
}

function withPrototypeStateSlices(state: RoomState): RoomStateWithPrototype {
  return {
    ...state,
    runtimeStatusBySession: state.runtimeStatusBySession ?? {},
    connectorStatus: state.connectorStatus ?? {},
    pairings: state.pairings ?? createPairingState(),
    mailbox: state.mailbox ?? createMailboxState(),
    scheduler: state.scheduler ?? createSchedulerState(),
    ledger: state.ledger ?? createLedgerState(),
    achievements: state.achievements ?? {},
    inventory: state.inventory ?? {},
    settings: state.settings ?? null,
  };
}

function pairingExternalKey(
  channel: IntegrationChannel,
  externalChatId: string,
): string {
  return `${channel}:${externalChatId}`;
}

function appendIdOnce(order: string[], id: string): string[] {
  return order.includes(id) ? order : [...order, id];
}

function withMailboxItem(
  state: RoomStateWithPrototype,
  item: MailboxItem | null,
): RoomStateWithPrototype {
  if (!item) return state;
  return {
    ...state,
    mailbox: {
      items: { ...state.mailbox.items, [item.id]: item },
      order: appendIdOnce(state.mailbox.order, item.id),
    },
  };
}

function mergeMetadata(
  current?: Record<string, unknown>,
  next?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!current) return next;
  if (!next) return current;
  return { ...current, ...next };
}

function startOfLocalDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isSameLocalDay(left: number, right: number): boolean {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

function isMailboxBoardItem(item: MailboxItem, now: number): boolean {
  if (item.status === "archived") return false;
  if (item.metadata?.board === true && isSameLocalDay(item.ts, now)) {
    return true;
  }
  return (
    item.status === "unread" &&
    (item.kind === "alert" || item.priority === "high")
  );
}

export function selectMailboxBoardItems(
  state: RoomState,
  options: MailboxBoardItemsOptions = {},
): MailboxItem[] {
  const mailbox = state.mailbox ?? createMailboxState();
  return selectMailboxBoardItemsFromMailbox(mailbox, options);
}

export function selectMailboxBoardItemsFromMailbox(
  mailbox: MailboxState,
  options: MailboxBoardItemsOptions = {},
): MailboxItem[] {
  const now = options.now ?? Date.now();
  const start = startOfLocalDay(now);
  const end = start + 24 * 60 * 60 * 1000;
  const limit = options.limit ?? 20;

  return mailbox.order
    .map((id) => mailbox.items[id])
    .filter((item): item is MailboxItem => Boolean(item))
    .filter(
      (item) =>
        (item.ts >= start && item.ts < end) ||
        (item.status === "unread" &&
          (item.kind === "alert" || item.priority === "high")),
    )
    .filter((item) => isMailboxBoardItem(item, now))
    .sort((a, b) => b.ts - a.ts || b.id.localeCompare(a.id))
    .slice(0, limit);
}

function runtimeMailboxItem(
  event: RoomEvent,
  payload: RuntimeStatusPayload,
): MailboxItem | null {
  if (
    payload.status !== "degraded" &&
    payload.status !== "error" &&
    payload.status !== "stopped"
  ) {
    return null;
  }
  const summary =
    payload.error ??
    payload.message ??
    `${payload.runtime} runtime ${payload.status}`;
  return {
    id: `runtime:${event.sessionId}:${payload.status}:${event.seq}`,
    source: "runtime",
    title: `${payload.runtime} runtime ${payload.status}`,
    summary,
    ts: event.ts,
    status: "unread",
    kind: "alert",
    priority: payload.status === "error" ? "high" : "normal",
    sessionId: event.sessionId,
    metadata: {
      board: payload.status === "error" || payload.status === "degraded",
      runtime: payload.runtime,
      status: payload.status,
    },
  };
}

function promptMailboxItem(
  event: RoomEvent,
  payload: PromptRequestedPayload,
): MailboxItem {
  return {
    id: `prompt:${payload.promptId}`,
    source: "runtime",
    title:
      payload.promptKind === "permission"
        ? "Permission requested"
        : "Question requested",
    summary: promptSummary(payload),
    ts: event.ts,
    status: "unread",
    kind: "alert",
    priority: "high",
    sessionId: event.sessionId,
    relatedEventId: payload.promptId,
    metadata: {
      board: true,
      promptId: payload.promptId,
      promptKind: payload.promptKind,
    },
  };
}

function promptSummary(payload: PromptRequestedPayload): string {
  if (payload.promptKind === "permission") {
    const data = payload.data as PermissionPromptData;
    return (
      data.title ??
      data.displayName ??
      `${data.toolName}: ${data.inputSummary}`.trim()
    );
  }
  const data = payload.data as QuestionData;
  return data.questions[0]?.question ?? "Agent requested input";
}

function schedulerMailboxItem(
  event: RoomEvent,
  run: SchedulerRun,
  task: SchedulerTask | undefined,
): MailboxItem {
  const failed =
    run.status === "failed" || run.status === "cancelled" || Boolean(run.error);
  const taskTitle = task?.title ?? run.taskId;
  const finished = event.type === "scheduler.run.finished";
  const summary =
    run.error ??
    run.summary ??
    (finished
      ? `Scheduler run ${run.status}: ${taskTitle}`
      : `Scheduler run started: ${taskTitle}`);
  return {
    id: `scheduler:${run.id}:${finished ? "finished" : "started"}`,
    source: "scheduler",
    title: finished ? `Scheduler run ${run.status}` : "Scheduler run started",
    summary,
    ts: run.finishedAt ?? run.startedAt ?? event.ts,
    status: "unread",
    kind: failed ? "alert" : "task",
    priority: failed ? "high" : "normal",
    sessionId: run.sessionId,
    relatedEventId: run.id,
    metadata: {
      board: failed,
      runId: run.id,
      taskId: run.taskId,
      status: run.status,
    },
  };
}

function desktopTimelineMeta(session: Session): {
  source: TimelineSource;
  runtime: Session["runtime"];
} {
  return { source: { kind: "desktop" }, runtime: session.runtime };
}

function isImTimelineChannel(
  channel: IntegrationChannel,
): channel is "wechat" | "feishu" {
  return channel === "wechat" || channel === "feishu";
}

function integrationTimelineSource(
  event: IntegrationEventReceivedPayload,
): Extract<TimelineSource, { kind: "im" }> | undefined {
  if (!isImTimelineChannel(event.channel) || !event.externalChatId) {
    return undefined;
  }
  const displayName = event.from || undefined;
  return displayName
    ? {
        kind: "im",
        channel: event.channel,
        externalChatId: event.externalChatId,
        displayName,
      }
    : {
        kind: "im",
        channel: event.channel,
        externalChatId: event.externalChatId,
      };
}

function resolveForwardingBindingSessionId(
  state: RoomStateWithPrototype,
  source: Extract<TimelineSource, { kind: "im" }>,
): string | null | undefined {
  const binding =
    state.pairings.byExternalKey[
      pairingExternalKey(source.channel, source.externalChatId)
    ];
  if (!binding) return undefined;
  if (binding?.status !== "active" || !binding.forwardingEnabled) {
    return null;
  }
  return binding.sessionId;
}

function upsertTimelineItem(
  timeline: TimelineItem[],
  item: TimelineItem,
): TimelineItem[] {
  const idx = timeline.findIndex(
    (current) => current.kind === item.kind && current.id === item.id,
  );
  if (idx === -1) return [...timeline, item];
  return timeline.map((current, i) => (i === idx ? item : current));
}

function isTimelineDeliveryStatus(
  value: unknown,
): value is NonNullable<TimelineMessageItem["delivery"]>["status"] {
  return (
    value === "pending" ||
    value === "sent" ||
    value === "delivered" ||
    value === "failed"
  );
}

function isTimelineDeliveryChannel(
  channel: IntegrationChannel,
): channel is NonNullable<TimelineMessageItem["delivery"]>["channel"] {
  return channel !== "relay";
}

function applyOutboundDelivery(
  state: RoomStateWithPrototype,
  e: RoomEvent,
  event: IntegrationEventReceivedPayload,
): RoomStateWithPrototype {
  if (!isTimelineDeliveryChannel(event.channel)) return state;
  const metadata = event.metadata ?? {};
  const status = isTimelineDeliveryStatus(metadata.deliveryStatus)
    ? metadata.deliveryStatus
    : undefined;
  if (!status) return state;
  const session = state.sessions[e.sessionId];
  if (!session) return state;
  const replyToTimelineItemId =
    typeof metadata.replyToTimelineItemId === "string"
      ? metadata.replyToTimelineItemId
      : undefined;
  const error = typeof metadata.error === "string" ? metadata.error : undefined;
  const delivery = {
    channel: event.channel,
    deliveryId: event.deliveryId,
    status,
    ...(error ? { error } : {}),
    updatedAt: event.receivedAt ?? event.ts ?? e.ts,
  };

  let updated = false;
  const timeline = session.timeline.map((item) => {
    if (
      item.kind === "message" &&
      item.role === "assistant" &&
      replyToTimelineItemId &&
      item.id === replyToTimelineItemId
    ) {
      updated = true;
      return { ...item, delivery };
    }
    return item;
  });
  if (replyToTimelineItemId && !updated) return state;
  if (!updated) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const item = timeline[i];
      if (item?.kind !== "message" || item.role !== "assistant") continue;
      timeline[i] = { ...item, delivery };
      updated = true;
      break;
    }
  }
  if (!updated) return state;
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [e.sessionId]: {
        ...session,
        timeline,
      },
    },
  };
}

function isPrototypeDomainOnlyEvent(type: RoomEvent["type"]): boolean {
  return (
    type === "integration.status" ||
    type === "integration.event.received" ||
    type === "pairing.qr.updated" ||
    type === "pairing.binding.updated" ||
    type === "mailbox.item.created" ||
    type === "mailbox.item.updated" ||
    type === "scheduler.task.created" ||
    type === "scheduler.task.updated" ||
    type === "scheduler.run.started" ||
    type === "scheduler.run.finished" ||
    type === "economy.ledger.appended" ||
    type === "achievement.updated" ||
    type === "inventory.updated" ||
    type === "settings.updated"
  );
}

function foldPrototypeDomainEvent(
  state: RoomStateWithPrototype,
  e: RoomEvent,
): RoomStateWithPrototype {
  switch (e.type) {
    case "runtime.status": {
      const p = e.payload as RuntimeStatusPayload;
      const nextState = {
        ...state,
        runtimeStatusBySession: {
          ...state.runtimeStatusBySession,
          [e.sessionId]: p,
        },
      };
      return withMailboxItem(nextState, runtimeMailboxItem(e, p));
    }
    case "runtime.config.updated": {
      const p = e.payload as RuntimeConfigUpdatedPayload;
      const current = state.runtimeStatusBySession[e.sessionId];
      const nextStatus: RuntimeStatusPayload = current
        ? {
            ...current,
            runtime: p.config.runtime,
            config: p.config,
            metadata: mergeMetadata(current.metadata, p.metadata),
          }
        : {
            runtime: p.config.runtime,
            status: "idle",
            config: p.config,
            metadata: p.metadata,
          };
      return {
        ...state,
        runtimeStatusBySession: {
          ...state.runtimeStatusBySession,
          [e.sessionId]: nextStatus,
        },
      };
    }
    case "integration.status": {
      const p = e.payload as IntegrationStatusPayload;
      return {
        ...state,
        connectorStatus: {
          ...state.connectorStatus,
          [p.status.id]: p.status,
        },
      };
    }
    case "integration.event.received": {
      const p = e.payload as IntegrationEventReceivedPayload;
      if (!p.connectorId) return state;
      const current = state.connectorStatus[p.connectorId];
      const status: IntegrationConnectorStatus = {
        id: p.connectorId,
        channel: p.channel,
        state: current?.state ?? "connected",
        ...current,
        lastEventAt: p.receivedAt ?? p.ts ?? e.ts,
      };
      return {
        ...state,
        connectorStatus: {
          ...state.connectorStatus,
          [p.connectorId]: status,
        },
      };
    }
    case "pairing.qr.updated": {
      const p = e.payload as PairingQrUpdatedPayload;
      if (!p.qr) {
        const channel = (e.payload as { channel?: IntegrationChannel }).channel;
        if (!channel) {
          return {
            ...state,
            pairings: {
              ...state.pairings,
              qrByChannel: {},
            },
          };
        }
        const qrByChannel = { ...state.pairings.qrByChannel };
        delete qrByChannel[channel];
        return {
          ...state,
          pairings: {
            ...state.pairings,
            qrByChannel,
          },
        };
      }
      return {
        ...state,
        pairings: {
          ...state.pairings,
          qrByChannel: {
            ...state.pairings.qrByChannel,
            [p.qr.channel]: p.qr,
          },
        },
      };
    }
    case "pairing.binding.updated": {
      const p = e.payload as PairingBindingUpdatedPayload;
      const key = pairingExternalKey(
        p.binding.channel,
        p.binding.externalChatId,
      );
      const byId = { ...state.pairings.byId };
      const previous = state.pairings.byExternalKey[key];
      if (previous && previous.id !== p.binding.id) delete byId[previous.id];
      byId[p.binding.id] = p.binding;
      return {
        ...state,
        pairings: {
          ...state.pairings,
          byId,
          byExternalKey: {
            ...state.pairings.byExternalKey,
            [key]: p.binding,
          },
        },
      };
    }
    case "mailbox.item.created": {
      const p = e.payload as MailboxItemCreatedPayload;
      return {
        ...state,
        mailbox: {
          items: { ...state.mailbox.items, [p.item.id]: p.item },
          order: appendIdOnce(state.mailbox.order, p.item.id),
        },
      };
    }
    case "mailbox.item.updated": {
      const p = e.payload as MailboxItemUpdatedPayload;
      const current = state.mailbox.items[p.item.id];
      const item = current
        ? p.changes
          ? { ...current, ...p.changes }
          : p.item
        : p.item;
      return {
        ...state,
        mailbox: {
          items: { ...state.mailbox.items, [item.id]: item },
          order: appendIdOnce(state.mailbox.order, item.id),
        },
      };
    }
    case "scheduler.task.created": {
      const p = e.payload as SchedulerTaskCreatedPayload;
      return {
        ...state,
        scheduler: {
          ...state.scheduler,
          tasks: { ...state.scheduler.tasks, [p.task.id]: p.task },
        },
      };
    }
    case "scheduler.task.updated": {
      const p = e.payload as SchedulerTaskUpdatedPayload;
      const current = state.scheduler.tasks[p.task.id];
      const task = current
        ? p.changes
          ? { ...current, ...p.changes }
          : p.task
        : p.task;
      return {
        ...state,
        scheduler: {
          ...state.scheduler,
          tasks: { ...state.scheduler.tasks, [task.id]: task },
        },
      };
    }
    case "scheduler.run.started": {
      const p = e.payload as SchedulerRunStartedPayload;
      const nextState = {
        ...state,
        scheduler: {
          ...state.scheduler,
          runs: { ...state.scheduler.runs, [p.run.id]: p.run },
        },
      };
      return withMailboxItem(
        nextState,
        schedulerMailboxItem(e, p.run, state.scheduler.tasks[p.run.taskId]),
      );
    }
    case "scheduler.run.finished": {
      const p = e.payload as SchedulerRunFinishedPayload;
      const nextState = {
        ...state,
        scheduler: {
          ...state.scheduler,
          runs: { ...state.scheduler.runs, [p.run.id]: p.run },
        },
      };
      return withMailboxItem(
        nextState,
        schedulerMailboxItem(e, p.run, state.scheduler.tasks[p.run.taskId]),
      );
    }
    case "economy.ledger.appended": {
      const p = e.payload as EconomyLedgerAppendedPayload;
      const entries = [...state.ledger.entries, p.entry];
      return {
        ...state,
        ledger: {
          entries,
          balances: reduceEconomyLedgerBalances(entries),
        },
        inventory: reduceInventoryFromLedger(entries),
      };
    }
    case "achievement.updated": {
      const p = e.payload as AchievementUpdatedPayload;
      return {
        ...state,
        achievements: {
          ...state.achievements,
          [p.achievement.id]: p.achievement,
        },
      };
    }
    case "inventory.updated": {
      // Task 43 makes ledger entries the authoritative economy source for
      // skins/items. Keep the protocol event type for compatibility, but do not
      // let it bypass the append-only ledger.
      return state;
    }
    case "settings.updated": {
      const p = e.payload as SettingsUpdatedPayload;
      return { ...state, settings: p.settings };
    }
    default:
      return state;
  }
}

function foldPrototypeTimelineEvent(
  state: RoomStateWithPrototype,
  e: RoomEvent,
): RoomStateWithPrototype {
  switch (e.type) {
    case "integration.event.received": {
      const p = e.payload as IntegrationEventReceivedPayload;
      if (p.direction === "outbound") return applyOutboundDelivery(state, e, p);
      if (p.direction !== "inbound") return state;
      const text = p.bodyText || p.summary;
      const source = integrationTimelineSource(p);
      if (!text || !source) return state;
      const boundSessionId = resolveForwardingBindingSessionId(state, source);
      if (boundSessionId === null) return state;
      const targetSessionId = boundSessionId ?? e.sessionId;
      if (!targetSessionId) return state;
      const session = state.sessions[targetSessionId];
      if (!session) return state;
      const item: TimelineMessageItem = {
        kind: "message",
        id: `integration:${p.id}`,
        role: "user",
        text,
        ts: p.receivedAt ?? p.ts ?? e.ts,
        source,
        runtime: session.runtime,
        status: "final",
      };
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [targetSessionId]: {
            ...session,
            timeline: upsertTimelineItem(session.timeline, item),
            lastActiveAt: e.ts,
          },
        },
      };
    }
    case "scheduler.run.started":
    case "scheduler.run.finished": {
      const p = e.payload as SchedulerRunStartedPayload;
      const run = p.run;
      if (!run.sessionId) return state;
      const session = state.sessions[run.sessionId];
      if (!session || run.sessionId !== e.sessionId) return state;
      const stage = e.type === "scheduler.run.started" ? "started" : "finished";
      const taskLabel = state.scheduler.tasks[run.taskId]?.title ?? run.taskId;
      const text =
        stage === "started"
          ? `Scheduler run started: ${taskLabel}`
          : `Scheduler run ${run.status}: ${run.summary ?? taskLabel}`;
      const item: TimelineMessageItem = {
        kind: "message",
        id: `scheduler:${run.id}:${stage}`,
        role: "system",
        text,
        ts:
          stage === "started"
            ? (run.startedAt ?? e.ts)
            : (run.finishedAt ?? e.ts),
        source: { kind: "scheduler", taskId: run.taskId, runId: run.id },
        runtime: session.runtime,
        status: "final",
      };
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [session.id]: {
            ...session,
            timeline: upsertTimelineItem(session.timeline, item),
            lastActiveAt: e.ts,
          },
        },
      };
    }
    default:
      return state;
  }
}

export function reduce(state: RoomState, e: RoomEvent): RoomStateWithPrototype {
  const baseState = withPrototypeStateSlices(state);
  let sessions = { ...baseState.sessions };

  if (e.type === "session.created") {
    const p = e.payload as {
      title: string;
      model: string;
      slashCommands?: string[];
      cwd?: string;
      project?: string;
      permissionMode?: string;
      runtime?: unknown;
      approvalPolicy?: unknown;
      sandboxMode?: unknown;
      reasoningEffort?: unknown;
      networkAccess?: unknown;
      imported?: boolean;
    };
    // 幂等:engine 先合成一条 session.created,SDK init 后又派生一条。第二条必须
    // 合并(补 model/slashCommands/cwd/project),绝不能重建会话——否则会清空已有
    // transcript(spec §关键约定)。
    const existing = sessions[e.sessionId];
    if (existing) {
      const proj = existing.project ?? p.project;
      sessions[e.sessionId] = {
        ...existing,
        title: p.title || existing.title,
        model: p.model || existing.model,
        slashCommands: p.slashCommands?.length
          ? p.slashCommands
          : existing.slashCommands,
        cwd: existing.cwd ?? p.cwd,
        project: proj,
        // SDK init 派生的第二条带真实 permissionMode;只在它是非 default 时覆盖,
        // 否则保留已知值(合成的第一条恒为 "default",不能把真实模式刷回去)。
        permissionMode:
          p.permissionMode && p.permissionMode !== "default"
            ? normalizePermissionMode(p.permissionMode, existing.permissionMode)
            : existing.permissionMode,
        runtime: isRuntimeKind(p.runtime) ? p.runtime : existing.runtime,
        approvalPolicy: isCodexApprovalPolicy(p.approvalPolicy)
          ? p.approvalPolicy
          : existing.approvalPolicy,
        sandboxMode: isSandboxMode(p.sandboxMode)
          ? p.sandboxMode
          : existing.sandboxMode,
        reasoningEffort: isReasoningEffort(p.reasoningEffort)
          ? p.reasoningEffort
          : existing.reasoningEffort,
        networkAccess:
          typeof p.networkAccess === "boolean"
            ? p.networkAccess
            : existing.networkAccess,
        // 一旦是导入会话就恒为导入(幂等再导入不会把标记刷掉)。
        imported: existing.imported || p.imported,
      };
      const projectOrder =
        proj && !baseState.projectOrder.includes(proj)
          ? [...baseState.projectOrder, proj]
          : baseState.projectOrder;
      // SDK init 派生的第二条 session.created 绝不能抢焦点。
      // connection 是传输层状态,事件折叠从不改它 —— 原样透传。
      return {
        ...baseState,
        sessions,
        projectOrder,
        currentSessionId: baseState.currentSessionId,
        connection: baseState.connection,
      };
    }

    const created = createSession({
      id: e.sessionId,
      title: p.title || e.sessionId,
      model: p.model,
      slashCommands: p.slashCommands ?? [],
      cwd: p.cwd,
      project: p.project,
      // 合成的第一条恒为 "default";若首条已带真实模式(如 init 先于合成到达)则尊重之。
      // event payload 是字符串边界,进 domain 前收敛到 Claude SDK 合法枚举。
      permissionMode: normalizePermissionMode(p.permissionMode),
      runtime: isRuntimeKind(p.runtime) ? p.runtime : undefined,
      approvalPolicy: isCodexApprovalPolicy(p.approvalPolicy)
        ? p.approvalPolicy
        : undefined,
      sandboxMode: isSandboxMode(p.sandboxMode) ? p.sandboxMode : undefined,
      reasoningEffort: isReasoningEffort(p.reasoningEffort)
        ? p.reasoningEffort
        : undefined,
      networkAccess:
        typeof p.networkAccess === "boolean" ? p.networkAccess : undefined,
      lastActiveAt: e.ts, // 首次出现即视为刚活跃,供 LRU 排序
      imported: p.imported, // 导入会话:reconcile 对账豁免它
    });
    sessions[e.sessionId] = created;
    const projectOrder =
      p.project && !baseState.projectOrder.includes(p.project)
        ? [...baseState.projectOrder, p.project]
        : baseState.projectOrder;
    // 新建即跳第 11 个 → 软归档活跃度最低者;新会话受保护,绝不被自己挤掉。
    enforceActiveCap(sessions, e.sessionId);
    // 新建即跳转:会话首次出现就把焦点切过去。connection 透传(见上)。
    return {
      ...baseState,
      sessions,
      projectOrder,
      currentSessionId: e.sessionId,
      connection: baseState.connection,
    };
  }

  // session.error 可能在 system:init 之前就到达(如订阅 auth 直接失败),
  // 此时还没有 session.created。所以在 prev 守卫之前处理:缺会话就建占位,
  // 把错误标进状态并落进 transcript,保证"为什么没法用"对用户可见(spec §10)。
  if (e.type === "session.error") {
    const p = e.payload as { message: string };
    const base =
      sessions[e.sessionId] ??
      createSession({
        id: e.sessionId,
        title: e.sessionId,
        model: "",
        lastActiveAt: e.ts,
      });
    const errItem: TimelineMessageItem = {
      kind: "message",
      id: String(e.seq),
      role: "system",
      text: p.message,
      ts: e.ts,
      ...desktopTimelineMeta(base),
      status: "final",
    };
    sessions[e.sessionId] = {
      ...base,
      status: "error",
      timeline: [...base.timeline, errItem],
    };
    return {
      ...baseState,
      sessions,
      projectOrder: baseState.projectOrder,
      currentSessionId: baseState.currentSessionId ?? e.sessionId,
      connection: baseState.connection,
    };
  }

  const domainState = foldPrototypeDomainEvent(baseState, e);
  let domainTimelineState = foldPrototypeTimelineEvent(domainState, e);
  if (isPrototypeDomainOnlyEvent(e.type)) return domainTimelineState;

  sessions = { ...domainTimelineState.sessions };
  const prev = sessions[e.sessionId];
  if (!prev) return domainTimelineState; // event for an unknown session — create/ignore per event type
  const s: Session = { ...prev, agents: { ...prev.agents } };

  switch (e.type) {
    case "agent.spawned": {
      const p = e.payload as { role: string; parentId: string };
      if (e.agentId) {
        s.agents[e.agentId] = createAgent({
          id: e.agentId,
          role: p.role,
          skin: agentTypeToSkin(p.role),
          parentId: p.parentId,
          status: "working",
        });
      }
      s.status = "busy";
      break;
    }
    case "tool.started": {
      const p = e.payload as {
        toolName: string;
        inputSummary: string;
        toolUseId: string;
      };
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = {
          ...a,
          status: "working",
          currentTool: p.toolName,
        };
      // AskUserQuestion is already handled as prompt.requested in normalize,
      // so it won't emit tool.started. But guard anyway for safety.
      if (p.toolName !== "AskUserQuestion") {
        const toolItem: TimelineToolItem = {
          kind: "tool",
          id: p.toolUseId,
          toolName: p.toolName,
          inputSummary: p.inputSummary,
          status: "running",
          agentId: e.agentId,
          ts: e.ts,
          ...desktopTimelineMeta(s),
        };
        s.timeline = [...s.timeline, toolItem];
      }
      break;
    }
    case "tool.ended": {
      const p = e.payload as { toolUseId: string };
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = { ...a, currentTool: undefined };
      s.timeline = s.timeline.map((item) =>
        item.kind === "tool" && item.id === p.toolUseId
          ? { ...item, status: "ok" as const }
          : item,
      );
      break;
    }
    case "tool.failed": {
      const p = e.payload as { toolUseId: string };
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = { ...a, currentTool: undefined };
      s.timeline = s.timeline.map((item) =>
        item.kind === "tool" && item.id === p.toolUseId
          ? { ...item, status: "failed" as const }
          : item,
      );
      break;
    }
    case "agent.thinking": {
      // Mirror agent.idle: clear currentTool so the head shows the "..." emote
      // (not a tool bubble) while the agent reasons (spec §6.4).
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = {
          ...a,
          status: "thinking",
          currentTool: undefined,
        };
      break;
    }
    case "agent.idle": {
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = { ...a, status: "idle", currentTool: undefined };
      break;
    }
    case "todos.updated": {
      const p = e.payload as {
        todos: Array<{
          content: string;
          status: "pending" | "in_progress" | "completed";
          activeForm?: string;
        }>;
      };
      const owner = e.agentId ?? ORCHESTRATOR_ID;
      s.todos = { ...prev.todos, [owner]: p.todos };
      break;
    }
    case "agent.done": {
      if (e.agentId && e.agentId !== ORCHESTRATOR_ID) {
        delete s.agents[e.agentId];
        if (s.todos[e.agentId]) {
          const todos = { ...prev.todos };
          delete todos[e.agentId];
          s.todos = todos;
        }
      }
      break;
    }
    case "loot.dropped": {
      const p = e.payload as {
        kind: Loot["kind"];
        label: string;
        sourceRef: string;
      };
      s.loot = [
        ...s.loot,
        {
          id: String(e.seq),
          sessionId: e.sessionId,
          kind: p.kind,
          label: p.label,
          sourceRef: p.sourceRef,
          t: e.ts,
        },
      ];
      break;
    }
    case "message.delta":
    case "message.final": {
      // 对话文字进抽屉会话窗口,不进房间(spec §5/§7.3)。
      // role 默认 "assistant";导入历史会话时用户轮次带 role:"user"。
      // includePartialMessages=true:同一 agent 的 assistant partial 替换最后一条
      // 气泡而不是追加新条,实现逐字流式效果。
      const p = e.payload as {
        text: string;
        role?: "user" | "assistant" | "system";
      };
      const role = p.role ?? "assistant";
      if (!p.text) break;
      const status =
        role === "assistant" && e.type === "message.delta"
          ? "streaming"
          : "final";
      const last = s.timeline[s.timeline.length - 1];
      const lastMsg =
        last?.kind === "message" ? (last as TimelineMessageItem) : undefined;
      const lastIsAssistantMsg =
        lastMsg !== undefined &&
        lastMsg.role === "assistant" &&
        lastMsg.agentId === e.agentId;
      if (
        role === "assistant" &&
        lastIsAssistantMsg &&
        lastMsg?.status === "streaming"
      ) {
        // streaming: replace last assistant bubble from same agent
        s.timeline = [
          ...s.timeline.slice(0, -1),
          {
            ...lastMsg,
            text: p.text,
            source: lastMsg.source ?? { kind: "desktop" },
            runtime: lastMsg.runtime ?? s.runtime,
            status,
          },
        ];
      } else {
        const item: TimelineMessageItem = {
          kind: "message",
          id: String(e.seq),
          role,
          agentId: role === "user" ? undefined : e.agentId,
          text: p.text,
          ts: e.ts,
          ...desktopTimelineMeta(s),
          status,
        };
        s.timeline = [...s.timeline, item];
      }
      break;
    }
    case "usage.updated": {
      const p = e.payload as { tokens: number; cost: number };
      s.usage = { tokens: p.tokens, cost: p.cost };
      break;
    }
    case "context.updated": {
      const p = e.payload as ContextUpdatedPayload;
      s.context = {
        usedTokens: p.usedTokens,
        windowSize: p.windowSize,
        utilization: p.utilization,
      };
      break;
    }
    case "runtime.status": {
      const p = e.payload as RuntimeStatusPayload;
      s.runtimeStatus = p;
      if (isRuntimeKind(p.runtime)) s.runtime = p.runtime;
      if (p.config?.model) s.model = p.config.model;
      if (p.status === "running" || p.status === "starting") s.status = "busy";
      if (p.status === "idle" || p.status === "degraded") s.status = "idle";
      if (p.status === "stopped") s.status = "idle";
      if (p.status === "error") s.status = "error";
      break;
    }
    case "runtime.config.updated": {
      const p = e.payload as RuntimeConfigUpdatedPayload;
      s.runtime = p.config.runtime;
      s.model = p.config.model;
      s.permissionMode = p.config.permissionMode;
      s.approvalPolicy = p.config.approvalPolicy;
      s.sandboxMode = p.config.sandboxMode;
      s.reasoningEffort = p.config.reasoningEffort;
      s.networkAccess = p.config.networkAccess;
      s.runtimeStatus = domainState.runtimeStatusBySession[e.sessionId];
      break;
    }
    case "session.cleared": {
      const orch = s.agents[ORCHESTRATOR_ID];
      s.agents = orch ? { [ORCHESTRATOR_ID]: orch } : {};
      s.status = "done";
      break;
    }
    case "session.rolled_back": {
      const p = e.payload as { checkpointId?: string };
      const checkpointIndex = s.timeline.findIndex(
        (item) => item.id === p.checkpointId,
      );
      if (checkpointIndex !== -1) {
        s.timeline = s.timeline.slice(0, checkpointIndex + 1);
      }
      const orch = s.agents[ORCHESTRATOR_ID];
      s.agents = orch ? { [ORCHESTRATOR_ID]: orch } : {};
      s.status = "idle";
      break;
    }
    case "prompt.requested": {
      const p = e.payload as PromptRequestedPayload;
      const item: TimelinePromptItem = {
        kind: "prompt",
        id: p.promptId,
        promptKind: p.promptKind,
        data: p.data,
        status: "pending",
        ts: e.ts,
        ...desktopTimelineMeta(s),
      };
      s.timeline = [...s.timeline, item];
      domainTimelineState = withMailboxItem(
        domainTimelineState,
        promptMailboxItem(e, p),
      );
      break;
    }
    case "prompt.resolved": {
      const p = e.payload as PromptResolvedPayload;
      s.timeline = s.timeline.map((item) =>
        item.kind === "prompt" && item.id === p.promptId
          ? { ...item, status: p.result }
          : item,
      );
      break;
    }
    case "thinking.delta":
    case "thinking.final": {
      const p = e.payload as { text: string };
      if (!p.text) break;
      const status = e.type === "thinking.delta" ? "streaming" : "final";
      // Find last thinking item from same agent to update (streaming replace), or append new
      const lastThinkingIdx = [...s.timeline]
        .reverse()
        .findIndex((i) => i.kind === "thinking" && i.agentId === e.agentId);
      if (lastThinkingIdx !== -1) {
        const idx = s.timeline.length - 1 - lastThinkingIdx;
        s.timeline = s.timeline.map((item, i) =>
          i === idx
            ? {
                ...(item as TimelineThinkingItem),
                text: p.text,
                source: item.source ?? { kind: "desktop" },
                runtime: item.runtime ?? s.runtime,
                status,
              }
            : item,
        );
      } else {
        s.timeline = [
          ...s.timeline,
          {
            kind: "thinking" as const,
            id: String(e.seq),
            agentId: e.agentId,
            text: p.text,
            ts: e.ts,
            ...desktopTimelineMeta(s),
            status,
          },
        ];
      }
      break;
    }
    default:
      break;
  }

  // 活跃度:任何 message/tool/agent/usage 事件都刷新 lastActiveAt,供大厅 ≤10/LRU
  // 选择(spec §生命周期)。房间归属按 project 不按活跃度,故 NPC 不会因此挪位。
  s.lastActiveAt = e.ts;
  sessions[e.sessionId] = s;
  return { ...domainTimelineState, sessions };
}

export interface RoomStore extends RoomStateWithPrototype {
  applyEvent: (e: RoomEvent) => void;
  switchSession: (id: string) => void;
  appendUserMessage: (sessionId: string, text: string) => void;
  // 软归档(纯客户端可见性,driver 后台不杀):移出大厅、进 ChatDrawer 已归档区。
  archiveSession: (id: string) => void;
  // 取消归档 → 走回大厅并挤掉当前 LRU;焦点切到它。
  unarchiveSession: (id: string) => void;
  // 硬删除的客户端侧:从 store 移除。停 driver 的命令由调用方另发(避免 store↔ws 循环)。
  removeSession: (id: string) => void;
  // 重连对账:只保留引擎花名册(ids)里的会话,清掉本地残留的幽灵会话。
  reconcileSessions: (ids: string[]) => void;
  limits: AccountLimits | null;
  setLimits: (limits: AccountLimits) => void;
  setConnection: (c: ConnectionStatus) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  ...createPrototypeStateSlices(),
  limits: null,
  setLimits: (limits) => set({ limits }),
  setConnection: (connection) => set({ connection }),
  applyEvent: (e) => set((st) => reduce(st, e)),
  switchSession: (id) => set({ currentSessionId: id }),
  // 乐观回显:用户发的消息没有对应服务端事件,本地直接进 transcript;同时刷新活跃度。
  appendUserMessage: (sessionId, text) =>
    set((st) => {
      const prev = st.sessions[sessionId];
      if (!prev) return st;
      const item: TimelineMessageItem = {
        kind: "message",
        id: `u-${sessionId}-${prev.timeline.length}`,
        role: "user",
        text,
        ts: Date.now(),
        ...desktopTimelineMeta(prev),
        status: "final",
      };
      return {
        sessions: {
          ...st.sessions,
          [sessionId]: {
            ...prev,
            lastActiveAt: Date.now(),
            timeline: [...prev.timeline, item],
          },
        },
      };
    }),
  archiveSession: (id) =>
    set((st) => {
      const s = st.sessions[id];
      if (!s || s.archived) return st;
      return {
        sessions: { ...st.sessions, [id]: { ...s, archived: true } },
        currentSessionId:
          st.currentSessionId === id ? null : st.currentSessionId,
      };
    }),
  unarchiveSession: (id) =>
    set((st) => {
      const s = st.sessions[id];
      if (!s) return st;
      const sessions = {
        ...st.sessions,
        [id]: { ...s, archived: false, lastActiveAt: Date.now() },
      };
      enforceActiveCap(sessions, id);
      return { sessions, currentSessionId: id };
    }),
  removeSession: (id) =>
    set((st) => {
      if (!st.sessions[id]) return st;
      const sessions = { ...st.sessions };
      // 注:不修剪 projectOrder(追加式、保证既有房间不挪位),删掉某项目最后一个
      // 会话会留下一个空房间直到刷新 —— 已接受的 tradeoff(见 spec §验证)。
      delete sessions[id];
      return {
        sessions,
        currentSessionId:
          st.currentSessionId === id ? null : st.currentSessionId,
      };
    }),
  // 重连对账:引擎在新连接时下发当前会话花名册(ids)。本地 store 里不在册的会话是
  // 幽灵(引擎重启 / 换引擎 / replay→live 后残留),清掉;在册的原样保留(同引用,
  // 短抖重连不丢数据)。**导入会话豁免**:它是客户端自有的静态存档(无 Driver),不归
  // 引擎花名册管辖——否则引擎 --watch 重启的空花名册会误删用户载入的存档(回看变黑屏)。
  // 焦点指向被清会话则归 null。projectOrder 追加式不修剪(同 removeSession 的 tradeoff)。
  // 无幽灵则不动,避免无谓重渲染。
  reconcileSessions: (ids) =>
    set((st) => {
      const keep = new Set(ids);
      const sessions: typeof st.sessions = {};
      let pruned = false;
      for (const [id, s] of Object.entries(st.sessions)) {
        if (keep.has(id) || s.imported) sessions[id] = s;
        else pruned = true;
      }
      if (!pruned) return st;
      return {
        sessions,
        // 焦点幸存(在册或导入)则保留;被清才归 null。
        currentSessionId:
          st.currentSessionId && sessions[st.currentSessionId]
            ? st.currentSessionId
            : null,
      };
    }),
}));
