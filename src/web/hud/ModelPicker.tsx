import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";

const MODELS = [
  { id: "claude-opus-4-8", label: "💠 Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "🔷 Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "🔹 Haiku 4.5" },
];

export function ModelPicker() {
  const open = useUiStore((s) => s.modelOpen);
  const toggle = useUiStore((s) => s.toggle);
  const currentId = useRoomStore((s) => s.currentSessionId);
  const currentModel = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId]?.model : undefined,
  );
  if (!open) return null;
  return (
    <div
      className="px-panel px-pop"
      style={{
        position: "absolute",
        top: 70,
        right: 12,
        width: 184,
        padding: 10,
      }}
    >
      <div className="px-title">💎 选择模型</div>
      {MODELS.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`px-row${m.id === currentModel ? " sel" : ""}`}
          onClick={() => {
            if (currentId)
              sendCommand({
                cmd: "setModel",
                sessionId: currentId,
                model: m.id,
              });
            toggle("modelOpen");
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
