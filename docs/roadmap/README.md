# ERC-8350 Roadmap

Status labels are strict, in the same discipline as the rest of this repository:
**Deployed** (live, verifiable), **Specified** (normative text or ADR exists, no code),
**Direction** (design intent; no spec, no code). Nothing here is a commitment to ship —
items graduate only by moving up a label.

- Discussion: https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098
- Upstream: https://github.com/ethereum/ERCs/pull/1910

## Now — Deployed

| Item | Where |
|---|---|
| Core registry: linear, authorized, private state transitions | Sepolia `0xDdf21937ba80b5fF973610877A0955b320C91241`, reproduces `test-vectors/v1.json` byte-for-byte |
| Behavioral recording as commitments — actions enter `deltaCommitment` payloads (`TOOL_TRACE` / `EPISODIC` profiles), ordering pinned by `sequence` | Core + adapter vocabulary |
| Selective, provably-complete audit disclosure — `AuditGrant` binds a `[from,to]` range to one `witnessSetRoot`; withholding or substituting any witness changes the root | Sepolia `0x20145Ab83958CFB321221e8a8C68181C818241B2` |
| **First production adopter** — Awareness (awareness.market) anchors real knowledge-card state from its local daemon: pull-based snapshot diff → outbox → CLI-signed broadcast, witnesses never leaving the user machine | Live on Sepolia 2026-07-28: Space `0xfdd18b37…`, tx `0x98f1cf76…`, head verified byte-for-byte against local precomputation by three independent paths |
| Opt-in space description | `SpaceDescriptor`, Sepolia `0x7745e2dDC30e75E1D7B7fBAf4616Fc0F54e571F5` |
| Deletion attestation (commitment-only calldata) | Sepolia `0x97cc9b019A089bf7b821d47134020896f9259cc0` |

## Near term — standards track

| Item | Status |
|---|---|
| ERC editor review → Draft merge | Waiting (all CI green) |
| Etherscan source verification of the Sepolia instance | **Done** (2026-07-31) — all four contracts source-verified, `docs/deployment.md` |
| Independent second implementation passing the golden vectors | **Open call, partially answered** — a full independent registry implementation is still wanted. Two external recomputations now exist: `babyblueviper1/preaction-governance-conformance` checks the live fixture against the interop rules, and [`invinoveritas/examples/erc8274-erc8350-composition`](https://github.com/babyblueviper1/invinoveritas/tree/main/examples/erc8274-erc8350-composition) derives `transitionId` / `provenanceCommitment` / `nextStateRoot` from the published formulas alone — re-verified against `@erc-awar/core` on this side, every value matching. Everything needed is still `test-vectors/v1.json` |
| External Solidity audit | Before any non-test deployment |
| `attestation_ref` interop with external verdict schemes (WYRIWE et al.) | **Specified** — see `docs/interop/attestation-refs.md` (joint note with WYRIWE): unordered set under `provenanceCommitment`, JCS-canonical, sorted by `decision_ref`, deduped by `(event_id, pubkey)`, `verify_url` advisory-only; never an eighth struct field. **Fixture Space live on Sepolia** (spaceId `0xfbe2…3564`, 5 witnessed transitions — seq 5 is an externally contributed attestation signed by a live operator key, exercising the three-valued authority outcome on real data; `docs/interop/fixture-space.md`) |

## Mid term — ZK profiles (Direction)

The profile mechanism is the deliberate upgrade slot: stronger commitment schemes plug in
as new `profileId` values with **zero core changes**. The two proofs worth building
first, because they upgrade "provable trajectory" toward "provable properties of private
content" without disclosure:

1. **Evolution-bound proof** — prove the newly committed embedding lies within distance
   ε of the previously committed one. Detects wholesale memory substitution while
   revealing neither vector.
2. **Membership proof** — prove the committed vector store contains an entry matching a
   given commitment, without revealing the store.

Boundary that does not move: **raw vectors never go on chain** — a 768-dim embedding is
roughly 3 KB ≈ 2M gas and a privacy breach besides. The chain manages the verifiable
history of latent state, never the latent state itself.

## Long term — Direction

- L2 / rollup deployments (constant per-transition footprint makes this natural)
- Memory market maturation: descriptor-based discoverability plus a delivery mechanism
  tied to `AuditGrant`-style completeness, replacing today's pay-for-a-boolean prototype
- Multi-agent collective spaces: patterns for `SHARED_WORKING` profiles behind
  ERC-1271 policy authorizers, and off-chain merge conventions across Spaces

## Non-goals (permanent)

Raw memory in calldata; public behavioral metadata; on-chain vector storage; claiming
truthfulness, availability, ownership, or physical deletion (§ Security Considerations,
"Explicit non-claim").
