# Attestation References in Committed Payloads

**An informative interop note, jointly authored by the ERC-8350 (Agent Memory State) and
WYRIWE (ERC-8299) projects.** Neither specification depends on the other; this note
records the composition discipline both have agreed to, so that independent
implementations compose the two the same way.

- ERC-8350 discussion: https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098
- WYRIWE / attestation_ref discussion: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
- Companion conformance repository: `babyblueviper1/preaction-governance-conformance`

Status: **informative**. Nothing here modifies ERC-8350's normative core.

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

## 6. Authority is a consumer policy, never an entry property

Two reference sets can be byte-identical in structure while differing entirely in what
they are worth: one signed by a fixture key derived from a published seed, the other by
a live verifier whose operator stands behind — and can revoke — its verdicts. A
consumer must be able to tell these apart even after this note composes into someone
else's stack. Three mechanisms were considered; the constraint that decides between
them is temporal:

> **Committed data is immutable; authority is temporal.** Keys rotate, leak, and get
> revoked. Anything written inside `provenanceBytes` is frozen at authorization time and
> can never be un-said. Authority membership therefore *cannot* live inside the
> committed entry — not as a matter of taste, but by construction.

Consequences:

- **No authority flag on entries.** A self-asserted `authority: true` inside the signed
  set is exactly the self-asserted metadata this protocol strips everywhere else; a
  synthetic key can claim it as easily as a real one, and a compromised key's flag can
  never be withdrawn.
- **No authority-classed registries.** Deciding which keys enter the "authoritative"
  namespace is a trust-root and governance problem, contradicting "the registry is
  trusted only to execute its published bytecode" — and it freezes an authority
  taxonomy the way the core refuses to freeze a memory taxonomy.
- **`scheme` names the shape, never the authority.** `"wyriwe/l4-v0"` tells a consumer
  *how to verify* an entry (preimage fields, event format, signature algorithm). It
  says nothing about whether the signing key deserves belief — fixture entries
  deliberately exercise this exact shape with keys that carry none.
- **Authority lives in the consumer's key policy.** A conforming consumer maintains an
  explicit, revocable mapping `scheme → trusted verifier pubkeys` (its trust store, in
  the TLS sense), sourced from each scheme operator's published key list. Any entry
  whose key is outside policy is reported as **structurally valid, zero authority** —
  a distinct outcome, never collapsed into either "valid" or "invalid".

A machine-readable instance of such a policy ships with the fixture:
[`test-vectors/fixture-keys-v1.json`](../../test-vectors/fixture-keys-v1.json) declares the two
synthetic verifier keys with `"authority": "none"` in-band, plus the seeds they derive
from — so a checker can pin the canonical zero-authority set programmatically rather
than transcribing it out of prose. It is one publisher’s policy fragment, never a
protocol-level authority list.

Conformance tooling should make the distinction visible: take trusted keys as input,
and emit three-valued results per entry — structurally invalid / structurally valid /
valid-and-authorized. The fixture Space's synthetic keys are published with their seeds
precisely so that checkers can pin them as the canonical "structurally valid, zero
authority" case.

## Credits

Drafted jointly from the exchange between the ERC-8350 authors and @babyblueviper1
(WYRIWE / ERC-8299) on the threads linked above. Either project may cite this note;
neither takes a dependency on the other by doing so.
