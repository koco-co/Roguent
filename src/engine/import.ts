import type { TimedDraft } from "./transcript";

export interface ReplayDeps {
  emit: (d: TimedDraft) => void;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_GAP_MS = 2000;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 按封顶间隔 + speed 计时逐条发出 drafts。speed 可运行时改。 */
export class Replayer {
  private speed: number;
  constructor(
    private drafts: TimedDraft[],
    speed: number,
    private deps: ReplayDeps,
  ) {
    this.speed = speed > 0 ? speed : 1;
  }

  setSpeed(speed: number): void {
    if (speed > 0) this.speed = speed;
  }

  async run(): Promise<void> {
    const sleep = this.deps.sleep ?? realSleep;
    let prev = this.drafts[0]?.ts ?? 0;
    for (const d of this.drafts) {
      const gap = Math.min(Math.max(0, d.ts - prev), MAX_GAP_MS) / this.speed;
      if (gap > 0) await sleep(gap);
      prev = d.ts;
      this.deps.emit(d);
    }
  }
}
