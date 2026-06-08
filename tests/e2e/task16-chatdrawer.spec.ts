import { expect, test } from "@playwright/test";

const artifactPath = "tests/e2e/artifacts/task16/chat-drawer-desktop.png";

test("Task 16 chat drawer desktop visual", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "roguent:settings",
      JSON.stringify({
        accent: "#36c5e0",
        theme: "teal",
        motion: true,
        density: "comfy",
        cjkPixel: true,
        avatarHero: "knight_m",
      }),
    );
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "内景" }).click();
  await page.getByRole("button", { name: /聊天/ }).click();

  const drawer = page.locator(".cdrawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("permission");
  await expect(drawer).toContainText("sandbox");

  const box = await drawer.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440);

  await page.screenshot({ path: artifactPath, fullPage: false });
});
