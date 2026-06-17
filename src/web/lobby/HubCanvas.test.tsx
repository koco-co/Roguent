import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 模拟两个 atlas 加载器:默认成功,可在用例里切到 reject 触发 catch 分支。
// 不能缓存 rejected promise——HubCanvas 重试要能重新加载,故每次按 shouldFail 现算。
let shouldFail = true;
mock.module("./atlas-image", () => ({
  loadAtlasImage: () =>
    shouldFail
      ? Promise.reject(new Error("atlas image load failed: /assets/x.png"))
      : Promise.resolve({} as HTMLImageElement),
  drawFrame: () => {},
}));
mock.module("./atlas-dom", () => ({
  loadAtlasDom: () =>
    shouldFail
      ? Promise.reject(new Error("atlas json load failed"))
      : Promise.resolve({ frames: {}, imageUrl: "", w: 128, h: 1178 }),
}));
// paintHub 不在失败路径里跑;成功路径桩掉(无 canvas 2d ctx 时也安全)。
mock.module("./hub-paint", () => ({ paintHub: () => {} }));

const { HubCanvas } = await import("./HubCanvas");

beforeEach(() => {
  shouldFail = true;
});
afterEach(() => {
  cleanup();
});

test("atlas 加载失败时显示可见错误层(不再静默绿屏),含失败原因", async () => {
  render(<HubCanvas />);

  // 错误标题 + 具体原因都要可见
  expect(await screen.findByText("大厅贴图加载失败")).toBeTruthy();
  expect(
    await screen.findByText("atlas image load failed: /assets/x.png"),
  ).toBeTruthy();
});

test("点击重试后加载成功则错误层消失", async () => {
  render(<HubCanvas />);
  const retry = await screen.findByRole("button", { name: "重试" });

  // 重试这次让加载成功
  shouldFail = false;
  await userEvent.click(retry);

  await waitFor(() => {
    expect(screen.queryByText("大厅贴图加载失败")).toBeNull();
  });
});
