# Matrix v2 — Quarter Plan

**Quarter:** Mon 2026-08-24 → Fri 2026-11-20 (13 weeks, 6 sprints + 1 buffer week)
**Goal (revised 2026-08-20):** production this quarter, in two stages — see §2
**Owner:** solo (1 FTE)
**Supersedes:** the resourcing and phasing in `para-matrix-v2-plan.md`. That plan's
findings still hold; its schedule does not — see §1.

---

## 1. Re-baseline: why the original plan cannot run

The v2 plan assumes *"2–3 engineers + sprint lead + part-time security reviewer"*
over 12 weeks — roughly **30 engineer-weeks**. Actual capacity is **one person**
(38 of the last 48 commits; the remainder are upstream atproto contributors, not
team members), sustaining ~7 commits/week. At 1 FTE, 30 engineer-weeks is more
than two quarters.

Three things have also changed since the plan was written:

| Change | Effect on schedule |
|---|---|
| F7 — membership projection cannot survive CD-M1 | Structural. Not in the original plan at all. Adds the OD-6 join-seam problem. |
| CD-M2 — governance/provisioner split | The plan treated "thin provisioner" as a rename. It is a service extraction. |
| F1–F3, F6, F8 fixed; CD-M1 and CD-M3 landed | Phase 1 is ~60% done, ahead of the original schedule. |

**The plan is therefore not "12 weeks, compressed". It is a different plan: one
track, taken to done.**

## 2. The central call: production early, in two stages

**Revised 2026-08-20** after the goal changed to *production ready this
quarter*. The original plan put cutover in the next quarter. That is no longer
the target, and the right response is not to move the same big-bang cutover into
the final week — it is to go to production **sooner**, in two stages.

### Stage 1 — the hardened v1, live in ~3 weeks

What is running today is already materially better than what was there a week
ago: federation is actually closed (it was not), the config Synapse loads is
actually the hardened one (it was not), the database is Postgres (it was
silently SQLite), every API endpoint authenticates, and there is a verified
backup. None of that requires v2.

Going to production with this now, rather than at the end of the quarter, means
the v2 migration is later rehearsed *against a real system with real data and a
real rollback*, instead of being the first time anything is exercised in anger.

### Stage 2 — v2 identity migrated in place, by end of quarter

`para-idp` + MAS + derived MXIDs + removing the linkage table, deployed onto a
production system that has been running for two months. This is the sequence
that lets "production this quarter" mean something other than "a cutover with no
slack behind it".

### What will NOT be true at production, and must be said out loud

