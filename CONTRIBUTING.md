# Contributing

This repository is developing a pre-ERC community draft. Protocol changes need
interoperability evidence, not only a passing implementation.

## Development setup

Install Node.js 22 or later, pnpm 11.7.0, and Foundry 1.7.1. Then run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm conformance:clean
pnpm audit --audit-level=moderate
```

If `contracts/lib/forge-std` is absent, install the pinned test dependency:

```bash
cd contracts
forge install foundry-rs/forge-std@v1.16.2 --no-git
```

## Change rules

Core changes MUST update `SPEC.md`, the ERC draft, Solidity, the TypeScript core,
the dependency-isolated implementation, and `test-vectors/v1.json` in the same
pull request. A normative hash change requires a new protocol version; published
v1 encodings MUST NOT be silently reinterpreted. The pull request MUST include a
passing clean-checkout conformance record for the changed commit.

Extension, Experimental, and Adapter code MUST NOT add fields to the core Delta
or change the canonical Transition ID. Product vocabulary belongs in adapters.
Markets and deletion evidence belong outside Core.

Do not assign a speculative ERC number. Keep `ERC-XXXX` until an EIP Editor
assigns the number after the proposal is submitted to `ethereum/ERCs`.

## Pull requests

Keep changes focused and explain compatibility and security consequences. Add an
ADR when a decision changes protocol boundaries, trust assumptions, signature
semantics, commitments, or state transitions. All CI jobs must pass before merge.
