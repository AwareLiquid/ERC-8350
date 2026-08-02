# ERC-8350 v1 Conformance Gate

The conformance gate answers one narrow question: given the canonical bytes in
`test-vectors/v1.json`, do the Solidity reference contract, the core TypeScript
SDK, and the dependency-isolated TypeScript implementation derive the same v1
commitments, identifiers, signing values, and state root?

Passing this gate is implementation evidence. It is not an external audit and
does not make the ERC final.

## Acceptance criteria

A run passes only when:

1. the source is a clean Git checkout when clean-checkout mode is requested;
2. `pnpm check` passes, including build, typecheck, tests, ERC asset synchronization,
   Solidity formatting, unit tests, fuzz tests, and invariants;
3. `packages/core` reads `test-vectors/v1.json` and matches every expected byte;
4. `implementations/minimal-ts` independently reads the same file and matches it;
5. `contracts/test/unit/GoldenVector.t.sol` reads the same file through Foundry and
   matches it; and
6. the gate writes a JSON record, a Markdown summary, and the command logs.

The three vector suites cover:

- delta, provenance, and locator commitments;
- Experience Delta, Memory State, and Memory Space type hashes;
- Space ID, registration ID, and authorization-update ID;
- Transition ID and next state root; and
- EIP-712 domain separator and signing digest.

“Byte-for-byte” means each computed `bytes32` value is compared directly with the
corresponding lowercase `0x` value decoded from the canonical JSON file. The
Solidity suite does not contain a second hard-coded copy of those expected values.

## Reproduce from a clean checkout

Install Node.js 22 or later, pnpm 11.7.0, and Foundry 1.7.1, then run:

```bash
pnpm conformance:clean
```

This command refuses a dirty source tree, creates a detached temporary worktree at
the current commit, installs dependencies with the frozen lockfile, installs the
pinned `forge-std` test dependency, runs the gate, and removes the worktree.

Results are written under:

```text
artifacts/conformance/<commit>/
├── conformance-v1.json
├── conformance-v1.md
└── logs/
```

For an already-clean CI checkout:

```bash
pnpm install --frozen-lockfile
cd contracts && forge install foundry-rs/forge-std@v1.16.2 --no-git && cd ..
CONFORMANCE_CLEAN_CHECKOUT=1 pnpm conformance:gate
```

## Reproducibility record

`conformance-v1.json` records:

- source commit, Git tree, branch, and clean-checkout observation;
- SHA-256 and byte length of `test-vectors/v1.json`;
- Node.js, pnpm, Forge, Solidity, platform, and architecture versions;
- command, working directory, exit code, and matched fields for each suite; and
- the canonical expected outputs used by all three implementations.

GitHub Actions uploads the directory as
`erc-8350-conformance-<commit>` and writes the Markdown report into the workflow
Job Summary. A reviewer can therefore associate every recorded result with one
exact source commit and vector digest.

## Local development

During development, run the gate in the current checkout with:

```bash
pnpm conformance:gate
```

The report records whether the tree was clean. Only a clean-checkout result is
acceptable as release or interoperability evidence.
