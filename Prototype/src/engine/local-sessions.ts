import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { LocalSessionMeta } from "../shared/local-sessions";

export function defaultProjectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function readTranscriptLines(path: string): unknown[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* 跳过坏行 */
    }
  }
  return out;
}

function firstUserText(lines: unknown[]): string {
  for (const l of lines) {
    const o = l as { type?: string; message?: { content?: unknown } };
    if (o?.type === "user" && typeof o.message?.content === "string") {
      return o.message.content.slice(0, 80);
    }
  }
  return "";
}

export function listLocalSessions(
  root = defaultProjectsRoot(),
): LocalSessionMeta[] {
  if (!existsSync(root)) return [];
  const out: LocalSessionMeta[] = [];
  for (const project of readdirSync(root)) {
    const dir = join(root, project);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(dir, f);
      const lines = readTranscriptLines(path);
      if (lines.length === 0) continue;
      out.push({
        project,
        sessionId: basename(f, ".jsonl"),
        path,
        mtime: statSync(path).mtimeMs,
        firstMessage: firstUserText(lines),
        msgCount: lines.length,
      });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
