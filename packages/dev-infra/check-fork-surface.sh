#!/usr/bin/env bash
# Fails when fork-owned (PARA) code has been dropped, e.g. by an upstream sync
# that took upstream's version of a file, or when the fork still carries files
# upstream has deleted. Run it after every sync, next to
# `make build`. When fork code moves, update the tables below in the same change.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

missing=0

# Files that exist only in the fork.
required_paths=(
  packages/pds/src/api/com/para/index.ts
  packages/pds/src/api/com/para/alpha/index.ts
  packages/pds/src/api/com/para/community/create.ts
  packages/pds/src/account-manager/helpers/im8-token.ts
  packages/pds/src/para/auth-factor.ts
  packages/pds/src/para/read-after-write.ts
  packages/pds/src/para/community/chain.ts
  packages/pds/src/api/com/para/community/act.ts
  packages/pds/src/account-manager/db/migrations/009-alpha-rollout.ts
  packages/pds/src/account-manager/db/migrations/010-auth-factor-type.ts
  packages/pds/tests/para-pds.test.ts
  packages/bsky/src/api/com/para/README.md
)

# "file|fixed string": fork hooks inside files that upstream also edits.
required_anchors=(
  'packages/pds/src/api/index.ts|comPara(server, ctx)'
  'packages/pds/src/repo/prepare.ts|ballotWritePolicyRefusal'
  'packages/pds/src/api/com/atproto/server/createSession.ts|assertParaAuthFactor'
  'packages/pds/src/config/config.ts|m8BaseUrl'
  'packages/pds/src/config/config.ts|paraCommunityHandleDomain'
  'packages/pds/src/actor-store/actor-store-transactor.ts|CommunityStore'
  'packages/pds/src/actor-store/actor-store-reader.ts|CommunityStore'
  'packages/pds/src/actor-store/db/migrations/index.ts|006-community'
  'packages/pds/src/actor-store/record/reader.ts|collectParaLocalRecord'
  'packages/pds/lexicons.json|com.para.*'
  'packages/pds/.gitignore|/lexicons/com/para'
)

# The upstream commit the fork's history was first linked to (be2b1b4a5).
linked_base=9f66a7e54

# Files upstream deleted that the fork deliberately keeps. A sync resolving a
# modify/delete conflict as "ours" otherwise leaves stale copies behind.
kept_upstream_deletions=()

stale=0
if git rev-parse --verify --quiet upstream/main >/dev/null; then
  upstream_base="$(git merge-base HEAD upstream/main)"
  while IFS= read -r path; do
    for kept in ${kept_upstream_deletions[@]+"${kept_upstream_deletions[@]}"}; do
      [ "$path" = "$kept" ] && continue 2
    done
    if git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      echo "STALE file:     $path (deleted upstream)"
      stale=1
    fi
  done < <(git diff --name-only --no-renames --diff-filter=D "$linked_base" "$upstream_base")
else
  echo "skipping upstream-deletion check: no upstream/main ref"
fi

for path in "${required_paths[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING file:   $path"
    missing=1
  fi
done

for entry in "${required_anchors[@]}"; do
  file="${entry%%|*}"
  needle="${entry#*|}"
  if [ ! -f "$file" ]; then
    echo "MISSING file:   $file (expected to contain '$needle')"
    missing=1
  elif ! grep -qF -- "$needle" "$file"; then
    echo "MISSING anchor: '$needle' in $file"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo
  echo "Fork-owned code is missing; an upstream sync probably overwrote it." >&2
  echo "Restore it from the pre-sync commit before continuing." >&2
  exit 1
fi

if [ "$stale" -ne 0 ]; then
  echo
  echo "Upstream deleted these files but the fork still has them. Port any" >&2
  echo "fork changes to upstream's replacement and delete them, or list them" >&2
  echo "in kept_upstream_deletions." >&2
  exit 1
fi

echo "fork surface intact (${#required_paths[@]} files, ${#required_anchors[@]} anchors)"
