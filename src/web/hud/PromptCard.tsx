import { useEffect, useState } from "react";
import type {
  PermissionPromptData,
  QuestionData,
  TimelinePromptItem,
} from "../../shared/domain";
import { useT, useTL } from "../i18n";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";

interface Props {
  item: TimelinePromptItem;
  sessionId: string;
}

export function PromptCard({ item, sessionId }: Props) {
  const t = useT();
  const tl = useTL();
  const [submitted, setSubmitted] = useState(false);
  const errorSignal = useRoomStore((state) => {
    const session = state.sessions[sessionId];
    if (!session || session.status !== "error") return "";
    for (let i = session.timeline.length - 1; i >= 0; i -= 1) {
      const entry = session.timeline[i];
      if (entry?.kind === "message" && entry.role === "system") {
        return `${entry.id}:${entry.ts}:${entry.text}`;
      }
    }
    return "";
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: errorSignal 是失败后重试的复位触发器, effect 内只需检查 prompt 是否仍 pending。
  useEffect(() => {
    if (item.status === "pending") setSubmitted(false);
  }, [errorSignal, item.status]);

  if (item.status !== "pending") {
    return (
      <div className="prompt-card resolved px faint" style={{ fontSize: 11 }}>
        {item.status === "answered" ? t("✓ 已回答") : t("✕ 已忽略")}
      </div>
    );
  }

  if (item.promptKind === "permission") {
    const data = item.data as PermissionPromptData;
    const respond = (behavior: "allow" | "deny") => {
      if (submitted) return;
      setSubmitted(true);
      sendCommand({
        cmd: "respondPermission",
        sessionId,
        promptId: item.id,
        behavior,
      });
    };
    return (
      <div className="prompt-card permission glass">
        <div
          className="prompt-title px"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          {data.title ??
            tl(`允许使用 ${data.toolName}？`, `Allow ${data.toolName}?`)}
        </div>
        {data.description && (
          <div className="prompt-desc px faint" style={{ fontSize: 11 }}>
            {data.description}
          </div>
        )}
        {data.inputSummary && (
          <div
            className="prompt-summary px"
            style={{ fontSize: 11, fontFamily: "monospace" }}
          >
            {data.inputSummary}
          </div>
        )}
        <div
          className="prompt-actions"
          style={{ display: "flex", gap: 6, padding: "6px 8px" }}
        >
          <button
            type="button"
            className="pxbtn primary sm cjk"
            disabled={submitted}
            onClick={() => respond("allow")}
          >
            {t("允许")}
          </button>
          <button
            type="button"
            className="pxbtn sm cjk"
            disabled={submitted}
            onClick={() => respond("deny")}
          >
            {t("拒绝")}
          </button>
        </div>
      </div>
    );
  }

  // kind === "question"
  const data = item.data as QuestionData;
  const respondQuestion = (selectedLabels: string[]) => {
    if (submitted) return;
    setSubmitted(true);
    sendCommand({
      cmd: "respondQuestion",
      sessionId,
      promptId: item.id,
      selectedLabels,
    });
  };
  return (
    <div className="prompt-card question glass">
      {data.questions.map((q, qi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: questions 顺序固定
        <div key={qi} style={{ marginBottom: 10 }}>
          <div
            className="px"
            style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}
          >
            {q.question}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "0 8px",
            }}
          >
            {q.options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="pxbtn sm cjk"
                title={opt.description}
                disabled={submitted}
                onClick={() => respondQuestion([opt.label])}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
