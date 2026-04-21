import type { LogEntry } from "./types.js";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: t.getUTCFullYear(), week };
}

export function bucketKey(
  timestamp: string,
  by: "day" | "week" | "month",
): string {
  const d = new Date(timestamp);
  if (by === "day")
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (by === "month")
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

export function headingFor(key: string, by: "day" | "week" | "month"): string {
  if (by === "day") return `# ${key}`;
  if (by === "month") return `# ${key}`;
  return `# ${key} (ISO week)`;
}

export function renderEntry(e: LogEntry): string {
  const ts = e.timestamp;
  if (e.type === "pr") {
    const status = e.merged ? "merged" : e.state;
    const lines = [
      `## [${ts}] PR ${e.repo}#${e.number} — ${status}`,
      `**${e.title}**`,
      `<${e.url}>`,
    ];
    if (e.body?.trim()) {
      const quoted = e.body
        .trim()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      lines.push("", quoted);
    }
    return lines.join("\n");
  }
  const firstLine = (e.message ?? "").split("\n")[0];
  const rest = (e.message ?? "").split("\n").slice(1).join("\n").trim();
  const branchPart = e.branch ? ` (${e.branch})` : "";
  const basePart = e.branch_base
    ? ` [branched from ${e.branch_base.sha.slice(0, 7)} on ${e.branch_base.date.slice(0, 10)}, ${e.branch_base.ahead} ahead]`
    : "";
  const lines = [
    `## [${ts}] commit ${e.repo}@${e.sha.slice(0, 7)}${branchPart}${basePart}`,
    `**${firstLine}**`,
    `<${e.url}>`,
  ];
  if (rest) lines.push("", rest);
  return lines.join("\n");
}

export function bucketEntries(
  entries: LogEntry[],
  by: "day" | "week" | "month",
): Map<string, LogEntry[]> {
  const buckets = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = bucketKey(e.timestamp, by);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  return buckets;
}

export function renderBucket(
  key: string,
  items: LogEntry[],
  by: "day" | "week" | "month",
): string {
  const sorted = items.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  const prCount = sorted.filter((i) => i.type === "pr").length;
  const commitCount = sorted.filter((i) => i.type === "commit").length;
  return [
    headingFor(key, by),
    "",
    `_${sorted.length} entries — ${prCount} PRs, ${commitCount} commits_`,
    "",
    sorted.map(renderEntry).join("\n\n---\n\n"),
    "",
  ].join("\n");
}
