import { useT } from "../i18n";
import { sendCommand } from "../ws-client";
import { Icon } from "./icons";

/**
 * 大厅空态 overlay(T4.3,对标原型 lobby.jsx EmptyState):无任何项目/会话时,
 * 在 Pixi 大厅之上居中显示「召唤第一个小队」提示。由 Overworld 在 projectCount===0
 * 时渲染。「召唤小队」发真实 newSession 命令(引擎据默认 cwd 派生房间)。
 */
export function EmptyState() {
  const t = useT();
  const summon = () => {
    // 空态 = 无会话,首个 id 用 s1;不带 cwd → 服务端默认。
    sendCommand({
      cmd: "newSession",
      sessionId: "s1",
      title: "会话 1",
      model: "claude-opus-4-8",
    });
  };
  return (
    <div className="empty-center">
      <div className="struct-tower big">
        <div className="tower-ring" />
        <div className="tower-orb">
          <Icon name="quest" size={72} glow="#36c5e0" />
        </div>
      </div>
      <div className="empty-title px">{t("空无一人")}</div>
      <div className="empty-sub cjk">
        {t("召唤你的第一个小队,开始 vibe coding")}
      </div>
      <button type="button" className="pxbtn gold cjk" onClick={summon}>
        <Icon name="task" size={18} />
        <span style={{ marginLeft: 8 }}>{t("召唤小队")}</span>
      </button>
    </div>
  );
}
