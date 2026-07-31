# The Public Fixture Space (Sepolia)

A live, deliberately-public Memory Space whose complete witnesses are published, so
that external conformance tooling — starting with
`babyblueviper1/preaction-governance-conformance` — can check a **real ERC-8350
deployment** against the rules in [`attestation-refs.md`](./attestation-refs.md)
instead of synthetic in-memory data.

> **Read this first.** Everything about this Space inverts production discipline on
> purpose: salts are deterministic and public, witnesses are published, the synthetic
> verifier keys derive from public seeds and carry **zero authority** (anyone can sign
> with them). A valid signature from these keys means nothing outside this fixture.
> Real deployments keep witnesses private, salts secret and random, and verifier keys
> custodied.

## Coordinates

| | |
|---|---|
| Network | Sepolia (chainId 11155111) |
| Registry | `0xDdf21937ba80b5fF973610877A0955b320C91241` |
| Space id | `0xfbe20b841e2cb8d5e8094da6a9be9ebe19bb4d52c6155f465b40aa7bf1c13564` |
| Controller = authorizer | `0x3d0ab53241A2913D7939ae02f7083169fE7b823B` (direct-call auth path, empty signature) |
| Space salt | `keccak256("erc-8337-fixture-space-v1")` — historical preimage from before the editor assigned ERC-8350; an opaque constant of the live Space, do **not** rename |
| Head | sequence `5`, state root `0x55b383709c4dbe8ee08d3e229d4f14d0c65659eac4198a44f1810f517dce6699`, transition `0xbabfa1db25980fe00dfa1c3fc08665ecb81df997f6fd7c439f1c4cc56241ac7d` (appended 2026-07-31, tx [`0x98d4ecc9…`](https://sepolia.etherscan.io/tx/0x98d4ecc95ff0380453f9afb6085a820fd9745fd2ed63302e68ce6c707abdfa2f)) |
| Verifier key policy (zero authority) | [`test-vectors/fixture-keys-v1.json`](../../test-vectors/fixture-keys-v1.json) |
| Witness bundle | [`test-vectors/sepolia-fixture-v1.json`](../../test-vectors/sepolia-fixture-v1.json) |
| Builder (fully reproduces the bundle) | `scripts/fixture/build-fixture-witness.mjs` |
| On-chain committer (self-verifying) | `contracts/script/FixtureSpace.s.sol` (seq 1–4, also registers the Space), `contracts/script/FixtureAppend.s.sol` (seq 5; append-only, refuses to run unless the live head is where the builder assumed) |

## What each transition exercises

| Seq | Profile | Provenance | Locator | Checker path it exists for |
|---|---|---|---|---|
| 1 | EPISODIC | **absent** (`provenanceCommitment = 0`) | absent | The absent case: zero commitment means "no provenance", nothing to parse |
| 2 | TEXT | 1 reference (verifier A) | absent | Minimal single-ref set |
| 3 | TOOL_TRACE | raw input `[r3, r2, r2]` → canonical `[…]` **sorted by `decision_ref`, duplicate dropped** | absent | §3 core rules: JCS canonical form, bytewise sort, dedupe by `(event_id, pubkey)` |
| 4 | EPISODIC | 1 reference (verifier B) | **present** | Provenance and locator coexisting; locator witness disclosed |
| 5 | EPISODIC | 1 reference — **externally contributed, signed by a live operator key** | absent | §6 three-valued authority, on real data: the key is a live WYRIWE/invinoveritas key, deliberately **not** in `fixture-keys-v1.json`. The same committed bytes resolve to *structurally valid, zero authority* under this fixture's published policy and to *valid and authorized* under a policy that trusts that operator. Contributed via [PR #5](https://github.com/AwareLiquid/ERC-8350/pull/5); the raw signed event ships in `test-vectors/attestation-refs/sequence-5-pending.json`, so the entry is verifiable offline from this repository alone, with no relay dependency |

The witness bundle publishes, per transition: the JCS payload, every salt, the exact
`provenanceBytes` (UTF-8), the canonical reference set **and the raw pre-canonical
input** (so the sort/dedupe transformation itself is checkable), the locator, and the
expected `transitionId` / `nextStateRoot`.

## The full verification path a checker can walk

1. **On chain:** read `head(spaceId)` and the four `TransitionCommitted` events from
   the registry above; confirm sequence continuity and state-root folding.
2. **Commitments:** recompute `deltaCommitment` / `provenanceCommitment` /
   `locatorCommitment` from the published witnesses via the baseline scheme; match
   against the event fields byte-for-byte.
3. **§3 rules:** parse `provenanceBytes` → `{"attestation_refs":[…]}`; assert JCS
   canonical form, ascending `decision_ref` order, no `(event_id, pubkey)` duplicates,
   and that no entry contains `verify_url`.
4. **References:** for each entry, recompute the NIP-01 `event_id` from the published
   kind-30078 event, verify the BIP-340 signature against `pubkey`, and recompute
   `decision_ref = sha256(JCS(verdict))` from the published six-field verdict.
5. **Advisory split:** confirm `verify_url` reaches the checker only through the
   bundle's `advisory_verify_urls` map — never through anything hashed.

A checker that passes 1–5 has exercised every rule in the interop note against a live
deployment.

## provenanceBytes envelope (pinned for this fixture)

```text
provenanceBytes = UTF-8( JCS( { "attestation_refs": [ canonical entries ] } ) )
canonical entry = { "scheme", "decision_ref", "event_id", "pubkey" }   // no verify_url
```

## Reproducing everything from scratch

```bash
pnpm install --frozen-lockfile && pnpm --filter @erc-awar/core build
node scripts/fixture/build-fixture-witness.mjs   # regenerates bundle + FixtureData.sol
```

The builder self-checks before writing: golden-typehash assertion, BIP-340
round-trip verification of all four events, and sort/dedupe assertions on the
canonical sets. `FixtureSpace.s.sol` then asserts every registry-returned
`transitionId` and `nextStateRoot` against the builder's output — a successful
broadcast *is* the cross-implementation check.

## Phase 2 (open invitation)

These references are synthetic by construction. The natural next step is one more
transition whose reference set carries **real WYRIWE L4 verdicts** issued by their
live signer — making the fixture genuinely cross-system. The Space stays open for
exactly that.
