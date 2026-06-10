import type { Session } from "../../shared/domain";

export function runtimeLabel(session: Session | undefined): string {
  return session?.runtime === "codex" ? "Codex" : "Claude";
}

export function runtimeIconName(
  session: Session | undefined,
): "claude" | "codex" {
  return session?.runtime === "codex" ? "codex" : "claude";
}

export function runtimeTagClass(session: Session | undefined): string {
  return session?.runtime === "codex" ? "tag-codex" : "tag-claude";
}

export function runtimeModeTag(session: Session | undefined): string | null {
  const status = session?.runtimeStatus;
  if (!status) return null;
  const mode = status.metadata?.mode;
  if (mode === "exec-json") return "Batch";
  if (status.status === "degraded") return "Degraded";
  return null;
}

export function runtimeMetaText(session: Session | undefined): string {
  const parts = [runtimeLabel(session)];
  const mode = runtimeModeTag(session);
  if (mode) parts.push(mode);
  return parts.join(" · ");
}
