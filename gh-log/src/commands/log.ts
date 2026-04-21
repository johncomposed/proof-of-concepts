import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { requireToken, createOctokit } from "../github/client.js";
import { fetchPrs } from "../github/prs.js";
import { GitHubCommitProvider } from "../providers/github-commits.js";
import {
  LocalGitCommitProvider,
  partitionCloned,
} from "../providers/local-git-commits.js";
import { discoverCommitRepos } from "../github/repos.js";
import { enrichCommitsBranchFromPrs } from "../github/commit-branches.js";
import { parseDateRange } from "../utils.js";
import { Cache } from "../cache.js";
import { runInteractive } from "./log-interactive.js";
import type { LogOutput, CommitProvider } from "../types.js";

const DEFAULT_CACHE_FILE = ".cache/gh-log.json";

const HELP = `gh-log log — timestamped GitHub PR + commit log

Usage:
  gh-log log [options]                      # interactive (default when --out is omitted)
  gh-log log --out=<path.json> [options]    # non-interactive

General:
  -o, --out=<path>        Output JSON file. Omitting this runs the interactive flow.
  -u, --user=<login>      GitHub login. Defaults to the authenticated user.
  -i, --interactive       Force interactive mode even when --out is set.
  -h, --help              Show this message.

Date range (defaults to last 3 months):
  --months=<n>            Last N months.
  --start=<YYYY-MM-DD>    Start date (paired with --end).
  --end=<YYYY-MM-DD>      End date (paired with --start).

Commit source:
  --source=<github|local> Where commit data comes from. Default: github.
  --clones-dir=<path>     Where local clones live. Default: ./clones.
  --repos=<a/b,c/d>       Comma-separated repo list (skips GitHub discovery).
  --no-clone              Local mode: skip repos not already cloned.

Cache:
  --cache-file=<path>     Cache location. Default: .cache/gh-log.json.
  --no-cache              Disable cache reads and writes for this run.
  --clear-cache           Wipe the cache file, then proceed.

Environment:
  GITHUB_TOKEN            Required. A \`.env\` file is auto-loaded if present.

Examples:
  gh-log log                                          # interactive
  gh-log log --out=tmp/log.json --months=6
  gh-log log --out=tmp/log.json --source=local --no-clone
  gh-log log --clear-cache --out=tmp/log.json
`;

export async function run(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      months: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      out: { type: "string", short: "o" },
      user: { type: "string", short: "u" },
      source: { type: "string" },
      "clones-dir": { type: "string" },
      repos: { type: "string" },
      "no-clone": { type: "boolean" },
      interactive: { type: "boolean", short: "i" },
      "no-cache": { type: "boolean" },
      "clear-cache": { type: "boolean" },
      "cache-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

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
        noClone: values["no-clone"] === true,
        cacheFile: values["cache-file"],
        noCache: cacheDisabled,
      },
      cache,
    );
    await cache.save();
    return;
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

  console.error(
    `Fetching activity for ${user} from ${range.since} to ${range.until}...`,
  );

  let commitProvider: CommitProvider;
  let repoFilter: Set<string> | null = null;
  if (source === "local") {
    const clonesDir = values["clones-dir"] ?? "./clones";
    let repos = values.repos?.split(",").filter(Boolean);
    if (!repos?.length) {
      repos = await discoverCommitRepos(octokit, user, range, cache);
    }
    if (values["no-clone"]) {
      const { cloned, missing } = await partitionCloned(clonesDir, repos);
      if (missing.length) {
        console.error(
          `[local] --no-clone: skipping ${missing.length} uncloned repos`,
        );
      }
      repos = cloned;
    }
    repoFilter = new Set(repos);
    commitProvider = new LocalGitCommitProvider({
      clonesDir,
      repos,
      cache,
    });
  } else {
    commitProvider = new GitHubCommitProvider(octokit, cache);
  }

  const [allPrs, commits] = await Promise.all([
    fetchPrs(octokit, user, range, cache),
    commitProvider.fetchCommits(user, range),
  ]);

  const prs = repoFilter
    ? allPrs.filter((p) => repoFilter!.has(p.repo))
    : allPrs;
  if (repoFilter && prs.length < allPrs.length) {
    console.error(
      `[local] filtered out ${allPrs.length - prs.length} PRs from unanalyzed repos`,
    );
  }

  if (source === "github") {
    await enrichCommitsBranchFromPrs(octokit, commits, prs, cache);
  }

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
}
