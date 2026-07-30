# ERC-8350 R-002 External Reproduction Report

- Result: **PASS**
- Generated: `2026-07-30T21:06:25.226Z`
- Manifest SHA-256: `cee7eba1f4237bea5095693d97e33c22ebe3f16d31e3319f5e67e4fb7b5dcbcf`
- Runner SHA-256: `d781062495e52b7c7e2c530d81610077b0ae5fbe43bf1d1d857c5c5c101a48a9`
- External executable suites: 2

| Suite | Result | Pinned commit | Assertions | Observation |
|---|---|---|---:|---|
| erc8312-sepolia-state-replay | PASS | `cd6100da171e` | 3/3 | 7 transitions / 3 Spaces / block 11384945 |
| invinoveritas-composition-recompute | PASS | `81a2e0f7898e` | 6/6 | 5 independent hash checks |

## Sources

- [erc8312-sepolia-state-replay](https://github.com/ERC8312/bounded-agent-actions/tree/cd6100da171e682b1abd6757c12a7df1356f80fa/recompute) by 0x2kNJ; discussion: [Ethereum Magicians](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098/6)
- [invinoveritas-composition-recompute](https://github.com/babyblueviper1/invinoveritas/tree/81a2e0f7898e429d2d15ec421379f3446ae6869c/examples/erc8274-erc8350-composition) by babyblueviper1; discussion: [Ethereum Magicians](https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098/13)

## Scope

This report establishes public, executable, independently maintained reproduction
evidence for R-002. It does **not** claim a complete separately maintained ERC-8350
client, broad ecosystem adoption, or an external security audit.
