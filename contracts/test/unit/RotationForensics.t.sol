// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {AgentMemoryStateRegistry} from "../../src/reference/AgentMemoryStateRegistry.sol";
import {IAgentMemoryState} from "../../src/interfaces/IAgentMemoryState.sol";

/// @notice Exercises authorizer rotation against a live transition chain.
///
/// Raised by blockbird on ethereum-magicians.org/t/29098: `SpaceAuthorizationUpdated`
/// has zero logs on the Sepolia deployment, and both fixture Spaces registered with
/// controller equal to authorizer, so the separation the Rationale argues for has never
/// been exercised. Rotation is where the forensic questions concentrate, because it is
/// the only operation that changes the answer to "who could authorize at sequence N".
///
/// The invariant under test is a cross-check between two independent sources:
/// the `authorizer` recorded on each `TransitionCommitted`, and the authorizer implied
/// by replaying the `SpaceAuthorizationUpdated` sequence up to that point. A registry
/// that accepted a transition from a stale key, or emitted an authorizer it did not
/// actually verify against, would break the equality even while the state root chain
/// still recomputed cleanly.
contract RotationForensicsTest is Test {
    AgentMemoryStateRegistry internal registry;

    uint256 internal controllerPk = 0xC0;
    uint256 internal authorizerAPk = 0xA1;
    uint256 internal authorizerBPk = 0xB2;

    address internal controller;
    address internal authorizerA;
    address internal authorizerB;

    bytes32 internal constant SALT = keccak256("rotation-forensics-salt-v1");
    bytes32 internal constant PROFILE = keccak256("example/profile/v1");
    bytes32 internal SPACE;

    function setUp() public {
        registry = new AgentMemoryStateRegistry();
        controller = vm.addr(controllerPk);
        authorizerA = vm.addr(authorizerAPk);
        authorizerB = vm.addr(authorizerBPk);

        SPACE = registry.deriveSpaceId(controller, SALT);

        // Register with controller != authorizer from the outset. The live fixture
        // Spaces both used controller == authorizer, so this path had no coverage.
        vm.prank(controller);
        registry.registerSpace(SPACE, controller, authorizerA, SALT, "");

        (address storedController, address storedAuthorizer,) = registry.spaceAuthorization(SPACE);
        assertEq(storedController, controller, "controller stored");
        assertEq(storedAuthorizer, authorizerA, "authorizer stored");
        assertTrue(storedController != storedAuthorizer, "separation actually exercised");
    }

    function _delta(uint64 sequence, bytes32 prevStateRoot)
        internal
        view
        returns (IAgentMemoryState.ExperienceDelta memory)
    {
        return IAgentMemoryState.ExperienceDelta({
            spaceId: SPACE,
            sequence: sequence,
            prevStateRoot: prevStateRoot,
            deltaCommitment: keccak256(abi.encodePacked("delta", sequence)),
            provenanceCommitment: bytes32(0),
            profileId: PROFILE,
            locatorCommitment: keccak256(abi.encodePacked("locator", sequence))
        });
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, registry.signingDigest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _commit(uint256 pk, uint64 sequence, bytes32 prevRoot)
        internal
        returns (bytes32 nextRoot)
    {
        IAgentMemoryState.ExperienceDelta memory d = _delta(sequence, prevRoot);
        (, nextRoot) = registry.commitTransition(d, _sign(pk, registry.hashExperienceDelta(d)));
    }

    /// @dev Rotation mid-chain: A signs 1-2, B signs 3-4. Asserts the chain stays gapless
    ///      across the rotation, and that every emitted `authorizer` matches the key that
    ///      was in force at that sequence.
    function test_RotationMidChain_ChainStaysGaplessAndAuthorshipIsAttributable() public {
        vm.recordLogs();

        bytes32 root0 = bytes32(0);
        bytes32 root1 = _commit(authorizerAPk, 1, root0);
        bytes32 root2 = _commit(authorizerAPk, 2, root1);

        // Rotate the authorizer. The controller is unchanged, so this isolates the
        // authorizer swap rather than conflating it with a controller handover.
        vm.prank(controller);
        registry.updateSpaceAuthorization(SPACE, controller, authorizerB, "");

        bytes32 root3 = _commit(authorizerBPk, 3, root2);
        bytes32 root4 = _commit(authorizerBPk, 4, root3);

        // Chain is gapless across the rotation: rotation is a configuration change and
        // must not perturb the state root accumulator.
        (bytes32 headId, bytes32 headRoot, uint64 headSeq) = registry.head(SPACE);
        assertEq(headSeq, 4, "sequence advanced across rotation");
        assertEq(headRoot, root4, "head root equals replayed root");
        assertEq(
            root4,
            registry.computeNextStateRoot(root3, headId),
            "final link recomputes from prev root"
        );

        // Cross-check: replay SpaceAuthorizationUpdated to derive who was in force at
        // each sequence, then compare against the authorizer each transition emitted.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 txTopic = keccak256(
            "TransitionCommitted(bytes32,bytes32,uint64,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,address)"
        );
        bytes32 rotTopic = keccak256("SpaceAuthorizationUpdated(bytes32,address,address,uint64)");

        address inForce = authorizerA; // from registration
        uint256 seen;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == rotTopic) {
                // topics: [sig, spaceId, controller, authorizer]
                inForce = address(uint160(uint256(logs[i].topics[3])));
            } else if (logs[i].topics[0] == txTopic) {
                uint64 seq = uint64(uint256(logs[i].topics[3]));
                // `authorizer` is the last word of the non-indexed data.
                bytes memory d = logs[i].data;
                address emitted;
                assembly {
                    emitted := mload(add(d, mload(d)))
                }
                assertEq(
                    emitted, inForce, "emitted authorizer equals the key in force at this sequence"
                );
                if (seq <= 2) assertEq(emitted, authorizerA, "1-2 attributable to A");
                else assertEq(emitted, authorizerB, "3-4 attributable to B");
                seen++;
            }
        }
        assertEq(seen, 4, "all four transitions observed");
    }

    /// @dev The rotated-out key must not be able to authorize afterwards, including for
    ///      a sequence it would otherwise be entitled to sign next.
    function test_RotatedOutAuthorizerCannotCommit() public {
        bytes32 root1 = _commit(authorizerAPk, 1, bytes32(0));

        vm.prank(controller);
        registry.updateSpaceAuthorization(SPACE, controller, authorizerB, "");

        IAgentMemoryState.ExperienceDelta memory d = _delta(2, root1);
        bytes memory staleSig = _sign(authorizerAPk, registry.hashExperienceDelta(d));
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.commitTransition(d, staleSig);

        // And the incoming key can.
        registry.commitTransition(d, _sign(authorizerBPk, registry.hashExperienceDelta(d)));
        (,, uint64 seq) = registry.head(SPACE);
        assertEq(seq, 2, "incoming authorizer advances the chain");
    }

    /// @dev A pre-rotation authorization cannot be replayed to undo the rotation, because
    ///      configNonce is bound into the authorization struct hash.
    function test_RotationAuthorizationCannotBeReplayed() public {
        bytes32 authId = registry.hashSpaceAuthorization(SPACE, controller, authorizerB, 1);
        bytes memory sig = _sign(controllerPk, authId);

        registry.updateSpaceAuthorization(SPACE, controller, authorizerB, sig);
        (,, uint64 nonce) = registry.spaceAuthorization(SPACE);
        assertEq(nonce, 1, "nonce advanced");

        // Replaying the same signature now targets nonce 2, so the recovered signer no
        // longer matches the struct hash that was signed.
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.updateSpaceAuthorization(SPACE, controller, authorizerB, sig);
    }

    /// @dev Rotating the controller hands over the right to rotate. The outgoing
    ///      controller must lose it; this is the separation the Rationale argues for.
    function test_ControllerHandoverRevokesRotationRight() public {
        address newController = vm.addr(0xD3);

        vm.prank(controller);
        registry.updateSpaceAuthorization(SPACE, newController, authorizerA, "");

        // Outgoing controller can no longer rotate.
        vm.prank(controller);
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.updateSpaceAuthorization(SPACE, controller, authorizerB, "");

        // Incoming controller can.
        vm.prank(newController);
        registry.updateSpaceAuthorization(SPACE, newController, authorizerB, "");
        (address c, address a,) = registry.spaceAuthorization(SPACE);
        assertEq(c, newController, "controller handed over");
        assertEq(a, authorizerB, "authorizer rotated by new controller");
    }
}
