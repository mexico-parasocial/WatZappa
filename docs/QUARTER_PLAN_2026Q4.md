# Pilot launch — remaining work, October–November 2026

**Updated: 2026-10-05. This is the canonical cross-repository execution queue.**
It replaces the September sprint calendar and the conflicting calendar in
[MATRIX_V2_QUARTER_PLAN.md](./MATRIX_V2_QUARTER_PLAN.md). Solo capacity: one
engineering lane. November is a target horizon, not a verified release date.

## Outcome and current assessment

The next release milestone is **one real community using real login, community
data, chat and moderation on operated infrastructure**. Screens and local demo
content are ahead of release evidence. A full civic loop with binding private
voting additionally requires the governance gates below; it is not guaranteed
by deploying Matrix or finishing the M8 grant.

The governance G1 scope consumed the capacity originally assigned to S3. Its
[execution record](./GOVERNANCE-G1-EXECUTION.md) remains open. Do not promise
G1/G2 and identity/deployment work in the same solo sprint. Existing map, tree
and book features are not evidence of pilot acceptance or a reason to restart
their implementation.

## Start here; avoid repeating the audit

Read this queue and its evidence before scanning the repositories. Recheck only
the files, branch changes or live environment relevant to the next item.
Distinguish **implemented**, **tested**, **merged** and **deployed**. A document
saying "done", a test file existing, or a local login is not proof of production.

When an item closes, remove it from the remaining-work queue and link its
commit, test result or deployment record in the evidence section. Delete a
completed sprint from active roadmaps only after every acceptance item closes;
move unfinished acceptance into the queue rather than losing it. Keep design
decisions and historical evidence. Update this document in the same handoff so
the next agent starts from the next task, not a new whole-repository audit.

### Evidence baseline (2026-10-05)

Read-only inspection of PARA `1f3e7ed3f`, WatZappa `9b57aa634`, mubEZ `afc4308`
and the worktrees below. PARA has unrelated local UI edits, including Messages.
That baseline inspection did not run runtime suites. Subsequent P0/P1 implementation
and local validation are recorded below; no staging/production acceptance is claimed.

| Former task / claim         | What is actually present                                                                                                                                                                                                                                                                                                   | Remaining acceptance                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 PARA hygiene             | `../PARA/lint-rules/` exists; `../PARA/src/lib/constants.ts` reads `EXPO_PUBLIC_LOCAL_DEV_IP`, service overrides and demo flags.                                                                                                                                                                                           | Verify the selected release environment; do not recreate the directory or redo the env conversion.                                                                                                   |
| S1 upstream backlog         | Current WatZappa history includes `7131b165d` (upstream sync/build work) and `9b57aa634` (lazy `natural` import).                                                                                                                                                                                                          | Validate the selected release revision. The old "20 commits behind" count is not current evidence.                                                                                                   |
| S2 Gate D                   | `../PARA/src/components/chat/ChatEncryptionNotice.tsx` is used by `ChatCivicContext.tsx` and explains operator access for unencrypted chat.                                                                                                                                                                                | Check it in supported release clients against actual room encryption.                                                                                                                                |
| S2 chat SDK pipeline        | `../PARA/scripts/build-chat-bundle.js` and `pnpm build:chat-bundle` exist.                                                                                                                                                                                                                                                 | Regenerate/compare assets when selecting the release SDK; do not invent a new pipeline.                                                                                                              |
| S3 M8 broker vs client | PARA `b303625db` and mubEZ `061dc23` now implement DID/attempt/PKCE-bound native and web callbacks, token exchange, rotated refresh and logout. Quiet background `pending_oauth` is intentional; the explicit Connect flow completes the grant. See [P1 evidence](./M8-LOGIN-EXECUTION-2026-10-05.md). | Deploy the paired broker migration/config, resolve full release build blockers, and prove actual supported-client login without dev bootstrap. Web reconnects after reload; persistence is an open pilot requirement. |
| S3 MAS / para-idp           | Prototype and local acceptance are recorded in `MATRIX_V2.md` §8 and [local acceptance](./MATRIX-LOCAL-ACCEPTANCE-2026-09-26.md). `deploy/matrix/setup-mas.sh` generates the stable `matrix_authentication_service` integration and removes obsolete MSC3861 config. PARA web has `webOidc.ts` / `useMatrixWebSession.ts`. | Prove the complete grant/join/refresh path on an identified staging deployment. **Do not enable the obsolete `msc3861` flag or rebuild the existing prototype.**                                     |
| S3 QVL regression coverage  | `packages/bsky/tests/qvl-{voting,indexing,queries}.test.ts` and the delegation regression exist. G1 has targeted results in its execution record.                                                                                                                                                                          | Run relevant suites on the release revision; existence and historical targeted passes do not mean binding voting is safe or enabled.                                                                 |
| S4 OD-6 / identity boundary | CD-M6 is closed. Both `services/matrix-bridge/src/db/{sqlite,pg}/base.ts` drop `user_matrix_map`; `identity-boundary.test.ts` exists; `deploy/matrix/hardening.yaml` disables passwords.                                                                                                                                   | Staging acceptance and eventual legacy production cleanup. **Do not redesign OD-6 or schedule table deletion again.** The drop statement is cleanup, not proof that an active mapping store remains. |
| S4 bridge-down UI           | `../PARA/src/state/queries/matrix.ts` returns `unavailable`; `ChatList.tsx` renders `MATRIX_UNAVAILABLE` and `CommunityChatsScreen.tsx` renders a bridge-down notice.                                                                                                                                                      | Runtime outage/recovery QA; current Messages files include local edits.                                                                                                                              |
| S5 F9 route coverage        | `authz.ts` and callers already exist. Governance reads use authorization; consent is self-bound; SSE checks audiences/room membership at delivery; institutions use capability checks. See `routes/{governance-read,consent,events,institutions,matrix-identity}.ts`.                                                      | Targeted route/resource regression review and trusted role ingestion. **Do not classify all these routes as unauthorized merely because they use different helpers.**                                |
| S5 civic services           | RAQ uses PDS/AppView calls; its `RAQ_AXES` import is static questionnaire config. Policies and representatives have real paths plus mock branches. `../PARA/src/lib/services/config.ts` enables mocks for `__DEV__` or an explicit env flag.                                                                               | Select and exercise a real-data pilot build; stop simulated records appearing in pilot flows. An import from `mock-data` alone is not proof the whole service is fake.                               |
| S5 ModerationInbox          | `../PARA/src/screens/ModerationInbox/index.tsx` has tabs/components but hardcoded reports and TODO actions.                                                                                                                                                                                                                | Real reporting/review/actions; it is a placeholder, not a header-only screen.                                                                                                                        |
| Production                  | DNS lookup on 2026-10-05 returned no A records for `matrix.para.social` or `chat.para.social`; `para.social` returned `162.255.119.120`. No cutover evidence was established here.                                                                                                                                         | Confirm intended domains/server and live DNS, TLS, discovery, alerts, off-host backups and restore. DNS alone does not establish whether another deployment exists.                                  |

