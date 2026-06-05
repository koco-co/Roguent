import { useState } from "react";
import { useUiStore } from "../ui-store";
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
 * **整面板为 mock 占位**:Roguent 是「活动可视化平台」,**不读写** Claude Code 的
 * settings.json,也未接入 Codex runtime。所以本面板所有字段 / 值 / 保存 / 还原都是
 * 本地 state,**不接任何真实 store、不持久化**——「保存」只清未保存标志,不写盘。
 * 顶部一条显眼 .task-mock-banner 显式标注(复用 Tasks 的 mock banner 类),绝不冒充
 * 真实配置。注意:别与 src/web/settings-store.ts(app 自己的 UI 偏好)混淆。
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
) {
  if (it.type === "toggle") {
    const on = val === true;
    return (
      <button
        type="button"
        className={`pxtoggle${on ? " on" : ""}`}
        onClick={() => set(it.k, !on)}
        aria-pressed={on}
      >
        <span className="knob" />
      </button>
    );
  }
  if (it.type === "select") {
    return (
      <select
        className="pxselect"
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
        <div className="pxlist-add">+ 添加</div>
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
        <div className="pxlist-add">+ 添加 Hook</div>
      </div>
    );
  }
  // 默认:文本输入。受控写回本地 vals。
  return (
    <input
      className="pxinput"
      value={typeof val === "string" ? val : ""}
      onChange={(e) => set(it.k, e.target.value)}
    />
  );
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
  return (
    <div className="field">
      <div className="field-label">
        <span>{it.label}</span>
        <QTip text={it.tip} />
      </div>
      <div className="field-ctrl">{renderCtrl(it, val, set)}</div>
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
            阈值 %
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
      <div className="thresh-note faint">{note}</div>
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
  return (
    <div className="compact-group">
      <div className="comp-intro">
        <Icon name="compact" size={20} />
        <span>
          为每个模型设“达到 X% 自动压缩续跑”的阈值。Auto = 不主动干预，走 SDK
          原生压缩。
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
          自动编排循环 (util ≥ 阈值)
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
                <span>{s.t}</span>
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
  const active = useUiStore((s) => s.activePanel === "settings");
  const closePanel = useUiStore((s) => s.closePanel);
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
        {/* mock 标注:整面板示例数据,显眼 banner——引擎不读写真实配置。 */}
        <div className="task-mock-banner">
          <Icon name="error" size={14} glow="#f2c84b" />
          示例数据 · 引擎不读写 Claude Code settings.json / Codex config.toml
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
                    val={vals[it.k] ?? it.val}
                    set={set}
                  />
                ))}
                <button type="button" className="set-add" onClick={addCustom}>
                  <Icon name="task" size={16} />+ 添加自定义配置
                </button>
              </>
            )}
          </div>
        </div>

        {/* 底部:未保存状态 + 还原 / 保存(全 mock,不写盘)。 */}
        <div className="set-foot">
          {dirty ? (
            <span className="px" style={{ fontSize: 10, color: "var(--gold)" }}>
              ● 未保存
            </span>
          ) : (
            <span className="faint" style={{ fontSize: 11 }}>
              已保存
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
            还原
          </button>
          {/* 「保存」仅清未保存标志,不持久化任何数据。 */}
          <button
            type="button"
            className="pxbtn primary sm cjk"
            onClick={() => setDirty(false)}
          >
            保存
          </button>
        </div>
      </>
    </Modal>
  );
}
