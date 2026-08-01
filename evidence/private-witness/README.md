# Private-Witness End-to-End Evidence

Status: **reproducible local evidence; synthetic data; not a production deployment**

中文摘要：这个演示选择一个窄范围的 `TOOL_TRACE` 客服场景。控制者将两次
私有工具调用转换为带盐承诺，由固定测试账户签署并通过 relayer 提交到真实的
`AgentMemoryStateRegistry` 合约。随后，控制者只向指定 auditor 披露 sequence 2，
并通过 `AuditGrant` 的 `[2,2]` 范围完成校验和确认。sequence 1 的明文、盐和
locator 不进入 auditor disclosure。

The demo commits two private tool calls, submits both transitions through the
Registry's real EIP-712 authorization path, and selectively discloses only
sequence `2` to one auditor. "Selective" means a selected transition range. It
does **not** mean field-level zero-knowledge disclosure: opening a transition's
baseline commitment reveals that transition's complete disclosed witness.

## Reproduce

Install the pinned workspace dependencies, then run:

```bash
pnpm install --frozen-lockfile
pnpm demo:private-witness
```

A passing run prints these stable public identifiers:

```text
Private-witness TOOL_TRACE demo: PASS
Space: 0x9dcc578df03c4fe1a65e5eea4142d4677f1115a64ee491fc85de67c52a2913aa
Authorized transitions: 2
Auditor disclosure: sequence 2 only (range [2,2])
Audit witnessSetRoot: 0x8ef3a2f2247a6049dc26fe48472e7373607e85b3d76aa4d50e156b80c3062f9d
```

The command performs two independent checks:

1. `scripts/private-witness-demo.mjs` derives every commitment and public
   identifier from the synthetic private fixture, compares the generated files
   byte-for-byte, verifies the auditor opening, and rejects private-marker leaks.
2. `PrivateWitnessEvidence.t.sol` deploys the real Registry and `AuditGrant`,
   rejects a wrong signer, accepts two relayed EIP-712 authorizations, recomputes
   the disclosed witness, rejects a tampered audit root, and records the auditor
   acknowledgement.

## Evidence files

| File | Role | Production visibility |
|---|---|---|
| `test-vectors/private-witness/tool-trace-v1.private.json` | Controller-side synthetic source: both tool payloads, commitment salts, provenance, and locators | Private; committed here only because all values are fake fixtures |
| `test-vectors/private-witness/tool-trace-v1.public.json` | Exact deterministic values modeled as Registry and `AuditGrant` public state/events | Public |
| `test-vectors/private-witness/tool-trace-v1.auditor.json` | Out-of-band disclosure containing sequence 2 only, plus exact canonical UTF-8 encodings | Auditor only |
| `scripts/private-witness-demo.mjs` | Generator, byte-for-byte verifier, privacy-boundary assertions, and tamper checks | Public implementation |
| `contracts/test/integration/PrivateWitnessEvidence.t.sol` | Independent Solidity execution of authorization, state transition, grant, and acknowledgement | Public test |

## Boundary

| Surface | Data present |
|---|---|
| Registry calldata/events/state | Space salt and ID; controller/authorizer; EIP-712 signatures in transaction calldata; sequence; prior/next roots; `deltaCommitment`; `provenanceCommitment`; public `profileId`; `locatorCommitment`; transition ID |
| `AuditGrant` calldata/events/state | Auditor address; selected range `[2,2]`; `witnessSetRoot`; grant ID; grant/acknowledgement timing |
| Controller private witness | Both raw tool arguments/results; payload, provenance, and locator salts; raw provenance; raw locators; exact witness encodings |
| Auditor disclosure | Only sequence 2 payload, provenance, locator, salts, and canonical witness bytes |
| Not disclosed to auditor | Sequence 1 email, customer record, locator, delta salt, and locator salt |

The Space salt is public registration calldata and is not a content-commitment
salt. Content, provenance, and locator salts remain secret in production.

The Node verifier scans `public.json` for fixture-private markers including the
email, customer/order/ticket identifiers, both locators, and every content salt.
It also verifies that `auditor.json` contains none of the sequence 1 markers.

## Auditor-verifiable claims

Given the public chain record and the private sequence 2 disclosure, the auditor
can verify that:

- the disclosed canonical payload opens `deltaCommitment` under the public
  `TOOL_TRACE` profile ID;
- disclosed provenance and locator open their respective commitments;
- the seven public Delta fields reproduce the transition ID;
- `prevStateRoot -> transitionId` reproduces `nextStateRoot`;
- the disclosed witness hash folds to the granted `witnessSetRoot` for `[2,2]`;
- the grant targets the stated Space, auditor, and range; and
- the Registry accepted the transition only after configured-authorizer approval.

The auditor cannot verify the undisclosed sequence 1 witness from this bundle.
Nor does the demo prove that the tool really executed, its result was truthful,
the witness remains available, the auditor was competent, or any copy was
deleted. Those remain explicit protocol non-claims.

## Fixture warning

All payloads are fictional. The fixed controller private key appears only in the
Solidity test and has no authority or value. The salts are deliberately published
to make the result reproducible, which is the opposite of production practice.
Never adapt this demo by replacing fixture values with real memory and committing
the file to source control.
