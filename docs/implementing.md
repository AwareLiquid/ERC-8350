# Writing an independent ERC-8350 implementation

This page exists because the roadmap's most-wanted contribution — a complete
implementation nobody here wrote — was, until recently, an ask without an artifact
behind it. The vectors that would let someone prove they had done it did not cover the
state machine, and no page said what "done" meant. This is that page.

It is written for someone who has not read the rest of this repository and does not
intend to.

## What conformance means here

Narrowly: **your implementation derives the same values from the same inputs, and
refuses the same inputs, as the specification requires.** It does not mean your system
is secure, that your storage is sound, or that this ERC is final. Those are separate
claims and this page does not help you make them.

Two things follow from that narrowness, and both are load-bearing:

- Conformance is **decidable**. You run a file; it exits zero or it does not.
- Conformance is **not** agreement with our code. If your implementation disagrees with
  `packages/core` but matches the published vectors, the vectors are what count. If it
  matches our code and not the vectors, one of the two is wrong and we would like to
  know which.

## The bar

[`test-vectors/v2.json`](../test-vectors/v2.json). Passing it means:

1. Recomputing each of the 5 chain entries' `transitionId` and `nextStateRoot`, in
   order, feeding each `nextStateRoot` into the next entry's `prevStateRoot`.
2. Rebuilding each entry's three commitments from the disclosed witnesses.
3. Refusing each of the 12 rejection inputs with the stated error.

The chain is arranged so that it **fails closed**: each delta is only computable from
the previous entry's `nextStateRoot`, so an implementation with broken linkage cannot
produce entry N+1 even when entry N is perfect. You cannot pass by getting the
arithmetic right and the state machine wrong.

Two reference runners exist, and either can be read as a template rather than a
dependency:

| runner | what it drives | read it for |
|---|---|---|
| [`scripts/check-vectors.mjs`](../scripts/check-vectors.mjs) | the TypeScript reference | the order of operations, in ~100 lines |
| [`contracts/test/unit/VectorsV2.t.sol`](../contracts/test/unit/VectorsV2.t.sol) | the Solidity registry | how the rejections are exercised against real state |

Both read the published file rather than regenerated constants, deliberately: a suite
built from its own generator's output proves only that the generator agrees with itself.

`test-vectors/v1.json` remains valid and is a smaller starting point — four EIP-712
constants and one genesis delta. It is a useful first hour and it is not the bar. Most
external work so far stopped there, which is a fair reading of what we had published.

## The surface you have to implement

Smaller than it looks. Every derived value is a `keccak256` over ABI-encoded 32-byte
words; there is no Merkle tree, no signature scheme of our own, and no serialization
format to get wrong beyond that.

**Identifiers and state**

- `spaceId` — derived from the initial controller and a salt. A Space id is a commitment
  to who created it, not a name anyone may claim; a registry MUST reject a `spaceId`
  that does not re-derive.
- `transitionId` — the EIP-712 `hashStruct` of the seven-field `ExperienceDelta`.
- `nextStateRoot` — a hash of `(prevStateRoot, transitionId)`. This is the whole state
  machine; there is no accumulator.

`transitionId` and `nextStateRoot` are **domain-free**. They contain no chain id and no
registry address, which is why the same vectors replay against any registry on any
chain, and why replay protection has to live at the signature layer instead — see
below. If your implementation folds a chain id into either value, it will diverge from
every published vector, and the divergence is the specification disagreeing with you.

**Commitments** — three, each domain-separated so a value committed for one purpose
cannot be replayed as another:

- `deltaCommitment` binds the payload, a salt, **and the `profileId`**.
- `provenanceCommitment` binds provenance bytes and a salt.
- `locatorCommitment` binds a locator string and a salt.

Absent optional commitments are the zero word, not an omitted field. `deltaCommitment`
and `profileId` are mandatory and MUST be rejected when zero.

**Authorization** — three paths, and the reason there are three is EIP-7702:

1. direct call (`msg.sender` is the authorizer, empty signature);
2. ERC-1271, tried first for any account with code;
3. 65-byte ECDSA, as the fallback.

The ordering matters and is normative. A 7702-delegated EOA carries `0xef0100 || delegate`
code, so branching on "has code ⇒ must be ERC-1271" locks those accounts out entirely.
Try ERC-1271, fall back to ECDSA.

Signature digests **are** domain-bound: the EIP-712 domain pins the chain id and the
registry address. Anything you sign is bound to one registry on one chain even though
the identifiers are not.

The exact type strings, domain values, typehashes and the derived `signingDigest` for
every chain entry are all fields of `test-vectors/v2.json`. **They are deliberately not
restated here.** A constant copied into prose is a value no check consumes — see
[§6.3](interop/attestation-refs.md#63-the-value-no-check-consumes) — and this page would
be the second place to go stale. Read them out of the file your test suite already
loads.

## What you do not have to implement

- **Payload semantics.** A registry never interprets `profileId` and never sees a
  payload. Whatever your application means by a memory is outside this interface.
- **Storage, encryption, key custody, availability.** The chain holds commitments; where
  the bytes live and who can decrypt them is yours.
- **The extensions.** `AuditGrant`, `SpaceDescriptor`, `DeletionAttestation` are opt-in
  and not part of the core surface.
- **`MemoryMarket`.** Experimental, different trust model, excluded from the audit scope.

## Error semantics

The 12 rejection cases each publish an error signature, its selector, and — for the
inputs that are invalid in more than one way — **which checks run before it**. That
ordering is part of the vectors on purpose: without it, two correct-looking
implementations return different errors for the same input and neither is wrong.

One case is documented as having no vector: `TransitionAlreadyExists` is unreachable
through `commitTransition`, because `sequence` and `prevStateRoot` are validated first
and a duplicate id would require a head that has not advanced. You are not required to
produce that error. You are required not to let a duplicate overwrite a stored
transition. We could not construct a vector for it, and saying so seemed better than
letting you hunt for one.

## If you get a mismatch

Tell us, with the two values. A mismatch is one of three things and all three are
worth a report:

1. your bug — the common case, and the vectors are designed to localize it;
2. our bug — has happened, in exactly this way, more than once;
3. the specification is ambiguous enough that two careful readers diverge — which is the
   most valuable finding of the three, and the one a second implementation exists to
   surface.

Open an issue, or bring it to the
[Ethereum Magicians thread](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098).

## Reporting a passing implementation

If you want it recorded as external evidence, the criteria are already written down and
are stricter than "it passes on my machine" —
[`docs/interop/external-reproduction.md`](interop/external-reproduction.md): hosted
outside this GitHub namespace, a pinned commit and per-file digests, pinned dependency
versions, no imports from this repository, a nonzero exit on mismatch, and runnable from
a clean checkout. Those constraints exist so the evidence stays checkable by someone who
trusts neither of us.
