import { basename } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import { type ClientCommand, parseClientCommand } from "../shared/commands";
import type { AccountLimits, LimitsMessage, RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import { listLocalSessions } from "./local-sessions";
import type { SessionManager } from "./session";

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private importSeq = 0;
  private lastLimits: LimitsMessage | null = null;

  constructor(
    port: number,
    private mgr: SessionManager,
    onListening?: (port: number) => void,
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
    } else {
      this.replyCommandError(
        ws,
        commandSessionId(c),
        `Command not implemented: ${commandLabel(c)}`,
      );
    }
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
