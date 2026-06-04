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

export function connectRoom(url = "ws://localhost:8787"): RoomConnection {
  const ws = new WebSocket(url);
  const apply = useRoomStore.getState().applyEvent;
  ws.onmessage = (ev) => handleIncoming(String(ev.data), apply);
  return {
    send: (cmd) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(cmd));
    },
    close: () => ws.close(),
  };
}
