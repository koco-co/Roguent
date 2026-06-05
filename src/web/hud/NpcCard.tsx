import { useState } from "react";
import type { SessionStatus } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { shortModel } from "./widgets";

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "待命",
  busy: "工作中",
  done: "完成",
  error: "出错",
};
// SessionStatus → 设计原型 hex(直接用色值,Modal accent / chip / 头像描边都吃它)。
const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: "#8a8170",
  busy: "#36c5e0",
  done: "#5fd35f",
  error: "#ff4d6d",
};

/**
 * 会话档案卡(对标设计原型 panels1.jsx 的 NpcCard,§6.7):总览大厅点击会话 NPC
 * 后弹出的完整 Modal,复用 T1.2 的像素模态壳(Modal)。展示一整个会话的真实信息
 * (项目 / 模型 / 模式 / 状态 / 子智能体摘要 / Token / 花费 / 上下文充能条),并提供
 * 进入 / 聊天 / 归档 / 删除四个真实动作。删除两段式确认,确认后发 deleteSession
 * 命令停掉后端 driver(spec §生命周期)。
 *
 * **压缩阈值控件是 mock**(§6.8):引擎暂无 per-session 压缩阈值,这一块控件不写
 * store、不发命令,纯本地 state 占位。三重防伪标注:① 本注释 ② .comp-h 里可见的
 * `.mock-chip 示例` 角标 ③ 控件下方 note 文案「示例 · 引擎暂未接入」。绝不冒充真数据。
 *
 * **askuser 横幅省略**:原型在卡片顶部对 askuser 状态会显示「等待你确认」横幅,但我们
 * 的 SessionStatus 只有 idle/busy/done/error,引擎不产出 askuser,无法真实判定 → 直接
 * 省略该横幅,不硬造假数据。
 */
