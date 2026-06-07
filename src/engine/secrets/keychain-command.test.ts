import { expect, test } from "bun:test";
import {
  KeychainCommandFailure,
  KeychainSecretStore,
  buildKeychainCommand,
  describeKeychainCommand,
} from "./keychain";

const SECRET = "secret-value-that-must-not-appear";

test("put command passes secret through stdin and not command args", () => {
  const command = buildKeychainCommand({
    operation: "put",
    service: "Roguent Test Secrets",
    ref: "github:token",
    value: SECRET,
  });

  expect(command.path).toBe("/usr/bin/security");
  expect(command.args).toContain("add-generic-password");
  expect(command.args.at(-1)).toBe("-w");
  expect(command.stdin).toBe(`${SECRET}\n`);
  expect(JSON.stringify(command.args)).not.toContain(SECRET);

  const safeDescriptor = describeKeychainCommand(command);
  expect(JSON.stringify(safeDescriptor)).not.toContain(SECRET);
  expect(safeDescriptor).toMatchInlineSnapshot(`
    {
      "args": [
        "add-generic-password",
        "-U",
        "-s",
        "Roguent Test Secrets",
        "-a",
        "secret:github:token",
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

test("store uses injected runner and never accesses the system keychain in tests", async () => {
  const commands: ReturnType<typeof describeKeychainCommand>[] = [];
  const stored = new Map<string, string>();
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async (command) => {
      commands.push(describeKeychainCommand(command));
      const account = command.args[command.args.indexOf("-a") + 1];
      if (!account) throw new Error("missing account");
      if (command.args[0] === "find-generic-password") {
        const value = stored.get(account);
        if (value == null) throw new KeychainCommandFailure(44);
        return value;
      }
      if (command.args[0] === "add-generic-password") {
        if (command.stdin == null) throw new Error("missing stdin");
        stored.set(account, command.stdin.slice(0, -1));
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

test("keychain errors include operation and ref but not secret values", async () => {
  const store = new KeychainSecretStore({
    service: "Roguent Test Secrets",
    run: async () => {
      throw new Error(`native failure with ${SECRET}`);
    },
  });

  await expect(store.put("github:token", SECRET)).rejects.toThrow(
    "keychain put failed for ref github:token",
  );
  await expect(store.put("github:token", SECRET)).rejects.not.toThrow(SECRET);
});
