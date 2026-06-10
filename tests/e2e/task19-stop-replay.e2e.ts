import { expect, test } from "@playwright/test";

test("Task 19 replay stop button returns composer to editable state", async ({
  page,
}) => {
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
  await page.goto("/");

  await page.getByRole("button", { name: "内景" }).click();
  await page.getByRole("button", { name: /聊天/ }).click();

  const composer = page.locator("textarea.pxinput");
  const stopButton = page.getByRole("button", { name: "停止" });

  await expect(stopButton).toBeVisible();
  await stopButton.click();

  await expect(page.getByRole("button", { name: "发送" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(composer).toBeEnabled();

  await composer.fill("stop 后继续输入");
  await expect(composer).toHaveValue("stop 后继续输入");
});
