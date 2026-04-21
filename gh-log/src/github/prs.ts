import type { Octokit } from "octokit";
import type { PrEntry, DateRange } from "../types.js";
import { batch } from "../utils.js";

export async function fetchPrs(
  octokit: Octokit,
  user: string,
  range: DateRange,
): Promise<PrEntry[]> {
  const q = `type:pr author:${user} created:${range.since}..${range.until}`;

  const prs: PrEntry[] = [];
  for await (const { data } of octokit.paginate.iterator(
    octokit.rest.search.issuesAndPullRequests,
    { q, per_page: 100, advanced_search: "true" },
  )) {
    for (const pr of data) {
      prs.push({
        type: "pr",
        timestamp: pr.created_at,
        repo: pr.repository_url.replace("https://api.github.com/repos/", ""),
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: Boolean(pr.pull_request?.merged_at),
        merged_at: pr.pull_request?.merged_at ?? null,
        url: pr.html_url,
        body: pr.body ?? "",
        head_branch: null,
        base_branch: null,
      });
    }
  }

  console.error(`Fetching branch info for ${prs.length} PRs...`);
  await batch(prs, 10, async (pr) => {
    try {
      const [owner, repo] = pr.repo.split("/");
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });
      pr.head_branch = data.head.ref;
      pr.base_branch = data.base.ref;
    } catch {}
    return pr;
  });

  return prs;
}
