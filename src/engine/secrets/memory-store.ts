import type { SecretStore } from "./types";

export class MemorySecretStore implements SecretStore {
  private readonly secrets = new Map<string, string>();

  async put(ref: string, value: string): Promise<void> {
    this.secrets.set(ref, value);
  }

  async get(ref: string): Promise<string | undefined> {
    return this.secrets.get(ref);
  }

  async delete(ref: string): Promise<void> {
    this.secrets.delete(ref);
  }

  async listRefs(prefix: string): Promise<string[]> {
    return [...this.secrets.keys()]
      .filter((ref) => ref.startsWith(prefix))
      .sort();
  }
}
