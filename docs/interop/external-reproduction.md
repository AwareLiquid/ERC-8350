# R-002: Independent Reproduction Evidence

Status: **resolved for independent reproduction evidence** as of 2026-07-31.

This status is intentionally narrower than "independent implementation" or
"security audit." Two externally maintained repositories now contain executable,
commit-pinned ERC-8350 recomputations, and both pass from clean checkouts. No
complete third-party client currently implements the entire registry interface and
passes every field in `test-vectors/v1.json`.

## Acceptance criteria

R-002 is resolved only when the evidence:

1. is authored and hosted outside the `AwareLiquid` GitHub namespace;
2. pins a full external commit SHA and every executed source-file digest;
3. does not import code from this repository;
4. exits nonzero on a mismatch;
5. can be executed from a clean external checkout; and
6. records machine-readable results, logs, environment versions, and live-chain
   observation data where applicable.

The canonical source list is
[`evidence/external-reproductions/v1.json`](../../evidence/external-reproductions/v1.json).

## Evidence

| Evidence | External maintainer | What is independently recomputed | Pinned source |
|---|---|---|---|
| Sepolia state replay | `blockbird` / `0x2kNJ`, hosted by `ERC8312` | Every emitted `transitionId`, every `nextStateRoot`, gapless sequence/root linkage, storage-proven heads, block header, and a second-RPC cross-check | [`cd6100da171e`](https://github.com/ERC8312/bounded-agent-actions/tree/cd6100da171e682b1abd6757c12a7df1356f80fa/recompute) |
| ERC-8274 composition | `babyblueviper1`, hosted by `babyblueviper1` | `provenanceCommitment`, `transitionId`, `nextStateRoot`, provenance bytes digest, and cross-standard event agreement | [`81a2e0f7898e`](https://github.com/babyblueviper1/invinoveritas/tree/81a2e0f7898e429d2d15ec421379f3446ae6869c/examples/erc8274-erc8350-composition) |
| Specification recompute | `babyblueviper1` on Ethereum Magicians | Three typehashes and the EIP-712 domain separator from specification text | [Public review](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098/2) |

The first two rows are executable suites. The third is a public reviewer
attestation and is recorded separately because it has no published executable
artifact.

## Reproduce

Requirements are Git, Node.js 22 or later, Python 3.12 or later, and network
access to GitHub, PyPI, and two Sepolia RPC endpoints.

```bash
node scripts/external-reproduction-gate.mjs
```

The runner:

1. creates fresh temporary Git repositories;
2. fetches only the pinned external commits;
3. verifies every declared source SHA-256;
4. creates isolated Python virtual environments;
5. installs exact Python dependency versions;
6. executes both external verifiers; and
7. writes `report.json`, `report.md`, and per-suite logs under
   `artifacts/external-reproductions/`.

Private RPC endpoints may be supplied without committing them:

```bash
ERC8350_PRIMARY_RPC=... \
ERC8350_CROSSCHECK_RPC=... \
node scripts/external-reproduction-gate.mjs
```

Reports retain only endpoint hostnames and redact complete RPC URLs from logs.
The scheduled/manual
[`external-reproduction.yml`](../../.github/workflows/external-reproduction.yml)
workflow publishes the same files as a GitHub Actions artifact.

## Recorded result

The committed 2026-07-31 run is
[`evidence/external-reproductions/records/2026-07-31/report.md`](../../evidence/external-reproductions/records/2026-07-31/report.md).
It observed seven transitions across three Memory Spaces. Every transition and
stored head recomputed successfully, the observation block matched a second RPC,
and all five saved-artifact composition checks passed.

## Residual work

R-002 no longer accurately describes the public evidence state. The following
are separate, still-open gates:

- a complete implementation maintained by another organization that consumes
  `test-vectors/v1.json` directly;
- an external Solidity security audit;
- a second log source capable of detecting whole-Space omission; and
- long-term maintenance of the external implementations.

These residual items must not be presented as complete merely because R-002 is
resolved.
