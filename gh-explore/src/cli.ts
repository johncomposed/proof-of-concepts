import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LogOutputSchema } from "./types.js";
import { deriveFromLog } from "./derive.js";
import { runHarness } from "./harness.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: "string", short: "o", default: "./archaeology-out" },
    model: { type: "string", short: "m", default: "claude-sonnet-4-20250514" },
    "skip-to": { type: "string", default: "0" },
    repo: { type: "string", short: "r" },
    "derive-only": { type: "boolean", default: false },
  },
});

const logPath = positionals[0];
if (!logPath) {
  console.error(
    `Usage: tsx src/cli.ts <log.json> [--output dir] [--model name] [--skip-to N] [--repo owner/repo] [--derive-only]`
  );
  process.exit(1);
}

const raw = JSON.parse(await readFile(logPath, "utf-8"));
const log = LogOutputSchema.parse(raw);
const data = deriveFromLog(log);

console.log(
  `Derived: ${data.repos.length} repos, ${data.manifest.stats.totalBranches} branches, ${data.days.length} active days`
);
for (const repo of data.repos) {
  console.log(
    `  ${repo.repo}: ${repo.branches.length} branches (${repo.orphanBranches.length} orphans), ${repo.commitCount} commits, ${repo.prCount} PRs`
  );
}

if (values["derive-only"]) {
  const outDir = values.output!;
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(data.manifest, null, 2)
  );
  await writeFile(
    join(outDir, "days.json"),
    JSON.stringify(data.days, null, 2)
  );
  for (const repo of data.repos) {
    const slug = repo.repo.replace("/", "__");
    await writeFile(
      join(outDir, `${slug}_branches.json`),
      JSON.stringify(repo, null, 2)
    );
  }
  console.log(`\nDerived data written to ${outDir}/`);
  process.exit(0);
}

await runHarness(data, {
  outputDir: values.output!,
  model: values.model,
  skipTo: parseInt(values["skip-to"]!, 10),
  repoFilter: values.repo,
});
