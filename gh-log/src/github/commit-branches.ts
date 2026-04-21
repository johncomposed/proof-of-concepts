import type { Octokit } from "octokit";
import type { CommitEntry, PrEntry } from "../types.js";
import { ShaListSchema } from "../types.js";
import type { Cache } from "../cache.js";
import { batch } from "../utils.js";

/**
 * For GitHub mode: fetch each PR's commit SHAs (cached per PR), build a
 * sha -> head_branch map, and stamp each commit's `branch` field.
 * Commits not referenced by any of the supplied PRs are left at null.
 */
export async function enrichCommitsBranchFromPrs(
  octokit: Octokit,
  commits: CommitEntry[],
  prs: PrEntry[],
  cache: Cache,
): Promise<void> {
  if (commits.length === 0 || prs.length === 0) return;

  const shaToBranch = new Map<string, string>();

  await batch(prs, 10, async (pr) => {
    if (!pr.head_branch) return pr;
    const shas = await cache.memo(
      `pr-commits:${pr.repo}#${pr.number}`,
      ShaListSchema,
      async () => {
        try {
          const [owner, repoName] = pr.repo.split("/");
          const collected: string[] = [];
          for await (const { data } of octokit.paginate.iterator(
            octokit.rest.pulls.listCommits,
            { owner, repo: repoName, pull_number: pr.number, per_page: 100 },
          )) {
            for (const c of data) collected.push(c.sha);
          }
          return collected;
        } catch {
          return [];
        }
      },
    );
    for (const sha of shas) {
      if (!shaToBranch.has(sha)) shaToBranch.set(sha, pr.head_branch);
    }
    return pr;
  });

  for (const c of commits) {
    if (c.branch) continue;
    const branch = shaToBranch.get(c.sha);
    if (branch) c.branch = branch;
  }
}
