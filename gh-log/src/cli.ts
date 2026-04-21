#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { requireToken, createOctokit } from "./github/client.js";
import { fetchPrs } from "./github/prs.js";
import { GitHubCommitProvider } from "./providers/github-commits.js";
import { LocalGitCommitProvider } from "./providers/local-git-commits.js";
import { parseDateRange } from "./utils.js";
import { Cache } from "./cache.js";
import { runInteractive } from "./interactive.js";
import type { LogOutput, CommitProvider } from "./types.js";

const DEFAULT_CACHE_FILE = ".cache/gh-log.json";

const { values } = parseArgs({
  options: {
    months: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    out: { type: "string", short: "o" },
    user: { type: "string", short: "u" },
    source: { type: "string" },
    "clones-dir": { type: "string" },
    repos: { type: "string" },
    interactive: { type: "boolean", short: "i" },
    "no-cache": { type: "boolean" },
    "clear-cache": { type: "boolean" },
    "cache-file": { type: "string" },
  },
});

const cacheFile = values["cache-file"] ?? DEFAULT_CACHE_FILE;
const cacheDisabled = values["no-cache"] === true;
const cache = new Cache(cacheFile, cacheDisabled);

if (values["clear-cache"]) {
  await cache.clear();
  console.error(`[cache] cleared ${cacheFile}`);
}

await cache.load();
console.error(
  cacheDisabled
    ? `[cache] disabled (--no-cache)`
    : `[cache] using ${cacheFile}`,
);

// Interactive is the default. Non-interactive is opt-in by passing --out.
// --interactive forces interactive even when --out is given.
const useInteractive = values.interactive || !values.out;

if (useInteractive) {
  await runInteractive(
    {
      months: values.months,
      start: values.start,
      end: values.end,
      out: values.out,
      user: values.user,
      source: values.source,
      clonesDir: values["clones-dir"],
      repos: values.repos,
      cacheFile: values["cache-file"],
      noCache: cacheDisabled,
    },
    cache,
  );
  await cache.save();
  process.exit(0);
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
    cache,
  });
} else {
  commitProvider = new GitHubCommitProvider(octokit, cache);
}

const [prs, commits] = await Promise.all([
  fetchPrs(octokit, user, range, cache),
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

await writeFile(values.out!, JSON.stringify(output, null, 2));
await cache.save();

const s = cache.getStats();
console.error(
  `[cache] ${s.hits} hits${s.supersetHits ? ` (${s.supersetHits} superset)` : ""}, ${s.misses} misses, ${s.writes} writes`,
);
console.error(
  `Wrote ${entries.length} entries (${prs.length} PRs, ${commits.length} commits) to ${values.out}`,
);
