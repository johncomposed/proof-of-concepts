# gh-log

Fetches a timestamped JSON log of your GitHub PRs and commits over a given time range.

## Setup

```bash
pnpm install
```

Requires a `GITHUB_TOKEN` env var with `repo` scope (classic PAT or fine-grained token with read access to your repos).

## Usage

```bash
# last 3 months (default)
GITHUB_TOKEN=ghp_... pnpm start -- --months=3 --out=log.json

# explicit date range
GITHUB_TOKEN=ghp_... pnpm start -- --start=2026-01-01 --end=2026-04-21 --out=log.json

# override user (defaults to authenticated user)
GITHUB_TOKEN=ghp_... pnpm start -- --months=6 --out=log.json --user=johncomposed
```

## Arguments

| Flag | Description |
| --- | --- |
| `--out`, `-o` | **Required.** Output JSON file path. |
| `--months` | Number of months to look back from today. Default `3`. Ignored if `--start`/`--end` are set. |
| `--start` | Start date `YYYY-MM-DD`. Must be paired with `--end`. |
| `--end` | End date `YYYY-MM-DD`. Must be paired with `--start`. |
| `--user`, `-u` | GitHub login to query. Defaults to the authenticated user. |

## Output

A single JSON file containing PRs and commits merged into one chronologically sorted `entries` array, plus metadata (`user`, `since`, `until`, `generated_at`, `counts`).

## Chunking into markdown

Take the generated JSON and split it into per-day, per-week, or per-month markdown files:

```bash
pnpm chunk -- --in=log.json --out=./chunks --by=day
pnpm chunk -- --in=log.json --out=./chunks --by=week
pnpm chunk -- --in=log.json --out=./chunks --by=month
```

| Flag | Description |
| --- | --- |
| `--in`, `-i` | **Required.** Path to the JSON produced by `gh-log`. |
| `--out`, `-o` | **Required.** Output directory (created if missing). |
| `--by`, `-b` | **Required.** One of `day`, `week`, `month`. |

Files are named `YYYY-MM-DD.md`, `YYYY-Www.md` (ISO week), or `YYYY-MM.md`.
