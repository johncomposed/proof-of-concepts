import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { LogOutputSchema } from "../log-types.js";
import { deriveFromLog } from "../derive.js";
import { runHarness } from "../harness.js";
import type { DerivedData } from "../types.js";

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4", hint: "recommended" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "faster, cheaper" },
  { value: "claude-opus-4-20250514", label: "Opus 4", hint: "most capable" },
];

export async function run(args: string[], ctx: { interactive: boolean }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o", default: "./archaeology-out" },
      model: { type: "string", short: "m" },
      "skip-to": { type: "string", default: "0" },
      repo: { type: "string", short: "r" },
    },
  });

  let logPath = positionals[0];
  let model = values.model;
  let repoFilter: string | string[] | undefined = values.repo;
  const outputDir = values.output!;
  const skipTo = parseInt(values["skip-to"]!, 10);

  if (ctx.interactive) {
    p.intro("Analyze");

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

    const spinner = p.spinner();
    spinner.start("Parsing and deriving...");
    const raw = JSON.parse(await readFile(logPath, "utf-8"));
    const log = LogOutputSchema.parse(raw);
    const data = deriveFromLog(log);
    spinner.stop(
      `${data.repos.length} repos, ${data.manifest.stats.totalBranches} branches`
    );

    if (!repoFilter && data.repos.length > 1) {
      const selected = await p.multiselect({
        message: "Which repos to analyze?",
        options: data.repos.map((r) => ({
          value: r.repo,
          label: r.repo,
          hint: `${r.commitCount} commits, ${r.prCount} PRs`,
        })),
        required: true,
      });
      if (p.isCancel(selected)) {
        p.outro("");
        return;
      }
      const sel = selected as string[];
      if (sel.length < data.repos.length) {
        repoFilter = sel;
      }
    }

    if (!model) {
      const selected = await p.select({
        message: "Which model?",
        options: MODELS,
      });
      if (p.isCancel(selected)) {
        p.outro("");
        return;
      }
      model = selected as string;
    }

    p.log.step(`Output:  ${outputDir}`);
    p.log.step(`Model:   ${model}`);
    p.log.step(
      `Repos:   ${repoFilter ? (Array.isArray(repoFilter) ? repoFilter.join(", ") : repoFilter) : "all"}`
    );
    if (skipTo > 0) p.log.step(`Skip to: phase ${skipTo}`);

    const confirm = await p.confirm({ message: "Start analysis?" });
    if (p.isCancel(confirm) || !confirm) {
      p.outro("Cancelled");
      return;
    }

    await runHarness(data, { outputDir, model, skipTo, repoFilter });
    p.outro("Analysis complete");
  } else {
    if (!logPath) {
      console.error("Usage: archaeology analyze <log.json> [options]");
      process.exit(1);
    }

    model = model ?? "claude-sonnet-4-20250514";
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

    await runHarness(data, { outputDir, model, skipTo, repoFilter });
  }
}
