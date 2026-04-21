export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export interface CommitEntry {
  type: "commit";
  timestamp: string;
  repo: string;
  sha: string;
  message: string;
  url: string;
  additions: number | null;
  deletions: number | null;
}

export interface PrEntry {
  type: "pr";
  timestamp: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  url: string;
  body: string;
  head_branch: string | null;
  base_branch: string | null;
}

export type LogEntry = CommitEntry | PrEntry;

export interface LogOutput {
  user: string;
  since: string;
  until: string;
  generated_at: string;
  counts: { prs: number; commits: number; total: number };
  entries: LogEntry[];
}

export interface CommitProvider {
  fetchCommits(user: string, range: DateRange): Promise<CommitEntry[]>;
}

