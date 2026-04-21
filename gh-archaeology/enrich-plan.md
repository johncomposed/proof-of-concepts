# Enriched Derive Step: Clone-Based Multi-Lens Analysis

## Context

The current derive step works purely from a flat `log.json` of commits and PRs, using branches as the sole primary lens. With local clones now available under `./clones/{owner}/{repoName}/`, we can extract much richer data — file-level stats, component structure, fork points — that gives a more complete picture of what was actually built. The goal is to shift to a **multi-lens model** where branches are one signal among several (file churn, component coupling, work sessions), without losing the branch-level intent signals that are already working.

## Approach

A new `src/clone-enrich.ts` module runs as a **second pass** after `deriveFromLog()`. It opens each local clone, extracts file-level and structural data, and returns an `EnrichedDerivedData` that extends the existing `DerivedData`. The harness then weaves this enrichment into phase prompts alongside the existing branch data.


## New Types (`src/types.ts`)

```ts
interface FileStats {
  path: string
  totalCommits: number
  totalAdditions: number
  totalDeletions: number
  firstSeen: string          // ISO date
  lastModified: string
  branches: string[]         // which branches touched this file
}

interface FileCluster {
  label: string              // directory prefix or inferred component name
  files: string[]
  totalCommits: number       // commits touching 2+ files in this cluster
  peakActivity: string       // date of densest activity
}

interface ForkPoint {
  branch: string
  baseBranch: string
  forkCommit: string | null  // SHA from git merge-base
  forkDate: string | null
  aheadCount: number
  behindCount: number
}

interface CloneEnrichment {
  repo: string
  clonePath: string
  fileStats: FileStats[]
  fileClusters: FileCluster[]
  forkPoints: ForkPoint[]
  directoryTree: string[]    // current file listing, top 2 levels
  totalFilesEver: number
  totalFilesNow: number
}

interface EnrichedDayCluster extends DayCluster {
  filesChanged: string[]
  hotFiles: string[]         // top 3 most-churned files this day
  componentsTouched: string[]
}

interface EnrichedDerivedData extends DerivedData {
  enrichments: CloneEnrichment[]
  enrichedDays: EnrichedDayCluster[]
}
```

## New Module: `src/clone-enrich.ts`

### Entry point
```
enrichFromClones(data: DerivedData, clonesRoot: string): Promise<EnrichedDerivedData>
```
- Iterates `data.repos`, resolves clone path per repo
- Runs per-repo enrichment in parallel via `Promise.all`
- Enriches day clusters with file-level context
- Skips repos where clone doesn't exist (logs warning)

### Per-repo git operations (4 operations per clone)

1. **`git log --all --numstat`** — single call, highest value. Returns every file touched by every commit with +/- counts. From this one output, derive:
   - `FileStats[]` — per-file aggregate churn
   - Co-change data — files appearing in the same commit
   - Per-commit file lists (stored for later use in Phase 3 prompts)

2. **`git merge-base`** per non-default branch — fork point detection. Also `git rev-list --count --left-right` for ahead/behind. O(branches) calls, fine for typical repos.

3. **`git ls-tree -r --name-only HEAD`** — current directory structure, truncated to depth 2.

4. **File clustering** (pure computation) — group by directory prefix (2 levels), then identify cross-directory coupling from co-change data.

### Budget-aware truncation (at enrichment time, not prompt time)

| Data | Limit | Rationale |
|------|-------|-----------|
| FileStats | Top 50 by commit count | Covers the meaningful files |
| FileClusters | Max 15 | More than enough for component overview |
| Per-commit file lists | Top 5 files per commit | Avoids context explosion |
| Directory tree | Depth 2 | Orientation, not exhaustive listing |
| Hot files per day | Top 3 | Signal, not noise |

## Harness Changes (`src/harness.ts`)

### Phase 1 (Structural Survey) — gains the most
Add to prompt:
- Directory tree (20-50 lines) — immediate orientation
- Top 20 file stats by churn — what was actually built and what was hard
- File clusters — reveals component architecture

### Phase 2 (Branch Topology) — gains fork points
Add per-branch:
- Fork point: where it diverged, ahead/behind counts (2 lines per branch)

### Phase 3 (Commit Narratives) — gains file-level detail
Change commit format from `sha date [+N/-M] message` to:
```
sha date "message"
    path/to/file.ts (+142/-89), path/to/other.ts (+34/-12)
```
Cap at 5 files per commit.

### Phase 6 (Synthesis) — gains component vocabulary
Add per-repo component summary from file clusters. Enriched timeline showing which components were active per day.

### Phase 7 (Fact-Check) — no changes
Already reads the dev log and verifies against raw data.

## Integration Points

### `src/commands/derive.ts`
- After `deriveFromLog(log)`, call `enrichFromClones(data, "./clones")`
- Write `{repoDir}/enrichment.json` alongside existing outputs

### `src/commands/analyze.ts`
- Pass `EnrichedDerivedData` to harness (extends DerivedData, backward compatible)
- No changes needed if enrichment is missing — prompts fall back gracefully

## Files to Create/Modify

| File | Action |
|------|--------|
| `package.json` | Add `simple-git` dependency |
| `src/types.ts` | Add FileStats, FileCluster, ForkPoint, CloneEnrichment, EnrichedDayCluster, EnrichedDerivedData |
| `src/clone-enrich.ts` | **New** — all git operations, parsing, clustering, enrichment logic |
| `src/commands/derive.ts` | Wire `enrichFromClones` after `deriveFromLog`, write enrichment JSON |
| `src/harness.ts` | Add enrichment formatters, update `buildPrompt` for phases 1/2/3/6 |
| `src/commands/analyze.ts` | Thread `EnrichedDerivedData` through to harness |

## Verification

1. Run `pnpm dev derive tmp/log.json` — should produce enrichment.json files per repo alongside existing outputs
2. Inspect enrichment.json for a repo — verify file stats, clusters, fork points look reasonable
3. Run `pnpm dev analyze tmp/log.json` for a single repo — verify enriched data appears in phase prompts
4. Check that analyze still works if clones dir is missing (graceful fallback)
