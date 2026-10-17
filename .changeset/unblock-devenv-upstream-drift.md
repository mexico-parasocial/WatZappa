---
'@atproto/oauth-provider': patch
'@atproto/ozone': patch
---

Fix three leftovers from the upstream sync that stopped the whole workspace
building.

`AccountManager` had `const await tokens = …` where it meant
`const tokens = await …`, a syntax error that failed the oauth-provider build
outright.

Ozone's assignment service joins `report_queue` and rebuilds a queue row from
the result, but never picked up the `recommendedLabels` column added in
`20260928T000000000Z-inbox-appeal`, so the reconstructed row no longer
satisfied the table type. All four joins now select it.

The remaining errors — `tools.ozone.inbox`, queue `recommendedLabels`,
`relatedViews`, `report.defs#unassignmentActivity` — were stale generated
lexicons, not source problems: the JSON schemas were present and `pnpm codegen`
had not been run since they landed.
