import type { Session, TimelineMessageItem } from "../../shared/domain";
import { mdToHtml } from "./markdown";

interface Props {
  item: TimelineMessageItem;
  session: Session;
}

const authorName = (item: TimelineMessageItem, session: Session): string => {
  if (item.role === "user") return "你";
  return (
    (item.agentId ? session.agents[item.agentId]?.role : undefined) ??
    item.agentId ??
    item.role
  );
};

export function MessageBubble({ item, session }: Props) {
  return (
    <div className={`cmsg ${item.role === "user" ? "me" : "agent"}`}>
      <div className="cmsg-author px">{authorName(item, session)}</div>
      <div
        className="cmsg-bubble md"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml 先 escHtml 再渲染,输入为本会话消息文本
        dangerouslySetInnerHTML={{ __html: mdToHtml(item.text) }}
      />
    </div>
  );
}
