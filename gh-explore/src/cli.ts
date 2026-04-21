import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LogOutputSchema } from "./types.js";
import { deriveFromLog, repoSlug } from "./derive.js";
import { runHarness } from "./harness.js";
import { showStatus } from "./status.js";

const subcommand = process.argv[2];

if (subcommand === "status") {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      output: { type: "string", short: "o", default: "./archaeology-out" },
    },
  });
  await showStatus(values.output!);
  process.exit(0);
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
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
    `Usage:
  tsx src/cli.ts <log.json> [options]    Run the archaeology pipeline
  tsx src/cli.ts status [-o dir]         Check running processes

Options:
  -o, --output <dir>     Output directory (default: ./archaeology-out)
  -m, --model <name>     Claude model to use
  --skip-to <N>          Resume from phase N
  -r, --repo <name>      Filter to a single repo
  --derive-only          Just derive data, don't run Claude pipeline`
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
    const slug = repoSlug(repo.repo);
    const repoDir = join(outDir, slug);
    await mkdir(repoDir, { recursive: true });
    await writeFile(
      join(repoDir, "repo.json"),
      JSON.stringify(repo, null, 2)
    );
    const rm = data.repoManifests.find((m) => m.repo === repo.repo);
    if (rm) {
      await writeFile(
        join(repoDir, "manifest.json"),
        JSON.stringify(rm, null, 2)
      );
    }
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
