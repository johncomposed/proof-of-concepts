import { writeFile } from "node:fs/promises";
import {
  intro,
  outro,
  select,
  text,
  multiselect,
  confirm,
  spinner,
  isCancel,
  cancel,
  note,
} from "@clack/prompts";
import { createOctokit, requireToken } from "../github/client.js";
import { fetchPrs } from "../github/prs.js";
import { discoverCommitRepos } from "../github/repos.js";
import {
  LocalGitCommitProvider,
  partitionCloned,
} from "../providers/local-git-commits.js";
import type { Cache } from "../cache.js";
import type { DateRange, LogOutput } from "../types.js";
import { z } from "zod";

interface Defaults {
  months?: string;
  start?: string;
  end?: string;
  out?: string;
  user?: string;
  clonesDir?: string;
  repos?: string;
  noClone?: boolean;
  cacheFile?: string;
  noCache?: boolean;
}

function bail<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled");
    process.exit(0);
  }
  return value;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface ChosenOptions {
  out: string;
  user: string;
  authedUser: string;
  rangeType: "months" | "explicit";
  months?: string;
  range: DateRange;
  clonesDir: string;
  repos?: string[];
  reposIsExplicitSubset: boolean;
  noClone: boolean;
  cacheFile?: string;
  noCache: boolean;
}

function formatCliCommand(opts: ChosenOptions): string {
  const args: string[] = [`--out=${opts.out}`];

  if (opts.user !== opts.authedUser) args.push(`--user=${opts.user}`);

  if (opts.rangeType === "months" && opts.months && opts.months !== "3") {
    args.push(`--months=${opts.months}`);
  } else if (opts.rangeType === "explicit") {
    args.push(`--start=${opts.range.since}`);
    args.push(`--end=${opts.range.until}`);
  }

  if (opts.clonesDir !== "./clones") {
    args.push(`--clones-dir=${opts.clonesDir}`);
  }
  if (opts.noClone) args.push(`--no-clone`);
  if (opts.reposIsExplicitSubset && opts.repos?.length) {
    args.push(`--repos=${opts.repos.join(",")}`);
  }

  if (opts.cacheFile) args.push(`--cache-file=${opts.cacheFile}`);
  if (opts.noCache) args.push(`--no-cache`);

  return `pnpm dev log ${args.join(" ")}`;
}

