# Threat Model

## Assets

- control of a Memory Space;
- integrity and ordering of its transition history;
- confidentiality of memory payloads and locators;
- correctness of cross-language identifiers;
- availability of private witnesses; and
- clarity about what a commitment does and does not prove.

## Trust assumptions

The Registry is trusted only to execute its published bytecode. The controller
and authorizer are trusted according to the deployment's account policy. Storage
providers, relayers, indexers, memory engines, and profile publishers are not
implicitly trusted by the core protocol.

## Threats and controls

| Threat | Control | Residual risk |
|---|---|---|
| Another signer claims an intended namespace | `spaceId` derives from initial controller and salt; registration requires controller authorization | Controller/salt compromise before registration |
| Another signer appends to an existing Space | Registry validates only the configured authorizer | Compromised or overly permissive authorizer |
| Relayer changes URI or metadata | Raw URI removed; all seven Delta fields, including `locatorCommitment`, are signed | Relayer may censor or delay submission |
| Broken prior-state claim | Exact `prevStateRoot` and sequence checked against head | Linear model does not support concurrent branches |
| Cross-chain or cross-registry replay | EIP-712 domain binds chain ID and Registry | Chain forks with identical domain need operational handling |
| Configuration replay | Per-Space `configNonce` | Compromised controller can still authorize a malicious update |
| ECDSA malleability | Low-s validation and non-zero recovery | Wallet implementation defects |
| Contract-wallet spoofing | EIP-1271 exact magic value and malformed-return checks | Bugs in the authorizer contract itself |
| Delegate policy treated as exclusive | ERC-1271 is attempted first, then the ERC-8350 canonical ECDSA fallback | A delegated EOA's underlying key remains an authorization path; use a contract-account authorizer when policy must be exclusive |
| Dictionary attack on short memory | Secret salt or encrypted payload with fresh key and nonce | Public metadata and timing remain visible |
| Locator disclosure | Only a salted locator commitment is public | Out-of-band witness recipients can disclose it |
| Equality linkage | Fresh independent salts | Reused ciphertext, salts, or payload-side identifiers |
| Hash disagreement across languages | Shared Golden Vector checked by Solidity, core TS, and isolated TS | A new implementation can still ignore conformance tests |
| False inference/provenance claim | Core labels it only as an opaque commitment | Veracity requires a separate proof or attestation system |
| False deletion claim | Deletion is an optional scoped attestation, not core state | Copies outside the attested system may survive |
| Stale market sale | Experimental listing binds current controller and state root | Market contract and token remain separate attack surfaces |
| Data unavailable after commitment | Out of scope; deployments add storage/availability policy | Commitment may be permanently unopenable |
| Upgrade changes semantics | Versioned domain and recommendation to freeze normative behavior | Proxy admin can still violate user expectations |

## Security gates before public deployment

1. Independent review of EIP-712 type strings and ABI field ordering.
2. Fuzz and invariant tests on sequence, prior root, controller rotation, and
   EIP-1271 failure modes.
3. A second external implementation consuming the Golden Vector.
4. Review of the selected encryption and witness-distribution profile.
5. Explicit controller and authorizer recovery procedures.
6. Testnet monitoring for event/indexer compatibility.
7. External Solidity audit before a Registry is presented as production-ready.

The complete G4 operational register, including owners, controls, deployment
requirements, and review triggers, is
[`docs/security/residual-risks.md`](security/residual-risks.md). G4 remains
incomplete until `pnpm security:rc` accepts independent review evidence for the
exact frozen source.

## Non-claims

A valid transition does not prove that memory is true, useful, available,
conscious, legally owned, or deleted. It proves that a configured authority
approved a particular committed state transition.
