import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z, type ZodType } from "zod";

const schemaHashCache = new WeakMap<ZodType, string>();

function hashSchema(schema: ZodType): string {
  const cached = schemaHashCache.get(schema);
  if (cached) return cached;
  const json = JSON.stringify(z.toJSONSchema(schema));
  const hash = createHash("sha256")
    .update(json)
    .digest("base64url")
    .slice(0, 8);
  schemaHashCache.set(schema, hash);
  return hash;
}

interface CacheFile {
  entries: Record<string, unknown>;
}

export class Cache {
  private data: CacheFile = { entries: {} };
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
      if (parsed.entries) this.data = parsed;
    } catch {}
  }

  async save(): Promise<void> {
    if (this.disabled || !this.dirty) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async clear(): Promise<void> {
    this.data = { entries: {} };
    this.dirty = false;
    try {
      await rm(this.filePath);
    } catch {}
  }

  async memo<T>(
    key: string,
    schema: ZodType<T>,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (this.disabled) return fn();
    const fullKey = `${key}@${hashSchema(schema)}`;
    if (fullKey in this.data.entries) {
      return this.data.entries[fullKey] as T;
    }
    const value = await fn();
    this.data.entries[fullKey] = value;
    this.dirty = true;
    return value;
  }
}
