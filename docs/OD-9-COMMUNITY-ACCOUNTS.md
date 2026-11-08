# OD-9 — Communities as accounts

A PARA community today is a `com.para.community.board` record in its founder's
repo. Its authority (membership, offices, sanctions) is a chain of
`authorityEvent` records spread across the repos of everyone who touched it, and
the AppView decides who holds office by checking each event against whatever it
has indexed when that event arrives. This document proposes making each
community an account with its own `did:plc` and repo, which is the only place
its authority is written, through one PDS endpoint that checks permission at
write time.

**Status:** accepted, 2026-11-04; phase 5 implemented, unreleased. Decided with the
product owner: communities get their own `did:plc`; there is no migration of
existing boards (fresh start); horizontal mode and assembly-approval admission
stay hidden until a trusted tally verifier exists; permissioned spaces may be
used for community-private data even though they are alpha (§3.11). The
remaining decisions are in §8.

---

## 1. Why

The 2026-11-04 review of roles and governance found problems that share one
cause: the community has no identity of its own. [PR #27] patched the live holes
(forged moderation, relations and briefing packs; appointments and leaving).
These remain:

1. **Authority depends on arrival order.** `verifyAuthorityEvent` checks each
   event against the current index and the current board settings. A rejected
   event is never re-checked, so an owner's grant that arrives before the
   member's activation is lost. Two writers racing for the next version: the
   first indexed wins. A rebuilt AppView can reach different officeholders.
   PR #27 added more of this: shares, relations and packs are judged at their
   `indexedAt`.
2. **Writers cannot know the chain head**, so their events are dropped silently
   while their PDS reports success.
3. **Append-only is a PDS policy, not a property.** Accounts on other PDSes can
   delete their authority events; the AppView ignores deletes and keeps
   authority no repo still holds.
4. **The founder owns the community.** Editing the board record changes
   `governanceMode` and `admissionMode`; the founder stays a governance author
   after transferring ownership; deleting the board orphans every chain.
5. **Most governance cannot be exercised.** Nothing can issue a suspension,
   removal, block or reinstatement; offers are not accepted (any `evidence`
   string passes); horizontal moderators expire at 90 days with no renewal;
   assembly admission admits nobody. `getRoleDefinitions` advertises all of it.
6. **Several sources of truth.** Membership comes from authority events, from
   self-written membership records (read directly by about 15 queries,
   including cabildeo vote weighting), and from the PDS's local `roles`.
   `isCommunityOwnerSql` and `listMembers` re-implement the fold in SQL; the
   PDS has its own capability model with extra roles. Officer lists also come
   from a founder-written governance record carrying unverified handles,
   `ratifiedBy` and vote counts.

[PR #27]: https://github.com/mexico-parasocial/WatZappa/pull/27

## 2. The core idea

**One community, one repo, one writer, one fold.**

- The community's repo is the only place its authority and community-level
  decisions live.
- Only the PDS hosting the community writes to it, and only through
  `com.para.community.act`, which authorizes and appends in one transaction.
- Events carry a community-wide sequence. Verifying them is a pure function of
  that repo, applied in sequence order, so every AppView, on every rebuild,
  reaches the same state.
- One policy module decides what each action requires and does. The PDS uses
  it to authorize, the AppView to verify, and `getRoleDefinitions` to describe.

## 3. Proposed shape

### 3.1 The community account

- Created by `com.para.community.create` on the PARA PDS. It gets a `did:plc`
  whose rotation key is the PDS's and whose `#atproto` signing key lives in
  the actor store, like any hosted account.
- It is an actor with no account row: no email, no password, no OAuth
  client. The account manager already supports this (`registerActor` without
  `registerAccount`), so nobody can log in as a community.
- Handle: `<slug><community domain>`, from a dedicated PDS setting (§8).
- DID document services: `#atproto_pds` and `#para_community`, both pointing
  at the hosting PDS. The second is what remote members proxy to (§3.3).
- Generic writes are refused: `createRecord`, `putRecord`, `applyWrites` and
  `deleteRecord` on a community repo fail in the PDS write path, including for
  admins.

### 3.2 What lives where

| Repo      | Record                                   | Content                                                                                                                                         |
| --------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Community | `com.para.community.profile/self`        | Name, description, quadrant, chat ids, `governanceMode`, `admissionMode`. Replaces `board`.                                                     |
| Community | `com.para.community.event/<tid>`         | The chain: `seq`, `prev` (CID of event `seq - 1`), `action`, `actor`, `subject`, parameters, `request`, `createdAt`. Replaces `authorityEvent`. |
| Community | relation, moderation, publication events | Community-level decisions, as `event` actions (§3.9), not separate trusted records.                                                             |
| Community | `com.para.community.governance/self`     | Metadata only: term lengths, contact, escalation path, flairs. No officer lists.                                                                |
| Member    | `com.para.community.request/<tid>`       | The member's signed intent for a privileged action they take (§6).                                                                              |
| Member    | `sharedContent`, briefing-pack drafts    | The member's own content, as today.                                                                                                             |

`prev` chains each event to the one before it, so a gap, a reordering, or a
rewrite of an earlier event is detectable even against the hosting PDS.

### 3.3 `com.para.community.act`

- **Input:** `community` (DID), `action`, optional `subject`, action
  parameters, and a `request` strong ref when the action needs one (§6).
- **Auth:**
  - accounts on the hosting PDS: their session or OAuth token;
  - accounts elsewhere: an inbound service JWT with `iss` = the member,
    `aud` = `<community DID>#para_community`, `lxm` = `com.para.community.act`.
    Their own PDS mints it through the standard `atproto-proxy` path. The
    hosting PDS's `verifyServiceJwt` today accepts only its own DID as `aud`,
    so it must also accept the community DIDs it hosts, with that service id
    (§7).
- **Pipeline**, inside `actorStore.transact(communityDid)`, which serializes
  all writes to one community:
  1. Load the community's state. The PDS keeps the fold result in the
     community's actor store, updated with each append, so it never needs the
     AppView.
  2. `policy.apply(state, proposed)`. A refusal returns a typed error to the
     caller and nothing is written.
  3. Append the event with `seq = last + 1`, `prev`, and `createdAt` from the
     server clock. Time-bound parameters (`expiresAt`) are computed from it,
     never taken from the client.
  4. Commit and return `{ uri, seq }`.
- **No silent drops, no races, no stale versions.** The caller learns
  immediately whether the action happened. Item 2 of §1 disappears, since
  clients never compute versions.

### 3.4 One policy module

`@atproto/common/community-policy.ts` replaces `resolveCapabilities`,
`resolveAvailableAction`, `getRoleDefinitions`, the PDS's
`getViewerCapabilities` and the role checks spread across `bsky`.

- `CommunityAction` and `Capability` are string-literal unions, so a typo is a
  compile error instead of a silent "denied".
- Each action declares who may take it (role, self, or closed), its
  preconditions on actor and subject state, whether it needs a `request`, its
  effect on state, and the governance modes where it exists.
- `apply(state, event): State | Refusal` is pure and deterministic, with time
  taken from the event.
- `describe(mode, admission)` produces the role definitions from the same
  table, so the app can only advertise what can be done.

### 3.5 Verification in the AppView

- Index `com.para.community.event` only from a repo whose own
  `profile/self` exists; `uri.host` is the community.
- Apply events strictly in `seq` order:
  - an event whose predecessor has not arrived waits, and is not rejected;
  - an event that fails `policy.apply`, or whose `prev` does not match, is
    stored and flagged invalid; it changes nothing.
  - Both outcomes depend only on the repo, never on what other repos have
    delivered.
- Per-repo firehose order already delivers a community's events in commit
  order, and backfill reads the repo whole, so in practice waits are rare.
- **Deletes:** the PDS refuses deletes on community repos. If one still
  appears (an operator acting outside the endpoint), the AppView marks the
  chain broken at that `seq` and treats the community as frozen: fail closed,
  never continue silently.
- **Persisted state:**
  - `para_community_state`: last `seq`, CID, broken flag;
  - `para_community_member_state`: community, subject, membership state, roles
    with evidence, and `nextChangeAt`, the earliest expiry. Reads filter on
    `nextChangeAt`, or recompute that row when it has passed.

This one table replaces the legacy membership fallback, `isCommunityOwnerSql`,
the `listMembers` SQL copy and `filterByOfficeWhenIndexed`. Every query that
asks "is X a member, moderator or owner" joins it, including cabildeo vote
weighting and `getPolicyCommunityVotes`.

### 3.6 Membership

- `member.join` → `member.activate` with basis `openAdmission`, actor =
  subject. It exists only with open admission until assembly decisions are
  verifiable.
- `member.leave` is a new action that ends membership and every office.
  Rejoining yields membership only. This closes the gap PR #27 documented,
  where rejoining restored unrevoked offices.
- Membership records in member repos are no longer read. The lexicon is
  retired (§5).

### 3.7 Governance at launch

Hierarchical communities with open admission. Horizontal mode and
assembly-approval admission remain in the schemas but are refused by
`community.create` and by `policy` until a trusted tally verifier exists.

| Action                           | Actor                  | Notes                                                                               |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `member.join` / `member.leave`   | the member             | `leave` is refused for the last owner.                                              |
| `moderator.offer`                | owner                  | Offers expire after 14 days (§8).                                                   |
| `moderator.accept`               | the offered member     | An event by the subject: acceptance is enforced, not an `evidence` string.          |
| `moderator.revoke`               | owner                  |                                                                                     |
| `moderator.resign`               | the moderator          |                                                                                     |
| `member.suspend`                 | moderator or owner     | At most 7 days, computed by the server.                                             |
| `member.reinstate`               | moderator or owner     | Ends a suspension early.                                                            |
| `member.remove` / `member.block` | owner                  | Optionally on a moderator's `sanction.propose` (§8).                                |
| `owner.offer` / `owner.accept`   | owner / offered member | Transfer or co-ownership.                                                           |
| `owner.resign`                   | owner                  | Refused for the last owner.                                                         |
| `profile.update`                 | owner                  | Routine fields only. `governanceMode` and `admissionMode` are protected and closed. |

Anything whose basis is an assembly decision stays closed, as today.

### 3.8 Officer lists and views

- `getGovernance`, `getBoard` and `listMembers` derive moderators and owners
  only from `para_community_member_state`.
- `officials` and `deputies` have no verified source, so they leave the
  response until one exists.
- `getAuthorization` keeps its shape for the Matrix bridge and PARA, but reads
  the state table. `PARA_AUTHORITY_SERVICE_TOKEN` handling is unchanged.

### 3.9 Content, relations and briefing packs

- **Shares** stay in members' repos. A share counts when its author is an
  active member.
- **Moderation** is an `act`: `content.hide`, `content.restore`, `content.pin`
  and `content.unpin` events in the community repo, referencing the share. The
  AppView applies the newest by `seq`. Neither `indexedAt` nor `createdAt`
  enters into it.
- **Relations** need both sides: the parent's owner acts `relation.link`, the
  child's owner acts `relation.accept`, and the link counts only when both
  events exist. This also gives the child a say, which PR #27 left out.
- **Briefing packs:** any member drafts in their own repo, and a moderator or
  owner acts `briefing.publish` (or `briefing.archive`) referencing the
  draft's CID. This is the "members draft, moderators publish" option, and it
  resolves the product question raised on PR #27 (§8).

### 3.10 Indexers without side effects

The rewritten community plugins only index and fold. `finalizeDueCabildeos` and
aggregate recomputation move to daemon jobs keyed by what changed.

The plugins are rewritten with the generated schemas (`com.para.community.*`
from `src/lexicons`), without `@ts-nocheck`.

### 3.11 Permissioned spaces

The community DID is the natural owner of community-private spaces. OD-8 already
proposes "one space per election, owner: the community". It is equally the
place for member-only material, such as private deliberation or a private
roster.

- **The authority chain stays public:** anyone must be able to verify who
  holds office.
- **Spaces are an additive layer.** They stay behind `PDS_SPACES_ENABLED`, and
  phases 2–5 do not depend on them. Building on the alpha is acceptable for
  community-private data. The constraints in `AGENTS.md` (owner-governed
  writes, no blobs, 501 for other space methods) still apply.

## 4. What this removes

Once phase 5 lands, these are deleted, not deprecated in place:

- **Authority events in members' repos:** `verifyAuthorityEvent`, the
  `authorityEvent` indexer and its migrations' replay logic.
- **The legacy membership fallback** and the "active legacy record opens the
  chain" rule from PR #27.
- **Duplicated folds:** `isCommunityOwnerSql`, the `listMembers` role SQL and
  `filterByOfficeWhenIndexed`.
- **Second capability models:** the PDS's `getViewerCapabilities`,
  `getValidRoles` and `assertAuthorityEventWrite`, and the authority branch of
  `assertCommunityRepoWrites`.
- **The second officer list:** the governance record's
  `moderators`/`officials`/`deputies`, and the trust rules for governance
  records from other authors.
- **Old record types:** `board`, `membership`, `roleAcceptance`,
  `authorityEvent`, `relation`, `sharedContentAction`, and the trusted-author
  logic for briefing packs.

## 5. Fresh start

There is no production community to keep (decided above; the quarter plan
records no production deployment).

- **New record NSIDs** (`profile`, `event`, `request`) replace the old ones,
  rather than revising them in place. A record that exists under an old NSID,
  in a dev database or a test fixture, can then never be read with the new
  meaning.
  - The PDS refuses writes of the old types. The AppView stops indexing them.
  - A migration drops their tables.
  - Their lexicon files are marked deprecated, not deleted, since lexicons are
    a public contract.
- **dev-env seeds** create communities through `community.create` and `act`.
- **Outside this repo:**
  - the PARA client switches creation, join/leave and moderation to `act`, and
    community identifiers become `at://<community DID>/com.para.community.profile/self`;
  - the Matrix bridge keeps using `getAuthorization`, keyed by the new
    identifier.
  - Both need coordinated releases; the quarter plan's P0–P2 acceptance must
    be re-run on the new model.

## 6. Trust model

- **The hosting PDS operator holds the community's keys.** It is trusted for
  availability and ordering, exactly as any PDS is for its users' repos. This
  is the same trust PARA's own PDS already carries for its accounts.
- **What the operator must not be able to do is act for a member.** Today the
  AppView would have to take the PDS's word that a member asked to accept an
  office or sanction someone. So every privileged action whose actor is a
  person carries a `request`: a small record the actor writes in their own
  repo, through their own PDS, naming the community, the action, the subject
  and an expiry. Their PDS signs it as part of their repo.
  - The event references it by strong ref and carries `requestProof`: the
    actor's signed repo commit plus the path to the request, as
    `com.atproto.sync.getRecord` returns it. Anyone can verify the event on
    its own, against the actor's signing key, without fetching or waiting for
    the actor's repo. (Phase 2 chose this over waiting for the request to be
    indexed: one remote PDS answering falsely would otherwise stall the whole
    community.)
  - A PDS that forges an event without the actor's request cannot make it
    count. A request names its community, so it cannot be replayed into
    another one, and it backs at most one event.
  - Limit: a rebuild verifies proofs with each actor's _current_ key. After a
    key rotation, an actor's past events would no longer verify. Checking
    against the key valid at commit time (PLC's history) is pending.
  - For a member on the hosting PDS this is still two writes, but on their own
    repo and the community's, not a bypass.
- **Integrity against the host:** `prev` makes any rewrite of history
  detectable by any reader.
- **What this does not protect against:** a host that refuses to append (that
  is censorship, and it is visible to the refused member), a host that goes
  offline, or loss of the PDS rotation key. Adding owners' rotation keys to
  the community's PLC document would let owners move the community, but would
  also let them take it. Not added for now (§8).

## 7. Risks and costs

- **Size.** This touches the PDS (account creation, write path, `act`, inbound
  service auth for hosted DIDs), the AppView (new indexers, state tables,
  roughly 15 queries, every `com.para.community` view), `@atproto/common`
  (policy), dev-env seeds, and two other repositories. It is the largest
  change in the fork so far.
- **Inbound service auth** for `aud = <hosted DID>#para_community` is new
  surface. It must accept only DIDs this PDS hosts as communities, only that
  service id, and only `lxm = com.para.community.act`.
- **Single host per community.** Communities live on PDSes that run `act`.
  Members can be anywhere.
- **Upstream syncs** grow by the new PDS write-path hook and the account
  creation hook. Keep both behind small functions in `packages/pds/src/para/`
  and add them to `check-fork-surface.sh`.
- **Existing work in flight** that reads the old tables (cabildeo weighting,
  follow-through, RAQ, suggestions) must move in the same release as phase 3,
  or it reads empty tables.

## 8. Decisions

Decided 2026-11-04 with the product owner; each was the proposal of this
document unless noted.

1. **Handle domain.** Every community has a handle, `<slug><domain>`. The
   domain is a dedicated PDS setting (`PDS_PARA_COMMUNITY_HANDLE_DOMAIN`),
   kept apart from the user handle domains so users cannot claim community
   names. Its default is `.community` followed by the PDS's first service
   handle domain. The operator must point that domain's DNS at the PDS.
   (No proposal existed; this is the default taken.)
2. **Member requests:** every action whose actor is a person needs one, joins
   included. A member on the hosting PDS does not write it by hand: `act`
   writes it into their repo for them.
3. **Offer expiry:** 14 days.
4. **Removal and blocking:** the owner decides, directly or on a moderator's
   `sanction.propose`. (No proposal existed; this keeps both paths.)
5. **Relations:** both owners must act.
6. **Briefing packs:** members draft, moderators and owners publish.
7. **Owner rotation keys:** not added for now. The hosting PDS alone holds
   the community's rotation key; revisit when communities need to move
   between hosts. (No proposal existed; this is the default taken.)
8. **Moderation from a parent community:** none. Each community moderates
   its own shares.

## 9. Phases and exit criteria

1. **Design (this document).** Done: §8 records the decisions.
2. **Community accounts and `act`.** Implemented on
   `claude/od-9-community-accounts` (unmerged, undeployed).
   - `community.create`, the refusal of generic writes, inbound service auth,
     the event schema with `seq`/`prev`/`requestProof`, and the policy module
     with join, leave, offers, acceptance, revocation, resignation and
     suspension.
   - Exit met in `packages/bsky/tests/para-community-accounts.test.ts`:
     events replayed newest first, concurrent `act` calls and a rebuild from
     stored events all reach the same state; forged proofs, forks, broken
     links and deletions are refused or freeze the community.
   - Not exercised: fetching a request proof from a _different_ PDS (the
     service-auth test uses a member hosted on the same PDS).
3. **Effective state as the only membership source.** Implemented on
   `claude/od-9-phase-3` (stacked on phase 2; unmerged, undeployed).
   - `community-membership.ts` is the one seam. A community is named by its
     URI; an account's is its profile, `at://<did>/com.para.community.profile/self`,
     and every membership and office answer for it comes from
     `para_community_member_state`. `getAuthoritySnapshots` dispatches on the
     URI, so its callers needed no change.
   - Board lookups also resolve accounts, by URI, DID, handle or slug, never
     by display name. Moved: `getAuthorization`, `getBoard`, `listMembers`,
     `getGovernance` (officers from the chain; no `officials`/`deputies`),
     `getPolicyCommunityVotes`, delegation candidates, cabildeo vote
     eligibility and delegation tallies, member counts, community alignment,
     suggestions and the personal civic tree.
   - Record-based moderation, relations and briefing packs count nothing for
     an account until phase 4 makes them chain actions.
   - Exit as met: no query answers for a community account from the old
     tables. Boards keep the legacy path, which phase 5 deletes. Not yet:
     self-nominated delegate candidates have no account equivalent (phase 5
     work). `listBoards` lists accounts since phase 4.
4. **Remaining governance and community decisions.** Implemented on
   `claude/od-9-phase-4` (stacked on phase 3; unmerged, undeployed).
   - Removal and blocking: `member.remove` (the member may join again),
     `member.block` and `member.unblock` (unblocking restores the right to
     join, not membership), and a moderator's `sanction.propose`, an open
     proposal an owner may cite with `offer`. Owners are never sanctioned;
     they resign first. `member.unblock` is an addition: without it a block
     could not be undone.
   - Owner transfer: `owner.offer`, `owner.accept` (replaces a moderator's
     office) and `owner.resign`, refused for the last owner.
   - Moderation: `content.hide`/`restore`/`pin`/`unpin`, newest by `seq`,
     as independent flags. A share counts only while its author is an active
     member, and a community account's pins are never the sharer's own.
   - Relations: `relation.link` (parent owner), `relation.accept` (child
     owner) and `relation.unlink`. A relation counts when both halves stand.
     A community holds one half per counterpart, so a later `accept` replaces
     an earlier `link` for the same pair, and two communities can never be
     each other's parent. Longer cycles span several chains, so no chain can
     refuse them; the AppView sets aside every relation on a cycle, whichever
     was written last, until one of them is withdrawn.
   - Briefing packs: `briefing.publish` names the draft's CID and needs an
     active member's draft; `briefing.archive` ends it. Editing the draft
     changes its CID and withdraws it until it is published again.
   - Member requests: every new action's parameters (`sanction`, `target`,
     `targetCid`, `offer`) are bound by the member's request, so a request
     for one share cannot hide another.
   - Exit met in `packages/bsky/tests/para-community-governance-actions.test.ts`:
     the chain applies every action `describeCommunityActions` advertises,
     and a rebuild reproduces the same state, including content, briefing
     and relation tables. The policy unit tests cover each refusal.
   - `profile.update` (owner): the event carries the whole presentation
     (`name`, `description`, `quadrant`, `region`), the member's request binds
     it, and the host replaces the `profile/self` record in the same commit,
     keeping `createdAt`. `governanceMode` and `admissionMode` are not in it.
     The AppView indexes the record as before; the event is the authority
     trail.
   - `com.para.community.listOpenOffers`: open, unexpired offers and
     proposals. Owners and moderators see all; anyone else sees only those
     naming them, so a proposal to sanction a member is not public. The
     `seq` it returns is the `offer` of the answering `act`.
   - `listBoards` unions community accounts into the board list, with every
     filter and sort (`size` counts account members too). A frozen account is
     listed with the state `frozen`.
   - A request held by a member's own PDS is proved over
     `com.atproto.sync.getRecord`; the test runs a second PDS and refuses a
     missing, mismatched or foreign request.
   - Not done: request proofs signed by a rotated key (see the key rotation
     note above).
5. **Cut over and delete.** Four stages, each its own commit so one can be
   reverted without the rest. The removal is all-or-nothing in the AppView
   (boards still depend on authority events), so the producers go first.
   - Retire the old NSIDs, drop their tables, delete the code in §4, rewrite
     the dev-env seeds, release with PARA and the bridge.
   - Exit: `check-fork-surface.sh` updated; quarter plan P0 re-accepted on the
     new model.
   - **Stage 1, producers** (`claude/od-9-phase-5`, stacked on phase 4;
     unmerged, undeployed). The PDS refuses new records of the retired types
     (`LegacyCommunityRecord`) and no longer serves `createBoard`, `join`,
     `leave`, `acceptDraftInvite`, `removeSharedContent`, `restoreSharedContent`,
     its `getBoard`/`listBoards`, or the name-uniqueness check (a handle is
     unique, a display name no longer is). Dev-env helpers and the demo seed
     found accounts. Tests of the legacy authority model (role forgery,
     moderation authority, self-nominated delegates) are deleted with it.
     Porting the fixtures exposed four phase 3 gaps, now fixed: a slug did not
     resolve to an account, a chain event did not re-tally open cabildeos, an
     account's stewards were read from boards, and activities did not name an
     account.
   - **Open for stage 3 (bridge):** the demo seed no longer sets bicameral
     chambers or the officials and deputies lists; accounts have neither.
   - **Stage 2, readers** (same branch). The AppView no longer indexes
     `board`, `membership`, `governance`, `relation`, `authorityEvent` or
     `sharedContentAction`; their six tables are dropped by migration
     `20261109T120000000Z`, and `getAuthoritySnapshots` answers from a
     community's chain alone (anything else has no members). `community.ts`,
     the cabildeo routes, the civic trees, RAQ, records and briefing packs
     serve accounts only. A briefing pack, relation or share counts only
     through a chain event. `@atproto/common` loses `deriveEffectiveAuthority`
     and the authority-event types. Lost, with no account equivalent yet:
     self-nominated delegate candidates, governance `matterFlairIds` and
     `policyFlairIds` (the board list's flair filters match nothing),
     officials and deputies, and `moderator_gate` contribution voting.
   - **Stage 3, Matrix bridge** (same branch). Authority was already read
     from the AppView's `getAuthorization`; what changed is discovery. The
     firehose consumer follows a community's `profile` (provision the space,
     keyed by the profile URI, alias from the DID) and its `event` chain (re-check
     the subject of membership and office events). It no longer reads
     `board`, `membership` or `authorityEvent` records, and the stale
     `communities.json` is gone. Every community is unicameral until chambers
     have an account field.
   - **Stage 4, lexicons** (same branch). The seven record lexicons and six
     procedures are deleted from `lexicons/`, from the four packages'
     `lexicons.json`, from the regenerated `@atproto/api` client and from the
     lexicon reference. The PDS keeps refusing new records of those types
     (`LEGACY_COMMUNITY_COLLECTIONS`), now without a lexicon behind them.
   - **Still open for phase 5:** release together with PARA and the bridge,
     and re-accept quarter plan P0 on the new model. Neither is a code change.
6. **Cleanup.**
   - Indexer side effects moved to daemon jobs.
   - Remaining `@ts-nocheck` removed from community plugins.
   - Vote and delegation families reviewed against OD-7.
