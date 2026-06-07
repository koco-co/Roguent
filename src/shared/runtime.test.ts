import { expect, test } from "bun:test";
import { createSession } from "./domain";
import { defaultRuntimeConfig, normalizePermissionMode } from "./runtime";

test("session stores runtime metadata", () => {
  const session = createSession({
    id: "s-codex",
    title: "Codex task",
    model: "gpt-5",
    runtime: "codex",
    cwd: "/tmp/project",
  });

  expect(session.runtime).toBe("codex");
  expect(session.cwd).toBe("/tmp/project");
  expect(session.permissionMode).toBe(
    defaultRuntimeConfig("codex").permissionMode,
  );
});

test("normalizePermissionMode accepts only Claude SDK permission modes", () => {
  expect(normalizePermissionMode("plan")).toBe("plan");
  expect(normalizePermissionMode("acceptEdits")).toBe("acceptEdits");
  expect(normalizePermissionMode("bypassPermissions")).toBe(
    "bypassPermissions",
  );
  expect(normalizePermissionMode("ask", "plan")).toBe("plan");
  expect(normalizePermissionMode(undefined, "acceptEdits")).toBe("acceptEdits");
});
