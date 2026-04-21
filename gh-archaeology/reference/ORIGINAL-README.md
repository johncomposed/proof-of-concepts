# Project Archaeology

Reconstruct the intent behind old projects by mining Git history, daily notes, and Claude Code logs — then synthesize it all into a coherent retrospective dev log.

## What this does

You point it at one or more GitHub repos (or local git repos), a folder of messy daily notes, and optionally any Claude Code conversation logs you can find. It extracts everything into structured JSON, then orchestrates a multi-phase Claude Code analysis pipeline that produces a first-person dev log — the blog post you never wrote.

The key insight: **branches are the primary unit of intent.** Every branch represents a deliberate decision to diverge. The pipeline treats them as first-class objects, not just a detail on commits.

## Files

```
project-archaeology/
├── README.md           ← you are here
├── claude.md           ← Claude Code project instructions
├── extract.py          ← data extraction (GitHub API + notes + logs)
├── branches.py         ← branch topology extraction (local git or GitHub API)
└── harness.sh          ← Claude Code orchestration pipeline (7 phases)
```

## Prerequisites

- Python 3.10+
- `requests` library (`pip install requests`)
- A GitHub personal access token (for API access)
- Claude Code CLI installed and authenticated (`claude` command available)
- Git CLI (for local repo analysis)

## Setup

```bash
pip install requests
export GITHUB_TOKEN=ghp_your_token_here
chmod +x harness.sh
```

## Usage

### Step 1: Extract branch topology

Run this first — the other scripts use its output.

```bash
# From GitHub API (works without cloning)
python branches.py --repo owner/repo --output ./archaeology-out

# From a local clone (richer data — merge-base detection is more accurate)
python branches.py --local /path/to/repo --output ./archaeology-out
```

For multiple repos, run once per repo. They all write to the same output directory.

### Step 2: Extract commits, PRs, diffs, notes

```bash
python extract.py \
  --repos owner/repo1 owner/repo2 \
  --notes ~/daily-notes \
  --output ./archaeology-out \
  --max-diffs 30
```

If `branches.py` has already been run, `extract.py` will load the branch topology and sample diffs **per-branch** instead of evenly across the flat commit history. This ensures short-lived experimental branches get representation.

### Step 3: Run the analysis pipeline

```bash
# Full pipeline
./harness.sh ./archaeology-out

# Single repo
./harness.sh ./archaeology-out --repo owner__reponame

# Resume from a specific phase
./harness.sh ./archaeology-out --skip-to 5

# Use Haiku for cheaper bulk phases
./harness.sh ./archaeology-out --model haiku
```

### Output

All analysis outputs land in `archaeology-out/analysis/`:

```
analysis/
├── 01_structural_survey.md       ← project shape, activity clusters, date ranges
├── 02_branches_REPO.md           ← per-branch intent analysis
├── 03_commits_REPO.md            ← branch-aware commit narratives with diffs
├── 04_notes_crossref.md          ← daily notes matched to development activity
├── 05_claude_logs.md             ← Claude Code conversation analysis (if found)
├── 06_dev_log.md                 ← THE FINAL DEV LOG (first-person retrospective)
├── 07_fact_check.md              ← verification pass against raw data
└── *.log                         ← stderr/debug logs for each phase
```

## Pipeline phases

### Phase 1 — Structural Survey
Reads the manifest and timeline. Identifies date ranges, activity clusters, quiet periods, and apparent phases of work. Pure scaffolding for later phases.

### Phase 2 — Branch Topology
The heart of the pipeline. For every branch:
- Where it forked from and when
- Whether it has a PR (strongest intent signal)
- What the branch name and first commits suggest about purpose
- Whether it was merged, abandoned, or is still dangling

Special attention to **orphan branches** — no PR, never merged. These are the abandoned experiments and false starts that often tell the most interesting story.

### Phase 3 — Branch-Aware Commit Narratives
Walks through diffs **branch by branch**, not chronologically. For each branch: what was the goal, how do the commits advance it, were there mid-branch pivots. Merge commits on the default branch are noted as integration points.

### Phase 4 — Notes Cross-Reference
Matches daily notes to development activity by date. Looks for connections: does a note explain a commit? Express frustration matching a revert? Mention a decision that shows up as a PR? Notes on days with no commits suggest planning or blocked time.

### Phase 5 — Claude Logs
If Claude Code conversation logs are found, these are the most direct evidence of intent. They reveal what the developer was asking about, what approaches they considered, where they got stuck.

### Phase 6 — Synthesis
Combines all prior analysis into a first-person retrospective dev log. Branches are the structural backbone. Inferences are clearly marked with `[inferred]` tags. Reads like a thoughtful blog post, not a formal report.

### Phase 7 — Fact-Check
Sends Claude back to the raw data to verify dates, sequences, and claims. Catches where the narrative drifted from evidence and flags gaps.

## Finding Claude Code logs

The extraction script checks several known locations:

- `~/.claude/projects/<project>/conversations/` — per-project conversation history
- `~/.claude/logs/` — general Claude Code logs
- `<repo>/.claude/` — project-local Claude config/logs

Logs are typically JSONL format. If you know of other log locations, pass them as additional search directories or symlink them into one of the above paths.

## Tips

- **Run `branches.py` before `extract.py`** so diff sampling is branch-aware.
- **`--skip-to` is your friend.** Read the output of each phase before running the next. You might want to manually edit the structural survey before it gets baked into later phases.
- **Model selection matters.** Phases 1 and 4 (structural survey, notes cross-ref) are good Haiku candidates. Phases 2, 3, and 6 (branches, commit narrative, synthesis) benefit from Sonnet's deeper reasoning.
- **`--max-diffs`** controls API calls and context size. 30 is a good default. For very large repos, consider 50+ but watch for context window limits.
- **Orphan branches** are often the most interesting part of the dev log. They're the things you tried and walked away from.
- **The dev log is a draft.** The pipeline produces a starting point for you to edit. The fact-check phase is there to keep it honest, but your memory fills in what no amount of data mining can recover.

## Limitations

- GitHub API rate limits apply. The token gets you 5,000 requests/hour, which is plenty for most projects but may throttle very large repos.
- The compare API can't find fork points for branches that have been heavily rebased.
- Daily notes matching is date-based only — if your notes don't have dates in the filename, it falls back to file modification time.
- Claude Code logs aren't guaranteed to exist or be in a consistent format across versions.
- Diffs are truncated to ~8KB each to fit within context limits. Very large commits lose their tails.