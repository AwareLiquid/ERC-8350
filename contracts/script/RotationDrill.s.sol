// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IAgentMemoryState} from "../src/interfaces/IAgentMemoryState.sol";

/// @notice Puts a real authorizer rotation on chain, on a Space created for that purpose.
///
/// Raised by blockbird on ethereum-magicians.org/t/29098 against the Sepolia deployment:
/// `SpaceAuthorizationUpdated` has zero logs, so rotation has never run live, and both
/// fixture Spaces registered with controller == authorizer, so the separation the
/// Rationale argues for has no live exercise behind it.
///
/// A DEDICATED SPACE, NOT THE PUBLISHED FIXTURE. Rotating the fixture Space would change
/// which key must sign its next transition, which would interfere with the published
/// vectors. This script derives its own Space from ROTATION_DRILL_SALT so the drill is
/// additive: the fixture Space and every vector already derived from it are untouched.
///
/// Sequence produced:
///   1. register            controller C, authorizer A   (C != A from the outset)
///   2. commitTransition    sequence 1, signed by A
///   3. updateSpaceAuthorization  authorizer A -> B, signed by C   <- the missing log
///   4. commitTransition    sequence 2, signed by B
///
/// That yields, on chain: one `SpaceRegistered` with the separation in place, one
/// `SpaceAuthorizationUpdated`, and two `TransitionCommitted` whose emitted `authorizer`
/// differs across the rotation while `prevStateRoot`/`nextStateRoot` stay gapless.
///
/// Usage (Sepolia):
///   REGISTRY=0xDdf21937ba80b5fF973610877A0955b320C91241 \
///   forge script script/RotationDrill.s.sol --rpc-url $SEPOLIA_RPC --broadcast
///
/// The broadcasting key is the controller. AUTHORIZER_A_PK / AUTHORIZER_B_PK sign the
/// transitions and never need funding — they are signing keys, not senders.
contract RotationDrill is Script {
    bytes32 internal constant SALT = keccak256("erc-8350-rotation-drill-v1");
    bytes32 internal constant PROFILE = keccak256("https://awareness.market/profiles/drill/v1");

    function run() external {
        IAgentMemoryState registry = IAgentMemoryState(vm.envAddress("REGISTRY"));

        uint256 authAPk = vm.envUint("AUTHORIZER_A_PK");
        uint256 authBPk = vm.envUint("AUTHORIZER_B_PK");
        address authA = vm.addr(authAPk);
        address authB = vm.addr(authBPk);

        vm.startBroadcast();
        address controller = msg.sender;

        require(controller != authA, "controller must differ from authorizer A");
        require(authA != authB, "rotation must actually change the authorizer");

        bytes32 spaceId = registry.deriveSpaceId(controller, SALT);
        console2.log("space");
        console2.logBytes32(spaceId);

        // 1. Register with the separation in place. Empty signature is valid because the
        //    broadcasting sender is the controller.
        registry.registerSpace(spaceId, controller, authA, SALT, "");

        // 2. Sequence 1, authorized by A.
        bytes32 root1 = _commit(registry, spaceId, 1, bytes32(0), authAPk);

        // 3. The rotation itself. This is the event that has never appeared on chain.
        registry.updateSpaceAuthorization(spaceId, controller, authB, "");

        // 4. Sequence 2, authorized by B. Chain must continue from root1 unbroken.
        bytes32 root2 = _commit(registry, spaceId, 2, root1, authBPk);

        vm.stopBroadcast();

        (bytes32 headId, bytes32 headRoot, uint64 headSeq) = registry.head(spaceId);
        require(headSeq == 2, "sequence did not reach 2");
        require(headRoot == root2, "head root diverged from replayed root");
        require(
            headRoot == registry.computeNextStateRoot(root1, headId),
            "final link does not recompute"
        );

        console2.log("rotation drill complete; sequence:", headSeq);
        console2.log("authorizer before / after rotation:", authA, authB);
    }

    function _commit(
        IAgentMemoryState registry,
        bytes32 spaceId,
        uint64 sequence,
        bytes32 prevStateRoot,
        uint256 authorizerPk
    ) internal returns (bytes32 nextStateRoot) {
        IAgentMemoryState.ExperienceDelta memory delta =
            IAgentMemoryState.ExperienceDelta({
                spaceId: spaceId,
                sequence: sequence,
                prevStateRoot: prevStateRoot,
                deltaCommitment: keccak256(abi.encodePacked("rotation-drill:delta:", sequence)),
                provenanceCommitment: bytes32(0),
                profileId: PROFILE,
                locatorCommitment: keccak256(abi.encodePacked("rotation-drill:locator:", sequence))
            });

        bytes32 transitionId = registry.hashExperienceDelta(delta);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(authorizerPk, registry.signingDigest(transitionId));
        (, nextStateRoot) = registry.commitTransition(delta, abi.encodePacked(r, s, v));
    }
}
