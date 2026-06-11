import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { TimelineItem } from "./TimelineItem";

export function Timeline({ sessionId }: { sessionId: string }) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const threadRef = useRef<HTMLDivElement>(null);
  const timeline = session?.timeline;

  // 新消息到达 / 切会话后自动滚到底(对标原型 threadRef)。timeline 引用变即触发。
  // biome-ignore lint/correctness/useExhaustiveDependencies: timeline 是触发条件,非回调内使用的值;threadRef.current 是 DOM ref,不加入 deps 是 React 惯例
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline]);

  return (
    <div className="cdrawer-thread scroll" ref={threadRef}>
      {!sessionId && <span className="faint">{t("选一个会话")}</span>}
      {sessionId && (timeline?.length ?? 0) === 0 && (
        <span className="faint">{t("还没有消息,发一条开始…")}</span>
      )}
      {timeline?.map((item) => (
        <TimelineItem
          key={`${item.kind}:${item.id}`}
          item={item}
          session={session!}
          sessionId={sessionId}
        />
      ))}
    </div>
  );
}
