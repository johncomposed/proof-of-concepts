import { z } from "zod";
import {
  LogOutput,
  LogOutputSchema,
  LogEntry,
  CommitEntry,
  PrEntry,
} from "./types.js";

// ── Branch topology derived from LogOutput ────────────────────────

const BRANCH_PATTERNS: [RegExp, string][] = [
  [/^(feat|feature)[/-]/i, "feature development"],
  [/^(fix|bugfix|hotfix)[/-]/i, "bug fix"],
  [/^(refactor|cleanup|chore)[/-]/i, "refactoring / maintenance"],
  [/^(experiment|try|spike|poc|proto)[/-]/i, "experiment / spike"],
  [/^(wip|draft)[/-]/i, "work in progress"],
  [/^(release|v\d|deploy)[/-]/i, "release preparation"],
  [/^(test|ci|cd)[/-]/i, "testing / CI"],
  [/^(docs?)[/-]/i, "documentation"],
  [/^(migrate|migration|upgrade)[/-]/i, "migration / upgrade"],
  [/^(revert)[/-]/i, "reverting a change"],
  [/^(dependabot|renovate|bump)[/-]/i, "automated dependency update"],
  [/^(claude)[/-]/i, "claude-generated"],
];

function classifyBranch(name: string): {
  category: string;
  topic: string;
} {
  for (const [pat, label] of BRANCH_PATTERNS) {
    if (pat.test(name)) {
      const topic = name
        .replace(
          /^(feat|feature|fix|bugfix|hotfix|refactor|chore|experiment|wip|draft|release|test|docs?|migrate|claude)[/-]/i,
          ""
        );
      return { category: label, topic };
    }
  }
  return { category: "", topic: name };
}

export interface DerivedBranch {
  name: string;
  repo: string;
  commits: CommitEntry[];
  prs: PrEntry[];
  firstCommitDate: string | null;
  lastCommitDate: string | null;
  lifespanDays: number | null;
  category: string;
  topic: string;
  merged: boolean;
  hasPr: boolean;
  isOrphan: boolean;
}

export interface DerivedRepo {
  repo: string;
  branches: DerivedBranch[];
  defaultBranch: string | null;
  commitCount: number;
  prCount: number;
  orphanBranches: string[];
}

export interface DayCluster {
  date: string;
  entries: LogEntry[];
}

export interface Manifest {
  user: string;
  since: string;
  until: string;
  generatedAt: string;
  repos: string[];
  stats: {
    totalEntries: number;
    totalDays: number;
    totalRepos: number;
    totalBranches: number;
    dateRange: [string, string] | [];
  };
}

export interface RepoManifest {
  repo: string;
  slug: string;
  since: string;
  until: string;
  commitCount: number;
  prCount: number;
  branchCount: number;
  orphanCount: number;
  dateRange: [string, string] | [];
  activeDays: number;
}

export interface DerivedData {
  log: LogOutput;
  repos: DerivedRepo[];
  days: DayCluster[];
  manifest: Manifest;
  repoManifests: RepoManifest[];
}

export function repoSlug(repo: string): string {
  return repo.replace("/", "__");
}

