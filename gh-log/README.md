# gh-log

A small CLI for pulling a timestamped JSON log of your GitHub activity (PRs + commits) and turning it into per-day/week/month markdown. Commands are subcommands under a single `gh-log` entry point — each one has both a non-interactive flag-driven mode and an interactive [clack](https://github.com/natemoo-re/clack) flow that kicks in when required args are omitted.

**Commit data comes from local git clones.** PRs and repo discovery are fetched from the GitHub API, but commit walking is always done locally — `gh-log` clones each repo (or fetches if already present) and parses `git log` directly. This makes the tool richer (real branch names via `git name-rev`, merge-base divergence via `git merge-base`) and cheaper (no per-commit API calls) at the cost of disk space for clones.

## Setup

```bash
pnpm install
pnpm build
```

Requires a `GITHUB_TOKEN` env var with `repo` scope (classic PAT or fine-grained token with read access to your repos). The scripts auto-load a `.env` file if present:

```
GITHUB_TOKEN=ghp_...
```

## Commands

```bash
pnpm dev                       # top-level help / defaults to `log` when flags are passed
pnpm dev -- --help             # top-level help
pnpm dev -- log [options]      # fetch PRs + commits → JSON
pnpm dev -- chunk [options]    # split that JSON into per-bucket markdown
```

Each subcommand has its own `--help`:

```bash
pnpm dev -- log --help
pnpm dev -- chunk --help
```

Built output: `pnpm build && node dist/cli.js <subcommand>` (or `gh-log <subcommand>` once linked).

## `log` — fetch activity

```bash
# interactive (prompts for everything)
pnpm dev -- log

# non-interactive
pnpm dev -- log --months=3 --out=tmp/log.json
pnpm dev -- log --start=2026-01-01 --end=2026-04-21 --out=tmp/log.json
pnpm dev -- log --months=6 --user=johncomposed --out=tmp/log.json

# only look at repos already cloned locally (skip new clones)
pnpm dev -- log --months=3 --no-clone --out=tmp/log.json

# explicit repo list (skips GitHub repo discovery)
pnpm dev -- log --repos=johncomposed/hourglass,johncomposed/gh-log --out=tmp/log.json
```

Omitting `--out` drops into the interactive flow. After an interactive run completes, the equivalent non-interactive command is printed so you can repeat the run without prompts.

### `log` flags

| Flag | Description |
| --- | --- |
| `--out`, `-o` | Output JSON path. Omit to run interactively. |
| `--months` | Look-back window in months. Default `3`. Ignored if `--start`/`--end` are set. |
| `--start` | Start date `YYYY-MM-DD`. Pair with `--end`. |
| `--end` | End date `YYYY-MM-DD`. Pair with `--start`. |
| `--user`, `-u` | GitHub login to query. Defaults to the authenticated user. |
| `--clones-dir` | Directory for local git clones. Default `./clones`. |
| `--repos` | Comma-separated `owner/repo` list (skips GitHub repo discovery). |
| `--no-clone` | Skip repos that aren't already cloned. |
| `--interactive`, `-i` | Force interactive mode even when `--out` is set. |
| `--cache-file` | Cache location. Default `.cache/gh-log.json`. |
| `--no-cache` | Disable cache reads/writes for this run. |
| `--clear-cache` | Wipe the cache file, then run. |

### How commit data is gathered

`git` must be on PATH. For each repo in scope, `gh-log`:

1. Clones into `--clones-dir/<owner>/<repo>` (or `git fetch --all` if already cloned; `--no-clone` skips the uncloned).
2. Runs `git log --all --author=<user> --since --until --shortstat` to collect commits with additions/deletions.
3. Resolves each commit's branch via `git name-rev` and strips the `origin/` prefix.
4. For each unique non-default branch, resolves the default branch (`git symbolic-ref refs/remotes/origin/HEAD`), then computes the merge-base with it: `git merge-base`, `git show -s --format=%aI`, `git rev-list --count`. Commits on that branch get a `branch_base: { sha, date, ahead }` stamp describing where the branch diverged from the default.

### Caching

Every network-heavy step is cached to `.cache/gh-log.json` keyed by a hash of the relevant Zod schema, so schema edits only invalidate the affected entries. PR and commit ranges are memoized range-aware: asking for "last 3 months" after caching "last 8 months" filters the cached superset instead of re-fetching.

## `log` output

A single JSON file containing PRs and commits merged into one chronologically sorted `entries` array, plus metadata (`user`, `since`, `until`, `generated_at`, `counts`).

- PR entries include `head_branch` and `base_branch`.
- Commit entries include `additions`, `deletions`, `branch` (resolved via `git name-rev`; `null` if unreachable from a named branch), and `branch_base` (`{ sha, date, ahead }` — merge-base with the default branch; `null` for commits on the default branch itself or when the branch can't be resolved).

## `chunk` — split JSON into markdown

```bash
# interactive (prompts for input, output, granularity)
pnpm dev -- chunk

# non-interactive
pnpm dev -- chunk --in=tmp/log.json --out=./chunks --by=day
pnpm dev -- chunk --in=tmp/log.json --out=./chunks --by=week
pnpm dev -- chunk --in=tmp/log.json --out=./chunks --by=month
```

### `chunk` flags

| Flag | Description |
| --- | --- |
| `--in`, `-i` | Input JSON produced by `gh-log log`. |
| `--out`, `-o` | Output directory (created if missing). |
| `--by`, `-b` | One of `day`, `week`, `month`. |
| `--interactive` | Force interactive mode. |

Files are named `YYYY-MM-DD.md`, `YYYY-Www.md` (ISO week), or `YYYY-MM.md`.

## Project layout

```
src/
  cli.ts                        # top-level dispatcher (gh-log <command>)
  commands/
    log.ts                      # `log` subcommand (flag parsing + non-interactive flow)
    log-interactive.ts          # `log` interactive clack flow
    chunk.ts                    # `chunk` subcommand (flag parsing + non-interactive flow)
    chunk-interactive.ts        # `chunk` interactive clack flow
  chunk.ts                      # pure chunk/render helpers
  cache.ts                      # schema-hashed, range-aware cache
  types.ts                      # Zod schemas + shared types
  utils.ts                      # batch() + date range parsing
  github/
    client.ts                   # Octokit factory
    prs.ts                      # PR search + branch fields
    repos.ts                    # repo discovery
  providers/
    local-git-commits.ts        # LocalGitCommitProvider — clone, git log, name-rev, merge-base
```

Adding a new subcommand is a two-file drop: `src/commands/<name>.ts` (exports `run(argv)`) plus an optional `src/commands/<name>-interactive.ts`, and one entry in the `COMMANDS` array in `src/cli.ts`.
