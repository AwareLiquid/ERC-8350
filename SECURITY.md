# Security Policy

The contracts and packages are pre-release research software and have not been
declared production ready. Do not use them to custody value or publicize private
memory without an independent review of the exact deployed commit.

## G4 security-ready candidate

The `G4-rc1` Solidity target is frozen at
`af5a75fb2db532fd5603554083d8895a825c2de2`. Its scope, internal review, and
remaining risks are recorded under [`audits/g4/`](audits/g4/).

Current status: **provisional review received; corrections and publication
evidence pending; G4 not complete**.

- `pnpm security:scope` verifies the source commit, tree, compiler settings,
  per-file hashes, full scope, and residual-risk register.
- `pnpm security:test` exercises forged self-review, weakened scope, path
  traversal, digest mismatch, missing risk mapping, and unresolved High findings.
- `pnpm security:rc` additionally requires a qualifying independent report and
  fails until that report is accepted.
- `contracts/src/experimental/MemoryMarket.sol` is outside G4 and must not inherit
  any security-ready label from the core review.

### EIP-7702 authorization warning

Registry authorization is an ordered OR rule: a direct call by the signer, then
ERC-1271 approval, then canonical ECDSA recovery. For an EIP-7702-delegated EOA,
a delegate that rejects, reverts, pauses, or returns malformed ERC-1271 data does
not veto a valid signature from the EOA's underlying key. This residual ECDSA path
is an explicit protocol rule, not an ERC-1271 policy-enforcement guarantee.

Use an independently deployed contract-account controller or authorizer when an
ERC-1271 policy must be the exclusive authorization path. Do not use a delegated
EOA for that requirement. This condition is tracked as `G4-R-003`.

The earlier Sepolia `AuditGrant` deployment predates the cross-Space authorization
fix and is deprecated. See
[`docs/security/residual-risks.md`](docs/security/residual-risks.md).

Report vulnerabilities privately through the repository's GitHub Security
Advisory feature. Include affected versions, impact, reproduction steps, and a
minimal test when possible. Do not put secrets, user memory, salts, keys, or
unredacted private witnesses in an issue.

The maintainers should acknowledge a complete report within seven days, agree on
a disclosure timeline, and publish a regression test with the fix. There is no
bug bounty unless a separate program explicitly says otherwise.