export async function runInteractive(
  defaults: Defaults,
  cache: Cache,
): Promise<void> {
  intro("gh-archaeology log");

  const cacheStats = cache.getStats();
  note(
    cacheStats.disabled
      ? "Cache disabled (--no-cache)"
      : `Cache enabled${defaults.cacheFile ? ` (${defaults.cacheFile})` : ""}`,
    "cache",
  );

  const token = requireToken();
  const octokit = createOctokit(token);

  const authSpin = spinner();
  authSpin.start("Authenticating with GitHub");
  const hitsBeforeAuth = cache.getStats().hits;
  const authedUser = await cache.memo(
    "auth-user",
    z.string(),
    async () => (await octokit.rest.users.getAuthenticated()).data.login,
  );
  const authFromCache = cache.getStats().hits > hitsBeforeAuth;
  authSpin.stop(
    `Signed in as ${authedUser}${authFromCache ? " (from cache)" : ""}`,
  );

  const user = bail(
    await text({
      message: "GitHub user to query",
      initialValue: defaults.user ?? authedUser,
    }),
  );

  const rangeType = bail(
    await select<"months" | "explicit">({
      message: "Date range",
      options: [
        { value: "months", label: "Last N months" },
        { value: "explicit", label: "Explicit start/end dates" },
      ],
      initialValue: defaults.start || defaults.end ? "explicit" : "months",
    }),
  );

  let range: DateRange;
  let monthsValue: string | undefined;
  if (rangeType === "months") {
    monthsValue = bail(
      await text({
        message: "How many months back?",
        initialValue: defaults.months ?? "3",
        validate: (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) return "Must be a positive number";
        },
      }),
    );
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - Number(monthsValue));
    range = { since: toIso(start), until: toIso(end) };
  } else {
    const since = bail(
      await text({
        message: "Start date (YYYY-MM-DD)",
        initialValue: defaults.start ?? "",
        validate: (v) => {
          if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Must be YYYY-MM-DD";
        },
      }),
    );
    const until = bail(
      await text({
        message: "End date (YYYY-MM-DD)",
        initialValue: defaults.end ?? toIso(new Date()),
        validate: (v) => {
          if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Must be YYYY-MM-DD";
        },
      }),
    );
    range = { since, until };
  }

  let reposIsExplicitSubset = false;
  let noClone = defaults.noClone ?? false;
  let clonesDir = defaults.clonesDir ?? "./clones";

  clonesDir = bail(
    await text({
      message: "Clones directory",
      initialValue: clonesDir,
    }),
  );

  const s = spinner();
  s.start(`Discovering repos ${user} committed to`);
  const hitsBefore = cache.getStats().hits;
  const discovered = await discoverCommitRepos(octokit, user, range, cache);
  const fromCache = cache.getStats().hits > hitsBefore;
  s.stop(
    `Found ${discovered.length} repos${fromCache ? " (from cache)" : " (from GitHub)"}`,
  );

  if (discovered.length === 0) {
    note("No commits found in this range. Exiting.");
    outro("Done");
    return;
  }

  const { cloned, missing } = await partitionCloned(clonesDir, discovered);

  note(
    `${cloned.length} already cloned\n${missing.length} not yet cloned`,
    "repos",
  );

  let pool: string[];
  if (missing.length === 0) {
    pool = cloned;
  } else {
    const doClone = bail(
      await confirm({
        message: `Clone the ${missing.length} missing repo${missing.length === 1 ? "" : "s"}?`,
        initialValue: !noClone,
      }),
    );
    if (doClone) {
      pool = discovered;
      noClone = false;
    } else {
      pool = cloned;
      noClone = true;
    }
  }

  if (pool.length === 0) {
    note("No repos available. Exiting.");
    outro("Done");
    return;
  }

  const pickSubset = bail(
    await confirm({
      message: `Pick a subset of the ${pool.length} repo${pool.length === 1 ? "" : "s"}?`,
      initialValue: false,
    }),
  );

  let selectedRepos: string[];
  if (pickSubset) {
    const picked = bail(
      await multiselect<string>({
        message: "Select repos to include",
        options: pool.map((r) => ({ value: r, label: r })),
        initialValues: pool,
        required: true,
      }),
    );
    selectedRepos = picked;
    reposIsExplicitSubset = true;
  } else {
    selectedRepos = pool;
  }

  const out = bail(
    await text({
      message: "Output JSON path",
      initialValue: defaults.out ?? "tmp/log.json",
    }),
  );

  const commitProvider = new LocalGitCommitProvider({
    clonesDir,
    repos: selectedRepos,
    cache,
  });

  const statsBefore = cache.getStats();

  const prSpin = spinner();
  prSpin.start("Fetching PRs");
  const allPrs = await fetchPrs(octokit, user, range, cache);
  const prsAfter = cache.getStats();
  const prsHit = prsAfter.hits > statsBefore.hits;

  const repoFilter = new Set(selectedRepos);
  const prs = allPrs.filter((p) => repoFilter.has(p.repo));
  const dropped = allPrs.length - prs.length;
  prSpin.stop(
    `Fetched ${allPrs.length} PRs${prsHit ? " (from cache)" : " (from GitHub)"}${dropped ? ` — filtered to ${prs.length} matching selected repos` : ""}`,
  );

  const commitSpin = spinner();
  commitSpin.start(
    noClone
      ? `Reading git log for ${selectedRepos.length} cloned repo${selectedRepos.length === 1 ? "" : "s"}`
      : `Cloning/fetching ${selectedRepos.length} repo${selectedRepos.length === 1 ? "" : "s"} and reading git log`,
  );
  const commits = await commitProvider.fetchCommits(user, range);
  const withBranch = commits.filter((c) => c.branch).length;
  const withBase = commits.filter((c) => c.branch_base).length;
  commitSpin.stop(
    `Fetched ${commits.length} commits — ${withBranch} with branch, ${withBase} with merge-base`,
  );

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

  await writeFile(out, JSON.stringify(output, null, 2));

  const finalStats = cache.getStats();
  if (!finalStats.disabled) {
    note(
      `${finalStats.hits} hits${finalStats.supersetHits ? ` (${finalStats.supersetHits} superset)` : ""}, ${finalStats.misses} misses, ${finalStats.writes} writes`,
      "cache stats",
    );
  }

  const chosen: ChosenOptions = {
    out,
    user,
    authedUser,
    rangeType,
    months: monthsValue,
    range,
    clonesDir,
    repos: selectedRepos,
    reposIsExplicitSubset,
    noClone,
    cacheFile: defaults.cacheFile,
    noCache: defaults.noCache ?? false,
  };
  note(formatCliCommand(chosen), "re-run non-interactively");

  outro(
    `Wrote ${entries.length} entries (${prs.length} PRs, ${commits.length} commits) to ${out}`,
  );
}
