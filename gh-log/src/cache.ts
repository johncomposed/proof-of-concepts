import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z, type ZodType } from "zod";
import type { DateRange } from "./types.js";

const RANGE_KEY_RE =
  /^(.+)\|range=(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})@(.+)$/;

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

export interface CacheStats {
  hits: number;
  supersetHits: number;
  misses: number;
  writes: number;
  disabled: boolean;
}

export class Cache {
  private data: CacheFile = { entries: {} };
  private dirty = false;
  private stats: CacheStats = {
    hits: 0,
    supersetHits: 0,
    misses: 0,
    writes: 0,
    disabled: false,
  };

  constructor(
    private filePath: string,
    private disabled = false,
  ) {
    this.stats.disabled = disabled;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

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
    if (this.disabled) {
      this.stats.misses++;
      return fn();
    }
    const fullKey = `${key}@${hashSchema(schema)}`;
    if (fullKey in this.data.entries) {
      this.stats.hits++;
      return this.data.entries[fullKey] as T;
    }
    this.stats.misses++;
    const value = await fn();
    this.data.entries[fullKey] = value;
    this.stats.writes++;
    this.dirty = true;
    return value;
  }

  /**
   * Range-aware memo: if any cached entry under the same prefix+schema
   * supersets the requested range, filter and return its items. Otherwise
   * fetch and store under the requested range.
   *
   * Also garbage-collects any subset entries when a superset is written.
   */
  async memoRange<T>(
    prefix: string,
    schema: ZodType<T[]>,
    range: DateRange,
    itemDate: (item: T) => string,
    fn: (range: DateRange) => Promise<T[]>,
  ): Promise<T[]> {
    if (this.disabled) {
      this.stats.misses++;
      return fn(range);
    }

    const hash = hashSchema(schema);

    for (const key of Object.keys(this.data.entries)) {
      const match = RANGE_KEY_RE.exec(key);
      if (!match) continue;
      const [, p, since, until, h] = match;
      if (p !== prefix || h !== hash) continue;
      if (since <= range.since && until >= range.until) {
        this.stats.hits++;
        if (since !== range.since || until !== range.until) {
          this.stats.supersetHits++;
          console.error(
            `[cache] hit ${prefix} via superset ${since}..${until} (requested ${range.since}..${range.until})`,
          );
        }
        const items = this.data.entries[key] as T[];
        return items.filter((item) => {
          const ts = itemDate(item).slice(0, 10);
          return ts >= range.since && ts <= range.until;
        });
      }
    }

    this.stats.misses++;
    const value = await fn(range);
    const fullKey = `${prefix}|range=${range.since}..${range.until}@${hash}`;
    this.data.entries[fullKey] = value;
    this.stats.writes++;
    this.dirty = true;

    // Drop any stored subsets under the same prefix+schema — the new entry covers them.
    for (const key of Object.keys(this.data.entries)) {
      if (key === fullKey) continue;
      const match = RANGE_KEY_RE.exec(key);
      if (!match) continue;
      const [, p, since, until, h] = match;
      if (p !== prefix || h !== hash) continue;
      if (range.since <= since && range.until >= until) {
        delete this.data.entries[key];
      }
    }

    return value;
  }
}
