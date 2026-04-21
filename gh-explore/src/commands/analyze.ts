import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { LogOutputSchema } from "../log-types.js";
import { deriveFromLog } from "../derive.js";
import {
  buildPhaseSteps,
  checkCompletion,
  runHarness,
  type PhaseStep,
} from "../harness.js";

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4", hint: "recommended" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "faster, cheaper" },
  { value: "claude-opus-4-20250514", label: "Opus 4", hint: "most capable" },
];

function stepLabel(step: PhaseStep, done: boolean): string {
  const repoShort = step.repo ? step.repo.split("/")[1] : undefined;
  const prefix = repoShort ? `[${repoShort}] ` : "";
  const suffix = done ? " (done)" : "";
  return `${prefix}Phase ${step.phase}: ${step.name.replace(/: .*/, "")}${suffix}`;
}

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

    const harnessOpts = { outputDir, model, repoFilter };
    const steps = buildPhaseSteps(data, harnessOpts);
    const completion = await checkCompletion(steps);

    const doneCount = [...completion.values()].filter(Boolean).length;
    if (doneCount > 0) {
      p.log.info(`${doneCount} of ${steps.length} phases already complete`);
    }

    const selected = await p.multiselect({
      message: "Which phases to run?",
      options: steps.map((step) => {
        const done = completion.get(step.key) ?? false;
        return {
          value: step.key,
          label: stepLabel(step, done),
          initialValue: !done,
        };
      }),
      required: true,
    });
    if (p.isCancel(selected)) {
      p.outro("");
      return;
    }

    const selectedKeys = new Set(selected as string[]);
    const selectedSteps = steps.filter((s) => selectedKeys.has(s.key));

    if (selectedSteps.length === 0) {
      p.outro("Nothing to run");
      return;
    }

    if (!model) {
      const modelChoice = await p.select({
        message: "Which model?",
        options: MODELS,
      });
      if (p.isCancel(modelChoice)) {
        p.outro("");
        return;
      }
      model = modelChoice as string;
    }

    p.log.step(`Output:  ${outputDir}`);
    p.log.step(`Model:   ${model}`);
    p.log.step(`Running: ${selectedSteps.length} of ${steps.length} phases`);

    const confirm = await p.confirm({ message: "Start analysis?" });
    if (p.isCancel(confirm) || !confirm) {
      p.outro("Cancelled");
      return;
    }

    await runHarness(data, { ...harnessOpts, model }, selectedSteps);
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

    // Non-interactive: use skipTo for backward compat
    const harnessOpts = { outputDir, model, repoFilter };
    if (skipTo > 0) {
      const steps = buildPhaseSteps(data, harnessOpts);
      const filtered = steps.filter((s) => s.phase >= skipTo);
      await runHarness(data, harnessOpts, filtered);
    } else {
      await runHarness(data, harnessOpts);
    }
  }
}
