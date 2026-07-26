# Submission record — ERC-8337

This file used to track the three preamble facts that could not be fixed before
submission. All three are now resolved; it remains as the record and as the checklist
for keeping the upstream PR and this repository in sync.

## Resolved

| Item | Value | When |
|---|---|---|
| Discussion thread | https://ethereum-magicians.org/t/agent-memory-state/29098 | 2026-07-26 |
| Upstream PR | https://github.com/ethereum/ERCs/pull/1910 | 2026-07-26 |
| Number / file | **ERC-8337** → `ERCS/erc-8337.md` + `assets/erc-8337/` | 2026-07-26 |
| `eip:` preamble | `eip: 8337` (first preamble line) | 2026-07-26 |
| EIP Walidator | **success** (after `ERC-1271` prefix fix — eipw `markdown-refs` requires the `ERC` prefix for proposals whose category is ERC; 712 is Interface and 7702 is Core, so those keep `EIP-`) | 2026-07-26 |

Number assignment note: current `ethereum/ERCs` practice is that authors take the next
free number themselves (verified against PR #1858 → `erc-8330.md`); the highest number
claimed across merged files and open PR titles in both repos was 8336 at submission
time. Numbers are never chosen for aesthetics — picking a far-future number is squatting
and gets rejected.

## Sync discipline

`erc/erc-8337.md` in this repository is a byte-copy of the upstream `ERCS/erc-8337.md`.
If editors request changes on PR #1910, apply them upstream first, then copy the file
back here verbatim and re-run:

```bash
pnpm check:erc-assets
```

`erc/assets/erc-8337/` mirrors upstream `assets/erc-8337/` (golden vector + the
dependency-free Solidity reference: registry, interface, ERC-1271 interface, ECDSA).

## Remaining to Draft-merge and beyond

- [ ] ERC editor review on PR #1910 (format only; expect mechanical nits)
- [ ] After merge: edit the Magicians topic title to `ERC-8337: Agent Memory State`
- [x] Sepolia deployment — registry `0xDdf21937ba80b5fF973610877A0955b320C91241`, see `docs/deployment.md` (2026-07-26)
- [ ] Independent second implementation passing `test-vectors/v1.json`
- [ ] External Solidity audit
