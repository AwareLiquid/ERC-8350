#!/usr/bin/env node
// Generates test-vectors/v2.json — the vectors an independent implementation needs
// in order to prove it implements this specification, rather than merely agreeing
// with it on one hash.
//
// v1 published a single genesis delta and the EIP-712 constants. That is enough to
// check arithmetic and nothing else: with one delta at sequence 1 and a zero
// prevStateRoot, neither sequence monotonicity nor prior-root linkage is exercised,
// and no rejection is exercised at all. So the open call for a second implementation
// ("drive the vectors end to end, including the rejection cases") asked for something
// the published vectors could not express. v2 closes that gap.
//
// v1 is NOT superseded and is not modified: its values remain the canonical
// single-delta reference, and v2 restates them under `v1Reference` so an implementer
// can confirm both files describe the same protocol.
//
// Everything is derived from fixed public constants — no randomness, no timestamps.
// Re-running this script MUST reproduce the file byte-for-byte.
//
// Run with `--check` to assert that without writing: the bundle is rebuilt in memory
// and compared against the committed file, exiting non-zero on any drift. `pnpm check`
// runs it that way.
//
// This header previously claimed the property was "itself tested (see the
// reproducibility check at the end)". No such check existed. The property had only
// ever been confirmed by hand, once, by regenerating and running `git diff` — and a
// comment was written asserting a machine did it. That is the exact defect this
// repository's own interop note §6.3 is about: a claim no check consumes reads
// identically to a checked one until the moment it stops being true.

import {writeFileSync, readFileSync} from "node:fs";
import {
  computeTransitionId,
  computeNextStateRoot,
  computePrivateCommitment,
  computeProvenanceCommitment,
  computeLocatorCommitment,
  computeDomainSeparator,
  computeSigningDigest,
  computeSpaceRegistrationId,
  deriveSpaceId,
  keccak256Utf8,
  EXPERIENCE_DELTA_TYPE,
  MEMORY_STATE_TYPE,
  MEMORY_SPACE_TYPE,
  SPACE_REGISTRATION_TYPE,
  EXPERIENCE_DELTA_TYPEHASH,
  MEMORY_STATE_TYPEHASH,
  MEMORY_SPACE_TYPEHASH,
  ZERO32,
} from "../packages/core/dist/index.js";

const utf8 = (s) => new TextEncoder().encode(s);
const ZERO_ADDR = "0x" + "00".repeat(20);

// --- Fixed identities (public, arbitrary, chosen for legibility) ---------------
const CONTROLLER = "0x2222222222222222222222222222222222222222";
const AUTHORIZER = "0x3333333333333333333333333333333333333333";
const REGISTRY = "0x4444444444444444444444444444444444444444";
const CHAIN_ID = 1n;
const SPACE_SALT = "0x" + "dd".repeat(32);
const SPACE_ID = deriveSpaceId(CONTROLLER, SPACE_SALT);

const DOMAIN = computeDomainSeparator(CHAIN_ID, REGISTRY);

// Deterministic per-purpose values. Salts are public here because these are test
// vectors; a real deployment's salts are secret and random (that is what makes a
// commitment hiding, and low-entropy payloads under a public salt are not).
const salt = (label) => keccak256Utf8("agent-memory-state/test-vectors/v2:" + label);
const profile = (name) => keccak256Utf8("agent-memory-state/test-vectors/v2/profile/" + name);

