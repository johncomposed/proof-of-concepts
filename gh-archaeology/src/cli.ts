#!/usr/bin/env node
import * as p from "@clack/prompts";

type Command = {
  name: string;
  summary: string;
  load: () => Promise<{
    run: (args: string[], ctx: { interactive: boolean }) => Promise<void>;
  }>;
};

const COMMANDS: Command[] = [
  {
    name: "log",
    summary: "Fetch PRs + commits for a user into a timestamped JSON log.",
    load: () => import("./commands/log.js"),
  },
  {
    name: "chunk",
    summary: "Split a log JSON into per-day/week/month markdown files.",
    load: () => import("./commands/chunk.js"),
  },
  {
    name: "derive",
    summary: "Parse a log JSON and write derived branch/day data.",
    load: () => import("./commands/derive.js"),
  },
  {
    name: "analyze",
    summary: "Run the multi-phase Claude analysis pipeline.",
    load: () => import("./commands/analyze.js"),
  },
  {
    name: "status",
    summary: "Inspect and manage running analysis processes.",
    load: () => import("./commands/status.js"),
  },
];

const TOP_HELP = `gh-archaeology — reconstruct project intent from GitHub activity

Usage:
  gh-archaeology <command> [options]
  gh-archaeology                    # interactive command picker (when a TTY)

Commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`).join("\n")}

Run \`gh-archaeology <command> --help\` for command-specific options.
All commands drop into an interactive flow when their required args are omitted.
`;

const argv = process.argv.slice(2);
const first = argv[0];

if (first === "--help" || first === "-h" || first === "help") {
  console.log(TOP_HELP);
  process.exit(0);
}

const interactive = process.stdin.isTTY ?? false;
const isFlag = first !== undefined && first.startsWith("-");
const match = COMMANDS.find((c) => c.name === first);

if (first && !isFlag && !match) {
  console.error(`Unknown command: ${first}\n`);
  console.error(TOP_HELP);
  process.exit(1);
}

let command = match;
let rest = match ? argv.slice(1) : argv;

if (!command) {
  if (interactive) {
    p.intro("gh-archaeology");
    const selected = await p.select({
      message: "What do you want to do?",
      options: COMMANDS.map((c) => ({
        value: c.name,
        label: c.name,
        hint: c.summary,
      })),
    });
    if (p.isCancel(selected)) {
      p.outro("");
      process.exit(0);
    }
    command = COMMANDS.find((c) => c.name === selected)!;
    rest = [];
  } else {
    console.error(TOP_HELP);
    process.exit(1);
  }
}

const mod = await command.load();
await mod.run(rest, { interactive });
