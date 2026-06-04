import type { RoomEvent } from "../shared/events";
import { Driver, type DriverCallbacks, type IDriver } from "./driver";
import { Sequencer } from "./sequencer";

export type DriverFactory = (
  cb: DriverCallbacks,
  model: string,
  cwd: string,
) => IDriver;
export type EventSink = (e: RoomEvent) => void;

const defaultFactory: DriverFactory = (cb, model, cwd) =>
  new Driver(cb, model, cwd);

export class SessionManager {
  private seq = new Sequencer();
  private drivers = new Map<string, IDriver>();
  private sinks = new Set<EventSink>();

  constructor(
    private driverFactory: DriverFactory = defaultFactory,
    private cwd: string = process.cwd(),
  ) {}

  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  private emit(e: RoomEvent): void {
    for (const sink of this.sinks) sink(e);
  }

  createSession(id: string, opts: { title: string; model: string }): void {
    // 会话的存在性必须立刻可见,不能依赖 SDK 的 system:init —— SDK 在 streaming
    // 输入下要等第一条 user 消息才发 init,否则就「没会话 → 发不了消息 → 不发 init
    // → 没会话」死锁,新建会话与对话都失效。先合成一条 session.created,把建会话时
    // 已知的 title/model 填上;SDK init 后续派生的 session.created 由前端幂等合并。
    this.emit(
      this.seq.stamp(
        id,
        "session.created",
        {
          title: opts.title,
          model: opts.model,
          permissionMode: "default",
          apiKeySource: "",
          slashCommands: [],
        },
        Date.now(),
      ),
    );
    const cb: DriverCallbacks = {
      onDraft: (drafts, ts) => {
        for (const d of drafts) {
          // SDK system:init 派生的 session.created 不带用户标题(spec §5),
          // 在这里把建会话时的 title 注入,避免抽屉里显示成 sessionId。
          const payload =
            d.type === "session.created"
              ? { ...(d.payload as Record<string, unknown>), title: opts.title }
              : d.payload;
          this.emit(this.seq.stamp(id, d.type, payload, ts, d.agentId));
        }
      },
    };
    const driver = this.driverFactory(cb, opts.model, this.cwd);
    this.drivers.set(id, driver);
    driver.start();
  }

  sendMessage(id: string, text: string): void {
    this.drivers.get(id)?.send(text);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.drivers.get(id)?.setModel(model);
  }

  async interrupt(id: string): Promise<void> {
    await this.drivers.get(id)?.interrupt();
  }
}
