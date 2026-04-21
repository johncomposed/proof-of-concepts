import { z } from "zod";

export const DateRangeSchema = z.object({
  since: z.string(),
  until: z.string(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

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
});
export type CommitEntry = z.infer<typeof CommitEntrySchema>;

// Schema for the list of SHAs that belong to a given PR's head branch.
// Used to map commit sha -> PR head branch on the GitHub side.
export const ShaListSchema = z.array(z.string());

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

export const CommitStatsSchema = z.object({
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
});
export type CommitStats = z.infer<typeof CommitStatsSchema>;

// Composed list schemas used by outer cache memos
export const PrEntryListSchema = z.array(PrEntrySchema);
export const CommitEntryListSchema = z.array(CommitEntrySchema);
export const RepoListSchema = z.array(z.string());

export interface CommitProvider {
  fetchCommits(user: string, range: DateRange): Promise<CommitEntry[]>;
}
