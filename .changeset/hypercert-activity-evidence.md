---
'@atproto/bsky': patch
'@atproto/api': patch
'@atproto/dev-env': patch
---

Community activities gain contributors, measurements and acknowledgements, borrowed from the Hypercerts claim model. `socialActivity` and `economicActivity` take an optional `contributors` list (`com.para.community.defs#activityContributor`: did or name, role, relative weight), and a donation `activityLedgerEntry` may name its `recipientDid`. New `com.para.community.activityMeasurement` records are dated counts (signatures, attendance, tickets) with method and evidence; organizers' are the official series, other active members' are served as independent counts. New `com.para.community.activityAcknowledgement` records let a donation's recipient or a listed contributor accept, reject or partly accept the organizer's claim; one counts only when written by the account the claim names, the latest per author, subject and role is served, and `current` says whether it answers the version served now. Both are append-only: the first version is kept and an edit is served flagged `edited`. `com.para.community.getActivity` returns `measurements` and `acknowledgements`. Adds the `20261116T120000000Z-add-activity-evidence` migration and the `measurements_json` and `acknowledgements_json` fields of `GetParaCommunityActivityResponse`. The demo seed records two official counts on its signature drive.
