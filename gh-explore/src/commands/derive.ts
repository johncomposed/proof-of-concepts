import * as p from "@clack/prompts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LogOutputSchema } from "../log-types.js";
import { deriveFromLog, repoSlug } from "../derive.js";

export async function run(args: string[], ctx: { interactive: boolean }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o", default: "./archaeology-out" },
    },
  });

  let logPath = positionals[0];
  const outputDir = values.output!;

  if (ctx.interactive) {
    p.intro("Derive");

    if (!logPath) {
      const result = await p.text({
        message: "Path to log.json",
        placeholder: "./tmp/log.json",
        validate: (v) => (!v ? "Required" : undefined),
      });
      if (p.isCancel(result)) {
        p.outro("");
        return;
      }
      logPath = result;
    }
  }

  if (!logPath) {
    console.error("Usage: archaeology derive <log.json> [-o output-dir]");
    process.exit(1);
  }

  if (ctx.interactive) {
    const spinner = p.spinner();
    spinner.start("Parsing log file...");

    const raw = JSON.parse(await readFile(logPath, "utf-8"));
    const log = LogOutputSchema.parse(raw);
    const data = deriveFromLog(log);

    spinner.stop(
      `${data.repos.length} repos, ${data.manifest.stats.totalBranches} branches, ${data.days.length} days`
    );

    for (const repo of data.repos) {
      p.log.info(
        `${repo.repo}: ${repo.branches.length} branches (${repo.orphanBranches.length} orphans), ${repo.commitCount} commits, ${repo.prCount} PRs`
      );
    }

    const writeSpinner = p.spinner();
    writeSpinner.start("Writing derived data...");
    await writeDerivedData(data, outputDir);
    writeSpinner.stop("Done");

    p.outro(`Derived data written to ${outputDir}/`);
  } else {
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

    await writeDerivedData(data, outputDir);
    console.log(`\nDerived data written to ${outputDir}/`);
  }
}

async function writeDerivedData(
  data: Awaited<ReturnType<typeof deriveFromLog>>,
  outputDir: string
) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(data.manifest, null, 2)
  );
  await writeFile(
    join(outputDir, "days.json"),
    JSON.stringify(data.days, null, 2)
  );
  for (const repo of data.repos) {
    const slug = repoSlug(repo.repo);
    const repoDir = join(outputDir, slug);
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
}
