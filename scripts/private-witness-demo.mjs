#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { utf8ToBytes } from "@noble/hashes/utils";
import {
  ZERO32,
  addressWord,
  bytes32Word,
  computeLocatorCommitment,
  computeNextStateRoot,
  computePrivateCommitment,
  computeProvenanceCommitment,
  computeTransitionId,
  concatBytes,
  deriveSpaceId,
  keccak256,
  keccak256Utf8,
  uintWord,
} from "../packages/core/dist/index.js";
import { stableStringify } from "../packages/reference-engine/dist/record.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vectorDirectory = path.join(repositoryRoot, "test-vectors", "private-witness");
const privatePath = path.join(vectorDirectory, "tool-trace-v1.private.json");
const disclosurePath = path.join(vectorDirectory, "tool-trace-v1.auditor.json");
const publicPath = path.join(vectorDirectory, "tool-trace-v1.public.json");

const FIXTURE_SCHEMA = "erc-8350/private-witness-fixture/v1";
const DISCLOSURE_SCHEMA = "erc-8350/auditor-disclosure/v1";
const WITNESS_SCHEMA = "erc-8350/private-witness-item/v1";
const PUBLIC_SCHEMA = "erc-8350/private-witness-public-evidence/v1";
const AUDIT_WITNESS_TYPE =
  "AuditWitness(bytes32 prevRoot,bytes32 transitionId,bytes32 witnessHash)";
