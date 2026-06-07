import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type {
  AccountLimits,
  RoomEvent,
  SessionCreatedPayload,
} from "../shared/events";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeKind,
  SandboxMode,
} from "../shared/runtime";
import { isPermissionMode, normalizePermissionMode } from "../shared/runtime";
import type { DriverCallbacks, IDriver } from "./driver";
import { LimitsAggregator } from "./limits-aggregator";
import { readTranscriptLines } from "./local-sessions";
import { projectFor } from "./project";
import {
  type RuntimeDriverConfig,
  type RuntimeDriverCreator,
  RuntimeManager,
  resolveRuntimeDriverConfig,
} from "./runtime/manager";
import { Sequencer } from "./sequencer";
import { normalizeTranscript } from "./transcript";

export interface CreateSessionOptions {
  title: string;
  model?: string;
  cwd?: string;
  runtime?: RuntimeKind;
  permissionMode?: PermissionMode;
  approvalPolicy?: CodexApprovalPolicy;
  sandboxMode?: SandboxMode;
  reasoningEffort?: ReasoningEffort;
  networkAccess?: boolean;
}

interface SessionRuntimeState {
  title: string;
  cwd: string;
  project: string;
  config: RuntimeDriverConfig;
}

export type EventSink = (e: RoomEvent) => void;
export type LimitsSink = (limits: AccountLimits) => void;

export class SessionManager {
  private seq = new Sequencer();
  private drivers = new Map<string, IDriver>();
  private runtimeStates = new Map<string, SessionRuntimeState>();
  // 当前引擎认识的所有会话 id(live driver + 已导入的 transcript)。新连接对账用:
  // gateway 把它下发给客户端清幽灵会话。进程重启即清零(会话确实没了)。
  private knownSessions = new Set<string>();
  private sinks = new Set<EventSink>();
  private limitsSinks = new Set<LimitsSink>();
  // 账户级订阅用量聚合器:合并 keychain 轮询 /api/oauth/usage(权威窗口用量 +
  // planName)与 SDK rate_limit_event(仅兜底),变更即推给订阅方(server 接 gateway.pushLimits)。
  private limits = new LimitsAggregator((l) => this.emitLimits(l));

  constructor(
    private runtimeManager: RuntimeDriverCreator = new RuntimeManager(),
    private cwd: string = process.cwd(),
  ) {}

  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  private emit(e: RoomEvent): void {
    for (const sink of this.sinks) sink(e);
  }

  // 账户级账号限额订阅(独立于 (sessionId,seq) 事件流)。
  subscribeLimits(sink: LimitsSink): () => void {
    this.limitsSinks.add(sink);
    return () => this.limitsSinks.delete(sink);
  }

  private emitLimits(l: AccountLimits): void {
    for (const sink of this.limitsSinks) sink(l);
  }

  // keychain 轮询的整份快照(server 把 UsagePoller.onLimits 接到这里)。
  applyPollLimits(l: AccountLimits): void {
    this.limits.applyPoll(l);
  }

  createSession(id: string, opts: CreateSessionOptions): void {
    // 每会话带自己的 cwd(默认服务端 cwd);project = 该 cwd 的 git 根 basename,
    // 是总览世界里「项目 = 房间」的分组键(spec §总览世界/生命周期)。
    const cwd = opts.cwd?.trim() || this.cwd;
    const project = projectFor(cwd);
    const state: SessionRuntimeState = {
      title: opts.title,
      cwd,
      project,
      config: resolveRuntimeDriverConfig({
        runtime: opts.runtime,
        model: opts.model,
        cwd,
        permissionMode: opts.permissionMode,
        approvalPolicy: opts.approvalPolicy,
        sandboxMode: opts.sandboxMode,
        reasoningEffort: opts.reasoningEffort,
        networkAccess: opts.networkAccess,
      }),
    };
    this.runtimeStates.set(id, state);
    // 会话的存在性必须立刻可见,不能依赖 SDK 的 system:init —— SDK 在 streaming
    // 输入下要等第一条 user 消息才发 init,否则就「没会话 → 发不了消息 → 不发 init
    // → 没会话」死锁,新建会话与对话都失效。先合成一条 session.created,把建会话时
    // 已知的 title/model/cwd/project 填上;SDK init 后续派生的由前端幂等合并。
    this.emit(
      this.seq.stamp(
        id,
        "session.created",
        this.sessionCreatedPayload(state),
        Date.now(),
      ),
    );
    const cb: DriverCallbacks = {
      // SDK 每轮回包的订阅用量 → 聚合器(账户级,不进该会话的 seq 事件流)。
      onRateLimit: (info) => this.limits.applyRateLimit(info),
      onDraft: (drafts, ts) => {
        for (const d of drafts) {
          // SDK system:init 派生的 session.created 不带用户标题 / cwd / project
          //(spec §5),在这里把建会话时的值注入,避免抽屉里显示成 sessionId、
          // 也保证 reducer 拿得到 project 用于房间归属。
          const payload = (() => {
            if (d.type !== "session.created") return d.payload;
            const incoming = d.payload as Record<string, unknown>;
            this.applySessionCreatedIncoming(state, incoming);
            return this.sessionCreatedPayload(state, incoming);
          })();
          this.emit(this.seq.stamp(id, d.type, payload, ts, d.agentId));
        }
        // 一轮结束(result → usage.updated)即取真实上下文占用,发 context.updated。
        if (drafts.some((d) => d.type === "usage.updated")) {
          void this.emitContextUsage(id);
        }
      },
    };
    const driver = this.runtimeManager.createDriver(cb, state.config);
    this.drivers.set(id, driver);
    this.knownSessions.add(id);
    driver.start();
  }

