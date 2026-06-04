import { type WebSocket, WebSocketServer } from "ws";
import type { RoomEvent } from "../shared/events";
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
  | { cmd: "deleteSession"; sessionId: string };

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
    default:
      return null;
  }
}

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(
    port: number,
    private mgr: SessionManager,
  ) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("message", (data) => this.onCommand(String(data)));
      ws.on("close", () => this.clients.delete(ws));
    });
    mgr.subscribe((e) => this.broadcast(e));
  }

  broadcast(e: RoomEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  private onCommand(raw: string): void {
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
  }
}
