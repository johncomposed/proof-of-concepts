# gh-log

Fetches a timestamped JSON log of your GitHub PRs and commits over a given time range. Commits can be pulled from the GitHub API or from a local git clone.

## Setup

```bash
pnpm install
pnpm build
```

Requires a `GITHUB_TOKEN` env var with `repo` scope (classic PAT or fine-grained token with read access to your repos). The scripts auto-load a `.env` file if present:

```
GITHUB_TOKEN=ghp_...
```

## Usage

```bash
# last 3 months (default), GitHub API for commits
pnpm dev -- --months=3 --out=tmp/log.json

# explicit date range
pnpm dev -- --start=2026-01-01 --end=2026-04-21 --out=tmp/log.json

# override user (defaults to authenticated user)
pnpm dev -- --months=6 --user=johncomposed --out=tmp/log.json

# use local git clones instead of GitHub API for commit data
pnpm dev -- --months=3 --source=local --out=tmp/log.json

# local mode with explicit repo list (skips GitHub repo discovery)
pnpm dev -- --months=3 --source=local --repos=johncomposed/hourglass,johncomposed/gh-log --out=tmp/log.json
```

`pnpm dev` runs the TypeScript source directly via `tsx`. For a compiled run, use `pnpm build && pnpm log -- ...`.

## Arguments

| Flag | Description |
| --- | --- |
| `--out`, `-o` | **Required.** Output JSON file path. |
| `--months` | Number of months to look back from today. Default `3`. Ignored if `--start`/`--end` are set. |
| `--start` | Start date `YYYY-MM-DD`. Must be paired with `--end`. |
| `--end` | End date `YYYY-MM-DD`. Must be paired with `--start`. |
| `--user`, `-u` | GitHub login to query. Defaults to the authenticated user. |
| `--source` | `github` (default) or `local`. Where to pull commit data from. PRs are always fetched from GitHub. |
| `--clones-dir` | Directory for local git clones. Default `./clones`. Only used when `--source=local`. |
| `--repos` | Comma-separated `owner/repo` list. When set with `--source=local`, skips GitHub repo discovery. |

### Commit sources

- **`github`** — uses the GitHub search API for commits, then enriches each with `additions`/`deletions` via a per-commit API call. Simple, but uses your API rate limit.
- **`local`** — clones each repo into `--clones-dir` (or pulls if already present), then runs `git log --shortstat` locally. Faster for large commit counts once cloned, and works offline after the initial clone (if `--repos` is provided). Requires `git` on PATH.

Both modes return identical `CommitEntry` shapes (type, timestamp, repo, sha, message, url, additions, deletions).

## Output

A single JSON file containing PRs and commits merged into one chronologically sorted `entries` array, plus metadata (`user`, `since`, `until`, `generated_at`, `counts`).

PR entries include `head_branch` and `base_branch`. Commit entries include `additions` and `deletions`.

## Chunking into markdown

Take the generated JSON and split it into per-day, per-week, or per-month markdown files:

```bash
pnpm dev:chunk -- --in=tmp/log.json --out=./chunks --by=day
pnpm dev:chunk -- --in=tmp/log.json --out=./chunks --by=week
pnpm dev:chunk -- --in=tmp/log.json --out=./chunks --by=month
```

| Flag | Description |
| --- | --- |
| `--in`, `-i` | **Required.** Path to the JSON produced by `gh-log`. |
| `--out`, `-o` | **Required.** Output directory (created if missing). |
| `--by`, `-b` | **Required.** One of `day`, `week`, `month`. |

Files are named `YYYY-MM-DD.md`, `YYYY-Www.md` (ISO week), or `YYYY-MM.md`.

## Project layout

```
src/
  types.ts                  # Shared types + CommitProvider interface
  utils.ts                  # batch() + date range parsing
  github/
    client.ts               # Octokit factory
    prs.ts                  # PR search + branch enrichment
  providers/
    github-commits.ts       # GitHubCommitProvider
    local-git-commits.ts    # LocalGitCommitProvider
  cli.ts                    # Main CLI entry (gh-log)
  chunk.ts                  # Chunking logic
  cli-chunk.ts              # Chunk CLI entry (gh-log-chunk)
```
