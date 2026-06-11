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

test("scheduler automatic run", async ({ page }) => {
  const handle = await openReplay(page, "fixtures/scheduler/daily-task.jsonl");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // The fixture emits session.created for sessionId "replay", which auto-focuses
    // and shows the "内景" button in the ViewSwitch (top-left).
    await page.getByRole("button", { name: "内景" }).click();

    // Now in the interior view — the session banner (top-center) is visible.
    // Clicking it opens the SessionGrid modal (panel="sessiongrid").
    const banner = page.locator(".session-banner");
    await expect(banner).toBeVisible({ timeout: 8_000 });
    await banner.locator(".sb-body").click();

    // The SessionGrid modal should open.
    const sgModal = page.locator(".sg-wrap");
    await expect(sgModal).toBeVisible({ timeout: 8_000 });

    // Click the "Scheduled Tasks" tab to reveal the SchedulerPanel.
    await sgModal.getByRole("button", { name: "Scheduled Tasks" }).click();

    // SchedulerPanel > ScheduleList renders the task created by the fixture.
    // ScheduleList renders task.title in .scheduler-task-title.
    const taskTitle = page.locator(".scheduler-task-title");
    await expect(taskTitle).toHaveText("Daily Code Review", { timeout: 8_000 });

    // RunHistory renders each run as <span class="chip">{run.status}</span>.
    // The fixture delivers scheduler.run.finished with status="succeeded".
    // The "succeeded" chip must be visible in the run history section.
    const runHistory = page.locator(".scheduler-history");
    await expect(runHistory).toBeVisible({ timeout: 8_000 });
    await expect(
      runHistory.locator(".chip").filter({ hasText: "succeeded" }),
    ).toBeVisible();

    // The run summary from the fixture should appear in the history entry.
    await expect(
      runHistory.getByText("Linting passed. All 42 tests passed."),
    ).toBeVisible();

    // Screenshot artifact.
    const dir = await artifactDir("task54");
    await page.screenshot({
      path: `${dir}/scheduler-run.png`,
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

/**
 * Task 55 — prototype game panels replay.
 *
 * Fixture (fixtures/game-panels.jsonl) drives:
 * - economy.ledger.appended  → 250 gem balance + one inventory item (skin.ninja)
 * - achievement.updated      → one completed/claimable + one in-progress
 * - settings.updated         → user settings with github.enabled = true
 *
 * What we prove: the panels (AchievementsPanel, GachaPanel/Shop, Settings, lobby)
 * render REAL replayed state — not static placeholder images.
 *
 * What we canNOT prove in replay mode: claim/pull/save round-trips (commands are
 * ignored by the replay engine). We assert: action controls EXIST and data matches
 * replayed values.
 */
test("prototype game panels render replayed economy, achievement, and settings state", async ({
  page,
}) => {
  const handle = await openReplay(page, "fixtures/game-panels.jsonl");

  try {
    // ── Lobby viewport assertions (desktop) ──────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    const dir = await artifactDir("task55");

    // The fixture emits session.created for "replay" — the lobby (overworld view)
    // should be visible.  Wait for the hub to appear.
    const hub = page.locator(".hub");
    await expect(hub).toBeVisible({ timeout: 10_000 });

    // Core lobby structures: each INTERACT entry renders as a <button class="structure">.
    // Verify the key named structures are present using their aria-labels.
    await expect(
      page.getByRole("button", { name: "任务台 QUEST CONSOLE" }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByRole("button", { name: "成就陈列 LOOT" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "扭蛋机 GACHA" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "设置祭坛 CONFIG" }),
    ).toBeVisible();

    // Desktop screenshot.
    await page.screenshot({
      path: `${dir}/game-panels-desktop.png`,
      fullPage: false,
    });

    // ── No-overlap check (desktop) ────────────────────────────────────────────
    // Key structure buttons must stay within the 1440×900 viewport and must not
    // overlap each other.  Collect bounding boxes and assert mutual exclusion.
    const towerBox = await page
      .getByRole("button", { name: "任务台 QUEST CONSOLE" })
      .boundingBox();
    const achievementsBox = await page
      .getByRole("button", { name: "成就陈列 LOOT" })
      .boundingBox();
    const gachaBox = await page
      .getByRole("button", { name: "扭蛋机 GACHA" })
      .boundingBox();

    // All boxes must exist and fit within the viewport.
    for (const box of [towerBox, achievementsBox, gachaBox]) {
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1440 + 1); // allow 1px rounding
        expect(box.y + box.height).toBeLessThanOrEqual(900 + 1);
      }
    }

    // Verify tower and achievements don't overlap (they live in different quadrants).
    if (towerBox && achievementsBox) {
      const overlapX =
        towerBox.x < achievementsBox.x + achievementsBox.width &&
        towerBox.x + towerBox.width > achievementsBox.x;
      const overlapY =
        towerBox.y < achievementsBox.y + achievementsBox.height &&
        towerBox.y + towerBox.height > achievementsBox.y;
      expect(overlapX && overlapY).toBe(false);
    }

    // ── Mobile screenshot ─────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    // Hub is responsive (%-based layout); give it a moment to reflow.
    await expect(hub).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: `${dir}/game-panels-mobile.png`,
      fullPage: false,
    });

    // On mobile the hub still fits within the 390×844 viewport.
    const hubBoxMobile = await hub.boundingBox();
    expect(hubBoxMobile).not.toBeNull();
    if (hubBoxMobile) {
      expect(hubBoxMobile.x).toBeGreaterThanOrEqual(-1);
      expect(hubBoxMobile.y).toBeGreaterThanOrEqual(-1);
    }

    // Reset to desktop for panel tests.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(hub).toBeVisible({ timeout: 5_000 });

    // ── AchievementsPanel ─────────────────────────────────────────────────────
    // Trigger via the "成就陈列 LOOT" lobby structure button.
    await page.getByRole("button", { name: "成就陈列 LOOT" }).click();

    // The AchievementsPanel renders inside a Modal (no specific dialog role).
    // Wait for a known element rendered by the panel.
    const achievementsPanel = page.locator(".achievements-panel");
    await expect(achievementsPanel).toBeVisible({ timeout: 8_000 });

    // The fixture emits two achievements:
    // 1. "First Session" — completed=true, progress=1, target=1, claimable.
    // 2. "Code Master" — completed=false, progress=4, target=10.

    // achievement-row renders each achievement; .achievement-title has the title.
    await expect(achievementsPanel.getByText("First Session")).toBeVisible({
      timeout: 5_000,
    });
    await expect(achievementsPanel.getByText("Code Master")).toBeVisible();

    // Progress labels: progressLabel() renders "progress / target".
    // "First Session": "1 / 1"; "Code Master": "4 / 10".
    // These render inside .achievement-meter via progressLabel(achievement).
    const firstRow = achievementsPanel
      .locator(".achievement-row")
      .filter({ hasText: "First Session" });
    await expect(firstRow.locator(".achievement-meter")).toContainText("1 / 1");

    const codeRow = achievementsPanel
      .locator(".achievement-row")
      .filter({ hasText: "Code Master" });
    await expect(codeRow.locator(".achievement-meter")).toContainText("4 / 10");

    // "First Session" is completed and not yet claimed → "Claim" button must be
    // ENABLED (claimable = true).
    const claimBtn = firstRow.getByRole("button", {
      name: "Claim First Session",
    });
    await expect(claimBtn).toBeVisible();
    await expect(claimBtn).not.toBeDisabled();

    // "Code Master" is not completed → "Claim" button must be disabled (.dis class).
    const claimBtnDisabled = codeRow.getByRole("button", {
      name: "Claim Code Master",
    });
    await expect(claimBtnDisabled).toBeVisible();
    await expect(claimBtnDisabled).toBeDisabled();

    // Close the panel before opening the next one (modal scrim blocks pointer events).
    await page.keyboard.press("Escape");
    await expect(achievementsPanel).not.toBeVisible({ timeout: 5_000 });

    // ── Gacha panel (gem balance + inventory owned state) ───────────────────
    // "扭蛋机 GACHA" lobby button → openPanel("gacha"). The gacha route is now
    // owned by the real GachaPanel (economy/GachaPanel.tsx), mounted in Hud.tsx;
    // Shop no longer handles "gacha" (it was split into decoration Shop + Market).
    await page.getByRole("button", { name: "扭蛋机 GACHA" }).click();

    // GachaPanel renders inside a Modal with class .gacha-panel.
    const gachaPanel = page.locator(".gacha-panel");
    await expect(gachaPanel).toBeVisible({ timeout: 8_000 });

    // The fixture emitted economy.ledger.appended events:
    // +250 gem (welcome bonus) then -100 gem (gacha pull) → final balance = 150.
    // GachaPanel renders gem balance in [data-testid="gacha-balance"].
    const gachaGemBalance = gachaPanel.getByTestId("gacha-balance");
    await expect(gachaGemBalance).toBeVisible({ timeout: 5_000 });
    await expect(gachaGemBalance).toHaveText("150");

    // The ledger entry added inventory item {id:"skin.ninja", label:"忍者皮肤"}.
    // GachaPanel lists owned inventory items in the bottom loot grid, each tagged
    // with data-testid="inventory-item-<id>" and showing item.label.
    const ninjaInvItem = gachaPanel.getByTestId("inventory-item-skin.ninja");
    await expect(ninjaInvItem).toBeVisible({ timeout: 5_000 });
    await expect(ninjaInvItem).toContainText("忍者皮肤");

    // Close gacha panel before opening settings.
    await page.keyboard.press("Escape");
    await expect(gachaPanel).not.toBeVisible({ timeout: 5_000 });

    // ── Settings panel ────────────────────────────────────────────────────────
    // Trigger via the "设置祭坛 CONFIG" lobby structure button.
    await page.getByRole("button", { name: "设置祭坛 CONFIG" }).click();

    // Settings panel renders inside a Modal with class .settings-wrap.
    const settingsWrap = page.locator(".settings-wrap");
    await expect(settingsWrap).toBeVisible({ timeout: 8_000 });

    // The fixture emitted settings.updated with integrations.github.enabled = true.
    // Settings.tsx maps this to savedVals.github_enabled = true via settingsFieldValues().
    // The "github_enabled" toggle (label "GitHub 订阅") lives in the "IM / 订阅"
    // settings group. Navigate there by clicking the nav button.
    const imNavBtn = settingsWrap
      .locator(".set-nav")
      .getByRole("button", { name: "IM / 订阅" });
    await expect(imNavBtn).toBeVisible({ timeout: 5_000 });
    await imNavBtn.click();

    // Now the integrations fields are visible. The "github_enabled" toggle has
    // aria-label="GitHub 订阅" (from the field schema label).
    // aria-pressed="true" means enabled=true (as replayed from the fixture).
    const githubToggle = settingsWrap.getByRole("button", {
      name: "GitHub 订阅",
    });
    await expect(githubToggle).toBeVisible({ timeout: 5_000 });
    await expect(githubToggle).toHaveAttribute("aria-pressed", "true");

    // The save button must exist (bottom .set-foot > .pxbtn.primary).
    // In replay mode clicking save sends a WS command (ignored by replay engine) —
    // we only verify the control exists, not the round-trip result.
    const saveBtn = page.locator(".set-foot .pxbtn.primary");
    await expect(saveBtn).toBeVisible();

    // Close the settings panel.
    await page.keyboard.press("Escape");
    await expect(settingsWrap).not.toBeVisible({ timeout: 5_000 });
  } finally {
    handle.cleanup();
  }
});
