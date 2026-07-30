# ERC-8350 R-002 External Reproduction Report

- Result: **PASS**
- Generated: `2026-07-30T21:43:13.281Z`
- Manifest SHA-256: `3dfb7f65627a74473e2679897dbcaab2fe5a38243a3d49e7f05efe0487da9e98`
- Runner SHA-256: `6c035e56a628073368a57145380db4ee0945ab1ecf396e1fa0b29a8b5bb47482`
- External executable suites: 2
- Child-process environment: **ALLOWLISTED**
- Python isolated mode: **ENABLED**
- Dependency artifact hashes: **REQUIRED**

| Suite | Result | Pinned commit | Assertions | Observation |
|---|---|---|---:|---|
| erc8312-sepolia-state-replay | PASS | `cd6100da171e` | 3/3 | 7 transitions / 3 Spaces / block 11385129 |
| invinoveritas-composition-recompute | PASS | `81a2e0f7898e` | 6/6 | 5 independent hash checks |

## Sources

- [erc8312-sepolia-state-replay](https://github.com/ERC8312/bounded-agent-actions/tree/cd6100da171e682b1abd6757c12a7df1356f80fa/recompute) by 0x2kNJ; discussion: [Ethereum Magicians](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098/6)
- [invinoveritas-composition-recompute](https://github.com/babyblueviper1/invinoveritas/tree/81a2e0f7898e429d2d15ec421379f3446ae6869c/examples/erc8274-erc8350-composition) by babyblueviper1; discussion: [Ethereum Magicians](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098/13)

## Scope

This report establishes public, executable, independently maintained reproduction
evidence for R-002. It does **not** claim a complete separately maintained ERC-8350
client, broad ecosystem adoption, or an external security audit.
