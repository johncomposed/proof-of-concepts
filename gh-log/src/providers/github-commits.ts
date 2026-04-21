import type { Octokit } from "octokit";
import type { CommitEntry, DateRange, CommitProvider } from "../types.js";
import { CommitEntryListSchema, CommitStatsSchema } from "../types.js";
import type { Cache } from "../cache.js";
import { batch } from "../utils.js";

export class GitHubCommitProvider implements CommitProvider {
  constructor(
    private octokit: Octokit,
    private cache: Cache,
  ) {}

  async fetchCommits(user: string, range: DateRange): Promise<CommitEntry[]> {
    return this.cache.memoRange(
      `commits:${user}`,
      CommitEntryListSchema,
      range,
      (c) => c.timestamp,
      async (r) => {
        const q = `author:${user} committer-date:${r.since}..${r.until}`;

        const commits: CommitEntry[] = [];
        for await (const { data } of this.octokit.paginate.iterator(
          this.octokit.rest.search.commits,
          { q, per_page: 100, sort: "committer-date", order: "desc" },
        )) {
          for (const c of data) {
            commits.push({
              type: "commit",
              timestamp:
                c.commit.committer?.date ?? c.commit.author?.date ?? "",
              repo: c.repository.full_name,
              sha: c.sha,
              message: c.commit.message,
              url: c.html_url,
              additions: null,
              deletions: null,
              branch: null,
            });
          }
        }

        console.error(`Fetching diff stats for ${commits.length} commits...`);
        await batch(commits, 10, async (c) => {
          try {
            const stats = await this.cache.memo(
              `commit-stats:${c.repo}@${c.sha}`,
              CommitStatsSchema,
              async () => {
                const [owner, repoName] = c.repo.split("/");
                const { data } = await this.octokit.rest.repos.getCommit({
                  owner,
                  repo: repoName,
                  ref: c.sha,
                });
                return {
                  additions: data.stats?.additions ?? null,
                  deletions: data.stats?.deletions ?? null,
                };
              },
            );
            c.additions = stats.additions;
            c.deletions = stats.deletions;
          } catch {}
          return c;
        });

        return commits;
      },
    );
  }
}
