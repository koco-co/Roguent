import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon } from "./icons";
import {
  runtimeIconName,
  runtimeLabel,
  runtimeModeTag,
  runtimeTagClass,
} from "./runtime-display";
import { shortModel } from "./widgets";

/**
 * 顶中会话横幅(对标设计原型 hud.jsx SessionBanner):标题 · 模型 · {n}P · runtime 标签。
 * 数据全真:title / model(shortModel)/ agentCount / runtime 状态取当前会话。
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
  const modeTag = runtimeModeTag(session);

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
        <span
          className={`chip ${runtimeTagClass(session)} px`}
          style={{ fontSize: 9 }}
        >
          <Icon
            name={runtimeIconName(session)}
            size={13}
            style={{ marginRight: 4 }}
          />
          {runtimeLabel(session)}
        </span>
        {modeTag ? (
          <span className="chip px" style={{ fontSize: 9 }}>
            {modeTag}
          </span>
        ) : null}
      </button>
    </div>
  );
}
