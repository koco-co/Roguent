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
      style={{
        position: "absolute",
        bottom: 132,
        left: 12,
        background: "#101c2e",
        border: "2px solid #00ffe7",
        borderRadius: 12,
        padding: 10,
        maxWidth: 260,
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 8,
      }}
    >
      {cmds.length === 0 ? (
        <div style={{ color: "#86c7d6", fontSize: 11 }}>无可用技能</div>
      ) : (
        cmds.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => {
              if (session)
                sendCommand({
                  cmd: "sendMessage",
                  sessionId: session.id,
                  text: `/${c.replace(/^\//, "")}`,
                });
              toggle("skillsOpen");
            }}
            style={{
              padding: 8,
              borderRadius: 9,
              background: "#13243b",
              border: "1px solid #2a4a5e",
              color: "#9fd",
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            {c.replace(/^\//, "").slice(0, 8)}
          </button>
        ))
      )}
    </div>
  );
}
