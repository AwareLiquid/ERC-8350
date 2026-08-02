# G4 Residual Risks

The canonical, machine-checked register is
[`audits/g4/residual-risks.json`](../../audits/g4/residual-risks.json). This page
is the compact operational view. Accepted risks are not bugs hidden behind an
audit label; they are conditions a deployment must actively manage.

| ID | Severity | Risk | Required deployment response |
|---|---:|---|---|
| `G4-R-001` | Medium | Controller compromise or one-step rotation error | Use reviewed multisig/policy control; simulate and independently verify rotation |
| `G4-R-002` | Medium | Compromised or permissive transition authorizer | Separate duties; rate-limit or threshold authorizations; monitor transitions |
| `G4-R-003` | Medium | EIP-7702 ECDSA fallback is still valid after delegate-policy rejection | Use a true contract-account authorizer when policy must be exclusive |
| `G4-R-004` | Low | Relayer censorship or delay | Keep direct or multiple submission paths and alert on stalled sequences |
| `G4-R-005` | Medium | Timing/profile/equality leakage and weak salts | Use fresh 32-byte salts, encryption, fresh nonces, and opaque profiles where needed |
| `G4-R-006` | Medium | Lost witness, salt, locator, or key makes commitments unopenable | Use redundant encrypted storage and tested restoration |
| `G4-R-007` | Low | Same-domain replay across temporary chain forks | Apply finality rules and reconcile after reorganizations |
| `G4-R-008` | Medium | ERC-1271 wallet bugs, upgrades, or gas griefing | Use reviewed wallets; test valid, invalid, revert, and malformed-return paths |
| `G4-R-009` | Medium | Proxy/wrapper changes behavior outside the immutable reference scope | Publish bytecode hashes; treat every wrapper or proxy as a new audit scope |
| `G4-R-010` | Low | Extension metadata reveals relationships and timing | Keep secrets out of extension calldata; omit extensions when metadata privacy matters |
| `G4-R-011` | Low | Audit/deletion records can be overstated | Present them only as scoped attestations with explicit off-chain policy |
| `G4-R-012` | High, mitigated | Legacy Sepolia AuditGrant has the pre-fix cross-Space bug | Never rely on that address; redeploy corrected, reviewed bytecode |

G4 does not permit an unresolved Critical or High finding in the candidate. The
legacy Sepolia issue is marked mitigated because the address is deprecated and
excluded from production use; it is not an accepted risk in the corrected source.

`G4-R-003` is specifically an EIP-7702 delegated-EOA rule. ERC-1271 rejection,
revert, pause, or malformed return from the delegate does not veto a canonical
signature from the delegated EOA's underlying key. An ordinary independently
deployed contract account does not normally have that residual EOA-key path.

An independent reviewer must assess the complete accepted-risk set and map every
additional accepted finding back into the canonical register before G4 can pass.
