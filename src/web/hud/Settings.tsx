import { useState } from "react";
import type { RoguentSettings } from "../../shared/events";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeConfig,
  SandboxMode,
} from "../../shared/runtime";
import { defaultRuntimeConfig } from "../../shared/runtime";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { ClaudeSettings } from "./ClaudeSettings";
import { CodexSettings } from "./CodexSettings";
import { IntegrationSettings } from "./IntegrationSettings";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import {
  CODEX_SETTINGS_GROUPS,
  COMPACT_MODELS,
  SETTINGS_GROUPS,
  type SettingField,
  type SettingGroup,
  type SettingHook,
  type SettingValue,
} from "./settings-schema";

/**
 * 设置(CONFIG)面板 Settings(对标设计原型 panels2.jsx 的 Settings,§6.10):
 * 游戏内的 Claude Code settings.json / Codex ~/.codex/config.toml 可视化编辑器外观。
 *
 * **真假边界**:字段 schema 仍来自 prototype,但「保存」已通过真实 WS command
 * 持久化 Roguent runtime/integration settings;不直接读写 Claude Code settings.json
 * 或 Codex config.toml。注意:别与 src/web/settings-store.ts(app 自己的 UI 偏好)混淆。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则);selector
 * 只取 activePanel(基元 boolean)/ closePanel(稳定函数引用),守 zustand selector 铁律。
 */

// QTip:问号 + hover 提示框。复用现有 .qmark/.has-tip/.tip 类;提示框需定位在问号
// **下方左对齐**(原型内联覆盖默认的「上方居中」),用内联 style 复刻。
function QTip({ text }: { text: string }) {
  return (
    <span className="qmark has-tip">
      ?
      <span
        className="tip cjk"
        style={{
          width: 230,
          whiteSpace: "normal",
          bottom: "auto",
          top: "calc(100% + 6px)",
          left: 0,
          transform: "none",
        }}
      >
        {text}
      </span>
    </span>
  );
}

