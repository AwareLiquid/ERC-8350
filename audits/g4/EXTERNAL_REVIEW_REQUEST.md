# External Solidity Review Request: ERC-8350 G4-rc1

Status: **open; external review not yet complete**

ERC-8350 needs one independent Solidity security review before the reference
contracts can be called a security-ready release candidate. This request is open
to an established auditor, security researcher, or independent Solidity team
with no maintainer role in AwareLiquid/ERC-8350.

## Frozen target

- Repository: https://github.com/AwareLiquid/ERC-8350
- Source commit: `af5a75fb2db532fd5603554083d8895a825c2de2`
- Source tree: `f8d66277123391ea54de3f53842256e17e2a497e`
- Immutable source ref: `refs/tags/audit/g4-rc1-source`
- Scope manifest: `audits/g4/scope.json`
- Scope SHA-256: `c9db7d27957c86386d8842687a2d009c0ca03bc864307e88cfed0ee25f3ae9bf`
- Compiler: Solidity `0.8.24`, optimizer 200 runs, Cancun EVM
- Solidity source lines: 895 across libraries, interfaces, core, three
  extensions, and the deployment script (including comments)

`contracts/src/experimental/MemoryMarket.sol` is explicitly excluded. It transfers
value, has a different trust model, and is not deployed by `Deploy.s.sol`.

## Priority questions

1. Can any account register, take over, rotate, or append to another Memory Space?
2. Do EIP-712, sequence, root, nonce, and Registry-domain bindings prevent mutation
   and replay in every authorization path?
3. Are EOA, ERC-1271, malformed return, revert, and EIP-7702 fallback behaviors safe
   and accurately represented?
4. Can any extension act against or emit authoritative-looking events for the wrong
   Space, controller, transition, grant, or auditor?
5. Can public calldata or events expose raw memory, locators, salts, evidence, or
   otherwise undermine the stated commitment model?
6. Do compiler settings, deployment code, sentinels, casts, and external calls
   introduce unexpected behavior?

Please specifically assess `G4-R-003`, the normative EIP-7702-to-ECDSA fallback,
and verify the fix for `G4-INT-001`, the former cross-Space `AuditGrant` revocation.

## Reproduce

From the branch containing this audit packet:

```bash
pnpm install --frozen-lockfile
pnpm security:scope
pnpm check
cd contracts
forge test -vv
```

## Required evidence

1. Publish a report at a stable public URL in a repository controlled by the
   reviewer or the review organization.
2. Identify the exact source commit and scope-manifest SHA-256 above.
3. Disclose independence, compensation, prior project work, and other conflicts.
4. Give every finding a stable ID, severity, status, rationale, and verification.
5. Leave no unresolved Critical or High finding.
6. Map every accepted Medium/Low/Informational finding into
   `audits/g4/residual-risks.json`.
7. Submit the report, its SHA-256, and a completed copy of
   `external/external-review.template.json` in a pull request.

The machine gate validates scope and evidence integrity; it does not decide whether
a reviewer is competent. Maintainers must still assess reviewer identity, method,
conflicts, and finding quality before accepting the report.
