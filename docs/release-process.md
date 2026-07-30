# Release Process

Releases are implementation artifacts for community testing. They do not make
the draft an accepted ERC and do not imply that contracts are production ready.

## Versioning

- `1.0.0-alpha.x`: protocol details may still change after community review.
- `1.0.0-beta.x`: v1 encoding is frozen and at least one external implementation
  has passed the golden vectors.
- `1.0.0-rc.x`: editor feedback is incorporated, testnet deployments are public,
  and an external security review has no unresolved critical findings.
- `1.0.0`: the team declares the implementation stable. ERC status remains the
  status shown in the official ERC repository.

## Candidate checklist

1. Freeze the intended commit and update `CHANGELOG.md`.
2. Run `pnpm install --frozen-lockfile` in a fresh checkout.
3. Run `pnpm conformance:clean` and retain its JSON and Markdown records.
4. Run `pnpm release:check` and confirm zero dependency advisories.
5. Verify the clean-checkout record shows the Solidity and both TypeScript
   implementations matched the same `test-vectors/v1.json` SHA-256.
6. Review storage layout, ABI changes, threat model, and migration notes.
7. Run `pnpm security:rc`. For an RC this requires a report by an independent
   reviewer against the exact commit and scope digest, all findings dispositioned,
   every accepted finding mapped to the residual-risk register, and no unresolved
   Critical or High finding.
8. Manually verify reviewer identity, expertise, conflict disclosure, report
   quality, and the public attestation. Passing JSON validation alone is not an
   audit.
9. Create a signed `v*` tag. The release workflow builds package tarballs,
   contract sources, and SHA-256 checksums without publishing automatically.
10. Attach audit and testnet deployment references before labeling an artifact
   production ready.

Package publication and contract deployment require a separate human approval.
Never deploy by reusing development keys or unrevealed commitment salts.

## G4 evidence

The live status and completion procedure are in
[`audits/g4/README.md`](../audits/g4/README.md). `pnpm security:scope` is a
preparation check and may pass before an external audit. Only
`pnpm security:rc` is the full G4 gate, and `release:check` invokes it.

Any change to an in-scope Solidity file, `Deploy.s.sol`, or the pinned compiler
configuration invalidates the current report and requires a new frozen candidate.
