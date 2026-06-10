/**
 * Consolidated E2E spec — Task 48 onwards.
 * Each test uses openReplay() so it gets a dedicated engine replaying its
 * own fixture on an ephemeral port.  Legacy task16-19 specs remain on the
 * global 8787 engine and are unaffected.
 */
import { expect, test } from "@playwright/test";
import { artifactDir, openReplay } from "./helpers";

test("Codex chat replay shows assistant, tool, runtime controls, and reasoning effort", async ({
  page,
}) => {
  const handle = await openReplay(page, "fixtures/runtime/codex-chat.jsonl");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate into a session interior and open the chat drawer —
    // mirrors what task16-19 do with the global engine.
    await page.getByRole("button", { name: "内景" }).click();
    await page.getByRole("button", { name: /聊天/ }).click();

    // The chat drawer should be open.
    const drawer = page.locator(".cdrawer");
    await expect(drawer).toBeVisible();

    // RuntimeControls renders the runtime chip — for codex runtime it says "Codex".
    // The chip lives inside .cdrawer, class "chip tag-codex".
    await expect(drawer.locator(".tag-codex")).toBeVisible({ timeout: 8_000 });

    // The tool card from the fixture ("shell") should appear in the timeline.
    // ToolCard renders item.toolName in a monospace span.
    await expect(drawer.getByText("shell")).toBeVisible({ timeout: 8_000 });

    // RuntimeControls also renders permission/sandbox selects — these must exist.
    await expect(drawer.getByLabel("permission")).toBeVisible();
    await expect(drawer.getByLabel("sandbox")).toBeVisible();

    // Codex-specific: reasoning effort select (aria-label="reasoning effort").
    // This control is only rendered when isCodex === true (see RuntimeControls.tsx).
    // The fixture sets reasoningEffort: "medium" so the select should be visible.
    await expect(drawer.getByLabel("reasoning effort")).toBeVisible();

    // Screenshot artifact (satisfies both Task 48 and Task 50 artifact requirements)
    const dir = await artifactDir("task48-task50");
    await page.screenshot({
      path: `${dir}/codex-replay-chat.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});

test("Claude chat replay", async ({ page }) => {
  const handle = await openReplay(page, "fixtures/runtime/claude-chat.jsonl");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate into a session interior and open the chat drawer.
    await page.getByRole("button", { name: "内景" }).click();
    await page.getByRole("button", { name: /聊天/ }).click();

    // The chat drawer should be open.
    const drawer = page.locator(".cdrawer");
    await expect(drawer).toBeVisible();

    // RuntimeControls renders the runtime chip — for Claude runtime the class
    // is "chip tag-claude" and the text label is "Claude"
    // (see runtime-display.ts: runtimeTagClass → "tag-claude", runtimeLabel → "Claude").
    await expect(drawer.locator(".tag-claude")).toBeVisible({ timeout: 8_000 });

    // The assistant message from the fixture should appear in the timeline.
    // fixture line 3: message.delta text "I'll help you with that. Let me run the tests first."
    await expect(
      drawer.getByText("I'll help you with that. Let me run the tests first."),
    ).toBeVisible({ timeout: 8_000 });

    // The tool card from the fixture — toolName "Bash" — renders in a monospace span
    // inside ToolCard (see ToolCard.tsx: <span style={{ fontFamily: "monospace" }}>{item.toolName}</span>).
    await expect(drawer.getByText("Bash")).toBeVisible({ timeout: 8_000 });

    // RuntimeControls renders permission/sandbox selects for Claude sessions too.
    await expect(drawer.getByLabel("permission")).toBeVisible();
    await expect(drawer.getByLabel("sandbox")).toBeVisible();

    // Screenshot artifact
    const dir = await artifactDir("task49");
    await page.screenshot({
      path: `${dir}/claude-replay-chat.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});
