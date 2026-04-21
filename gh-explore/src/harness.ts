import { spawn } from "node:child_process";
import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { registerProcess, updateProcess } from "./processes.js";
import { repoSlug } from "./derive.js";
import type { DerivedData, DerivedRepo, DayCluster } from "./types.js";

export interface PhaseStep {
  key: string;
  phase: number;
  name: string;
  outputFile: string;
  repo?: string;
}

export interface HarnessOptions {
  outputDir: string;
  model?: string;
  repoFilter?: string | string[];
}

function runClaude(
  prompt: string,
  model: string,
  outputDir: string,
  phase: number,
  phaseName: string,
  outputFile: string,
  maxTurns: number = 5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["--print", "--model", model, "--max-turns", String(maxTurns), "-p", prompt],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const pid = child.pid!;
    registerProcess(outputDir, {
      pid,
      phase,
      name: phaseName,
      outputFile,
      startedAt: new Date().toISOString(),
      status: "running",
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString();
      const stderr = Buffer.concat(errChunks).toString();
      if (code !== 0) {
        updateProcess(outputDir, pid, {
          status: "failed",
          exitCode: code,
          error: stderr.slice(0, 500),
        });
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
      } else {
        updateProcess(outputDir, pid, {
          status: "done",
          exitCode: 0,
          bytes: Buffer.byteLength(stdout),
        });
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      updateProcess(outputDir, pid, {
        status: "failed",
        error: err.message,
      });
      reject(err);
    });
  });
}

async function runPhase(
  step: PhaseStep,
  prompt: string,
  model: string,
  outputDir: string
): Promise<void> {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▸ Phase ${step.phase}: ${step.name}`);
  console.log(`  → output: ${step.outputFile}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const result = await runClaude(prompt, model, outputDir, step.phase, step.name, step.outputFile);
  await writeFile(step.outputFile, result, "utf-8");

  console.log(`  ✓ Done — ${Buffer.byteLength(result)} bytes written\n`);
}

// ── Phase step building ──────────────────────────────────────────

function filterRepos(data: DerivedData, opts: HarnessOptions): DerivedRepo[] {
  if (!opts.repoFilter) return data.repos;
  return data.repos.filter((r) =>
    Array.isArray(opts.repoFilter)
      ? opts.repoFilter.includes(r.repo)
      : r.repo === opts.repoFilter
  );
}

export function buildPhaseSteps(
  data: DerivedData,
  opts: HarnessOptions
): PhaseStep[] {
  const analysisDir = join(opts.outputDir, "analysis");
  const repos = filterRepos(data, opts);
  const steps: PhaseStep[] = [];

  for (const repo of repos) {
    const slug = repoSlug(repo.repo);
    const repoDir = join(analysisDir, slug);

    steps.push({
      key: `1:${repo.repo}`,
      phase: 1,
      name: `Structural Survey: ${repo.repo}`,
      outputFile: join(repoDir, "01_structural_survey.md"),
      repo: repo.repo,
    });
    steps.push({
      key: `2:${repo.repo}`,
      phase: 2,
      name: `Branch Topology: ${repo.repo}`,
      outputFile: join(repoDir, "02_branches.md"),
      repo: repo.repo,
    });
    steps.push({
      key: `3:${repo.repo}`,
      phase: 3,
      name: `Commit Narratives: ${repo.repo}`,
      outputFile: join(repoDir, "03_commits.md"),
      repo: repo.repo,
    });
  }

  steps.push({
    key: "6",
    phase: 6,
    name: "Synthesis — Dev Log",
    outputFile: join(analysisDir, "06_dev_log.md"),
  });
  steps.push({
    key: "7",
    phase: 7,
    name: "Fact-Check Pass",
    outputFile: join(analysisDir, "07_fact_check.md"),
  });

  return steps;
}

export async function checkCompletion(
  steps: PhaseStep[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const step of steps) {
    try {
      const s = await stat(step.outputFile);
      result.set(step.key, s.size > 0);
    } catch {
      result.set(step.key, false);
    }
  }
  return result;
}

// ── Prompt generation ────────────────────────────────────────────

