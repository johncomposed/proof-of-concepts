"""
Project Archaeology — Extract & Structure Pipeline
====================================================
Pulls commits, PRs, diffs from GitHub repos and merges with
local notes + Claude logs into a unified timeline JSON.

Usage:
  pip install requests
  export GITHUB_TOKEN=ghp_...
  python extract.py --repos owner/repo1 owner/repo2 --notes ./daily-notes --output ./archaeology-out
"""

import argparse, json, os, re, glob, hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import requests

GH = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
HEADERS = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}


# ── GitHub extraction ──────────────────────────────────────────────

def gh_get(url, params=None):
    """Paginated GitHub GET."""
    results = []
    while url:
        r = requests.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        results.extend(r.json())
        url = r.links.get("next", {}).get("url")
        params = None  # params baked into next link
    return results


def extract_commits(repo: str) -> list[dict]:
    """All commits with message, author, date, sha."""
    raw = gh_get(f"{GH}/repos/{repo}/commits", {"per_page": 100})
    commits = []
    for c in raw:
        commits.append({
            "type": "commit",
            "repo": repo,
            "sha": c["sha"],
            "short_sha": c["sha"][:8],
            "message": c["commit"]["message"],
            "author": c["commit"]["author"]["name"],
            "timestamp": c["commit"]["author"]["date"],
            "url": c["html_url"],
        })
    return commits


def extract_prs(repo: str) -> list[dict]:
    """All PRs (open + closed) with title, body, timestamps."""
    raw = gh_get(f"{GH}/repos/{repo}/pulls", {"state": "all", "per_page": 100})
    prs = []
    for p in raw:
        prs.append({
            "type": "pull_request",
            "repo": repo,
            "number": p["number"],
            "title": p["title"],
            "body": (p["body"] or "")[:2000],  # truncate massive PR bodies
            "state": p["state"],
            "created_at": p["created_at"],
            "merged_at": p.get("merged_at"),
            "closed_at": p.get("closed_at"),
            "timestamp": p["created_at"],
            "url": p["html_url"],
        })
    return prs


def extract_diff_for_commit(repo: str, sha: str) -> Optional[str]:
    """Get the diff for a single commit (truncated to ~8k chars)."""
    r = requests.get(
        f"{GH}/repos/{repo}/commits/{sha}",
        headers={**HEADERS, "Accept": "application/vnd.github.v3.diff"},
    )
    if r.ok:
        return r.text[:8000]
    return None


def extract_branches(repo: str) -> list[dict]:
    """Branch names — useful for inferring workstreams."""
    raw = gh_get(f"{GH}/repos/{repo}/branches", {"per_page": 100})
    return [{"name": b["name"], "sha": b["commit"]["sha"]} for b in raw]


# ── Local notes ingestion ──────────────────────────────────────────

def ingest_notes(notes_dir: str) -> list[dict]:
    """
    Reads markdown/txt files from a notes directory.
    Tries to extract a date from the filename (YYYY-MM-DD pattern)
    or falls back to file mtime.
    """
    notes = []
    date_pat = re.compile(r"(\d{4}-\d{2}-\d{2})")
    for fpath in sorted(glob.glob(os.path.join(notes_dir, "**/*"), recursive=True)):
        if not os.path.isfile(fpath):
            continue
        ext = Path(fpath).suffix.lower()
        if ext not in (".md", ".txt", ".org", ".rst"):
            continue
        text = Path(fpath).read_text(errors="replace")
        m = date_pat.search(Path(fpath).stem)
        if m:
            ts = f"{m.group(1)}T00:00:00Z"
        else:
            mtime = os.path.getmtime(fpath)
            ts = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        notes.append({
            "type": "note",
            "file": fpath,
            "timestamp": ts,
            "content": text[:6000],  # truncate very long notes
        })
    return notes


# ── Claude Code logs discovery ─────────────────────────────────────

