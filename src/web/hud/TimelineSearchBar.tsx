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
}: {
  query: string;
  matchCount: number;
  onChange: (next: string) => void;
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
    </div>
  );
}
