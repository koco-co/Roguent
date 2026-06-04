import { expect, test } from "bun:test";
import { atlasErrorText } from "./atlas";

test("atlasErrorText returns the Error message", () => {
  expect(atlasErrorText(new Error("fetch failed: 404"))).toBe(
    "fetch failed: 404",
  );
});

test("atlasErrorText coerces non-Error values to string", () => {
  expect(atlasErrorText("network timeout")).toBe("network timeout");
  expect(atlasErrorText(42)).toBe("42");
  expect(atlasErrorText(null)).toBe("null");
});
