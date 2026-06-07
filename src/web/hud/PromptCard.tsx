import type {
  PermissionPromptData,
  QuestionData,
  TimelinePromptItem,
} from "../../shared/domain";
import { sendCommand } from "../ws-client";

interface Props {
  item: TimelinePromptItem;
  sessionId: string;
}

export function PromptCard({ item, sessionId }: Props) {
  if (item.status !== "pending") {
    return (
      <div className="prompt-card resolved px faint" style={{ fontSize: 11 }}>
        {item.status === "answered" ? "✓ 已回答" : "✕ 已忽略"}
      </div>
    );
  }

  if (item.promptKind === "permission") {
    const data = item.data as PermissionPromptData;
    return (
      <div className="prompt-card permission glass">
        <div
          className="prompt-title px"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          {data.title ?? `允许使用 ${data.toolName}？`}
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
            onClick={() =>
              sendCommand({
                cmd: "respondPermission",
                sessionId,
                promptId: item.id,
                behavior: "allow",
              })
            }
          >
            允许
          </button>
          <button
            type="button"
            className="pxbtn sm cjk"
            onClick={() =>
              sendCommand({
                cmd: "respondPermission",
                sessionId,
                promptId: item.id,
                behavior: "deny",
              })
            }
          >
            拒绝
          </button>
        </div>
      </div>
    );
  }

  // kind === "question"
  const data = item.data as QuestionData;
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
                onClick={() =>
                  sendCommand({
                    cmd: "respondQuestion",
                    sessionId,
                    promptId: item.id,
                    selectedLabels: [opt.label],
                  })
                }
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