export function NpcCard() {
  const id = useUiStore((s) => s.selectedNpcId);
  const selectNpc = useUiStore((s) => s.selectNpc);
  const beginEnter = useUiStore((s) => s.beginEnter);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) => (id ? s.sessions[id] : undefined));
  const switchSession = useRoomStore((s) => s.switchSession);
  const archiveSession = useRoomStore((s) => s.archiveSession);
  const removeSession = useRoomStore((s) => s.removeSession);
  const [confirmDel, setConfirmDel] = useState(false);
  // mock 压缩阈值控件的本地态:'inherit' = 继承全局 / 'override' = 局部覆盖。
  const [compMode, setCompMode] = useState<"inherit" | "override">("inherit");
  const [compPct, setCompPct] = useState(20);

  // gate 放在所有 hooks 之后(React hooks 规则):无选中 NPC 或会话已不存在 → 不渲染。
  if (!id || !session) return null;

  const statusColor = STATUS_COLOR[session.status];
  const subagents = Object.values(session.agents).filter(
    (a) => a.kind === "subagent",
  );
  // 各状态分桶(spec §生命周期/信息卡: task 摘要 = subagent 数 + 各状态),只显示非零桶。
  const STATUS_TALLY: Record<string, string> = {
    working: "工作",
    thinking: "思考",
    idle: "待命",
    spawning: "启动",
    done: "完成",
  };
  const tally = subagents.reduce<Record<string, number>>((m, a) => {
    m[a.status] = (m[a.status] ?? 0) + 1;
    return m;
  }, {});
  const breakdown = Object.entries(STATUS_TALLY)
    .filter(([k]) => (tally[k] ?? 0) > 0)
    .map(([k, label]) => `${tally[k] ?? 0} ${label}`)
    .join(" · ");

  // 上下文充能条颜色:<20→绿 / ≤80→琥珀 / 否则红(对标原型 §6.8)。
  const util = session.context?.utilization ?? 0;
  const ctxColor = util < 20 ? "#5fd35f" : util <= 80 ? "#f2c84b" : "#ff4d6d";

  const enter = () => {
    beginEnter(id);
    selectNpc(null);
  };
  const chat = () => {
    switchSession(id);
    if (!drawerOpen) toggle("drawerOpen");
    selectNpc(null);
  };
  const archive = () => {
    archiveSession(id);
    selectNpc(null);
  };
  const del = () => {
    sendCommand({ cmd: "deleteSession", sessionId: id });
    removeSession(id);
    selectNpc(null);
  };

  return (
    <Modal
      title="NPC"
      sub="会话档案"
      icon="account"
      accent={statusColor}
      width={760}
      onClose={() => selectNpc(null)}
    >
      <div className="npccard">
        {/* 头部:像素英雄头像(状态色描边)+ 标题 / 项目 / 状态标签 + Claude 标签。 */}
        <div className="npccard-hd">
          <div
            className="npccard-portrait"
            style={{ boxShadow: `0 0 0 3px ${statusColor}` }}
          >
            <HeroPortrait sessionId={id} size={80} className="" />
          </div>
          <div className="npccard-meta">
            <div className="npccard-name px">{session.title}</div>
            <div className="dim">{session.project ?? "—"}</div>
            <div className="npccard-tags">
              <span
                className="chip"
                style={{
                  color: statusColor,
                  boxShadow: `inset 0 0 0 1px ${statusColor}`,
                }}
              >
                {STATUS_LABEL[session.status] ?? session.status}
              </span>
              <span className="chip tag-claude">
                <Icon name="claude" size={13} style={{ marginRight: 4 }} />
                Claude
              </span>
            </div>
          </div>
        </div>

        {/* 真数据 stat 网格(两列)。自建 .statrow,不用 widgets 的 legacy StatRow。 */}
        <div className="statgrid">
          <div className="statrow">
            <span className="sr-label">项目</span>
            <span className="sr-val">{session.project ?? "—"}</span>
          </div>
          <div className="statrow">
            <span className="sr-label">模型</span>
            <span className="sr-val gold">{shortModel(session.model)}</span>
          </div>
          <div className="statrow">
            <span className="sr-label">模式</span>
            <span className="sr-val">{session.permissionMode}</span>
          </div>
          <div className="statrow">
            <span className="sr-label">状态</span>
            <span className="sr-val">
              {STATUS_LABEL[session.status] ?? session.status}
            </span>
          </div>
          <div className="statrow">
            <span className="sr-label">子智能体</span>
            <span className="sr-val">
              {`${subagents.length} 个${breakdown ? ` · ${breakdown}` : ""}`}
            </span>
          </div>
          <div className="statrow">
            <span className="sr-label">Token</span>
            <span className="sr-val">
              {session.usage.tokens.toLocaleString()}
            </span>
          </div>
          <div className="statrow">
            <span className="sr-label">花费</span>
            <span className="sr-val">${session.usage.cost.toFixed(4)}</span>
          </div>
        </div>

        {/* 上下文充能条(仅当引擎已提供 context 时):填充=已用 util%,20% 处刻度线。 */}
        {session.context ? (
          <div className="npccard-ctx">
            <span className="sr-label">上下文 {util}%</span>
            <div className="util" style={{ height: 12 }}>
              <div
                className="fill"
                style={{ width: `${util}%`, background: ctxColor }}
              />
              <div className="tick" style={{ left: "20%" }} />
            </div>
          </div>
        ) : null}

        {/* ── 压缩阈值控件(MOCK,§6.8)──────────────────────────────────────
            引擎暂无 per-session 压缩阈值;此控件全为本地 state,不写 store、不发命令。
            可见的 .mock-chip 示例角标 + 下方 note 文案双重提示这是示例数据。 */}
        <div className="comp-box">
          <div className="comp-h">
            <Icon name="compact" size={18} />
            <span className="px" style={{ fontSize: 10 }}>
              上下文压缩阈值
            </span>
            {/* mock 防伪标注之二:可见「示例」角标 */}
            <span className="mock-chip px">示例</span>
            <span className="qmark has-tip">
              ?
              <span className="tip cjk">
                订阅模式下 Opus 默认 1M 上下文，不设阈值易烧爆额度；达到该 %
                自动 /compact 并续跑，循环直到任务完成。
              </span>
            </span>
          </div>
          <div className="seg sm">
            <button
              type="button"
              className={`seg-opt${compMode === "inherit" ? " on" : ""}`}
              onClick={() => setCompMode("inherit")}
            >
              继承全局 (20%)
            </button>
            <button
              type="button"
              className={`seg-opt${compMode === "override" ? " on" : ""}`}
              onClick={() => setCompMode("override")}
            >
              局部覆盖
            </button>
          </div>
          {compMode === "override" ? (
            <div className="slider-row">
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={compPct}
                onChange={(e) => setCompPct(Number(e.target.value))}
                className="pxrange"
              />
              <span className="px pct-num">{compPct}%</span>
            </div>
          ) : null}
          {/* mock 防伪标注之三:note 文案显式声明示例 · 引擎暂未接入 */}
          <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>
            {compMode === "inherit"
              ? "跟随全局默认（Opus 20%）。示例 · 引擎暂未接入"
              : "此会话单独生效。示例 · 引擎暂未接入"}
          </div>
        </div>

        {/* 操作排:进入 / 聊天 / 归档 / 删除(两段式确认)。全为真实动作。 */}
        <div className="npccard-act">
          <button type="button" className="pxbtn cjk primary" onClick={enter}>
            进入
          </button>
          <button type="button" className="pxbtn cjk" onClick={chat}>
            聊天
          </button>
          <button type="button" className="pxbtn cjk" onClick={archive}>
            归档
          </button>
          {confirmDel ? (
            <button type="button" className="pxbtn cjk danger" onClick={del}>
              确认删除？
            </button>
          ) : (
            <button
              type="button"
              className="pxbtn cjk danger"
              onClick={() => setConfirmDel(true)}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
