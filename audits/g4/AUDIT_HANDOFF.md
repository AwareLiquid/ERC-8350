# ERC-8350 G4 External Solidity Audit Handoff

Status: **scope and evidence package frozen; qualifying external report pending**

This page is the entry point for an independent review of the ERC-8350 G4 release
candidate. It separates three things that must not be conflated:

1. the exact Solidity source under review;
2. project-produced context and reproducible evidence; and
3. the reviewer-owned report and attestation still required to complete G4.

Project-produced material is preparation, not an external audit. The release gate
continues to fail until a qualifying reviewer publishes and attests a report.

## Cryptographic anchors

| Item | Frozen value |
|---|---|
| Repository | `https://github.com/AwareLiquid/ERC-8350` |
| Candidate | `G4-rc1` |
| Source tag | `audit/g4-rc1-source` |
| Source commit | `af5a75fb2db532fd5603554083d8895a825c2de2` |
| Source tree | `f8d66277123391ea54de3f53842256e17e2a497e` |
| Scope manifest | [`scope.json`](scope.json) |
| Scope SHA-256 | `c9db7d27957c86386d8842687a2d009c0ca03bc864307e88cfed0ee25f3ae9bf` |
| Residual-risk register | [`residual-risks.json`](residual-risks.json) |
| Risk SHA-256 | `307a52eb0bf512aea25565bf604d92fc6b1b2d64eb910595568a5f0c04aa6019` |
| Evidence revision | `31f4fbb3732652884dac8f66fcc7a3655113c969` |
| Evidence tree | `b9baf6f6b4337b72d79c5343f5d178a4dc80f589` |

The evidence revision is a descendant of the source commit and does not change any
in-scope file. It adds review preparation, tests, documentation, and release gates.
[`handoff-manifest.json`](handoff-manifest.json) pins every evidence file byte-for-byte.

## Review map

| Area | Primary material | What to establish |
|---|---|---|
| Registry | `contracts/src/reference/AgentMemoryStateRegistry.sol`, `IAgentMemoryState.sol`, `ECDSA.sol`, `IERC1271.sol` | Space registration and rotation cannot be taken over; transitions bind the correct Space, sequence, roots, commitments, Registry, and chain; every authorization path has the intended replay boundary |
| Commitment boundary | `PrivateCommitment.sol`, [`docs/threat-model.md`](../../docs/threat-model.md) | Raw memory, locator, salt, and witness material are not required on-chain; salted commitments do not overclaim truth, availability, or deletion |
| Formal extensions | `AuditGrant.sol`, `DeletionAttestation.sol`, `SpaceDescriptor.sol` | An extension cannot act on or emit authoritative-looking evidence for the wrong Space, transition, controller, grant, or auditor |
| Tests | Registry, authorization, extension, Golden Vector, and invariant suites listed in the manifest | Positive and negative paths are reproducible; the fixed cross-Space grant issue remains fixed; EOA, ERC-1271, malformed return, revert, and EIP-7702 fallback paths match the documented policy |
| Deployment | `contracts/script/Deploy.s.sol`, `contracts/foundry.toml`, [`docs/deployment.md`](../../docs/deployment.md) | Compiler settings and constructor wiring match the scope; experimental `MemoryMarket` is not deployed; legacy Sepolia addresses are not mistaken for the corrected G4 candidate |
| Risks | [`residual-risks.json`](residual-risks.json), [`docs/security/residual-risks.md`](../../docs/security/residual-risks.md) | Every accepted non-Critical/High finding is explicit, owned, and has controls, deployment requirements, and a review trigger |

`contracts/src/experimental/MemoryMarket.sol` is excluded. It transfers value, has
a separate trust model, and is not deployed by the scoped deployment script.

## Security boundary

The Registry proves that the configured authority approved an ordered commitment
transition. It does not prove that private memory is true, useful, retrievable,
conscious, legally owned, or deleted. Encryption profiles, witness distribution,
key custody, storage availability, and policy-specific proof systems remain outside
the G4 Solidity scope.

Reviewers should pay particular attention to:

- direct-call, ECDSA, ERC-1271, malformed-return, revert, and EIP-7702 fallback paths;
- EIP-712 domain, Registry, chain, Space, sequence, root, and config-nonce binding;
- calldata and event disclosure of commitments and metadata;
- the fixed `G4-INT-001` cross-Space `AuditGrant` issue;
- `G4-R-003`, which records the canonical EIP-7702-to-ECDSA fallback behavior; and
- deployment sentinels, casts, external calls, compiler settings, and extension
  constructor wiring.

## Reproduce the handoff

```bash
git clone https://github.com/AwareLiquid/ERC-8350.git
cd ERC-8350
git checkout security/g4-security-ready-rc
pnpm install --frozen-lockfile

pnpm security:handoff
pnpm security:scope
pnpm security:test
pnpm check
pnpm conformance:clean
```

Review the frozen source independently from the evidence branch:

```bash
git worktree add ../ERC-8350-g4-source audit/g4-rc1-source
cd ../ERC-8350-g4-source/contracts
forge test -vv
```

The internal-review record reports 48 Foundry tests. The evidence revision then adds
three authorization-boundary regressions, so the current packaged checkout reports
**51 passed, 0 failed**, including 256 invariant runs and 128,000 handler calls.
Reviewers must rerun the commands and publish their own methods and results; this
project-produced result is not a substitute for independent reproduction.

## Deployment evidence

There is **no deployment of the corrected G4 candidate**. The Sepolia deployment
documented in `docs/deployment.md` predates `G4-INT-001`. Its Registry can be used to
check stable typehashes, but its `AuditGrant` is deprecated and must not be treated as
evidence for the corrected extension. A replacement deployment remains blocked until
the external review is accepted.

## Required reviewer output

The reviewer must publish a report in a repository controlled by the reviewer or
review organization and provide:

1. identity, relevant experience, method, tools, compensation, prior involvement,
   and conflict disclosure;
2. the exact source commit, tree, scope digest, and risk-register digest above;
3. stable finding IDs, severities, dispositions, rationales, and fix verification;
4. an assessment of every accepted residual risk;
5. zero unresolved Critical or High findings;
6. the report bytes and SHA-256; and
7. a full-commit attestation using the statement required by
   `external/external-review.template.json`.

The final report bytes belong under `external/reports/`, accompanied by a completed
`external/external-review.json`. Only then may `pnpm security:rc` pass, subject to
human maintainer review of reviewer identity, independence, method, and report quality.

## Current external-review status

The two duplicate public comments currently on
[issue #11](https://github.com/AwareLiquid/ERC-8350/issues/11) do not satisfy the
gate. They omit reviewer identity and reviewer-controlled report evidence, describe
only part of the ten-file scope, and cite extension APIs that are not present in the
frozen source. The exact discrepancies and requested corrections are recorded in the
[`review intake`](external/REVIEW_INTAKE_2026-07-31.md) and
[`reviewer follow-up`](external/REVIEWER_FOLLOWUP.md).
