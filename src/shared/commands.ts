import type { AchievementProgress, InventoryItem } from "./economy";
import type { RoguentSettings, SettingsScope } from "./events";
import type { IntegrationChannel, PairingBindingStatus } from "./integrations";
import {
  isCodexApprovalPolicy,
  isPermissionMode,
  isReasoningEffort,
  isRuntimeKind,
  isSandboxMode,
  normalizeRuntimeKind,
} from "./runtime";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeConfig,
  RuntimeKind,
  SandboxMode,
} from "./runtime";
import type {
  SchedulerRecurrence,
  SchedulerRun,
  SchedulerTask,
  SchedulerTaskStatus,
} from "./scheduler";

export interface NewSessionCommand {
  cmd: "newSession";
  sessionId: string;
  title: string;
  model: string;
  runtime?: RuntimeKind;
  cwd?: string;
  permissionMode?: PermissionMode;
  approvalPolicy?: CodexApprovalPolicy;
  sandboxMode?: SandboxMode;
  reasoningEffort?: ReasoningEffort;
  networkAccess?: boolean;
}

export interface SendMessageCommand {
  cmd: "sendMessage";
  sessionId: string;
  text: string;
}

export interface SetModelCommand {
  cmd: "setModel";
  sessionId: string;
  model: string;
}

export interface InterruptCommand {
  cmd: "interrupt";
  sessionId: string;
}

export interface RollbackCommand {
  cmd: "rollback";
  sessionId: string;
  checkpointId: string;
}

export interface RetryFromCommand {
  cmd: "retryFrom";
  sessionId: string;
  timelineItemId: string;
}

export interface DeleteSessionCommand {
  cmd: "deleteSession";
  sessionId: string;
}

export interface ListLocalSessionsCommand {
  cmd: "listLocalSessions";
}

export interface ImportSessionCommand {
  cmd: "importSession";
  path: string;
}

export interface RespondPermissionCommand {
  cmd: "respondPermission";
  sessionId: string;
  promptId: string;
  behavior: "allow" | "deny";
  message?: string;
}

export interface RespondQuestionCommand {
  cmd: "respondQuestion";
  sessionId: string;
  promptId: string;
  selectedLabels: string[];
}

export interface SetPermissionModeCommand {
  cmd: "setPermissionMode";
  sessionId: string;
  mode: PermissionMode;
}

