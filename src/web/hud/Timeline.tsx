import { useEffect, useMemo, useRef } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { TimelineItem } from "./TimelineItem";
import { filterTimelineByQuery } from "./timeline-search";

export function Timeline({
  sessionId,
  query = "",
}: {
  sessionId: string;
  query?: string;
}) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const threadRef = useRef<HTMLDivElement>(null);
  const timeline = session?.timeline;

  // 搜索过滤纯函数,在 useMemo 里做(不在 selector 里,守 zustand 铁律)。
  // query 为空时 visible === timeline(原样,含非 message 项)。
  const { items: visible, normalized } = useMemo(
    () => filterTimelineByQuery(timeline ?? [], query),
    [timeline, query],
  );
  const searching = normalized.length > 0;

  // 新消息到达 / 切会话后自动滚到底(对标原型 threadRef)。visible 引用变即触发,
  // 搜索过滤后列表变化也会重新对齐。
  // biome-ignore lint/correctness/useExhaustiveDependencies: visible 是触发条件,非回调内使用的值;threadRef.current 是 DOM ref,不加入 deps 是 React 惯例
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible]);

  return (
    <div className="cdrawer-thread scroll" ref={threadRef}>
      {!sessionId && <span className="faint">{t("选一个会话")}</span>}
      {sessionId && (timeline?.length ?? 0) === 0 && (
        <span className="faint">{t("还没有消息,发一条开始…")}</span>
      )}
      {sessionId && searching && visible.length === 0 && (
        <span className="faint">{t("没有匹配的消息")}</span>
      )}
      {visible.map((item) => (
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
