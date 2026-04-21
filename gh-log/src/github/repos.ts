import type { Octokit } from "octokit";
import type { DateRange } from "../types.js";
import { RepoListSchema } from "../types.js";
import type { Cache } from "../cache.js";

export async function discoverCommitRepos(
  octokit: Octokit,
  user: string,
  range: DateRange,
  cache: Cache,
): Promise<string[]> {
  return cache.memo(
    `repos:${user}:${range.since}..${range.until}`,
    RepoListSchema,
    async () => {
      const q = `author:${user} committer-date:${range.since}..${range.until}`;
      const repoSet = new Set<string>();
      for await (const { data } of octokit.paginate.iterator(
        octokit.rest.search.commits,
        { q, per_page: 100, sort: "committer-date", order: "desc" },
      )) {
        for (const c of data) {
          repoSet.add(c.repository.full_name);
        }
      }
      return [...repoSet];
    },
  );
}
