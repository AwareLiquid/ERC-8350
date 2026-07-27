// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IAgentMemoryState} from "../src/interfaces/IAgentMemoryState.sol";
import {FixtureData} from "./FixtureData.sol";

/// @notice Registers the public fixture Space and commits its four transitions.
/// @dev Self-verifying: every transitionId and nextStateRoot the registry returns is
///      asserted against the values precomputed off-chain by
///      scripts/fixture/build-fixture-witness.mjs. Any drift reverts the whole run,
///      so a successful broadcast IS the cross-implementation check.
///
///      The sender must be the fixture controller (0x3d0a…823B on Sepolia) — the
///      Space id is bound to that address, and transitions use the direct-call
///      authorization path (empty signature, msg.sender == authorizer).
///
///      REGISTRY is supplied via env so the same calldata can be exercised against a
///      local anvil deployment before touching Sepolia.
contract FixtureSpace is Script {
    error UnexpectedTransitionId(uint64 seq, bytes32 got, bytes32 want);
    error UnexpectedStateRoot(uint64 seq, bytes32 got, bytes32 want);
    error SenderIsNotFixtureController(address sender);

    function run() external {
        IAgentMemoryState registry = IAgentMemoryState(vm.envAddress("REGISTRY"));

        vm.startBroadcast();
        if (msg.sender != FixtureData.CONTROLLER) {
            revert SenderIsNotFixtureController(msg.sender);
        }

        bytes32 spaceId = registry.deriveSpaceId(FixtureData.CONTROLLER, FixtureData.SPACE_SALT);
        require(spaceId == FixtureData.SPACE_ID, "spaceId drift vs builder");

        registry.registerSpace(
            spaceId, FixtureData.CONTROLLER, FixtureData.CONTROLLER, FixtureData.SPACE_SALT, ""
        );

        bytes32 prevRoot = bytes32(0);
        prevRoot = _commit(
            registry,
            spaceId,
            1,
            prevRoot,
            FixtureData.DELTA_COMMITMENT_1,
            FixtureData.PROVENANCE_COMMITMENT_1,
            FixtureData.PROFILE_ID_1,
            FixtureData.LOCATOR_COMMITMENT_1,
            FixtureData.EXPECTED_TRANSITION_ID_1,
            FixtureData.EXPECTED_NEXT_ROOT_1
        );
        prevRoot = _commit(
            registry,
            spaceId,
            2,
            prevRoot,
            FixtureData.DELTA_COMMITMENT_2,
            FixtureData.PROVENANCE_COMMITMENT_2,
            FixtureData.PROFILE_ID_2,
            FixtureData.LOCATOR_COMMITMENT_2,
            FixtureData.EXPECTED_TRANSITION_ID_2,
            FixtureData.EXPECTED_NEXT_ROOT_2
        );
        prevRoot = _commit(
            registry,
            spaceId,
            3,
            prevRoot,
            FixtureData.DELTA_COMMITMENT_3,
            FixtureData.PROVENANCE_COMMITMENT_3,
            FixtureData.PROFILE_ID_3,
            FixtureData.LOCATOR_COMMITMENT_3,
            FixtureData.EXPECTED_TRANSITION_ID_3,
            FixtureData.EXPECTED_NEXT_ROOT_3
        );
        prevRoot = _commit(
            registry,
            spaceId,
            4,
            prevRoot,
            FixtureData.DELTA_COMMITMENT_4,
            FixtureData.PROVENANCE_COMMITMENT_4,
            FixtureData.PROFILE_ID_4,
            FixtureData.LOCATOR_COMMITMENT_4,
            FixtureData.EXPECTED_TRANSITION_ID_4,
            FixtureData.EXPECTED_NEXT_ROOT_4
        );
        vm.stopBroadcast();

        (, bytes32 headRoot, uint64 headSeq) = registry.head(spaceId);
        require(headSeq == 4 && headRoot == prevRoot, "head mismatch after commits");

        console.log("fixture spaceId:");
        console.logBytes32(spaceId);
        console.log("head sequence  :", headSeq);
        console.log("final stateRoot:");
        console.logBytes32(headRoot);
        console.log("all four transitions matched the precomputed witness bundle");
    }

    function _commit(
        IAgentMemoryState registry,
        bytes32 spaceId,
        uint64 seq,
        bytes32 prevRoot,
        bytes32 deltaCommitment,
        bytes32 provenanceCommitment,
        bytes32 profileId,
        bytes32 locatorCommitment,
        bytes32 wantId,
        bytes32 wantRoot
    ) private returns (bytes32) {
        IAgentMemoryState.ExperienceDelta memory delta = IAgentMemoryState.ExperienceDelta({
            spaceId: spaceId,
            sequence: seq,
            prevStateRoot: prevRoot,
            deltaCommitment: deltaCommitment,
            provenanceCommitment: provenanceCommitment,
            profileId: profileId,
            locatorCommitment: locatorCommitment
        });
        (bytes32 gotId, bytes32 gotRoot) = registry.commitTransition(delta, "");
        if (gotId != wantId) revert UnexpectedTransitionId(seq, gotId, wantId);
        if (gotRoot != wantRoot) revert UnexpectedStateRoot(seq, gotRoot, wantRoot);
        return gotRoot;
    }
}
