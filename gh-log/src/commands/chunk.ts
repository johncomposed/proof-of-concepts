import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { bucketEntries, renderBucket } from "../chunk.js";
import type { LogOutput } from "../types.js";
import { runInteractive } from "./chunk-interactive.js";

const HELP = `gh-log chunk — split a gh-log JSON into per-bucket markdown files

Usage:
  gh-log chunk                                           # interactive
  gh-log chunk --in=<log.json> --out=<dir> --by=<unit>   # non-interactive

Options:
  -i, --in=<path>     Input JSON produced by \`gh-log log\`.
  -o, --out=<dir>     Output directory (created if missing).
  -b, --by=<unit>     Bucket granularity: day, week, or month.
      --interactive   Force interactive mode.
  -h, --help          Show this message.

Omit any of --in, --out, --by to drop into the interactive flow.
`;

export async function run(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string", short: "i" },
      out: { type: "string", short: "o" },
      by: { type: "string", short: "b" },
      interactive: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const needsInteractive =
    values.interactive || !values.in || !values.out || !values.by;

  if (needsInteractive) {
    await runInteractive({
      in: values.in,
      out: values.out,
      by: values.by,
    });
    return;
  }

  if (!["day", "week", "month"].includes(values.by!)) {
    console.error("--by must be one of: day, week, month");
    process.exit(1);
  }

  await chunkOnce({
    inPath: values.in!,
    outDir: values.out!,
    by: values.by as "day" | "week" | "month",
  });
}

export async function chunkOnce(opts: {
  inPath: string;
  outDir: string;
  by: "day" | "week" | "month";
}): Promise<number> {
  const raw: LogOutput = JSON.parse(await readFile(opts.inPath, "utf8"));
  const buckets = bucketEntries(raw.entries ?? [], opts.by);

  await mkdir(opts.outDir, { recursive: true });

  const sortedKeys = [...buckets.keys()].sort();
  for (const key of sortedKeys) {
    const body = renderBucket(key, buckets.get(key)!, opts.by);
    await writeFile(path.join(opts.outDir, `${key}.md`), body);
  }

  console.error(
    `Wrote ${sortedKeys.length} ${opts.by} file(s) to ${opts.outDir}`,
  );
  return sortedKeys.length;
}