// --- The chain ----------------------------------------------------------------
// Five transitions. What matters is not the count but that each subsequent delta is
// only computable from the previous one's nextStateRoot: an implementation that gets
// prevStateRoot linkage wrong cannot produce transition N+1 even if transition N is
// perfect, so the chain fails closed rather than drifting silently.
const CHAIN_SPEC = [
  {
    label: "genesis-minimal",
    payload: {op: "upsert", resourceId: "memory-1", value: "first write"},
    profileName: "text",
    provenance: null,
    locator: null,
    exercises: "Genesis: sequence 1 on a fresh Space, prevStateRoot = 0, no optional commitments.",
  },
  {
    label: "with-provenance",
    payload: {op: "upsert", resourceId: "memory-2", value: "written because of a verdict"},
    profileName: "text",
    provenance: {attestation_refs: [{scheme: "example/v0", ref: "0x01"}]},
    locator: null,
    exercises: "provenanceCommitment present, locatorCommitment absent (zero).",
  },
  {
    label: "with-locator",
    payload: {op: "upsert", resourceId: "memory-3", value: "stored off chain"},
    profileName: "episodic",
    provenance: null,
    locator: "ipfs://bafybeigdyrzt5example",
    exercises: "locatorCommitment present, provenanceCommitment absent (zero).",
  },
  {
    label: "with-both",
    payload: {op: "upsert", resourceId: "memory-4", value: "both optional fields"},
    profileName: "episodic",
    provenance: {attestation_refs: [{scheme: "example/v0", ref: "0x02"}]},
    locator: "ipfs://bafybeigdyrzt5other",
    exercises: "Both optional commitments present in one delta.",
  },
  {
    label: "profile-change",
    payload: {op: "delete", resourceId: "memory-1"},
    profileName: "tool-trace",
    provenance: null,
    locator: null,
    exercises:
      "profileId changes mid-chain: a Space is not pinned to one profile, and the " +
      "registry does not interpret profileId at all.",
  },
];

const chain = [];
let prevStateRoot = ZERO32;
for (const [i, spec] of CHAIN_SPEC.entries()) {
  const sequence = BigInt(i + 1);
  const payloadJson = JSON.stringify(spec.payload);
  const profileId = profile(spec.profileName);
  const deltaSalt = salt(`delta-${sequence}`);
  const deltaCommitment = computePrivateCommitment(utf8(payloadJson), deltaSalt, profileId);

  let provenanceCommitment = ZERO32;
  let provenanceSalt = null;
  let provenanceJson = null;
  if (spec.provenance) {
    provenanceJson = JSON.stringify(spec.provenance);
    provenanceSalt = salt(`provenance-${sequence}`);
    provenanceCommitment = computeProvenanceCommitment(utf8(provenanceJson), provenanceSalt);
  }

  let locatorCommitment = ZERO32;
  let locatorSalt = null;
  if (spec.locator) {
    locatorSalt = salt(`locator-${sequence}`);
    locatorCommitment = computeLocatorCommitment(spec.locator, locatorSalt);
  }

  const delta = {
    spaceId: SPACE_ID,
    sequence,
    prevStateRoot,
    deltaCommitment,
    provenanceCommitment,
    profileId,
    locatorCommitment,
  };
  const transitionId = computeTransitionId(delta);
  const nextStateRoot = computeNextStateRoot(prevStateRoot, transitionId);

  chain.push({
    label: spec.label,
    exercises: spec.exercises,
    delta: {...delta, sequence: sequence.toString()},
    witness: {
      payload: payloadJson,
      payloadEncoding: "utf-8",
      deltaSalt,
      provenance: provenanceJson,
      provenanceSalt,
      locator: spec.locator,
      locatorSalt,
    },
    expected: {
      transitionId,
      nextStateRoot,
      signingDigest: computeSigningDigest(transitionId, CHAIN_ID, REGISTRY),
    },
  });
  prevStateRoot = nextStateRoot;
}

// --- Rejections ---------------------------------------------------------------
// Each case states the error the reference registry raises and the point at which
// it raises it. Order matters: several inputs are invalid in more than one way, and
// an implementation that checks in a different order returns a different error for
// the same input. The `checkedBefore` notes make that ordering explicit rather than
// leaving it to be inferred from one implementation's source.
const selector = (sig) => keccak256Utf8(sig).slice(0, 10);

const head = chain[chain.length - 1];
const nextSeq = (BigInt(head.delta.sequence) + 1n).toString();
const validNext = {
  spaceId: SPACE_ID,
  sequence: nextSeq,
  prevStateRoot: head.expected.nextStateRoot,
  deltaCommitment: computePrivateCommitment(utf8('{"op":"noop"}'), salt("delta-reject"), profile("text")),
  provenanceCommitment: ZERO32,
  profileId: profile("text"),
  locatorCommitment: ZERO32,
};

