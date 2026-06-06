import { basename } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type { AccountLimits, LimitsMessage, RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import { listLocalSessions } from "./local-sessions";
import type { SessionManager } from "./session";

export type Command =
  | {
      cmd: "newSession";
      sessionId: string;
      title: string;
      model: string;
      cwd?: string;
    }
  | { cmd: "sendMessage"; sessionId: string; text: string }
  | { cmd: "setModel"; sessionId: string; model: string }
  | { cmd: "interrupt"; sessionId: string }
  | { cmd: "deleteSession"; sessionId: string }
  | { cmd: "listLocalSessions" }
  | { cmd: "importSession"; path: string };

export function parseCommand(raw: string): Command | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  switch (o.cmd) {
    case "newSession":
      // cwd 可选(默认服务端 cwd);带了就必须是字符串。
      return typeof o.sessionId === "string" &&
        typeof o.title === "string" &&
        typeof o.model === "string" &&
        (o.cwd === undefined || typeof o.cwd === "string")
        ? (o as Command)
        : null;
    case "sendMessage":
      return typeof o.sessionId === "string" && typeof o.text === "string"
        ? (o as Command)
        : null;
    case "setModel":
      return typeof o.sessionId === "string" && typeof o.model === "string"
        ? (o as Command)
        : null;
    case "interrupt":
      return typeof o.sessionId === "string" ? (o as Command) : null;
    case "deleteSession":
      return typeof o.sessionId === "string" ? (o as Command) : null;
    case "listLocalSessions":
      return { cmd: "listLocalSessions" };
    case "importSession":
      return typeof o.path === "string" ? (o as Command) : null;
    default:
      return null;
  }
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
    const c = parseCommand(raw);
    if (!c) return;
    if (c.cmd === "newSession")
      this.mgr.createSession(c.sessionId, {
        title: c.title,
        model: c.model,
        cwd: c.cwd,
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
    }
  }

  private reply(ws: WebSocket, msg: ControlMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}
