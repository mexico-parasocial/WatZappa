# OD-2 — Proof of possession for PARA identity keys

Status: **open, decision-ready — gated on the S1 D1 sr25519 spike (quarter plan §3).** This memo exists to be reviewed and either
accepted or amended; on acceptance it becomes CD-M4 in `MATRIX_V2.md` §7 and a
sibling entry in `mubEZ/docs/CRYPTO_DECISIONS.md`. Reviewer: the part-time
security reviewer named in the v2 plan. Nothing downstream of this decision
should be built until it is closed.

## 1. The question

When a PARA client logs in to Matrix, it presents an identity public key
`identity_pub_i` to `para-idp`, which asserts it upstream to MAS. The Matrix
localpart is `H(identity_pub_i)` (CD-M1). Public keys are, by construction,
public: `/api/chat-member-list` was handing them out until F8, and every room
member list exposes MXIDs derived from them.

**So presenting the key proves nothing.** Anyone who learns `identity_pub_i`
could claim the corresponding MXID. The client must prove it holds
`identity_priv_i`. There is currently no way for it to do so, because no
signature scheme over PARA identity keys exists anywhere in the codebase.

This is not a Matrix-specific gap. `mubEZ/docs/IDENTITY_DERIVATION.md` already
promises it in the registration contract — *"a signature over the registration
challenge with `identity_priv_i` (proof of possession)"* — and that promise is
also unimplemented. **One scheme should serve both.**

## 2. Why the two existing schemes do not answer it

| Existing scheme | Key | Why it cannot be reused |
|---|---|---|
| Governance vote signatures (`mubEZ/docs/community-governance-signatures.md`) | atproto DID key, Ed25519, verified against the DID document | Signing with the DID key **is** the linkage. It proves "the person behind `did:plc:…` wants this MXID" — precisely the relation v2 deletes. Unusable here at any strength. |
| Issuer credential signatures (CD-6) | server-held issuer key | Wrong direction entirely: the server attests to a claim; here the *client* must attest to key possession. |

ristretto255 identity keys also cannot borrow Ed25519 verification: ristretto255
is a prime-order quotient group over edwards25519, and a ristretto point is not
an Ed25519 public key. There is no conversion that lets `@noble/ed25519` verify
one.

## 3. Options

### Option 0 — sr25519 via `@scure/sr25519` (preferred, gated on a spike)

`sr25519` *is* Schnorr over ristretto255. `@scure/sr25519` implements it in
JavaScript, audited by Oak Security (Aug 2025), from the same author as
`@noble/curves` and `@scure/bip39` — both already in iM8's dependency tree. No
WASM, so Hermes is not a problem. It uses merlin transcripts for domain
separation and synthetic nonces, which independently arrives at both of the
divergences §5 argues for.

- **For:** removes the need for a cryptographic audit we have no one to perform.
  This is not a convenience — see the quarter plan §3: a hand-rolled scheme with
  no reviewer is a guarantee we cannot honestly make.
- **Against, and it is a real unknown:** sr25519 secret keys are
  `(scalar ‖ nonce)`, and the library's documented entry points
  (`secretFromSeed`, `fromKeypair`) generate or import keys rather than
  accepting a caller's scalar. **If `sign()` accepts a 64-byte secret with our
  `identity_priv_i` in the first 32 bytes**, then `identity_pub_i` is already
  the sr25519 public key and this option wins outright. If the library clamps,
  re-expands, or otherwise transforms the scalar, our public key would not match
  and the option dies.
- **Resolution:** one day, S1 D1. Read the source, not the README. Verify that
  `getPublicKey(ourScalar ‖ nonce)` equals `identity_pub_i` for the shared seed
  vectors. Option A below is the fallback.

### Option A — Monero's Schnorr, transposed to ristretto255

Sign directly with `identity_priv_i`, using the scheme Monero already uses for
proof of key ownership (`src/crypto/crypto.cpp`, `generate_signature` /
`check_signature`). See §4 for what that implementation actually does.

```
k = <nonce, see §5>
R = k · G
c = H_s(DOMAIN ‖ purpose ‖ P ‖ R ‖ m)     # key-prefixed: P is inside the hash
r = (k - c · x) mod l                      # Monero's sc_mulsub
signature = (c ‖ r)                        # 64 bytes
verify:  R' = c · P + r · G ;  accept iff H_s(DOMAIN ‖ purpose ‖ P ‖ R' ‖ m) == c
```

- **For:** no new key material and no binding to prove. It is the same scheme,
  in the same shape, as the derivation PARA already borrowed from Monero (CD-4),
  so a reviewer can read it against a battle-tested reference rather than
  against our imagination. `@noble/curves` supplies every primitive on Node and
  Hermes. 64 bytes. Satisfies the mubEZ registration contract unchanged.
- **Against:** we still own the implementation. Nonce reuse leaks the private
  key outright. Monero's own domain-separation history (§4) shows the sharp
  edge is not the algebra but what goes into the hash.

### Option B — Derive a separate Ed25519 signing key per identity

`sign_priv_i = HKDF(seed, "para-id/matrix-sign/v1", i)`, assert with a standard
EdDSA JWT.

