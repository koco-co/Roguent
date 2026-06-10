// scripts/generate-verification-report.test.ts
// Tests for the pure buildVerificationReport() core — no I/O, no Date.now.

import { describe, expect, it } from "bun:test";
import {
  type E2ESummary,
  type ReportInputs,
  type SmokeArtifact,
  type StaticCheckSummary,
  type UnitTestSummary,
  buildVerificationReport,
} from "./generate-verification-report";

// ---------------------------------------------------------------------------
// Sample fixtures (deterministic — no Date.now)
// ---------------------------------------------------------------------------

const FIXED_TS = "2026-06-10T12:00:00.000Z";

const smokeCodex: SmokeArtifact = {
  target: "codex-app-server",
  mode: "app-server",
  status: "passed",
  observedEvents: ["thread.started", "turn.completed"],
  blockers: [],
  version: "codex-cli 0.133.0",
  notes: "Sent prompt; interrupted after collecting events.",
  ranAtMs: 1781074072579,
};

const smokeWechat: SmokeArtifact = {
  target: "wechat-pairing",
  mode: "bun-sdk",
  status: "blocked",
  observedEvents: ["pairing.qr"],
  blockers: [
    {
      stage: "bun-sdk.scan.timeout",
      reason:
        "QR not scanned within 10000ms; no phone available in smoke environment",
    },
  ],
  notes: "QR URL was produced. Scan with a real phone to advance to passed.",
  ranAtMs: 1781075242386,
};

const smokeX: SmokeArtifact = {
  target: "x-webhook",
  mode: "local-crc+signed-fixture",
  status: "passed",
  observedEvents: ["crc.passed", "delivery.accepted"],
  blockers: [
    {
      stage: "x-api.credentials",
      reason:
        "Real X Account Activity API not exercised — missing env vars. X Premium entitlement required.",
    },
  ],
  notes: "CRC + local-signed verification passed; real X API not exercised.",
  ranAtMs: 1781076063470,
};

const smokeGithub: SmokeArtifact = {
  target: "github-webhook",
  mode: "local-signed-fixture",
  status: "passed",
  observedEvents: ["delivery.accepted", "inbox.item.created"],
  blockers: [],
  ranAtMs: 1781075801448,
};

const smokeFeishu: SmokeArtifact = {
  target: "feishu-long-connection",
  mode: "none",
  status: "blocked",
  observedEvents: [],
  blockers: [
    {
      stage: "config",
      reason:
        "Feishu appId/appSecret not configured. Set FEISHU_APP_ID + FEISHU_APP_SECRET.",
    },
  ],
  notes: "No credentials found in env or keychain.",
  ranAtMs: 1781075536630,
};

const staticChecks: StaticCheckSummary[] = [
  { tool: "bun run check (biome)", status: "passed", detail: "0 errors" },
  { tool: "bunx tsc --noEmit", status: "passed", detail: "0 errors" },
  { tool: "bun run typecheck:e2e", status: "not-captured-this-run" },
  { tool: "bun run build", status: "passed", detail: "dist/ written" },
];

const unitTest: UnitTestSummary = {
  status: "passed",
  total: 676,
  passed: 676,
  failed: 0,
  skipped: 0,
};

const e2eSummary: E2ESummary = {
  status: "passed",
  total: 11,
  passed: 11,
  failed: 0,
  scope: "replay E2E (offline, zero-quota)",
  detail: "Playwright chromium, fixture replay only",
};

