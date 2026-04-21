import * as p from "@clack/prompts";

const COMMANDS = {
  derive: () => import("./commands/derive.js"),
  analyze: () => import("./commands/analyze.js"),
  status: () => import("./commands/status.js"),
} as const;

type CommandName = keyof typeof COMMANDS;

const interactive = process.stdin.isTTY ?? false;
const rawArgs = process.argv.slice(2);
let commandName = rawArgs[0] as string | undefined;

const isCommand = commandName != null && commandName in COMMANDS;
const commandArgs = isCommand ? rawArgs.slice(1) : rawArgs;
if (!isCommand) commandName = undefined;

const USAGE = `Usage: archaeology <command> [options]

Commands:
  derive   <log.json>   Parse log and write derived data
  analyze  <log.json>   Run Claude analysis pipeline
  status                Check running processes`


if (!commandName) {
  if (interactive) {
    p.intro("gh-archaeology");
    const selected = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "derive", label: "Derive", hint: "Parse log.json and write derived data" },
        { value: "analyze", label: "Analyze", hint: "Run Claude analysis pipeline" },
        { value: "status", label: "Status", hint: "Check running processes" },
      ],
    });
    if (p.isCancel(selected)) {
      p.outro("");
      process.exit(0);
    }
    commandName = selected as CommandName;
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}

const loader = COMMANDS[commandName as CommandName];
if (!loader) {
  console.error(`Unknown command: ${commandName}`);
  console.error(USAGE);
  process.exit(1);
}

const mod = await loader();
await mod.run(commandArgs, { interactive });