- **For:** standard, boring crypto with vectors and JOSE support everywhere.
- **Against:** **it does not actually work.** The server now sees `sign_pub_i`
  but the MXID derives from `identity_pub_i`; nothing ties them together. Ways
  to tie them: (a) sign the binding with `identity_priv_i` — which is Option A
  plus an extra key; (b) have the server store the pair — a linkage table, the
  thing being removed; (c) derive the MXID from `sign_pub_i` instead — which
  forks PARA's identity from the mubEZ spec and breaks the registration
  contract. Every escape leads somewhere worse.

### Option C — Signal's poksho / zkgroup

Signal builds its private group system on **ristretto255** (curve25519-dalek),
using a generalised Schnorr protocol made non-interactive by Fiat–Shamir, with
HMAC-SHA256 "SHO" labelled hashing for domain separation. It is the closest
production system to PARA's threat model: proving things about a key without
revealing who holds it.

- **For as a reference:** it independently confirms that ristretto255 Schnorr is
  the right family for this problem, and its labelled-hash domain separation is
  the discipline §4 says Monero's plain signature lacks.
- **Against as a dependency:** `poksho`/`zkgroup` are Rust, with no JS or React
  Native binding, and they solve a strictly harder problem — zero-knowledge
  proofs of arbitrary linear statements. We need proof of one discrete log.
  Adopting it would mean a native module and a large surface for no gain.

**Verdict: read it, do not import it.** Signal validates the approach and sets
the bar for domain-separation rigour; Option 0 is how we actually get there.

*(An earlier revision of this memo claimed no audited JS ristretto255 signature
library existed. That was wrong — `@scure/sr25519` does, and it is now
Option 0.)*

### Option D — Blind signature / anonymous credential

Overkill. Nothing here requires the server to be blind to the key it is
authenticating; it requires the key not be relatable to a DID, which CD-M1
already achieves.

## 4. What Monero actually does

Checked against `monero-project/monero@master`, since PARA's derivation is
already Monero subaddress style (mubEZ CD-4) and the signature should come from
the same place rather than be invented alongside it.

**The derivation we already copied.** `get_subaddress_secret_key`
(`src/device/device_default.cpp`) hashes `"SubAddr" ‖ a ‖ u32_LE(major) ‖
u32_LE(minor)` to a scalar `m`, then the subaddress spend key is `D = B + m·G`.
PARA's `t_i = H_s("para-id/v1" ‖ LE32(view_priv) ‖ u32_LE(i))` with
`identity_pub_i = spend_pub + t_i·G` is that construction with one index instead
of two. CD-4's claim of lineage is accurate.

**The signature.** `generate_signature` (`src/crypto/crypto.cpp`) is Schnorr in
the CryptoNote encoding:

| Property | Monero | Bearing on OD-2 |
|---|---|---|
| Challenge input | `s_comm { prefix_hash, key, comm }` — hashed in that order | **Key-prefixed**: the public key is inside the hash. Adopt as-is. |
| Signature form | `(c, r)` — challenge and response, not `(R, s)` | Adopt. The verifier *recomputes* `R' = c·P + r·G` and never parses an attacker-supplied point. |
| Response | `sc_mulsub` → `r = k − c·x` | Adopt (note the sign: subtraction, not `k + c·x`). |
| Nonce | `random_scalar(k)` — **purely random** | **The one place we should diverge.** See §5. |
| Degenerate values | retries while `c == 0` or `r == 0` | Adopt. |
| Cleanup | `memwipe(&k, …)` after signing | Adopt in spirit; JS cannot guarantee it, so record the limitation. |

**The domain-separation lesson.** The plain `generate_signature` contains **no
domain separator at all** — `prefix_hash` is entirely the caller's
responsibility. Monero's newer `generate_tx_proof` does the opposite: it hashes
an explicit `sep` field derived from the config constant
`HASH_KEY_TXPROOF_V2`, alongside the points, and the `_V2` suffix is itself the
scar of a revision. Monero's convention throughout is a short ASCII constant
(`"SubAddr"`, `"view_tag"`) hashed as a prefix.

The lesson for us is direct: **a bare Schnorr primitive with a caller-supplied
message is a footgun**, because nothing stops one caller's signature being
replayed into another caller's verifier. PARA has exactly the two callers that
could collide — `matrix-login` and `mubez-registration`, both signing with the
same key. So the domain string and the purpose must be inside the scheme, not
left to whoever calls it.

## 5. Recommendation

**Option 0 if the spike passes; Option A if it does not.**

Prefer the audited library. The deciding factor is not elegance, it is that this
project has one engineer and no security reviewer (quarter plan §1): novel
crypto behind a public privacy claim is not something we can responsibly ship
unreviewed. `@scure/sr25519` converts that problem into a dependency choice.

If the spike fails, fall back to **Option A** in Monero's exact shape — `(c, r)`,
key-prefixed, `r = k − c·x`, with the degenerate-value retries — specified once
in mubEZ and consumed by both `para-idp` and mubEZ registration, **and budget an
external audit as a hard prerequisite to launch.**

The divergences below apply to Option A. Option 0 already handles both.

