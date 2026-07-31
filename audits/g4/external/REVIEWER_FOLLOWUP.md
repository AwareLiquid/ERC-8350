# Reviewer Follow-up: ERC-8350 G4-rc1

Subject: Required corrections and evidence for the ERC-8350 G4 review

Thank you for reviewing the ERC-8350 G4 release candidate and for addressing the
priority authorization, replay, wallet, and extension questions. We have recorded
your email as a provisional review. Before we can accept it as the independent
G4 security artifact, please publish a corrected final report and evidence record.

## Scope and API confirmation

Please confirm that you reviewed the exact commit
`af5a75fb2db532fd5603554083d8895a825c2de2`, all ten files listed in
`audits/g4/scope.json`, scope SHA-256
`c9db7d27957c86386d8842687a2d009c0ca03bc864307e88cfed0ee25f3ae9bf`,
and residual-risk SHA-256
`307a52eb0bf512aea25565bf604d92fc6b1b2d64eb910595568a5f0c04aa6019`.

The email refers to APIs that are absent from that commit. Please replace
`grantAudit`, `acknowledgeAudit`, `revokeAudit`, and `getSpaceInfo` with the
actual `grant`, `acknowledge`, `revoke`, `spaceAuthorization`, `head`, and
`transition` interfaces, or explain which source was reviewed.

## Finding corrections

- `LOW-1`: please scope the ECDSA fallback statement to EIP-7702-delegated EOAs.
  An ordinary independently deployed contract account does not normally have a
  known EOA private key for its address. ERC-8350 intentionally treats delegate
  approval and underlying-key ECDSA as alternative authorization paths; delegate
  rejection is not an authoritative denial.
- `LOW-2`: `_requireAuthorization` performs the ERC-1271 call before writes, but
  it uses `STATICCALL`. Static context propagates through callback calls, so a
  callback cannot execute Registry `SSTORE`. Direct-call and ECDSA paths call no
  untrusted code. Please reclassify this as defense-in-depth/Informational or
  provide a concrete exploitable trace. We added focused regression tests without
  changing the frozen source.
- `INFO-1`: invalid `v` is rejected by `ECDSA.recover` as
  `ECDSA.InvalidSignature`; it is not converted to Registry
  `InvalidAuthorization`. Please correct the control-flow description.
- `INFO-2`: strict `sequence == current + 1` registration means every sequence
  from 1 through the current head exists. Please remove the continuity concern or
  explain a reachable gap.

## Publication package

Please provide:

1. Reviewer name, organization/independent status, GitHub owner, independence,
   compensation, prior-work, and conflict disclosure.
2. A public report in a reviewer-controlled repository, with stable URL, exact
   bytes, SHA-256, and ISO-8601 publication time.
3. Manual-review method, tool versions, and commands executed.
4. Stable IDs, severity, status, rationale, and verification for every finding.
5. A full-commit attestation using the statement in
   `external-review.template.json`.
6. A completed `external-review.json`, including all reviewed residual-risk IDs.

Once these points are corrected, we can run the evidence gate, complete
maintainer review of independence and report quality, and determine whether G4
can be marked security-ready.
