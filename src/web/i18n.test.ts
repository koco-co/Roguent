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