const rejections = [
  {
    name: "UnknownSpace",
    target: "commitTransition",
    signature: "UnknownSpace()",
    input: {...validNext, spaceId: keccak256Utf8("agent-memory-state/test-vectors/v2:never-registered")},
    why: "Committing into a Space that was never registered.",
    checkedBefore: "Every delta-field check: an unregistered Space is rejected before deltaCommitment or profileId are inspected.",
  },
  {
    name: "ZeroDeltaCommitment",
    target: "commitTransition",
    signature: "ZeroDeltaCommitment()",
    input: {...validNext, deltaCommitment: ZERO32},
    why: "A zero deltaCommitment would commit to nothing; zero is reserved as the absent marker for the optional fields.",
    checkedBefore: "profileId, sequence, prevStateRoot.",
  },
  {
    name: "ZeroProfileId",
    target: "commitTransition",
    signature: "ZeroProfileId()",
    input: {...validNext, profileId: ZERO32},
    why: "profileId is mandatory: it is how a consumer knows how to interpret deltaCommitment.",
    checkedBefore: "sequence, prevStateRoot.",
  },
  {
    name: "BadSequence (skips ahead)",
    target: "commitTransition",
    signature: "BadSequence(uint64,uint64)",
    input: {...validNext, sequence: (BigInt(nextSeq) + 1n).toString()},
    expectedArgs: {expected: nextSeq, received: (BigInt(nextSeq) + 1n).toString()},
    why: "Sequence must be exactly head + 1. A gap would make the history unverifiable without out-of-band knowledge of what is missing.",
    checkedBefore: "prevStateRoot.",
  },
  {
    name: "BadSequence (replays a committed sequence)",
    target: "commitTransition",
    signature: "BadSequence(uint64,uint64)",
    input: {...validNext, sequence: head.delta.sequence},
    expectedArgs: {expected: nextSeq, received: head.delta.sequence},
    why: "Re-committing at an already-used sequence. This is the case that makes TransitionAlreadyExists unreachable in practice — see notes.transitionAlreadyExists.",
    checkedBefore: "prevStateRoot.",
  },
  {
    name: "BadPreviousState",
    target: "commitTransition",
    signature: "BadPreviousState(bytes32,bytes32)",
    input: {...validNext, prevStateRoot: chain[0].expected.nextStateRoot},
    expectedArgs: {expected: head.expected.nextStateRoot, received: chain[0].expected.nextStateRoot},
    why: "Correct sequence but a prior root from earlier in the chain: the linkage check is what forbids forking a Space's history.",
    checkedBefore: "transitionId computation and authorization.",
  },
  {
    name: "InvalidAuthorization (wrong signer)",
    target: "commitTransition",
    signature: "InvalidAuthorization()",
    input: validNext,
    authorization: "A 65-byte ECDSA signature that recovers to an address other than the Space authorizer.",
    why: "Authorization is checked against the Space's recorded authorizer, not the caller.",
    checkedBefore: "State mutation: a rejected transition leaves the head untouched.",
  },
  {
    name: "InvalidAuthorization (malformed length)",
    target: "commitTransition",
    signature: "InvalidAuthorization()",
    input: validNext,
    authorization: "A signature whose length is neither 0 (direct call) nor 65.",
    why: "Length is guarded before recovery so a malformed signature is a clean rejection rather than an abort inside ECDSA.recover.",
  },
  {
    name: "ZeroSpaceId",
    target: "registerSpace",
    signature: "ZeroSpaceId()",
    input: {spaceId: ZERO32, controller: CONTROLLER, authorizer: AUTHORIZER, salt: SPACE_SALT},
    why: "Zero is not a valid namespace.",
  },
  {
    name: "ZeroAddress",
    target: "registerSpace",
    signature: "ZeroAddress()",
    input: {spaceId: SPACE_ID, controller: ZERO_ADDR, authorizer: AUTHORIZER, salt: SPACE_SALT},
    why: "A Space with a zero controller could never be administered or rotated.",
    checkedBefore: "The spaceId derivation check.",
  },
  {
    name: "InvalidSpaceId",
    target: "registerSpace",
    signature: "InvalidSpaceId(bytes32,bytes32)",
    input: {
      spaceId: keccak256Utf8("agent-memory-state/test-vectors/v2:not-derived"),
      controller: CONTROLLER,
      authorizer: AUTHORIZER,
      salt: SPACE_SALT,
    },
    expectedArgs: {expected: SPACE_ID, received: keccak256Utf8("agent-memory-state/test-vectors/v2:not-derived")},
    why: "spaceId MUST equal deriveSpaceId(controller, salt): a Space id is a commitment to who created it, not a name anyone may claim.",
  },
  {
    name: "SpaceAlreadyRegistered",
    target: "registerSpace",
    signature: "SpaceAlreadyRegistered()",
    input: {spaceId: SPACE_ID, controller: CONTROLLER, authorizer: AUTHORIZER, salt: SPACE_SALT},
    why: "Re-registering an existing Space would reset its head — the one operation that could erase a history without leaving a trace.",
    precondition: "The Space from `space` has already been registered.",
  },
].map((r) => ({...r, selector: selector(r.signature)}));

