import type { Octokit } from "octokit";
import type { CommitEntry, DateRange, CommitProvider } from "../types.js";
import { batch } from "../utils.js";

export class GitHubCommitProvider implements CommitProvider {
  constructor(private octokit: Octokit) {}

  async fetchCommits(user: string, range: DateRange): Promise<CommitEntry[]> {
    const q = `author:${user} committer-date:${range.since}..${range.until}`;

    const commits: CommitEntry[] = [];
    for await (const { data } of this.octokit.paginate.iterator(
      this.octokit.rest.search.commits,
      { q, per_page: 100, sort: "committer-date", order: "desc" },
    )) {
      for (const c of data) {
        commits.push({
          type: "commit",
          timestamp: c.commit.committer?.date ?? c.commit.author?.date ?? "",
          repo: c.repository.full_name,
          sha: c.sha,
          message: c.commit.message,
          url: c.html_url,
          additions: null,
          deletions: null,
        });
      }
    }

    console.error(`Fetching diff stats for ${commits.length} commits...`);
    await batch(commits, 10, async (c) => {
      try {
        const [owner, repo] = c.repo.split("/");
        const { data } = await this.octokit.rest.repos.getCommit({
          owner,
          repo,
          ref: c.sha,
        });
        c.additions = data.stats?.additions ?? null;
        c.deletions = data.stats?.deletions ?? null;
      } catch {}
      return c;
    });

    return commits;
  }
}
