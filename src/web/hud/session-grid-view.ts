import type { SessionStatus } from "../../shared/domain";
import type { RuntimeKind } from "../../shared/runtime";

/** SessionGrid 排序/过滤所需的最小会话视图(Session 的子集,便于单测)。 */
export interface GridSession {
  id: string;
  project?: string;
  model: string;
  runtime: RuntimeKind;
  status: SessionStatus;
  lastActiveAt: number;
}

/** 距最后活跃的分钟数 → "3h ago";null/负数 → ""。(对标设计 agoLabel) */
export function agoLabel(minutes: number | null): string {
  if (minutes == null || minutes < 0) return "";
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

// 状态权重:error(要处理)最前 → busy → idle → done。(设计含 askuser:0;本仓库无 askuser 状态)
const STATUS_W: Record<SessionStatus, number> = {
  error: 0,
  busy: 1,
  idle: 2,
  done: 3,
};

/** 状态权重升序,同权重按 lastActiveAt 降序(新的在前)。不就地排序。 */
export function sortSessions<T extends GridSession>(
  list: T[],
  _now: number,
): T[] {
  return [...list].sort((a, b) => {
    const wa = STATUS_W[a.status] ?? 99;
    const wb = STATUS_W[b.status] ?? 99;
    return wa - wb || b.lastActiveAt - a.lastActiveAt;
  });
}

export interface SessionFilters {
  rt: "all" | RuntimeKind;
  projects: string[];
  models: string[];
  activeOnly: boolean;
}

/** 活跃 = busy 或 error(等同设计的 active/askuser/error;本仓库无 askuser)。 */
const ACTIVE: SessionStatus[] = ["busy", "error"];

export function applySessionFilters<T extends GridSession>(
  list: T[],
  f: SessionFilters,
): T[] {
  return list.filter(
    (s) =>
      (f.rt === "all" || (s.runtime ?? "claude") === f.rt) &&
      (!f.projects.length || f.projects.includes(s.project ?? "")) &&
      (!f.models.length || f.models.includes(s.model)) &&
      (!f.activeOnly || ACTIVE.includes(s.status)),
  );
}

export function hasAnyFilter(f: SessionFilters): boolean {
  return (
    f.rt !== "all" ||
    f.projects.length > 0 ||
    f.models.length > 0 ||
    f.activeOnly
  );
}
