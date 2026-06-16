import { useT, useTL } from "../i18n";

/**
 * 当前会话消息搜索条(B3,纯前端)。位于 Timeline 上方,过滤当前会话的对话气泡。
 * query 状态由父级(ChatDrawer)持有,本组件只是受控输入 + 计数显示 + 清除按钮。
 *
 * 注意:这跟 ChatHeader 里「搜索已归档会话」的搜索框是两回事——那个搜的是会话列表,
 * 这个搜的是当前会话内的消息文本。
 */
export function TimelineSearchBar({
  query,
  matchCount,
  onChange,
  pinnedOnly,
  pinnedCount,
  onTogglePinnedOnly,
}: {
  query: string;
  matchCount: number;
  onChange: (next: string) => void;
  /** 「仅看置顶」过滤是否开启(客户端本地 UI 状态,非引擎)。 */
  pinnedOnly: boolean;
  /** 当前会话已置顶消息数,用于按钮角标。 */
  pinnedCount: number;
  onTogglePinnedOnly: () => void;
}) {
  const t = useT();
  const tl = useTL();
  const active = query.trim().length > 0;

  return (
    <div className="cdrawer-search">
      <input
        className="pxinput"
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("搜索消息")}
        aria-label={t("搜索消息")}
      />
      {active && (
        <span className="cdrawer-search-count px faint">
          {tl(
            `${matchCount} 条`,
            `${matchCount} match${matchCount === 1 ? "" : "es"}`,
          )}
        </span>
      )}
      {active && (
        <button
          type="button"
          className="cdrawer-search-clear px"
          onClick={() => onChange("")}
          title={t("清除搜索")}
          aria-label={t("清除搜索")}
        >
          ✕
        </button>
      )}
      {/* 「仅看置顶」开关:把 timeline 过滤到当前会话已置顶的消息(客户端本地)。 */}
      <button
        type="button"
        className={`cdrawer-pin-toggle px${pinnedOnly ? " on" : ""}`}
        onClick={onTogglePinnedOnly}
        title={t("仅看置顶")}
        aria-label={t("仅看置顶")}
        aria-pressed={pinnedOnly}
      >
        📌{pinnedCount > 0 ? ` ${pinnedCount}` : ""}
      </button>
    </div>
  );
}
