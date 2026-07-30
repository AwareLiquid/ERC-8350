# Submission record — ERC-8350

This file used to track the three preamble facts that could not be fixed before
submission. All three are now resolved; it remains as the record and as the checklist
for keeping the upstream PR and this repository in sync.

## Resolved

| Item | Value | When |
|---|---|---|
| Discussion thread | https://ethereum-magicians.org/t/erc-8350-agent-memory-state-registry/29098 (retitled by the editor with the assigned number on 2026-07-29; same topic id as the original `agent-memory-state` thread) | 2026-07-26 |
| Upstream PR | https://github.com/ethereum/ERCs/pull/1910 | 2026-07-26 |
| Number / file | **ERC-8350** → `ERCS/erc-8350.md` + `assets/erc-8350/` (submitted as self-picked `8337` on 2026-07-26; editor @abcoathup assigned `8350` in review — "Numbers are assigned by editors & associates") | 2026-07-29 |
| `eip:` preamble | `eip: 8350` (first preamble line) | 2026-07-29 |
| EIP Walidator | **success** (after `ERC-1271` prefix fix — eipw `markdown-refs` requires the `ERC` prefix for proposals whose category is ERC; 712 is Interface and 7702 is Core, so those keep `EIP-`) | 2026-07-26 |
| HTMLProofer | **fixed**: in-document asset links must be `../assets/eip-NNNN/` (not `erc-NNNN`) because the site build renames asset dirs `erc-*` → `eip-*` when merging the EIPs and ERCs repos; convention verified against freshly merged `erc-8320.md` | 2026-07-29 |

Number assignment note (corrected 2026-07-29): numbers are assigned by editors and
associates during review, not self-picked — the original claim here that authors take
the next free number was wrong. Submit with a best-guess number, expect a review
suggestion with the real one, then rename the file and update `discussions-to` to match.

Historical constants note: the Sepolia fixture Space predates the number assignment, so
its salt/seed preimages intentionally keep the literal string `erc-8337`
(e.g. `keccak256("erc-8337-fixture-space-v1")`). They are opaque preimages of live
on-chain values and MUST NOT be renamed.

## Sync discipline

`erc/erc-8350.md` in this repository is a byte-copy of the upstream `ERCS/erc-8350.md`.
If editors request changes on PR #1910, apply them upstream first, then copy the file
back here verbatim and re-run:

```bash
pnpm check:erc-assets
```

`erc/assets/erc-8350/` mirrors upstream `assets/erc-8350/` (golden vector + the
dependency-free Solidity reference: registry, interface, ERC-1271 interface, ECDSA).

## Remaining to Draft-merge and beyond

- [ ] ERC editor review on PR #1910 (number assignment applied 2026-07-29; awaiting one more editor review for Draft merge)
- [x] Magicians topic retitled with the assigned number (done by the editor, 2026-07-29)
- [x] Sepolia deployment — registry `0xDdf21937ba80b5fF973610877A0955b320C91241`, see `docs/deployment.md` (2026-07-26)
- [x] Independent reproduction evidence — two external, commit-pinned executable suites pass; see `docs/interop/external-reproduction.md` (2026-07-31)
- [ ] Independent second implementation passing `test-vectors/v1.json`
- [ ] External Solidity audit — `G4-rc1` target, risk register, and evidence gate
      prepared at source commit `af5a75f`; independent report remains pending, so
      `pnpm security:rc` intentionally fails
