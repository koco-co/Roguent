import type { RoomEvent, SessionCreatedPayload } from "../shared/events";
import { Driver, type DriverCallbacks, type IDriver } from "./driver";
import { readTranscriptLines } from "./local-sessions";
import { projectFor } from "./project";
import { Sequencer } from "./sequencer";
import { normalizeTranscript } from "./transcript";

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

  createSession(
    id: string,
    opts: { title: string; model: string; cwd?: string },
  ): void {
    // 每会话带自己的 cwd(默认服务端 cwd);project = 该 cwd 的 git 根 basename,
    // 是总览世界里「项目 = 房间」的分组键(spec §总览世界/生命周期)。
    const cwd = opts.cwd?.trim() || this.cwd;
    const project = projectFor(cwd);
    // 会话的存在性必须立刻可见,不能依赖 SDK 的 system:init —— SDK 在 streaming
    // 输入下要等第一条 user 消息才发 init,否则就「没会话 → 发不了消息 → 不发 init
    // → 没会话」死锁,新建会话与对话都失效。先合成一条 session.created,把建会话时
    // 已知的 title/model/cwd/project 填上;SDK init 后续派生的由前端幂等合并。
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
          cwd,
          project,
        },
        Date.now(),
      ),
    );
    const cb: DriverCallbacks = {
      onDraft: (drafts, ts) => {
        for (const d of drafts) {
          // SDK system:init 派生的 session.created 不带用户标题 / cwd / project
          //(spec §5),在这里把建会话时的值注入,避免抽屉里显示成 sessionId、
          // 也保证 reducer 拿得到 project 用于房间归属。
          const payload =
            d.type === "session.created"
              ? {
                  ...(d.payload as Record<string, unknown>),
                  title: opts.title,
                  cwd,
                  project,
                }
              : d.payload;
          this.emit(this.seq.stamp(id, d.type, payload, ts, d.agentId));
        }
        // 一轮结束(result → usage.updated)即取真实上下文占用,发 context.updated。
        if (drafts.some((d) => d.type === "usage.updated")) {
          void this.emitContextUsage(id);
        }
      },
    };
    const driver = this.driverFactory(cb, opts.model, cwd);
    this.drivers.set(id, driver);
    driver.start();
  }

  sendMessage(id: string, text: string): void {
    this.drivers.get(id)?.send(text);
  }

  // 第三个事件来源:导入本地 CC transcript,零额度同步。不建 Driver,把整段
  // 会话历史(含用户轮次)瞬时折成事件灌进聊天抽屉——「云存档同步」式回看,
  // 不做计时回放。seq 与 LIVE 会话同享 Sequencer。
  importSession(id: string, path: string): void {
    const lines = readTranscriptLines(path);
    // 文件不存在 / 读不出 / 空 → 抛错,让 WsGateway 的 try/catch 回 importError(spec §4)。
    if (lines.length === 0) throw new Error("transcript empty or unreadable");
    const drafts = normalizeTranscript(lines);
    if (drafts.length === 0) return;
    // normalizeTranscript always prepends session.created → drafts[0] exists
    const created = drafts[0]!.payload as SessionCreatedPayload;
    const cwd = created.cwd?.trim() || this.cwd;
    const project = projectFor(cwd);
    for (const d of drafts) {
      const payload =
        d.type === "session.created"
          ? { ...(d.payload as Record<string, unknown>), cwd, project }
          : d.payload;
      this.emit(this.seq.stamp(id, d.type, payload, d.ts, d.agentId));
    }
  }

  // 硬删除:停掉 driver 并丢弃。归档是纯客户端可见性、driver 后台不杀(spec);
  // 删除则真正结束这个会话的 SDK query。
  deleteSession(id: string): void {
    this.drivers.get(id)?.end();
    this.drivers.delete(id);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.drivers.get(id)?.setModel(model);
  }

  async interrupt(id: string): Promise<void> {
    await this.drivers.get(id)?.interrupt();
  }

  private async emitContextUsage(id: string): Promise<void> {
    const cu = await this.drivers.get(id)?.getContextUsage();
    if (!cu) return;
    const utilization =
      cu.maxTokens > 0 ? Math.round((cu.totalTokens / cu.maxTokens) * 100) : 0;
    this.emit(
      this.seq.stamp(
        id,
        "context.updated",
        { usedTokens: cu.totalTokens, windowSize: cu.maxTokens, utilization },
        Date.now(),
      ),
    );
  }
}
