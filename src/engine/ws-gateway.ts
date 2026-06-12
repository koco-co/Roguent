import { basename } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import { type ClientCommand, parseClientCommand } from "../shared/commands";
import type {
  AccountLimits,
  AchievementUpdatedPayload,
  EconomyLedgerAppendedPayload,
  InventoryUpdatedPayload,
  LimitsMessage,
  MailboxItem,
  PluginActionPhase,
  PluginEntry,
  PluginsMessage,
  RoguentSettings,
  RoomEvent,
  SettingsScope,
  SettingsUpdatedPayload,
} from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import type {
  SchedulerRun,
  SchedulerTask,
  SchedulerTaskDraft,
} from "../shared/scheduler";
import { listLocalSessions } from "./local-sessions";
import type { SessionManager } from "./session";

export interface GatewayMailboxService {
  markRead(itemId: string): MailboxItem;
  archive(itemId: string): MailboxItem;
  resend(
    itemId: string,
    options?: { targetSessionId?: string },
  ): { item: MailboxItem; targetSessionId: string; text: string };
}

export interface GatewaySchedulerService {
  createTask(task: SchedulerTaskDraft): SchedulerTask;
  updateTask(taskId: string, changes: Partial<SchedulerTask>): SchedulerTask;
  deleteTask(taskId: string): SchedulerTask;
  runTask(taskId: string): SchedulerRun;
}

export interface GatewaySettingsService {
  update(
    scope: SettingsScope,
    settings: RoguentSettings,
    changedKeys?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<SettingsUpdatedPayload>;
  load(scope: SettingsScope): Promise<RoguentSettings | null>;
}

export interface GatewayAchievementsService {
  applyEvent?: (event: RoomEvent) => AchievementUpdatedPayload[];
  claim: (
    achievementId: string,
    options?: { sessionId?: string | null; sourceEventId?: string },
  ) =>
    | {
        ok: true;
        achievement: AchievementUpdatedPayload["achievement"];
        ledgerEntry: EconomyLedgerAppendedPayload["entry"];
      }
    | { ok: false; reason: string; detail?: string };
}

export interface GatewayGachaService {
  pull(
    sku: string,
    seed: string,
  ):
    | {
        ok: true;
        ledgerEntries: EconomyLedgerAppendedPayload["entry"][];
        inventoryUpdate: InventoryUpdatedPayload;
      }
    | { ok: false; reason: "insufficient_balance" | "unknown_sku" | string };
}

export interface GatewayPluginsService {
  snapshot(): PluginEntry[];
  runAction(
    action: "install" | "enable" | "disable" | "uninstall",
    pluginId: string,
  ): Promise<PluginEntry[]>;
}

export interface WsGatewayOptions {
  mailbox?: GatewayMailboxService;
  scheduler?: GatewaySchedulerService;
  settings?: GatewaySettingsService;
  achievements?: GatewayAchievementsService;
  gacha?: GatewayGachaService;
  plugins?: GatewayPluginsService;
  /**
   * Returns the initial value for the pull sequence counter. Called lazily on
   * the first pull so the gateway does not need to be async.
   *
   * Callers should supply `() => ledger.entries(null).length` (or similar
   * persistent monotonic count) so that pull seeds remain unique across gateway
   * restarts. Without this, `pullSeq` resets to 0 on restart and reissues
   * identical seeds for the first N pulls of a new process lifetime.
   *
   * Using a ledger entry count (rather than Date.now / Math.random) keeps the
   * seed derivation deterministic within a single pull while still being unique
   * across restarts.
   */
  initialPullSeq?: () => number;
}

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private importSeq = 0;
  /** Lazily initialized from options.initialPullSeq on the first pull. */
  private pullSeq: number | null = null;
  private lastLimits: LimitsMessage | null = null;
  private lastPlugins: PluginsMessage | null = null;

