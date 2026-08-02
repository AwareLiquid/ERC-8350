# External Review Intake: 2026-07-31

Status: **PROVISIONAL; NOT ACCEPTED AS G4 EVIDENCE**

The maintainers received an email titled "Independent Security Review — ERC-8350
G4 Release Candidate." Its conclusion reports no Critical, High, or Medium
findings and identifies two Low observations and two Informational notes. The
technical feedback is useful, but the email is not yet a qualifying external
review artifact under the G4 evidence policy.

## Confirmed target details

- Claimed source commit:
  `af5a75fb2db532fd5603554083d8895a825c2de2`
- Candidate tag: `audit/g4-rc1-source`
- Compiler: Solidity `0.8.24`
- Optimizer: enabled, 200 runs
- EVM target: Cancun
- Claimed result: no Critical, High, or Medium findings

## Evidence corrections required

1. Identify the reviewer by name, organization or independent status, and an
   external GitHub owner.
2. Publish the report in a reviewer-controlled public repository and provide the
   exact report bytes, stable URL, SHA-256, publication timestamp, and full-commit
   attestation.
3. State methodology, tool versions, test commands, compensation, prior work,
   and conflicts.
4. Attest to the complete ten-file scope in `scope.json`, its SHA-256, and the
   canonical residual-risk-register SHA-256.
5. Replace non-existent API names in the report:
   `grantAudit`, `acknowledgeAudit`, `revokeAudit`, and `getSpaceInfo`.
   The reviewed candidate exposes `grant`, `acknowledge`, `revoke`,
   `spaceAuthorization`, `head`, and `transition`.
6. Provide stable finding IDs, final statuses, verification notes, and residual
   risk mappings in a completed `external-review.json`.

The email names five contracts, while the canonical scope contains ten pinned
files: the ECDSA and commitment libraries, two interfaces, the Registry, three
extensions, deployment script, and compiler configuration. The reviewer must
confirm all ten were reviewed.

## Technical disposition

| Email item | Maintainer disposition | Required action |
|---|---|---|
| `LOW-1` ERC-1271 to ECDSA fallback | Accepted as a deployment-policy clarification already tracked by `G4-R-003` | The warning is now prominent in `SECURITY.md`; revise the report to distinguish EIP-7702 delegated EOAs from ordinary contract accounts |
| `LOW-2` missing `nonReentrant` | Not accepted as a Low finding on the stated rationale | Authorization invokes untrusted code with `STATICCALL`; static context propagates to callbacks and forbids Registry state writes. New tests exercise registration and authorization-update callbacks. Reclassify or provide an exploit trace |
| `INFO-1` no explicit `v` branch | Accepted as Informational | Invalid `v` yields a zero recovery and `ECDSA.InvalidSignature`; a regression test now pins this behavior |
| `INFO-2` range continuity | Not accepted as a missing continuity check | The Registry permits only `sequence == head + 1`, so every sequence from 1 through `head` exists by induction. `AuditGrant` also requires `1 <= from <= to <= head` |

No scoped source or canonical risk-register bytes were changed in response to
this intake. The frozen commit, scope digest, and risk digest therefore remain
valid.

## Gate consequence

`pnpm security:scope` and `pnpm security:test` may pass. `pnpm security:rc`
must continue to fail until the corrected public report and completed,
reviewer-attested evidence record are present and accepted.