### P0 implementation evidence (2026-10-05)

[Execution and rollout record](./TRUSTED-AUTHORITY-EXECUTION-2026-10-05.md).
The creator-only interim bridge patch has been replaced; do not implement it again.

- Integrated local candidate: `/Users/mlv/Desktop/Home/WatZappa-bridge-roles`,
  branch `fix/bridge-self-declared-roles`, code revision `7f485158b`.
  It includes bridge `067c13f28` plus AppView fixes `16725660b`, `49e6f3dbe`
  and `7f485158b`. These are committed locally, **not merged or deployed**.
- AppView source: `/Users/mlv/Desktop/Home/WatZappa-role-forgery`, branch
  `fix/community-role-forgery`, `f033b8d36` (following `84bf20bf9`, `ef3974492`).
  A separate local PARA feed test edit remains uncommitted; do not bundle it
  into role-fix integration or assume the whole checkout is clean.
- Bridge build/typecheck pass; full SQLite/PostgreSQL run: **261 tests, 26 files**.
  After integrating both services, the bridge typecheck and focused regressions
  pass: **66 tests, 4 files**.
- AppView and dev-env builds pass. Scoped credential, authority forgery/remediation
  and delegation-candidate suites: **30 tests**. Their committed source is identical
  in the integrated candidate. A fourth local feed suite brings the run to 51;
  its uncommitted fixture is outside this candidate.
- Broader AppView notification validation: **150 passed, 7 failed** across two
  suites. Empty/terminal cursors, seen/read state and activity-subscription
  pagination remain release verification work under P4; no whole-AppView green
  claim. Test-generated snapshot changes were discarded.

Main feature checkouts still contain the old role source until this candidate
is integrated. Existing unrelated PARA UI edits remain separate.

### P1 implementation evidence (2026-10-05)

[Implementation, validation and rollout record](./M8-LOGIN-EXECUTION-2026-10-05.md).
The native/web callback engineering is committed; do not rebuild it.

- PARA candidate `b303625db` (`feat/personal-civic-tree-revamp`); broker candidate
  `2003f6f` (`feat/nullifier-v2`, login implementation through `061dc23`).
  Platform configuration/preflight wrapper: `7da45d0`. These are local commits;
  no deployment or release integration is established here.
