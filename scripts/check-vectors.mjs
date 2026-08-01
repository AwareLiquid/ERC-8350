#!/usr/bin/env node
// Runs test-vectors/v2.json against the TypeScript reference implementation.
//
// This deliberately reads the published file and recomputes from it, rather than
// re-deriving the values the way the generator does. A checker that shares the
// generator's code path proves only that the code is self-consistent; this one
// would catch a corrupted or hand-edited vector file, which is the failure the
// vectors exist to make impossible.
//
// It is also meant to be read as a template: an independent implementation should
// be able to follow this file's structure, substitute its own functions, and get a
// pass/fail — that is the whole point of publishing v2.

import {readFileSync} from "node:fs";
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
  ZERO32,
} from "../packages/core/dist/index.js";

const v = JSON.parse(readFileSync("test-vectors/v2.json", "utf8"));
const utf8 = (s) => new TextEncoder().encode(s);

let failures = 0;
const check = (name, got, want) => {
  if (got === want) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`);
    failures++;
  }
};

console.log("type strings and typehashes");
check("experienceDelta type", v.types.experienceDelta, EXPERIENCE_DELTA_TYPE);
check("memoryState type", v.types.memoryState, MEMORY_STATE_TYPE);
check("memorySpace type", v.types.memorySpace, MEMORY_SPACE_TYPE);
check("experienceDelta typehash", v.typehashes.experienceDelta, keccak256Utf8(v.types.experienceDelta));
check("memoryState typehash", v.typehashes.memoryState, keccak256Utf8(v.types.memoryState));
check("memorySpace typehash", v.typehashes.memorySpace, keccak256Utf8(v.types.memorySpace));

console.log("space derivation");
check(
  "spaceId = deriveSpaceId(controller, salt)",
  v.space.spaceId,
  deriveSpaceId(v.space.controller, v.space.salt),
);
check(
  "registrationId",
  v.space.registrationId,
  computeSpaceRegistrationId(v.space.spaceId, v.space.controller, v.space.authorizer),
);
check(
  "domainSeparator",
  v.eip712.domainSeparator,
  computeDomainSeparator(BigInt(v.eip712.chainId), v.eip712.verifyingContract),
);

console.log("chain: commitments rebuilt from witnesses, then the state machine");
let expectedPrevRoot = ZERO32;
for (const entry of v.chain) {
  const d = entry.delta;
  const w = entry.witness;
  const label = `[${d.sequence}] ${entry.label}`;

  // Commitments must follow from the disclosed witnesses. Recomputing these is what
  // separates "the vectors are internally consistent" from "the vectors describe a
  // payload anyone can verify".
  check(
    `${label} deltaCommitment from witness`,
    d.deltaCommitment,
    computePrivateCommitment(utf8(w.payload), w.deltaSalt, d.profileId),
  );
  check(
    `${label} provenanceCommitment`,
    d.provenanceCommitment,
    w.provenance === null ? ZERO32 : computeProvenanceCommitment(utf8(w.provenance), w.provenanceSalt),
  );
  check(
    `${label} locatorCommitment`,
    d.locatorCommitment,
    w.locator === null ? ZERO32 : computeLocatorCommitment(w.locator, w.locatorSalt),
  );

  // Linkage: the published prevStateRoot must be the previous entry's nextStateRoot.
  check(`${label} prevStateRoot links to previous head`, d.prevStateRoot, expectedPrevRoot);

  const transitionId = computeTransitionId({
    spaceId: d.spaceId,
    sequence: BigInt(d.sequence),
    prevStateRoot: d.prevStateRoot,
    deltaCommitment: d.deltaCommitment,
    provenanceCommitment: d.provenanceCommitment,
    profileId: d.profileId,
    locatorCommitment: d.locatorCommitment,
  });
  check(`${label} transitionId`, entry.expected.transitionId, transitionId);

  const nextStateRoot = computeNextStateRoot(d.prevStateRoot, transitionId);
  check(`${label} nextStateRoot`, entry.expected.nextStateRoot, nextStateRoot);
  check(
    `${label} signingDigest`,
    entry.expected.signingDigest,
    computeSigningDigest(transitionId, BigInt(v.eip712.chainId), v.eip712.verifyingContract),
  );

  expectedPrevRoot = nextStateRoot;
}

console.log("rejections: error selectors");
for (const r of v.rejections) {
  check(`${r.name} -> ${r.signature}`, r.selector, keccak256Utf8(r.signature).slice(0, 10));
}
console.log(
  "  note: rejection *behaviour* is exercised against the registry in " +
    "contracts/test/unit/VectorsV2.t.sol; this script only checks that the published " +
    "selectors match the published signatures, which is all a pure recomputation can do.",
);

console.log(
  failures === 0
    ? `\nPASS — ${v.chain.length} transitions, ${v.rejections.length} rejection selectors`
    : `\nFAIL — ${failures} mismatch(es)`,
);
process.exit(failures === 0 ? 0 : 1);
