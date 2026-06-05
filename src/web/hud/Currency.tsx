import { useState } from "react";
import { useRoomStore } from "../store";
import { Icon, type IconName } from "./icons";

// ── mock 占位:引擎暂无「宝石 / 完成数」概念,先用固定示例值,待引擎补齐后接真数据。
// 这两格在 UI 上明确标注「示例」(角标 + title 提示),绝不冒充真实数据。
const MOCK_GEMS = 1280; // 待引擎补:gems 经济
const MOCK_COMPLETED = 7; // 待引擎补:已完成任务计数

// runtime 筛选可选值;当前引擎只有 claude,codex 为禁用占位。
type Runtime = "all" | "claude" | "codex";

/** 单个货币格:图标 + 像素数值;mock 标注「示例」角标。 */
function CurCell({
  icon,
  value,
  color,
  mock,
}: {
  icon: IconName;
  value: string;
  color: string;
  mock?: boolean;
}) {
  return (
    <div
      className="cur-cell"
      title={mock ? "示例数据(引擎暂未提供)" : undefined}
    >
      <Icon name={icon} size={22} />
      <span className="px" style={{ color }}>
        {value}
      </span>
      {mock && <span className="cur-mock px">示例</span>}
    </div>
  );
}

/**
 * 顶右货币条(对标设计原型 hud.jsx Currency):金币(tokens 真)/ 宝石(示例)/
 * 桂冠(完成数 示例)+ runtime 筛选。两视图都显示。
 * - coins = 当前会话 usage.tokens(真)。
 * - gemcur / laurel = mock 占位,带「示例」角标 + title 提示。
 * - runtime-filter:claude 可点(真;切 all↔claude),codex 禁用占位(置灰、不可点)。
 */
export function Currency() {
  // 引擎只有 claude → 筛选目前只在 all↔claude 间切换。状态自包含(暂无外部消费方),
  // 待真正多 runtime 时再上提到 ui-store。
  const [runtime, setRuntime] = useState<Runtime>("all");
  const tokens = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.usage.tokens ?? 0)
      : 0,
  );

  const claudeOn = runtime === "claude" || runtime === "all";

  return (
    <div className="panel currency">
      <div className="cur-body">
        <CurCell icon="coins" value={tokens.toLocaleString()} color="#f2c84b" />
        <CurCell
          icon="gemcur"
          value={MOCK_GEMS.toLocaleString()}
          color="#a06cd5"
          mock
        />
        <CurCell
          icon="laurel"
          value={String(MOCK_COMPLETED)}
          color="#5fd35f"
          mock
        />
        <div className="runtime-filter">
          <button
            type="button"
            className={`rt-chip${claudeOn ? " on" : ""}`}
            onClick={() => setRuntime(runtime === "claude" ? "all" : "claude")}
          >
            <Icon name="claude" size={16} />
            Claude
          </button>
          {/* Codex 占位:暂未接入,置灰不可点 */}
          <button
            type="button"
            className="rt-chip codex dis"
            disabled
            title="Codex 占位,暂未接入"
          >
            <Icon name="codex" size={16} />
            Codex
          </button>
        </div>
      </div>
    </div>
  );
}
