import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface ProcessRecord {
  pid: number;
  phase: number;
  name: string;
  outputFile: string;
  startedAt: string;
  status: "running" | "done" | "failed";
  exitCode?: number | null;
  error?: string;
  bytes?: number;
}

export interface ProcessState {
  updatedAt: string;
  processes: ProcessRecord[];
}

export const CACHE_DIR = ".cache";

function statePath(outputDir: string): string {
  return join(outputDir, CACHE_DIR, "processes.json");
}

export async function loadState(outputDir: string): Promise<ProcessState> {
  try {
    const raw = await readFile(statePath(outputDir), "utf-8");
    return JSON.parse(raw) as ProcessState;
  } catch {
    return { updatedAt: new Date().toISOString(), processes: [] };
  }
}

async function saveState(
  outputDir: string,
  state: ProcessState
): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(join(outputDir, CACHE_DIR), { recursive: true });
  await writeFile(statePath(outputDir), JSON.stringify(state, null, 2));
}

export async function registerProcess(
  outputDir: string,
  record: ProcessRecord
): Promise<void> {
  const state = await loadState(outputDir);
  state.processes.push(record);
  await saveState(outputDir, state);
}

export async function updateProcess(
  outputDir: string,
  pid: number,
  update: Partial<ProcessRecord>
): Promise<void> {
  const state = await loadState(outputDir);
  const proc = state.processes.find((p) => p.pid === pid);
  if (proc) Object.assign(proc, update);
  await saveState(outputDir, state);
}

export async function clearFinished(outputDir: string): Promise<number> {
  const state = await loadState(outputDir);
  const before = state.processes.length;
  state.processes = state.processes.filter((p) => p.status === "running");
  await saveState(outputDir, state);
  return before - state.processes.length;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killProcess(pid: number): boolean {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export async function reconcileState(outputDir: string): Promise<ProcessState> {
  const state = await loadState(outputDir);
  let changed = false;
  for (const proc of state.processes) {
    if (proc.status === "running" && !isProcessAlive(proc.pid)) {
      proc.status = "failed";
      proc.error = "process no longer running (stale)";
      changed = true;
    }
  }
  if (changed) await saveState(outputDir, state);
  return state;
}
