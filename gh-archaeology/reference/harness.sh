#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════
# Project Archaeology — Claude Code Orchestration Harness
# ══════════════════════════════════════════════════════════════════
#
# Runs a multi-phase analysis pipeline using `claude` CLI.
# Each phase reads prior outputs, building toward a final dev log.
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - extract.py already run (archaeology-out/ populated)
#
# Usage:
#   chmod +x harness.sh
#   ./harness.sh ./archaeology-out
#   ./harness.sh ./archaeology-out --repo owner__reponame   # single repo
#   ./harness.sh ./archaeology-out --skip-to 3              # resume from phase 3
#   ./harness.sh ./archaeology-out --model sonnet           # sonnet (default) or haiku
# ══════════════════════════════════════════════════════════════════

DATA_DIR="${1:?Usage: harness.sh <archaeology-out-dir> [--repo SLUG] [--skip-to N] [--model sonnet|haiku]}"
ANALYSIS_DIR="${DATA_DIR}/analysis"
mkdir -p "$ANALYSIS_DIR"

# ── Parse flags ────────────────────────────────────────────────────
REPO_FILTER=""
SKIP_TO=0
MODEL="claude-sonnet-4-20250514"

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)     REPO_FILTER="$2"; shift 2 ;;
    --skip-to)  SKIP_TO="$2"; shift 2 ;;
    --model)
      case "$2" in
        haiku)  MODEL="claude-haiku-4-5-20251001" ;;
        sonnet) MODEL="claude-sonnet-4-20250514" ;;
        *)      MODEL="$2" ;;
      esac
      shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Discover repos ────────────────────────────────────────────────
if [[ -n "$REPO_FILTER" ]]; then
  REPOS=("$REPO_FILTER")