const AUDIT_WITNESS_TYPEHASH = keccak256Utf8(AUDIT_WITNESS_TYPE);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function jsonBytes(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function assertExactFile(filePath, expected) {
  const actual = readFileSync(filePath, "utf8");
  assert(
    actual === jsonBytes(expected),
    `${path.relative(repositoryRoot, filePath)} drifted; run this script with --write`,
  );
}

function foldWitnessRoot(previousRoot, transitionId, witnessHash) {
  return keccak256(
    concatBytes(
      bytes32Word(AUDIT_WITNESS_TYPEHASH),
      bytes32Word(previousRoot),
      bytes32Word(transitionId),
      bytes32Word(witnessHash),
    ),
  );
}

function deriveGrantId(spaceId, auditor, fromSequence, toSequence) {
  return keccak256(
    concatBytes(
      bytes32Word(spaceId),
      addressWord(auditor),
      uintWord(BigInt(fromSequence)),
      uintWord(BigInt(toSequence)),
    ),
  );
}

function buildTransition(entry, profileId, spaceId, previousRoot) {
  const payloadUtf8 = stableStringify(entry.payload);
  const provenanceUtf8 = entry.provenance === null
    ? null
    : stableStringify(entry.provenance);
  const delta = {
    spaceId,
    sequence: BigInt(entry.sequence),
    prevStateRoot: previousRoot,
    deltaCommitment: computePrivateCommitment(
      utf8ToBytes(payloadUtf8),
      entry.deltaSalt,
      profileId,
    ),
    provenanceCommitment: provenanceUtf8 === null
      ? ZERO32
      : computeProvenanceCommitment(
          utf8ToBytes(provenanceUtf8),
          entry.provenanceSalt,
        ),
    profileId,
    locatorCommitment: computeLocatorCommitment(entry.locator, entry.locatorSalt),
  };
  const transitionId = computeTransitionId(delta);
  const nextStateRoot = computeNextStateRoot(previousRoot, transitionId);
  return {
    entry,
    payloadUtf8,
    provenanceUtf8,
    delta,
    transitionId,
    nextStateRoot,
  };
}

function publicTransition(record, authorizer) {
  return {
    spaceId: record.delta.spaceId,
    sequence: record.delta.sequence.toString(10),
    prevStateRoot: record.delta.prevStateRoot,
    deltaCommitment: record.delta.deltaCommitment,
    provenanceCommitment: record.delta.provenanceCommitment,
    profileId: record.delta.profileId,
    locatorCommitment: record.delta.locatorCommitment,
    transitionId: record.transitionId,
    nextStateRoot: record.nextStateRoot,
    authorizer,
  };
}

function disclosureItem(record, profileId) {
  const witness = {
    schema: WITNESS_SCHEMA,
    spaceId: record.delta.spaceId,
    sequence: record.delta.sequence.toString(10),
    transitionId: record.transitionId,
    profileId,
    payload: record.entry.payload,
    deltaSalt: record.entry.deltaSalt,
    provenance: record.entry.provenance,
    provenanceSalt: record.entry.provenanceSalt,
    locator: record.entry.locator,
    locatorSalt: record.entry.locatorSalt,
  };
  return {
    witness,
    encoded: {
      payloadUtf8: record.payloadUtf8,
      provenanceUtf8: record.provenanceUtf8,
      witnessUtf8: stableStringify(witness),
    },
  };
}

function buildEvidence(fixture) {
  assert(fixture.schema === FIXTURE_SCHEMA, "unsupported private fixture schema");
  assert(fixture.transitions.length === 2, "demo must contain exactly two transitions");
  assert(
    fixture.transitions.every((entry, index) => entry.sequence === String(index + 1)),
    "private transitions must be contiguous from sequence 1",
  );

  const profileId = keccak256Utf8(fixture.profileUri);
  const spaceId = deriveSpaceId(fixture.space.controller, fixture.space.spaceSalt);
  const records = [];
  let previousRoot = ZERO32;
  for (const entry of fixture.transitions) {
    const record = buildTransition(entry, profileId, spaceId, previousRoot);
    records.push(record);
    previousRoot = record.nextStateRoot;
  }

  const selected = new Set(fixture.disclosure.sequences);
  const selectedRecords = records.filter((record) =>
    selected.has(record.delta.sequence.toString(10))
  );
  assert(selectedRecords.length === selected.size, "disclosure sequence is missing");
  const items = selectedRecords.map((record) => disclosureItem(record, profileId));
  const disclosure = {
    _warning:
      "SYNTHETIC OUT-OF-BAND DISCLOSURE. Production auditors receive this privately; it is committed here only so anyone can reproduce the demo.",
    schema: DISCLOSURE_SCHEMA,
    scenarioId: fixture.scenarioId,
    range: {
      fromSequence: fixture.disclosure.fromSequence,
      toSequence: fixture.disclosure.toSequence,
    },
    items,
  };

  let witnessSetRoot = ZERO32;
  for (const item of items) {
    const witnessHash = keccak256(utf8ToBytes(item.encoded.witnessUtf8));
    witnessSetRoot = foldWitnessRoot(
      witnessSetRoot,
      item.witness.transitionId,
      witnessHash,
    );
  }
  const grantId = deriveGrantId(
    spaceId,
    fixture.auditor,
    fixture.disclosure.fromSequence,
    fixture.disclosure.toSequence,
  );
  const publicEvidence = {
    _notice:
      "PUBLIC EVIDENCE ONLY. No raw payload, provenance, locator, salt, or witness hash belongs in this file or in calldata.",
    schema: PUBLIC_SCHEMA,
    scenarioId: fixture.scenarioId,
    onChain: {
      space: {
        spaceId,
        controller: fixture.space.controller,
        authorizer: fixture.space.authorizer,
        spaceSalt: fixture.space.spaceSalt,
      },
      transitions: records.map((record) =>
        publicTransition(record, fixture.space.authorizer)
      ),
      head: {
        transitionId: records.at(-1).transitionId,
        stateRoot: records.at(-1).nextStateRoot,
        sequence: records.at(-1).delta.sequence.toString(10),
      },
      auditGrant: {
        grantId,
        auditor: fixture.auditor,
        fromSequence: fixture.disclosure.fromSequence,
        toSequence: fixture.disclosure.toSequence,
        witnessSetRoot,
      },
    },
    disclosurePolicy: {
      disclosedSequences: fixture.disclosure.sequences,
      undisclosedSequences: records
        .map((record) => record.delta.sequence.toString(10))
        .filter((sequence) => !selected.has(sequence)),
    },
  };
  return { disclosure, publicEvidence };
}

function verifyAuditorDisclosure(disclosure, publicEvidence) {
  assert(disclosure.schema === DISCLOSURE_SCHEMA, "unsupported disclosure schema");
  const publicBySequence = new Map(
    publicEvidence.onChain.transitions.map((transition) => [transition.sequence, transition]),
  );
  let witnessSetRoot = ZERO32;
  for (const item of disclosure.items) {
    const transition = publicBySequence.get(item.witness.sequence);
    assert(transition !== undefined, "disclosed transition is not public");
    assert(
      stableStringify(item.witness.payload) === item.encoded.payloadUtf8,
      "payload encoding mismatch",
    );
    assert(
      stableStringify(item.witness.provenance) === item.encoded.provenanceUtf8,
      "provenance encoding mismatch",
    );
    assert(
      stableStringify(item.witness) === item.encoded.witnessUtf8,
      "witness encoding mismatch",
    );
    assert(
      computePrivateCommitment(
        utf8ToBytes(item.encoded.payloadUtf8),
        item.witness.deltaSalt,
        item.witness.profileId,
      ) === transition.deltaCommitment,
      "disclosed payload does not open deltaCommitment",
    );
    assert(
      computeProvenanceCommitment(
        utf8ToBytes(item.encoded.provenanceUtf8),
        item.witness.provenanceSalt,
      ) === transition.provenanceCommitment,
      "disclosed provenance does not open provenanceCommitment",
    );
    assert(
      computeLocatorCommitment(item.witness.locator, item.witness.locatorSalt) ===
        transition.locatorCommitment,
      "disclosed locator does not open locatorCommitment",
    );
    const transitionId = computeTransitionId({
      ...transition,
      sequence: BigInt(transition.sequence),
    });
    assert(transitionId === transition.transitionId, "transitionId mismatch");
    assert(
      computeNextStateRoot(transition.prevStateRoot, transitionId) ===
        transition.nextStateRoot,
      "nextStateRoot mismatch",
    );
    const witnessHash = keccak256(utf8ToBytes(item.encoded.witnessUtf8));
    witnessSetRoot = foldWitnessRoot(witnessSetRoot, transitionId, witnessHash);

    const tamperedPayload = item.encoded.payloadUtf8 + " ";
    assert(
      computePrivateCommitment(
        utf8ToBytes(tamperedPayload),
        item.witness.deltaSalt,
        item.witness.profileId,
      ) !== transition.deltaCommitment,
      "tampered payload unexpectedly opened the commitment",
    );
  }
  assert(
    witnessSetRoot === publicEvidence.onChain.auditGrant.witnessSetRoot,
    "disclosure does not match witnessSetRoot",
  );
  assert(
    deriveGrantId(
      publicEvidence.onChain.space.spaceId,
      publicEvidence.onChain.auditGrant.auditor,
      disclosure.range.fromSequence,
      disclosure.range.toSequence,
    ) === publicEvidence.onChain.auditGrant.grantId,
    "grantId mismatch",
  );
}

function verifyBoundaries(fixture, disclosure, publicEvidence) {
  const publicText = JSON.stringify(publicEvidence);
  for (const marker of fixture.boundaryAssertions.neverPublic) {
    assert(!publicText.includes(marker), `private marker leaked into public evidence: ${marker}`);
  }
  for (const field of [
    "deltaSalt",
    "provenanceSalt",
    "locatorSalt",
    "payloadUtf8",
    "provenanceUtf8",
    "witnessUtf8",
    "witnessHash",
  ]) {
    assert(!publicText.includes(field), `private field leaked into public evidence: ${field}`);
  }

  const disclosureText = JSON.stringify(disclosure);
  for (const marker of fixture.boundaryAssertions.notDisclosedToAuditor) {
    assert(
      !disclosureText.includes(marker),
      `sequence 1 marker leaked into selective disclosure: ${marker}`,
    );
  }
  assert(disclosure.items.length === 1, "auditor must receive exactly one witness");
  assert(disclosure.items[0].witness.sequence === "2", "auditor received wrong sequence");
}

const fixture = readJson(privatePath);
const generated = buildEvidence(fixture);
if (process.argv.includes("--write")) {
  mkdirSync(vectorDirectory, { recursive: true });
  writeFileSync(disclosurePath, jsonBytes(generated.disclosure));
  writeFileSync(publicPath, jsonBytes(generated.publicEvidence));
}

assertExactFile(disclosurePath, generated.disclosure);
assertExactFile(publicPath, generated.publicEvidence);
const disclosure = readJson(disclosurePath);
const publicEvidence = readJson(publicPath);
verifyAuditorDisclosure(disclosure, publicEvidence);
verifyBoundaries(fixture, disclosure, publicEvidence);

console.log("Private-witness TOOL_TRACE demo: PASS");
console.log(`Space: ${publicEvidence.onChain.space.spaceId}`);
console.log(`Authorized transitions: ${publicEvidence.onChain.head.sequence}`);
console.log("Auditor disclosure: sequence 2 only (range [2,2])");
console.log(`Audit witnessSetRoot: ${publicEvidence.onChain.auditGrant.witnessSetRoot}`);
console.log("Verified: payload/provenance/locator openings, transition, state root, grant root");
console.log("Not proved: tool execution truth, undisclosed sequence 1, availability, or deletion");
