import { defineConfig, devices } from "@playwright/test";

const webPort = 5173;
const enginePort = 8787;
const replayFixture = "fixtures/sample-run.jsonl";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      name: "engine-replay",
      command: `bun run dev:engine -- --replay ${replayFixture}`,
      port: enginePort,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "vite",
      command: "bun run dev:web -- --host 127.0.0.1",
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
