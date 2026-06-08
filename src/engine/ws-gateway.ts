import { basename } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import { type ClientCommand, parseClientCommand } from "../shared/commands";
import type {
  AccountLimits,
  LimitsMessage,
  MailboxItem,
  RoomEvent,
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

export interface WsGatewayOptions {
  mailbox?: GatewayMailboxService;
  scheduler?: GatewaySchedulerService;
}

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private importSeq = 0;
  private lastLimits: LimitsMessage | null = null;

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
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      if (this.lastLimits) ws.send(JSON.stringify(this.lastLimits));
      // 当前会话花名册 → 客户端对账清幽灵(重连/换引擎后残留的旧会话)。
      this.reply(ws, {
        kind: "control",
        type: "roster",
        sessionIds: this.mgr.sessionIds(),
      });
      ws.on("message", (data) => void this.onCommand(String(data), ws));
      ws.on("close", () => this.clients.delete(ws));
    });
    mgr.subscribe((e) => this.broadcast(e));
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
    } else {
      this.replyCommandError(
        ws,
        commandSessionId(c),
        `Command not implemented: ${commandLabel(c)}`,
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
