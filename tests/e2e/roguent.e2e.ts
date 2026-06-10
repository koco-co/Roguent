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

test("Feishu fake pairing", async ({ page }) => {
  const handle = await openReplay(
    page,
    "fixtures/integrations/feishu-pairing.jsonl",
  );

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Enter the session interior — fixture emits session.created for sessionId
    // "replay", which triggers the auto-focus and shows the "内景" button in
    // the lobby NPC card.
    await page.getByRole("button", { name: "内景" }).click();

    // Open the pairing panel via the Hotbar "配对" button.
    // The Hotbar is only visible in the interior view.
    await page.getByRole("button", { name: "配对" }).click();

    // The PairingPanel renders a <dialog aria-label="Pairing">.
    const panel = page.getByRole("dialog", { name: "Pairing" });
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // The WeChat tab is the default; click the Feishu tab to switch.
    // channelLabel("feishu") returns "飞书" (see PairingQr.tsx CHANNEL_COPY).
    const feishuTab = panel.getByRole("button", { name: "飞书" });
    await expect(feishuTab).toBeVisible();
    await feishuTab.click();
    await expect(feishuTab).toHaveAttribute("aria-pressed", "true");

    // Binding overwrite assertion: the fixture sends two pairing.binding.updated
    // events for the same externalChatId ("oc_group_1").  The store reducer
    // removes the first binding ("飞书群聊 (binding-a)") and keeps only the
    // latest (feishu-binding-b / "Li Mei (group)").  Assert exactly the final
    // display name is visible and the overwritten name is not.
    const bindingList = panel.locator(".pair-binding-list");
    await expect(bindingList).toBeVisible({ timeout: 8_000 });

    // Only the second binding's display name should appear.
    await expect(bindingList.getByText("Li Mei (group)")).toBeVisible();
    // The overwritten first binding's display name must NOT be present.
    await expect(
      bindingList.getByText("飞书群聊 (binding-a)"),
    ).not.toBeVisible();

    // The binding status badge should read "active".
    await expect(bindingList.locator(".pair-status.active")).toBeVisible();

    // Close the pairing panel before opening the chat drawer —
    // the modal scrim blocks pointer events to the Hotbar underneath.
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 4_000 });

    // The inbound message text lands in the session timeline via the chat drawer.
    // Open the chat drawer to verify the Feishu inbound message is present.
    await page.getByRole("button", { name: /聊天/ }).click();
    const drawer = page.locator(".cdrawer");
    await expect(drawer).toBeVisible();
    // The fixture's inbound bodyText is "请检查飞书长连接任务" (exact user message).
    await expect(
      drawer.getByText("请检查飞书长连接任务", { exact: true }),
    ).toBeVisible({
      timeout: 8_000,
    });

    // Screenshot evidence.
    const dir = await artifactDir("task52");
    await page.screenshot({
      path: `${dir}/feishu-pairing.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});

test("WeChat fake pairing", async ({ page }) => {
  const handle = await openReplay(
    page,
    "fixtures/integrations/wechat-pairing.jsonl",
  );

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Enter the session interior — fixture emits session.created for sessionId
    // "replay", which triggers the auto-focus and shows the "内景" button in
    // the lobby NPC card.
    await page.getByRole("button", { name: "内景" }).click();

    // Open the pairing panel via the Hotbar "配对" button (mcp icon, label "配对").
    // The Hotbar is only visible in the interior view.
    await page.getByRole("button", { name: "配对" }).click();

    // The PairingPanel renders a <dialog aria-label="Pairing">.
    const panel = page.getByRole("dialog", { name: "Pairing" });
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // The WeChat tab (label "微信") should be present and selected by default —
    // PairingPanel initialises channel state to "wechat".
    const wechatTab = panel.getByRole("button", { name: "微信" });
    await expect(wechatTab).toBeVisible();
    await expect(wechatTab).toHaveAttribute("aria-pressed", "true");

    // Binding overwrite assertion: the fixture sends two pairing.binding.updated
    // events for the same externalChatId ("wx-group-fake-9900").  The store
    // reducer removes the first binding (binding-a / "Test User (chat-a)") and
    // keeps only the latest (binding-b / "Test User").  Assert exactly one
    // binding row is visible and it carries the final display name.
    const bindingList = panel.locator(".pair-binding-list");
    await expect(bindingList).toBeVisible({ timeout: 8_000 });

    // Only the second binding's display name should appear.
    await expect(bindingList.getByText("Test User")).toBeVisible();
    // The overwritten first binding's display name must NOT be present.
    await expect(bindingList.getByText("Test User (chat-a)")).not.toBeVisible();

    // The binding status badge should read "active".
    await expect(bindingList.locator(".pair-status.active")).toBeVisible();

    // Close the pairing panel before opening the chat drawer —
    // the modal scrim blocks pointer events to the Hotbar underneath.
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 4_000 });

    // The inbound message text lands in the session timeline via the chat drawer.
    // Open the chat drawer to verify the WeChat inbound message is present.
    await page.getByRole("button", { name: /聊天/ }).click();
    const drawer = page.locator(".cdrawer");
    await expect(drawer).toBeVisible();
    // The fixture's inbound bodyText is "请帮我检查一下最新的 PR" (exact user message).
    await expect(
      drawer.getByText("请帮我检查一下最新的 PR", { exact: true }),
    ).toBeVisible({
      timeout: 8_000,
    });

    // Screenshot evidence.
    const dir = await artifactDir("task51");
    await page.screenshot({
      path: `${dir}/wechat-pairing.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});

