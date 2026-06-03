import type { RoomEvent, RoomEventType } from "../shared/events";

export class Sequencer {
  private counters = new Map<string, number>();

  stamp(
    sessionId: string,
    type: RoomEventType,
    payload: unknown,
    ts: number,
    agentId?: string,
  ): RoomEvent {
    const seq = (this.counters.get(sessionId) ?? 0) + 1;
    this.counters.set(sessionId, seq);
    return { seq, ts, sessionId, type, agentId, payload };
  }
}