  constructor(
    port: number,
    private mgr: SessionManager,
    onListening?: (port: number) => void,
    private readonly options: WsGatewayOptions = {},
  ) {
    this.wss = new WebSocketServer({ port });
    if (onListening) {
      this.wss.on("listening", () => {
        const addr = this.wss.address();
        if (addr && typeof addr === "object") onListening(addr.port);
      });
    }
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    mgr.subscribe((e) => {
      this.broadcast(e);
      this.publishAchievementUpdatesFor(e);
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    if (this.lastLimits) ws.send(JSON.stringify(this.lastLimits));
    if (this.lastPlugins) ws.send(JSON.stringify(this.lastPlugins));
    // 当前会话花名册 → 客户端对账清幽灵(重连/换引擎后残留的旧会话)。
    this.reply(ws, {
      kind: "control",
      type: "roster",
      sessionIds: this.mgr.sessionIds(),
    });
    void this.publishSavedSettings();
    ws.on("message", (data) => void this.onCommand(String(data), ws));
    ws.on("close", () => this.clients.delete(ws));
  }

  private async publishSavedSettings(): Promise<void> {
    const settings = this.options.settings;
    if (!settings) return;
    try {
      const saved = await settings.load("user");
      if (!saved) return;
      this.mgr.publishIntegrationEvent({
        ts: Date.now(),
        sessionId: "__settings__",
        type: "settings.updated",
        payload: {
          scope: "user",
          settings: saved,
          metadata: { source: "settings-load" },
        },
      });
    } catch {
      // Settings hydration is best-effort on reconnect; explicit save commands
      // still surface errors to the active client.
    }
  }

  broadcast(e: RoomEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  pushLimits(limits: AccountLimits): void {
    const msg: LimitsMessage = { kind: "limits", ts: Date.now(), limits };
    this.lastLimits = msg;
    const json = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(json);
  }

  pushPlugins(plugins: PluginEntry[], busy: PluginsMessage["busy"]): void {
    const msg: PluginsMessage = {
      kind: "plugins",
      ts: Date.now(),
      plugins,
      busy,
    };
    this.lastPlugins = msg;
    const json = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(json);
  }

  private onCommand(raw: string, ws: WebSocket): void {
    const parsed = parseClientCommand(raw);
    if (!parsed.ok) {
      this.replyCommandError(
        ws,
        parsed.sessionId ?? "__command__",
        "Invalid client command",
      );
      return;
    }
    const c = parsed.command;
    if (c.cmd === "newSession")
      this.mgr.createSession(c.sessionId, {
        title: c.title,
        model: c.model,
        runtime: c.runtime,
        cwd: c.cwd,
        permissionMode: c.permissionMode,
        approvalPolicy: c.approvalPolicy,
        sandboxMode: c.sandboxMode,
        reasoningEffort: c.reasoningEffort,
        networkAccess: c.networkAccess,
      });
    else if (c.cmd === "sendMessage") this.mgr.sendMessage(c.sessionId, c.text);
    else if (c.cmd === "setModel") void this.mgr.setModel(c.sessionId, c.model);
    else if (c.cmd === "interrupt") void this.mgr.interrupt(c.sessionId);
    else if (c.cmd === "rollback")
      void this.mgr.rollback(c.sessionId, c.checkpointId);
    else if (c.cmd === "retryFrom")
      this.mgr.retryFrom(c.sessionId, c.timelineItemId);
    else if (c.cmd === "deleteSession") this.mgr.deleteSession(c.sessionId);
    else if (c.cmd === "listLocalSessions")
      this.reply(ws, {
        kind: "control",
        type: "localSessions",
        items: listLocalSessions(),
      });
    else if (c.cmd === "importSession") {
      const id = `${basename(c.path, ".jsonl")}#imp${++this.importSeq}`;
      try {
        this.mgr.importSession(id, c.path);
      } catch (e) {
        this.reply(ws, {
          kind: "control",
          type: "importError",
          path: c.path,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (c.cmd === "respondPermission") {
      const result =
        c.behavior === "allow"
          ? { behavior: "allow" as const }
          : { behavior: "deny" as const, message: c.message ?? "denied" };
      this.mgr.respondPermission(c.sessionId, c.promptId, result);
    } else if (c.cmd === "respondQuestion") {
      this.mgr.respondQuestion(c.sessionId, c.promptId, c.selectedLabels);
    } else if (c.cmd === "setPermissionMode") {
      void this.mgr.setPermissionMode(c.sessionId, c.mode);
    } else if (c.cmd === "setRuntimeConfig") {
      if (c.sessionId) void this.mgr.setRuntimeConfig(c.sessionId, c.config);
      else
        this.replyCommandError(
          ws,
          c.sessionId,
          "setRuntimeConfig requires sessionId",
        );
    } else if (c.cmd === "mailbox") {
      this.handleMailboxCommand(c, ws);
    } else if (c.cmd === "scheduler") {
      this.handleSchedulerCommand(c, ws);
    } else if (c.cmd === "settings") {
      void this.handleSettingsCommand(c, ws);
    } else if (c.cmd === "economy") {
      this.handleEconomyCommand(c, ws);
    } else if (c.cmd === "plugins") {
      void this.handlePluginsCommand(c, ws);
    } else {
      this.replyCommandError(
        ws,
        commandSessionId(c),
        `Command not implemented: ${commandLabel(c)}`,
      );
    }
  }

  private publishAchievementUpdatesFor(event: RoomEvent): void {
    const achievements = this.options.achievements;
    if (!achievements?.applyEvent) return;
    for (const payload of achievements.applyEvent(event)) {
      this.mgr.publishIntegrationEvent({
        ts: Date.now(),
        sessionId: event.sessionId,
        type: "achievement.updated",
        payload,
      });
    }
  }

  private handleEconomyCommand(
    c: Extract<ClientCommand, { cmd: "economy" }>,
    ws: WebSocket,
  ): void {
    if (c.action === "claimAchievement") {
      this.handleClaimAchievement(c, ws);
    } else if (c.action === "purchaseItem") {
      this.handlePurchaseItem(c, ws);
    } else {
      this.replyCommandError(
        ws,
        undefined,
        `Economy command not implemented: ${commandLabel(c)}`,
      );
    }
  }

  private async handlePluginsCommand(
    c: Extract<ClientCommand, { cmd: "plugins" }>,
    ws: WebSocket,
  ): Promise<void> {
    const svc = this.options.plugins;
    if (!svc) {
      this.replyCommandError(ws, undefined, "Plugins service unavailable");
      return;
    }
    const current = this.lastPlugins?.plugins ?? svc.snapshot();
    const phase: PluginActionPhase = PLUGIN_PHASE[c.action];
    // Single-in-flight assumption: busy array is replaced, not merged.
    // Fine for a single local user with a serialized service.
    this.pushPlugins(current, [{ id: c.pluginId, phase }]);
    try {
      const fresh = await svc.runAction(c.action, c.pluginId);
      this.pushPlugins(fresh, []);
    } catch (error) {
      // Broadcast actual service state rather than the pre-action snapshot so
      // that partial mutations (and concurrent successes) are not clobbered.
      this.pushPlugins(svc.snapshot(), []);
      const message = error instanceof Error ? error.message : String(error);
      const reason = message.startsWith("claude plugin")
        ? message
        : `Plugin ${c.action} failed: ${message}`;
      this.replyCommandError(ws, undefined, reason);
    }
  }

  private handleClaimAchievement(
    c: Extract<ClientCommand, { cmd: "economy"; action: "claimAchievement" }>,
    ws: WebSocket,
  ): void {
    const achievements = this.options.achievements;
    if (!achievements) {
      this.replyCommandError(ws, undefined, "Achievements service unavailable");
      return;
    }

    const result = achievements.claim(c.achievementId, {
      sessionId: null,
      sourceEventId: `achievement.claimed:${c.achievementId}`,
    });
    if (!result.ok) {
      this.replyCommandError(
        ws,
        undefined,
        `Achievement claim failed: ${result.reason}`,
      );
      return;
    }

    this.mgr.publishIntegrationEvent({
      ts: Date.now(),
      sessionId: "__economy__",
      type: "achievement.updated",
      payload: { achievement: result.achievement },
    });
    this.mgr.publishIntegrationEvent({
      ts: Date.now(),
      sessionId: "__economy__",
      type: "economy.ledger.appended",
      payload: { entry: result.ledgerEntry },
    });
  }

  private handlePurchaseItem(
    c: Extract<ClientCommand, { cmd: "economy"; action: "purchaseItem" }>,
    ws: WebSocket,
  ): void {
    const gacha = this.options.gacha;
    if (!gacha) {
      this.replyCommandError(ws, undefined, "Gacha service unavailable");
      return;
    }

    // Derive a deterministic seed from a monotonically-increasing pull counter.
    // This avoids Math.random()/Date.now() while ensuring successive pulls differ.
    //
    // Lazy initialization: on the first pull we read the persistent count from
    // options.initialPullSeq (e.g. ledger.entries(null).length). This makes the
    // counter unique across gateway restarts without requiring an async constructor.
    if (this.pullSeq === null) {
      this.pullSeq = this.options.initialPullSeq?.() ?? 0;
    }
    const seed = `gacha.pull:${c.sku}:${++this.pullSeq}`;
    const result = gacha.pull(c.sku, seed);

    if (!result.ok) {
      this.replyCommandError(
        ws,
        undefined,
        `Gacha pull failed: ${result.reason}`,
      );
      return;
    }

    const ts = Date.now();
    for (const entry of result.ledgerEntries) {
      this.mgr.publishIntegrationEvent({
        ts,
        sessionId: "__economy__",
        type: "economy.ledger.appended",
        payload: { entry } satisfies EconomyLedgerAppendedPayload,
      });
    }
    // Note: inventory.updated is intentionally NOT emitted here.
    // The store reducer for "inventory.updated" is a no-op (returns state
    // unchanged); inventory is derived from "economy.ledger.appended" via
    // reduceInventoryFromLedger. The ledger entry above already carries the
    // embedded InventoryLedgerMutation, so the UI updates correctly without a
    // separate inventory.updated broadcast.
  }

  private async handleSettingsCommand(
    c: Extract<ClientCommand, { cmd: "settings" }>,
    ws: WebSocket,
  ): Promise<void> {
    const settings = this.options.settings;
    if (!settings) {
      this.replyCommandError(ws, undefined, "Settings service unavailable");
      return;
    }
    try {
      const payload = await settings.update(
        c.scope,
        c.settings,
        c.changedKeys,
        c.metadata,
      );
      this.mgr.publishIntegrationEvent({
        ts: Date.now(),
        sessionId: "__settings__",
        type: "settings.updated",
        payload,
      });
    } catch (error) {
      this.replyCommandError(
        ws,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private handleSchedulerCommand(
    c: Extract<ClientCommand, { cmd: "scheduler" }>,
    ws: WebSocket,
  ): void {
    const scheduler = this.options.scheduler;
    if (!scheduler) {
      this.replyCommandError(ws, undefined, "Scheduler service unavailable");
      return;
    }
    try {
      if (c.action === "createTask") {
        const task = scheduler.createTask(c.task);
        this.publishSchedulerTask("scheduler.task.created", task);
      } else if (c.action === "updateTask") {
        const task = scheduler.updateTask(c.taskId, c.changes);
        this.publishSchedulerTask("scheduler.task.updated", task);
      } else if (c.action === "deleteTask") {
        const task = scheduler.deleteTask(c.taskId);
        this.publishSchedulerTask("scheduler.task.updated", task);
      } else if (c.action === "runTask") {
        scheduler.runTask(c.taskId);
      } else {
        this.replyCommandError(
          ws,
          undefined,
          `Unsupported scheduler action: ${commandLabel(c)}`,
        );
      }
    } catch (error) {
      this.replyCommandError(
        ws,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private handleMailboxCommand(
    c: Extract<ClientCommand, { cmd: "mailbox" }>,
    ws: WebSocket,
  ): void {
    const mailbox = this.options.mailbox;
    if (!mailbox) {
      this.replyCommandError(ws, undefined, "Mailbox service unavailable");
      return;
    }
    try {
      if (c.action === "markRead") {
        this.publishMailboxUpdate(mailbox.markRead(c.itemId), {
          status: "read",
        });
      } else if (c.action === "archive") {
        this.publishMailboxUpdate(mailbox.archive(c.itemId), {
          status: "archived",
        });
      } else if (c.action === "invokeAction" && c.actionId === "resend") {
        const result = mailbox.resend(c.itemId, {
          targetSessionId: stringMetadata(c.metadata, "targetSessionId"),
        });
        this.mgr.sendMessage(result.targetSessionId, result.text);
        this.publishMailboxUpdate(result.item);
      } else {
        this.replyCommandError(
          ws,
          undefined,
          `Unsupported mailbox action: ${commandLabel(c)}`,
        );
      }
    } catch (error) {
      this.replyCommandError(
        ws,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private publishMailboxUpdate(
    item: MailboxItem,
    changes?: Partial<MailboxItem>,
  ): void {
    this.mgr.publishIntegrationEvent({
      ts: Date.now(),
      sessionId: item.sessionId ?? "__mailbox__",
      type: "mailbox.item.updated",
      payload: {
        item,
        ...(changes ? { changes } : {}),
      },
    });
  }

  private publishSchedulerTask(
    type: "scheduler.task.created" | "scheduler.task.updated",
    task: SchedulerTask,
    changes?: Partial<SchedulerTask>,
  ): void {
    this.mgr.publishIntegrationEvent({
      ts: Date.now(),
      sessionId: task.targetSessionId ?? "__scheduler__",
      type,
      payload: {
        task,
        ...(changes ? { changes } : {}),
      },
    });
  }

  private reply(ws: WebSocket, msg: ControlMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private replyCommandError(
    ws: WebSocket,
    sessionId: string | undefined,
    message: string,
  ): void {
    const msg: ControlMessage = {
      kind: "control",
      type: "commandError",
      reason: message,
      ...(sessionId !== undefined ? { sessionId } : {}),
    };
    this.reply(ws, msg);
  }
}

const PLUGIN_PHASE: Record<
  "install" | "enable" | "disable" | "uninstall",
  PluginActionPhase
> = {
  install: "installing",
  enable: "enabling",
  disable: "disabling",
  uninstall: "uninstalling",
};

function commandSessionId(command: ClientCommand): string | undefined {
  return "sessionId" in command && typeof command.sessionId === "string"
    ? command.sessionId
    : undefined;
}

function commandLabel(command: ClientCommand): string {
  return "action" in command ? `${command.cmd}.${command.action}` : command.cmd;
}

function stringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
