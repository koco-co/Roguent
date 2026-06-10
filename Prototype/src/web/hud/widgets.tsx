import type { ReactNode } from "react";

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

/** Friendly short label for a model id. */
export function shortModel(id?: string): string {
  if (!id) return "—";
  if (id.includes("opus")) return "Opus";
  if (id.includes("sonnet")) return "Sonnet";
  if (id.includes("haiku")) return "Haiku";
  return id;
}
