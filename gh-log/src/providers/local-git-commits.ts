import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Octokit } from "octokit";
import type { CommitEntry, DateRange, CommitProvider } from "../types.js";
import type { Cache } from "../cache.js";
import { discoverCommitRepos } from "../github/repos.js";

const execFile = promisify(execFileCb);

export async function partitionCloned(
  clonesDir: string,
  repos: string[],
): Promise<{ cloned: string[]; missing: string[] }> {
  const cloned: string[] = [];
  const missing: string[] = [];
  await Promise.all(
    repos.map(async (r) => {
      try {
        await access(path.join(clonesDir, r));
        cloned.push(r);
      } catch {
        missing.push(r);
      }
    }),
  );
  return { cloned, missing };
}

export class LocalGitCommitProvider implements CommitProvider {
  private clonesDir: string;
  private octokit: Octokit | null;
  private repos: string[];
  private cache: Cache;

  constructor(opts: {
    clonesDir?: string;
    octokit?: Octokit;
    repos?: string[];
    cache: Cache;
  }) {
    this.clonesDir = opts.clonesDir ?? "./clones";
    this.octokit = opts.octokit ?? null;
    this.repos = opts.repos ?? [];
    this.cache = opts.cache;
  }

  async fetchCommits(user: string, range: DateRange): Promise<CommitEntry[]> {
    const repos = await this.resolveRepos(user, range);

    const commits: CommitEntry[] = [];
    for (const repo of repos) {
      const repoDir = path.join(this.clonesDir, repo);
      await this.ensureClone(repo, repoDir);
      const parsed = await this.gitLog(repoDir, repo, user, range);
      for (const c of parsed) {
        commits.push({ ...c, repo });
      }
    }

    return commits;
  }

  private async resolveRepos(
    user: string,
    range: DateRange,
  ): Promise<string[]> {
    if (this.repos.length > 0) return this.repos;

    if (!this.octokit) {
      console.error(
        "LocalGitCommitProvider requires either --repos or a GITHUB_TOKEN to discover repos",
      );
      process.exit(1);
    }

    const repos = await discoverCommitRepos(
      this.octokit,
      user,
      range,
      this.cache,
    );
    console.error(`Discovered ${repos.length} repos from GitHub search`);
    return repos;
  }

  private async ensureClone(repo: string, repoDir: string): Promise<void> {
    try {
      await access(repoDir);
      console.error(`Fetching ${repo}...`);
      await execFile("git", ["fetch", "--all", "--quiet"], { cwd: repoDir });
    } catch {
      console.error(`Cloning ${repo}...`);
      await mkdir(path.dirname(repoDir), { recursive: true });
      await execFile("git", [
        "clone",
        "--quiet",
        `https://github.com/${repo}.git`,
        repoDir,
      ]);
    }
  }

  private async gitLog(
    repoDir: string,
    repoName: string,
    user: string,
    range: DateRange,
  ): Promise<Omit<CommitEntry, "repo">[]> {
    const sep = "---COMMIT_SEP---";
    const format = ["%H", "%aI", "%B"].join("%n");

    const { stdout } = await execFile(
      "git",
      [
        "log",
        "--all",
        `--author=${user}`,
        `--since=${range.since}`,
        `--until=${range.until}`,
        `--format=${sep}%n${format}`,
        "--shortstat",
      ],
      { cwd: repoDir, maxBuffer: 50 * 1024 * 1024 },
    );

    const entries: Omit<CommitEntry, "repo">[] = [];
    const blocks = stdout.split(sep).filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.split("\n");
      let idx = 0;
      while (idx < lines.length && !lines[idx].trim()) idx++;

      const sha = lines[idx++]?.trim();
      const timestamp = lines[idx++]?.trim();
      if (!sha || !timestamp) continue;

      const messageLines: string[] = [];
      while (idx < lines.length) {
        const line = lines[idx];
        if (/\d+ files? changed/.test(line)) break;
        messageLines.push(line);
        idx++;
      }
      const message = messageLines.join("\n").trim();

      let additions: number | null = null;
      let deletions: number | null = null;
      if (idx < lines.length) {
        const statLine = lines[idx];
        const addMatch = statLine.match(/(\d+) insertion/);
        const delMatch = statLine.match(/(\d+) deletion/);
        if (addMatch) additions = Number(addMatch[1]);
        if (delMatch) deletions = Number(delMatch[1]);
      }

      entries.push({
        type: "commit",
        timestamp,
        sha,
        message,
        url: `https://github.com/${repoName}/commit/${sha}`,
        additions,
        deletions,
      });
    }

    return entries;
  }
}
