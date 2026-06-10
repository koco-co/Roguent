import { useMemo } from "react";
import type { Agent } from "../../shared/domain";
import { VH, VW } from "../room/config";
import { roomLayout } from "../room/layout";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";

// 稳定空引用:zustand selector 绝不能每次返回新建对象(Object.values / [] / {}),
// 否则 useSyncExternalStore 每次都看到新快照 → 无限循环白屏。selector 选稳定的
// agents map(或此常量),数组在 render/useMemo 里派生。参考 RosterCard / LootPanel。
const EMPTY_AGENTS: Record<string, Agent> = {};

/**
 * 内景左下 Minimap(对标设计原型 hud.jsx Minimap):当前会话的全部 agents 在一个网格
 * 缩略图里以小点呈现。**真 agents** —— 点的坐标复用内景房间布局 `roomLayout`(虚拟房间
 * VW×VH 像素空间),按比例换算成网格内的 left/top 百分比,故 minimap 与房间小人位置一致。
 *
 * 颜色:指挥官 → 金(--gold);其余 → --ink-dim;选中(selectedAgentId)→ .sel 高亮。
 * 仅内景显示;总览大厅无「房间」概念。selector 选稳定 agents map + 模块级 EMPTY 常量,
 * 数组在 render 里派生(铁律)。
 */
export function Minimap() {
  // 仅内景 HUD 显示。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const selectedId = useUiStore((s) => s.selectedAgentId);
  // 选稳定的 agents map(绝不返回新数组)—— 见 EMPTY_AGENTS 注释。
  const agentsMap = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.agents ?? EMPTY_AGENTS)
      : EMPTY_AGENTS,
  );

  // render 里派生数组 + 复用房间布局算每个 agent 的网格百分比坐标。
  // useMemo 仅在 agents 引用变化时重算(reducer 对未变会话保持引用稳定)。
  const dots = useMemo(() => {
    const agents = Object.values(agentsMap);
    const lay = roomLayout(
      agents.map((a) => a.id),
      VW,
      VH,
    );
    return agents.map((a) => {
      const pos = lay[a.id];
      return {
        id: a.id,
        lead: a.kind === "orchestrator",
        // 房间像素坐标 → minimap 网格百分比(与内景小人同源,故位置一致)。
        x: pos ? (pos.x / VW) * 100 : 50,
        y: pos ? (pos.y / VH) * 100 : 50,
      };
    });
  }, [agentsMap]);

  if (!inInterior) return null;

  return (
    <div className="panel minimap">
      <div className="mm-body">
        <div className="mm-h px">MAP</div>
        <div className="mm-grid">
          {dots.map((d) => (
            <div
              key={d.id}
              className={`mm-dot${selectedId === d.id ? " sel" : ""}`}
              style={{
                left: `${d.x}%`,
                top: `${d.y}%`,
                // 原型:orchestrator→金、askuser→cyan、else→--ink-dim。
                // 引擎单 agent 无 askuser 状态(详见 RosterCard),故仅金 / 暗两色;
                // askuser 接入后此处可补条件着色。
                background: d.lead ? "var(--gold)" : "var(--ink-dim)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
