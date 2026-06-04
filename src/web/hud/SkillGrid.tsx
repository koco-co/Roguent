import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

export function SkillGrid() {
  const open = useUiStore((s) => s.skillsOpen);
  const toggle = useUiStore((s) => s.toggle);
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  if (!open) return null;
  const cmds = session?.slashCommands ?? [];
  return (
    <div
      className="px-panel px-pop"
      style={{
        position: "absolute",
        bottom: 130,
        left: 12,
        width: 264,
        padding: 12,
      }}
    >
      <div className="px-title">📜 技能 · {cmds.length}</div>
      {cmds.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 11 }}>无可用技能</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
          }}
        >
          {cmds.map((c) => {
            const name = c.replace(/^\//, "");
            return (
              <button
                key={c}
                type="button"
                title={c}
                className="px-btn"
                style={{ padding: "8px 4px", fontSize: 9, minHeight: 40 }}
                onClick={() => {
                  if (session)
                    sendCommand({
                      cmd: "sendMessage",
                      sessionId: session.id,
                      text: `/${name}`,
                    });
                  toggle("skillsOpen");
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
