import type { RoomEvent } from "../shared/events";
import { useRoomStore } from "./store";

export function handleIncoming(
  raw: string,
  apply: (e: RoomEvent) => void,
): void {
  try {
    apply(JSON.parse(raw) as RoomEvent);
  } catch {
    /* ignore malformed frames */
  }
}

export interface RoomConnection {
  send: (cmd: object) => void;
  close: () => void;
}

let active: RoomConnection | null = null;

export function sendCommand(cmd: object): void {
  active?.send(cmd);
}

export function connectRoom(url = "ws://localhost:8787"): RoomConnection {
  const apply = useRoomStore.getState().applyEvent;
  // 连接建立前发出的命令(如 newSession)先入队,onopen 后补发;
  // 断线非主动关闭则退避重连(spec §10)。
  const buffer: object[] = [];
  let ws: WebSocket;
  let closedByUser = false;

  const open = () => {
    ws = new WebSocket(url);
    ws.onmessage = (ev) => handleIncoming(String(ev.data), apply);
    ws.onopen = () => {
      for (const cmd of buffer.splice(0)) ws.send(JSON.stringify(cmd));
    };
    ws.onclose = () => {
      if (!closedByUser) setTimeout(open, 1000);
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
  };
  active = conn;
  return conn;
}
