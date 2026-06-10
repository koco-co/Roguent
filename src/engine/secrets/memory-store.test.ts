import { expect, test } from "bun:test";
import { MemorySecretStore } from "./memory-store";
import type { SecretStore } from "./types";

test("stores, overwrites, and deletes secrets by ref", async () => {
  const store: SecretStore = new MemorySecretStore();

  await store.put("github:token", "first");
  expect(await store.get("github:token")).toBe("first");

  await store.put("github:token", "second");
  expect(await store.get("github:token")).toBe("second");

  await store.delete("github:token");
  expect(await store.get("github:token")).toBeUndefined();
});

test("lists only refs matching a prefix in deterministic order", async () => {
  const store = new MemorySecretStore();

  await store.put("linear:token", "lin-secret");
  await store.put("github:workspace-b", "gh-b-secret");
  await store.put("github:workspace-a", "gh-a-secret");

  expect(await store.listRefs("github:")).toEqual([
    "github:workspace-a",
    "github:workspace-b",
  ]);
  expect(await store.listRefs("missing:")).toEqual([]);
});
