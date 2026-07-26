# Attestation References in Committed Payloads

**An informative interop note, jointly authored by the ERC-8337 (Agent Memory State) and
WYRIWE (ERC-8299) projects.** Neither specification depends on the other; this note
records the composition discipline both have agreed to, so that independent
implementations compose the two the same way.

- ERC-8337 discussion: https://ethereum-magicians.org/t/agent-memory-state/29098
- WYRIWE / attestation_ref discussion: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
- Companion conformance repository: `babyblueviper1/preaction-governance-conformance`

Status: **informative**. Nothing here modifies ERC-8337's normative core.

## 1. Placement — never an eighth field

External verdict references live **inside the committed payload**, carried by
`provenanceBytes` under `provenanceCommitment`:

```text
provenanceCommitment = keccak256(abi.encode(
  PROVENANCE_DOMAIN, provenanceSalt, keccak256(provenanceBytes)
))
```

Because `provenanceCommitment` sits inside the signed `ExperienceDelta`, a verdict
referenced this way is **causal input** — part of what the authorizer approved — rather
than a post-hoc annotation. The seven-field struct stays frozen; no `attestation_ref`
ever becomes a top-level field.

Post-hoc judgments remain possible outside the core: they reference a `transitionId`
from their own registry, with their own trust model, in the same pattern as the
deletion-attestation extension.

## 2. Entry schema

```jsonc
{
  "scheme": "wyriwe/l4-v0",
  "decision_ref": "0x…",   // sha256(JCS({artifact_hash, artifact_type, policy_version,
                            //   verdict, source_class, vantage_limitation}))
  "event_id": "…",          // the signed proof's own id (kind 30078 Nostr event);
                            //   its NIP-01 id is a hash of the canonical serialization,
                            //   so a verifier recomputes it rather than trusting it
  "pubkey": "…",            // the verifier's published key the signature checks against
  "verify_url": "https://…" // ADVISORY ONLY — see §4
}
```

An entry's **identity is `(event_id, pubkey)`**. `decision_ref` binds the entry to one
specific verdict, not a class of them; it is content-addressed, so an entry cannot be
re-pointed at a different verdict without its hash changing.

## 3. Set semantics — a list treated as an unordered set

`provenanceBytes` MAY carry multiple references. To keep hashing deterministic without
inventing ordering semantics two specifications would have to agree on forever:

1. **Unordered set.** Consumers must not read meaning into position. If recency ever
   matters, it belongs inside the referenced verdict, not in array order.
2. **Canonical serialization** is JCS (RFC 8785) of the array of canonical entries,
   **sorted by `decision_ref`** (bytewise, over the lowercase hex string).
3. **Deduplicated** by entry identity `(event_id, pubkey)`; exact duplicates are dropped
   before serialization.

## 4. `verify_url` is advisory, and is excluded from every hash

The endpoint is where a verifier *happens to go check*; it is never part of *what is
being verified*. This discipline already holds one layer down — `decision_ref` never
included `verify_url` — and this note applies it one level up: the **canonical entry**
used for the container hash is

```text
JCS({scheme, decision_ref, event_id, pubkey})     // verify_url omitted
```

so an operator can rotate or retire an endpoint without changing any committed hash.
Verification requires only the public key: recompute `event_id` from the canonical
event serialization, check the signature against `pubkey`, recompute `decision_ref`
from the disclosed verdict fields. No call back to any party, no trust in the presenter.

## 5. What this composition does and does not prove

Inherited from both sides' non-claims, stated once more because compositions are where
guarantees quietly inflate:

- A referenced verdict proves that a named verifier signed a specific judgment **before**
  the transition was authorized — not that the judgment is correct.
- The transition proves the authorizer approved a delta whose provenance bound that
  verdict — not that the underlying memory content is truthful or available.
- `verify_url` being reachable proves nothing; being unreachable proves nothing.

## Credits

Drafted jointly from the exchange between the ERC-8337 authors and @babyblueviper1
(WYRIWE / ERC-8299) on the threads linked above. Either project may cite this note;
neither takes a dependency on the other by doing so.