- PARA: **60 focused tests, 8 files**, login-core type checks for all three
  platforms, changed-file lint without errors, and bskyweb compilation pass.
- Broker: **26 distinct focused tests**, including seeded exchange/refresh/logout
  and real HTTP failure-redirect cases; full broker build passes with migrations 040–041.
  **6 additional deployment-preflight tests pass**; 4 existing handoff tests
  also pass in that follow-up run. Source and compiled preflight pass all 10
  configuration checks against a migrated copy of the populated local database.
  This is configuration-only evidence; the source database was not migrated.
- No successful live-provider login, native-device/browser acceptance or staging
  acceptance is claimed. PARA's full-app type checks encounter separate AtCard/
  OTA working-tree errors; resolve selected release edits and rerun them.
- Web credentials are held in memory and require reconnecting after reload.
  Decide whether the pilot requires persistent web sessions before closing P1.
  Native release credentials require SecureStore. Refresh-family revocation
  does not immediately revoke access JWTs.
- Current environment blockers are recorded in the execution record: local
  PDS/broker/bridge are stopped, the public example broker did not resolve from
  this machine, platform deployment configuration is absent, and local migration
  041 is missing. The ignored local native callback was corrected, but real-login
  acceptance still needs bootstrap off and exact web callback/CORS. Latest web
  type check still reports the separate Attie import and OTA API errors.

## Remaining execution queue (ordered)

### P0 — integrate and accept trusted community roles

**Engineering implementation is committed and locally tested; rollout acceptance
is still open.** The candidate resolves member/moderator/owner authority through
service-authenticated AppView queries, rejects self-declared privileges, repairs
persisted bridge roles before serving and revalidates historical AppView grants.
It refreshes joins, authorization, SSE room delivery, native interactions and
retries; authority events and a periodic sweep catch revocation/expiry.

Remaining actions:

1. Review/integrate `7f485158b` into the selected release revision. The main
   checkout still reads self-authored roles until integration.
2. Identify staging. Pause the old bridge during the paired AppView migration /
   bridge upgrade; configure the same dedicated `PARA_AUTHORITY_SERVICE_TOKEN`
   on both services and `BRIDGE_AUTHORITY_APPVIEW_URL` on the bridge.
3. On the real homeserver, prove forged-role rejection, legitimate moderator
   promotion/demotion, owner handover, chamber visibility, existing-state repair
   and outage/recovery. Verification failure suspends access and invokes device
   revocation/bans; recovery needs fresh login/attestation for revoked devices.
4. Keep delegate/observer bridge powers disabled until a verified grant protocol
   exists. Delegate self-nomination is a candidate label, not moderation/sortition
   authority. Assembly-decision grants remain closed pending a trusted tally
   verifier. Do not treat these restrictions as complete governance support.

Exit: integrated release revision plus recorded staging acceptance and explicit
supported-role scope. Do not repeat the role-source audit or recreate the fix.
P1 can proceed while staging/operator inputs are being obtained.

### P1 — accept the implemented M8 login candidate

**Engineering is committed and focused local checks pass; supported-client
acceptance remains open.** Use the paired PARA/broker revisions above and
[the execution record](./M8-LOGIN-EXECUTION-2026-10-05.md). Do not restart the
completed callback/token-exchange implementation.

Establish an actual acceptance target and select paired release revisions;
resolve full-app build blockers. The local/example settings above are not a
working staging target. Deploy broker
migrations 040–041 and effective handoff/return-URL/CORS/HTTPS configuration, with
dev bootstrap off. Run `make login-preflight WEB_ORIGIN=https://ACTUAL_PARA_ORIGIN`
from para-platform inside the deployed broker, including its public probes, and
record the deployed revisions separately. Then prove fresh real-provider login, cancel/back,
expiry/replay, account switching, refresh and logout on the supported native
and web clients. Verify native SecureStore and access JWT lifetime semantics.
Confirm whether reconnecting after a web reload meets the pilot requirement;
persistent web sessions need implementation and acceptance if required.

Exit: recorded configuration, exact revisions and supported-client results.
M8 broker auth does not replace Matrix's separate MAS/OIDC client session.

### P2 — staging identity/chat acceptance

Use existing MAS/IdP and CD-M6 code. Record staging URL, configuration and exact
revisions. Verify derived-MXID login, client-owned access/refresh tokens,
proof-based join, chamber access, role revocation, logout and bridge outage /
recovery. Run identity-boundary and relevant authorization regressions. Check
the disclosure against actual room protection; do not infer encryption from
an identity label or local room-creation flag.