function summarizeBranches(repo: DerivedRepo): string {
  const lines: string[] = [];
  for (const b of repo.branches) {
    const prInfo = b.hasPr
      ? `PR: ${b.prs.map((p) => `#${p.number} "${p.title}" (${p.state}${p.merged ? ", merged" : ""})`).join(", ")}`
      : "no PR";
    const msgs = b.commits.slice(0, 10).map((c) => c.message.split("\n")[0]);
    lines.push(
      [
        `### ${b.name}`,
        `- Commits: ${b.commits.length}`,
        `- Dates: ${b.firstCommitDate ?? "?"} → ${b.lastCommitDate ?? "?"}${b.lifespanDays != null ? ` (${b.lifespanDays} days)` : ""}`,
        `- Category: ${b.category || "uncategorized"}`,
        `- ${prInfo}`,
        `- Merged: ${b.merged} | Orphan: ${b.isOrphan}`,
        `- Commit messages: ${msgs.join("; ")}`,
      ].join("\n")
    );
  }
  return lines.join("\n\n");
}

function repoTimelineSummary(days: DayCluster[], repoName: string): string {
  const lines: string[] = [];
  for (const day of days) {
    const repoEntries = day.entries.filter((e) => e.repo === repoName);
    if (repoEntries.length === 0) continue;
    const commits = repoEntries.filter((e) => e.type === "commit");
    const prs = repoEntries.filter((e) => e.type === "pr");
    lines.push(`${day.date}: ${commits.length} commits, ${prs.length} PRs`);
  }
  return lines.join("\n");
}

function globalTimelineSummary(days: DayCluster[]): string {
  const lines: string[] = [];
  for (const day of days) {
    const byRepo = new Map<string, { commits: number; prs: number }>();
    for (const e of day.entries) {
      const r = byRepo.get(e.repo) ?? { commits: 0, prs: 0 };
      if (e.type === "commit") r.commits++;
      else r.prs++;
      byRepo.set(e.repo, r);
    }
    const parts = [...byRepo.entries()].map(
      ([repo, { commits, prs }]) => `${repo.split("/")[1]}: ${commits}c/${prs}pr`
    );
    lines.push(`${day.date}: ${parts.join(", ")}`);
  }
  return lines.join("\n");
}

