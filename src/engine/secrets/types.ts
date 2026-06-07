export interface SecretStore {
  put(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string | undefined>;
  delete(ref: string): Promise<void>;
  listRefs(prefix: string): Promise<string[]>;
}
