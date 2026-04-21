import * as p from "@clack/prompts";
import {
  reconcileState,
  killProcess,
  clearFinished,
  isProcessAlive,
  type ProcessRecord,
} from "./processes.js";

function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function statusIcon(proc: ProcessRecord): string {
  if (proc.status === "running") return isProcessAlive(proc.pid) ? "●" : "?";
  if (proc.status === "done") return "✓";
  return "✗";
}

function formatProc(proc: ProcessRecord): string {
  const icon = statusIcon(proc);
  const age = elapsed(proc.startedAt);
  const bytes = proc.bytes ? ` (${proc.bytes} bytes)` : "";
  const err = proc.error ? ` — ${proc.error.slice(0, 60)}` : "";
  return `${icon} [phase ${proc.phase}] ${proc.name}  pid:${proc.pid}  ${proc.status}  ${age}${bytes}${err}`;
}

export async function showStatus(outputDir: string): Promise<void> {
  const state = await reconcileState(outputDir);

  if (state.processes.length === 0) {
    p.intro("Process Status");
    p.log.info("No tracked processes.");
    p.outro("");
    return;
  }

  while (true) {
    const freshState = await reconcileState(outputDir);
    const procs = freshState.processes;

    const running = procs.filter((proc) => proc.status === "running");
    const done = procs.filter((proc) => proc.status === "done");
    const failed = procs.filter((proc) => proc.status === "failed");

    p.intro(`Process Status — ${running.length} running, ${done.length} done, ${failed.length} failed`);

    for (const proc of procs) {
      const fn = proc.status === "done" ? p.log.success : proc.status === "failed" ? p.log.error : p.log.step;
      fn(formatProc(proc));
    }

    const choices: { value: string; label: string; hint?: string }[] = [];

    if (running.length > 0) {
      choices.push({ value: "kill-one", label: "Kill a process", hint: `${running.length} running` });
      choices.push({ value: "kill-all", label: "Kill all running", hint: "SIGTERM" });
    }
    if (done.length + failed.length > 0) {
      choices.push({ value: "clear", label: "Clear finished", hint: `${done.length + failed.length} entries` });
    }
    choices.push({ value: "refresh", label: "Refresh" });
    choices.push({ value: "exit", label: "Exit" });

    const action = await p.select({
      message: "What do you want to do?",
      options: choices,
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("");
      return;
    }

    if (action === "refresh") {
      continue;
    }

    if (action === "clear") {
      const cleared = await clearFinished(outputDir);
      p.log.info(`Cleared ${cleared} finished entries.`);
      continue;
    }

    if (action === "kill-all") {
      const confirm = await p.confirm({ message: `Kill all ${running.length} running processes?` });
      if (p.isCancel(confirm) || !confirm) continue;
      for (const proc of running) {
        const killed = killProcess(proc.pid);
        p.log.warn(`${killed ? "Killed" : "Failed to kill"} pid:${proc.pid} (${proc.name})`);
      }
      continue;
    }

    if (action === "kill-one") {
      const target = await p.select({
        message: "Which process?",
        options: running.map((proc) => ({
          value: proc.pid,
          label: formatProc(proc),
        })),
      });

      if (p.isCancel(target)) continue;

      const killed = killProcess(target as number);
      p.log.warn(`${killed ? "Killed" : "Failed to kill"} pid:${target}`);
    }
  }
}
