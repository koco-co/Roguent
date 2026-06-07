import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { SecretStore } from "./types";

const SECURITY_PATH = "/usr/bin/security";
const DEFAULT_SERVICE = "Roguent External Platform Secrets";
const SECRET_ACCOUNT_PREFIX = "secret:";
const INDEX_ACCOUNT = "__roguent_secret_index__";
const NOT_FOUND_EXIT_CODE = 44;

export type KeychainOperation =
  | "put"
  | "get"
  | "delete"
  | "listIndex"
  | "putIndex";

export interface KeychainCommand {
  path: string;
  args: string[];
  stdin?: string;
}

export interface SafeKeychainCommandDescriptor {
  path: string;
  args: string[];
  stdin: "none" | "present";
}

export type KeychainRunner = (command: KeychainCommand) => Promise<string>;

export type KeychainCommandInput =
  | {
      operation: "put";
      service: string;
      ref: string;
      value: string;
    }
  | {
      operation: "putIndex";
      service: string;
      value: string;
    }
  | {
      operation: "get" | "delete";
      service: string;
      ref: string;
    }
  | {
      operation: "listIndex";
      service: string;
      ref?: string;
    };

export interface KeychainSecretStoreOptions {
  service?: string;
  run?: KeychainRunner;
}

export class KeychainCommandFailure extends Error {
  readonly exitCode: number | undefined;

  constructor(exitCode?: number) {
    super("keychain command failed");
    this.name = "KeychainCommandFailure";
    this.exitCode = exitCode;
  }
}

export function buildKeychainCommand(
  input: KeychainCommandInput,
): KeychainCommand {
  const account =
    input.operation === "listIndex" || input.operation === "putIndex"
      ? INDEX_ACCOUNT
      : accountForRef(input.ref);

  if (input.operation === "put" || input.operation === "putIndex") {
    return {
      path: SECURITY_PATH,
      args: [
        "add-generic-password",
        "-U",
        "-s",
        input.service,
        "-a",
        account,
        "-w",
      ],
      stdin: promptInput(input.value),
    };
  }

  if (input.operation === "delete") {
    return {
      path: SECURITY_PATH,
      args: ["delete-generic-password", "-s", input.service, "-a", account],
    };
  }

  return {
    path: SECURITY_PATH,
    args: ["find-generic-password", "-s", input.service, "-a", account, "-w"],
  };
}

export function describeKeychainCommand(
  command: KeychainCommand,
): SafeKeychainCommandDescriptor {
  return {
    path: command.path,
    args: redactArgs(command.args),
    stdin: command.stdin == null ? "none" : "present",
  };
}

export class KeychainSecretStore implements SecretStore {
  private readonly service: string;
  private readonly run: KeychainRunner;
  private indexQueue: Promise<void> = Promise.resolve();

  constructor(options: KeychainSecretStoreOptions = {}) {
    this.service = options.service ?? DEFAULT_SERVICE;
    this.run = options.run ?? defaultKeychainRunner;
  }

  async put(ref: string, value: string): Promise<void> {
    await this.withIndexLock(async () => {
      await this.writeValue("put", ref, value);
      const refs = await this.readIndex(ref);
      if (!refs.includes(ref)) {
        refs.push(ref);
        await this.writeIndex("put", ref, refs);
      }
    });
  }

  async get(ref: string): Promise<string | undefined> {
    const command = buildKeychainCommand({
      operation: "get",
      service: this.service,
      ref,
    });

    try {
      return stripSecurityLineEnding(await this.run(command));
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw secretStoreError("get", ref);
    }
  }

  async delete(ref: string): Promise<void> {
    await this.withIndexLock(async () => {
      const command = buildKeychainCommand({
        operation: "delete",
        service: this.service,
        ref,
      });

      try {
        await this.run(command);
      } catch (err) {
        if (!isNotFound(err)) throw secretStoreError("delete", ref);
      }

      const refs = await this.readIndex(ref);
      const nextRefs = refs.filter((existing) => existing !== ref);
      if (nextRefs.length !== refs.length) {
        await this.writeIndex("delete", ref, nextRefs);
      }
    });
  }

  async listRefs(prefix: string): Promise<string[]> {
    return this.withIndexLock(async () => {
      const refs = await this.readIndex(prefix);
      return refs.filter((ref) => ref.startsWith(prefix)).sort();
    });
  }

  private async writeValue(
    operation: "put",
    ref: string,
    value: string,
  ): Promise<void> {
    const command = buildKeychainCommand({
      operation: "put",
      service: this.service,
      ref,
      value,
    });

    try {
      await this.run(command);
    } catch {
      throw secretStoreError(operation, ref);
    }
  }

  private async readIndex(refForError: string): Promise<string[]> {
    const command = buildKeychainCommand({
      operation: "listIndex",
      service: this.service,
    });

    try {
      return parseIndex(stripSecurityLineEnding(await this.run(command)));
    } catch (err) {
      if (isNotFound(err)) return [];
      throw secretStoreError("listRefs", refForError);
    }
  }

  private async writeIndex(
    operation: "put" | "delete",
    refForError: string,
    refs: string[],
  ): Promise<void> {
    const command = buildKeychainCommand({
      operation: "putIndex",
      service: this.service,
      value: stringifyIndex(refs),
    });

    try {
      await this.run(command);
    } catch {
      throw secretStoreError(operation, refForError);
    }
  }

  private async withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.indexQueue;
    let release: () => void = () => {};
    this.indexQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

async function defaultKeychainRunner(
  command: KeychainCommand,
): Promise<string> {
  if (process.platform !== "darwin") throw new KeychainCommandFailure();

  try {
    return execFileSync(command.path, command.args, {
      encoding: "utf8",
      input: command.stdin,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });
  } catch (err) {
    throw new KeychainCommandFailure(exitCodeFrom(err));
  }
}

function accountForRef(ref: string): string {
  return `${SECRET_ACCOUNT_PREFIX}${ref}`;
}

function promptInput(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("keychain secret values must not contain line breaks");
  }
  return `${value}\n${value}\n`;
}

function stripSecurityLineEnding(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function redactArgs(args: string[]): string[] {
  return args.map((arg, index) =>
    args[index - 1] === "-a" ? "[redacted]" : arg,
  );
}

function parseIndex(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter((ref): ref is string => typeof ref === "string"),
      ),
    ].sort();
  } catch {
    return [];
  }
}

function stringifyIndex(refs: string[]): string {
  return JSON.stringify([...new Set(refs)].sort());
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof KeychainCommandFailure &&
    err.exitCode === NOT_FOUND_EXIT_CODE
  );
}

function exitCodeFrom(err: unknown): number | undefined {
  if (typeof err !== "object" || err == null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function secretStoreError(operation: string, ref: string): Error {
  return new Error(`keychain ${operation} failed for ref ${redactRef(ref)}`);
}

function redactRef(ref: string): string {
  const digest = createHash("sha256").update(ref).digest("hex").slice(0, 8);
  return `[redacted:${digest}]`;
}
