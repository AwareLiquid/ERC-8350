# G4 Internal Solidity Review

Status: **complete as internal preparation; not an external audit**

- Candidate: `G4-rc1`
- Frozen source commit: `af5a75fb2db532fd5603554083d8895a825c2de2`
- Review date: 2026-07-31
- Solidity: `0.8.24`
- Foundry: `1.7.1`
- Slither: `0.11.6` (102 detectors)

This review prepares a stable target for an independent reviewer. It cannot satisfy
`External review complete` because the work was performed inside the project.

## Method

1. Manually traced registration, controller rotation, transition authorization,
   state advancement, lookup behavior, and extension-to-Registry trust boundaries.
2. Reviewed EIP-712 field coverage, replay domains, ECDSA malleability handling,
   ERC-1271 malformed/revert behavior, and the EIP-7702 fallback rule.
3. Reviewed all formal extensions for cross-Space authorization, public-data
   disclosure, sentinel values, stale controller behavior, and event attribution.
4. Ran Slither against the formal Solidity scope with experimental, test, and
   script paths filtered.
5. Ran all unit, Golden Vector, demo, and invariant tests.

## Actionable finding

### G4-INT-001: Cross-Space AuditGrant revocation and event misattribution

- Severity: **High**
- Status: **Fixed**
- Affected revision: all `AuditGrant` versions before source commit `af5a75f`
- Fixed revision: `af5a75fb2db532fd5603554083d8895a825c2de2`

`AuditGrant` derived a grant ID from its origin Space but did not persist that
Space. `revoke(spaceId, grantId)` authorized the controller supplied by the caller,
not the controller of the grant's origin Space. A controller of any other registered
Space could therefore revoke a victim grant. An auditor could also acknowledge a
grant while supplying another Space, producing a misattributed event.

The fix stores the origin Space for every grant and rejects `acknowledge` and
`revoke` when the supplied Space differs. Regression tests cover both cross-Space
paths and assert the persisted origin through `spaceOf`.

The Sepolia `AuditGrant` at
`0x20145Ab83958CFB321221e8a8C68181C818241B2` predates the fix and is deprecated.
It must not be used as evidence that the corrected extension is security-ready.

## Static-analysis disposition

Slither returned six detector results and no actionable issue after manual
triage. The machine-readable record is
[`internal/slither-summary.json`](internal/slither-summary.json).

| ID | Detector | Reported impact | Disposition |
|---|---|---:|---|
| `G4-SLITHER-001` | strict equality on the non-zero grant sentinel | Medium | False positive |
| `G4-SLITHER-002` | unused Registry head fields | Medium | Intentional |
| `G4-SLITHER-003` | unused authorization tuple fields | Medium | Intentional |
| `G4-SLITHER-004` | timestamp dataflow on a root comparison | Low | False positive |
| `G4-SLITHER-005` | bounded ECDSA calldata assembly | Informational | Intentional |
| `G4-SLITHER-006` | ERC-1271 low-level `STATICCALL` | Informational | Required behavior |

## Reproduce

```bash
cd contracts
forge fmt --check
forge test -vv

slither . \
  --compile-force-framework foundry \
  --exclude-dependencies \
  --filter-paths 'src/experimental|test|script'
```

Observed Foundry result: **48 passed, 0 failed**, including one invariant suite
with 256 runs and 128,000 handler calls.

## Limitations

- This is not independent and does not complete G4.
- Slither findings are heuristics; a clean disposition is not proof of safety.
- `MemoryMarket` is experimental and explicitly outside this review.
- Off-chain encryption, salt generation, witness availability, wallet policy,
  and deployment operations remain profile or deployment responsibilities.
- Any scoped source or compiler-setting change invalidates the external review.
