# G4 Security-Ready Release Candidate

Current status: **PREPARED, NOT COMPLETE**

The source target, internal review, risk register, and evidence gate are ready.
The independent external Solidity review is still open. Until a qualifying report
is accepted, `pnpm security:rc` and `pnpm release:check` fail by design, and no
artifact from this branch may be described as security-ready or production-ready.

## Gate status

| Requirement | Evidence | Status |
|---|---|---:|
| Frozen Solidity target | [`scope.json`](scope.json), commit `af5a75f` | Pass |
| Internal review and regression fix | [`INTERNAL_REVIEW.md`](INTERNAL_REVIEW.md) | Pass |
| Remaining risks explicitly registered | [`residual-risks.json`](residual-risks.json) | Pass |
| Scope/evidence gate has adversarial tests | `scripts/security-rc-gate*.mjs` | Pass |
| Independent external Solidity report | [`EXTERNAL_REVIEW_REQUEST.md`](EXTERNAL_REVIEW_REQUEST.md) | **Pending** |
| No unresolved Critical/High external findings | Requires accepted external report | **Pending** |
| G4 full gate | `pnpm security:rc` | **Blocked by pending review** |

## Frozen source

- Commit: `af5a75fb2db532fd5603554083d8895a825c2de2`
- Tree: `f8d66277123391ea54de3f53842256e17e2a497e`
- Immutable source ref: `refs/tags/audit/g4-rc1-source`
- Scope SHA-256:
  `c9db7d27957c86386d8842687a2d009c0ca03bc864307e88cfed0ee25f3ae9bf`
- Residual-risk SHA-256:
  `307a52eb0bf512aea25565bf604d92fc6b1b2d64eb910595568a5f0c04aa6019`

Any change to a scoped file or compiler setting invalidates these hashes and
requires a new candidate plus external review of the changed target.

## Commands

```bash
# Passes now: validates exact source, scope, and risk registration.
pnpm security:scope

# Passes now: attacks the gate's trust assumptions and failure paths.
pnpm security:test

# Fails until audits/g4/external/external-review.json and its report are accepted.
pnpm security:rc
```

The full gate requires an external reviewer-controlled evidence repository, a
public report with pinned bytes, a full-commit attestation, exact scope and risk
digests, an assessment of every accepted residual risk, dispositions for every
finding, and zero unresolved Critical or High findings.

## Completion procedure

1. Confirm the reviewer has no project maintainer role and evaluate expertise,
   conflicts, compensation, and prior involvement.
2. Give the reviewer the frozen commit and
   [`EXTERNAL_REVIEW_REQUEST.md`](EXTERNAL_REVIEW_REQUEST.md).
3. Resolve findings. Any scoped source change creates a new frozen commit and must
   be included in the reviewer's final verification.
4. Have the reviewer publish the final report and a commit attestation in their
   own evidence repository.
5. Add the exact report bytes under `external/reports/` and complete
   `external/external-review.json` from the provided template.
6. Map accepted non-Critical/High findings to `residual-risks.json`.
7. Run `pnpm security:rc`, `pnpm check`, and the clean-checkout conformance gate.
8. Obtain maintainer approval of reviewer identity and report quality, then mark
   G4 complete and create the RC tag.

The script checks evidence integrity. It cannot establish reviewer competence or
independence on its own; those remain explicit human approval duties.
