import { useEffect, useMemo, useRef } from "react";
import { useT } from "../i18n";
import { selectPinnedIds, usePinnedStore } from "../pinned-store";
import { useRoomStore } from "../store";
import { TimelineItem } from "./TimelineItem";
import {
  filterTimelineByPinned,
  filterTimelineByQuery,
} from "./timeline-search";

export function Timeline({
  sessionId,
  query = "",
  pinnedOnly = false,
}: {
  sessionId: string;
  query?: string;
  pinnedOnly?: boolean;
}) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  // 置顶 id 的稳定引用(无置顶时同一冻结空数组,守 zustand 铁律)。
  const pinnedIds = usePinnedStore((s) => selectPinnedIds(s, sessionId));
  const threadRef = useRef<HTMLDivElement>(null);
  const timeline = session?.timeline;

  // 过滤纯函数在 useMemo 里做(不在 selector 里,守 zustand 铁律)。
  // 「仅看置顶」先把基集缩到置顶的 message 项;再叠加搜索:query 为空时基集原样。
  const { items: visible, normalized } = useMemo(() => {
    const base = pinnedOnly
      ? filterTimelineByPinned(timeline ?? [], pinnedIds)
      : (timeline ?? []);
    return filterTimelineByQuery(base, query);
  }, [timeline, query, pinnedOnly, pinnedIds]);
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
      {sessionId &&
        pinnedOnly &&
        !searching &&
        (timeline?.length ?? 0) > 0 &&
        visible.length === 0 && (
          <span className="faint">{t("暂无置顶消息")}</span>
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
