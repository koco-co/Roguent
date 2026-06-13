import { useState } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";
import { SlashMenu } from "./SlashMenu";

// 固定快捷回复(照 Prototype panels2.jsx:474/696)。点击即走真实发送路径,
// 不造消息;文案入 DICT 双语(键为中文,英文在 i18n.ts)。
const QUICK_REPLIES = [
  "继续",
  "先跑测试再合并",
  "给我看 diff",
  "解释一下思路",
] as const;

export function Composer({ sessionId }: { sessionId: string }) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const isBusy = session?.status === "busy";

  // 真实发送:把指定文本走与输入框相同的 sendMessage 命令路径。
  const sendText = (raw: string) => {
    const trimmed = raw.trim();
    if (sessionId && trimmed) {
      sendCommand({ cmd: "sendMessage", sessionId, text: trimmed });
    }
  };

  const send = () => {
    const trimmed = text.trim();
    if (sessionId && trimmed) {
      sendText(trimmed);
      setText("");
    }
  };

  return (
    <div className="cdrawer-composer">
      <div className="cdrawer-quick" aria-label="Quick replies">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            className="cquick cjk"
            disabled={isBusy}
            onClick={() => sendText(q)}
          >
            {t(q)}
          </button>
        ))}
      </div>
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
          placeholder={t("输入消息… (Enter 发送, Shift+Enter 换行)")}
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
            {t("停止")}
          </button>
        ) : (
          <button
            type="button"
            className="pxbtn primary sm cjk"
            onClick={send}
            disabled={!text.trim()}
          >
            {t("发送")}
          </button>
        )}
      </div>
    </div>
  );
}
