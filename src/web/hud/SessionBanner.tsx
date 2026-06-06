import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon } from "./icons";
import { shortModel } from "./widgets";

/**
 * 顶中会话横幅(对标设计原型 hud.jsx SessionBanner):标题 · 模型 · {n}P · runtime 标签。
 * 数据全真:title / model(shortModel)/ agentCount 取当前会话;runtime 标签因引擎
 * 只跑 Claude 固定显示 Claude(tag-claude)。
 * 仅内景显示——总览大厅对标原型不展示横幅(组件内 gate,返回 null)。
 */
export function SessionBanner() {
  // 与 RosterCard 一致的内景 gate:overworld = 大厅,其余 = 内景。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const openPanel = useUiStore((s) => s.openPanel);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );

  if (!inInterior) return null;

  const agentCount = Object.keys(session?.agents ?? {}).length;

  return (
    <div className="panel session-banner">
      <button
        type="button"
        className="sb-body"
        onClick={() => openPanel("sessiongrid")}
      >
        <Icon name="task" size={20} />
        <span className="sb-title">{session?.title ?? "no session"}</span>
        <span className="sb-dot">·</span>
        <span className="chip">
          <span className="px" style={{ fontSize: 9 }}>
            {shortModel(session?.model)}
          </span>
        </span>
        <span className="chip px" style={{ fontSize: 9 }}>
          {agentCount}P
        </span>
        {/* 引擎只跑 Claude → 固定 Claude runtime 标签 */}
        <span className="chip tag-claude px" style={{ fontSize: 9 }}>
          <Icon name="claude" size={13} style={{ marginRight: 4 }} />
          Claude
        </span>
      </button>
    </div>
  );
}
