import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { leaderboardRows } from "./leaderboard-rows";
import { shortModel } from "./widgets";

/** 🏆 排行榜:全部会话按 token 降序。 */
export function Leaderboard() {
  const open = useUiStore((s) => s.leaderboardOpen);
  const sessions = useRoomStore((s) => s.sessions);
  if (!open) return null;
  const rows = leaderboardRows(sessions);
  const max = rows[0]?.tokens || 1;
  return (
    <div
      className="px-panel px-pop px-scroll"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 78,
        transform: "translateX(-50%)",
        width: 300,
        maxHeight: 340,
        padding: 12,
      }}
    >
      <div className="px-title">🏆 排行榜 · {rows.length}</div>
      {rows.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 11 }}>暂无会话</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.sessionId}
            className="px-row"
            style={{ cursor: "default", opacity: r.archived ? 0.5 : 1 }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 16, color: "var(--gold)" }}>{i + 1}</span>
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.title}
              </span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>
                {shortModel(r.model)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginTop: 3,
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 5,
                  background: "#0e1622",
                  border: "1px solid var(--edge-dark)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(r.tokens / max) * 100}%`,
                    background: "var(--gold)",
                  }}
                />
              </div>
              <span style={{ fontSize: 9, color: "var(--gold)" }}>
                🪙{r.tokens.toLocaleString()}
              </span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>
                ${r.cost.toFixed(3)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