function buildPrompt(
  step: PhaseStep,
  data: DerivedData,
  repos: DerivedRepo[],
  analysisDir: string
): string {
  const repo = step.repo
    ? repos.find((r) => r.repo === step.repo)
    : undefined;

  if (step.phase === 1 && repo) {
    const slug = repoSlug(repo.repo);
    const repoDir = join(analysisDir, slug);
    const repoManifest = {
      repo: repo.repo,
      commitCount: repo.commitCount,
      prCount: repo.prCount,
      branchCount: repo.branches.length,
      orphanBranches: repo.orphanBranches,
      defaultBranch: repo.defaultBranch,
    };
    return `You are analyzing the history of a single repository: ${repo.repo}

Here is the repo manifest:
\`\`\`json
${JSON.stringify(repoManifest, null, 2)}
\`\`\`

Here is the activity timeline for this repo only:
\`\`\`
${repoTimelineSummary(data.days, repo.repo)}
\`\`\`

From this data, identify:
1. The overall date range of activity for this repo
2. Clusters of high activity vs. gaps (quiet periods of 5+ days)
3. What the commit messages suggest about major workstreams or phases
4. Any notable branch names and what they imply

Output a structured markdown document with:
- A "Repo Vitals" section (date range, total commits, total PRs, branch count)
- A "Phases of Work" section identifying apparent phases with date ranges and one-line descriptions
- An "Open Questions" section listing things that aren't clear from structure alone

Be concise. This is a scaffolding document that later analysis will flesh out.`;
  }

  if (step.phase === 2 && repo) {
    const branchSummary = summarizeBranches(repo);
    return `You are analyzing the branch topology of ${repo.repo} for a retrospective dev log.
The goal: every branch represents a deliberate decision to diverge. Figure out WHY.

This analysis is for this repo ONLY. Do not reference other repos.

Here is the branch data (${repo.branches.length} branches, ${repo.commitCount} commits, ${repo.prCount} PRs):

${branchSummary}

Orphan branches (no PR, not merged): ${repo.orphanBranches.join(", ") || "none"}

For EACH branch (excluding the default), write:

### [branch name]
- **Dates**: first → last commit
- **Evidence of intent**:
  - PR (if exists): summarize the PR title/body as the clearest statement of purpose
  - Branch name signals: what the naming convention suggests
  - First 2-3 commit messages: what the initial work was
- **Best guess why this branch exists**: 1-2 sentences synthesizing all evidence
- **Outcome**: merged / abandoned / still open
- **Confidence**: high (has PR with description) / medium (name + commits tell a story) / low (unclear)

Then write summary sections:

### Branch Patterns
- Common naming conventions used
- Typical branch lifespan
- Ratio of branches that got merged vs abandoned

### Orphan Branches (no PR, not merged)
These are the most interesting archaeologically. For each, speculate on what happened.

### Branch Timeline
List branches chronologically by first commit date, showing overlapping work.

Output as markdown.`;
  }

  if (step.phase === 3 && repo) {
    const slug = repoSlug(repo.repo);
    const repoDir = join(analysisDir, slug);
    const commitDetails = repo.branches
      .map((b) => {
        const commitLines = b.commits.map(
          (c) =>
            `  - ${c.sha.slice(0, 8)} ${c.timestamp.slice(0, 10)} [+${c.additions ?? "?"}/-${c.deletions ?? "?"}] ${c.message.split("\n")[0]}`
        );
        return `### ${b.name} (${b.commits.length} commits)\n${commitLines.join("\n")}`;
      })
      .join("\n\n");

    return `You are analyzing the commit history of ${repo.repo} for a retrospective dev log.
IMPORTANT: commits must be understood in the context of their BRANCH, not just their timestamp.
This analysis is for this repo ONLY.

Read these analysis files for context:
- Structural survey: ${join(repoDir, "01_structural_survey.md")}
- Branch analysis: ${join(repoDir, "02_branches.md")}

Here are the commits grouped by branch, with addition/deletion counts:

${commitDetails}

Walk through the work BRANCH BY BRANCH (not purely chronological). For each branch:

1. State the branch's inferred purpose (from the branch analysis)
2. Walk through its commits in order, noting:
   - What changed (from additions/deletions counts and commit message)
   - How it advances (or doesn't) the branch's apparent goal
   - Any mid-branch pivots or surprises
3. If the branch was merged, note what the main branch looked like before and after

For the default branch, separate:
- Direct commits (work done straight on main — why no branch?)
- Merge commits (mark which branch they brought in)

End with a "Development Narrative" section that tells the story as a sequence of
branches, not a sequence of commits.

Output as markdown.`;
  }

  if (step.phase === 6) {
    const manifestText = JSON.stringify(data.manifest, null, 2);
    const globalTimeline = globalTimelineSummary(data.days);
    const repoAnalysisPaths: string[] = [];
    for (const r of repos) {
      const slug = repoSlug(r.repo);
      const repoDir = join(analysisDir, slug);
      for (const num of ["01", "02", "03"]) {
        const f = join(repoDir, `${num}_${{ "01": "structural_survey", "02": "branches", "03": "commits" }[num]}.md`);
        repoAnalysisPaths.push(f);
      }
    }
    const repoList = repos
      .map((r) => `- ${r.repo}: ${r.commitCount} commits, ${r.prCount} PRs, ${r.branches.length} branches`)
      .join("\n");

    return `You are writing a retrospective dev log — the final synthesis of a project archaeology effort.
This covers work across ${repos.length} repositories by a single developer.

Repos:
${repoList}

Global manifest:
\`\`\`json
${manifestText}
\`\`\`

Cross-repo timeline (showing which repos had activity each day):
\`\`\`
${globalTimeline}
\`\`\`

Read ALL of these per-repo analysis documents for context:
${repoAnalysisPaths.map((f) => `- ${f}`).join("\n")}

Now write a dev log in FIRST PERSON RETROSPECTIVE voice ("I started by...", "At this point I was trying to..."). This should read like a thoughtful blog post or project postmortem.

Structure:
1. **Overview**: What were these projects? What was I trying to build across them? (1 paragraph)
2. **Per-Repo Narratives**: For each repo, a section covering:
   - What I was doing and why
   - Key decisions and what drove them
   - What worked, what didn't, what I abandoned
   Use BRANCHES as the primary structural unit — each branch was a deliberate
   decision to start a workstream. Orphan branches deserve special attention.
3. **Cross-Repo Threads**: Any recurring themes, patterns, or tensions across repos.
   Were repos related? Did work on one inform another? Context switches between repos.
4. **Retrospective**: What I'd do differently with hindsight

Rules:
- CLEARLY MARK anything that's inference vs. hard evidence. Use "[inferred]" tags.
- Where only code stats exist, say "based on the commits, it appears that..."
- Keep it honest — if something is unclear, say so. Gaps in the record are part of the story.
- Aim for the tone of a developer writing for other developers, not a formal report.

Output as a complete markdown document.`;
  }

  if (step.phase === 7) {
    const manifestText = JSON.stringify(data.manifest, null, 2);
    const globalTimeline = globalTimelineSummary(data.days);
    const devLogPath = join(analysisDir, "06_dev_log.md");

    return `You are doing a fact-check and quality pass on a retrospective dev log.

Read the dev log: ${devLogPath}

Here is the raw manifest for verification:
\`\`\`json
${manifestText}
\`\`\`

And the cross-repo timeline:
\`\`\`
${globalTimeline}
\`\`\`

Produce a SHORT review document:
1. Any factual errors (wrong dates, misattributed commits, incorrect sequences)
2. Places where the narrative makes confident claims that should be marked [inferred]
3. Gaps — important events in the timeline that the narrative skipped
4. Suggestions for the strongest 2-3 improvements

Be terse. This is a checklist, not a rewrite.`;
  }

  throw new Error(`Unknown phase: ${step.phase}`);
}

