# Quarter Plan — Pilot Community Launch (Sep 1 – Nov 27, 2026)

Consolidated plan for the next quarter across WatZappa (backend) and PARA
(app), scoped to one protected outcome. The backend critical path is defined
in detail in [MATRIX_V2_QUARTER_PLAN.md](./MATRIX_V2_QUARTER_PLAN.md); this
document adopts it as the backbone and integrates the PARA work that the
pilot depends on. Capacity: solo 1 FTE, serial critical path.

## North star

**One real community running the full civic loop end-to-end**: hardened chat
with derived-MXID login, real governance data (no mocks), moderation that
works. Single community (R10). Explicitly *not* app-store polish.

## Sprints

### S1 (Sep 1–12) — Production prerequisites + decisions
- Stand up monitoring: nothing scrapes the bridge's Prometheus metrics and
  Synapse metrics are disabled today.
- Media decision #6: SeaweedFS with encryption, or amend the doc.
- TLS / .well-known verification pass.
- Draft **OD-3** (LLM policy) and **OD-4** (identity label mapping) as
  founding-community ballot proposals — these are decided democratically by
  the community, not unilaterally. S1 produces the proposal texts (disclosure
  wording, retention/training commitment, self-hosted-model question; the
  `civic`/`anonymous` mapping); the votes run in S6 once the pilot community
  exists. Until each vote closes, the coded fail-safes stand: no
  `OPENAI_API_KEY`, default identity mapping.
- PARA hygiene: restore the missing `lint-rules/` directory (the pre-commit
  gate is broken on every commit) and replace the hardcoded PDS LAN IP in
  `src/lib/constants.ts` with env config.
- Upstream sync (≤1 day, per R5): 20-commit backlog; prioritize #5076/#5083
  (ozone moderation queues — prerequisite work for ModerationInbox in S5).

### S2 (Sep 15–26) — Hardened v1 cutover + Gate D
- Production cutover of the hardened Synapse stack (stage 1).
- **Gate D** (merge blocker): in-app "messages are not end-to-end encrypted"
  disclosure in PARA chat.
- PARA: make the matrix-js-sdk WebView bundle regeneration a documented,
  repeatable pipeline (today it is a hand-committed artifact with a staleness
  warning).
- Release train: consume the ~20 pending changesets and cut package releases.

### S3 (Sep 29–Oct 10) — MAS staging + real M8 auth
- MAS on staging with MSC3861 enabled (the flag exists, currently `false`).
- Continue `para-idp`.
- PARA: complete the M8 OAuth grant flow — today only the dev-bootstrap path
  issues tokens; every identity feature fails without a real grant.
- Test debt #1: QVL/QVLD regression suite (voting correctness is
  pilot-critical and currently untested).

### S4 (Oct 13–24) — OD-6 join seam
- Design and implement **OD-6** (unblocked by the OD-2 closure): capability
  token vs Synapse module vs MAS-mediated joins — the last open structural
  decision in Matrix v2.
- Delete `user_matrix_map`; set `password_config.enabled: false`; identity
  boundary CI green.
- PARA: chat integration QA against staging MAS; make unread polling degrade
  visibly instead of silently reporting zero when the bridge is down.

### S5 (Oct 27–Nov 7) — F9 + pilot data paths
- **F9 authorization**: bridge `/api` endpoints must check community
  membership (everything except `/api/space-for-community` currently
  authenticates but does not authorize). Gates multi-community.
- PARA: implement the real ModerationInbox (today a header-only stub) on top
  of F9 + the ozone queues from S1.
- PARA: replace mock civic services (`raq.ts`, `policies.ts`,
  `representatives.ts`) with real backend calls for pilot flows — the RAQ
  pipeline repair (commit `4cf1caefd`) is the backend side of this.
- Migration rehearsal on a production backup (R9 quarterly drill).
- E2EE spike: 3 days, hard stop, no rollout.

### S6 (Nov 10–21) — Stage-2 cutover + pilot
- Derived-MXID login live in production (stage 2).
- Onboard the pilot community (single community per R10).
- Run the **OD-3 and OD-4 founding-community ballots** drafted in S1, through
  the platform's own proposal/vote flow — the community decides these
  democratically. Fail-safe defaults remain in force until each vote closes.
- Soak-and-fix week. Run PARA's `docs/civic-read-smoke-checklist.md` against
  every release candidate — mitigates regression risk from the app's
  mid-flight SDK migration and auto-merge recovery.

### S7 (Nov 24–27) — Buffer only
No new scope.

## Explicitly deferred (with reasons)

| Item | Reason |
| --- | --- |
| E2EE rollout | Blocked upstream (matrix-js-sdk#4150); spike only in S5 |
| Tuwunel homeserver spike / OD-1 | Deferred out of quarter by MATRIX_V2 |
| Multi-community | Needs F9 validated in production first (R10) |
| OD-P1/P2 personal spaces for civic-tree collections | Awaiting space-host decision |
| OD-7 §5a vote-proof requirement | Blocks the `anonymous_identities` linkage fix; not pilot-critical |
| Cabildeo-live test suite | Unless the pilot uses cabildeo-live — then pull into S5 |
| INE institutional approval | External dependency; keep preview mode and disclose in-app |
| App polish (emoji picker native fix, stale i18n catalogs, Storybook) | Not pilot-critical; emoji picker is small — slot opportunistically |

## Standing risks

- **R5** upstream-sync capacity — capped at 1 day/sprint.
- **R8** E2EE misread as private — Gate D disclosure is the merge blocker.
- **R10** single-community constraint until F9 proves out in production.
- **Accepted (new)**: PARA regression surface from the recent auto-merge
  recovery — mitigated by the civic-read smoke checklist on every release
  candidate.