  private applySessionCreatedIncoming(
    state: SessionRuntimeState,
    incoming: Record<string, unknown>,
  ): void {
    const model =
      typeof incoming.model === "string" ? incoming.model.trim() : "";
    if (model) state.config = { ...state.config, model };
    if (
      isPermissionMode(incoming.permissionMode) &&
      incoming.permissionMode !== "default"
    ) {
      state.config = {
        ...state.config,
        permissionMode: incoming.permissionMode,
      };
    }
  }

  private sessionCreatedPayload(
    state: SessionRuntimeState,
    incoming: Record<string, unknown> = {},
  ): SessionCreatedPayload {
    const slashCommands = Array.isArray(incoming.slashCommands)
      ? incoming.slashCommands.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const payload: SessionCreatedPayload = {
      title: state.title,
      model: state.config.model,
      runtime: state.config.runtime,
      permissionMode: state.config.permissionMode,
      apiKeySource:
        typeof incoming.apiKeySource === "string" ? incoming.apiKeySource : "",
      slashCommands,
      cwd: state.cwd,
      project: state.project,
      sandboxMode: state.config.sandboxMode,
      networkAccess: state.config.networkAccess,
    };
    if (state.config.approvalPolicy !== undefined) {
      payload.approvalPolicy = state.config.approvalPolicy;
    }
    if (state.config.reasoningEffort !== undefined) {
      payload.reasoningEffort = state.config.reasoningEffort;
    }
    return payload;
  }

  // 引擎当前认识的会话 id(新连接花名册;gateway 下发给客户端对账清幽灵)。
  sessionIds(): string[] {
    return [...this.knownSessions];
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
    this.knownSessions.add(id); // 导入的会话也进花名册,重连不被当幽灵清掉
    // normalizeTranscript always prepends session.created → drafts[0] exists
    const created = drafts[0]!.payload as SessionCreatedPayload;
    const cwd = created.cwd?.trim() || this.cwd;
    const project = projectFor(cwd);
    for (const d of drafts) {
      const payload =
        d.type === "session.created"
          ? // imported:true → 客户端把这条会话豁免出 roster 对账(静态存档,无 Driver)。
            {
              ...(d.payload as Record<string, unknown>),
              cwd,
              project,
              imported: true,
            }
          : d.payload;
      this.emit(this.seq.stamp(id, d.type, payload, d.ts, d.agentId));
    }
  }

  // 硬删除:停掉 driver 并丢弃。归档是纯客户端可见性、driver 后台不杀(spec);
  // 删除则真正结束这个会话的 SDK query。
  deleteSession(id: string): void {
    this.drivers.get(id)?.end();
    this.drivers.delete(id);
    this.runtimeStates.delete(id);
    this.knownSessions.delete(id);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.drivers.get(id)?.setModel(model);
    // 广播模型变更:前端 store 对 session.created 做幂等合并(不清 transcript),
    // 只要 payload 携带非空 model 字符串就会更新 session.model。
    if (this.knownSessions.has(id)) {
      const state = this.runtimeStates.get(id);
      if (!state) return;
      state.config = { ...state.config, model };
      this.runtimeStates.set(id, state);
      this.emit(
        this.seq.stamp(
          id,
          "session.created",
          this.sessionCreatedPayload(state),
          Date.now(),
        ),
      );
    }
  }

  async interrupt(id: string): Promise<void> {
    await this.drivers.get(id)?.interrupt();
  }

  respondPermission(
    id: string,
    promptId: string,
    result: PermissionResult,
  ): void {
    this.drivers.get(id)?.respondPermission(promptId, result);
  }

  respondQuestion(
    id: string,
    promptId: string,
    selectedLabels: string[],
  ): void {
    // Send the selection back to the agent as a user message
    const text = selectedLabels.join("、");
    this.drivers.get(id)?.send(text);
    // Let the UI know the prompt is resolved
    this.emit(
      this.seq.stamp(
        id,
        "prompt.resolved",
        { promptId, result: "answered" },
        Date.now(),
      ),
    );
  }

  async setPermissionMode(id: string, mode: string): Promise<void> {
    await this.drivers.get(id)?.setPermissionMode(mode);
    const state = this.runtimeStates.get(id);
    if (!state || !this.knownSessions.has(id)) return;
    const permissionMode = normalizePermissionMode(
      mode,
      state.config.permissionMode,
    );
    if (permissionMode === state.config.permissionMode) return;
    state.config = { ...state.config, permissionMode };
    this.runtimeStates.set(id, state);
    this.emit(
      this.seq.stamp(
        id,
        "session.created",
        this.sessionCreatedPayload(state),
        Date.now(),
      ),
    );
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
