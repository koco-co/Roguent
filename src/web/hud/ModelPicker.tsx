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
  if (!open) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 66,
        right: 12,
        background: "#101c2e",
        border: "2px solid #ffd166",
        borderRadius: 12,
        padding: 10,
      }}
    >
      {MODELS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            if (currentId)
              sendCommand({
                cmd: "setModel",
                sessionId: currentId,
                model: m.id,
              });
            toggle("modelOpen");
          }}
          style={{
            display: "block",
            width: 160,
            textAlign: "left",
            marginBottom: 6,
            padding: 8,
            borderRadius: 8,
            background: "#13243b",
            border: "1px solid #2a4a5e",
            color: "#d7e6ef",
            cursor: "pointer",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
