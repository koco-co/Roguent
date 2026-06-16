import { expect, test } from "bun:test";
import { translate } from "./i18n";

test("cn 模式原样返回", () => {
  expect(translate("进入", "cn")).toBe("进入");
});
test("en 模式查字典", () => {
  expect(translate("进入", "en")).toBe("Enter");
  expect(translate("在岗", "en")).toBe("On duty");
});
test("字典外字符串原样返回(产品术语/未收录)", () => {
  expect(translate("Claude", "en")).toBe("Claude");
  expect(translate("某个没收录的句子", "en")).toBe("某个没收录的句子");
});
test("动态前缀:进入 X", () => {
  expect(translate("进入 roguent · 大厅重构", "en")).toBe(
    "Enter roguent · 大厅重构",
  );
});

test("sweep B 关键串 en 翻译", () => {
  // modal subtitles
  expect(translate("订阅 · 用量", "en")).toBe("Plan · usage");
  expect(translate("今日公告板 · 未读告警", "en")).toBe(
    "Today's board · unread alerts",
  );
  // AgentCard / NpcCard
  expect(translate("类型", "en")).toBe("Type");
  expect(translate("召唤中", "en")).toBe("Spawning");
  expect(translate("上下文压缩阈值", "en")).toBe(
    "Context compaction threshold",
  );
  // Tasks / Leaderboard / LootPanel
  expect(translate("选择一个待办", "en")).toBe("Select a to-do");
  expect(translate("暂无会话", "en")).toBe("No sessions yet");
  expect(translate("会话工件", "en")).toBe("Session artifacts");
  // SessionGrid status + ErrorOverlay
  expect(translate("活跃", "en")).toBe("Active");
  expect(translate("runtime 离线", "en")).toBe("runtime offline");
  // GachaPanel / ModelPicker
  expect(translate("余额不足", "en")).toBe("Insufficient balance");
  expect(translate("最强推理 · 1M 上下文", "en")).toBe(
    "Top reasoning · 1M context",
  );
  // half-width colon key must match (ImportPanel)
  expect(translate("扫描到的本地 Claude Code 项目:", "en")).toBe(
    "Local Claude Code projects found:",
  );
});

test("artpack 组关键串 en 翻译", () => {
  expect(translate("美术风格 Art Style", "en")).toBe("Art Style");
  expect(
    translate(
      "选择一款美术风格包后会进入预览，确认无误再应用——大厅、内景、NPC、道具与按钮 UI 会切换到对应素材（自动保存）。",
      "en",
    ),
  ).toBe(
    "Preview an art pack before applying it. The lobby, interiors, NPCs, props, and button UI switch to that asset set and save automatically.",
  );
  expect(translate("像素奇幻", "en")).toBe("Pixel Fantasy");
  expect(translate("合成波", "en")).toBe("Synthwave Grid");
  expect(translate("✓ 使用中", "en")).toBe("✓ In use");
  expect(translate("确认切换", "en")).toBe("Confirm switch");
  expect(translate("SOURCE SHEETS / 素材", "en")).toBe("SOURCE SHEETS");
  expect(translate("NPCS / 角色", "en")).toBe("NPCS");
  expect(translate("TILES / 地块", "en")).toBe("TILES");
  expect(translate("PROPS / 道具", "en")).toBe("PROPS");
  expect(translate("STRUCTURES / 结构", "en")).toBe("STRUCTURES");
  expect(translate("HUD / 图标", "en")).toBe("HUD");
  expect(translate("EASTER / 彩蛋", "en")).toBe("EASTER");
  expect(translate("BUTTON UI / 按钮", "en")).toBe("BUTTON UI");
  expect(translate("CRT 扫描线 · 磷光青绿 · 赛博命令行界面", "en")).toBe(
    "CRT scanlines · phosphor cyan · cyber command line",
  );
});
