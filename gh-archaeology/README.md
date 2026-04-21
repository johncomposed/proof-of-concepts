# gh-archaeology

Reconstruct the intent behind old projects by mining Git history, then synthesize it into a coherent retrospective dev log.

This is the merge of two earlier subprojects:
- **gh-log** — fetched PRs + commits from GitHub and local clones into a JSON log, optionally chunked into per-day/week/month markdown.
- **gh-explore** (a.k.a. gh-archaeology v0.2) — took that JSON log and ran a multi-phase Claude analysis pipeline over it, producing a first-person retrospective dev log.

They are now a single tool with a shared type system and a single CLI. The pipeline is:

```
GitHub API + local clones
          │
          ▼
       log        (→ tmp/log.json)
          │
          ├─────────► chunk   (→ per-day/week/month markdown)
          │
          ▼
       derive     (→ derived branch/day JSON)
          │
          ▼
       analyze    (→ Claude-written retrospective dev log)
          ▲
          │
       status     (inspect / kill running Claude processes)
```

One insight drives phases 2 onward: **branches are the primary unit of intent.** Every branch represents a deliberate decision to diverge, so the pipeline treats them as first-class objects.

## Prerequisites

- Node.js 18+
- pnpm
- Git on PATH
- A `GITHUB_TOKEN` env var with `repo` scope (classic PAT or fine-grained token). A `.env` file is auto-loaded.
- Claude Code CLI (`claude` on PATH), for the `analyze` subcommand only.

## Setup

```bash
pnpm install
pnpm build
```

## CLI

```bash
pnpm dev                       # interactive command picker (when a TTY)
pnpm dev --help                # top-level help
pnpm dev <command> --help      # per-command help
```