else
  REPOS=()
  for f in "$DATA_DIR"/*_commits.json; do
    slug=$(basename "$f" _commits.json)
    REPOS+=("$slug")
  done
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Project Archaeology — Analysis Pipeline                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Data dir:  $DATA_DIR"
echo "║  Repos:     ${REPOS[*]}"
echo "║  Model:     $MODEL"
echo "║  Skip to:   phase $SKIP_TO"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Helper: run a claude prompt, save output ───────────────────────
run_phase() {
  local phase_num="$1"
  local phase_name="$2"
  local output_file="$3"
  local prompt="$4"

  if [[ "$SKIP_TO" -gt "$phase_num" ]]; then
    echo "⏭  Skipping phase $phase_num ($phase_name)"
    return 0
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▸ Phase $phase_num: $phase_name"
  echo "  → output: $output_file"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # --print forces non-interactive, --model selects model
  # --max-turns 3 gives it room to read multiple files
  claude --print \
    --model "$MODEL" \
    --max-turns 5 \
    --verbose \
    -p "$prompt" \
    > "$output_file" 2>"${output_file%.md}.log"

  local size
  size=$(wc -c < "$output_file")
  echo "  ✓ Done — ${size} bytes written"
  echo ""
}


# ══════════════════════════════════════════════════════════════════
# PHASE 1: Structural Survey
# ══════════════════════════════════════════════════════════════════

PHASE1_PROMPT="$(cat <<'PROMPT'
You are analyzing a software project's history for an archaeology/retrospective dev log.

Read the file at MANIFEST_PATH. Then read the file at TIMELINE_PATH.

From the timeline, identify:
1. The overall date range of activity
2. Clusters of high activity vs. gaps (quiet periods of 5+ days)
3. What the commit messages and PR titles suggest about major workstreams or phases
4. Any notable branch names and what they imply

Output a structured markdown document with:
- A "Project Vitals" section (date range, total commits, total PRs, contributors)
- A "Phases of Work" section identifying 3-8 apparent phases with date ranges and one-line descriptions
- A "Open Questions" section listing things that aren't clear from structure alone

Be concise. This is a scaffolding document that later analysis will flesh out.
PROMPT
)"

# Substitute actual paths
PHASE1_PROMPT="${PHASE1_PROMPT//MANIFEST_PATH/${DATA_DIR}/manifest.json}"
PHASE1_PROMPT="${PHASE1_PROMPT//TIMELINE_PATH/${DATA_DIR}/timeline.json}"

run_phase 1 "Structural Survey" \
  "$ANALYSIS_DIR/01_structural_survey.md" \
  "$PHASE1_PROMPT"


# ══════════════════════════════════════════════════════════════════
# PHASE 2: Branch Topology Analysis (per repo)
# ══════════════════════════════════════════════════════════════════

for repo_slug in "${REPOS[@]}"; do
  BRANCHES_FILE="${DATA_DIR}/${repo_slug}_branches.json"

  if [[ ! -f "$BRANCHES_FILE" ]]; then
    echo "⚠  No branches file for $repo_slug — run branches.py first"
    continue
  fi

  PHASE2_PROMPT="$(cat <<PROMPT
You are analyzing the branch topology of "${repo_slug//__/\/}" for a retrospective dev log.
The goal: every branch represents a deliberate decision to diverge. Figure out WHY.

Read the structural survey: ${ANALYSIS_DIR}/01_structural_survey.md
Read the branch topology: ${BRANCHES_FILE}

The branches file contains, for each branch:
- branch_name, forked_from, fork_point_date — when and where it diverged
- unique_commit_count and commit_messages — what happened on the branch
- has_pr, pr (title, body, state, merged_at) — if a PR exists, this is the strongest intent signal
- name_category, topic_hint — heuristic guesses from the branch name
- deleted, merged — was it cleaned up or left dangling
- lifespan_days — how long was it active

For EACH branch (excluding the default), write:

### [branch name]
- **Forked from**: {parent} on {date}
- **Evidence of intent**:
  - PR (if exists): summarize the PR title/body as the clearest statement of purpose
  - Branch name signals: what the naming convention suggests
  - First 2-3 commit messages: what the initial work was
- **Best guess why this branch exists**: 1-2 sentences synthesizing all evidence
- **Outcome**: merged / abandoned / still open / deleted without merge
- **Confidence**: high (has PR with description) / medium (name + commits tell a story) / low (unclear)

Then write summary sections:

### Branch Patterns
- Common naming conventions used
- Typical branch lifespan
- Ratio of branches that got merged vs abandoned

### Orphan Branches (no PR, not merged)
These are the most interesting archaeologically — they represent work that was started but
never formally completed. For each, speculate on what happened based on:
- The commit messages
- The timing (did something else start right after this went quiet?)
- Whether similar work appears later on another branch (a restart?)

### Branch Timeline
List branches chronologically by fork date, showing overlapping work.
This reveals periods of parallel development vs focused single-branch work.

Output as markdown.
PROMPT
)"

  run_phase 2 "Branch Topology: $repo_slug" \
    "$ANALYSIS_DIR/02_branches_${repo_slug}.md" \
    "$PHASE2_PROMPT"
done


# ══════════════════════════════════════════════════════════════════
# PHASE 2b: Branch-Aware Commit Narratives (per repo)
# ══════════════════════════════════════════════════════════════════

for repo_slug in "${REPOS[@]}"; do
  DIFFS_FILE="${DATA_DIR}/${repo_slug}_diffs.json"
  COMMITS_FILE="${DATA_DIR}/${repo_slug}_commits.json"
  BRANCHES_FILE="${DATA_DIR}/${repo_slug}_branches.json"
  BRANCH_ANALYSIS="${ANALYSIS_DIR}/02_branches_${repo_slug}.md"

  if [[ ! -f "$DIFFS_FILE" ]]; then
    echo "⚠  No diffs file for $repo_slug, skipping commit narrative"
    continue
  fi

  PHASE2B_PROMPT="$(cat <<PROMPT
You are analyzing the commit history of "${repo_slug//__/\/}" for a retrospective dev log.
IMPORTANT: commits must be understood in the context of their BRANCH, not just their timestamp.

Read these files in order:
1. Structural survey: ${ANALYSIS_DIR}/01_structural_survey.md
2. Branch analysis: ${BRANCH_ANALYSIS}
3. Branch topology (raw): ${BRANCHES_FILE}
4. Diffs: ${DIFFS_FILE}
5. Full commit list: ${COMMITS_FILE}

The branch topology file groups commits BY BRANCH. Use this to understand which branch
each diff belongs to. A commit on a feature branch has different meaning than the same
change on main — it's exploratory vs. landed.

Walk through the work BRANCH BY BRANCH (not purely chronological). For each branch:

1. State the branch's inferred purpose (from the branch analysis)
2. Walk through its commits in order, noting:
   - What changed (from the diff)
   - How it advances (or doesn't) the branch's apparent goal
   - Any mid-branch pivots or surprises
3. If the branch was merged, note what the main branch looked like before and after

For the default branch, separate:
- Direct commits (work done straight on main — why no branch?)
- Merge commits (mark which branch they brought in)

End with a "Development Narrative" section that tells the story as a sequence of
branches, not a sequence of commits. What was the developer working on, then what
did they switch to, and what does the interleaving suggest about priorities?

Output as markdown.
PROMPT
)"

  run_phase 3 "Branch-Aware Commits: $repo_slug" \
    "$ANALYSIS_DIR/03_commits_${repo_slug}.md" \
    "$PHASE2B_PROMPT"
done


# ══════════════════════════════════════════════════════════════════
# PHASE 4: Notes Cross-Reference
# ══════════════════════════════════════════════════════════════════

NOTES_FILE="${DATA_DIR}/notes.json"
DAYS_FILE="${DATA_DIR}/days.json"

if [[ -f "$NOTES_FILE" ]]; then
  PHASE3_PROMPT="$(cat <<PROMPT
You are cross-referencing daily notes with development activity for a retrospective dev log.

Read the structural survey: ${ANALYSIS_DIR}/01_structural_survey.md

Read the daily notes: ${NOTES_FILE}
Read the days-grouped timeline: ${DAYS_FILE}

For each day that has BOTH a note AND development activity (commits or PRs):
1. Quote or summarize the relevant parts of the note
2. List what development happened that day
3. Identify connections — does the note explain a commit? Express frustration that matches a revert? Mention a decision that led to a PR?

Also flag any notes that seem to reference the project but fall on days with NO commits — these might indicate planning, blocked time, or context switches.

Be generous interpreting relevance. Vague references like "worked on the thing," "stuck on auth," or emotional signals ("frustrated," "breakthrough") are valuable.

Output as markdown, organized chronologically.
PROMPT
)"

  run_phase 4 "Notes Cross-Reference" \
    "$ANALYSIS_DIR/04_notes_crossref.md" \
    "$PHASE3_PROMPT"
else
  echo "⏭  No notes.json found, skipping phase 3"
fi


# ══════════════════════════════════════════════════════════════════
# PHASE 5: Claude Logs Analysis
# ══════════════════════════════════════════════════════════════════

CLAUDE_LOGS="${DATA_DIR}/claude_logs.json"

if [[ -f "$CLAUDE_LOGS" ]] && [[ $(wc -c < "$CLAUDE_LOGS") -gt 10 ]]; then
  PHASE4_PROMPT="$(cat <<PROMPT
You are analyzing Claude Code conversation logs from a development project for a retrospective dev log.

Read the structural survey: ${ANALYSIS_DIR}/01_structural_survey.md

Read the Claude logs: ${CLAUDE_LOGS}

These are conversations the developer had with Claude during development. They directly reveal:
- What problems the developer was trying to solve
- What approaches they considered
- Where they got stuck
- Design decisions and tradeoffs they were weighing

For each conversation/session:
1. Summarize what was being discussed
2. What was the developer trying to accomplish?
3. Did they seem to resolve the issue or abandon it?
4. Any notable decisions or pivots visible in the conversation

Then write a "Intent Signals" section summarizing the strongest evidence of developer intent you found across all logs.

Output as markdown.
PROMPT
)"

  run_phase 5 "Claude Logs Analysis" \
    "$ANALYSIS_DIR/05_claude_logs.md" \
    "$PHASE4_PROMPT"
else
  echo "⏭  No Claude logs found, skipping phase 4"
fi


# ══════════════════════════════════════════════════════════════════
# PHASE 6: Synthesis — The Dev Log
# ══════════════════════════════════════════════════════════════════

# Build a list of all analysis files that exist
CONTEXT_FILES=""
for f in "$ANALYSIS_DIR"/0*.md; do
  [[ -f "$f" ]] && CONTEXT_FILES="${CONTEXT_FILES}\n- ${f}"
done

PHASE5_PROMPT="$(cat <<PROMPT
You are writing a retrospective dev log — the final synthesis of a project archaeology effort.

Read ALL of these analysis documents:
$(for f in "$ANALYSIS_DIR"/0*.md; do [[ -f "$f" ]] && echo "- $f"; done)

Now write a dev log in FIRST PERSON RETROSPECTIVE voice ("I started by...", "At this point I was trying to..."). This should read like a thoughtful blog post or project postmortem.

Structure:
1. **Overview**: What was this project? What was I trying to build? (1 paragraph)
2. **Phases**: Break the work into named phases. For each:
   - What I was doing and why
   - Key decisions and what drove them
   - What worked, what didn't, what I abandoned
   Use BRANCHES as the primary structural unit within phases — each branch was a deliberate
   decision to start a workstream. The branch analysis documents contain per-branch intent
   guesses; weave those into the narrative. Orphan branches (no PR, never merged) deserve
   special attention — they're the abandoned experiments and false starts that shape a project.
3. **Threads**: Any recurring themes, patterns, or tensions across the project
4. **Retrospective**: What I'd do differently with hindsight

Rules:
- CLEARLY MARK anything that's inference vs. hard evidence. Use "[inferred]" tags or similar.
- Where notes or Claude logs provide direct evidence of intent, lean on those.
- Where only code/diffs exist, say "based on the code, it appears that..."
- Keep it honest — if something is unclear, say so. Gaps in the record are part of the story.
- Aim for the tone of a developer writing for other developers, not a formal report.

Output as a complete markdown document.
PROMPT
)"

run_phase 6 "Synthesis — Dev Log" \
  "$ANALYSIS_DIR/06_dev_log.md" \
  "$PHASE5_PROMPT"


# ══════════════════════════════════════════════════════════════════
# PHASE 7 (optional): Fact-Check Pass
# ══════════════════════════════════════════════════════════════════

PHASE6_PROMPT="$(cat <<PROMPT
You are doing a fact-check and quality pass on a retrospective dev log.

Read the dev log: ${ANALYSIS_DIR}/06_dev_log.md

Now read the raw data to verify claims:
- Timeline: ${DATA_DIR}/timeline.json
- Check any specific dates, commit descriptions, or sequences mentioned in the dev log

Produce a SHORT review document:
1. Any factual errors (wrong dates, misattributed commits, incorrect sequences)
2. Places where the narrative makes confident claims that should be marked [inferred]
3. Gaps — important events in the timeline that the narrative skipped
4. Suggestions for the strongest 2-3 improvements

Be terse. This is a checklist, not a rewrite.
PROMPT
)"

run_phase 7 "Fact-Check Pass" \
  "$ANALYSIS_DIR/07_fact_check.md" \
  "$PHASE6_PROMPT"


# ══════════════════════════════════════════════════════════════════
# Done
# ══════════════════════════════════════════════════════════════════

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ Pipeline complete                                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Analysis outputs:                                      ║"
for f in "$ANALYSIS_DIR"/*.md; do
  printf "║    %-50s ║\n" "$(basename "$f")"
done
echo "║                                                         ║"
echo "║  Dev log: ${ANALYSIS_DIR}/06_dev_log.md"
echo "║  Review:  ${ANALYSIS_DIR}/07_fact_check.md"
echo "║                                                         ║"
echo "║  Logs for debugging: ${ANALYSIS_DIR}/*.log"
echo "╚══════════════════════════════════════════════════════════╝"