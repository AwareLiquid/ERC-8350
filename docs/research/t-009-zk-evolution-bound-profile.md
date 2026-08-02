# T-009: First ZK Profile Research - Bounded Embedding Evolution

- Status: Research note, not a specification
- Scope: Proof questions and security boundaries only
- Implementation: None
- Candidate working name: `EMBEDDING_EVOLUTION_BOUND_V0`

This note records the first candidate ZK profile for ERC-8350. It does not assign
a final `profileId`, select a proof system, define a circuit or ABI, add a verifier,
or change the Registry. The working name is deliberately not a compatibility claim.

The candidate is an **evolution-bound proof**: show that two privately committed
embedding states are close under a precisely defined distance rule. It is narrower
than membership, inference, provenance, or semantic-correctness proofs and therefore
provides the smallest useful first research target.

## Scenario boundary

The first profile assumes a dedicated embedding-state Memory Space:

- every transition after genesis commits to one complete post-transition embedding;
- the compared records are consecutive accepted transitions in the same Space;
- both records use the same profile descriptor; and
- the prover possesses valid openings for both commitments.

This restriction avoids inventing an eighth `ExperienceDelta` field for a previous
embedding reference. Mixed-profile Spaces, multiple vectors per transition, and a
vector store are outside this first statement.

## Candidate proof statement

### Plain-language claim

Given two authenticated, consecutive ERC-8350 transitions in the same dedicated
embedding Space and a public squared-distance bound `epsilonSquared`, the prover knows
canonical openings to both transitions' profile-specific `deltaCommitment` values such
that:

1. each opening contains exactly one `d`-coordinate quantized embedding;
2. every coordinate is in the profile's permitted signed integer range; and
3. the squared Euclidean distance between the two embeddings is no greater than
   `epsilonSquared`.

A valid proof means only: **the two committed quantized vectors satisfy this local
distance relation**. It does not establish why either vector exists or whether either
vector faithfully represents memory.

### Public instance

The verifier must bind the proof to all of the following public values:

| Value | Purpose |
|---|---|
| `chainId`, Registry address | Prevent proof reuse under a different Registry domain |
| `spaceId` | Bind the claim to one Memory Space |
| Previous and current `sequence` | Establish the intended consecutive pair |
| Previous and current `transitionId` | Identify the accepted transitions being compared |
| Previous and current `deltaCommitment` | Bind the hidden vectors to the ERC-8350 records |
| Provisional profile descriptor digest | Bind dimension, quantization, commitment parameters, distance rule, and relation version |
| `epsilonSquared` | State the exact public bound the verifier is accepting |

The existing public `profileId`, transition timing, and all other fields already
visible in `TransitionCommitted` remain public. A ZK profile does not make existing
ERC-8350 metadata private.

### Private witness

The candidate witness contains:

- previous quantized vector `u[0..d-1]`;
- current quantized vector `v[0..d-1]`;
- independent commitment salts or blindings for `u` and `v`; and
- the exact canonical encodings needed to open the two commitments.

Raw source memories, plaintext text, locators, encryption keys, and full provenance
records are not inputs to this first relation. A later profile may bind those values,
but silently adding them here would turn a narrow distance proof into an unreviewed
inference or provenance proof.

### Verifier preconditions

Before verifying the ZK relation, a verifier must independently authenticate that:

1. both transition records came from the claimed Registry and chain;
2. both belong to the same `spaceId`;
3. the current sequence is exactly the previous sequence plus one;
4. the state-root chain makes the current record the accepted successor; and
5. both records identify the same exact profile descriptor.

These are ERC-8350 history checks, not secret circuit predicates. An off-chain verifier
can reconstruct them from canonical receipts and events. The current Registry does not
make historical event data readable by another contract, so on-chain authentication of
these inputs would require a separately reviewed integration. That integration is not
part of T-009.

### Candidate circuit relation

For public commitments `C_prev`, `C_next` and private witness `(u, v, r_prev, r_next)`,
the relation would require:

```text
C_prev == Commit(profileDescriptor, r_prev, encode(u))
C_next == Commit(profileDescriptor, r_next, encode(v))

for every i in [0, d):
    -coordinateBound <= u[i] <= coordinateBound
    -coordinateBound <= v[i] <= coordinateBound

distanceSquared = sum((u[i] - v[i])^2 for i in [0, d))
distanceSquared <= epsilonSquared
```

The proof transcript or verifier input must bind the complete public instance. Checking
only the two commitments would permit the same proof to be presented for another Space,
Registry, transition pair, or threshold.

### Unresolved proof-statement questions

1. Must the first profile permanently require a dedicated Space, or should a later
   descriptor carry an explicit prior embedding transition reference?
2. Is `epsilonSquared` chosen by each verifier, fixed by the profile descriptor, or
   authorized through a separate Space policy commitment?
3. Does `deltaCommitment` directly use a ZK-friendly vector commitment, or does the
   circuit open the ERC-8350 salted-keccak baseline? A dual-commitment construction
   must prove that both commitments cover the same canonical vector.
4. Which dimensions, quantization scale, coordinate bound, and rounding rule are fixed
   by one profile identifier?
5. Must the final `profileId` bind the relation, circuit digest, verifying-key digest,
   commitment parameters, and setup identifier?
6. Is the proof an off-chain audit artifact, an optional extension record, or an
   on-chain verification input? This choice changes public-input authentication.
7. Genesis has no predecessor. Is it simply unproved, or does a separate genesis
   relation commit to an initial vector?

No implementation should begin until these questions have explicit answers.

## Privacy boundary