All commands accept both a non-interactive flag mode and an interactive [clack](https://github.com/natemoo-re/clack) flow that kicks in when required args are omitted. Interactive runs also print the equivalent non-interactive command at the end so you can rerun without prompts.

### `log` — fetch activity

Fetch PRs + commits for a user and write them to a JSON file. PRs come from the GitHub API; commits come from **local git clones** (cloned or `git fetch`-updated on demand), which gives us real branch names via `git name-rev` and fork-point detection via `git merge-base`.

```bash
pnpm dev log                                          # interactive
pnpm dev log --out=tmp/log.json --months=6
pnpm dev log --start=2026-01-01 --end=2026-04-21 --out=tmp/log.json
pnpm dev log --repos=owner/a,owner/b --out=tmp/log.json
pnpm dev log --no-clone --out=tmp/log.json            # only repos already cloned locally
pnpm dev log --clear-cache --out=tmp/log.json
```

Commit entries include `branch` (resolved via `git name-rev`) and `branch_base` (`{ sha, date, ahead }` — the merge-base against the default branch). PR entries include `head_branch` and `base_branch`. Everything is merged into one chronologically-sorted `entries` array plus some metadata (`user`, `since`, `until`, `generated_at`, `counts`).

Every network-heavy step is cached under `.cache/gh-log.json`, keyed by a hash of the relevant Zod schema so schema edits only invalidate the affected entries. PR and commit ranges are memoized range-aware: asking for "last 3 months" after caching "last 8 months" filters the cached superset instead of re-fetching.

### `chunk` — split into markdown

A standalone pretty-printer over the log JSON. Useful on its own, independent of the analysis pipeline.

```bash
pnpm dev chunk                                                 # interactive
pnpm dev chunk --in=tmp/log.json --out=./chunks --by=day
pnpm dev chunk --in=tmp/log.json --out=./chunks --by=week
pnpm dev chunk --in=tmp/log.json --out=./chunks --by=month
```

Output files are named `YYYY-MM-DD.md`, `YYYY-Www.md` (ISO week), or `YYYY-MM.md`.

### `derive` — compute branch topology

Parse a log JSON and write out the derived structure (branch topology per repo, day clusters, per-repo and global manifests). No Claude calls. Useful to inspect exactly what the analysis pipeline will see.

```bash
pnpm dev derive tmp/log.json -o ./archaeology-out
```

For each repo the derive step:

- Groups commits by branch (matching PRs by `head_branch`)
- Classifies branches via name heuristics (`feat/`, `fix/`, `claude/`, `experiment/`, …)
- Flags orphan branches (no PR, not merged)
- Computes lifespan (first → last commit)
- Picks a **consensus fork point** per branch from the commits' `branch_base` stamps (the `git merge-base` data captured by `log`). This is the biggest lift vs. the old pipeline: branches now know where they diverged, not just what commits they contain.

### `analyze` — run the Claude analysis pipeline

```bash
pnpm dev analyze tmp/log.json [options]

  -o, --output <dir>     Output directory (default: ./archaeology-out)
  -m, --model <name>     Claude model id (Sonnet / Haiku / Opus)
  -r, --repo <name>      Filter to a single repo (e.g. owner/repo)
  --skip-to <N>          Non-interactive only: resume from phase N
```

The interactive flow walks you through:

1. **Repo selection** — if multiple repos, pick which to analyze.
2. **Phase checklist** — every phase shown with completion status. Already-done phases (output file already on disk) are unchecked by default so you naturally step through incrementally; re-running `analyze` just shows what's left to do.
3. **Model selection** — Sonnet / Haiku / Opus.
4. **Confirmation** — review settings before spawning Claude processes.

Phases 1–3 run **per repo in parallel**; phases 6–7 run once all repo phases have finished.

| # | Phase | Scope |
|---|-------|-------|
| 1 | Structural Survey | per repo — date ranges, activity clusters, quiet periods, apparent phases |
| 2 | Branch Topology | per repo — purpose of every branch, fork point, outcome, orphan speculation |
| 3 | Commit Narratives | per repo — branch-by-branch walk-through with +/- stats |
| 6 | Synthesis | cross-repo — first-person retrospective dev log |
| 7 | Fact-Check | cross-repo — short review of the dev log against raw data |

### `status` — manage running processes

```bash
pnpm dev status -o ./archaeology-out
```

Interactive UI showing all tracked Claude processes (from `.cache/processes.json` inside the output directory), with options to kill individual processes, kill all, or clear finished entries.

## Output structure

```
archaeology-out/
├── .cache/
│   └── processes.json         ← PID tracking for running Claude processes
├── manifest.json              ← global manifest (from derive)
├── days.json                  ← day-clustered timeline (from derive)
├── owner__repo1/
│   ├── repo.json              ← derived repo data (incl. fork points)
│   ├── manifest.json          ← per-repo manifest
│   └── analysis/…             ← phase outputs live under ../analysis/
├── analysis/
│   ├── owner__repo1/
│   │   ├── 01_structural_survey.md
│   │   ├── 02_branches.md
│   │   └── 03_commits.md
│   ├── 06_dev_log.md          ← cross-repo synthesis (first-person retrospective)
│   └── 07_fact_check.md       ← verification pass against raw data
└── ...
```

## Input format (`log.json`)

Matches `LogOutputSchema` in `src/types.ts` — a flat list of commit and PR entries across repos with metadata:

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
      "branch_base": { "sha": "...", "date": "...", "ahead": 7 },
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

## Project layout

```
src/
  cli.ts                        # top-level dispatcher (gh-archaeology <command>)
  types.ts                      # Zod schemas + derived types (shared)
  derive.ts                     # log → branch topology / day clusters / manifests
  harness.ts                    # Claude CLI orchestration (phase steps, prompts, execution)
  processes.ts                  # PID registry (.cache/processes.json)
  status.ts                     # interactive process manager
  chunk.ts                      # pure chunk/render helpers for the `chunk` command
  cache.ts                      # schema-hashed, range-aware cache used by `log`
  utils.ts                      # batch() + date range parsing
  github/
    client.ts                   # Octokit factory
    prs.ts                      # PR search + branch fields
    repos.ts                    # repo discovery via commit search
  providers/
    local-git-commits.ts        # LocalGitCommitProvider — clone, git log, name-rev, merge-base
  commands/
    log.ts, log-interactive.ts         # `log` subcommand
    chunk.ts, chunk-interactive.ts     # `chunk` subcommand
    derive.ts                          # `derive` subcommand
    analyze.ts                         # `analyze` subcommand
    status.ts                          # `status` subcommand

reference/                      # historical Python/shell prototype (pre-merge archaeology)
enrich-plan.md                  # future-work plan for deeper clone-based analysis
```

Adding a new subcommand is a two-file drop: `src/commands/<name>.ts` exporting `run(args, ctx)`, plus an optional `src/commands/<name>-interactive.ts`, and one entry in the `COMMANDS` array in `src/cli.ts`.

## Next steps

See `enrich-plan.md`. The broad idea is a second pass after `derive` that opens each local clone and extracts per-file churn, directory structure, and component clusters — turning the single-lens "branches" view into a multi-lens model. Some of that data (fork points) is already wired in via `branch_base`; the rest (file stats, clusters, directory tree) is still to do.

## Known limitations

- Branch-to-commit mapping relies on what the `log` step captured. Commits that `git name-rev` can't map to a named branch get grouped under `(no branch)`.
- No diffs/file contents in analysis yet — the pipeline currently works from commit messages, +/- counts, PR bodies, and (now) fork points.
- Per-repo analysis (phases 1–3) runs in parallel across repos; global synthesis (6–7) is serial and must wait for all repos to finish.
