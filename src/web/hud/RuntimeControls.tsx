import type { Session } from "../../shared/domain";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeConfig,
  SandboxMode,
} from "../../shared/runtime";
import { useRoomStore } from "../store";
import { sendCommand } from "../ws-client";
import { modelLabel } from "./model-label";
import { runtimeLabel, runtimeTagClass } from "./runtime-display";

const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
] as const satisfies readonly PermissionMode[];
const CODEX_APPROVAL_POLICIES = [
  "untrusted",
  "on-failure",
  "on-request",
  "never",
] as const satisfies readonly CodexApprovalPolicy[];
const SANDBOX_MODES = [
  "read-only",
  "workspace-write",
  "danger-full-access",
] as const satisfies readonly SandboxMode[];
const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

function configFor(session: Session): RuntimeConfig {
  return {
    runtime: session.runtime,
    model: session.model,
    permissionMode: session.permissionMode,
    ...(session.approvalPolicy
      ? { approvalPolicy: session.approvalPolicy }
      : {}),
    sandboxMode: session.sandboxMode,
    ...(session.reasoningEffort
      ? { reasoningEffort: session.reasoningEffort }
      : {}),
    networkAccess: session.networkAccess,
  };
}

function sendConfigPatch(
  sessionId: string,
  session: Session,
  patch: Partial<RuntimeConfig>,
) {
  sendCommand({
    cmd: "setRuntimeConfig",
    sessionId,
    config: { ...configFor(session), ...patch },
  });
}

export function RuntimeControls({ sessionId }: { sessionId: string }) {
  const session = useRoomStore((s) => s.sessions[sessionId]);

  if (!session) return null;
  const isCodex = session.runtime === "codex";

  return (
    <div
      className="px"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.3fr)",
        gap: 6,
        padding: "8px 10px 6px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div
        className={`chip ${runtimeTagClass(session)}`}
        title={session.runtime}
        style={{ justifyContent: "center", minWidth: 0 }}
      >
        {runtimeLabel(session)}
      </div>
      <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span className="faint" style={{ fontSize: 9 }}>
          model
        </span>
        <input
          key={`${session.id}:${session.model}`}
          aria-label="model"
          className="pxinput"
          defaultValue={session.model}
          title={session.model}
          onBlur={(e) => {
            const model = e.currentTarget.value.trim();
            if (model && model !== session.model) {
              sendConfigPatch(sessionId, session, { model });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          style={{ fontSize: 10, minWidth: 0 }}
        />
      </label>
      <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span className="faint" style={{ fontSize: 9 }}>
          permission
        </span>
        <select
          aria-label="permission"
          className="pxselect"
          value={session.permissionMode}
          onChange={(e) =>
            sendConfigPatch(sessionId, session, {
              permissionMode: e.target.value as PermissionMode,
            })
          }
        >
          {PERMISSION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span className="faint" style={{ fontSize: 9 }}>
          sandbox
        </span>
        <select
          aria-label="sandbox"
          className="pxselect"
          value={session.sandboxMode}
          onChange={(e) =>
            sendConfigPatch(sessionId, session, {
              sandboxMode: e.target.value as SandboxMode,
            })
          }
        >
          {SANDBOX_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      {isCodex && (
        <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span className="faint" style={{ fontSize: 9 }}>
            approval
          </span>
          <select
            aria-label="approval policy"
            className="pxselect"
            value={session.approvalPolicy ?? "on-request"}
            onChange={(e) =>
              sendConfigPatch(sessionId, session, {
                approvalPolicy: e.target.value as CodexApprovalPolicy,
              })
            }
          >
            {CODEX_APPROVAL_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
        </label>
      )}
      {isCodex && (
        <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span className="faint" style={{ fontSize: 9 }}>
            reasoning
          </span>
          <select
            aria-label="reasoning effort"
            className="pxselect"
            value={session.reasoningEffort ?? "medium"}
            onChange={(e) =>
              sendConfigPatch(sessionId, session, {
                reasoningEffort: e.target.value as ReasoningEffort,
              })
            }
          >
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      )}
      <label
        style={{
          display: "flex",
          gap: 6,
          alignItems: "end",
          minWidth: 0,
          paddingBottom: 2,
        }}
      >
        <input
          aria-label="network access"
          type="checkbox"
          checked={session.networkAccess}
          onChange={(e) =>
            sendConfigPatch(sessionId, session, {
              networkAccess: e.currentTarget.checked,
            })
          }
        />
        <span className="faint" style={{ fontSize: 10 }}>
          network
        </span>
      </label>
      <div className="faint" style={{ alignSelf: "end", fontSize: 10 }}>
        {modelLabel(session.model)}
      </div>
    </div>
  );
}
