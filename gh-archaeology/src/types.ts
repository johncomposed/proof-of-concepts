import { z } from "zod";

export const DateRangeSchema = z.object({
  since: z.string(),
  until: z.string(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const BranchBaseSchema = z.object({
  sha: z.string(),
  date: z.string(),
  ahead: z.number(),
});
export type BranchBase = z.infer<typeof BranchBaseSchema>;

export const CommitEntrySchema = z.object({
  type: z.literal("commit"),
  timestamp: z.string(),
  repo: z.string(),
  sha: z.string(),
  message: z.string(),
  url: z.string(),
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
  branch: z.string().nullable(),
  branch_base: BranchBaseSchema.nullable(),
});
export type CommitEntry = z.infer<typeof CommitEntrySchema>;

export const PrEntrySchema = z.object({
  type: z.literal("pr"),
  timestamp: z.string(),
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  merged: z.boolean(),
  merged_at: z.string().nullable(),
  url: z.string(),
  body: z.string(),
  head_branch: z.string().nullable(),
  base_branch: z.string().nullable(),
});
export type PrEntry = z.infer<typeof PrEntrySchema>;

export const LogEntrySchema = z.discriminatedUnion("type", [
  CommitEntrySchema,
  PrEntrySchema,
]);
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogOutputSchema = z.object({
  user: z.string(),
  since: z.string(),
  until: z.string(),
  generated_at: z.string(),
  counts: z.object({
    prs: z.number(),
    commits: z.number(),
    total: z.number(),
  }),
  entries: z.array(LogEntrySchema),
});
export type LogOutput = z.infer<typeof LogOutputSchema>;

// Inner cache value schemas
export const PrBranchesSchema = z.object({
  head: z.string(),
  base: z.string(),
});
export type PrBranches = z.infer<typeof PrBranchesSchema>;

// Composed list schemas used by outer cache memos
export const PrEntryListSchema = z.array(PrEntrySchema);
export const CommitEntryListSchema = z.array(CommitEntrySchema);
export const RepoListSchema = z.array(z.string());

// ── Derived types (output of the derive step) ──────────────────────

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
  // Fork point vs. the default branch, populated from commit branch_base stamps
  // (provided by LocalGitCommitProvider's merge-base pass). Null for the
  // default branch itself or when unresolved.
  forkBase: BranchBase | null;
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