export interface SetRuntimeConfigCommand {
  cmd: "setRuntimeConfig";
  sessionId?: string;
  config: RuntimeConfig;
  cwd?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePairingCommand {
  cmd: "createPairing";
  sessionId: string;
  channel: IntegrationChannel;
  externalChatId?: string;
  externalUserId?: string;
  displayName?: string;
  forwardingEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdatePairingCommand {
  cmd: "updatePairing";
  bindingId: string;
  sessionId?: string;
  status?: PairingBindingStatus;
  externalChatId?: string;
  externalUserId?: string;
  displayName?: string;
  forwardingEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type SchedulerCommand =
  | {
      cmd: "scheduler";
      action: "createTask";
      task: SchedulerTask;
    }
  | {
      cmd: "scheduler";
      action: "updateTask";
      taskId: string;
      changes: Partial<SchedulerTask>;
    }
  | {
      cmd: "scheduler";
      action: "deleteTask" | "runTask";
      taskId: string;
    }
  | {
      cmd: "scheduler";
      action: "cancelRun";
      runId: string;
    };

export type MailboxCommand =
  | {
      cmd: "mailbox";
      action: "markRead" | "archive";
      itemId: string;
    }
  | {
      cmd: "mailbox";
      action: "invokeAction";
      itemId: string;
      actionId: string;
      metadata?: Record<string, unknown>;
    };

export type EconomyCommand =
  | {
      cmd: "economy";
      action: "claimAchievement";
      achievementId: AchievementProgress["id"];
    }
  | {
      cmd: "economy";
      action: "purchaseItem";
      sku: InventoryItem["sku"];
      quantity?: number;
      metadata?: Record<string, unknown>;
    }
  | {
      cmd: "economy";
      action: "equipItem" | "unequipItem";
      itemId: InventoryItem["id"];
    };

export interface SettingsCommand {
  cmd: "settings";
  action: "update";
  scope: SettingsScope;
  settings: RoguentSettings;
  changedKeys?: string[];
  metadata?: Record<string, unknown>;
}

export type ClientCommand =
  | NewSessionCommand
  | SendMessageCommand
  | SetModelCommand
  | InterruptCommand
  | RollbackCommand
  | RetryFromCommand
  | DeleteSessionCommand
  | ListLocalSessionsCommand
  | ImportSessionCommand
  | RespondPermissionCommand
  | RespondQuestionCommand
  | SetPermissionModeCommand
  | SetRuntimeConfigCommand
  | CreatePairingCommand
  | UpdatePairingCommand
  | SchedulerCommand
  | MailboxCommand
  | EconomyCommand
  | SettingsCommand;

export type ParseClientCommandFailure = {
  ok: false;
  error: string;
  sessionId?: string;
};

export type ParseClientCommandResult =
  | { ok: true; command: ClientCommand }
  | ParseClientCommandFailure;

const INTEGRATION_CHANNELS = [
  "wechat",
  "feishu",
  "github",
  "x",
  "relay",
] as const satisfies readonly IntegrationChannel[];

const PAIRING_BINDING_STATUSES = [
  "active",
  "revoked",
  "expired",
] as const satisfies readonly PairingBindingStatus[];

const SCHEDULER_TASK_STATUSES = [
  "enabled",
  "disabled",
  "paused",
  "archived",
] as const satisfies readonly SchedulerTaskStatus[];

const SETTINGS_SCOPES = [
  "user",
  "project",
  "session",
] as const satisfies readonly SettingsScope[];
const SCHEDULER_TASK_KEYS = [
  "id",
  "title",
  "prompt",
  "status",
  "createdAt",
  "updatedAt",
  "nextRunAt",
  "cwd",
  "runtime",
  "schedule",
  "metadata",
] as const;
const ROGUENT_SETTINGS_KEYS = [
  "runtime",
  "integrations",
  "scheduler",
  "economy",
  "ui",
  "metadata",
] as const;
const SETTINGS_INTEGRATION_KEYS = ["enabled", "metadata"] as const;
const SETTINGS_SCHEDULER_KEYS = ["enabled", "timezone", "metadata"] as const;
const SETTINGS_ECONOMY_KEYS = ["enabled", "metadata"] as const;
const RECURRENCE_ONCE_KEYS = ["kind", "runAt"] as const;
const RECURRENCE_DAILY_KEYS = ["kind", "hour", "minute", "timezone"] as const;
const RECURRENCE_WEEKLY_KEYS = [
  "kind",
  "daysOfWeek",
  "hour",
  "minute",
  "timezone",
] as const;
const RECURRENCE_MONTHLY_KEYS = [
  "kind",
  "dayOfMonth",
  "hour",
  "minute",
  "timezone",
] as const;

export function parseClientCommand(raw: unknown): ParseClientCommandResult {
  const parsed = parseRawCommand(raw);
  if (!parsed.ok) return parsed;

  const o = parsed.value;
  switch (o.cmd) {
    case "newSession":
      return parseNewSessionCommand(o);
    case "sendMessage":
      return parseStringFields(o, ["sessionId", "text"], {
        cmd: "sendMessage",
      });
    case "setModel":
      return parseStringFields(o, ["sessionId", "model"], {
        cmd: "setModel",
      });
    case "interrupt":
      return parseStringFields(o, ["sessionId"], { cmd: "interrupt" });
    case "rollback":
      return parseStringFields(o, ["sessionId", "checkpointId"], {
        cmd: "rollback",
      });
    case "retryFrom":
      return parseStringFields(o, ["sessionId", "timelineItemId"], {
        cmd: "retryFrom",
      });
    case "deleteSession":
      return parseStringFields(o, ["sessionId"], { cmd: "deleteSession" });
    case "listLocalSessions":
      return { ok: true, command: { cmd: "listLocalSessions" } };
    case "importSession":
      return parseStringFields(o, ["path"], { cmd: "importSession" });
    case "respondPermission":
      return parseRespondPermissionCommand(o);
    case "respondQuestion":
      return parseRespondQuestionCommand(o);
    case "setPermissionMode":
      return parseSetPermissionModeCommand(o);
    case "setRuntimeConfig":
      return parseSetRuntimeConfigCommand(o);
    case "createPairing":
      return parseCreatePairingCommand(o);
    case "updatePairing":
      return parseUpdatePairingCommand(o);
    case "scheduler":
      return parseSchedulerCommand(o);
    case "mailbox":
      return parseMailboxCommand(o);
    case "economy":
      return parseEconomyCommand(o);
    case "settings":
      return parseSettingsCommand(o);
    default:
      return fail("Unknown client command", sessionIdOf(o));
  }
}

type ParseRawCommandResult =
  | { ok: true; value: Record<string, unknown> }
  | ParseClientCommandFailure;

function parseRawCommand(raw: unknown): ParseRawCommandResult {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return fail("Invalid JSON");
    }
  }
  if (!isRecord(value)) return fail("Client command must be an object");
  return { ok: true, value };
}

function parseNewSessionCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.sessionId !== "string" ||
    typeof o.title !== "string" ||
    typeof o.model !== "string" ||
    !optionalString(o.cwd) ||
    (o.runtime !== undefined && !isRuntimeKind(o.runtime)) ||
    (o.permissionMode !== undefined && !isPermissionMode(o.permissionMode)) ||
    (o.approvalPolicy !== undefined &&
      !isCodexApprovalPolicy(o.approvalPolicy)) ||
    (o.sandboxMode !== undefined && !isSandboxMode(o.sandboxMode)) ||
    (o.reasoningEffort !== undefined &&
      !isReasoningEffort(o.reasoningEffort)) ||
    !optionalBoolean(o.networkAccess)
  ) {
    return fail("Invalid newSession command", sessionIdOf(o));
  }

  return {
    ok: true,
    command: {
      cmd: "newSession",
      sessionId: o.sessionId,
      title: o.title,
      model: o.model,
      runtime: normalizeRuntimeKind(o.runtime),
      ...(o.cwd !== undefined ? { cwd: o.cwd } : {}),
      ...(o.permissionMode !== undefined
        ? { permissionMode: o.permissionMode }
        : {}),
      ...(o.approvalPolicy !== undefined
        ? { approvalPolicy: o.approvalPolicy }
        : {}),
      ...(o.sandboxMode !== undefined ? { sandboxMode: o.sandboxMode } : {}),
      ...(o.reasoningEffort !== undefined
        ? { reasoningEffort: o.reasoningEffort }
        : {}),
      ...(o.networkAccess !== undefined
        ? { networkAccess: o.networkAccess }
        : {}),
    },
  };
}

function parseRespondPermissionCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.sessionId !== "string" ||
    typeof o.promptId !== "string" ||
    (o.behavior !== "allow" && o.behavior !== "deny") ||
    !optionalString(o.message)
  ) {
    return fail("Invalid respondPermission command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "respondPermission",
      sessionId: o.sessionId,
      promptId: o.promptId,
      behavior: o.behavior,
      ...(o.message !== undefined ? { message: o.message } : {}),
    },
  };
}

function parseRespondQuestionCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.sessionId !== "string" ||
    typeof o.promptId !== "string" ||
    !isStringArray(o.selectedLabels)
  ) {
    return fail("Invalid respondQuestion command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "respondQuestion",
      sessionId: o.sessionId,
      promptId: o.promptId,
      selectedLabels: o.selectedLabels,
    },
  };
}

function parseSetPermissionModeCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (typeof o.sessionId !== "string" || !isPermissionMode(o.mode)) {
    return fail("Invalid setPermissionMode command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "setPermissionMode",
      sessionId: o.sessionId,
      mode: o.mode,
    },
  };
}

function parseSetRuntimeConfigCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  const config = parseRuntimeConfig(o.config);
  if (
    config === null ||
    !optionalString(o.sessionId) ||
    !optionalString(o.cwd) ||
    !optionalRecord(o.metadata)
  ) {
    return fail("Invalid setRuntimeConfig command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "setRuntimeConfig",
      config,
      ...(o.sessionId !== undefined ? { sessionId: o.sessionId } : {}),
      ...(o.cwd !== undefined ? { cwd: o.cwd } : {}),
      ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
    },
  };
}

function parseCreatePairingCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.sessionId !== "string" ||
    !isIntegrationChannel(o.channel) ||
    !optionalString(o.externalChatId) ||
    !optionalString(o.externalUserId) ||
    !optionalString(o.displayName) ||
    !optionalBoolean(o.forwardingEnabled) ||
    !optionalRecord(o.metadata)
  ) {
    return fail("Invalid createPairing command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "createPairing",
      sessionId: o.sessionId,
      channel: o.channel,
      ...(o.externalChatId !== undefined
        ? { externalChatId: o.externalChatId }
        : {}),
      ...(o.externalUserId !== undefined
        ? { externalUserId: o.externalUserId }
        : {}),
      ...(o.displayName !== undefined ? { displayName: o.displayName } : {}),
      ...(o.forwardingEnabled !== undefined
        ? { forwardingEnabled: o.forwardingEnabled }
        : {}),
      ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
    },
  };
}

function parseUpdatePairingCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  if (
    typeof o.bindingId !== "string" ||
    !optionalString(o.sessionId) ||
    (o.status !== undefined && !isPairingBindingStatus(o.status)) ||
    !optionalString(o.externalChatId) ||
    !optionalString(o.externalUserId) ||
    !optionalString(o.displayName) ||
    !optionalBoolean(o.forwardingEnabled) ||
    !optionalRecord(o.metadata)
  ) {
    return fail("Invalid updatePairing command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "updatePairing",
      bindingId: o.bindingId,
      ...(o.sessionId !== undefined ? { sessionId: o.sessionId } : {}),
      ...(o.status !== undefined ? { status: o.status } : {}),
      ...(o.externalChatId !== undefined
        ? { externalChatId: o.externalChatId }
        : {}),
      ...(o.externalUserId !== undefined
        ? { externalUserId: o.externalUserId }
        : {}),
      ...(o.displayName !== undefined ? { displayName: o.displayName } : {}),
      ...(o.forwardingEnabled !== undefined
        ? { forwardingEnabled: o.forwardingEnabled }
        : {}),
      ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
    },
  };
}

function parseSchedulerCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  switch (o.action) {
    case "createTask": {
      const task = parseSchedulerTask(o.task);
      if (task === null)
        return fail("Invalid scheduler command", sessionIdOf(o));
      return {
        ok: true,
        command: { cmd: "scheduler", action: o.action, task },
      };
    }
    case "updateTask": {
      const changes = parsePartialSchedulerTask(o.changes);
      if (typeof o.taskId !== "string" || changes === null) {
        return fail("Invalid scheduler command", sessionIdOf(o));
      }
      return {
        ok: true,
        command: {
          cmd: "scheduler",
          action: o.action,
          taskId: o.taskId,
          changes,
        },
      };
    }
    case "deleteTask":
    case "runTask":
      return typeof o.taskId === "string"
        ? {
            ok: true,
            command: { cmd: "scheduler", action: o.action, taskId: o.taskId },
          }
        : fail("Invalid scheduler command", sessionIdOf(o));
    case "cancelRun":
      return typeof o.runId === "string"
        ? {
            ok: true,
            command: { cmd: "scheduler", action: o.action, runId: o.runId },
          }
        : fail("Invalid scheduler command", sessionIdOf(o));
    default:
      return fail("Unknown scheduler action", sessionIdOf(o));
  }
}

function parseMailboxCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  switch (o.action) {
    case "markRead":
    case "archive":
      return typeof o.itemId === "string"
        ? {
            ok: true,
            command: { cmd: "mailbox", action: o.action, itemId: o.itemId },
          }
        : fail("Invalid mailbox command", sessionIdOf(o));
    case "invokeAction":
      return typeof o.itemId === "string" &&
        typeof o.actionId === "string" &&
        optionalRecord(o.metadata)
        ? {
            ok: true,
            command: {
              cmd: "mailbox",
              action: o.action,
              itemId: o.itemId,
              actionId: o.actionId,
              ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
            },
          }
        : fail("Invalid mailbox command", sessionIdOf(o));
    default:
      return fail("Unknown mailbox action", sessionIdOf(o));
  }
}

function parseEconomyCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  switch (o.action) {
    case "claimAchievement":
      return typeof o.achievementId === "string"
        ? {
            ok: true,
            command: {
              cmd: "economy",
              action: o.action,
              achievementId: o.achievementId,
            },
          }
        : fail("Invalid economy command", sessionIdOf(o));
    case "purchaseItem":
      return typeof o.sku === "string" &&
        optionalNumber(o.quantity) &&
        optionalRecord(o.metadata)
        ? {
            ok: true,
            command: {
              cmd: "economy",
              action: o.action,
              sku: o.sku,
              ...(o.quantity !== undefined ? { quantity: o.quantity } : {}),
              ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
            },
          }
        : fail("Invalid economy command", sessionIdOf(o));
    case "equipItem":
    case "unequipItem":
      return typeof o.itemId === "string"
        ? {
            ok: true,
            command: { cmd: "economy", action: o.action, itemId: o.itemId },
          }
        : fail("Invalid economy command", sessionIdOf(o));
    default:
      return fail("Unknown economy action", sessionIdOf(o));
  }
}

function parseSettingsCommand(
  o: Record<string, unknown>,
): ParseClientCommandResult {
  const settings = parseRoguentSettings(o.settings);
  if (
    o.action !== "update" ||
    !isSettingsScope(o.scope) ||
    settings === null ||
    (o.changedKeys !== undefined && !isStringArray(o.changedKeys)) ||
    !optionalRecord(o.metadata)
  ) {
    return fail("Invalid settings command", sessionIdOf(o));
  }
  return {
    ok: true,
    command: {
      cmd: "settings",
      action: "update",
      scope: o.scope,
      settings,
      ...(o.changedKeys !== undefined ? { changedKeys: o.changedKeys } : {}),
      ...(o.metadata !== undefined ? { metadata: o.metadata } : {}),
    },
  };
}

function parseStringFields<const C extends ClientCommand["cmd"]>(
  o: Record<string, unknown>,
  fields: readonly string[],
  base: { cmd: C },
): ParseClientCommandResult {
  const command: Record<string, unknown> = { cmd: base.cmd };
  for (const field of fields) {
    const value = o[field];
    if (typeof value !== "string") {
      return fail(`Invalid ${base.cmd} command`, sessionIdOf(o));
    }
    command[field] = value;
  }
  return { ok: true, command: command as ClientCommand };
}

function parseRuntimeConfig(value: unknown): RuntimeConfig | null {
  if (!isRecord(value)) return null;
  if (
    !isRuntimeKind(value.runtime) ||
    typeof value.model !== "string" ||
    !isPermissionMode(value.permissionMode) ||
    (value.approvalPolicy !== undefined &&
      !isCodexApprovalPolicy(value.approvalPolicy)) ||
    !isSandboxMode(value.sandboxMode) ||
    (value.reasoningEffort !== undefined &&
      !isReasoningEffort(value.reasoningEffort)) ||
    typeof value.networkAccess !== "boolean"
  ) {
    return null;
  }
  return {
    runtime: value.runtime,
    model: value.model,
    permissionMode: value.permissionMode,
    ...(value.approvalPolicy !== undefined
      ? { approvalPolicy: value.approvalPolicy }
      : {}),
    sandboxMode: value.sandboxMode,
    ...(value.reasoningEffort !== undefined
      ? { reasoningEffort: value.reasoningEffort }
      : {}),
    networkAccess: value.networkAccess,
  };
}

