import { parseArgs } from "node:util";
import { showStatus } from "../status.js";

export async function run(args: string[], _ctx: { interactive: boolean }) {
  const { values } = parseArgs({
    args,
    options: {
      output: { type: "string", short: "o", default: "./archaeology-out" },
    },
  });

  await showStatus(values.output!);
}