// --- Assemble -----------------------------------------------------------------
const v1 = JSON.parse(readFileSync("test-vectors/v1.json", "utf8"));

const bundle = {
  schema: "agent-memory-state/test-vectors/v2",
  purpose:
    "Conformance vectors for an independent implementation. v1 checks that an " +
    "implementation computes one hash correctly; v2 checks that it implements the " +
    "state machine: sequence monotonicity, prior-root linkage, the optional-field " +
    "encodings, and every rejection. Passing v2 is the bar the roadmap's open call " +
    "for a second implementation refers to.",
  usage:
    "Recompute each chain entry's transitionId and nextStateRoot from its delta, in " +
    "order, feeding each nextStateRoot into the next prevStateRoot. Then confirm each " +
    "rejection input is refused with the stated error. `node scripts/check-vectors.mjs` " +
    "runs this against the TypeScript reference; contracts/test/unit/VectorsV2.t.sol " +
    "runs the same file against the Solidity registry.",
  types: {
    experienceDelta: EXPERIENCE_DELTA_TYPE,
    memoryState: MEMORY_STATE_TYPE,
    memorySpace: MEMORY_SPACE_TYPE,
    spaceRegistration: SPACE_REGISTRATION_TYPE,
  },
  typehashes: {
    experienceDelta: EXPERIENCE_DELTA_TYPEHASH,
    memoryState: MEMORY_STATE_TYPEHASH,
    memorySpace: MEMORY_SPACE_TYPEHASH,
  },
  eip712: {
    name: "AgentMemoryState",
    version: "1",
    chainId: CHAIN_ID.toString(),
    verifyingContract: REGISTRY,
    domainSeparator: DOMAIN,
  },
  space: {
    controller: CONTROLLER,
    authorizer: AUTHORIZER,
    salt: SPACE_SALT,
    spaceId: SPACE_ID,
    registrationId: computeSpaceRegistrationId(SPACE_ID, CONTROLLER, AUTHORIZER),
  },
  chain,
  rejections,
  notes: {
    transitionAlreadyExists:
      "The reference registry defines TransitionAlreadyExists(), but it is not " +
      "reachable through commitTransition: transitionId binds sequence and " +
      "prevStateRoot, both of which are checked against the head first, so a " +
      "duplicate id requires a head that has not advanced — impossible after a " +
      "successful commit. It is retained as defence in depth. An implementation is " +
      "not required to produce this error, but MUST NOT let a duplicate transitionId " +
      "overwrite a stored transition. No vector is supplied because none can be " +
      "constructed; saying so explicitly is better than leaving an implementer to " +
      "hunt for one.",
    authorizationPaths:
      "Three authorization paths exist and only the first is exercised by a pure " +
      "recomputation: direct call (msg.sender == authorizer and an empty signature), " +
      "ERC-1271 (contract authorizer), and 65-byte ECDSA. The signingDigest published " +
      "per chain entry is what an ECDSA authorizer signs; signatures themselves are " +
      "not published because they depend on a private key an implementer should " +
      "supply for their own tests.",
    saltSecrecy:
      "Every salt here is public and derived from a label. That is correct for test " +
      "vectors and wrong for deployments: a commitment over a low-entropy payload " +
      "hides nothing once its salt is known.",
  },
  v1Reference: {
    note:
      "v1 is not superseded; its single-delta values are restated here so an " +
      "implementer can confirm both files describe the same protocol. v2 uses the " +
      "same Space as v1 — identical controller and salt, therefore an identical " +
      "spaceId — but different payloads and salts, so v1's transitionId is not the " +
      "same as this chain's sequence-1 transitionId. Both are correct: a transitionId " +
      "binds the commitments, not just the position.",
    sameSpaceIdAsV1: v1.delta.spaceId === SPACE_ID,
    transitionId: v1.expected.transitionId,
    nextStateRoot: v1.expected.nextStateRoot,
    domainSeparator: v1.eip712.domainSeparator,
    typehashesMatch:
      v1.expected.experienceDeltaTypehash === EXPERIENCE_DELTA_TYPEHASH &&
      v1.expected.memoryStateTypehash === MEMORY_STATE_TYPEHASH &&
      v1.expected.memorySpaceTypehash === MEMORY_SPACE_TYPEHASH,
  },
};

