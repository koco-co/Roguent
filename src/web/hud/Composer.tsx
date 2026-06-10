import { useState } from "react";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";
import { SlashMenu } from "./SlashMenu";

export function Composer({ sessionId }: { sessionId: string }) {
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const isBusy = session?.status === "busy";

  const send = () => {
    const t = text.trim();
    if (sessionId && t) {
      sendCommand({ cmd: "sendMessage", sessionId, text: t });
      setText("");
    }
  };

  return (
    <div className="cdrawer-input" style={{ position: "relative" }}>
      {slashOpen && (session?.slashCommands?.length ?? 0) > 0 ? (
        <SlashMenu
          commands={session!.slashCommands}
          filter={text.slice(1)}
          onSelect={(cmd) => {
            setText(`${cmd} `);
            setSlashOpen(false);
          }}
          onClose={() => setSlashOpen(false)}
        />
      ) : null}
      <textarea
        className="pxinput"
        rows={1}
        value={text}
        disabled={isBusy}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          setSlashOpen(val.startsWith("/"));
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
        style={{ resize: "none", overflowY: "auto" }}
      />
      {isBusy ? (
        <button
          type="button"
          className="pxbtn sm cjk"
          style={{ color: "var(--red, #e05)" }}
          onClick={() =>
            sessionId && sendCommand({ cmd: "interrupt", sessionId })
          }
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          className="pxbtn primary sm cjk"
          onClick={send}
          disabled={!text.trim()}
        >
          发送
        </button>
      )}
    </div>
  );
}
