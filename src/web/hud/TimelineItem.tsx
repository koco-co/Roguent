import type { Session, TimelineItem as TItem } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";
import { PromptCard } from "./PromptCard";

interface Props {
  item: TItem;
  session: Session;
  sessionId: string;
}

export function TimelineItem({ item, session, sessionId }: Props) {
  if (item.kind === "message") {
    return <MessageBubble item={item} session={session} />;
  }
  if (item.kind === "prompt") {
    return <PromptCard item={item} sessionId={sessionId} />;
  }
  // thinking / tool: rendered in later tasks
  return null;
}