// --- Self-checks before writing ------------------------------------------------
if (!bundle.v1Reference.typehashesMatch) {
  throw new Error("v1 typehashes disagree with the current core implementation");
}
if (chain[0].delta.prevStateRoot !== ZERO32) throw new Error("genesis must start from zero root");
for (let i = 1; i < chain.length; i++) {
  if (chain[i].delta.prevStateRoot !== chain[i - 1].expected.nextStateRoot) {
    throw new Error(`chain linkage broken at index ${i}`);
  }
  if (BigInt(chain[i].delta.sequence) !== BigInt(chain[i - 1].delta.sequence) + 1n) {
    throw new Error(`sequence not monotonic at index ${i}`);
  }
}
const ids = new Set(chain.map((c) => c.expected.transitionId));
if (ids.size !== chain.length) throw new Error("transitionId collision within the chain");

const OUT = "test-vectors/v2.json";
const serialized = JSON.stringify(bundle, null, 2) + "\n";

if (process.argv.includes("--check")) {
  // Compare against the committed bytes without writing. Reading the file we are
  // about to compare against is the point: it fails if the generator drifted from
  // the artifact, in either direction.
  let onDisk;
  try {
    onDisk = readFileSync(OUT, "utf8");
  } catch {
    console.error(`FAIL ${OUT} does not exist; run without --check to generate it`);
    process.exit(1);
  }
  if (onDisk !== serialized) {
    // Report the first differing line rather than dumping two 600-line files.
    const a = onDisk.split("\n");
    const b = serialized.split("\n");
    const i = a.findIndex((line, n) => line !== b[n]);
    console.error(`FAIL ${OUT} is not what this generator produces (first difference at line ${i + 1})`);
    console.error(`  committed: ${a[i]}`);
    console.error(`  generated: ${b[i]}`);
    process.exit(1);
  }
  console.log(`PASS ${OUT} reproduces byte-for-byte (${serialized.length} bytes)`);
  process.exit(0);
}

writeFileSync(OUT, serialized);
console.log(`spaceId:      ${SPACE_ID}`);
console.log(`chain:        ${chain.length} transitions, head root ${head.expected.nextStateRoot}`);
console.log(`rejections:   ${rejections.length} cases`);
console.log(`wrote ${OUT}`);
