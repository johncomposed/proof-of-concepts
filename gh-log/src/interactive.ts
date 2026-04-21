import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import {
  intro,
  outro,
  select,
  text,
  multiselect,
  spinner,
  isCancel,
  cancel,
  note,
} from "@clack/prompts";
import { createOctokit, requireToken } from "./github/client.js";
import { fetchPrs } from "./github/prs.js";
import { discoverCommitRepos } from "./github/repos.js";
import { GitHubCommitProvider } from "./providers/github-commits.js";
import { LocalGitCommitProvider } from "./providers/local-git-commits.js";
import type { Cache } from "./cache.js";
import type { CommitProvider, DateRange, LogOutput } from "./types.js";

interface Defaults {
  months?: string;
  start?: string;
  end?: string;
  out?: string;
  user?: string;
  source?: string;
  clonesDir?: string;
  repos?: string;
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

export async function runInteractive(
  defaults: Defaults,
  cache: Cache,
): Promise<void> {
  intro("gh-log");

  const token = requireToken();
  const octokit = createOctokit(token);

  const authSpin = spinner();
  authSpin.start("Authenticating with GitHub");
  const authedUser = await cache.memo(
    "auth-user",
    async () => (await octokit.rest.users.getAuthenticated()).data.login,
  );
  authSpin.stop(`Signed in as ${authedUser}`);

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
  if (rangeType === "months") {
    const months = bail(
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
    start.setMonth(start.getMonth() - Number(months));
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

  const source = bail(
    await select<"github" | "local">({
      message: "Where to pull commit data from?",
      options: [
        {
          value: "github",
          label: "GitHub API",
          hint: "uses rate limit, no clones needed",
        },
        {
          value: "local",
          label: "Local git clones",
          hint: "clones repos, parses git log locally",
        },
      ],
      initialValue: (defaults.source as "github" | "local") ?? "github",
    }),
  );

  let selectedRepos: string[] | undefined;
  let clonesDir = defaults.clonesDir ?? "./clones";

  if (source === "local") {
    clonesDir = bail(
      await text({
        message: "Clones directory",
        initialValue: clonesDir,
      }),
    );

    const s = spinner();
    s.start(`Discovering repos ${user} committed to`);
    const repos = await discoverCommitRepos(octokit, user, range, cache);
    s.stop(`Found ${repos.length} repos`);

    if (repos.length === 0) {
      note("No commits found in this range. Exiting.");
      outro("Done");
      return;
    }

    const cloned = await Promise.all(
      repos.map(async (r) => {
        try {
          await access(path.join(clonesDir, r));
          return true;
        } catch {
          return false;
        }
      }),
    );

    const options = repos.map((r, i) => ({
      value: r,
      label: r,
      hint: cloned[i] ? "already cloned" : "will be cloned",
    }));

    selectedRepos = bail(
      await multiselect<string>({
        message: "Select repos to include",
        options,
        initialValues: repos,
        required: false,
      }),
    );

    if (selectedRepos.length === 0) {
      note("No repos selected. Exiting.");
      outro("Done");
      return;
    }
  }

  const out = bail(
    await text({
      message: "Output JSON path",
      initialValue: defaults.out ?? "tmp/log.json",
    }),
  );

  const commitProvider: CommitProvider =
    source === "local"
      ? new LocalGitCommitProvider({ clonesDir, repos: selectedRepos, cache })
      : new GitHubCommitProvider(octokit, cache);

  const prSpin = spinner();
  prSpin.start("Fetching PRs from GitHub");
  const prs = await fetchPrs(octokit, user, range, cache);
  prSpin.stop(`Fetched ${prs.length} PRs`);

  const commitSpin = spinner();
  commitSpin.start(
    source === "local"
      ? `Cloning/fetching ${selectedRepos!.length} repos and parsing git log`
      : "Fetching commits from GitHub",
  );
  const commits = await commitProvider.fetchCommits(user, range);
  commitSpin.stop(`Fetched ${commits.length} commits`);

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

  outro(
    `Wrote ${entries.length} entries (${prs.length} PRs, ${commits.length} commits) to ${out}`,
  );
}
