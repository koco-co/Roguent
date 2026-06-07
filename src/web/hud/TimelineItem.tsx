import type { Session, TimelineItem as TItem } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";
import { PromptCard } from "./PromptCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCard } from "./ToolCard";

interface Props {
  item: TItem;
  session: Session;
  sessionId: string;
}

export function TimelineItem({ item, session, sessionId }: Props) {
  if (item.kind === "message")
    return <MessageBubble item={item} session={session} />;
  if (item.kind === "thinking") return <ThinkingBlock item={item} />;
  if (item.kind === "tool") return <ToolCard item={item} />;
  if (item.kind === "prompt")
    return <PromptCard item={item} sessionId={sessionId} />;
  return null;
}
