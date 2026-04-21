#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { requireToken, createOctokit } from "./github/client.js";
import { fetchPrs } from "./github/prs.js";
import { GitHubCommitProvider } from "./providers/github-commits.js";
import { LocalGitCommitProvider } from "./providers/local-git-commits.js";
import { parseDateRange } from "./utils.js";
import type { LogOutput, CommitProvider } from "./types.js";

const { values } = parseArgs({
  options: {
    months: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    out: { type: "string", short: "o" },
    user: { type: "string", short: "u" },
    source: { type: "string", default: "github" },
    "clones-dir": { type: "string" },
    repos: { type: "string" },
  },
});

if (!values.out) {
  console.error(
    "Usage: gh-log --out=<path.json> [--months=N | --start=YYYY-MM-DD --end=YYYY-MM-DD] [--user=login] [--source=github|local] [--clones-dir=path] [--repos=owner/repo,...]",
  );
  process.exit(1);
}

const source = values.source ?? "github";
if (source !== "github" && source !== "local") {
  console.error("--source must be 'github' or 'local'");
  process.exit(1);
}

const token = requireToken();
const octokit = createOctokit(token);

const user =
  values.user ?? (await octokit.rest.users.getAuthenticated()).data.login;

const range = parseDateRange({
  months: values.months,
  start: values.start,
  end: values.end,
});

console.error(`Fetching activity for ${user} from ${range.since} to ${range.until}...`);

let commitProvider: CommitProvider;
if (source === "local") {
  const repos = values.repos?.split(",").filter(Boolean);
  commitProvider = new LocalGitCommitProvider({
    clonesDir: values["clones-dir"] ?? "./clones",
    octokit: repos?.length ? undefined : octokit,
    repos,
  });
} else {
  commitProvider = new GitHubCommitProvider(octokit);
}

const [prs, commits] = await Promise.all([
  fetchPrs(octokit, user, range),
  commitProvider.fetchCommits(user, range),
]);

const entries = [...prs, ...commits].sort((a, b) =>
  a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
);

const output: LogOutput = {
  user,
  since: range.since,
  until: range.until,
  generated_at: new Date().toISOString(),
  counts: { prs: prs.length, commits: commits.length, total: entries.length },
  entries,
};

await writeFile(values.out, JSON.stringify(output, null, 2));
console.error(
  `Wrote ${entries.length} entries (${prs.length} PRs, ${commits.length} commits) to ${values.out}`,
);
