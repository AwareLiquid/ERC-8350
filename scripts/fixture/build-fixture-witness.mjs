#!/usr/bin/env node
// Builds the public fixture-Space witness bundle for the external conformance checker
// (babyblueviper1/preaction-governance-conformance), plus the Solidity constants the
// on-chain fixture script commits.
//
// EVERYTHING here is deliberately reproducible from public seeds: salts, the synthetic
// verifier keys, and timestamps are all derived from fixed strings. That is the exact
// opposite of production discipline (real salts must be secret and random; real
// verifier keys must be custodied) and is safe ONLY because this Space carries
// synthetic fixture data whose witnesses are published on purpose.
//
// Commitment math is imported from @erc-awar/core — the same code every conforming
// implementation runs — never reimplemented here.

import {mkdirSync, writeFileSync, readFileSync} from "node:fs";
import {sha256} from "@noble/hashes/sha2.js";
import {schnorr} from "@noble/curves/secp256k1.js";
import {bytesToHex, utf8ToBytes} from "@noble/hashes/utils.js";
import {
  computeTransitionId,
  computeNextStateRoot,
  computePrivateCommitment,
  computeProvenanceCommitment,
  computeLocatorCommitment,
  keccak256,
  keccak256Utf8,
} from "../../packages/core/dist/index.js";

// ---------------------------------------------------------------------------
// Fixed identity of the fixture Space (Sepolia deployer = controller = authorizer)
const CONTROLLER = "0x3d0ab53241A2913D7939ae02f7083169fE7b823B";
const SPACE_SALT = keccak256Utf8("erc-8337-fixture-space-v1");
const REGISTRY_SEPOLIA = "0xDdf21937ba80b5fF973610877A0955b320C91241";

// Self-check: typehash must equal the published golden value before anything else.
const MEMORY_SPACE_TYPEHASH = keccak256Utf8(
  "MemorySpace(address initialController,bytes32 salt)",
);
const GOLDEN_SPACE_TYPEHASH =
  "0x9ae5478f084ad3b841da58a9cb2354d153cddec59ee64d0cb741fa9d08884531";
if (MEMORY_SPACE_TYPEHASH !== GOLDEN_SPACE_TYPEHASH) {
  throw new Error("MemorySpace typehash drifted from the golden vector — abort");
}

function hexToBytesStrict(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function concat(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
// abi.encode(bytes32, address, bytes32): address left-padded to 32 bytes.
function deriveSpaceId(controller, salt) {
  const pad12 = new Uint8Array(12);
  return keccak256(
    concat(
      hexToBytesStrict(MEMORY_SPACE_TYPEHASH),
      pad12,
      hexToBytesStrict(controller),
      hexToBytesStrict(salt),
    ),
  );
}
const SPACE_ID = deriveSpaceId(CONTROLLER, SPACE_SALT);

// ---------------------------------------------------------------------------
// JCS (RFC 8785) for the subset used here: objects with string/integer/null
// values, arrays, nested one level. Sorted keys, no whitespace, standard JSON
// escapes.
//
// `null` is not decoration: WYRIWE's decision_ref preimage rule requires an
// inapplicable field (e.g. vantage_limitation) to be present as JSON null rather
// than omitted, so a serializer that cannot emit null cannot reproduce a real
// decision_ref at all. Booleans and non-integer numbers stay unsupported on
// purpose — nothing in this fixture commits them, and silently accepting a float
// would hide the one JCS rule (ES6 number serialization) this subset does not
// implement.
function jcs(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" + keys.map((k) => JSON.stringify(k) + ":" + jcs(value[k])).join(",") + "}"
    );
  }
  if (typeof value === "string" || typeof value === "number") {
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error("jcs subset: only integers supported");
    }
    return JSON.stringify(value);
  }
  throw new Error("jcs subset: unsupported type " + typeof value);
}

// ---------------------------------------------------------------------------
// Synthetic verifiers. Keys derive from PUBLIC seeds: anyone can re-sign these
// events, which is exactly right for a fixture — a valid signature from these keys
// carries zero authority and must never be treated as a real WYRIWE verdict.
function verifierFromSeed(seed) {
  const priv = sha256(utf8ToBytes(seed)); // valid secp256k1 scalar w.o.p.
  const pub = bytesToHex(schnorr.getPublicKey(priv)); // 32-byte x-only
  return {priv, pub};
}
const VERIFIER_A = verifierFromSeed("erc-8337-fixture-verifier-A-v1-NO-AUTHORITY");
const VERIFIER_B = verifierFromSeed("erc-8337-fixture-verifier-B-v1-NO-AUTHORITY");

