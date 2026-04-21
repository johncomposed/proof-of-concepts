#!/usr/bin/env node
import { run as runLog } from "./commands/log.js";
import { run as runChunk } from "./commands/chunk.js";

type Command = {
  name: string;
  summary: string;
  run: (argv: string[]) => Promise<void>;
};

const COMMANDS: Command[] = [
  {
    name: "log",
    summary: "Fetch PRs + commits for a user into a timestamped JSON log.",
    run: runLog,
  },
  {
    name: "chunk",
    summary: "Split a gh-log JSON into per-day/week/month markdown files.",
    run: runChunk,
  },
];

const DEFAULT_COMMAND = "log";

const TOP_HELP = `gh-log — GitHub activity log CLI

Usage:
  gh-log <command> [options]
  gh-log [options]                  # shortcut for \`gh-log ${DEFAULT_COMMAND}\`

Commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`).join("\n")}

Run \`gh-log <command> --help\` for command-specific options.
All commands drop into an interactive flow when their required args are omitted.
`;

const argv = process.argv.slice(2);
const first = argv[0];

if (first === "--help" || first === "-h" || first === "help") {
  console.log(TOP_HELP);
  process.exit(0);
}

const isFlag = first !== undefined && first.startsWith("-");
const match = COMMANDS.find((c) => c.name === first);

if (first && !isFlag && !match) {
  console.error(`Unknown command: ${first}\n`);
  console.error(TOP_HELP);
  process.exit(1);
}

const command = match ?? COMMANDS.find((c) => c.name === DEFAULT_COMMAND)!;
const rest = match ? argv.slice(1) : argv;

await command.run(rest);
