# Agent Memory State — Whitepaper

**A Verifiable, Private State Layer for Autonomous-Agent Memory**

**Everest An¹\*, XiaoHai¹, Luo¹, Eric¹**

¹ Awareness (https://awareness.market) — XiaoHai ([@XiaoHai67890](https://github.com/XiaoHai67890)), Luo ([@lucas1968](https://github.com/lucas1968)) · \* Correspondence: [@everest-an](https://github.com/everest-an)

- **Companion to:** ERC-8350 (Agent Memory State Registry), `erc/erc-8350.md`
- **Discussions-to:** https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098
- **Status:** ERC-8350 Draft — submitted upstream ([ethereum/ERCs#1910](https://github.com/ethereum/ERCs/pull/1910)), Sepolia deployment live
- **Reference release:** `1.0.0-alpha.1` (2026-07-14)
- **License:** CC0 (see `erc/LICENSE.md`)

> **Memory is the new state, but raw cognition should never be public calldata.**

---

## Abstract

This document motivates and explains **Agent Memory State v1**, a minimal protocol
for committing *authorized, ordered, private* state transitions of autonomous-agent
memory to Ethereum — **without ever placing raw memory in calldata**.

It is written as a **companion to the ERC** (`erc/erc-8350.md`):
the ERC is the normative specification (exact `MUST`/`MUST NOT`, hashes, and test
vectors); this whitepaper is the narrative — the *why*, the design rationale, and the
applications that can grow on top. It follows the arc of the original Ethereum
whitepaper (state transition systems → a new kind of state → protocol → applications →
concerns → conclusion) and closes with **Open Questions** for the Magicians thread.

The core idea in one line:

```
prevStateRoot + ExperienceDelta v1  →  transitionId  →  authorized commit  →  nextStateRoot
```

On-chain you only ever see 32-byte commitments and state roots. Raw cognition —
text, embeddings, preferences, policies, latent state, salts, keys, locators — stays
**off-chain, as a private witness**. Every conforming implementation (Solidity,
TypeScript, or an independent client) derives a **bit-for-bit identical**
`transitionId` for the same delta.

---

## 1. Introduction

### 1.1 Blockchains as state transition systems

From a technical standpoint, a blockchain ledger can be understood as a **state
transition system**: there is a *state* (who owns what) and a *state transition
function* that takes the current state and a transaction and produces the next state:

```
APPLY(S, TX) -> S'      (or ERROR, if the transaction is invalid)
```

Bitcoin's state is the set of unspent transaction outputs; Ethereum generalized this
to accounts and contract storage and made the transition function Turing-complete.
The power of the paradigm is not "record-keeping" — it is that **anyone can
independently replay history and verify the legitimacy of the current state without
trusting any single party**. The definition of "what the next valid state is" moved
from a central authority to a set of deterministic rules everyone can execute.

### 1.2 The new state: agent memory

The rise of large language models and autonomous agents introduces a class of state
that blockchains have never handled — **cognitive state**, or more plainly,
**memory**.

A valuable agent is not a stateless function. It remembers interactions and forms
preferences; it distills reusable skills and workflows from repeated tasks; it
accumulates domain knowledge into retrievable cards; it evolves its world model over
time. This memory *is* the agent's identity and its asset. An assistant that has
learned your habits over three years and a freshly initialized blank model are two
entirely different economic entities.

Memory, in other words, is an agent's on-chain balance: it determines what the agent
is worth, who can trust it, and to whom it can be sold. Yet today, agent memory lives
in isolated, unverifiable black boxes. You cannot **prove** to a third party that
your agent holds a given learning history unaltered; you cannot **carry** a memory to
another platform or **transfer** it to another party without leaking its contents; you
cannot **audit** when, by whom, and in what order it was written; and multiple
cooperating agents cannot reach trustless consensus on "the current state of shared
memory."

**Memory has become the most important state an agent has, yet there is no verifiable
memory-state layer for it — nothing that is to memory what the blockchain is to
finance.**

### 1.3 Thesis

The entire design turns on one sentence:

> **Memory is the new state, but raw cognition should never be public calldata.**

The first half is the opportunity: turn agent memory into a verifiable state machine
and you have the trust infrastructure for the whole agent economy. The second half is
the constraint: unlike a financial ledger, memory *content* is intensely private.
Publishing a person's preferences, a company's knowledge base, or an agent's policy
weights on-chain is a catastrophic privacy leak. Any viable scheme therefore **must
not put raw cognition into public transaction data**.

The elegance of the protocol is that it satisfies both at once: **what goes on-chain
is a cryptographic proof that a legitimate, ordered, authorized memory-state
transition occurred — not the memory itself.**

### 1.4 What a bare content hash fails to establish

Existing applications can already publish an opaque content hash. But a hash alone
does not establish:

1. **which state** it advances;
2. whether the transition is the **unique successor** of the current state;
3. **who controls** the namespace and who may authorize updates;
4. whether **all externally meaningful references** were signed; or
5. whether **independent implementations** derive the same transition identifier.

It is worth being precise about what is and is not new here, because the obvious reading
is the wrong one. **Committing a digest instead of the data is not novel.** It is
established practice across ERC-8004, ERC-7857, ERC-8257, ERC-8273, ERC-8299, and EAS.
The thesis in §1.3 states a constraint the design must satisfy — it is not the
contribution.

The unresolved part sits one level up: **nothing specifies how one commitment must
relate to the one before it.** Anchoring is solved; *sequencing* is not. A published
anchor does not establish that it is the unique successor of the previous state, that
nothing was skipped or silently rolled back, or that the reference it points at was
covered by the signature. Without those rules a memory history is a bag of hashes, not
a trajectory.

Agent Memory State v1 answers all five in a single, interoperable state machine — with
deterministic hashing, strict sequence and state-root validation, an explicit
controller/authorizer model, and a rule that *signatures must cover every field,
including the locator commitment*. Concretely, enforcing `sequence == current + 1`
together with `prevStateRoot == currentStateRoot` is what lets a third party detect an
operator quietly rolling a Space back and replaying forward, two contradictory histories
grown in parallel under one identity, a gap where transitions were dropped, or a relayer
substituting a locator the signature was supposed to cover. A flat anchor cannot
distinguish any of these from normal operation.

---

## 2. Design principles

Five principles constrain one another and together define what a *correct*
implementation is.

- **Privacy first — commit, never reveal.** The chain never sees plaintext of raw
  text, embeddings, preferences, policies, latent state, salts, keys, or locators —
  only *commitments* to them (typically salted or encrypted `keccak256` hashes). This
  is not an optional feature; an implementation that puts raw cognition in public
  calldata is, by definition, non-conforming.
- **Determinism — bit-for-bit across implementations.** The same `ExperienceDelta`
  must yield the same `transitionId` whether computed in Solidity, TypeScript, or any
  independent client. This is enforced by fixed type strings, fixed ABI encoding, and
  a set of golden vectors (`test-vectors/v1.json`).
- **Authorization is a cryptographic fact.** A space's write permission is bound to
  its *initial controller*: `spaceId` is derived from the controller address and a
  salt, so a namespace claim is cryptographically specific to whoever holds that key.
- **Signer-agnostic.** The writer may be an EOA (non-malleable ECDSA), a smart /
  multisig / abstract account (EIP-1271), or the controller calling directly (empty
  signature). The protocol serves everything from a personal wallet to a DAO.
- **Attack-resistant commitments.** Commitments to short or low-entropy content are
  brute-forceable, so they must be salted or encrypted. Real locators are kept as a
  private witness; only `locatorCommitment` is public.

---

## 3. The protocol: Agent Memory State v1

We follow the Ethereum whitepaper's narrative order — first the "account," then the
"transaction," then the "state transition function," then "authorization." The
mapping to concepts you already know:

| Ethereum | Agent Memory State | Meaning |
|---|---|---|
| Account | **MemorySpace** | Container of state and identity |
| Transaction | **ExperienceDelta** | Atomic operation that advances state |
| State root | **stateRoot** | Cryptographic digest of current state |
| Tx hash | **transitionId** | Unique identifier of one operation |
| nonce / ordering | **sequence** | Anti-replay, strict ordering |
| Signature (ECDSA / 1271) | **authorizer + EIP-712** | Who may advance state |

The crucial difference: an Ethereum transition writes *how much was transferred* into
public state; an Agent Memory State transition writes only the *proof that a legitimate
transition occurred* — **the content stays off-chain**.

### 3.1 MemorySpace — identity and container

A memory space is the container for one linear memory history, analogous to an
account. Its identity is not an arbitrarily assigned address but is deterministically
derived from an **initial controller** and a **salt**:

```text
MEMORY_SPACE_TYPE = "MemorySpace(address initialController,bytes32 salt)"

spaceId = keccak256(abi.encode(
  keccak256(bytes(MEMORY_SPACE_TYPE)),
  initialController,
  salt
))
```

The claim "I create this namespace" is thus cryptographically specific to
`initialController` — nobody without the corresponding key can forge a `spaceId`
pointing at that controller. The salt lets one controller create multiple unlinkable
spaces, and may remain private until registration.

Each space maintains a **head** — its latest `sequence` and current `stateRoot` — and
uses a **controller + authorizer** permission model with nonce rotation to revoke old
authority. The controller is the administrative / recovery boundary; the authorizer
approves transitions and may be a hot EOA, a multisig, a smart account, or a policy
contract. Rotation preserves the space's identity and history.

### 3.2 ExperienceDelta — the atomic operation

One evolution of memory — learning a new preference, distilling a new skill, revising
old knowledge — is abstracted as an **experience delta**. The normative struct has
exactly **seven** fields, no more and no less:

```solidity
struct ExperienceDelta {
    bytes32 spaceId;              // which memory space
    uint64  sequence;            // strictly increasing, begins at 1
    bytes32 prevStateRoot;       // state root before this transition (0 for the first)
    bytes32 deltaCommitment;     // commitment to *what changed* (non-zero)
    bytes32 provenanceCommitment;// commitment to *where it came from* (0 = absent)
    bytes32 profileId;           // interpretation profile (non-zero)
    bytes32 locatorCommitment;   // commitment to the off-chain locator (0 = absent)
}
```

The design is deliberately austere. The spec **explicitly excludes** author,
timestamp, raw URI, memory-type enum, previous-delta pointer, and separate
input/inference fields from the transition. Every extra field admitted into the hash
is one more surface for cross-implementation drift and one more channel for
information leakage. Seven fields is the minimal set that is *sufficient* to express a
meaningful, authorizable, auditable transition while *revealing* no cognitive content.

Three commitment fields carry the full weight of "privacy first": `deltaCommitment`
(what changed), `provenanceCommitment` (where it came from — the provenance /
trust-chain commitment), and `locatorCommitment` (where the real content lives — with
the true URI kept as a private witness).

### 3.3 The state transition function

Given a delta, the protocol advances state deterministically in two steps.

**Step 1 — compute the transitionId** using the fixed type string and ABI encoding:

```text
EXPERIENCE_DELTA_TYPE =
  "ExperienceDelta(bytes32 spaceId,uint64 sequence,bytes32 prevStateRoot,
   bytes32 deltaCommitment,bytes32 provenanceCommitment,bytes32 profileId,
   bytes32 locatorCommitment)"

transitionId = keccak256(abi.encode(
  keccak256(bytes(EXPERIENCE_DELTA_TYPE)),
  spaceId, sequence, prevStateRoot, deltaCommitment,
  provenanceCommitment, profileId, locatorCommitment
))
```

The `transitionId` is the global, unique fingerprint of this transition. Because the
type string and encoding are fully fixed, every conforming implementation computes the
same value — this is the "determinism" principle in practice. There is no alternate
JSON, JCS, CBOR, or application-specific transition ID.

**Step 2 — fold the next state root.** The next root is folded from the previous root
and this transition, forming an unforgeable hash chain:

```text
MEMORY_STATE_TYPE = "MemoryState(bytes32 prevStateRoot,bytes32 transitionId)"

nextStateRoot = keccak256(abi.encode(
  keccak256(bytes(MEMORY_STATE_TYPE)),
  prevStateRoot, transitionId
))
```

The entire memory history thus becomes an **append-only state accumulator**: every
`stateRoot` cryptographically commits to the complete sequence of transitions from
genesis. Tampering with any past transition invalidates every subsequent state root —
exactly as altering an old block invalidates all later blocks. Critically, **the
registry computes `nextStateRoot`; callers cannot supply it.**

### 3.4 Authorization and consensus

Computing a valid `nextStateRoot` is necessary but not sufficient. For the registry to
**accept** a transition, it must pass strict checks:

- the space exists;
- `deltaCommitment` and `profileId` are non-zero;
- `sequence == head.sequence + 1` (strict continuity — anti-replay, anti-reorder,
  anti-fork);
- `prevStateRoot == head.stateRoot`; and
- the authorizer approves.

Authorization uses **EIP-712** structured signatures over a domain fixed to:

```text
name              = "AgentMemoryState"
version           = "1"
chainId           = current chain ID
verifyingContract = registry address
```

The fixed domain binds a signature to a specific registry on a specific chain, closing
off cross-chain and cross-registry replay. Three signer types are supported: EOAs
(canonical, non-malleable ECDSA), smart / multisig accounts (EIP-1271
`isValidSignature`, `0x1626ba7e` magic value), and the controller calling directly
(empty signature accepted only when `msg.sender` *is* the required account).

The most important conformance rule: **signatures must cover all delta fields,
including `locatorCommitment`.** This is precisely what closes the "relay manipulation"
gap — a relayer cannot substitute the locator without invalidating the signature.

### 3.5 Baseline private commitments

Profiles may define stronger schemes (including zero-knowledge commitments), but a
conforming implementation should support this domain-separated baseline:

```text
DELTA_DOMAIN      = keccak256("AgentMemoryState.deltaCommitment.v1")
PROVENANCE_DOMAIN = keccak256("AgentMemoryState.provenanceCommitment.v1")
LOCATOR_DOMAIN    = keccak256("AgentMemoryState.locatorCommitment.v1")

deltaCommitment     = keccak256(abi.encode(DELTA_DOMAIN, profileId, deltaSalt, keccak256(payloadBytes)))
provenanceCommitment= keccak256(abi.encode(PROVENANCE_DOMAIN, provenanceSalt, keccak256(provenanceBytes)))
locatorCommitment   = keccak256(abi.encode(LOCATOR_DOMAIN, locatorSalt, keccak256(bytes(locator))))
```

Each salt is 32 bytes and should be sampled independently. For low-entropy plaintext
the salt **must** remain secret, or `payloadBytes` **must** be ciphertext from a fresh
high-entropy key and nonce — a public salt does not stop targeted dictionary attacks.

### 3.6 Conformance

To claim conformance with Agent Memory State v1, an implementation must: use the
*exact* type strings and ABI encoding; pass every golden vector in
`test-vectors/v1.json`; enforce the space, sequence, prior-root, and authorization
checks; sign all delta fields including `locatorCommitment`; support EIP-1271
authorizers; and **never** require raw cognition in public calldata. Conformance is an
objective, testable fact rather than a matter of interpretation — the repository ships
a reference Solidity registry, two independent off-chain engines, and cross-language
vectors so that interoperability can be verified mechanically.

---

## 4. Security considerations

A memory-state protocol carrying real economic value must draw its security boundary
honestly and precisely. This chapter states what the protocol protects, what it
trusts, and — crucially — **what it explicitly does not promise**.

### 4.1 The critical non-claim

Many schemes that advertise "on-chain memory" implicitly suggest that being on-chain
means "true, available, owned." That is dangerously misleading. Agent Memory State v1
is strict about this:

> **A valid transition proves only that a configured authority approved a particular
> committed state transition. It does not prove the truthfulness of the memory content,
> the availability of off-chain data, any ownership, or that a deletion occurred.**

The registry verifies exactly two things: **authorization** (was this write approved by
the current authorizer?) and **state-machine continuity** (do the sequence and prior
root line up?). It knows nothing about whether the content is true, still retrievable,
or morally owned — and does not pretend to. Stating the trust boundary clearly is
itself the single most important security property: it prevents downstream applications
from building on false guarantees.

### 4.2 Trust assumptions

> **The registry is trusted only to execute its published bytecode.**

Beyond that, the protocol grants **no implicit trust** to any other actor: storage
providers, relayers, indexers, and profile publishers are all outside the trusted
computing base. This minimal-trust stance is what lets the protocol's security be
argued independently and mechanically.

### 4.3 Threats, mitigations, and residual risk

| Threat | Mitigation | Residual risk |
|---|---|---|
| **Namespace hijacking** | `spaceId = keccak256(controller, salt)`; registration requires authorization | Controller key compromised before registration |
| **Unauthorized modification** | Registry only honors the configured authorizer | An overly permissive or compromised authorizer |
| **Relay manipulation** | Every delta field (incl. `locatorCommitment`) is signed | Relayer can still censor / delay (but not modify) |
| **Invalid prior state** | Exact `prevStateRoot` + `sequence` check | Linear model forbids concurrent branches |
| **Cross-chain replay** | EIP-712 `chainId` binding | Identical-parameter forks need an ops response |
| **Config replay** | Per-space `configNonce` rotation | Controller compromise → malicious update |
| **Locator exposure** | Only a salted commitment is public | Out-of-band witness disclosure |
| **Hash drift** | Golden vectors across Solidity / TS | New implementations may skip conformance |

### 4.4 The cryptography of private commitments

Hashing short or low-entropy memory directly is **brute-forceable** — "user prefers
dark mode" can be enumerated and matched. The protocol therefore requires 32-byte,
domain-separated salts, and for low-entropy payloads either a *secret* salt or
*encryption* with a random key and nonce. Salts, keys, plaintext, and real locators
form the **private witness**, which lives entirely off-chain; the registry never
touches the memory. This shifts a clear responsibility onto applications: **they bear
witness preservation and key recovery.** The protocol greatly reduces the leakage
surface but does not eliminate it — the *timing*, *frequency*, and *`profileId`* of
transitions remain visible on-chain and constitute side channels. Listing these
residual observables honestly is better than pretending to zero leakage.

### 4.5 Pre-deployment gates

Before any production deployment, the spec requires passing seven gates: EIP-712
signature validation, fuzzing of the sequence logic, cross-verification by an
independent implementation, review of the encryption profile, recovery-procedure
drills, testnet monitoring, and an external Solidity security audit. Security is not a
one-time declaration but a set of executable, re-checkable checkpoints.

---

## 5. Applications and future work

The core is intentionally tiny — it does only "authorization + state-machine
continuity." Real product value grows in the layered structure above it. That layering
is itself a deliberate architectural decision (ADR-0004).

### 5.1 Four-layer architecture: keeping the core auditable

Early prototypes **bundled** state primitives, memory frameworks, deletion, market
settlement, a "REC language," and assorted agent behaviors together — too coupled to
audit. The refactor split them into four tiers, each with an independent trust model:

```
┌──────────────────────────────────────────────────────────────────┐
│  Adapters      Awareness taxonomy, payload construction, real-memory glue │
├──────────────────────────────────────────────────────────────────┤
│  Experimental  Memory Market, REC / cognitive assets (vision)             │
├──────────────────────────────────────────────────────────────────┤
│  Extensions    DeletionAttestation, etc. (each states its own trust model)│
├──────────────────────────────────────────────────────────────────┤
│  Core          Authorization, delta hashing, state rules, sigs, events    │
│                                          ← the only normative protocol     │
└──────────────────────────────────────────────────────────────────┘
```

**Goal: the core is small enough for anyone to implement and audit independently;
product features evolve above it without touching the base protocol.** This is
Ethereum's "thin protocol, thick applications" philosophy applied to memory — just as
Ethereum leaves ERC-20, DeFi, and NFTs to the application layer, Agent Memory State
leaves markets, deletion, and cognitive assets outside the core.

### 5.2 Extensions: deletion attestations

The "right to be forgotten" is unavoidable for memory systems. Deletion is an
**extension**, not core — because on an append-only accumulator, "deletion" is a
semantic claim, not a physical fact. A deletion-attestation extension lets a space
publish an "I deleted memory X" commitment, but it **must publicly state its own trust
model**: the chain cannot prove off-chain data was truly erased; it can only prove that
an authority *attested* to deletion. Making that limit explicit avoids the misleading
promise of "on-chain deletion."

### 5.3 Experimental: the Memory Market

`MemoryMarket.sol` is the first economic-layer prototype above the protocol — a
**time-limited licensing marketplace for memory spaces**. It answers "how does memory
become a tradable asset?" without violating privacy-first: what is traded is a
*time-bounded license to access a specific committed memory state*, not the plaintext.

- **List (`list`)** — the space controller sets settlement token, price, license
  duration, and optional royalty (0–10,000 bps), and **captures the current state
  root** — anchoring the license to an exact committed configuration to prevent
  "stale-state sales" (a seller quietly advancing state so the buyer gets something
  other than what was displayed).
- **Purchase (`purchase`)** — reentrancy-guarded; validates that the listing is active
  *and the state root is unchanged*; splits payment between the royalty recipient and
  the seller; and extends license expiry **additively** (stacking, not resetting) — a
  renewing buyer accumulates time, as expected.
- **Views** — `hasLicense()`, `licenseExpiresAt()`, `getListing()` let third-party
  contracts query license state composably.

Worth stressing: the market settles in an **arbitrary ERC-20 token**. The protocol core
binds no native token; an ecosystem settlement / governance token (such as **AWAR**) is
a natural evolution of this economic layer, **not a prerequisite of the protocol**. This
preserves the "neutral core, optional economics" discipline.

### 5.4 Experimental: cognitive assets and REC (vision)

Beyond the market, the further vision is to capitalize memory itself into **cognitive
assets** and develop a **REC** vocabulary describing cognitive value and licensing
relationships. In honesty: as of `1.0.0-alpha.1`, REC and cognitive assets have **no
contract code** — the architecture record marks them explicitly as "product-level
evolution, not foundational protocol." Placing them in the experimental layer, cleanly
isolated from the auditable core, is exactly how the vision is kept from contaminating
the foundation.

### 5.5 Adapters: connecting to a real memory system (Awareness Adapter)

For the protocol to land, it must plug into a real, running memory system.
`@erc-awar/awareness-adapter` is that bridge — it converts **Awareness knowledge cards
and embeddings** into a **public `ExperienceDelta` plus a private witness.**

Card-type → profile mapping:

| Awareness card type | Default profile | Semantics |
|---|---|---|
| `decision` | **POLICY** | Constrains the agent's future behavior |
| `insight` / `solution` / `workflow` | **TEXT** | Human-readable knowledge |
| `memory` | **EPISODIC** | A recollection observed at a point in time |
| `task` | **EPISODIC** | A unit of work tracked over time |

The full profile vocabulary (`TEXT, EMBEDDING, LATENT, TOOL_TRACE, EPISODIC, POLICY,
SHARED_WORKING, PROOF`) is owned by the adapter — **not protocol enums** — so it can
evolve freely to serve retrieval indices, collaboration systems, execution traces, and
proofs.

The bridge flow (`bridge.ts`): `ingest(card)` reads the card, validates its type, and
resolves a profile; `buildContent()` shapes the payload per profile (TEXT →
`{text, title?, cardKind, tags?}`; POLICY → `{rule, scope:"agent", cardKind}`; EPISODIC
→ `{event, occurredAt, cardKind, subject?}`); it calls the reference state machine
`machine.commit({...})`; and it wraps the returned record, splitting `exportDeltas()`
(public deltas for on-chain submission) from `export()` (cached transitions with their
witnesses).

**Architectural honesty:** the adapter is deliberately thin — it does **not** generate
salts or construct commitments itself. Salts are *supplied to* it, and all
cryptographic commitment construction is **delegated to the underlying
`MemoryStateMachine`** (the reference engine). The memory op is modeled generically as
`{ op:"upsert", resourceId, observedAt, content }`. So a "real memory system" (e.g. the
Awareness card store) integrates by mapping its records into cards and providing salts
and locators; the adapter cleanly separates the **public `delta`** (safe for calldata)
from the **private `witness`** (locators + salts, kept off-chain).

### 5.6 Migration

Migrating from a v0 prototype means **creating a new v1 space** with a private
migration payload documenting the v0 export, identifiers, tooling, and audit; the
original chain is left unchanged. v0's JCS identifiers, unsigned URIs, and fixed enums
are explicitly **not** wire-compatible with v1 — a clean break beats a false-compatible
one carrying historical baggage.

### 5.7 Relationship to existing agent standards

Agent-related ERCs are numerous as of mid-2026, and several touch memory. Stating the
boundary plainly matters more than claiming novelty:

| Proposal | What it covers | What is still missing |
|---|---|---|
| **ERC-8004** Trustless Agents | Identity / Reputation / Validation registries | Explicitly does not cover memory, persistent state, or cognition |
| **ERC-8181** Self-Sovereign Agent NFTs | A State Anchor over off-chain cognitive state | The anchor is flat — no `prevStateRoot`, no `sequence`, no unique-successor rule, and `contentUri` is an unsigned argument a relayer can swap |
| **ERC-8264** AI Agent Memory Access Rights | Data-subject rights over memory records (read / write / delete / export), GDPR framing | Rights *over records*, not the verifiable evolution of state *between* them |
| **ERC-8269** Body Lease / Capsule | Packaging: a Merkle root over payload hashes within one capsule | Integrity *within* a capsule, not a chain of transitions *across time* |
| **ERC-7857** (Final) AI Agents NFT with Private Metadata | Ownership transfer with sealed keys and access proofs | The *moment* of transfer, not the *process* of state evolution |

A reasonable question is whether the [Ethereum Attestation Service](https://attest.org)
already covers this: it offers `refUID` linking, Private Data Attestations with Merkle
multiproofs for selective disclosure, and resolvers for arbitrary validation. What it
does not offer is **successor uniqueness** — in `EAS.sol` the only check applied to
`refUID` is that the referenced attestation exists, so several attestations may
reference the same one and the protocol layer permits forking. There is no sequence
number, no prior-state binding, and no per-namespace controller/authorizer model. These
semantics *can* be built with an EAS schema plus a custom resolver, but that yields a
per-application implementation rather than an interoperable standard.

The intent throughout is that this protocol can be referenced by any of the proposals
above without any of them taking a dependency on it.

---

### 5.8 External verdict composition (attestation refs)

Settled jointly with WYRIWE (ERC-8299) on the Magicians threads and recorded as an
informative note in `docs/interop/attestation-refs.md`: a signed external verdict lives
**inside the committed payload**, carried by `provenanceBytes` under
`provenanceCommitment`. Because that commitment sits inside the signed delta, the
verdict is **causal input the authorizer approved** — not an annotation glued on after
the fact — and the seven-field struct stays frozen; no reference ever becomes an eighth
field.

References form an unordered set: JCS-canonical, sorted by `decision_ref`, deduplicated
by `(event_id, pubkey)`. The `verify_url` endpoint is advisory only and excluded from
every hash — verification needs only the verifier's public key, never a call back to
anyone. An external conformance checker for these rules is being built in
`babyblueviper1/preaction-governance-conformance`, with fixtures drawn from the live
Sepolia registry rather than synthetic data.

One composition non-claim, stated before anyone inflates it: verdict + committed
transition does **not** equal verified memory. Neither specification claims that.

## 6. Miscellanea and concerns

- **Linear model vs concurrent branches.** Strict linear advancement
  (`sequence == head + 1`, `prevStateRoot == head.stateRoot`) buys strong anti-replay,
  anti-reorder, and anti-fork guarantees at the cost of no concurrent write branches
  within a single space. Concurrent collaboration is served by multiple spaces plus
  off-chain merge — not by pushing fork semantics into the core. A conscious trade of
  flexibility for auditability.
- **Gas and scalability.** Each transition writes only a handful of `bytes32` values —
  fixed-width, tiny, and fully decoupled from the size of the memory content. Whether an
  update corresponds to one sentence or an entire vector store, the on-chain footprint
  is constant. This makes gas cost predictable and fits L2s and rollups naturally: real
  data always stays off-chain, and only a constant-size proof is carried on-chain.
- **Off-chain availability is the application's responsibility.** The protocol does not
  guarantee data is retrievable. `locatorCommitment` commits to *what* the locator is,
  not that the content it points at still exists. Availability, backup, witness
  preservation, and key recovery are all application responsibilities — an honest
  boundary, not a defect.
- **Profiles, not enums.** The core freezes no memory taxonomy. `profileId` is an
  application-defined interpretation profile whose vocabulary is owned by the adapter
  layer — just as Ethereum did not write "token" into the protocol but left it to
  ERC-20.
- **Road to a formal ERC.** Current status is a pre-ERC community draft. The path to a
  numbered `ethereum/ERCs` entry runs through an Ethereum Magicians issue thread,
  wiring the discussion URL into the ERC metadata, confirming authors and an EIP
  champion, inviting cryptography and agent researchers to review, securing an
  independent second implementation that passes the golden vectors, completing an
  external audit and testnet validation, and finally submitting a PR. Standardization
  is a public, multi-party process — not a unilateral declaration.

---

## 7. Conclusion

Bitcoin gave *value* a trustless state; Ethereum gave *any computable state* a
trustless transition. As the subject of computation becomes autonomous agents that
remember, learn, and accumulate, a new and most-important kind of state emerges —
**memory**.

Agent Memory State v1 gives that state what it needs: a **deterministic, privacy-first,
strictly authorized, cross-implementation-interoperable** state machine. Its whole
insight is one restrained choice — **commit the proof of a memory-state transition, not
the memory itself.** A seven-field experience delta, a bit-for-bit `transitionId`, an
append-only state accumulator, and an honestly drawn trust boundary together form a
foundation that can be independently audited, freely extended, and relied upon by real
economic value.

On that foundation, memory can — for the first time — become a verifiable, portable,
tradable asset without losing its privacy: deletion can be proven *as attested*, access
can be *time-licensed*, and cognition can be *capitalized into assets*. The core stays
neutral and small; products bloom above it.

> **Memory is the new state. Awareness makes that state, for the first time, both
> verifiable and private.**

This is the starting point for the trust layer of the agent economy.

---

## 8. Open questions / request for feedback

Feedback is invited on the Ethereum Magicians thread. Specific questions we would most
like the community's input on:

1. **Linearity.** This protocol enforces a strictly linear per-space history, and we
   believe that is the right base primitive: it is precisely what makes "no gap, no
   silent rollback, no contradictory parallel history" checkable by a third party.
   Concurrency belongs in multiple spaces plus off-chain merge. Is there a concrete
   agent workload where that is the wrong call?
2. **Baseline commitment scheme.** Is the domain-separated keccak baseline
   (§3.5) an acceptable normative floor, with ZK/stronger schemes as opt-in profiles?
   Should the ERC mandate encryption for any low-entropy payload rather than merely a
   secret salt?
3. **EIP-1271 / EIP-7702 edge cases.** Is "try ERC-1271, then fall back to canonical
   ECDSA" the right ordering? It lets a delegate policy apply where one exists, but
   since delegation does not revoke the key, the ECDSA path always remains. Should a
   registry be allowed to disable that fallback per space? And are there authorizer
   behaviors (reverts, malformed returns, `STATICCALL` gas griefing) the spec should
   call out more forcefully?
4. **`profileId` governance.** Should there be *any* registry-level convention for
   profile identifiers, or is keeping them entirely application-defined the correct
   long-term stance? Note that an unsalted `profileId` drawn from a published
   vocabulary is effectively public — ADR-0005 now documents it as such.
5. **Deletion semantics.** Is "attestation with a stated scope" the right framing for a
   deletion extension, and should the core reference it normatively or stay silent?
6. **Discoverability layering.** A space is deliberately opaque, which also makes it
   undiscoverable — including to a would-be licensee. Should minimal descriptive
   metadata live in an optional extension (the approach taken in ADR-0005), or does the
   core need a hook? Note the tension: `profileId` is simultaneously the one deliberate
   privacy leak and the one available discovery handle.
7. **Naming.** Is "Agent Memory State" the right title for the ERC, or should it lead
   with "Commitments" / "Registry" to set expectations about the non-claim (§4.1)?

---

## Appendix A: Canonical constants and golden vectors

**Type strings**

```text
ExperienceDelta(bytes32 spaceId,uint64 sequence,bytes32 prevStateRoot,bytes32 deltaCommitment,bytes32 provenanceCommitment,bytes32 profileId,bytes32 locatorCommitment)
MemoryState(bytes32 prevStateRoot,bytes32 transitionId)
MemorySpace(address initialController,bytes32 salt)
SpaceAuthorization(bytes32 spaceId,address newController,address newAuthorizer,uint64 nonce)
```

**Golden typehashes (canonical v1 vector)**

```text
ExperienceDelta typehash:
  0x4f020f86bc06d852f1fde17853b4d92a70214eeab8e09718028124af097d070d
MemoryState typehash:
  0xf3148762556cbf851baf4b9a205e18ff4e6b366a58a3a1ef58e8626ba41beadb
MemorySpace typehash:
  0x9ae5478f084ad3b841da58a9cb2354d153cddec59ee64d0cb741fa9d08884531
```

**Golden derived values**

```text
transitionId:
  0xdd00dd6eb3aec704b5455502647a0caacf23be6c724eda4a60d9645291e7f4e5
nextStateRoot:
  0x9684a8d3571c5cd9c1e3abb1b0c0797b9fef6965e9002aeefba91e8cb1163754
```

**EIP-712 domain**

```text
name              = "AgentMemoryState"
version           = "1"
chainId           = <current chain id>
verifyingContract = <registry address>
```

## Appendix B: Verification

```bash
# One-shot: install + full check
pnpm install --frozen-lockfile && pnpm check

# Run separately
pnpm test:ts
cd contracts && forge fmt --check && forge test
```

Any implementation must reproduce the three typehashes and every transition ID
bit-for-bit against the cross-language `test-vectors/v1.json`.

## Appendix C: Version and license

- **Protocol version:** Agent Memory State **v1**
- **Reference release:** `1.0.0-alpha.1` (2026-07-14)
- **Status:** ERC-8350 Draft — submitted upstream ([ethereum/ERCs#1910](https://github.com/ethereum/ERCs/pull/1910)), Sepolia deployment live
- **Normative spec:** `erc/erc-8350.md`
- **Reference implementation:** Solidity registry, two independent off-chain engines,
  Awareness adapter
- **Repository:** `AwareLiquid/ERC-8350`
- **Copyright:** waived via [CC0](../erc/LICENSE.md)

---

*This whitepaper is a community draft. Some features described (Memory Market,
cognitive assets, REC) are experimental or aspirational and constitute neither
investment advice nor a commitment to future functionality. The protocol core's
security boundary is governed by the non-claim in §4.1.*
