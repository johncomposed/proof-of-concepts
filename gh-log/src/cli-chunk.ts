#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { bucketEntries, renderBucket } from "./chunk.js";
import type { LogOutput } from "./types.js";

const { values } = parseArgs({
  options: {
    in: { type: "string", short: "i" },
    out: { type: "string", short: "o" },
    by: { type: "string", short: "b" },
    help: { type: "boolean", short: "h" },
  },
});

const HELP = `gh-log-chunk — split a gh-log JSON into per-bucket markdown files

Usage:
  gh-log-chunk --in=<log.json> --out=<dir> --by=<day|week|month>

Options:
  -i, --in=<path>   Input JSON produced by gh-log.
  -o, --out=<dir>   Output directory (created if missing).
  -b, --by=<unit>   Bucket granularity: day, week, or month.
  -h, --help        Show this message.
`;

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (!values.in || !values.out || !values.by) {
  console.error(HELP);
  process.exit(1);
}

if (!["day", "week", "month"].includes(values.by)) {
  console.error("--by must be one of: day, week, month");
  process.exit(1);
}

const by = values.by as "day" | "week" | "month";
const raw: LogOutput = JSON.parse(await readFile(values.in, "utf8"));
const buckets = bucketEntries(raw.entries ?? [], by);

await mkdir(values.out, { recursive: true });

const sortedKeys = [...buckets.keys()].sort();
for (const key of sortedKeys) {
  const body = renderBucket(key, buckets.get(key)!, by);
  await writeFile(path.join(values.out, `${key}.md`), body);
}

console.error(`Wrote ${sortedKeys.length} ${by} file(s) to ${values.out}`);
