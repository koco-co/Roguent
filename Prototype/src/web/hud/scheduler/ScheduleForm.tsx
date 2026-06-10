import { useMemo, useState } from "react";
import type { Session } from "../../../shared/domain";
import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeKind,
  SandboxMode,
} from "../../../shared/runtime";
import { defaultRuntimeConfig } from "../../../shared/runtime";
import type {
  SchedulerRecurrence,
  SchedulerTaskDraft,
} from "../../../shared/scheduler";
import { sendCommand } from "../../ws-client";

interface ScheduleFormProps {
  sessions: Session[];
  currentSessionId: string | null;
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildSchedule(
  recurrence: string,
  hourText: string,
  minuteText: string,
): SchedulerRecurrence {
  const hour = clamp(numberFromInput(hourText, 9), 0, 23);
  const minute = clamp(numberFromInput(minuteText, 0), 0, 59);
  if (recurrence === "weekly") {
    return { kind: "weekly", daysOfWeek: [1], hour, minute, timezone: "UTC" };
  }
  if (recurrence === "monthly") {
    return { kind: "monthly", dayOfMonth: 1, hour, minute, timezone: "UTC" };
  }
  if (recurrence === "once") {
    return { kind: "once", runAt: Date.now() + 60_000 };
  }
  return { kind: "daily", hour, minute, timezone: "UTC" };
}

export function ScheduleForm({
  sessions,
  currentSessionId,
}: ScheduleFormProps) {
  const firstSession = sessions[0];
  const initialSessionId = currentSessionId ?? firstSession?.id ?? "";
  const initialSession = sessions.find((s) => s.id === initialSessionId);
  const [title, setTitle] = useState("New scheduled task");
  const [prompt, setPrompt] = useState("Run the scheduled task.");
  const [cwd, setCwd] = useState(initialSession?.cwd ?? "");
  const [targetSessionId, setTargetSessionId] = useState(initialSessionId);
  const [runtime, setRuntime] = useState<RuntimeKind>(
    initialSession?.runtime ?? "codex",
  );
  const [model, setModel] = useState(initialSession?.model ?? "gpt-5");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium");
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("default");
  const [approvalPolicy, setApprovalPolicy] =
    useState<CodexApprovalPolicy>("on-request");
  const [sandboxMode, setSandboxMode] =
    useState<SandboxMode>("workspace-write");
  const [networkAccess, setNetworkAccess] = useState(true);
  const [recurrence, setRecurrence] = useState("daily");
  const [hour, setHour] = useState("9");
  const [minute, setMinute] = useState("0");

  const runtimeDefaults = useMemo(
    () => defaultRuntimeConfig(runtime),
    [runtime],
  );

  const canSubmit = title.trim() && prompt.trim() && targetSessionId;

  return (
    <form
      className="scheduler-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        const now = Date.now();
        const taskRuntime = {
          ...runtimeDefaults,
          runtime,
          model: model.trim() || runtimeDefaults.model,
          permissionMode,
          approvalPolicy,
          sandboxMode,
          reasoningEffort,
          networkAccess,
        };
        const task: SchedulerTaskDraft = {
          id: `task-${now.toString(36)}`,
          title: title.trim(),
          prompt: prompt.trim(),
          status: "enabled",
          createdAt: now,
          updatedAt: now,
          nextRunAt: null,
          cwd: cwd.trim(),
          runtime: taskRuntime,
          schedule: buildSchedule(recurrence, hour, minute),
          targetSessionId,
        };
        sendCommand({ cmd: "scheduler", action: "createTask", task });
      }}
    >
      <div className="scheduler-panel-title">Create Task</div>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Prompt
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label>
        Target
        <select
          value={targetSessionId}
          onChange={(e) => {
            const nextSession = sessions.find((s) => s.id === e.target.value);
            setTargetSessionId(e.target.value);
            if (nextSession?.cwd) setCwd(nextSession.cwd);
          }}
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        CWD
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} />
      </label>
      <div className="scheduler-form-grid">
        <label>
          Runtime
          <select
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as RuntimeKind)}
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          Reasoning
          <select
            value={reasoningEffort}
            onChange={(e) =>
              setReasoningEffort(e.target.value as ReasoningEffort)
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Approval
          <select
            value={approvalPolicy}
            onChange={(e) =>
              setApprovalPolicy(e.target.value as CodexApprovalPolicy)
            }
          >
            <option value="untrusted">Untrusted</option>
            <option value="on-failure">On failure</option>
            <option value="on-request">On request</option>
            <option value="never">Never</option>
          </select>
        </label>
        <label>
          Permission
          <select
            value={permissionMode}
            onChange={(e) =>
              setPermissionMode(e.target.value as PermissionMode)
            }
          >
            <option value="default">Default</option>
            <option value="acceptEdits">Accept edits</option>
            <option value="bypassPermissions">Bypass permissions</option>
            <option value="plan">Plan</option>
          </select>
        </label>
        <label>
          Sandbox
          <select
            value={sandboxMode}
            onChange={(e) => setSandboxMode(e.target.value as SandboxMode)}
          >
            <option value="read-only">Read only</option>
            <option value="workspace-write">Workspace write</option>
            <option value="danger-full-access">Danger full access</option>
          </select>
        </label>
        <label>
          Recurrence
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>
          Hour
          <input
            inputMode="numeric"
            value={hour}
            onChange={(e) => setHour(e.target.value)}
          />
        </label>
        <label>
          Minute
          <input
            inputMode="numeric"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
          />
        </label>
      </div>
      <label className="scheduler-checkbox">
        <input
          type="checkbox"
          checked={networkAccess}
          onChange={(e) => setNetworkAccess(e.target.checked)}
        />
        Network
      </label>
      <button type="submit" className="btn primary" disabled={!canSubmit}>
        Create
      </button>
    </form>
  );
}
