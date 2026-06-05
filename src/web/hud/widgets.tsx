import type { CSSProperties, ReactNode } from "react";

/** A key/value row used inside the info / agent panels. */
export function StatRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 11,
        padding: "5px 0",
        borderBottom: "1px solid #ffffff12",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}

/** A pixel-framed square icon button. When `pos` is provided the button is
 *  absolutely positioned (legacy scatter layout); when omitted it renders as
 *  an inline flow element (used inside `.px-hotbar` / `.px-dock`). */
export function IconButton({
  icon,
  title,
  lit,
  onClick,
  pos,
}: {
  icon: string;
  title: string;
  lit?: boolean;
  onClick?: () => void;
  pos?: CSSProperties;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`px-btn px-icon${lit ? " lit" : ""}`}
      style={pos ? { position: "absolute", ...pos } : undefined}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/** Friendly short label for a model id. */
export function shortModel(id?: string): string {
  if (!id) return "—";
  if (id.includes("opus")) return "Opus";
  if (id.includes("sonnet")) return "Sonnet";
  if (id.includes("haiku")) return "Haiku";
  return id;
}
