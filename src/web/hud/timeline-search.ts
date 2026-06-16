import type { TimelineItem } from "../../shared/domain";

// 当前会话内的消息搜索(纯前端、纯函数,可单测)。
// 只搜 message 项的文本;有 query 时把非 message 项(thinking/tool/prompt)隐藏,
// 让搜索结果只剩命中的对话气泡。空 query 原样返回整条 timeline(含非 message 项)。
//
// 这是 B3 的「搜索」切片;搜索状态是组件本地 state,不入 zustand(避免 selector 造新值),
// 也不入引擎——纯客户端的查看辅助。

export interface TimelineSearchResult {
  /** 过滤后要渲染的 timeline 项。空 query = 原样;有 query = 仅命中的 message 项。 */
  items: TimelineItem[];
  /** 命中的 message 项数量。空 query 时为 0(UI 据此决定是否显示计数)。 */
  matchCount: number;
  /** trim+lowercase 后的有效 query;空串表示「无筛选」。 */
  normalized: string;
}

// 大小写无关的子串匹配。
function textMatches(text: string, normalizedQuery: string): boolean {
  return text.toLowerCase().includes(normalizedQuery);
}

/**
 * 按 query 过滤 timeline。
 * - 空 / 全空白 query → 返回原 items(含非 message),matchCount=0。
 * - 非空 query → 仅保留文本大小写无关命中的 message 项;非 message 项一律隐藏。
 *   无命中 → items=[],matchCount=0。
 */
export function filterTimelineByQuery(
  items: TimelineItem[],
  query: string,
): TimelineSearchResult {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return { items, matchCount: 0, normalized: "" };
  }
  const matches = items.filter(
    (item): item is Extract<TimelineItem, { kind: "message" }> =>
      item.kind === "message" && textMatches(item.text, normalized),
  );
  return { items: matches, matchCount: matches.length, normalized };
}

/**
 * 「仅看置顶」过滤(B3,客户端本地 UI)。只保留 id 落在 pinnedIds 里的 **message** 项,
 * 顺序沿 timeline 原序(不按 pin 时间)。pinnedIds 为空 → 返回 []。
 *
 * 与搜索独立、不重复计数:UI 上「仅看置顶」与「搜索」择一/可叠加,各自是 timeline 上
 * 的一道过滤,本函数只管置顶这一维。
 */
export function filterTimelineByPinned(
  items: TimelineItem[],
  pinnedIds: readonly string[],
): TimelineItem[] {
  if (pinnedIds.length === 0) return [];
  const set = new Set(pinnedIds);
  return items.filter((item) => item.kind === "message" && set.has(item.id));
}
