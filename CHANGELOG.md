# Changelog

All notable implementation and protocol changes are recorded here.

## Unreleased

### Added

- Clean-checkout conformance gate with separate Solidity, core TypeScript, and
  dependency-isolated TypeScript Golden Vector suites. Each run records the
  source commit/tree, vector SHA-256, tool versions, canonical outputs, suite
  results, and logs as JSON and Markdown.
- R-002 independent reproduction evidence: a machine-readable manifest, isolated
  clean-checkout runner, scheduled GitHub Actions workflow, and recorded results
  for two externally maintained, commit-pinned implementations.
- Whitepaper as a narrative companion to the ERC, following the Ethereum
  whitepaper structure (state transition systems → memory as state → protocol →
  applications → concerns → conclusion) and closing with an Open Questions
  section for the Ethereum Magicians discussion:
  `docs/whitepaper.md` (English), `docs/whitepaper.zh.md` (Chinese), plus
  `docs/whitepaper.pdf` and single-file `docs/whitepaper.html` renderings.
- ADR-0005: three metadata layers (Core / Disclosure / private witness) and the
  auditability model. Core is unchanged; disclosure is opt-in per Space.
- `SpaceDescriptor` extension: optional controller-published description of what a
  Space is, including the profile vocabulary needed to interpret its `profileId`.
- `AuditGrant` extension: binds a selective disclosure to the complete ordered witness
  set for a sequence range, so a cherry-picked or incomplete disclosure no longer folds
  to the committed root. Exposes `foldWitnessRoot` for off-chain parity.

### Changed

- **Breaking (extension):** `DeletionAttestation.attest` now takes
  `bytes32 evidenceCommitment` instead of `bytes calldata evidence`. Callers must hash
  off chain and retain the preimage as a private witness.
- `profileId` is documented as a public, non-confidential field rather than treated as
  incidentally leaky. Applications needing kind-secrecy should allocate an opaque
  per-Space profile identifier instead of a shared vocabulary entry.

### Fixed

- `DeletionAttestation` no longer publishes raw deletion evidence in transaction
  calldata, which contradicted architecture invariant 9 and the rule against exposing
  raw private payloads through a public wrapper.
- **EIP-7702 accounts can now authorize.** Authorization previously branched on
  `signer.code.length`, routing every 7702-delegated EOA into ERC-1271 validation. Since
  a delegated account carries `0xef0100 || delegate` code and many delegates implement no
  signature policy, those users were locked out entirely after Pectra. Validation now
  tries ERC-1271 first (so a delegate that does implement a policy still enforces it) and
  falls back to canonical ECDSA. The spec now defines this ordering explicitly instead of
  leaving the EOA/contract distinction unspecified.

## 1.0.0-alpha.1 - 2026-07-14

### Added

- Canonical seven-field `ExperienceDelta v1` and EIP-712 Transition ID.
- Linear `prevStateRoot -> Delta -> nextStateRoot` state machine.
- Controller-derived Space IDs and controller/authorizer rotation.
- EOA and EIP-1271 authorization with relayer-safe locator commitments.
- Domain-separated salted private commitments and private witnesses.
- Core, Extension, Experimental, Adapter, and Implementation boundaries.
- Shared Solidity/TypeScript golden vectors and invariant tests.
- Awareness adapter and a dependency-isolated second TypeScript implementation.
- Reproducible pnpm workspace, CI, release artifacts, and rewritten ERC draft.

### Removed

- JCS-based alternate Delta IDs, raw URI calldata, speculative `83xx` naming,
  product taxonomies in Core, and unsigned Space takeover paths.
