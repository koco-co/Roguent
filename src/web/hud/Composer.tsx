import { useState } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";
import { SlashMenu } from "./SlashMenu";

export function Composer({ sessionId }: { sessionId: string }) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const isBusy = session?.status === "busy";

  const send = () => {
    const trimmed = text.trim();
    if (sessionId && trimmed) {
      sendCommand({ cmd: "sendMessage", sessionId, text: trimmed });
      setText("");
    }
  };

  // / 菜单 = 命令(有命令文件)+ 技能(SDK init 的 skills,如 /brainstorming)。
  // 技能名规整成带前导 /,按规整后字符串去重(/code-review 可能既是命令又是技能)。
  // 在 render 体里合并,不进 selector(守 zustand selector 铁律)。
  const slashItems = Array.from(
    new Set([
      ...(session?.slashCommands ?? []),
      ...(session?.skills ?? []).map((s) => (s.startsWith("/") ? s : `/${s}`)),
    ]),
  );

  return (
    <div className="cdrawer-input" style={{ position: "relative" }}>
      {slashOpen && slashItems.length > 0 ? (
        <SlashMenu
          commands={slashItems}
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
  );
}
