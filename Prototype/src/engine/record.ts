import type { RoomEvent } from "../shared/events";

export function serializeEvents(events: RoomEvent[]): string {
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

export function parseEvents(jsonl: string): RoomEvent[] {
  return jsonl
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RoomEvent);
}

// Synchronous, order-preserving replay (used by tests).
export function replay(
  events: RoomEvent[],
  emit: (e: RoomEvent) => void,
): void {
  for (const e of events) emit(e);
}

// Timed replay for the live demo: spaces events by their ts deltas (scaled).
export async function replayTimed(
  events: RoomEvent[],
  emit: (e: RoomEvent) => void,
  speed = 1,
): Promise<void> {
  let prev = events[0]?.ts ?? 0;
  for (const e of events) {
    const gap = Math.max(0, (e.ts - prev) / speed);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    prev = e.ts;
    emit(e);
  }
}

// File helpers (Bun runtime).
export async function loadFixture(path: string): Promise<RoomEvent[]> {
  return parseEvents(await Bun.file(path).text());
}

export async function appendEvent(path: string, e: RoomEvent): Promise<void> {
  const prev = (await Bun.file(path).exists())
    ? await Bun.file(path).text()
    : "";
  await Bun.write(path, `${prev}${JSON.stringify(e)}\n`);
}
