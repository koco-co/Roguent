import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  type KeychainCommand,
  KeychainCommandFailure,
  KeychainSecretStore,
  buildKeychainCommand,
  describeKeychainCommand,
} from "./keychain";

const SECRET = "secret-value-that-must-not-appear";
const INDEX_ACCOUNT = "__roguent_secret_index__";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function accountArg(command: { args: string[] }): string {
  const index = command.args.indexOf("-a");
  if (index === -1) throw new Error("missing account arg");
  return command.args[index + 1] ?? "";
}

function promptValue(command: { stdin?: string }): string {
  expect(command.stdin).toBeString();
  const lines = command.stdin?.split("\n");
  expect(lines).toHaveLength(3);
  expect(lines?.[0]).toBe(lines?.[1]);
  expect(lines?.[2]).toBe("");
  return lines?.[0] ?? "";
}

function legacyOrPromptValue(command: { stdin?: string }): string {
  const lines = command.stdin?.split("\n") ?? [];
  if (lines.length === 3 && lines[0] === lines[1] && lines[2] === "") {
    return lines[0] ?? "";
  }
  if (lines.length === 2 && lines[1] === "") return lines[0] ?? "";
  throw new Error("invalid stdin prompt");
}

test("put command passes password and retype through stdin and not command args", () => {
  const command = buildKeychainCommand({
    operation: "put",
    service: "Roguent Test Secrets",
    ref: "github:token",
    value: SECRET,
  });

  expect(command.path).toBe("/usr/bin/security");
  expect(command.args).toContain("add-generic-password");
  expect(command.args.at(-1)).toBe("-w");
  const password = promptValue(command);
  expect(password.length).toBe(SECRET.length);
  expect(digest(password)).toBe(digest(SECRET));
  expect(JSON.stringify(command.args)).not.toContain(SECRET);

  const safeDescriptor = describeKeychainCommand(command);
  expect(JSON.stringify(safeDescriptor)).not.toContain(SECRET);
  expect(JSON.stringify(safeDescriptor)).not.toContain("github:token");
  expect(safeDescriptor).toMatchInlineSnapshot(`
    {
      "args": [
        "add-generic-password",
        "-U",
        "-s",
        "Roguent Test Secrets",
        "-a",
        "[redacted]",
        "-w",
      ],
      "path": "/usr/bin/security",
      "stdin": "present",
    }
  `);
});

test("get, delete, and list commands never include secret values", () => {
  for (const operation of ["get", "delete", "listIndex"] as const) {
    const command = buildKeychainCommand({
      operation,
      service: "Roguent Test Secrets",
      ref: "github:token",
    });

    expect(command.path).toBe("/usr/bin/security");
    expect(JSON.stringify(command.args)).not.toContain(SECRET);
    expect(command.stdin).toBeUndefined();
  }
});

test("safe command descriptors redact arbitrary refs", () => {
  const unsafeRef = "literal-secret-token-value";
  const command = buildKeychainCommand({
    operation: "get",
    service: "Roguent Test Secrets",
    ref: unsafeRef,
  });

  expect(JSON.stringify(command.args)).toContain(unsafeRef);
  expect(JSON.stringify(describeKeychainCommand(command))).not.toContain(
    unsafeRef,
  );
});

test("get strips the command-added line ending and preserves interior data", async () => {
  const value = "first-line\nsecond-line";
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async () => `${value}\r\n`,
  });

  expect(await store.get("github:token")).toBe(value);
});

test("store uses injected runner and never accesses the system keychain in tests", async () => {
  const commands: ReturnType<typeof describeKeychainCommand>[] = [];
  const stored = new Map<string, string>();
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async (command) => {
      commands.push(describeKeychainCommand(command));
      const account = accountArg(command);
      if (!account) throw new Error("missing account");
      if (command.args[0] === "find-generic-password") {
        const value = stored.get(account);
        if (value == null) throw new KeychainCommandFailure(44);
        return `${value}\n`;
      }
      if (command.args[0] === "add-generic-password") {
        stored.set(account, promptValue(command));
        return "";
      }
      if (command.args[0] === "delete-generic-password") {
        stored.delete(account);
        return "";
      }
      throw new Error(`unexpected command ${command.args[0]}`);
    },
  });

  await store.put("github:token", SECRET);

  expect(await store.get("github:token")).toBe(SECRET);
  expect(await store.listRefs("github:")).toEqual(["github:token"]);

  await store.delete("github:token");

  expect(await store.get("github:token")).toBeUndefined();
  expect(await store.listRefs("github:")).toEqual([]);
  expect(JSON.stringify(commands)).not.toContain(SECRET);
});

test("keychain errors include operation but not raw refs or secret values", async () => {
  const unsafeRef = "literal-secret-token-value";
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async () => {
      throw new Error(`native failure with ${SECRET}`);
    },
  });

  await expect(store.put(unsafeRef, SECRET)).rejects.toThrow(
    "keychain put failed",
  );
  await expect(store.put(unsafeRef, SECRET)).rejects.not.toThrow(unsafeRef);
  await expect(store.put(unsafeRef, SECRET)).rejects.not.toThrow(SECRET);
});

test("concurrent puts preserve both refs in the keychain index", async () => {
  const stored = new Map<string, string>();
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async (command) => {
      const account = accountArg(command);
      if (command.args[0] === "find-generic-password") {
        const snapshot = stored.get(account);
        if (account === INDEX_ACCOUNT) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (snapshot == null) throw new KeychainCommandFailure(44);
        return `${snapshot}\n`;
      }
      if (command.args[0] === "add-generic-password") {
        stored.set(account, legacyOrPromptValue(command));
        return "";
      }
      if (command.args[0] === "delete-generic-password") {
        stored.delete(account);
        return "";
      }
      throw new Error(`unexpected command ${command.args[0]}`);
    },
  });

  await Promise.all([
    store.put("github:a", "secret-a"),
    store.put("github:b", "secret-b"),
  ]);

  expect(await store.listRefs("github:")).toEqual(["github:a", "github:b"]);
});

test("concurrent puts across store instances preserve both refs for the same service", async () => {
  const stored = new Map<string, string>();
  const run = async (command: KeychainCommand) => {
    const account = accountArg(command);
    if (command.args[0] === "find-generic-password") {
      const snapshot = stored.get(account);
      if (account === INDEX_ACCOUNT) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (snapshot == null) throw new KeychainCommandFailure(44);
      return `${snapshot}\n`;
    }
    if (command.args[0] === "add-generic-password") {
      stored.set(account, legacyOrPromptValue(command));
      return "";
    }
    if (command.args[0] === "delete-generic-password") {
      stored.delete(account);
      return "";
    }
    throw new Error(`unexpected command ${command.args[0]}`);
  };

  const firstStore = new KeychainSecretStore({
    service: "Roguent Shared Test Secrets",
    run,
  });
  const secondStore = new KeychainSecretStore({
    service: "Roguent Shared Test Secrets",
    run,
  });

  await Promise.all([
    firstStore.put("github:a", "secret-a"),
    secondStore.put("github:b", "secret-b"),
  ]);

  expect(await firstStore.listRefs("github:")).toEqual([
    "github:a",
    "github:b",
  ]);
});