function parseSchedulerTask(value: unknown): SchedulerTask | null {
  if (!isRecord(value)) return null;
  const runtime =
    value.runtime === undefined ? undefined : parseRuntimeConfig(value.runtime);
  const schedule =
    value.schedule === undefined
      ? undefined
      : parseSchedulerRecurrence(value.schedule);
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.prompt !== "string" ||
    !isSchedulerTaskStatus(value.status) ||
    typeof value.createdAt !== "number" ||
    !optionalNumber(value.updatedAt) ||
    !optionalNumberOrNull(value.nextRunAt) ||
    !optionalString(value.cwd) ||
    runtime === null ||
    schedule === null ||
    !optionalRecord(value.metadata)
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    prompt: value.prompt,
    status: value.status,
    createdAt: value.createdAt,
    ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
    ...(value.nextRunAt !== undefined ? { nextRunAt: value.nextRunAt } : {}),
    ...(value.cwd !== undefined ? { cwd: value.cwd } : {}),
    ...(runtime !== undefined ? { runtime } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
  };
}

function parsePartialSchedulerTask(
  value: unknown,
): Partial<SchedulerTask> | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, SCHEDULER_TASK_KEYS)) return null;
  const changes: Partial<SchedulerTask> = {};
  if (value.id !== undefined) {
    if (typeof value.id !== "string") return null;
    changes.id = value.id;
  }
  if (value.title !== undefined) {
    if (typeof value.title !== "string") return null;
    changes.title = value.title;
  }
  if (value.prompt !== undefined) {
    if (typeof value.prompt !== "string") return null;
    changes.prompt = value.prompt;
  }
  if (value.status !== undefined) {
    if (!isSchedulerTaskStatus(value.status)) return null;
    changes.status = value.status;
  }
  if (value.createdAt !== undefined) {
    if (typeof value.createdAt !== "number") return null;
    changes.createdAt = value.createdAt;
  }
  if (value.updatedAt !== undefined) {
    if (typeof value.updatedAt !== "number") return null;
    changes.updatedAt = value.updatedAt;
  }
  if (value.nextRunAt !== undefined) {
    if (!isNumberOrNull(value.nextRunAt)) return null;
    changes.nextRunAt = value.nextRunAt;
  }
  if (value.cwd !== undefined) {
    if (typeof value.cwd !== "string") return null;
    changes.cwd = value.cwd;
  }
  if (value.runtime !== undefined) {
    const runtime = parseRuntimeConfig(value.runtime);
    if (runtime === null) return null;
    changes.runtime = runtime;
  }
  if (value.schedule !== undefined) {
    const schedule = parseSchedulerRecurrence(value.schedule);
    if (schedule === null) return null;
    changes.schedule = schedule;
  }
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) return null;
    changes.metadata = value.metadata;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function parseSchedulerRecurrence(value: unknown): SchedulerRecurrence | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "once":
      return hasOnlyKeys(value, RECURRENCE_ONCE_KEYS) &&
        typeof value.runAt === "number" &&
        Number.isFinite(value.runAt)
        ? { kind: "once", runAt: value.runAt }
        : null;
    case "daily": {
      if (!hasOnlyKeys(value, RECURRENCE_DAILY_KEYS)) return null;
      const wallClock = parseWallClock(value);
      return wallClock ? { kind: "daily", ...wallClock } : null;
    }
    case "weekly": {
      if (!hasOnlyKeys(value, RECURRENCE_WEEKLY_KEYS)) return null;
      const wallClock = parseWallClock(value);
      const daysOfWeek = value.daysOfWeek;
      return wallClock &&
        Array.isArray(daysOfWeek) &&
        daysOfWeek.length > 0 &&
        daysOfWeek.every(isWeekday)
        ? { kind: "weekly", daysOfWeek, ...wallClock }
        : null;
    }
    case "monthly": {
      if (!hasOnlyKeys(value, RECURRENCE_MONTHLY_KEYS)) return null;
      const wallClock = parseWallClock(value);
      const dayOfMonth = value.dayOfMonth;
      return wallClock &&
        typeof dayOfMonth === "number" &&
        Number.isInteger(dayOfMonth) &&
        dayOfMonth >= 1 &&
        dayOfMonth <= 31
        ? { kind: "monthly", dayOfMonth, ...wallClock }
        : null;
    }
    default:
      return null;
  }
}

