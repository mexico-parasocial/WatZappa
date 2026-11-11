#!/usr/bin/env bash
# Merge bluesky-social/atproto (remote `upstream`) into the current branch with
# a real 3-way merge, so fork-owned code is kept and only genuine conflicts need
# a human.
#
#   sync-upstream.sh --check   read-only dry run; lists conflicted files
#   sync-upstream.sh           merge into a new sync/upstream-<date> branch
#   sync-upstream.sh --keep    same, but leave a conflicted merge in progress
#
# Exit codes: 0 clean (or already up to date), 2 conflicts, 1 error.
# When $GITHUB_OUTPUT is set it also writes `status` (clean|conflict|uptodate),
# `branch` and `conflicts` (path of a file listing conflicted paths).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

mode=merge
case "${1:-}" in
  --check) mode=check ;;
  --keep) mode=keep ;;
  '') ;;
  *) echo "usage: $0 [--check|--keep]" >&2; exit 1 ;;
esac

upstream_url="https://github.com/bluesky-social/atproto.git"
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$upstream_url"
git fetch --quiet upstream main

if ! git merge-base HEAD upstream/main >/dev/null 2>&1; then
  echo "No merge base with upstream/main: link the histories first" >&2
  echo "(branch sync/link-upstream-base records one)." >&2
  exit 1
fi

emit() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1=$2" >> "$GITHUB_OUTPUT" || true; }

behind="$(git rev-list --count HEAD..upstream/main)"
if [ "$behind" -eq 0 ]; then
  echo "Already up to date with upstream/main"
  emit status uptodate
  exit 0
fi
echo "$behind upstream commits to merge (base $(git merge-base HEAD upstream/main | cut -c1-9))"

conflicts_file="$(mktemp)"
# merge-tree prints the result tree on the first line, then conflicted paths.
git merge-tree --write-tree --name-only --no-messages HEAD upstream/main \
  | sed -n '2,$p' | awk 'NF' | sort -u > "$conflicts_file" || true
count="$(wc -l < "$conflicts_file" | tr -d ' ')"
emit conflicts "$conflicts_file"

if [ "$count" -gt 0 ]; then
  echo "$count conflicted files:"
  sed 's#^#  #' "$conflicts_file"
fi

if [ "$mode" = check ]; then
  [ "$count" -eq 0 ] && { emit status clean; exit 0; }
  emit status conflict
  exit 2
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Working tree has uncommitted changes; commit or stash them first." >&2
  exit 1
fi

branch="sync/upstream-$(date +%Y%m%d)"
git checkout -b "$branch"
emit branch "$branch"

if git merge --no-edit upstream/main; then
  packages/dev-infra/check-fork-surface.sh
  emit status clean
  echo "Merged cleanly on $branch. Build and test before opening a PR."
  exit 0
fi

emit status conflict
if [ "$mode" = keep ]; then
  echo "Merge left in progress on $branch; resolve, then 'git commit'."
else
  git merge --abort
  echo "Merge aborted; $branch is at the pre-merge commit."
fi
exit 2
