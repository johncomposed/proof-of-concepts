"""
Project Archaeology — Branch Topology Extraction
==================================================
Builds a branch-aware commit graph instead of a flat timeline.
Supports both GitHub API (remote) and local git repo analysis.

Each branch becomes a first-class "unit of intent" with:
  - fork point (where it diverged from parent)
  - unique commits (not on parent branch)
  - associated PR (if any)
  - inferred purpose

Usage:
  # Remote (GitHub API)
  python branches.py --repo owner/repo --output ./archaeology-out

  # Local (git CLI, much richer data)
  python branches.py --local /path/to/repo --output ./archaeology-out
"""

import argparse, json, os, re, subprocess
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import requests

GH = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
HEADERS = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}


# ── Data structures ────────────────────────────────────────────────

@dataclass
class Commit:
    sha: str
    short_sha: str
    message: str
    author: str
    timestamp: str
    branch: str = ""
    is_merge: bool = False
    parents: list[str] = field(default_factory=list)

@dataclass
class Branch:
    name: str
    head_sha: str
    fork_point_sha: Optional[str] = None
    fork_point_date: Optional[str] = None
    forked_from: Optional[str] = None
    unique_commits: list[Commit] = field(default_factory=list)
    all_commit_shas: list[str] = field(default_factory=list)
    pr: Optional[dict] = None          # matched PR if exists
    merged: bool = False
    deleted: bool = False              # branch was deleted (only visible via PRs)
    first_commit_date: Optional[str] = None
    last_commit_date: Optional[str] = None
    inferred_purpose: str = ""         # filled by analysis phase


# ── GitHub API approach ────────────────────────────────────────────

def gh_get(url, params=None):
    results = []
    while url:
        r = requests.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            results.extend(data)
        else:
            return data  # single object endpoints
        url = r.links.get("next", {}).get("url")
        params = None
    return results


def detect_default_branch(repo: str) -> str:
    data = gh_get(f"{GH}/repos/{repo}")
    return data["default_branch"]


def get_all_prs(repo: str) -> list[dict]:
    """All PRs keyed by head branch for matching."""
    raw = gh_get(f"{GH}/repos/{repo}/pulls", {"state": "all", "per_page": 100})
    return raw


def compare_branches_remote(repo: str, base: str, head: str) -> dict:
    """Use GitHub compare API to find fork point + unique commits."""
    url = f"{GH}/repos/{repo}/compare/{base}...{head}"
    r = requests.get(url, headers=HEADERS)
    if not r.ok:
        return {"status": "error", "commits": [], "merge_base_commit": None}
    return r.json()


def extract_branches_remote(repo: str) -> list[Branch]:
    print(f"  detecting default branch...")
    default = detect_default_branch(repo)
    print(f"    → {default}")

    print(f"  fetching branches...")
    raw_branches = gh_get(f"{GH}/repos/{repo}/branches", {"per_page": 100})
    print(f"    → {len(raw_branches)} branches")

    print(f"  fetching PRs for matching...")
    prs = get_all_prs(repo)
    pr_by_head = {}
    for pr in prs:
        pr_by_head.setdefault(pr["head"]["ref"], []).append(pr)
    print(f"    → {len(prs)} PRs")

    branches = []

    for rb in raw_branches:
        name = rb["name"]
        head_sha = rb["commit"]["sha"]

        branch = Branch(name=name, head_sha=head_sha)

        # match PRs
        if name in pr_by_head:
            matched = pr_by_head[name]
            # prefer merged, then most recent
            matched.sort(key=lambda p: (p.get("merged_at") or "", p["created_at"]), reverse=True)
            best = matched[0]
            branch.pr = {
                "number": best["number"],
                "title": best["title"],
                "body": (best["body"] or "")[:2000],
                "state": best["state"],
                "created_at": best["created_at"],
                "merged_at": best.get("merged_at"),
                "base_branch": best["base"]["ref"],
                "url": best["html_url"],
            }
            branch.merged = best.get("merged_at") is not None
            branch.forked_from = best["base"]["ref"]

        # compare against default to find fork point + unique commits
        if name != default:
            print(f"    comparing {default}...{name}")
            comp = compare_branches_remote(repo, default, name)
            if comp.get("merge_base_commit"):
                mbc = comp["merge_base_commit"]
                branch.fork_point_sha = mbc["sha"][:8]
                branch.fork_point_date = mbc["commit"]["author"]["date"]
                if not branch.forked_from:
                    branch.forked_from = default

            for c in comp.get("commits", []):
                commit = Commit(
                    sha=c["sha"],
                    short_sha=c["sha"][:8],
                    message=c["commit"]["message"],
                    author=c["commit"]["author"]["name"],
                    timestamp=c["commit"]["author"]["date"],
                    branch=name,
                    is_merge=len(c.get("parents", [])) > 1,
                    parents=[p["sha"][:8] for p in c.get("parents", [])],
                )
                branch.unique_commits.append(commit)
                branch.all_commit_shas.append(c["sha"][:8])

            if branch.unique_commits:
                branch.unique_commits.sort(key=lambda c: c.timestamp)
                branch.first_commit_date = branch.unique_commits[0].timestamp
                branch.last_commit_date = branch.unique_commits[-1].timestamp
        else:
            # default branch: get recent commits directly
            raw_commits = gh_get(
                f"{GH}/repos/{repo}/commits", {"sha": default, "per_page": 100}
            )
            for c in raw_commits:
                commit = Commit(
                    sha=c["sha"],
                    short_sha=c["sha"][:8],
                    message=c["commit"]["message"],
                    author=c["commit"]["author"]["name"],
                    timestamp=c["commit"]["author"]["date"],
                    branch=default,
                    is_merge=len(c.get("parents", [])) > 1,
                    parents=[p["sha"][:8] for p in c.get("parents", [])],
                )
                branch.unique_commits.append(commit)
                branch.all_commit_shas.append(c["sha"][:8])

            if branch.unique_commits:
                branch.unique_commits.sort(key=lambda c: c.timestamp)
                branch.first_commit_date = branch.unique_commits[0].timestamp
                branch.last_commit_date = branch.unique_commits[-1].timestamp

        branches.append(branch)

    # also find deleted branches via PRs that reference branches not in our list
    live_names = {b.name for b in branches}
    for pr in prs:
        head_ref = pr["head"]["ref"]
        if head_ref not in live_names:
            branch = Branch(
                name=head_ref,
                head_sha=pr["head"]["sha"][:8] if pr["head"]["sha"] else "",
                forked_from=pr["base"]["ref"],
                deleted=True,
                merged=pr.get("merged_at") is not None,
                pr={
                    "number": pr["number"],
                    "title": pr["title"],
                    "body": (pr["body"] or "")[:2000],
                    "state": pr["state"],
                    "created_at": pr["created_at"],
                    "merged_at": pr.get("merged_at"),
                    "base_branch": pr["base"]["ref"],
                    "url": pr["html_url"],
                },
            )
            branches.append(branch)
            live_names.add(head_ref)

    return branches


