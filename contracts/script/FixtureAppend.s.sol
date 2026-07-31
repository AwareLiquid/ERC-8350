// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IAgentMemoryState} from "../src/interfaces/IAgentMemoryState.sol";
import {FixtureData} from "./FixtureData.sol";

/// @notice Appends transition 5 to the already-live fixture Space.
/// @dev FixtureSpace.s.sol registers the Space and commits 1–4; it cannot be re-run
///      against a registered Space. This script appends only, and is safe to abort:
///      it refuses to broadcast unless the live head is exactly the sequence-4 state
///      the builder precomputed, so a partially applied or drifted Space reverts
///      instead of forking the history.
///
///      Self-verifying, same discipline as the original run: the transitionId and
///      nextStateRoot the registry returns are asserted against values computed
///      off-chain by scripts/fixture/build-fixture-witness.mjs. A successful
///      broadcast IS the cross-implementation check.
///
///      Sender must be the fixture controller (direct-call authorization path,
///      empty signature, msg.sender == authorizer).
///
///      Usage:
///        REGISTRY=0xDdf2... forge script contracts/script/FixtureAppend.s.sol \
///          --rpc-url "$SEPOLIA_RPC_URL" --broadcast
contract FixtureAppend is Script {
    error UnexpectedTransitionId(bytes32 got, bytes32 want);
    error UnexpectedStateRoot(bytes32 got, bytes32 want);
    error SenderIsNotFixtureController(address sender);
    error HeadNotAtSequenceFour(uint64 seq, bytes32 root);

    function run() external {
        IAgentMemoryState registry = IAgentMemoryState(vm.envAddress("REGISTRY"));
        bytes32 spaceId = FixtureData.SPACE_ID;

        // Precondition, checked before any broadcast: the Space must be exactly where
        // the builder assumed it was.
        (, bytes32 headRoot, uint64 headSeq) = registry.head(spaceId);
        if (headSeq != 4 || headRoot != FixtureData.EXPECTED_NEXT_ROOT_4) {
            revert HeadNotAtSequenceFour(headSeq, headRoot);
        }

        vm.startBroadcast();
        if (msg.sender != FixtureData.CONTROLLER) {
            revert SenderIsNotFixtureController(msg.sender);
        }

        (bytes32 transitionId, bytes32 returnedRoot) = registry.commitTransition(
            IAgentMemoryState.ExperienceDelta({
                spaceId: spaceId,
                sequence: 5,
                prevStateRoot: headRoot,
                deltaCommitment: FixtureData.DELTA_COMMITMENT_5,
                provenanceCommitment: FixtureData.PROVENANCE_COMMITMENT_5,
                profileId: FixtureData.PROFILE_ID_5,
                locatorCommitment: FixtureData.LOCATOR_COMMITMENT_5
            }),
            ""
        );
        vm.stopBroadcast();

        if (transitionId != FixtureData.EXPECTED_TRANSITION_ID_5) {
            revert UnexpectedTransitionId(transitionId, FixtureData.EXPECTED_TRANSITION_ID_5);
        }
        if (returnedRoot != FixtureData.EXPECTED_NEXT_ROOT_5) {
            revert UnexpectedStateRoot(returnedRoot, FixtureData.EXPECTED_NEXT_ROOT_5);
        }

        (, bytes32 newRoot, uint64 newSeq) = registry.head(spaceId);
        if (newRoot != FixtureData.EXPECTED_NEXT_ROOT_5 || newSeq != 5) {
            revert UnexpectedStateRoot(newRoot, FixtureData.EXPECTED_NEXT_ROOT_5);
        }

        console.log("fixture Space appended: sequence 5");
        console.logBytes32(transitionId);
        console.log("new head root:");
        console.logBytes32(newRoot);
    }
}
