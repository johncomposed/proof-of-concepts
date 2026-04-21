#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Octokit } from "octokit";

const { values } = parseArgs({
  options: {
    months: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    out: { type: "string", short: "o" },
    user: { type: "string", short: "u" },
  },
});

if (!values.out) {
  console.error("Usage: gh-log --out=<path.json> [--months=N | --start=YYYY-MM-DD --end=YYYY-MM-DD] [--user=login]");
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN env var is required");
  process.exit(1);
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

let since, until;
if (values.start || values.end) {
  if (!values.start || !values.end) {
    console.error("--start and --end must be provided together");
    process.exit(1);
  }
  since = values.start;
  until = values.end;
} else {
  const months = Number(values.months ?? 3);
  if (!Number.isFinite(months) || months <= 0) {
    console.error("--months must be a positive number");
    process.exit(1);
  }
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  since = toIso(start);
  until = toIso(end);
}

const octokit = new Octokit({ auth: token });

const user = values.user ?? (await octokit.rest.users.getAuthenticated()).data.login;

console.error(`Fetching activity for ${user} from ${since} to ${until}...`);

const prQuery = `type:pr author:${user} created:${since}..${until}`;
const commitQuery = `author:${user} committer-date:${since}..${until}`;

const prs = [];
for await (const { data } of octokit.paginate.iterator(octokit.rest.search.issuesAndPullRequests, {
  q: prQuery,
  per_page: 100,
  advanced_search: "true",
})) {
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
    });
  }
}

const commits = [];
for await (const { data } of octokit.paginate.iterator(octokit.rest.search.commits, {
  q: commitQuery,
  per_page: 100,
  sort: "committer-date",
  order: "desc",
})) {
  for (const c of data) {
    commits.push({
      type: "commit",
      timestamp: c.commit.committer?.date ?? c.commit.author?.date,
      repo: c.repository.full_name,
      sha: c.sha,
      message: c.commit.message,
      url: c.html_url,
    });
  }
}

const entries = [...prs, ...commits].sort((a, b) =>
  a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
);

const output = {
  user,
  since,
  until,
  generated_at: new Date().toISOString(),
  counts: { prs: prs.length, commits: commits.length, total: entries.length },
  entries,
};

await writeFile(values.out, JSON.stringify(output, null, 2));
console.error(`Wrote ${entries.length} entries (${prs.length} PRs, ${commits.length} commits) to ${values.out}`);
