import type { Loot } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";

const KIND_ICON: Record<Loot["kind"], IconName> = {
  file: "read",
  diff: "write",
  report: "quest",
  answer: "chat",
};

// Stable reference: returning a fresh `[]` from a Zustand selector makes
// useSyncExternalStore see a new snapshot every render → infinite loop.
const EMPTY_LOOT: readonly Loot[] = [];

/** The backpack: artifacts (loot) the session has produced. */
export function LootPanel() {
  const open = useUiStore((s) => s.lootOpen);
  const loot = useRoomStore((s) => {
    const sess = s.currentSessionId
      ? s.sessions[s.currentSessionId]
      : undefined;
    return sess?.loot ?? EMPTY_LOOT;
  });
  if (!open) return null;
  return (
    <div
      className="px-panel px-pop px-scroll"
      style={{
        position: "absolute",
        left: 12,
        bottom: 130,
        width: 240,
        maxHeight: 320,
        padding: 12,
      }}
    >
      <div
        className="px-title"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <Icon name="pouch" size={14} />
        战利品 · {loot.length}
      </div>
      {loot.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 11 }}>暂无掉落</div>
      ) : (
        [...loot].reverse().map((l) => (
          <div
            key={l.id}
            className="px-row"
            style={{ cursor: "default", display: "flex", gap: 8 }}
          >
            <Icon name={KIND_ICON[l.kind]} size={16} />
            <span style={{ fontSize: 11, wordBreak: "break-all" }}>
              {l.label}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
