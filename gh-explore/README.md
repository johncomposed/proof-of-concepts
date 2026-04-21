# Project Archaeology

Reconstruct the intent behind old projects by mining Git history, then synthesize it into a coherent retrospective dev log.

## What this does

You feed it a `log.json` file (produced by a separate GitHub log tool) containing commits and PRs across multiple repos. It derives branch topology, classifies branches, detects orphans, then runs a multi-phase Claude analysis pipeline that produces a first-person dev log per repo and a cross-repo synthesis.

The key insight: **branches are the primary unit of intent.** Every branch represents a deliberate decision to diverge. The pipeline treats them as first-class objects.

## Files

```
gh-explore/
├── src/
│   ├── cli.ts             ← entry point / subcommand router
│   ├── log-types.ts       ← Zod schemas for log input (LogOutputSchema)
│   ├── types.ts           ← shared types (DerivedData, DerivedRepo, etc.)
│   ├── derive.ts          ← derives branch topology, timelines, manifests from log data
│   ├── harness.ts         ← Claude CLI orchestration (phase steps, prompts, execution)
│   ├── processes.ts       ← background process tracking (PID registry, .cache/processes.json)
│   ├── status.ts          ← interactive process manager (view/kill running phases)
│   └── commands/
│       ├── derive.ts      ← `derive` subcommand
│       ├── analyze.ts     ← `analyze` subcommand
│       └── status.ts      ← `status` subcommand
├── tmp/
│   └── log.json           ← input data (gitignored)
└── package.json
```

## Prerequisites

- Node.js 18+
- pnpm
- Claude Code CLI installed and authenticated (`claude` command available)

## Setup

```bash
pnpm install
```

## Usage

Run with no arguments for an interactive menu:

```bash
pnpm dev
```

Or specify a subcommand directly:

```bash
pnpm dev <derive|analyze|status> [options]
```

### `derive` — Parse log and write derived data

```bash
pnpm dev derive <log.json> [-o output-dir]
```

Parses the log file, derives branch topology per repo, and writes JSON output (manifests, repo data, day clusters). No Claude calls. Useful for inspecting what the pipeline will work with.

### `analyze` — Run Claude analysis pipeline

```bash
pnpm dev analyze <log.json> [options]

  -o, --output <dir>     Output directory (default: ./archaeology-out)
  -m, --model <name>     Claude model to use
  --skip-to <N>          Resume from phase N (non-interactive only)
  -r, --repo <name>      Filter to a single repo (e.g. owner/repo)
```

In interactive mode, `analyze` walks you through:

1. **Repo selection** — if multiple repos, pick which to analyze
2. **Phase checklist** — shows all phases with completion status. Already-done phases (output file exists) are unchecked by default, so you naturally step through incrementally
3. **Model selection** — choose between Sonnet, Haiku, or Opus
4. **Confirmation** — review settings before spawning Claude processes

This means you can run `pnpm dev analyze tmp/log.json` repeatedly, and each time it will show you what's left to do.

### `status` — Check running processes

```bash
pnpm dev status [-o output-dir]
```

Interactive UI showing all tracked Claude processes with options to kill individual processes, kill all, or clear finished entries.

### Legacy usage

Passing a file path without a subcommand routes to `analyze`:

```bash
pnpm dev tmp/log.json
```

## Input format

The input `log.json` must match `LogOutputSchema` — a flat list of commit and PR entries across repos:

```json
{
  "user": "username",
  "since": "2025-01-01",
  "until": "2026-01-01",
  "generated_at": "...",
  "counts": { "prs": 45, "commits": 758, "total": 803 },
  "entries": [
    {
      "type": "commit",
      "timestamp": "...",
      "sha": "...",
      "message": "...",
      "url": "...",
      "additions": 100,
      "deletions": 50,
      "branch": "feature-x",
      "repo": "owner/repo"
    },
    {
      "type": "pr",
      "timestamp": "...",
      "repo": "owner/repo",
      "number": 1,
      "title": "...",
      "state": "closed",
      "merged": true,
      "merged_at": "...",
      "url": "...",
      "body": "...",
      "head_branch": "feature-x",
      "base_branch": "main"
    }
  ]
}
```

## Output structure

Each repo gets its own analysis subdirectory. Cross-repo synthesis lives at the top level. Process state and cache data live in `.cache/`.

```
archaeology-out/
├── .cache/
│   └── processes.json         ← PID tracking for running Claude processes
├── analysis/
│   ├── owner__repo1/
│   │   ├── 01_structural_survey.md
│   │   ├── 02_branches.md
│   │   └── 03_commits.md
│   ├── owner__repo2/
│   │   └── ...
│   ├── 06_dev_log.md          ← cross-repo synthesis (first-person retrospective)
│   └── 07_fact_check.md       ← verification pass against raw data
├── manifest.json              ← global manifest (from derive)
└── days.json                  ← day-clustered timeline (from derive)
```

## Pipeline phases

**Phases 1-3 run per repo in isolation:**

1. **Structural Survey** — Date ranges, activity clusters, quiet periods, apparent phases of work.
2. **Branch Topology** — For every branch: evidence of intent (PR, name, commits), best guess at purpose, outcome (merged/abandoned/open), orphan analysis.
3. **Commit Narratives** — Branch-by-branch walkthrough of commits with addition/deletion stats. Development narrative as a sequence of branches, not commits.

**Phases 6-7 run across all repos:**

6. **Synthesis** — First-person retrospective dev log covering all repos. Per-repo narratives plus cross-repo threads (context switches, shared patterns). Inferences clearly marked with `[inferred]` tags.
7. **Fact-Check** — Verification pass catching wrong dates, misattributed commits, gaps, and overconfident claims.

## Derivation step

Before Claude sees anything, the derive step extracts from the flat log:

- **Branch topology** per repo (grouping commits by branch, matching PRs by head_branch)
- **Branch classification** via name heuristics (feat/, fix/, claude/, experiment/, etc.)
- **Orphan detection** (branches with no PR and not merged)
- **Lifespan calculation** (first to last commit per branch)
- **Day-clustered timelines** (per-repo and global)
- **Per-repo manifests** with stats

## Limitations

- No fork-point detection — we don't know where branches diverged, only what commits they contain.
- Branch-to-commit mapping depends on what the log tool provides. Commits without a branch field are grouped under `(no branch)`.
- Diffs/file contents are not included — analysis relies on commit messages, addition/deletion counts, and PR bodies.
- Claude pipeline phases run sequentially. Long runs with many repos can take a while.
