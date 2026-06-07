import { useState } from "react";
import type { TimelineToolItem } from "../../shared/domain";

const statusIcon = (s: TimelineToolItem["status"]) =>
  s === "running" ? "⋯" : s === "ok" ? "✓" : "✗";

export function ToolCard({ item }: { item: TimelineToolItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tool-card ${item.status}`} style={{ fontSize: 11 }}>
      <button
        type="button"
        className="tool-hd px"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
          padding: "4px 0",
          width: "100%",
          textAlign: "left",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: "var(--gold)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ opacity: 0.6 }}>{statusIcon(item.status)}</span>
        <span style={{ fontFamily: "monospace" }}>{item.toolName}</span>
        {!open && (
          <span
            className="faint"
            style={{
              marginLeft: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {item.inputSummary}
          </span>
        )}
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: "4px 8px",
            fontSize: 10,
            color: "var(--text)",
            opacity: 0.8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {item.inputSummary || "(no input)"}
        </pre>
      )}
    </div>
  );
}
