import { basename } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type { AccountLimits, LimitsMessage, RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import {
  isCodexApprovalPolicy,
  isPermissionMode,
  isReasoningEffort,
  isRuntimeKind,
  isSandboxMode,
  normalizeRuntimeKind,
} from "../shared/runtime";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeKind,
  SandboxMode,
} from "../shared/runtime";
import { listLocalSessions } from "./local-sessions";
import type { SessionManager } from "./session";

export type Command =
  | {
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
  | { cmd: "sendMessage"; sessionId: string; text: string }
  | { cmd: "setModel"; sessionId: string; model: string }
  | { cmd: "interrupt"; sessionId: string }
  | { cmd: "deleteSession"; sessionId: string }
  | { cmd: "listLocalSessions" }
  | { cmd: "importSession"; path: string }
  | {
      cmd: "respondPermission";
      sessionId: string;
      promptId: string;
      behavior: "allow" | "deny";
      message?: string;
    }
  | {
      cmd: "respondQuestion";
      sessionId: string;
      promptId: string;
      selectedLabels: string[];
    }
  | { cmd: "setPermissionMode"; sessionId: string; mode: string };

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
      if (
        typeof o.sessionId !== "string" ||
        typeof o.title !== "string" ||
        typeof o.model !== "string" ||
        (o.cwd !== undefined && typeof o.cwd !== "string") ||
        (o.runtime !== undefined && !isRuntimeKind(o.runtime)) ||
        (o.permissionMode !== undefined &&
          !isPermissionMode(o.permissionMode)) ||
        (o.approvalPolicy !== undefined &&
          !isCodexApprovalPolicy(o.approvalPolicy)) ||
        (o.sandboxMode !== undefined && !isSandboxMode(o.sandboxMode)) ||
        (o.reasoningEffort !== undefined &&
          !isReasoningEffort(o.reasoningEffort)) ||
        (o.networkAccess !== undefined && typeof o.networkAccess !== "boolean")
      ) {
        return null;
      }
      return {
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
      };
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
    case "respondPermission":
      return typeof o.sessionId === "string" &&
        typeof o.promptId === "string" &&
        (o.behavior === "allow" || o.behavior === "deny")
        ? (o as Command)
        : null;
    case "respondQuestion":
      return typeof o.sessionId === "string" &&
        typeof o.promptId === "string" &&
        Array.isArray(o.selectedLabels)
        ? (o as Command)
        : null;
    case "setPermissionMode":
      return typeof o.sessionId === "string" && typeof o.mode === "string"
        ? (o as Command)
        : null;
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
    }
  }

  private reply(ws: WebSocket, msg: ControlMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}