### Public by design

- all public ERC-8350 transition fields and event metadata;
- the fact that a proof was requested, produced, or verified;
- the two transitions selected for comparison;
- the profile descriptor or its recognizable identifier;
- vector dimension and quantization family when recoverable from that descriptor;
- `epsilonSquared`; and
- the Boolean result that the hidden distance is within the bound.

### Private if the final system is correctly instantiated

- every vector coordinate;
- the exact distance, beyond what follows from the public bound and result;
- commitment salts or blindings;
- raw memory and embedding source text;
- private provenance, locator, encryption keys, and witness-storage metadata; and
- unrelated transitions and vectors not included in the proof.

### Residual leakage

Zero knowledge does not mean zero metadata. Repeated proofs against adaptively chosen
thresholds can act as a binary-search oracle for the hidden distance. Reusing salts,
commitments, proof randomness, or recognizable profile identifiers can create equality
or linkage signals. Timing, frequency, proof refusal, verifier identity, and network
traffic remain observable outside the circuit.

A deployment therefore needs a threshold-disclosure policy, proof-request policy, fresh
randomness, and transport-level privacy. The first profile does not solve those
operational channels.

## Circuit assumptions

The candidate relation is meaningful only under all of these assumptions:

1. **Authenticated public inputs.** The verifier obtains the exact commitments and
   transition identifiers from canonical ERC-8350 history rather than accepting
   attacker-supplied lookalikes.
2. **Binding and hiding commitment.** The selected commitment is domain-separated,
   binds the profile descriptor and canonical vector encoding, and uses fresh secret
   blinding. Collision resistance alone does not make low-entropy vectors private.
3. **Canonical vector encoding.** Dimension, signed representation, scale, rounding,
   endianness, padding, and rejection of malformed encodings are fixed with no alternate
   encodings for the same vector.
4. **Integer, not floating-point, semantics.** Embeddings are quantized before proving.
   The circuit proves distance in that integer space, not native model floating-point
   distance.
5. **Range and overflow safety.** Every coordinate, difference, square, threshold, and
   accumulated sum is range-constrained so finite-field wraparound cannot satisfy a
   false inequality.
6. **Frozen field and hash parameters.** The proof field, commitment permutation or
   hash, domain tags, round constants, and security level are fixed and independently
   reviewed. Poseidon is only a research candidate, not a decision.
7. **Proof-system security.** Completeness, knowledge soundness, and zero knowledge hold
   for the exact implementation and transcript. Any structured reference string or
   trusted setup is generated, versioned, and governed according to the selected
   system's assumptions.
8. **Witness availability.** The prover retains both prior and current openings. ERC-8350
   commits to state history but does not guarantee private witness recovery.
9. **Side-channel discipline.** The prover does not leak witnesses through logs, errors,
   deterministic randomness, timing interfaces, artifacts, or remote proving services.

This note does not choose Groth16, PLONK, a transparent proof system, a circuit language,
or a curve. EIP-197 makes pairing-based verification possible on Ethereum, but that fact
does not by itself select an appropriate system or security model for this profile.

## Non-goals

The first ZK profile does not attempt to prove:

- the truth, usefulness, quality, salience, ownership, or legality of memory;
- that an embedding was produced by a named model, from a committed input, or through a
  claimed inference process;
- semantic similarity in natural-language meaning;
- cosine distance, floating-point equivalence, or compatibility across embedding models;
- membership in a vector store, completeness of a store, or absence of omitted entries;
- cumulative drift bounds across many transitions; many individually small steps can
  still move arbitrarily far over time;
- freshness, availability, retrievability, deletion, or uniqueness of private memory;
- authorization of the chosen threshold or competence of the verifier;
- privacy of `profileId`, timing, frequency, transition count, or proof existence;
- on-chain proof verification, verifier gas targets, aggregation, recursion, bridging,
  or proof-market economics; or
- any change to the seven-field `ExperienceDelta`, Registry state machine, or ERC-8350
  conformance vectors.

Membership proofs remain the separate second ZK-profile direction in the roadmap.

## Research exit gate

Implementation remains blocked until a follow-up design review freezes:

1. the exact public instance and relation;
2. profile descriptor canonicalization and final `profileId` derivation;
3. vector encoding, dimensions, quantization, metric, and safe numeric bounds;
4. commitment construction and parameters;
5. proof system, setup model, verifier placement, and public-input authentication;
6. privacy analysis for repeated and failed proof requests; and
7. independent cryptographic review plus implementation-neutral test vectors.

Only after that gate should the project consider a circuit prototype. T-009 itself ends
with this note.

## Informative references

- ERC-8350 baseline commitments and explicit non-claims:
  [`erc/erc-8350.md`](../../erc/erc-8350.md)
- ERC-8350 private-witness boundary:
  [`docs/adr/0003-private-commitments.md`](../adr/0003-private-commitments.md)
- ERC-8350 public `profileId` and disclosure model:
  [`docs/adr/0005-metadata-layers-and-auditability.md`](../adr/0005-metadata-layers-and-auditability.md)
- Jens Groth, *On the Size of Pairing-based Non-interactive Arguments*:
  https://eprint.iacr.org/2016/260
- Gabizon, Williamson, and Ciobotaru, *PLONK*:
  https://eprint.iacr.org/2019/953
- Grassi et al., *Poseidon: A New Hash Function for Zero-Knowledge Proof Systems*:
  https://eprint.iacr.org/2019/458
- [EIP-197](https://eips.ethereum.org/EIPS/eip-197), Ethereum pairing-check precompile
