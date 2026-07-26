# Testnet deployment

A public testnet deployment matters for more than convenience: a reviewer can check that
a live registry reproduces the published golden vector, and the absence of one is a
reasonable objection during ERC review.

`script/Deploy.s.sol` deploys the core registry plus the three opt-in extensions.
`MemoryMarket` is deliberately excluded — it is experimental, carries a different trust
model, and should not appear behind the same published address as the normative core.

## Key handling

**No key material belongs in this repository**, including in `.env`. Import the deployer
key into Foundry's encrypted keystore once, and refer to it by name afterwards:

```bash
cast wallet import awar-deployer --interactive
```

That prompts for the private key and a password, and stores it encrypted under
`~/.foundry/keystores/`. Deployments then use `--account awar-deployer`, so the key is
never passed on a command line, never lands in shell history, and never appears in a
file that could be committed. A hardware wallet (`--ledger` / `--trezor`) works the same
way and is preferable if one is available.

## Prerequisites

- Foundry 1.7.1
- Sepolia ETH on the deployer address (a faucet is sufficient; deployment costs roughly
  2.6M gas for all four contracts)
- An RPC endpoint and an Etherscan API key

```bash
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<key>"   # or any provider
export ETHERSCAN_API_KEY="<key>"
```

Both are read from the environment by `foundry.toml`; neither is committed.

## Deploy

Dry-run first — this simulates against live state and reverts cost nothing:

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url sepolia
```

Then broadcast and verify the source in one step:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url sepolia \
  --account awar-deployer \
  --broadcast \
  --verify \
  -vvv
```

## Verify the deployment reproduces the golden vector

This is the check worth publishing, because it is the one a reviewer will actually run.
The typehashes are chain-independent, so a live registry must return exactly the values
in `test-vectors/v1.json`:

```bash
REGISTRY=<deployed address>

cast call $REGISTRY "EXPERIENCE_DELTA_TYPEHASH()(bytes32)" --rpc-url sepolia
# 0x4f020f86bc06d852f1fde17853b4d92a70214eeab8e09718028124af097d070d

cast call $REGISTRY "MEMORY_STATE_TYPEHASH()(bytes32)" --rpc-url sepolia
# 0xf3148762556cbf851baf4b9a205e18ff4e6b366a58a3a1ef58e8626ba41beadb

cast call $REGISTRY "MEMORY_SPACE_TYPEHASH()(bytes32)" --rpc-url sepolia
# 0x9ae5478f084ad3b841da58a9cb2354d153cddec59ee64d0cb741fa9d08884531
```

The domain separator is *not* chain-independent by design — it binds signatures to this
chain and this registry address, which is what prevents cross-chain and cross-registry
replay. Record the value the script prints rather than comparing it to the vector.

## After deploying

1. Record the addresses in this file under a `## Deployments` heading, with the chain,
   date, and commit hash.
2. Add the Sepolia registry address to the Ethereum Magicians thread — it directly
   answers the "no public deployment" objection, and lets reviewers verify the typehashes
   themselves.
3. Update `CHANGELOG.md`.

Do not put deployment addresses into the ERC draft itself unless the standard is
specified as a singleton, which this one is not: each deployment is an independent
registry, and the EIP-712 domain already distinguishes them.

## Deployments

### Sepolia (chainId 11155111) — 2026-07-26

| Contract | Address |
|---|---|
| `AgentMemoryStateRegistry` | `0xDdf21937ba80b5fF973610877A0955b320C91241` |
| `DeletionAttestation` | `0x97cc9b019A089bf7b821d47134020896f9259cc0` |
| `SpaceDescriptor` | `0x7745e2dDC30e75E1D7B7fBAf4616Fc0F54e571F5` |
| `AuditGrant` | `0x20145Ab83958CFB321221e8a8C68181C818241B2` |

Domain separator (binds signatures to this chain + registry): `0x4f36e5833f961f835ccd6ac49572ed105e4cdbf865f8904fe3d020724148b6ac`

Verified live against the golden vector — all three typehashes returned by the deployed
registry match `test-vectors/v1.json` byte-for-byte:

```bash
cast call 0xDdf21937ba80b5fF973610877A0955b320C91241 "EXPERIENCE_DELTA_TYPEHASH()(bytes32)" \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
# 0x4f020f86bc06d852f1fde17853b4d92a70214eeab8e09718028124af097d070d
```

Deployed at commit `100d6ba` (ERC-8337 sync). Etherscan source verification pending.