# ── Local git approach (richer) ────────────────────────────────────

def git(repo_path: str, *args) -> str:
    result = subprocess.run(
        ["git", "-C", repo_path] + list(args),
        capture_output=True, text=True, timeout=30,
    )
    return result.stdout.strip()


def extract_branches_local(repo_path: str) -> list[Branch]:
    # find default branch
    default = git(repo_path, "symbolic-ref", "--short", "HEAD") or "main"
    print(f"    default branch: {default}")

    # all branches (local + remote tracking)
    raw = git(repo_path, "branch", "-a", "--format=%(refname:short) %(objectname:short)")
    branch_heads = {}
    for line in raw.splitlines():
        parts = line.strip().split()
        if len(parts) == 2:
            name, sha = parts
            # normalize remote tracking branches
            name = re.sub(r"^origin/", "", name)
            if name == "HEAD":
                continue
            branch_heads[name] = sha

    print(f"    → {len(branch_heads)} branches")

    branches = []

    for name, head_sha in branch_heads.items():
        branch = Branch(name=name, head_sha=head_sha)

        if name != default:
            # find fork point
            fork = git(repo_path, "merge-base", default, head_sha)
            if fork:
                branch.fork_point_sha = fork[:8]
                fork_date = git(repo_path, "log", "-1", "--format=%aI", fork)
                branch.fork_point_date = fork_date
                branch.forked_from = default

            # unique commits: on this branch but not on default
            log_format = "--format=%H|%h|%s|%aN|%aI|%P"
            unique_log = git(
                repo_path, "log", log_format, f"{default}..{head_sha}", "--"
            )
            for line in unique_log.splitlines():
                if not line.strip():
                    continue
                parts = line.split("|", 5)
                if len(parts) < 5:
                    continue
                sha, short, msg, author, ts = parts[:5]
                parent_str = parts[5] if len(parts) > 5 else ""
                parent_shas = [p[:8] for p in parent_str.split() if p]
                commit = Commit(
                    sha=sha, short_sha=short, message=msg,
                    author=author, timestamp=ts, branch=name,
                    is_merge=len(parent_shas) > 1, parents=parent_shas,
                )
                branch.unique_commits.append(commit)
                branch.all_commit_shas.append(short)
        else:
            # default branch: all commits
            log_format = "--format=%H|%h|%s|%aN|%aI|%P"
            log = git(repo_path, "log", log_format, head_sha, "--")
            for line in log.splitlines():
                if not line.strip():
                    continue
                parts = line.split("|", 5)
                if len(parts) < 5:
                    continue
                sha, short, msg, author, ts = parts[:5]
                parent_str = parts[5] if len(parts) > 5 else ""
                parent_shas = [p[:8] for p in parent_str.split() if p]
                commit = Commit(
                    sha=sha, short_sha=short, message=msg,
                    author=author, timestamp=ts, branch=name,
                    is_merge=len(parent_shas) > 1, parents=parent_shas,
                )
                branch.unique_commits.append(commit)
                branch.all_commit_shas.append(short)

        if branch.unique_commits:
            branch.unique_commits.sort(key=lambda c: c.timestamp)
            branch.first_commit_date = branch.unique_commits[0].timestamp
            branch.last_commit_date = branch.unique_commits[-1].timestamp

        branches.append(branch)

    return branches


