import { useRef, useState } from "react";
import type { ImageAttachment } from "../../shared/commands";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";
import { SlashMenu } from "./SlashMenu";
import {
  IMAGE_ATTACHMENT_MEDIA_TYPES,
  MAX_IMAGE_ATTACHMENTS,
  type ReadAttachmentResult,
  attachmentDataUrl,
  readImageAttachment,
} from "./attachments";

// 固定快捷回复(照 Prototype panels2.jsx:474/696)。点击即走真实发送路径,
// 不造消息;文案入 DICT 双语(键为中文,英文在 i18n.ts)。
const QUICK_REPLIES = [
  "继续",
  "先跑测试再合并",
  "给我看 diff",
  "解释一下思路",
] as const;

// <input accept> 列表 = B4 支持的 4 类图片;与 attachments.ts 的校验同源。
const ACCEPT = IMAGE_ATTACHMENT_MEDIA_TYPES.join(",");

type ReadAttachment = (file: File) => Promise<ReadAttachmentResult>;

interface ComposerProps {
  sessionId: string;
  // 测试注入点:把 File → ImageAttachment 的读取/校验换成可控 fake(默认走真实
  // FileReader)。生产永远用默认值。
  readAttachment?: ReadAttachment;
}

export function Composer({
  sessionId,
  readAttachment = readImageAttachment,
}: ComposerProps) {
  const t = useT();
  const session = useRoomStore((s) => s.sessions[sessionId]);
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = session?.status === "busy";

  // 把一批 File 读成附件:逐个校验类型/大小,超出 MAX_IMAGE_ATTACHMENTS 的丢弃并报数量上限。
  const ingestFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setAttachError(null);
    // 先按剩余名额裁剪,数量超限给一次提示。
    setAttachments((prev) => {
      if (prev.length >= MAX_IMAGE_ATTACHMENTS)
        setAttachError(t("最多 4 张图片"));
      return prev;
    });
    for (const file of files) {
      const result = await readAttachment(file);
      if (!result.ok) {
        setAttachError(
          result.reason === "size"
            ? t("图片过大(上限 4MB)")
            : t("不支持的图片类型"),
        );
        continue;
      }
      const attachment = result.attachment;
      setAttachments((prev) => {
        if (prev.length >= MAX_IMAGE_ATTACHMENTS) {
          setAttachError(t("最多 4 张图片"));
          return prev;
        }
        return [...prev, attachment];
      });
    }
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    void ingestFiles(Array.from(list));
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // 真实发送:把指定文本走与输入框相同的 sendMessage 命令路径(快捷回复用,无附件)。
  const sendText = (raw: string) => {
    const trimmed = raw.trim();
    if (sessionId && trimmed) {
      sendCommand({ cmd: "sendMessage", sessionId, text: trimmed });
    }
  };

  const send = () => {
    const trimmed = text.trim();
    const hasAttachments = attachments.length > 0;
    if (!sessionId || (!trimmed && !hasAttachments)) return;
    sendCommand({
      cmd: "sendMessage",
      sessionId,
      text: trimmed,
      ...(hasAttachments ? { attachments } : {}),
    });
    setText("");
    setAttachments([]);
    setAttachError(null);
  };

  const canSend = text.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className="cdrawer-composer"
      onDragOver={(e) => {
        // 仅在拖拽含文件时拦截,避免抢走文本拖拽。
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) {
          e.preventDefault();
          void ingestFiles(files);
        }
      }}
    >
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
      {attachments.length > 0 && (
        <div className="cdrawer-attachments" aria-label="Attachments">
          {attachments.map((att, i) => (
            <span className="cmsg-attach" key={`${att.name}-${i}`}>
              <img
                className="cmsg-attach-thumb"
                src={attachmentDataUrl(att)}
                alt={att.name}
              />
              <span className="cmsg-attach-name cjk">{att.name}</span>
              <button
                type="button"
                className="cmsg-attach-x"
                aria-label={`${t("移除")} ${att.name}`}
                title={t("移除")}
                onClick={() => removeAttachment(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {attachError && (
        <div
          className="cdrawer-attach-error cjk"
          data-testid="composer-attach-error"
          role="alert"
        >
          {attachError}
        </div>
      )}
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
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          data-testid="composer-file-input"
          style={{ display: "none" }}
          onChange={(e) => {
            onPickFiles(e.target.files);
            // 允许再次选同一文件:重置输入值。
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="pxbtn sm cjk"
          aria-label={t("添加图片")}
          title={t("添加图片")}
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          🖼
        </button>
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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length > 0) {
              e.preventDefault();
              void ingestFiles(files);
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
            disabled={!canSend}
          >
            {t("发送")}
          </button>
        )}
      </div>
    </div>
  );
}
