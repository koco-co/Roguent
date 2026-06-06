import type { AccountLimits, RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import { useRoomStore } from "./store";
import { useUiStore } from "./ui-store";

export function handleIncoming(
  raw: string,
  apply: (e: RoomEvent) => void,
  onControl?: (c: ControlMessage) => void,
  onLimits?: (l: AccountLimits) => void,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // ignore malformed frames
  }
  const kind =
    parsed && typeof parsed === "object"
      ? (parsed as { kind?: string }).kind
      : undefined;
  if (kind === "limits") {
    onLimits?.((parsed as { limits: AccountLimits }).limits);
    return;
  }
  if (kind === "control") {
    onControl?.(parsed as ControlMessage);
    return;
  }
  apply(parsed as RoomEvent);
}

export interface RoomConnection {
  send: (cmd: object) => void;
  close: () => void;
  reconnect: () => void;
}

let active: RoomConnection | null = null;
const pending: object[] = [];

export function sendCommand(cmd: object): void {
  if (active) active.send(cmd);
  else pending.push(cmd);
}

export function connectRoom(url = "ws://localhost:8787"): RoomConnection {
  const apply = useRoomStore.getState().applyEvent;
  const onControl = (c: ControlMessage) => {
    const ui = useUiStore.getState();
    if (c.type === "localSessions") ui.setLocalSessions(c.items);
    else if (c.type === "importError") ui.setImportError(c.reason);
  };
  const onLimits = (l: AccountLimits) => useRoomStore.getState().setLimits(l);
  // 连接建立前发出的命令(如 newSession)先入队,onopen 后补发;
  // 断线非主动关闭则退避重连(spec §10)。
  const buffer: object[] = [];
  let ws: WebSocket;
  let closedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    useRoomStore.getState().setConnection("connecting");
    ws = new WebSocket(url);
    ws.onmessage = (ev) =>
      handleIncoming(String(ev.data), apply, onControl, onLimits);
    ws.onopen = () => {
      useRoomStore.getState().setConnection("open");
      for (const cmd of buffer.splice(0)) ws.send(JSON.stringify(cmd));
    };
    ws.onclose = () => {
      useRoomStore.getState().setConnection("closed");
      if (closedByUser) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(open, 1000);
    };
  };
  open();

  const conn: RoomConnection = {
    send: (cmd) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(cmd));
      else buffer.push(cmd);
    },
    close: () => {
      closedByUser = true;
      ws.close();
    },
    reconnect: () => {
      if (closedByUser) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // 已在连接中 / 已连上 → 不重复开 socket(避免双 socket 竞态)。
      if (ws && (ws.readyState === ws.CONNECTING || ws.readyState === ws.OPEN))
        return;
      open(); // 当前是 closed 态,旧 socket 已关,直接开新的
    },
  };
  active = conn;
  for (const cmd of pending.splice(0)) conn.send(cmd);
  return conn;
}

/** 立即重连(清掉退避定时器、马上开新 socket);engine 离线错误层的「重试连接」用。 */
export function reconnectRoom(): void {
  active?.reconnect();
}
