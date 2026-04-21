# gh-log

A small CLI for pulling a timestamped JSON log of your GitHub activity (PRs + commits) and turning it into per-day/week/month markdown. Commands are subcommands under a single `gh-log` entry point — each one has both a non-interactive flag-driven mode and an interactive [clack](https://github.com/natemoo-re/clack) flow that kicks in when required args are omitted.

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

# local git clones instead of the GitHub API for commit data
pnpm dev -- log --months=3 --source=local --out=tmp/log.json

# only look at repos already cloned locally
pnpm dev -- log --months=3 --source=local --no-clone --out=tmp/log.json

# explicit repo list (skips GitHub repo discovery in local mode)
pnpm dev -- log --source=local --repos=johncomposed/hourglass,johncomposed/gh-log --out=tmp/log.json
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
| `--source` | `github` (default) or `local`. PRs are always from GitHub. |
| `--clones-dir` | Directory for local git clones. Default `./clones`. Local mode only. |
| `--repos` | Comma-separated `owner/repo` list (skips GitHub repo discovery in local mode). |
| `--no-clone` | Local mode: skip repos that aren't already cloned. |
| `--interactive`, `-i` | Force interactive mode even when `--out` is set. |
| `--cache-file` | Cache location. Default `.cache/gh-log.json`. |
| `--no-cache` | Disable cache reads/writes for this run. |
| `--clear-cache` | Wipe the cache file, then run. |

### Commit sources

- **`github`** — uses the GitHub search API for commits, then enriches each with `additions`/`deletions` and resolves branches via PR cross-reference. Simple, but uses your API rate limit.
- **`local`** — clones each repo into `--clones-dir` (or fetches if already present), then parses `git log --shortstat` locally. Faster for large commit counts once cloned, works offline after the initial clone, and resolves branches via `git name-rev`. Requires `git` on PATH.

Both modes return identical `CommitEntry` shapes (type, timestamp, repo, sha, message, url, additions, deletions, branch).

### Caching

Every network-heavy step is cached to `.cache/gh-log.json` keyed by a hash of the relevant Zod schema, so schema edits only invalidate the affected entries. PR and commit ranges are memoized range-aware: asking for "last 3 months" after caching "last 8 months" filters the cached superset instead of re-fetching.

## `log` output

A single JSON file containing PRs and commits merged into one chronologically sorted `entries` array, plus metadata (`user`, `since`, `until`, `generated_at`, `counts`).

- PR entries include `head_branch` and `base_branch`.
- Commit entries include `additions`, `deletions`, and `branch` (resolved from PR commits in `github` mode, `git name-rev` in `local` mode; `null` if the commit isn't reachable from a named branch).

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
  types.ts                      # Zod schemas + shared types + CommitProvider interface
  utils.ts                      # batch() + date range parsing
  github/
    client.ts                   # Octokit factory
    prs.ts                      # PR search + branch fields
    repos.ts                    # repo discovery
    commit-branches.ts          # enrich commits with head_branch via PR commits
  providers/
    github-commits.ts           # GitHubCommitProvider
    local-git-commits.ts        # LocalGitCommitProvider
```

Adding a new subcommand is a two-file drop: `src/commands/<name>.ts` (exports `run(argv)`) plus an optional `src/commands/<name>-interactive.ts`, and one entry in the `COMMANDS` array in `src/cli.ts`.