test("GitHub and X subscription routing", async ({ page }) => {
  const handle = await openReplay(
    page,
    "fixtures/integrations/subscription-routing.jsonl",
  );

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Enter the session interior — fixture emits session.created for sessionId
    // "replay", which auto-focuses and shows the "内景" button in the lobby NPC card.
    await page.getByRole("button", { name: "内景" }).click();

    // Open the Mailbox panel via the Hotbar "信箱" button (vault icon, label "信箱").
    // Scope to .hotbar to avoid the identically-labelled lobby interactable button.
    await page.locator(".hotbar").getByRole("button", { name: "信箱" }).click();

    // The MailboxPanel renders inside a Modal with class .mailbox-panel.
    const mailboxPanel = page.locator(".mailbox-panel");
    await expect(mailboxPanel).toBeVisible({ timeout: 8_000 });

    // Assert the GitHub mailbox item is present — InboxItemRow renders:
    // - .inbox-source > span with "GitHub" (SOURCE_LABELS.github)
    // - .inbox-title with the item title
    // - .inbox-summary with the item summary text
    const githubRow = mailboxPanel
      .locator(".inbox-row")
      .filter({ hasText: "GitHub" })
      .first();
    await expect(githubRow).toBeVisible({ timeout: 8_000 });

    // The GitHub source label renders "GitHub" from SOURCE_LABELS in InboxItemRow.
    await expect(githubRow.locator(".inbox-source span")).toHaveText("GitHub");

    // Summary mentions the push commit and repo.
    await expect(githubRow.locator(".inbox-summary")).toContainText(
      "poco/roguent",
    );

    // The GitHub item is routed to the auto-created session "github-auto-session".
    // The sessionTitle prop passed to InboxItemRow is sessions["github-auto-session"]?.title
    // → "GitHub push: poco/roguent → main". It renders in .inbox-meta as a <span>.
    await expect(githubRow.locator(".inbox-meta")).toContainText(
      "GitHub push: poco/roguent → main",
    );

    // Assert the X mailbox item is present.
    const xRow = mailboxPanel
      .locator(".inbox-row")
      .filter({ hasText: "X" })
      .filter({ hasText: "@roguent" })
      .first();
    await expect(xRow).toBeVisible({ timeout: 8_000 });

    // The X source label renders "X" from SOURCE_LABELS in InboxItemRow.
    await expect(xRow.locator(".inbox-source span")).toHaveText("X");

    // Summary mentions @roguent.
    await expect(xRow.locator(".inbox-summary")).toContainText("@roguent");

    // The auto-created session title "GitHub push: poco/roguent → main" should appear
    // somewhere in the panel (shown in the GitHub row's inbox-meta).
    await expect(mailboxPanel).toContainText(
      "GitHub push: poco/roguent → main",
    );

    // Screenshot artifact for Task 53.
    const dir = await artifactDir("task53");
    await page.screenshot({
      path: `${dir}/subscription-routing.png`,
      fullPage: false,
    });
  } finally {
    handle.cleanup();
  }
});