function makeInputs(overrides?: Partial<ReportInputs>): ReportInputs {
  return {
    smokeArtifacts: [smokeCodex, smokeWechat, smokeX, smokeGithub, smokeFeishu],
    staticChecks,
    unitTest,
    e2e: e2eSummary,
    generatedAt: FIXED_TS,
    projectSlug: "roguent-full-prototype",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildVerificationReport", () => {
  it("returns a non-empty string", () => {
    const report = buildVerificationReport(makeInputs());
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
  });

  it("includes the project slug in the header", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("roguent-full-prototype");
  });

  it("includes the fixed timestamp", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain(FIXED_TS);
  });

  // Static checks section
  it("renders static check section with all tools", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("## 1. Static Checks");
    expect(report).toContain("bun run check (biome)");
    expect(report).toContain("bunx tsc --noEmit");
    expect(report).toContain("bun run build");
  });

  it("shows PASSED for passing static checks and not-captured for uncaptured", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("PASSED");
    expect(report).toContain("not-captured-this-run");
  });

  // Unit test section
  it("renders unit test section with counts", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("## 2. Unit Tests");
    expect(report).toContain("total: 676");
    expect(report).toContain("passed: 676");
  });

  // Replay E2E section — must be explicitly labeled as offline/zero-quota
  it("has a clearly labeled replay E2E section separate from smoke", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("## 3. Replay E2E");
    expect(report).toContain("Offline");
    expect(report).toContain("Zero-Quota");
  });

  it("replay E2E section explicitly states no real API calls", () => {
    const report = buildVerificationReport(makeInputs());
    // Find the replay section content
    const replayIdx = report.indexOf("## 3. Replay E2E");
    const smokeIdx = report.indexOf("## 4. Real External Smoke");
    const replaySection = report.slice(replayIdx, smokeIdx);
    expect(replaySection).toContain("No real external API calls");
    expect(replaySection).toContain("DISTINCT");
  });

  it("renders E2E counts", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("total: 11");
    expect(report).toContain("replay E2E (offline, zero-quota)");
  });

  // Real External Smoke section
  it("has a clearly labeled real external smoke section", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("## 4. Real External Smoke Tests");
  });

  it("renders all 5 smoke targets", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("codex-app-server");
    expect(report).toContain("wechat-pairing");
    expect(report).toContain("x-webhook");
    expect(report).toContain("github-webhook");
    expect(report).toContain("feishu-long-connection");
  });

  // Blocked smokes must NOT be shown as passed
  it("renders wechat as BLOCKED, not PASSED", () => {
    const report = buildVerificationReport(makeInputs());
    const wechatIdx = report.indexOf("wechat-pairing");
    const nextTargetIdx = report.indexOf("###", wechatIdx + 1);
    const wechatSection = report.slice(
      wechatIdx,
      nextTargetIdx > wechatIdx ? nextTargetIdx : undefined,
    );
    expect(wechatSection).toContain("BLOCKED");
    expect(wechatSection).not.toContain("PASSED");
  });

  it("renders feishu as BLOCKED, not PASSED", () => {
    const report = buildVerificationReport(makeInputs());
    const feishuIdx = report.indexOf("feishu-long-connection");
    const nextTargetIdx = report.indexOf("###", feishuIdx + 1);
    const feishuSection = report.slice(
      feishuIdx,
      nextTargetIdx > feishuIdx ? nextTargetIdx : undefined,
    );
    expect(feishuSection).toContain("BLOCKED");
    expect(feishuSection).not.toContain("PASSED");
  });

  // X webhook: local passed but real API NOT exercised — must be annotated
  it("annotates x-webhook passed as local-only, not real external", () => {
    const report = buildVerificationReport(makeInputs());
    const xIdx = report.indexOf("x-webhook");
    const nextIdx = report.indexOf("###", xIdx + 1);
    const xSection = report.slice(xIdx, nextIdx > xIdx ? nextIdx : undefined);
    // Must contain "PASSED" (it did pass locally)
    expect(xSection).toContain("PASSED");
    // But must annotate that real API was NOT exercised
    expect(xSection).toContain("NOT exercised");
    expect(xSection).toContain("x-api.credentials");
  });

  // Blocker reasons must appear
  it("includes wechat scan timeout reason", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("QR not scanned within 10000ms");
  });

  it("includes feishu config blocker reason", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("FEISHU_APP_ID");
  });

  it("includes x real-api blocker reason", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("X Premium entitlement required");
  });

  // Unverified / Blockers summary section
  it("has an unverified/blockers summary section", () => {
    const report = buildVerificationReport(makeInputs());
    expect(report).toContain("## 5. Unverified / Blockers Summary");
  });

  it("summary section lists the external smoke blockers", () => {
    const report = buildVerificationReport(makeInputs());
    const summaryIdx = report.indexOf("## 5. Unverified / Blockers Summary");
    const summarySection = report.slice(summaryIdx);
    expect(summarySection).toContain("wechat-pairing");
    expect(summarySection).toContain("feishu-long-connection");
    expect(summarySection).toContain("x-webhook");
  });

  it("not-captured-this-run items appear in summary", () => {
    const report = buildVerificationReport(makeInputs());
    const summaryIdx = report.indexOf("## 5. Unverified / Blockers Summary");
    const summarySection = report.slice(summaryIdx);
    expect(summarySection).toContain("bun run typecheck:e2e");
  });

  // Test with not-captured unit/e2e
  it("shows not-captured placeholder when unit test not provided", () => {
    const report = buildVerificationReport(
      makeInputs({ unitTest: { status: "not-captured-this-run" } }),
    );
    const unitIdx = report.indexOf("## 2. Unit Tests");
    const e2eIdx = report.indexOf("## 3. Replay E2E");
    const unitSection = report.slice(unitIdx, e2eIdx);
    expect(unitSection).toContain("not-captured-this-run");
    expect(unitSection).not.toContain("total:");
  });

  it("shows not-captured placeholder when e2e not provided", () => {
    const report = buildVerificationReport(
      makeInputs({ e2e: { status: "not-captured-this-run" } }),
    );
    expect(report).toContain("not-captured-this-run");
  });

  // Report must not overclaim: empty smoke array → no smoke data, say so
  it("handles empty smoke array gracefully", () => {
    const report = buildVerificationReport(makeInputs({ smokeArtifacts: [] }));
    expect(report).toContain("No smoke artifacts found");
  });

  // github-webhook passed (genuine, no blockers) must not get the local-only annotation
  it("renders github-webhook as PASSED without local-only annotation", () => {
    const report = buildVerificationReport(makeInputs());
    const ghIdx = report.indexOf("github-webhook");
    const nextIdx = report.indexOf("###", ghIdx + 1);
    const ghSection = report.slice(
      ghIdx,
      nextIdx > ghIdx ? nextIdx : undefined,
    );
    expect(ghSection).toContain("PASSED");
    // Should not have the "NOT exercised" annotation since there are no API blockers
    expect(ghSection).not.toContain("NOT exercised");
  });

  // Determinism: same inputs → same output
  it("is deterministic for the same inputs", () => {
    const inputs = makeInputs();
    const r1 = buildVerificationReport(inputs);
    const r2 = buildVerificationReport(inputs);
    expect(r1).toBe(r2);
  });
});
