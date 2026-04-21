#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

const { values } = parseArgs({
  options: {
    in: { type: "string", short: "i" },
    out: { type: "string", short: "o" },
    by: { type: "string", short: "b" },
  },
});

if (!values.in || !values.out || !values.by) {
  console.error("Usage: chunk --in=<log.json> --out=<dir> --by=<day|week|month>");
  process.exit(1);
}

if (!["day", "week", "month"].includes(values.by)) {
  console.error("--by must be one of: day, week, month");
  process.exit(1);
}

const raw = JSON.parse(await readFile(values.in, "utf8"));
const entries = raw.entries ?? [];

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

function bucketKey(timestamp, by) {
  const d = new Date(timestamp);
  if (by === "day") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (by === "month") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

function headingFor(key, by) {
  if (by === "day") return `# ${key}`;
  if (by === "month") return `# ${key}`;
  return `# ${key} (ISO week)`;
}

function renderEntry(e) {
  const ts = e.timestamp;
  if (e.type === "pr") {
    const status = e.merged ? "merged" : e.state;
    const lines = [
      `## [${ts}] PR ${e.repo}#${e.number} — ${status}`,
      `**${e.title}**`,
      `<${e.url}>`,
    ];
    if (e.body?.trim()) {
      const quoted = e.body.trim().split("\n").map((l) => `> ${l}`).join("\n");
      lines.push("", quoted);
    }
    return lines.join("\n");
  }
  const firstLine = (e.message ?? "").split("\n")[0];
  const rest = (e.message ?? "").split("\n").slice(1).join("\n").trim();
  const lines = [
    `## [${ts}] commit ${e.repo}@${e.sha.slice(0, 7)}`,
    `**${firstLine}**`,
    `<${e.url}>`,
  ];
  if (rest) lines.push("", rest);
  return lines.join("\n");
}

const buckets = new Map();
for (const e of entries) {
  const key = bucketKey(e.timestamp, values.by);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(e);
}

await mkdir(values.out, { recursive: true });

const sortedKeys = [...buckets.keys()].sort();
for (const key of sortedKeys) {
  const items = buckets.get(key).sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  const prCount = items.filter((i) => i.type === "pr").length;
  const commitCount = items.filter((i) => i.type === "commit").length;
  const body = [
    headingFor(key, values.by),
    "",
    `_${items.length} entries — ${prCount} PRs, ${commitCount} commits_`,
    "",
    items.map(renderEntry).join("\n\n---\n\n"),
    "",
  ].join("\n");
  await writeFile(path.join(values.out, `${key}.md`), body);
}

console.error(`Wrote ${sortedKeys.length} ${values.by} file(s) to ${values.out}`);
