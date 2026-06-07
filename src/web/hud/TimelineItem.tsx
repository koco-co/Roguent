import type { Session, TimelineItem as TItem } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";

interface Props {
  item: TItem;
  session: Session;
  sessionId: string;
}

export function TimelineItem({ item, session }: Props) {
  if (item.kind === "message") {
    return <MessageBubble item={item} session={session} />;
  }
  // thinking / tool / prompt: rendered in later tasks
  return null;
}
