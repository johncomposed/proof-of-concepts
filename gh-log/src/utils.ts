import type { DateRange } from "./types.js";

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateRange(opts: {
  months?: string;
  start?: string;
  end?: string;
}): DateRange {
  if (opts.start || opts.end) {
    if (!opts.start || !opts.end) {
      console.error("--start and --end must be provided together");
      process.exit(1);
    }
    return { since: opts.start, until: opts.end };
  }

  const months = Number(opts.months ?? 3);
  if (!Number.isFinite(months) || months <= 0) {
    console.error("--months must be a positive number");
    process.exit(1);
  }
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  return { since: toIso(start), until: toIso(end) };
}

export async function batch<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}