// decision_ref = sha256(JCS({artifact_hash, artifact_type, policy_version, verdict,
// source_class, vantage_limitation})) — field list byte-matched to WYRIWE's
// DECISION_REF_PREIMAGE_FIELDS as confirmed on the Magicians thread.
function makeVerdict({artifactLabel, verdict, sourceClass, vantage}) {
  return {
    artifact_hash: keccak256Utf8("fixture-artifact:" + artifactLabel),
    artifact_type: "fixture/synthetic",
    policy_version: "l4-v0",
    verdict,
    source_class: sourceClass,
    vantage_limitation: vantage,
  };
}
function decisionRef(verdictObj) {
  return "0x" + bytesToHex(sha256(utf8ToBytes(jcs(verdictObj))));
}

// NIP-01 event id over [0, pubkey, created_at, kind, tags, content]; BIP-340 sig.
const KIND = 30078;
function makeEvent(verifier, verdictObj, createdAt, dTag) {
  const content = jcs(verdictObj);
  const tags = [["d", dTag]];
  const serial = JSON.stringify([0, verifier.pub, createdAt, KIND, tags, content]);
  const idBytes = sha256(utf8ToBytes(serial));
  const id = bytesToHex(idBytes);
  const sig = bytesToHex(schnorr.sign(idBytes, verifier.priv));
  return {
    event: {id, pubkey: verifier.pub, created_at: createdAt, kind: KIND, tags, content, sig},
  };
}