function parseWallClock(
  value: Record<string, unknown>,
): { hour: number; minute: number; timezone: string } | null {
  const { hour, minute, timezone } = value;
  return typeof hour === "number" &&
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    typeof minute === "number" &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59 &&
    typeof timezone === "string" &&
    isValidTimezone(timezone)
    ? { hour, minute, timezone }
    : null;
}

function isWeekday(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

function isValidTimezone(value: string): boolean {
  if (value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function parseRoguentSettings(value: unknown): RoguentSettings | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ROGUENT_SETTINGS_KEYS)) return null;
  const runtime =
    value.runtime === undefined ? undefined : parseRuntimeConfig(value.runtime);
  const integrations = parseSettingsIntegrations(value.integrations);
  const scheduler = parseSettingsScheduler(value.scheduler);
  const economy = parseSettingsEconomy(value.economy);
  if (
    runtime === null ||
    integrations === null ||
    scheduler === null ||
    economy === null ||
    !optionalRecord(value.ui) ||
    !optionalRecord(value.metadata)
  ) {
    return null;
  }
  return {
    ...(runtime !== undefined ? { runtime } : {}),
    ...(integrations !== undefined ? { integrations } : {}),
    ...(scheduler !== undefined ? { scheduler } : {}),
    ...(economy !== undefined ? { economy } : {}),
    ...(value.ui !== undefined ? { ui: value.ui } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
  };
}

function parseSettingsIntegrations(
  value: unknown,
): RoguentSettings["integrations"] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const integrations: NonNullable<RoguentSettings["integrations"]> = {};
  for (const [channel, entry] of Object.entries(value)) {
    if (!isIntegrationChannel(channel) || !isRecord(entry)) return null;
    if (!hasOnlyKeys(entry, SETTINGS_INTEGRATION_KEYS)) return null;
    if (typeof entry.enabled !== "boolean" || !optionalRecord(entry.metadata)) {
      return null;
    }
    integrations[channel] = {
      enabled: entry.enabled,
      ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
    };
  }
  return integrations;
}

function parseSettingsScheduler(
  value: unknown,
): RoguentSettings["scheduler"] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, SETTINGS_SCHEDULER_KEYS)) return null;
  if (
    !optionalBoolean(value.enabled) ||
    !optionalString(value.timezone) ||
    !optionalRecord(value.metadata)
  ) {
    return null;
  }
  return {
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    ...(value.timezone !== undefined ? { timezone: value.timezone } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
  };
}

function parseSettingsEconomy(
  value: unknown,
): RoguentSettings["economy"] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, SETTINGS_ECONOMY_KEYS)) return null;
  if (!optionalBoolean(value.enabled) || !optionalRecord(value.metadata)) {
    return null;
  }
  return {
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
  };
}

function fail(error: string, sessionId?: string): ParseClientCommandFailure {
  return sessionId === undefined
    ? { ok: false, error }
    : { ok: false, error, sessionId };
}

function sessionIdOf(value: Record<string, unknown>): string | undefined {
  return typeof value.sessionId === "string" ? value.sessionId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === "number";
}

function optionalNumberOrNull(
  value: unknown,
): value is number | null | undefined {
  return value === undefined || isNumberOrNull(value);
}

function optionalRecord(
  value: unknown,
): value is Record<string, unknown> | undefined {
  return value === undefined || isRecord(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isIntegrationChannel(value: unknown): value is IntegrationChannel {
  return (
    typeof value === "string" &&
    INTEGRATION_CHANNELS.includes(value as IntegrationChannel)
  );
}

function isPairingBindingStatus(value: unknown): value is PairingBindingStatus {
  return (
    typeof value === "string" &&
    PAIRING_BINDING_STATUSES.includes(value as PairingBindingStatus)
  );
}

function isSchedulerTaskStatus(value: unknown): value is SchedulerTaskStatus {
  return (
    typeof value === "string" &&
    SCHEDULER_TASK_STATUSES.includes(value as SchedulerTaskStatus)
  );
}

function isSettingsScope(value: unknown): value is SettingsScope {
  return (
    typeof value === "string" &&
    SETTINGS_SCOPES.includes(value as SettingsScope)
  );
}
