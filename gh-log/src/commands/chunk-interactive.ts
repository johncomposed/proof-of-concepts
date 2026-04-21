import { access } from "node:fs/promises";
import {
  intro,
  outro,
  select,
  text,
  spinner,
  isCancel,
  cancel,
  note,
} from "@clack/prompts";
import { chunkOnce } from "./chunk.js";

interface Defaults {
  in?: string;
  out?: string;
  by?: string;
}

function bail<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled");
    process.exit(0);
  }
  return value;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function formatCliCommand(chosen: {
  in: string;
  out: string;
  by: "day" | "week" | "month";
}): string {
  return `pnpm dev -- chunk --in=${chosen.in} --out=${chosen.out} --by=${chosen.by}`;
}

export async function runInteractive(defaults: Defaults): Promise<void> {
  intro("gh-log chunk");

  const inPath = bail(
    await text({
      message: "Input JSON path",
      initialValue: defaults.in ?? "tmp/log.json",
      validate: (v) => {
        if (!v) return "Required";
      },
    }),
  );

  if (!(await fileExists(inPath))) {
    note(`File not found: ${inPath}`, "error");
    cancel("Cancelled");
    process.exit(1);
  }

  const outDir = bail(
    await text({
      message: "Output directory",
      initialValue: defaults.out ?? "chunks",
    }),
  );

  const by = bail(
    await select<"day" | "week" | "month">({
      message: "Bucket granularity",
      options: [
        { value: "day", label: "Day" },
        { value: "week", label: "Week (ISO)" },
        { value: "month", label: "Month" },
      ],
      initialValue:
        defaults.by === "day" || defaults.by === "week" || defaults.by === "month"
          ? defaults.by
          : "week",
    }),
  );

  const s = spinner();
  s.start(`Chunking ${inPath} by ${by}`);
  const count = await chunkOnce({ inPath, outDir, by });
  s.stop(`Wrote ${count} ${by} file(s) to ${outDir}`);

  note(formatCliCommand({ in: inPath, out: outDir, by }), "re-run non-interactively");

  outro("Done");
}
