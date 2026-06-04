import { expect, test } from "bun:test";
import { resolveEngineUrl } from "./engine-url";

test("纯浏览器(无 __TAURI__)回落固定 8787", async () => {
  expect(await resolveEngineUrl({ win: {} })).toBe("ws://localhost:8787");
});

test("Tauri 环境用 engine_url 命令返回的 url", async () => {
  const win = {
    __TAURI__: {
      core: {
        invoke: async (c: string) =>
          c === "engine_url" ? "ws://127.0.0.1:54321" : "",
      },
    },
  };
  expect(await resolveEngineUrl({ win })).toBe("ws://127.0.0.1:54321");
});

test("端口未就绪时退避重试,直到拿到 url", async () => {
  let calls = 0;
  const win = {
    __TAURI__: {
      core: {
        invoke: async () => {
          calls++;
          if (calls < 3) throw new Error("engine not ready");
          return "ws://127.0.0.1:60000";
        },
      },
    },
  };
  expect(await resolveEngineUrl({ win, retries: 5, delayMs: 0 })).toBe(
    "ws://127.0.0.1:60000",
  );
  expect(calls).toBe(3);
});

test("重试耗尽后抛出", async () => {
  const win = {
    __TAURI__: {
      core: {
        invoke: async () => {
          throw new Error("nope");
        },
      },
    },
  };
  expect(resolveEngineUrl({ win, retries: 2, delayMs: 0 })).rejects.toThrow(
    "engine_url unavailable after retries",
  );
});