def find_claude_logs(search_dirs: list[str]) -> list[dict]:
    """
    Look for Claude Code conversation logs.
    Known locations:
      ~/.claude/projects/<project>/conversations/
      ~/.claude/logs/
      <repo>/.claude/  (sometimes)
    Log format is typically JSONL.
    """
    candidates = list(search_dirs)
    home = Path.home()
    candidates.append(str(home / ".claude"))

    logs = []
    for d in candidates:
        for fpath in glob.glob(os.path.join(d, "**/*.jsonl"), recursive=True):
            try:
                entries = []
                for line in Path(fpath).read_text(errors="replace").splitlines():
                    line = line.strip()
                    if line:
                        entries.append(json.loads(line))
                if entries:
                    # try to get a timestamp from first entry
                    ts = entries[0].get("timestamp", entries[0].get("created_at", ""))
                    logs.append({
                        "type": "claude_log",
                        "file": fpath,
                        "timestamp": ts,
                        "entry_count": len(entries),
                        "entries": entries[:50],  # cap for sanity
                    })
            except (json.JSONDecodeError, OSError):
                continue

    # also look for .claude directories inside repos
    for d in search_dirs:
        claude_dir = os.path.join(d, ".claude")
        if os.path.isdir(claude_dir):
            for fpath in glob.glob(os.path.join(claude_dir, "**/*"), recursive=True):
                if os.path.isfile(fpath):
                    logs.append({
                        "type": "claude_log_file",
                        "file": fpath,
                        "timestamp": datetime.fromtimestamp(
                            os.path.getmtime(fpath), tz=timezone.utc
                        ).isoformat(),
                        "content_preview": Path(fpath).read_text(errors="replace")[:3000],
                    })
    return logs


# ── Timeline assembly ──────────────────────────────────────────────

def build_timeline(events: list[dict]) -> list[dict]:
    """Sort all events chronologically, dedupe, add sequential IDs."""
    events.sort(key=lambda e: e.get("timestamp", ""))
    for i, e in enumerate(events):
        e["_seq"] = i
    return events


def cluster_by_day(timeline: list[dict]) -> dict[str, list[dict]]:
    """Group events by calendar date for easier analysis."""
    days = {}
    for e in timeline:
        day = e.get("timestamp", "")[:10]
        if day:
            days.setdefault(day, []).append(e)
    return days


# ── Diff sampling (for Claude analysis) ────────────────────────────

