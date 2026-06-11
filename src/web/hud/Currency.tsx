import { useState } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { Icon, type IconName } from "./icons";
import { sessionTodos, todoCounts } from "./todos-view";

// ── mock 占位:引擎暂无「宝石」经济,gems 用固定示例值并显式标注「示例」(角标 +
// title)。完成数已接真(当前会话已完成 TodoWrite 计数,见下),不再 mock。
const MOCK_GEMS = 1280; // 待引擎补:gems 经济

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
  const t = useT();
  return (
    <div
      className="cur-cell"
      title={mock ? t("示例数据(引擎暂未提供)") : undefined}
    >
      <Icon name={icon} size={22} />
      <span className="px" style={{ color }}>
        {value}
      </span>
      {mock && <span className="cur-mock px">{t("示例")}</span>}
    </div>
  );
}

/**
 * 顶右货币条(对标设计原型 hud.jsx Currency):金币(tokens 真)/ 宝石(示例)/
 * 桂冠(完成数 真)+ runtime 筛选。两视图都显示。
 * - coins = 当前会话 usage.tokens(真)。
 * - gemcur = mock 占位,带「示例」角标 + title 提示。
 * - laurel 真 = 当前会话已完成 TodoWrite 计数。
 * - runtime-filter:claude 可点(真;切 all↔claude),codex 禁用占位(置灰、不可点)。
 */
export function Currency() {
  const t = useT();
  // 引擎只有 claude → 筛选目前只在 all↔claude 间切换。状态自包含(暂无外部消费方),
  // 待真正多 runtime 时再上提到 ui-store。
  const [runtime, setRuntime] = useState<Runtime>("all");
  const tokens = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.usage.tokens ?? 0)
      : 0,
  );
  // 取当前会话对象引用(稳定:同一会话同一引用),派生在渲染体里算,
  // 不在 selector 里构造新值(zustand 铁律)。
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );

  // 已完成数 = 当前会话已完成的 TodoWrite 计数(真)。派生在渲染体里算,不在 selector 里。
  const completed = session ? todoCounts(sessionTodos(session)).completed : 0;

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
        <CurCell icon="laurel" value={String(completed)} color="#5fd35f" />
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
            title={t("Codex 占位,暂未接入")}
          >
            <Icon name="codex" size={16} />
            Codex
          </button>
        </div>
      </div>
    </div>
  );
}
