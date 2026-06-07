import { useEffect, useRef } from "react";

interface Props {
  commands: string[];
  filter: string;
  onSelect: (cmd: string) => void;
  onClose: () => void;
}

export function SlashMenu({ commands, filter, onSelect, onClose }: Props) {
  const filtered = commands.filter((c) =>
    c.toLowerCase().includes(filter.toLowerCase()),
  );
  const ref = useRef<HTMLDivElement>(null);

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="slash-menu glass scroll"
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: 160,
        overflowY: "auto",
        zIndex: 10,
        marginBottom: 4,
      }}
    >
      {filtered.map((cmd) => (
        <button
          key={cmd}
          type="button"
          className="slash-item px"
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: 12,
            padding: "5px 10px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text)",
            fontFamily: "monospace",
          }}
          onClick={() => onSelect(cmd)}
        >
          {cmd}
        </button>
      ))}
    </div>
  );
}