// 控件分发:按 it.type 渲染对应控件。list/hooks 的增删为 mock 视觉(✕ 与「+ 添加」
// 不绑真实逻辑),保持简单,绝不假装真功能。
function renderCtrl(
  it: SettingField,
  val: SettingValue,
  set: (k: string, v: SettingValue) => void,
  t: (s: string) => string,
) {
  if (it.type === "toggle") {
    const on = val === true;
    return (
      <button
        type="button"
        className={`pxtoggle${on ? " on" : ""}`}
        onClick={() => set(it.k, !on)}
        aria-pressed={on}
        aria-label={it.label}
      >
        <span className="knob" />
      </button>
    );
  }
  if (it.type === "select") {
    return (
      <select
        className="pxselect"
        aria-label={it.label}
        value={typeof val === "string" ? val : ""}
        onChange={(e) => set(it.k, e.target.value)}
      >
        {(it.opts ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (it.type === "radio") {
    return (
      <div className="seg">
        {(it.opts ?? []).map((o) => (
          <button
            key={o}
            type="button"
            className={`seg-opt${val === o ? " on" : ""}`}
            onClick={() => set(it.k, o)}
            aria-label={`${it.label}: ${o}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (it.type === "list") {
    const list = Array.isArray(val) ? (val as string[]) : [];
    return (
      <div className="pxlist">
        {list.map((v, i) => (
          <div
            // 静态 mock 列表项,无重排,index key 可接受。
            // biome-ignore lint/suspicious/noArrayIndexKey: 静态 mock 列表,无重排
            key={i}
            className="pxlist-item"
          >
            <span>{v}</span>
            {/* mock 视觉:✕ 不绑真实删除逻辑(别假装真功能)。 */}
            <span className="pxlist-x">✕</span>
          </div>
        ))}
        {/* mock 视觉:「+ 添加」不绑真实新增逻辑。 */}
        <div className="pxlist-add">{t("+ 添加")}</div>
      </div>
    );
  }
  if (it.type === "hooks") {
    const hooks = Array.isArray(val) ? (val as SettingHook[]) : [];
    return (
      <div className="pxlist">
        {hooks.map((hk, i) => (
          <div
            // 静态 mock 列表项,无重排,index key 可接受。
            // biome-ignore lint/suspicious/noArrayIndexKey: 静态 mock 列表,无重排
            key={i}
            className="hook-item"
          >
            <span className="chip cyan px" style={{ fontSize: 9 }}>
              {hk.event}
            </span>
            <code className="hook-cmd">{hk.cmd}</code>
          </div>
        ))}
        {/* mock 视觉:「+ 添加 Hook」不绑真实新增逻辑。 */}
        <div className="pxlist-add">{t("+ 添加 Hook")}</div>
      </div>
    );
  }
  // 默认:文本输入。受控写回本地 vals。
  return (
    <input
      className="pxinput"
      aria-label={it.label}
      value={typeof val === "string" ? val : ""}
      onChange={(e) => set(it.k, e.target.value)}
    />
  );
}

function fieldValue(
  vals: Record<string, SettingValue>,
  key: string,
  groups: SettingGroup[],
): SettingValue | undefined {
  if (vals[key] !== undefined) return vals[key];
  for (const group of groups) {
    const found = group.items.find((item) => item.k === key);
    if (found) return found.val;
  }
  return undefined;
}

function stringField(
  vals: Record<string, SettingValue>,
  key: string,
  groups: SettingGroup[],
  fallback: string,
): string {
  const value = fieldValue(vals, key, groups);
  return typeof value === "string" ? value : fallback;
}

function booleanField(
  vals: Record<string, SettingValue>,
  key: string,
  groups: SettingGroup[],
  fallback: boolean,
): boolean {
  const value = fieldValue(vals, key, groups);
  return typeof value === "boolean" ? value : fallback;
}

function stringListField(
  vals: Record<string, SettingValue>,
  key: string,
  groups: SettingGroup[],
): string[] {
  const value = fieldValue(vals, key, groups);
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function nonEmptyStringField(
  vals: Record<string, SettingValue>,
  key: string,
  groups: SettingGroup[],
): string | undefined {
  const value = stringField(vals, key, groups, "").trim();
  return value ? value : undefined;
}

const SETTINGS_VALUE_GROUPS = [...SETTINGS_GROUPS, ...CODEX_SETTINGS_GROUPS];

function hasField(vals: Record<string, SettingValue>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(vals, key);
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function metadataField(
  overrides: Record<string, SettingValue>,
  key: string,
  existing: unknown,
): unknown {
  if (hasField(overrides, key)) {
    return nonEmptyStringField(overrides, key, SETTINGS_VALUE_GROUPS);
  }
  return existing;
}

function settingsFieldValues(
  settings: RoguentSettings | null | undefined,
  rt: "claude" | "codex",
): Record<string, SettingValue> {
  const values: Record<string, SettingValue> = {};
  const runtime = settings?.runtime;
  if (runtime?.runtime === rt) {
    if (rt === "codex") {
      values.cx_model = runtime.model;
      if (runtime.reasoningEffort)
        values.cx_reasoning = runtime.reasoningEffort;
      if (runtime.approvalPolicy) values.cx_approval = runtime.approvalPolicy;
      values.cx_sandbox = runtime.sandboxMode;
      values.cx_network = runtime.networkAccess;
    } else {
      values.model = runtime.model;
    }
  }

  if (settings?.ui) {
    for (const [key, value] of Object.entries(settings.ui)) {
      if (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (Array.isArray(value) &&
          value.every((entry) => typeof entry === "string"))
      ) {
        values[key] = value;
      }
    }
  }

  const codex = metadataRecord(settings?.metadata?.codex);
  if (rt === "codex" && codex) {
    if (typeof codex.provider === "string") values.cx_provider = codex.provider;
    if (
      Array.isArray(codex.mcpServers) &&
      codex.mcpServers.every((entry) => typeof entry === "string")
    ) {
      values.cx_mcp = codex.mcpServers;
    }
    if (typeof codex.mcpProfile === "string") {
      values.cx_mcp_profile = codex.mcpProfile;
    }
  }

  const integrations = settings?.integrations;
  if (integrations?.wechat)
    values.im_wechat_enabled = integrations.wechat.enabled;
  if (integrations?.feishu) {
    values.im_feishu_enabled = integrations.feishu.enabled;
    const meta = integrations.feishu.metadata;
    const appId = stringMetadata(meta?.appId);
    const appSecret = stringMetadata(meta?.appSecret);
    if (appId) values.feishu_app_id = appId;
    if (appSecret) values.feishu_app_secret = appSecret;
  }
  if (integrations?.github) {
    values.github_enabled = integrations.github.enabled;
    const meta = integrations.github.metadata;
    const repo = stringMetadata(meta?.repo);
    const webhookSecret = stringMetadata(meta?.webhookSecret);
    if (repo) values.github_repo = repo;
    if (webhookSecret) values.github_webhook_secret = webhookSecret;
  }
  if (integrations?.x) {
    values.x_enabled = integrations.x.enabled;
    const bearerToken = stringMetadata(integrations.x.metadata?.bearerToken);
    if (bearerToken) values.x_bearer_token = bearerToken;
  }
  if (integrations?.relay) {
    values.relay_enabled = integrations.relay.enabled;
    const meta = integrations.relay.metadata;
    const endpoint = stringMetadata(meta?.endpoint);
    const token = stringMetadata(meta?.token);
    if (endpoint) values.relay_endpoint = endpoint;
    if (token) values.relay_token = token;
  }
  return values;
}

function runtimeSettings(
  rt: "claude" | "codex",
  vals: Record<string, SettingValue>,
): RuntimeConfig {
  if (rt === "codex") {
    const defaults = defaultRuntimeConfig("codex");
    return {
      ...defaults,
      model: stringField(
        vals,
        "cx_model",
        CODEX_SETTINGS_GROUPS,
        defaults.model,
      ),
      reasoningEffort: stringField(
        vals,
        "cx_reasoning",
        CODEX_SETTINGS_GROUPS,
        defaults.reasoningEffort ?? "medium",
      ) as ReasoningEffort,
      approvalPolicy: stringField(
        vals,
        "cx_approval",
        CODEX_SETTINGS_GROUPS,
        defaults.approvalPolicy ?? "on-request",
      ) as CodexApprovalPolicy,
      sandboxMode: stringField(
        vals,
        "cx_sandbox",
        CODEX_SETTINGS_GROUPS,
        defaults.sandboxMode,
      ) as SandboxMode,
      networkAccess: booleanField(
        vals,
        "cx_network",
        CODEX_SETTINGS_GROUPS,
        defaults.networkAccess,
      ),
    };
  }

  const defaults = defaultRuntimeConfig("claude");
  return {
    ...defaults,
    model: stringField(vals, "model", SETTINGS_GROUPS, defaults.model),
    permissionMode: "default" as PermissionMode,
    sandboxMode: defaults.sandboxMode,
    networkAccess: defaults.networkAccess,
  };
}

function integrationSettings(
  vals: Record<string, SettingValue>,
  overrides: Record<string, SettingValue>,
  savedSettings: RoguentSettings | null | undefined,
): NonNullable<RoguentSettings["integrations"]> {
  const saved = savedSettings?.integrations;
  return {
    wechat: {
      enabled: booleanField(
        vals,
        "im_wechat_enabled",
        SETTINGS_VALUE_GROUPS,
        true,
      ),
      metadata: { pairingMode: "single-active-session" },
    },
    feishu: {
      enabled: booleanField(
        vals,
        "im_feishu_enabled",
        SETTINGS_VALUE_GROUPS,
        false,
      ),
      metadata: {
        appId: metadataField(
          overrides,
          "feishu_app_id",
          saved?.feishu?.metadata?.appId,
        ),
        appSecret: metadataField(
          overrides,
          "feishu_app_secret",
          saved?.feishu?.metadata?.appSecret,
        ),
      },
    },
    github: {
      enabled: booleanField(
        vals,
        "github_enabled",
        SETTINGS_VALUE_GROUPS,
        false,
      ),
      metadata: {
        repo: metadataField(
          overrides,
          "github_repo",
          saved?.github?.metadata?.repo,
        ),
        webhookSecret: metadataField(
          overrides,
          "github_webhook_secret",
          saved?.github?.metadata?.webhookSecret,
        ),
      },
    },
    x: {
      enabled: booleanField(vals, "x_enabled", SETTINGS_VALUE_GROUPS, false),
      metadata: {
        bearerToken: metadataField(
          overrides,
          "x_bearer_token",
          saved?.x?.metadata?.bearerToken,
        ),
      },
    },
    relay: {
      enabled: booleanField(
        vals,
        "relay_enabled",
        SETTINGS_VALUE_GROUPS,
        false,
      ),
      metadata: {
        endpoint: metadataField(
          overrides,
          "relay_endpoint",
          saved?.relay?.metadata?.endpoint,
        ),
        token: metadataField(
          overrides,
          "relay_token",
          saved?.relay?.metadata?.token,
        ),
      },
    },
  };
}

function buildSettings(
  rt: "claude" | "codex",
  vals: Record<string, SettingValue>,
  overrides: Record<string, SettingValue>,
  savedSettings: RoguentSettings | null | undefined,
): RoguentSettings {
  if (rt === "codex") {
    return {
      runtime: runtimeSettings(rt, vals),
      integrations: integrationSettings(vals, overrides, savedSettings),
      metadata: {
        codex: {
          provider: stringField(
            vals,
            "cx_provider",
            CODEX_SETTINGS_GROUPS,
            "openai",
          ),
          mcpServers: stringListField(vals, "cx_mcp", CODEX_SETTINGS_GROUPS),
          mcpProfile: stringField(
            vals,
            "cx_mcp_profile",
            CODEX_SETTINGS_GROUPS,
            "default",
          ),
        },
      },
    };
  }
  return {
    runtime: runtimeSettings(rt, vals),
    integrations: integrationSettings(vals, overrides, savedSettings),
    ui: Object.fromEntries(Object.entries(vals)),
  };
}

// 单个字段行:label(+ QTip)+ 控件。
function Field({
  it,
  val,
  set,
}: {
  it: SettingField;
  val: SettingValue;
  set: (k: string, v: SettingValue) => void;
}) {
  const t = useT();
  return (
    <div className="field">
      <div className="field-label">
        <span>{it.label}</span>
        <QTip text={it.tip} />
      </div>
      <div className="field-ctrl">{renderCtrl(it, val, set, t)}</div>
    </div>
  );
}

// 压缩阈值的某模型一行(ThresholdRow):mode='auto' 走 SDK 原生 / 'pct' 用滑块。
// 本地 state 存每个 model 的 {mode,pct}(整组 mock,不写盘)。
function ThresholdRow({
  model,
  label,
  initMode,
  initPct,
  note,
}: {
  model: string;
  label: string;
  initMode: "auto" | "pct";
  initPct: number;
  note: string;
}) {
  const t = useT();
  const [mode, setMode] = useState<"auto" | "pct">(initMode);
  const [pct, setPct] = useState(initPct);
  return (
    <div className="thresh-row">
      <div className="thresh-l">
        <span className="px" style={{ fontSize: 10 }}>
          {label}
        </span>
        <code className="thresh-id">{model}</code>
      </div>
      <div className="thresh-c">
        <div className="seg sm">
          <button
            type="button"
            className={`seg-opt${mode === "auto" ? " on" : ""}`}
            onClick={() => setMode("auto")}
          >
            Auto
          </button>
          <button
            type="button"
            className={`seg-opt${mode === "pct" ? " on" : ""}`}
            onClick={() => setMode("pct")}
          >
            {t("阈值 %")}
          </button>
        </div>
        {mode === "pct" && (
          <div className="slider-row">
            <div className="range-wrap">
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="pxrange"
              />
              {/* 20% 刻度标记:range min5/max90 → (20-5)/90 ≈ 16.7% 处。 */}
              <div
                className="range-tick"
                style={{ left: `${((20 - 5) / 90) * 100}%` }}
              >
                20
              </div>
            </div>
            <span className="px pct-num">{pct}%</span>
          </div>
        )}
      </div>
      <div className="thresh-note faint">{t(note)}</div>
    </div>
  );
}

// 自动编排循环卡的 4 步(util ≥ 阈值时)。icon 名已核对存在于 icons.tsx。
const FLOW_STEPS: Array<{
  n: string;
  t: string;
  ic: "error" | "compact" | "chat" | "task";
}> = [
  { n: "1", t: "终止本轮", ic: "error" },
  { n: "2", t: "/compact", ic: "compact" },
  { n: "3", t: '发送"继续"', ic: "chat" },
  { n: "4", t: "循环", ic: "task" },
];

// 上下文压缩组(§6.8):说明条 + 每模型一个 ThresholdRow + 自动编排循环卡。
function CompactGroup() {
  const t = useT();
  return (
    <div className="compact-group">
      <div className="comp-intro">
        <Icon name="compact" size={20} />
        <span>
          {t(
            "为每个模型设“达到 X% 自动压缩续跑”的阈值。Auto = 不主动干预，走 SDK 原生压缩。",
          )}
        </span>
      </div>
      {COMPACT_MODELS.map((m) => (
        <ThresholdRow
          key={m.model}
          model={m.model}
          label={m.label}
          initMode={m.mode}
          initPct={m.pct}
          note={m.note}
        />
      ))}
      <div className="flow-card">
        <div
          className="px"
          style={{ fontSize: 10, color: "var(--gold)", marginBottom: 12 }}
        >
          {t("自动编排循环 (util ≥ 阈值)")}
        </div>
        <div className="flow-steps">
          {FLOW_STEPS.map((s, i) => (
            <div
              key={s.n}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <div className="flow-step">
                <div className="flow-num px">{s.n}</div>
                <Icon name={s.ic} size={22} />
                <span>{t(s.t)}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && <div className="flow-arrow">→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const t = useT();
  const active = useUiStore((s) => s.activePanel === "settings");
  const closePanel = useUiStore((s) => s.closePanel);
  const relayStatus = useRoomStore((s) => s.connectorStatus?.relay ?? null);
  const savedSettings = useRoomStore((s) => s.settings);
  // 当前 runtime(claude/codex)、当前分组 id、改动覆盖 map、未保存标志,全为本地 mock 态。
  const [rt, setRt] = useState<"claude" | "codex">("claude");
  const [grp, setGrp] = useState("general");
  const [vals, setVals] = useState<Record<string, SettingValue>>({});
  const [dirty, setDirty] = useState(false);
  // 自定义配置项的自增计数器(替代被禁用的 Date.now()/Math.random() 生成 key)。
  const [customN, setCustomN] = useState(0);

  if (!active) return null;

  const groups: SettingGroup[] =
    rt === "claude" ? SETTINGS_GROUPS : CODEX_SETTINGS_GROUPS;
  // schema 是非空常量,但 TS 视数组索引为 T | undefined;兜底取首组,守护后 g 必非空。
  const g = groups.find((x) => x.id === grp) ?? groups[0];
  if (!g) return null;

  // 写一个字段 → 记入 vals 覆盖 + 标记未保存。
  const set = (k: string, v: SettingValue) => {
    setVals((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  // 切 runtime:同时把 grp 重置为该 runtime 第一个分组 id。
  const switchRt = (r: "claude" | "codex") => {
    const gs = r === "claude" ? SETTINGS_GROUPS : CODEX_SETTINGS_GROUPS;
    setRt(r);
    if (gs[0]) setGrp(gs[0].id);
  };
  // 「+ 添加自定义配置」:mock 加一项空字符串,key 用自增计数器(禁用时间戳)。
  const addCustom = () => {
    set(`custom_${customN}`, "");
    setCustomN((n) => n + 1);
  };
  const savedVals = settingsFieldValues(savedSettings, rt);
  const effectiveVals = { ...savedVals, ...vals };
  const runtimePreview = runtimeSettings(rt, effectiveVals);
  const codexProvider = stringField(
    effectiveVals,
    "cx_provider",
    CODEX_SETTINGS_GROUPS,
    "openai",
  );
  const codexMcpServers = stringListField(
    effectiveVals,
    "cx_mcp",
    CODEX_SETTINGS_GROUPS,
  );
  const codexMcpProfile = stringField(
    effectiveVals,
    "cx_mcp_profile",
    CODEX_SETTINGS_GROUPS,
    "default",
  );

  return (
    <Modal
      title="CONFIG"
      sub={rt === "claude" ? "/config · settings.json" : "~/.codex/config.toml"}
      icon="gear"
      accent={rt === "codex" ? "#5fd35f" : "#f2c84b"}
      width={1180}
      onClose={closePanel}
    >
      {/* .set-foot 在原型里是 Modal 第三子节点(panel-body 之外);我们的 Modal 只渲染
          单个 children 进 .panel-body,故把它作 .settings-wrap 的兄弟节点放进 children。 */}
      <>
        {/* 真实保存 Roguent 设置;不直接改 Claude/Codex 原生配置文件。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          {t(
            "保存会写入 Roguent 设置库；不会直接改 Claude settings.json / Codex config.toml",
          )}
        </div>

        <div className="settings-wrap">
          {/* 左侧导航:runtime 切换段 + 各分组项。 */}
          <div className="set-nav scroll">
            <div className="set-runtime">
              <button
                type="button"
                className={`set-rt px${rt === "claude" ? " on" : ""}`}
                onClick={() => switchRt("claude")}
              >
                <Icon name="claude" size={16} />
                Claude
              </button>
              <button
                type="button"
                className={`set-rt px${rt === "codex" ? " on codex" : ""}`}
                onClick={() => switchRt("codex")}
              >
                <Icon name="codex" size={16} />
                Codex
              </button>
            </div>
            {groups.map((gr) => (
              <button
                key={gr.id}
                type="button"
                className={`set-navitem${grp === gr.id ? " on" : ""}`}
                onClick={() => setGrp(gr.id)}
              >
                <Icon name={gr.icon} size={18} />
                <span>{gr.name}</span>
              </button>
            ))}
          </div>

          {/* 右侧表单:compact 组特殊渲染 CompactGroup;否则 Field 列表 + 末尾添加项。 */}
          <div className="set-form scroll">
            <IntegrationSettings relayStatus={relayStatus} />
            {rt === "codex" ? (
              <CodexSettings
                runtime={runtimePreview}
                provider={codexProvider}
                mcpServers={codexMcpServers}
                mcpProfile={codexMcpProfile}
              />
            ) : (
              <ClaudeSettings runtime={runtimePreview} />
            )}
            {grp === "compact" ? (
              <CompactGroup />
            ) : (
              <>
                {g.items.map((it) => (
                  <Field
                    key={it.k}
                    it={it}
                    // 本地覆盖优先,无覆盖回落 schema 默认值(?? 只对 null/undefined
                    // 回落,toggle 的 false 覆盖能正确保留)。
                    val={effectiveVals[it.k] ?? it.val}
                    set={set}
                  />
                ))}
                <button type="button" className="set-add" onClick={addCustom}>
                  <Icon name="task" size={16} />
                  {t("+ 添加自定义配置")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 底部:未保存状态 + 还原 / 保存。 */}
        <div className="set-foot">
          {dirty ? (
            <span className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
              ● {t("未保存")}
            </span>
          ) : (
            <span className="faint" style={{ fontSize: 11 }}>
              {t("已保存")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="pxbtn sm cjk"
            onClick={() => {
              setVals({});
              setDirty(false);
            }}
          >
            {t("还原")}
          </button>
          <button
            type="button"
            className="pxbtn primary sm cjk"
            onClick={() => {
              const settings = buildSettings(
                rt,
                effectiveVals,
                vals,
                savedSettings,
              );
              sendCommand({
                cmd: "settings",
                action: "update",
                scope: "user",
                settings,
                changedKeys: Object.keys(vals),
                metadata: { source: "settings-panel", runtime: rt },
              });
              setDirty(false);
            }}
          >
            {t("保存")}
          </button>
        </div>
      </>
    </Modal>
  );
}
