import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";

/**
 * 视图切换段(对标设计原型 app.jsx 的 view-switch):内景 / 大厅 两个选项,两视图都显示。
 * 放左上栈(hud-tl,LimitBars / RosterCard 下方)。
 *
 * 接线:
 * - 「内景」:即时进当前会话内景(不走传送门过渡)。镜像 PortalTransition 进内景中点的
 *   switchSession(id) + enterInterior(id)(两个 store 解耦,各自调用)。无 currentSessionId
 *   时禁用置灰(没会话可进)。.on = 当前已是内景。
 * - 「大厅」:即时回大厅 exitOverworld()。.on = 当前是 overworld。
 */
export function ViewSwitch() {
  const view = useUiStore((s) => s.view);
  const enterInterior = useUiStore((s) => s.enterInterior);
  const exitOverworld = useUiStore((s) => s.exitOverworld);
  const switchSession = useRoomStore((s) => s.switchSession);
  const currentSessionId = useRoomStore((s) => s.currentSessionId);

  const inInterior = view !== "overworld";

  const goInterior = () => {
    if (!currentSessionId) return;
    // 镜像 PortalTransition 进内景(即时版):先切焦点再进内景。
    switchSession(currentSessionId);
    enterInterior(currentSessionId);
  };

  return (
    <div className="view-switch">
      <button
        type="button"
        className={`vs-opt${inInterior ? " on" : ""}${
          currentSessionId ? "" : " dis"
        }`}
        disabled={!currentSessionId}
        onClick={goInterior}
      >
        内景
      </button>
      <button
        type="button"
        className={`vs-opt${inInterior ? "" : " on"}`}
        onClick={exitOverworld}
      >
        大厅
      </button>
    </div>
  );
}