def sample_diffs(repo: str, commits: list[dict], max_diffs: int = 30, branch_data: dict = None) -> list[dict]:
    """
    Fetch diffs for a sample of commits. Branch-aware strategy:
    - If branch_data is available, sample from EACH branch (first, last, significant)
    - Tag each diff with its branch
    - Always include first and last commit per branch
    - Include commits whose messages suggest significance
    - Fill remaining slots evenly spaced within each branch
    """
    if not commits:
        return []

    significant = re.compile(
        r"(merge|refactor|feat|fix|break|init|rewrite|migrate|add|remove|delete)",
        re.IGNORECASE,
    )

    # build a sha→branch lookup from branch_data
    sha_to_branch = {}
    if branch_data:
        for b in branch_data.get("branches", []):
            for c in b.get("commits", []):
                sha_to_branch[c["sha"][:8]] = b["branch_name"]
                sha_to_branch[c["sha"]] = b["branch_name"]

    # if we have branch data, sample per-branch
    if branch_data and branch_data.get("branches"):
        branches = branch_data["branches"]
        # allocate diff budget: at least 2 per branch, rest proportional to commit count
        per_branch_min = 2
        total_branches = sum(1 for b in branches if b.get("commits"))
        remaining_budget = max(0, max_diffs - (total_branches * per_branch_min))
        total_commits = sum(len(b.get("commits", [])) for b in branches)

        diffs = []
        for b in branches:
            b_commits = b.get("commits", [])
            if not b_commits:
                continue
            branch_name = b["branch_name"]

            # budget for this branch
            proportion = len(b_commits) / max(total_commits, 1)
            budget = per_branch_min + int(remaining_budget * proportion)
            budget = min(budget, len(b_commits))

            # select: first, last, significant, then fill
            selected = {0, len(b_commits) - 1}
            for i, c in enumerate(b_commits):
                if significant.search(c.get("message", "")):
                    selected.add(i)
            fill_remaining = budget - len(selected)
            if fill_remaining > 0 and len(b_commits) > len(selected):
                step = max(1, len(b_commits) // fill_remaining)
                for i in range(0, len(b_commits), step):
                    selected.add(i)
                    if len(selected) >= budget:
                        break

            for i in sorted(selected):
                if len(diffs) >= max_diffs:
                    break
                c = b_commits[i]
                sha = c["sha"]
                diff_text = extract_diff_for_commit(repo, sha)
                if diff_text:
                    diffs.append({
                        **c,
                        "branch": branch_name,
                        "diff": diff_text,
                    })
                print(f"  [{branch_name}] diff {len(diffs)}/{max_diffs}: {c['short_sha']} {c.get('message','')[:50]}")
        return diffs

    # fallback: flat sampling (no branch data)
    selected_indices = {0, len(commits) - 1}
    for i, c in enumerate(commits):
        if significant.search(c["message"]):
            selected_indices.add(i)

    remaining = max_diffs - len(selected_indices)
    if remaining > 0 and len(commits) > len(selected_indices):
        step = max(1, len(commits) // remaining)
        for i in range(0, len(commits), step):
            selected_indices.add(i)
            if len(selected_indices) >= max_diffs:
                break

    diffs = []
    for i in sorted(selected_indices):
        c = commits[i]
        diff_text = extract_diff_for_commit(repo, c["sha"])
        if diff_text:
            branch = sha_to_branch.get(c["sha"][:8], sha_to_branch.get(c["sha"], "unknown"))
            diffs.append({**c, "branch": branch, "diff": diff_text})
        print(f"  fetched diff {len(diffs)}/{max_diffs}: {c['short_sha']} {c['message'][:60]}")
    return diffs


# ── Main ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Project Archaeology — data extraction")
    parser.add_argument("--repos", nargs="+", required=True, help="owner/repo pairs")
    parser.add_argument("--notes", default=None, help="Path to daily notes directory")
    parser.add_argument("--output", default="./archaeology-out", help="Output directory")
    parser.add_argument("--max-diffs", type=int, default=30, help="Max diffs to fetch per repo")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    all_events = []

    for repo in args.repos:
        print(f"\n{'='*60}\nExtracting: {repo}\n{'='*60}")

        print("  commits...")
        commits = extract_commits(repo)
        print(f"    → {len(commits)} commits")
        all_events.extend(commits)

        print("  pull requests...")
        prs = extract_prs(repo)
        print(f"    → {len(prs)} PRs")
        all_events.extend(prs)

        print("  branches...")
        branches = extract_branches(repo)
        print(f"    → {len(branches)} branches")

        # load branch data if branches.py was already run
        branch_file = out / f"{repo_slug}_branches.json"
        branch_data = None
        if branch_file.exists():
            print("  loading branch topology for diff sampling...")
            branch_data = json.loads(branch_file.read_text())

        print("  sampling diffs (branch-aware)..." if branch_data else "  sampling diffs (flat)...")
        diffs = sample_diffs(repo, commits, args.max_diffs, branch_data)
        print(f"    → {len(diffs)} diffs fetched")

        # save per-repo data
        repo_slug = repo.replace("/", "__")
        (out / f"{repo_slug}_commits.json").write_text(json.dumps(commits, indent=2))
        (out / f"{repo_slug}_prs.json").write_text(json.dumps(prs, indent=2))
        (out / f"{repo_slug}_branches.json").write_text(json.dumps(branches, indent=2))
        (out / f"{repo_slug}_diffs.json").write_text(json.dumps(diffs, indent=2))

    if args.notes:
        print(f"\nIngesting notes from {args.notes}...")
        notes = ingest_notes(args.notes)
        print(f"  → {len(notes)} notes")
        all_events.extend(notes)
        (out / "notes.json").write_text(json.dumps(notes, indent=2))

    # claude logs
    search_dirs = [args.notes] if args.notes else []
    search_dirs.extend([os.getcwd()])
    print("\nSearching for Claude Code logs...")
    claude_logs = find_claude_logs(search_dirs)
    print(f"  → {len(claude_logs)} log files found")
    if claude_logs:
        (out / "claude_logs.json").write_text(json.dumps(claude_logs, indent=2, default=str))
        all_events.extend(claude_logs)

    # build unified timeline
    print("\nBuilding timeline...")
    timeline = build_timeline(all_events)
    days = cluster_by_day(timeline)
    print(f"  → {len(timeline)} events across {len(days)} days")

    (out / "timeline.json").write_text(json.dumps(timeline, indent=2, default=str))
    (out / "days.json").write_text(json.dumps(days, indent=2, default=str))

    # write a manifest for Claude Code to consume
    manifest = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "repos": args.repos,
        "stats": {
            "total_events": len(timeline),
            "total_days": len(days),
            "date_range": [timeline[0]["timestamp"][:10], timeline[-1]["timestamp"][:10]] if timeline else [],
        },
        "files": sorted(str(p.relative_to(out)) for p in out.glob("*.json")),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(f"\n✓ All data written to {out}/")
    print(f"  Next: feed to Claude Code using the analysis prompts.")


if __name__ == "__main__":
    main()