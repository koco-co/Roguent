import { useState } from "react";
import type { TimelineThinkingItem } from "../../shared/domain";

export function ThinkingBlock({ item }: { item: TimelineThinkingItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-hd px"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--gold)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>思考过程</span>
      </button>
      {open && (
        <div
          className="thinking-body scroll"
          style={{
            fontSize: 11,
            color: "var(--text)",
            opacity: 0.7,
            whiteSpace: "pre-wrap",
            padding: "4px 8px",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {item.text}
        </div>
      )}
    </div>
  );
}
