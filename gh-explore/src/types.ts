import type { LogOutput, LogEntry, CommitEntry, PrEntry } from "./log-types.js";

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
