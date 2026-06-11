import type { Session, TimelineToolItem } from "../../shared/domain";

// 内景「指挥大屏」的视图模型。引擎没有浏览器画面流,但有真实 tool 活动
// (TimelineToolItem);大屏据此渲染:tab=会话标题、url=最近 tool 的 inputSummary
// (截断)、caption="agent名 · toolName"、busy/idle=最近 tool 是否 running / 有无活动。
export interface ScreenView {
  tab: string;
  url: string; // 最近 tool 的 inputSummary(≤64 字符,尾部省略号)
  caption: string; // "AgentName · ToolName"
  busy: boolean; // 最近 tool 仍 running
  idle: boolean; // 无任何 tool 活动
}

const URL_MAX = 64;

/** 从会话 timeline 提取大屏视图:取最后一个 kind==="tool" 的条目。 */
export function screenViewOf(session: Session | null): ScreenView {
  const empty: ScreenView = {
    tab: session?.title ?? "—",
    url: "",
    caption: "",
    busy: false,
    idle: true,
  };
  if (!session) return empty;
  let last: TimelineToolItem | null = null;
  for (let i = session.timeline.length - 1; i >= 0; i--) {
    const it = session.timeline[i];
    if (it && it.kind === "tool") {
      last = it;
      break;
    }
  }
  if (!last) return empty;
  // Agent 没有 name 字段,展示名沿用 role(与 AgentCard / MessageBubble 一致);
  // 缺 agentId 或查无此 agent → 归主控。
  const agentName =
    (last.agentId && session.agents[last.agentId]?.role) || "Orchestrator";
  const raw = last.inputSummary || "";
  return {
    tab: session.title,
    url: raw.length > URL_MAX ? `${raw.slice(0, URL_MAX - 1)}…` : raw,
    caption: `${agentName} · ${last.toolName}`,
    busy: last.status === "running",
    idle: false,
  };
}