// ── Main entry point ─────────────────────────────────────────────

export async function runHarness(
  data: DerivedData,
  opts: HarnessOptions,
  selectedSteps?: PhaseStep[]
): Promise<void> {
  const analysisDir = join(opts.outputDir, "analysis");
  await mkdir(analysisDir, { recursive: true });

  const model = opts.model ?? "claude-sonnet-4-20250514";
  const repos = filterRepos(data, opts);

  const allSteps = buildPhaseSteps(data, opts);
  const stepsToRun = selectedSteps ?? allSteps;
  const selectedKeys = new Set(stepsToRun.map((s) => s.key));

  // Ensure per-repo directories exist
  for (const repo of repos) {
    const slug = repoSlug(repo.repo);
    await mkdir(join(analysisDir, slug), { recursive: true });
  }

  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  Project Archaeology — Analysis Pipeline                ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Output:  ${opts.outputDir}`);
  console.log(`║  Repos:   ${repos.length} repos`);
  console.log(`║  Model:   ${model}`);
  console.log(`║  Phases:  ${stepsToRun.length} of ${allSteps.length} steps`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  for (const step of allSteps) {
    if (!selectedKeys.has(step.key)) {
      console.log(`⏭  Skipping: ${step.name}`);
      continue;
    }

    const prompt = buildPrompt(step, data, repos, analysisDir);
    await runPhase(step, prompt, model, opts.outputDir);
  }

  // ── Done ────────────────────────────────────────────────────────

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  ✓ Pipeline complete                                    ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  for (const repo of repos) {
    const slug = repoSlug(repo.repo);
    console.log(`║  ${slug}/`);
    try {
      const files = await readdir(join(analysisDir, slug));
      for (const f of files.filter((f) => f.endsWith(".md"))) {
        console.log(`║    ${f}`);
      }
    } catch { /* skip */ }
  }
  console.log(`║`);
  console.log(`║  Dev log: ${join(analysisDir, "06_dev_log.md")}`);
  console.log(`║  Review:  ${join(analysisDir, "07_fact_check.md")}`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
}