Exit: a reproducible supported-client acceptance record. S4's remaining QA is
here; its completed backend implementation has been removed from the backlog.

### P3 — real pilot data and moderation

Exercise the existing real policies/representatives/RAQ paths in a build where
`USE_MOCK_DATA` is false, including empty/error states and pagination. Keep static
questionnaire configuration distinct from invented records. Wire real report
queues and permitted moderation actions; verify ordinary-member denial and
moderator revocation. Test the needed Ozone/bridge paths rather than assuming
the upstream sync or an inbox layout proves functionality.

For encrypted-room reporting, follow the confirmed
[D2 decision](../../PARA/docs/MATRIX-D2-ENCRYPTED-REPORTS-DECISION-2026-09-23.md):
IDs only in reports; moderators review events in their own client. Record
undecryptable/redacted states. No report-body plaintext copy.

Exit: a real community fixture completes supported civic reads and
report/review/action flows, with no simulated outcomes presented as real.

### P4 — release and operations gates

These remain open until there is live evidence; preparation can proceed while
external access/decisions are pending, but it consumes the same engineering lane.

- Confirm operator access and intended domains; provision DNS, TLS and Matrix
  discovery for the actual deployment. The old September v1 cutover date expired.
- Enable scraping and actionable alerts for bridge/Synapse; demonstrate outage
  detection. Record media-at-rest choice and deployment truth (SeaweedFS or an
  explicitly accepted alternative); do not claim encryption from a design doc.
- Ship encrypted backups off-host, restore a real backup, and rehearse migration
  and rollback. If legacy v1 users exist, use the witnessed mapping/token/password
  cleanup procedure; if this is a fresh deployment, record that applicability.
- Select release branches/revisions, run build/type checks and relevant suites,
  resolve the seven notification failures recorded above, consume/review
  applicable changesets and document the release procedure. Do
  not freeze the old changeset count or G1's historical type-error count as a
  current result. PARA `1f3e7ed3f` includes a subsequent iOS type-error fix.
- Create the release-candidate smoke checklist: the old plan referenced
  `PARA/docs/civic-read-smoke-checklist.md`, which is absent in this checkout.
  Cover login/join, civic reads, moderation, outage recovery and privacy UI.

Exit: signed/reproducible release candidate plus recorded deployment, alert,
backup/restore and rollback evidence. Local acceptance is insufficient.

### P5 — one-community pilot and soak

After P0–P4, onboard one community, record support/incident handling and perform
release-candidate smoke checks. Multi-community remains gated on demonstrated
resource isolation and trusted roles. A single community does not waive P0.

Draft OD-3 (LLM processing) and OD-4 (identity labels) proposals before onboarding;
the founding community decides them. Until a valid decision closes, keep no
`OPENAI_API_KEY` and the existing fail-safe mapping. Do not reopen frozen private
voting routes to run these ballots: the voting mechanism must satisfy its own
governance gates before a binding platform ballot is claimed.

## October sequencing and governance dependency

- **October 5–10 target:** integrate/accept P0; configure and test the
  committed P1 candidate and gather operator/domain/media inputs. Close items by evidence,
  not by reaching the end of the week.
- **October 13–24 target:** close P1 acceptance, then P2. Move to P3 only when the preceding
  gates close. Staging setup is required; a production server is not assumed.
- **October 27 onward:** P3/P4, then P5 when evidence permits. November pilot
  timing is conditional; do not carry the old S5/S6 dates forward as commitments.

G1's reference engine and synthetic web lab already exist. Its remaining rules,
native/ALF integration, historical audit and release verification are listed in
[GOVERNANCE-G1-EXECUTION.md](./GOVERNANCE-G1-EXECUTION.md); read that record rather
than restarting diagnosis. Delegation/spending, quorum, approval and tie-break
rules need product resolution. G2's recorded **8–12 engineering-day** estimate
is provisional and follows fixed rules; G3 requires specialist protocol review
with no confirmed budget/date. These compete with P0–P5. Real binding private
voting remains blocked independently of the pilot's chat/data milestone.

## Scope outside this queue

E2EE rollout/native engine default requires the existing
[P8 gates](../../PARA/docs/MATRIX-CHAT-P8-ROLLOUT-GATES-2026-09-23.md), including
recovery, device verification, encrypted media, interoperability and moderator
review. Existing encryption work/local fixtures mean the old "not started,
three-day spike" label is not a useful status. This update does not authorize
switching engines or assert production encryption. Tuwunel, new feature breadth,
app-store polish and institutional approval remain outside pilot acceptance.
Upstream sync is bounded to at most one day per sprint unless required to close
an identified release blocker.
