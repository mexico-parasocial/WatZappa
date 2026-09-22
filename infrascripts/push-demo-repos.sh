#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEMO_REMOTE="git@github-new:mexico-parasocial/server-demo.git"

push_repo() {
  local name="$1"
  local dir="$2"
  local remote="$3"
  local branch="$4"

  printf '\n==> %s\n' "$name"
  if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
    printf '   [skip] not a git repo: %s\n' "$dir"
    return 0
  fi
  printf '   pushing %s -> %s:%s\n' "$name" "$remote" "$branch"
  git -C "$dir" push "$remote" "$branch"
}

printf 'Pushing demo workspace to mexico-parasocial remotes...\n'
printf 'Root: %s\n' "$ROOT_DIR"

push_repo "server-demo" "$ROOT_DIR" "$DEMO_REMOTE" main
push_repo "WatZappa"     "$ROOT_DIR/WatZappa" origin main
push_repo "mubEZ"        "$ROOT_DIR/mubEZ"    origin main
push_repo "PARA"         "$ROOT_DIR/PARA"     origin main

printf '\n==> iM8\n'
printf '   iM8 remote main has separate history; pushing local main -> demo-sync.\n'
push_repo "iM8"          "$ROOT_DIR/iM8"      origin "main:demo-sync"

printf '\nAll repos pushed.\n'