Two deliberate divergences from Monero, both of which the reviewer should
accept or reject explicitly:

**1. Synthetic nonces instead of `random_scalar`.** This is the only place I
would not copy Monero, and the reason is the platform, not the cryptography.
Monero signs inside a daemon or CLI wallet on a desktop OS with a vetted
CSPRNG. PARA signs inside React Native on Hermes, where the RNG provenance is
whatever the host and the polyfill chain provide — and nonce reuse in Schnorr
does not degrade security, it *publishes the private key*: two signatures
sharing `k` give `x = (r₁ − r₂) / (c₂ − c₁)`. Bitcoin's BIP-340 made exactly
this move for exactly this reason.

```
k = H_s("para-id/sig-nonce/v1" ‖ LE32(x) ‖ m ‖ random32)
```

A dead RNG cannot leak the key, because the deterministic half still varies with
the message. A repeated message cannot reuse `k`, because the random half still
varies. Failure of either input alone is survivable; Monero's construction
survives only the second.

**2. Domain separation and purpose inside the scheme, not the caller.** Monero's
plain signature leaves this to callers and its own proof code had to grow a
versioned `HASH_KEY_TXPROOF_V2` constant to fix the resulting confusability
(§4). We have two callers signing with one key, so `DOMAIN = "para-id/sig/v1"`
and an explicit `purpose` are hashed by the signing function itself. A
`matrix-login` signature must be structurally unable to verify as a
`mubez-registration` one.

Everything else — key prefixing, the `(c, r)` encoding, the subtraction, the
zero-value retries, wiping the nonce — is taken from Monero unchanged.

### Signed payload

Following the canonical-JSON convention already used for governance votes
(exact key order, `JSON.stringify`, no extra whitespace):

```json
{
  "type": "para.identity.pop.v1",
  "purpose": "matrix-login",
  "audience": "para-idp",
  "identityPub": "<64-hex>",
  "challenge": "<server-issued, single-use, base64url>",
  "signedAt": "2026-08-20T12:00:00.000Z"
}
```

`challenge` is issued and rotated server-side. mubEZ already has exactly this
mechanism in `src/services/issuanceChallenge.ts` (`ensureIssuanceChallenge`,
`rotateIssuanceChallenge`, `isValidIssuanceChallenge`, `timingSafeEqual`) —
reuse it rather than building a second one.

### Transport

The signature does **not** need to be a JWT. `para-idp` is a thin OIDC shim: it
verifies the payload itself at its own login step, then issues a normal OIDC ID
token to MAS with `sub` set to the CD-M1 localpart. MAS never sees ristretto
anything. This removes the only real argument for Option B.

## 6. Residual risks the reviewer must accept

1. **We own the implementation, even though we do not own the design.** The
   scheme is transposed from `generate_signature` in Monero, not invented, which
   is a materially smaller risk than "hand-rolled" — but the transposition is
   ours: Monero operates on ed25519 points via its own `ge_*`/`sc_*` ops, and we
   operate on ristretto255 via `@noble/curves`. Ristretto's canonical encoding
   removes a class of bugs Monero must handle manually (it rejects non-canonical
   and small-order encodings at decode time), so the transposition is in the
   safe direction — but it must still be reviewed as new code, with generated
   test vectors mirrored into iM8 exactly as the derivation vectors are today.
2. **`memwipe` has no JavaScript equivalent.** Monero wipes the nonce after
   signing. We cannot: `k` is a `bigint`, immutable and garbage-collected, and
   may persist in memory until collection. Typed-array scratch buffers can be
   zeroed, `bigint` intermediates cannot. This is a real, unfixable-in-JS gap
   and belongs in the threat model rather than being papered over.
3. **Hermes performance.** Two scalar multiplications per login on React Native.
   Expected fine at one signature per login; measure before Phase 2 exit.
4. **Vectors become a compatibility contract.** Changing the domain label, hash,
   or payload shape invalidates every signature and, through CD-M1, every
   account. Version it (`/v1`) and treat it as a wire format.
5. **The ballot identity must never sign.** `getMatrixIdentity` already refuses
   to return anything signable for `civic`; the signing API must inherit the
   same allowlist rather than taking a raw scalar, or the boundary is bypassable
   one layer down. This is the single most important review point.

## 7. Definition of done

- [ ] Spec section in `mubEZ/docs/` + `CD-7` in `mubEZ/docs/CRYPTO_DECISIONS.md`,
      and `CD-M4` in `MATRIX_V2.md` recording the Matrix-side consequence.
- [ ] Test vectors generated in mubEZ, mirrored into `iM8/src/services/__tests__/`.
- [ ] `signIdentityChallenge(seed, label, payload)` in iM8 — refusing the ballot
      identity by the same allowlist as `getMatrixIdentity`, never exposing the
      scalar to callers.
- [ ] Verifier in `para-idp`; the same verifier used by mubEZ registration.
- [ ] Boundary test extended: the ballot identity cannot produce a signature,
      asserted on the type of the refusal, not on message text.
- [ ] Replay test: a challenge is single-use, and a `matrix-login` signature is
      rejected for any other purpose.
