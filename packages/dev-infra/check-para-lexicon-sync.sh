#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

extract_para_schema_block() {
  local file="$1"
  awk '
    /^  ComParaActorDefs: \{/ { in_block=1 }
    in_block {
      if ($0 ~ /^  ToolsOzoneCommunicationCreateTemplate: \{$/ || $0 ~ /^} as const satisfies Record<string, LexiconDoc>/) {
        exit
      }
      print
    }
  ' "$file"
}

extract_para_ids_block() {
  local file="$1"
  awk '
    /^  ComParaActorDefs: '\''com\.para\.actor\.defs'\'',/ { in_block=1 }
    in_block {
      print
      if ($0 ~ /^  ComParaStatus: '\''com\.para\.status'\'',/) {
        exit
      }
    }
  ' "$file"
}

expected_schema="$(extract_para_schema_block packages/bsky/src/lexicon/lexicons.ts)"
expected_ids="$(extract_para_ids_block packages/bsky/src/lexicon/lexicons.ts)"

for file in \
  packages/api/src/client/lexicons.ts \
  packages/pds/src/lexicon/lexicons.ts
  do
  actual_schema="$(extract_para_schema_block "$file")"
  actual_ids="$(extract_para_ids_block "$file")"

  if [[ "$actual_schema" != "$expected_schema" ]]; then
    echo "Para schema block drift detected in $file"
    diff -u <(printf '%s\n' "$expected_schema") <(printf '%s\n' "$actual_schema") || true
    exit 1
  fi

  if [[ "$actual_ids" != "$expected_ids" ]]; then
    echo "Para ids block drift detected in $file"
    diff -u <(printf '%s\n' "$expected_ids") <(printf '%s\n' "$actual_ids") || true
    exit 1
  fi
done

echo "Para lexicon blocks are in sync across bsky/api/pds."
