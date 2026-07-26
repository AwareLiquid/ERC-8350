# Submitting to `ethereum/ERCs`

Three preamble facts cannot be fixed in this repository, because each one is only
assigned during submission. Filling them with plausible placeholders would produce a
document that *looks* conformant and fails `eipw` at PR time, so they are deliberately
left as `xxxx` / `00000` and listed here instead.

## Blocked until submission

| Item | Current | Becomes | Why it cannot be done earlier |
|---|---|---|---|
| `eip:` preamble field | *absent* | the PR number | EIP-1 assigns the number from the `ethereum/ERCs` pull request; there is no valid value before the PR exists |
| File name | `erc/erc-xxxx-agent-memory-state.md` | `ERCS/erc-<N>.md` | Must be `erc-<N>.md` — digits only, no descriptive suffix — and must sit in `ERCS/` |
| `discussions-to:` | `.../agent-memory-state-registry/00000` | the real topic id | The Ethereum Magicians thread must exist first. The title `Agent Memory State Registry` is chosen so the slug already matches; only the trailing id changes |

## Mechanical steps at submission time

1. Open the Ethereum Magicians thread (category **ERCs**, title exactly
   `Agent Memory State Registry`), then set `discussions-to` to its URL.
2. Fork `ethereum/ERCs`, copy this file to `ERCS/erc-<PR>.md`, and add `eip: <PR>` as the
   first preamble line.
3. Copy `erc/assets/erc-xxxx/` to `assets/erc-<PR>/` and update the relative links in
   *Test Cases* and *Reference Implementation* accordingly.
4. Move the reference contracts into `assets/erc-<PR>/` as well — upstream `eipw` rejects
   absolute external links, so pointing at this repository on GitHub will not pass.
5. Confirm `requires: 712, 1271` is still accurate, and re-check that no RFC 2119 keyword
   appears outside the Specification section:
   ```bash
   awk '/^## Rationale/,0' ERCS/erc-<PR>.md | grep -nE '\b(MUST|SHOULD|SHALL|REQUIRED|RECOMMENDED)\b'
   ```
   The expected result is no output.

## Already conformant — do not "fix" these

Verified against EIP-1 and against Final ERCs (ERC-7529, ERC-7913) upstream:

- `Copyright and related rights waived via [CC0](../LICENSE.md).` — correct as written.
- `[EIP-712](./eip-712.md)` / `[EIP-1271](./eip-1271.md)` — correct. The ERCs repository
  names files `erc-N.md`, but cross-references to EIPs still use `eip-N.md`. Bare
  `EIP-712` on subsequent mentions is also correct.
- `title` (29 chars) and `description` (65 chars) are within the 44 / 140 limits, use
  sentence case, contain no colon, and avoid the word "standard".
- Section order and the five mandatory sections match `eipw`'s `markdown-order-section`.
- The RFC 2119 boilerplate wording and placement are verbatim correct.

## Guards

`test-vectors/v1.json` is the single source of truth; `erc/assets/erc-xxxx/` holds a copy
only because EIP-1 requires test cases under `assets/`. Run the drift check before any
submission or release:

```bash
pnpm check:erc-assets
```