# ── Branch name heuristics ─────────────────────────────────────────

BRANCH_PATTERNS = [
    (r"^(feat|feature)[/-]", "feature development"),
    (r"^(fix|bugfix|hotfix)[/-]", "bug fix"),
    (r"^(refactor|cleanup|chore)[/-]", "refactoring / maintenance"),
    (r"^(experiment|try|spike|poc|proto)[/-]", "experiment / spike"),
    (r"^(wip|draft)[/-]", "work in progress (possibly abandoned)"),
    (r"^(release|v\d|deploy)[/-]", "release preparation"),
    (r"^(test|ci|cd)[/-]", "testing / CI infrastructure"),
    (r"^(docs|doc)[/-]", "documentation"),
    (r"^(migrate|migration|upgrade)[/-]", "migration / upgrade"),
    (r"^(revert)[/-]", "reverting a change"),
    (r"^(dependabot|renovate|bump)[/-]", "automated dependency update"),
]


def annotate_branch(branch: Branch) -> dict:
    """Produce an analysis-ready summary of a branch."""
    # guess purpose from name
    name_hint = ""
    for pat, label in BRANCH_PATTERNS:
        if re.search(pat, branch.name, re.IGNORECASE):
            name_hint = label
            break

    # extract topic from branch name (strip prefix)
    topic = re.sub(r"^(feat|feature|fix|bugfix|hotfix|refactor|chore|experiment|wip|draft|release|test|docs?|migrate)[/-]", "", branch.name, flags=re.IGNORECASE)

    # summarize commit messages
    msgs = [c.message.split("\n")[0] for c in branch.unique_commits[:20]]

    # lifespan
    lifespan_days = None
    if branch.first_commit_date and branch.last_commit_date:
        try:
            t0 = datetime.fromisoformat(branch.first_commit_date.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(branch.last_commit_date.replace("Z", "+00:00"))
            lifespan_days = (t1 - t0).days
        except (ValueError, TypeError):
            pass

    return {
        "branch_name": branch.name,
        "head_sha": branch.head_sha,
        "forked_from": branch.forked_from,
        "fork_point_sha": branch.fork_point_sha,
        "fork_point_date": branch.fork_point_date,
        "deleted": branch.deleted,
        "merged": branch.merged,
        "unique_commit_count": len(branch.unique_commits),
        "first_commit": branch.first_commit_date,
        "last_commit": branch.last_commit_date,
        "lifespan_days": lifespan_days,
        "name_category": name_hint,
        "topic_hint": topic,
        "commit_messages": msgs,
        "has_pr": branch.pr is not None,
        "pr": branch.pr,
        "commits": [asdict(c) for c in branch.unique_commits],
    }


# ── Output ─────────────────────────────────────────────────────────

def build_branch_graph(branches: list[Branch]) -> dict:
    """A JSON structure that makes branch relationships explicit."""
    annotated = [annotate_branch(b) for b in branches]
    annotated.sort(key=lambda b: b.get("first_commit") or "9999")

    # build adjacency: which branches fork from which
    tree = {}
    for b in annotated:
        parent = b["forked_from"] or "(root)"
        tree.setdefault(parent, []).append(b["branch_name"])

    # stats
    with_prs = sum(1 for b in annotated if b["has_pr"])
    merged = sum(1 for b in annotated if b["merged"])
    orphans = [b["branch_name"] for b in annotated if not b["has_pr"] and not b["merged"] and b["branch_name"] not in ("main", "master")]

    return {
        "summary": {
            "total_branches": len(annotated),
            "with_prs": with_prs,
            "merged": merged,
            "orphan_branches": orphans,
            "branch_tree": tree,
        },
        "branches": annotated,
    }


def main():
    parser = argparse.ArgumentParser(description="Branch topology extraction")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--repo", help="GitHub owner/repo (remote API)")
    group.add_argument("--local", help="Path to local git repo")
    parser.add_argument("--output", default="./archaeology-out")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    if args.repo:
        slug = args.repo.replace("/", "__")
        print(f"\nExtracting branch topology (remote): {args.repo}")
        branches = extract_branches_remote(args.repo)
    else:
        slug = Path(args.local).resolve().name
        print(f"\nExtracting branch topology (local): {args.local}")
        branches = extract_branches_local(args.local)

    graph = build_branch_graph(branches)

    outfile = out / f"{slug}_branches.json"
    outfile.write_text(json.dumps(graph, indent=2, default=str))

    print(f"\n{'='*60}")
    print(f"  {graph['summary']['total_branches']} branches total")
    print(f"  {graph['summary']['with_prs']} with PRs")
    print(f"  {graph['summary']['merged']} merged")
    print(f"  {len(graph['summary']['orphan_branches'])} orphans (no PR, not merged)")
    if graph['summary']['orphan_branches']:
        print(f"    orphans: {', '.join(graph['summary']['orphan_branches'][:10])}")
    print(f"\n  Written to {outfile}")


if __name__ == "__main__":
    main()