**End-to-end encryption will not be on.** The homeserver operator can read every
message. This is unchanged from the original plan — the blocker is upstream
(matrix-js-sdk#4150) and is not ours to fix this quarter.

For a product that sells itself on privacy, shipping without stating this
plainly, in the interface, would be exactly the failure this whole exercise has
been about: F1 was a privacy claim the deployment did not deliver. **Gate D
below makes the disclosure a merge blocker, not a footnote.**

## 3. The critical path

```
OD-2 decision ─→ identity signature ─→ para-idp ─→ MAS ─→ derived-MXID login
                                                              │
                              OD-6 join seam ─────────────────┤
                                                              ↓
                                                  remove user_matrix_map
                                                              ↓
                                              identity-boundary CI green
```

Everything else in the quarter is off the critical path and is scheduled as
fill or explicitly deferred.

### The single highest-leverage decision in the quarter

OD-2 currently recommends transposing Monero's `generate_signature` to
ristretto255. That is sound, but it **requires cryptographic review that this
project has no one to provide** — the "part-time security reviewer" does not
exist. A hand-rolled scheme with no reviewer is not a schedule risk, it is a
guarantee we cannot honestly make.

`@scure/sr25519` is an audited JS implementation of Schnorr over ristretto255
(Oak Security, Aug 2025), from the same author as `@noble/curves` and
`@scure/bip39` — both already in iM8's dependency tree. It uses merlin
transcripts for domain separation and synthetic nonces, independently matching
both divergences the OD-2 memo argued for.

**S1 opens with a 1-day spike: can we sign with our own identity scalar?**
sr25519 secret keys are `(scalar ‖ nonce)`; if `sign()` accepts a 64-byte key
with our scalar in the first 32 bytes, our `identity_pub_i` *is* the sr25519
public key and OD-2 collapses from "write and audit novel crypto" to "use a
library". If it does not, fall back to the Monero transposition and accept that
the audit becomes a funded external dependency.

**That one day decides whether this quarter is deliverable.**

## 4. Sprints

### S1 · Aug 24 – Sep 04 · Decide, de-risk, and prepare for production
- ~~sr25519 spike~~ **done Aug 20, passed.** CD-M4 recorded, OD-2 closed.
- ~~`signIdentityChallenge()`~~ **done** — 16 tests, purpose binding, ballot
  identity refused at the signing layer.
- ~~Backup and restore~~ **done, verified by a full destroy-and-rebuild.**
- ~~Verify hardening on a live server~~ **done** — `publicRooms` returns 401.
- Remaining, all production prerequisites:
  - **Monitoring.** Nothing scrapes the bridge's Prometheus metrics and Synapse
    metrics are off. Today an outage reaches you via a user.
  - **Media decision.** MATRIX_V2 §3.6 says SeaweedFS with encryption at rest;
    reality is a local unencrypted Docker volume. Implement it or amend the doc
    — do not leave the doc claiming what the deployment does not do.
  - **TLS and `.well-known`** verified against the real domain.
  - Close OD-3 (LLM policy) and OD-4 (identity labels).

### S2 · Sep 07 – Sep 18 · Ship stage 1, start para-idp
- **Production cutover of the hardened v1.** Nightly encrypted backups shipping
  off-host; monitoring live; rollback rehearsed.
- **Gate D — the disclosure.** In-app copy states plainly that messages are not
  end-to-end encrypted and the server operator can read them. No pilot user
  joins before this ships.
- Begin `para-idp`: verify the signed assertion, issue an OIDC ID token with
  `sub` = the CD-M1 localpart. Reuse mubEZ's `issuanceChallenge`.

### S3 · Sep 21 – Oct 02 · MAS on staging
- MAS with `para-idp` upstream; Synapse delegated auth (MSC3861).
- Production runs stage 1 throughout; this is staging work.

### S4 · Oct 05 – Oct 16 · Cut the linkage, on staging
- **OD-6, the join seam** — the server can no longer derive a member's MXID, so
  membership-driven invitation must change.
- Delete `user_matrix_map`, remove `didToMxid`, retire password issuance,
  `password_config.enabled: false`.

### S5 · Oct 19 – Oct 30 · Prove it, and prepare the migration
- Identity-boundary CI complete, both halves.
- **F9 — authorization.** Now blocking: a production system with more than one
  community cannot ship without it.
- Migration rehearsal on a copy of **production** data, restored from a real
  backup. This is what stage 1 bought.
- **Three-day E2EE spike, hard stop.** Sizes next quarter; ships nothing.

### S6 · Nov 02 – Nov 13 · Stage 2 to production
- Migrate production to derived MXIDs. Dual-run; old accounts deactivated only
  after it holds.
- v1 tokens and mappings destroyed with the witnessed procedure (§6 of
  MATRIX_V2), recorded in the decision log.

### Buffer · Nov 16 – Nov 20
Stabilisation, not new work. If stage 2 slipped, this is where it lands; if it
did not, this is where you watch it and write the post-mortem.

## 5. Gates

| Gate | When | Test | If it fails |
|---|---|---|---|
| ~~**G0**~~ | ~~S1~~ | **PASSED Aug 20** — sr25519 accepts our scalar | — |
| **G1** | End S1 | Backups verified ✓, monitoring live, media decided, TLS verified | Do not go to production. Stage 1 slips to S3. |
| **D** | Before any pilot user | In-app copy states messages are not end-to-end encrypted | **Merge blocker.** No user joins without it. |
| **G2** | End S2 | Hardened v1 serving real users, backups shipping off-host, rollback rehearsed | Stay on staging; stage 2 is unaffected |
| **G3** | End S3 | Login via MAS yields a derived MXID on staging | Stage 2 moves to next quarter. Stage 1 still stands. |
| **G4** | End S4 | `user_matrix_map` deleted, both CI halves green | Ship stage 2 as derived-MXIDs-only, table removal after |
| **G5** | End S6 | Production on derived MXIDs, v1 mappings destroyed | Roll back to stage 1 — which is a working production system, not an outage |

The point of the two-stage shape: **every gate after G2 can fail without taking
production down**, because production is already live on a known-good stack.

## 6. Risks

| # | Risk | L | I | Mitigation / trigger |
|---|---|---|---|---|
| ~~R1~~ | ~~sr25519 cannot take our scalar~~ | — | — | **Retired Aug 20.** G0 passed; no audit on the critical path. |
| **R8** | **Production without E2EE is read by users as "private"** | **High** | **High** | **Gate D.** The disclosure ships before the first pilot user, in the interface, not buried in docs. |
| R9 | Signing key lost, or a backup that never restores | Low | **Terminal** | Restore drill passed Aug 20; nightly encrypted off-host copies from S1; quarterly drills logged |
| R10 | F9 (authorization) reaches production with >1 community | Med | **High** | The pilot stays ONE community until F9 lands in S5. A hard constraint, not a preference. |
| R2 | Solo bus factor | — | **High** | Every decision written as CD-M/OD in-repo. The docs are the redundancy. |
| R3 | OD-6 join seam has no clean answer | Med | High | Timebox to S4; fallback is manual invite for the pilot community only |
| R4 | MAS/MSC3861 integration friction | Med | Med | Keep JWT login behind a flag as temporary fallback (per original plan §8) |
| R5 | Upstream atproto sync work steals capacity | **High** | Med | It already does — the repo carries a large uncommitted upstream diff. Cap sync work at 1 day/sprint or the plan slips. |
| R6 | E2EE spike overruns and eats the quarter | Med | High | Hard 3-day stop. It is a spike, not a project. |
| R7 | Scope creep into ballots | Low | High | Layer-boundary table is merge-blocking |

**R5 is still the most likely way this plan fails**, and it is entirely
self-inflicted. **R8 is the one that would do lasting damage** — a schedule slip
is recoverable; users trusting a privacy claim the system does not deliver is
the failure this whole exercise started from.

## 7. Decisions needed from you

| # | Decision | Needed by | Default if silent |
|---|---|---|---|
| 1 | Accept the two-stage shape: v1 to production ~Sep 18, v2 identity by Nov 20 (§2) | Before S1 | Proceed as written |
| 2 | OD-4 — confirm `civic` = ballot identity | S1 | Assume yes (fail-safe direction already taken) |
| 3 | OD-3 policy — LLM processing allowed at all? | S1 | Deploy without `OPENAI_API_KEY` |
| ~~4~~ | ~~If G0 fails: audit or descope?~~ | — | Moot — G0 passed |
| 6 | Media: build SeaweedFS now, or amend MATRIX_V2 §3.6 and accept local disk + backups? | S1 | Amend the doc |
| 7 | Pilot stays a single community until F9 lands (R10)? | Before S2 | Yes |
| 5 | Cap on upstream-sync time per sprint (R5) | Before S1 | 1 day/sprint |

## 8. What done looks like

**Stage 1, ~Sep 18 — production.** The hardened homeserver serves the pilot
community. Federation closed and verified against the running server, nightly
encrypted backups shipping off-host with a rehearsed restore, monitoring that
pages before a user does, and in-app copy stating plainly what is and is not
encrypted.

**Stage 2, Nov 20 — the identity boundary, in production.**

1. A member joins from the PARA app and lands in a room as
   `@<32 base32 chars>:matrix.para.social`.
2. No row anywhere relates their DID to that MXID, because none is written.
3. CI fails the build if the ballot identity ever gains a Matrix account, or if
   a linkage table reappears.
4. The v1 mappings and tokens are destroyed, witnessed, and recorded.

Not in either: encrypted messages. That is next quarter — and Gate D exists so
users are told, rather than left to assume.
