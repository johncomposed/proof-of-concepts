import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = 1;

interface CacheFile {
  version: number;
  entries: Record<string, unknown>;
}

export class Cache {
  private data: CacheFile = { version: SCHEMA_VERSION, entries: {} };
  private dirty = false;

  constructor(
    private filePath: string,
    private disabled = false,
  ) {}

  async load(): Promise<void> {
    if (this.disabled) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version === SCHEMA_VERSION && parsed.entries) {
        this.data = parsed;
      }
    } catch {}
  }

  async save(): Promise<void> {
    if (this.disabled || !this.dirty) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async clear(): Promise<void> {
    this.data = { version: SCHEMA_VERSION, entries: {} };
    this.dirty = false;
    try {
      await rm(this.filePath);
    } catch {}
  }

  async memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.disabled) return fn();
    if (key in this.data.entries) {
      return this.data.entries[key] as T;
    }
    const value = await fn();
    this.data.entries[key] = value;
    this.dirty = true;
    return value;
  }
}