export function deriveFromLog(log: LogOutput): DerivedData {
  const entries = log.entries;

  // Group entries by repo
  const byRepo = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const list = byRepo.get(e.repo) ?? [];
    list.push(e);
    byRepo.set(e.repo, list);
  }

  const repos: DerivedRepo[] = [];

  for (const [repoName, repoEntries] of byRepo) {
    const commits = repoEntries.filter((e): e is CommitEntry => e.type === "commit");
    const prs = repoEntries.filter((e): e is PrEntry => e.type === "pr");

    // Group commits by branch
    const commitsByBranch = new Map<string, CommitEntry[]>();
    for (const c of commits) {
      const branch = c.branch ?? "(no branch)";
      const list = commitsByBranch.get(branch) ?? [];
      list.push(c);
      commitsByBranch.set(branch, list);
    }

    // Build PR lookup by head_branch
    const prsByHead = new Map<string, PrEntry[]>();
    for (const p of prs) {
      if (p.head_branch) {
        const list = prsByHead.get(p.head_branch) ?? [];
        list.push(p);
        prsByHead.set(p.head_branch, list);
      }
    }

    // Also add branches that only appear as PR head_branches
    for (const p of prs) {
      if (p.head_branch && !commitsByBranch.has(p.head_branch)) {
        commitsByBranch.set(p.head_branch, []);
      }
    }

    // Guess default branch
    const defaultCandidates = ["main", "master"];
    const defaultBranch =
      defaultCandidates.find((n) => commitsByBranch.has(n)) ?? null;

    const branches: DerivedBranch[] = [];

    for (const [branchName, branchCommits] of commitsByBranch) {
      const sorted = [...branchCommits].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const matchedPrs = prsByHead.get(branchName) ?? [];
      const merged =
        matchedPrs.some((p) => p.merged) ||
        false;
      const { category, topic } = classifyBranch(branchName);

      let lifespanDays: number | null = null;
      const first = sorted[0]?.timestamp ?? null;
      const last = sorted[sorted.length - 1]?.timestamp ?? null;
      if (first && last) {
        const ms = new Date(last).getTime() - new Date(first).getTime();
        lifespanDays = Math.round(ms / (1000 * 60 * 60 * 24));
      }

      const isDefault = branchName === defaultBranch;
      const hasPr = matchedPrs.length > 0;
      const isOrphan = !isDefault && !hasPr && !merged;

      branches.push({
        name: branchName,
        repo: repoName,
        commits: sorted,
        prs: matchedPrs,
        firstCommitDate: first,
        lastCommitDate: last,
        lifespanDays,
        category,
        topic,
        merged,
        hasPr,
        isOrphan,
      });
    }

    branches.sort((a, b) => {
      const da = a.firstCommitDate ?? "9999";
      const db = b.firstCommitDate ?? "9999";
      return da.localeCompare(db);
    });

    repos.push({
      repo: repoName,
      branches,
      defaultBranch,
      commitCount: commits.length,
      prCount: prs.length,
      orphanBranches: branches
        .filter((b) => b.isOrphan)
        .map((b) => b.name),
    });
  }

  // Day clusters
  const byDay = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const day = e.timestamp.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));

  // Per-repo manifests
  const repoManifests: RepoManifest[] = repos.map((r) => {
    const repoEntries = byRepo.get(r.repo) ?? [];
    const repoDays = new Set<string>();
    for (const e of repoEntries) {
      repoDays.add(e.timestamp.slice(0, 10));
    }
    const sorted = [...repoEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {
      repo: r.repo,
      slug: repoSlug(r.repo),
      since: log.since,
      until: log.until,
      commitCount: r.commitCount,
      prCount: r.prCount,
      branchCount: r.branches.length,
      orphanCount: r.orphanBranches.length,
      dateRange:
        sorted.length > 0
          ? [sorted[0].timestamp.slice(0, 10), sorted[sorted.length - 1].timestamp.slice(0, 10)]
          : [],
      activeDays: repoDays.size,
    };
  });

  // Global manifest
  const allBranches = repos.flatMap((r) => r.branches);
  const manifest: Manifest = {
    user: log.user,
    since: log.since,
    until: log.until,
    generatedAt: log.generated_at,
    repos: repos.map((r) => r.repo),
    stats: {
      totalEntries: entries.length,
      totalDays: days.length,
      totalRepos: repos.length,
      totalBranches: allBranches.length,
      dateRange:
        entries.length > 0
          ? [entries[0].timestamp.slice(0, 10), entries[entries.length - 1].timestamp.slice(0, 10)]
          : [],
    },
  };

  return { log, repos, days, manifest, repoManifests };
}