// Canonical attestation entry — verify_url is deliberately NOT a field here; it
// travels only as advisory metadata beside the witness (§4 of the interop note).
function canonicalEntry(decision_ref, ev) {
  return {
    scheme: "wyriwe/l4-v0",
    decision_ref,
    event_id: ev.event.id,
    pubkey: ev.event.pubkey,
  };
}
// §3 rules: sort by decision_ref (bytewise on the lowercase hex), dedupe by
// (event_id, pubkey).
function canonicalizeRefSet(entries) {
  const seen = new Set();
  const deduped = [];
  for (const e of entries) {
    const key = e.event_id + "|" + e.pubkey;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  deduped.sort((a, b) => (a.decision_ref < b.decision_ref ? -1 : 1));
  return deduped;
}
function provenanceBytesFor(canonicalSet) {
  return utf8ToBytes(jcs({attestation_refs: canonicalSet}));
}

// ---------------------------------------------------------------------------
// Verdicts and events (fixed created_at values — reproducibility, never Date.now).
const T0 = 1753488000; // 2026-07-26 00:00:00 UTC
const v1 = makeVerdict({artifactLabel: "text-note-1", verdict: "approve", sourceClass: "primary", vantage: "none"});
const v2 = makeVerdict({artifactLabel: "tool-trace-1", verdict: "approve", sourceClass: "primary", vantage: "none"});
const v3 = makeVerdict({artifactLabel: "tool-trace-1", verdict: "approve_with_notes", sourceClass: "secondary", vantage: "single-run"});
const v4 = makeVerdict({artifactLabel: "episodic-2", verdict: "approve", sourceClass: "primary", vantage: "none"});

const e1 = makeEvent(VERIFIER_A, v1, T0 + 100, "fixture-1");
const e2 = makeEvent(VERIFIER_A, v2, T0 + 200, "fixture-2");
const e3 = makeEvent(VERIFIER_B, v3, T0 + 300, "fixture-3");
const e4 = makeEvent(VERIFIER_B, v4, T0 + 400, "fixture-4");

// ---------------------------------------------------------------------------
// Transition 5 is different in kind from 1–4: its attestation is NOT synthesized
// here. It is an externally contributed, really-signed verdict from WYRIWE /
// invinoveritas (PR #5, ethereum-magicians.org/t/29098), loaded verbatim and
// verified rather than derived. Its signing key is a live operator key that is
// deliberately absent from test-vectors/fixture-keys-v1.json — so under the
// fixture's own published policy the entry is "structurally valid, zero
// authority", while a consumer that trusts invinoveritas resolves the identical
// bytes to "valid and authorized". That is §6's three-valued outcome exercised
// on real data instead of a hypothetical.
const external5 = JSON.parse(
  readFileSync("test-vectors/attestation-refs/sequence-5-pending.json", "utf8"),
);
const e5 = {event: external5.raw_proof_event};
const v5 = JSON.parse(e5.event.content);
const r5 = external5.attestation_refs_canonical_entry;

// Verify the contributed entry before it can influence any committed byte.
{
  const serial = JSON.stringify([
    0, e5.event.pubkey, e5.event.created_at, e5.event.kind, e5.event.tags, e5.event.content,
  ]);
  const recomputedId = bytesToHex(sha256(utf8ToBytes(serial)));
  if (recomputedId !== e5.event.id) {
    throw new Error(`external event id drift: ${recomputedId} != ${e5.event.id}`);
  }
  // decision_ref over the six-field preimage; absent fields are present as null,
  // never omitted (the rule WYRIWE pinned in writing — load-bearing, not cosmetic).
  const preimage = {
    artifact_hash: v5.artifact_hash,
    artifact_type: v5.artifact_type,
    policy_version: v5.policy_version,
    verdict: v5.verdict,
    source_class: v5.source_class,
    vantage_limitation: v5.vantage_limitation ?? null,
  };
  const recomputedRef = "0x" + bytesToHex(sha256(utf8ToBytes(jcs(preimage))));
  if (recomputedRef !== r5.decision_ref) {
    throw new Error(`external decision_ref drift: ${recomputedRef} != ${r5.decision_ref}`);
  }
  // §2 normalization: 0x-prefixed lowercase hex is canonical inside a ref set;
  // the scheme prefix the producer uses in its own systems is presentation only.
  if (v5.decision_ref.replace(/^sha256:/, "0x") !== r5.decision_ref) {
    throw new Error("external decision_ref is not the 0x-normalized form of the event's own");
  }
  if (r5.event_id !== e5.event.id || r5.pubkey !== e5.event.pubkey) {
    throw new Error("external entry identity does not match its raw event");
  }
  if (VERIFIER_A.pub === e5.event.pubkey || VERIFIER_B.pub === e5.event.pubkey) {
    throw new Error("external key collides with a zero-authority fixture key");
  }
}

const r1 = canonicalEntry(decisionRef(v1), e1);
const r2 = canonicalEntry(decisionRef(v2), e2);
const r3 = canonicalEntry(decisionRef(v3), e3);
const r4 = canonicalEntry(decisionRef(v4), e4);

// ---------------------------------------------------------------------------
// Profiles: adapter-vocabulary URIs (public, unsalted — documented as such).
const PROFILE_BASE = "https://awareness.market/profiles/memory";
const profileId = (name) => keccak256Utf8(`${PROFILE_BASE}/${name}/v1`);
const P_EPISODIC = profileId("episodic");
const P_TEXT = profileId("text");
const P_TOOL_TRACE = profileId("tool-trace");

// Deterministic salts (PUBLIC — fixture only; production salts must be secret).
const salt = (label) => keccak256Utf8("erc-8337-fixture-salt:" + label);

// ---------------------------------------------------------------------------
// Four transitions covering every checker path.
const ZERO32 = "0x" + "00".repeat(32);

function buildTransition({seq, prevRoot, profile, payloadObj, rawEntries, locator}) {
  const payload = utf8ToBytes(jcs(payloadObj));
  const deltaSalt = salt(`delta-${seq}`);
  const deltaCommitment = computePrivateCommitment(payload, deltaSalt, profile);

  let provenance = null;
  let provenanceCommitment = ZERO32;
  let provenanceSalt = null;
  let canonicalSet = null;
  if (rawEntries && rawEntries.length) {
    canonicalSet = canonicalizeRefSet(rawEntries);
    provenance = provenanceBytesFor(canonicalSet);
    provenanceSalt = salt(`provenance-${seq}`);
    provenanceCommitment = computeProvenanceCommitment(provenance, provenanceSalt);
  }

  let locatorCommitment = ZERO32;
  let locatorSalt = null;
  if (locator) {
    locatorSalt = salt(`locator-${seq}`);
    locatorCommitment = computeLocatorCommitment(locator, locatorSalt);
  }

  const delta = {
    spaceId: SPACE_ID,
    sequence: BigInt(seq),
    prevStateRoot: prevRoot,
    deltaCommitment,
    provenanceCommitment,
    profileId: profile,
    locatorCommitment,
  };
  const transitionId = computeTransitionId(delta);
  const nextStateRoot = computeNextStateRoot(prevRoot, transitionId);

  return {
    delta,
    transitionId,
    nextStateRoot,
    witness: {
      payload_jcs: jcs(payloadObj),
      delta_salt: deltaSalt,
      provenance_bytes_utf8: provenance ? new TextDecoder().decode(provenance) : null,
      provenance_salt: provenanceSalt,
      attestation_refs_canonical: canonicalSet,
      attestation_refs_raw_input: rawEntries ?? null,
      locator: locator ?? null,
      locator_salt: locatorSalt,
    },
  };
}

const t1 = buildTransition({
  seq: 1,
  prevRoot: ZERO32,
  profile: P_EPISODIC,
  payloadObj: {op: "upsert", resourceId: "fixture/episodic-1", observedAt: T0, content: {event: "fixture space created", cardKind: "memory"}},
  rawEntries: null, // absent-provenance case: provenanceCommitment must be zero
});
const t2 = buildTransition({
  seq: 2,
  prevRoot: t1.nextStateRoot,
  profile: P_TEXT,
  payloadObj: {op: "upsert", resourceId: "fixture/text-1", observedAt: T0 + 100, content: {text: "single attestation reference", cardKind: "insight"}},
  rawEntries: [r1], // single-ref case
});
const t3 = buildTransition({
  seq: 3,
  prevRoot: t2.nextStateRoot,
  profile: P_TOOL_TRACE,
  // Raw input deliberately UNSORTED and containing a DUPLICATE of r2: the checker
  // must observe that the committed canonical set is sorted by decision_ref and
  // deduplicated by (event_id, pubkey).
  rawEntries: [r3, r2, r2],
  payloadObj: {op: "upsert", resourceId: "fixture/trace-1", observedAt: T0 + 200, content: {trace: "two verifiers, one duplicate dropped", cardKind: "workflow"}},
});
const t4 = buildTransition({
  seq: 4,
  prevRoot: t3.nextStateRoot,
  profile: P_EPISODIC,
  payloadObj: {op: "upsert", resourceId: "fixture/episodic-2", observedAt: T0 + 300, content: {event: "ref and locator together", cardKind: "memory"}},
  rawEntries: [r4],
  locator: "awareness://fixture/episodic-2", // locator + provenance both present
});

// External attestation from a live authority-bearing key (see the block above).
const t5 = buildTransition({
  seq: 5,
  prevRoot: t4.nextStateRoot,
  profile: P_EPISODIC,
  payloadObj: {
    op: "upsert",
    resourceId: "fixture/episodic-3",
    observedAt: T0 + 400,
    content: {
      event: "external attestation accepted from a key outside the fixture policy",
      cardKind: "memory",
    },
  },
  rawEntries: [r5],
});

const transitions = [t1, t2, t3, t4, t5];

// Self-checks before writing anything.
if (t3.witness.attestation_refs_canonical.length !== 2) {
  throw new Error("t3 dedup failed: expected 2 canonical entries");
}
const sorted = [...t3.witness.attestation_refs_canonical].every(
  (e, i, a) => i === 0 || a[i - 1].decision_ref <= e.decision_ref,
);
if (!sorted) throw new Error("t3 canonical set is not sorted by decision_ref");
for (const t of transitions) {
  if (!schnorr) throw new Error("unreachable");
}
// Verify every event signature round-trips — including the contributed one, whose
// signature is checked here against the same BIP-340 path as the synthetic keys.
for (const ev of [e1, e2, e3, e4, e5]) {
  const ok = schnorr.verify(
    hexToBytesStrict(ev.event.sig),
    hexToBytesStrict(ev.event.id),
    hexToBytesStrict(ev.event.pubkey),
  );
  if (!ok) throw new Error("event signature failed self-verification");
}

// ---------------------------------------------------------------------------
// Outputs.
const bundle = {
  _warning:
    "SYNTHETIC FIXTURE. Witnesses, salts, and verifier keys are deliberately public " +
    "and derived from published seeds. Nothing here is real memory and these " +
    "signatures carry no authority. Production systems keep witnesses private and " +
    "salts secret.",
  network: {chainId: 11155111, registry: REGISTRY_SEPOLIA},
  space: {spaceId: SPACE_ID, controller: CONTROLLER, salt: SPACE_SALT, saltSeed: "erc-8337-fixture-space-v1"},
  verifiers: {
    A: {pubkey: VERIFIER_A.pub, seed: "erc-8337-fixture-verifier-A-v1-NO-AUTHORITY"},
    B: {pubkey: VERIFIER_B.pub, seed: "erc-8337-fixture-verifier-B-v1-NO-AUTHORITY"},
  },
  external_verifiers: {
    _note:
      "Live operator key, NOT a fixture key: no published seed, deliberately absent " +
      "from test-vectors/fixture-keys-v1.json. Sequence 5 exists so a checker can " +
      "observe the same bytes classify as zero-authority under the fixture policy and " +
      "as authorized under a policy that trusts this operator (interop note §6).",
    invinoveritas: {
      pubkey: e5.event.pubkey,
      scheme: r5.scheme,
      contributed_in: "AwareLiquid/ERC-8350#5",
      key_list: "https://api.babyblueviper.com/.well-known/verifier-keys.json",
    },
  },
  advisory_verify_urls: {
    [e1.event.id]: "https://api.babyblueviper.com/verify-proof",
    [e2.event.id]: "https://api.babyblueviper.com/verify-proof",
    [e3.event.id]: "https://api.babyblueviper.com/verify-proof",
    [e4.event.id]: "https://api.babyblueviper.com/verify-proof",
    [e5.event.id]: "https://api.babyblueviper.com/verify-proof",
  },
  events: [e1.event, e2.event, e3.event, e4.event, e5.event],
  verdicts: [v1, v2, v3, v4, v5],
  transitions: transitions.map((t) => ({
    delta: {...t.delta, sequence: Number(t.delta.sequence)},
    transitionId: t.transitionId,
    nextStateRoot: t.nextStateRoot,
    witness: t.witness,
  })),
};

mkdirSync("test-vectors", {recursive: true});
writeFileSync("test-vectors/sepolia-fixture-v1.json", JSON.stringify(bundle, null, 2));

// Solidity constants for the on-chain commit script.
const sol = `// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// GENERATED by scripts/fixture/build-fixture-witness.mjs — do not edit by hand.
// Witness bundle: test-vectors/sepolia-fixture-v1.json
library FixtureData {
    bytes32 internal constant SPACE_SALT = ${SPACE_SALT};
    address internal constant CONTROLLER = ${CONTROLLER};
    bytes32 internal constant SPACE_ID = ${SPACE_ID};

${transitions
  .map(
    (t, i) => `    // transition ${i + 1}
    bytes32 internal constant DELTA_COMMITMENT_${i + 1} = ${t.delta.deltaCommitment};
    bytes32 internal constant PROVENANCE_COMMITMENT_${i + 1} = ${t.delta.provenanceCommitment};
    bytes32 internal constant PROFILE_ID_${i + 1} = ${t.delta.profileId};
    bytes32 internal constant LOCATOR_COMMITMENT_${i + 1} = ${t.delta.locatorCommitment};
    bytes32 internal constant EXPECTED_TRANSITION_ID_${i + 1} = ${t.transitionId};
    bytes32 internal constant EXPECTED_NEXT_ROOT_${i + 1} = ${t.nextStateRoot};`,
  )
  .join("\n\n")}
}
`;
writeFileSync("contracts/script/FixtureData.sol", sol);

console.log("spaceId:        ", SPACE_ID);
console.log("verifier A pub: ", VERIFIER_A.pub);
console.log("verifier B pub: ", VERIFIER_B.pub);
transitions.forEach((t, i) =>
  console.log(`t${i + 1} transitionId:`, t.transitionId),
);
console.log("final stateRoot:", transitions[transitions.length - 1].nextStateRoot);
console.log("wrote test-vectors/sepolia-fixture-v1.json and contracts/script/FixtureData.sol");
