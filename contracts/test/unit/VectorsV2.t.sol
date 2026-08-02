// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IAgentMemoryState} from "../../src/interfaces/IAgentMemoryState.sol";
import {AgentMemoryStateRegistry} from "../../src/reference/AgentMemoryStateRegistry.sol";

/// @notice Drives `test-vectors/v2.json` against the registry.
/// @dev Reads the *published file* rather than regenerated constants. A test built on
///      constants emitted by the same generator proves the generator agrees with
///      itself; this one fails if the shipped file and the implementation ever
///      diverge, which is the only failure an external implementer would care about.
///      (Same principle as the interop note's §6.1 corollary: verify the artifact,
///      not a transcription of it.)
///
///      Note what is *not* asserted here: `signingDigest`. That value binds chainId
///      and the registry address, so it necessarily differs for a locally deployed
///      instance. `transitionId` and `nextStateRoot` are domain-free by design — which
///      is exactly why the same vectors replay against any registry on any chain, and
///      why the identifier layer can stay chain-free while replay protection lives at
///      the signature layer.
contract VectorsV2Test is Test {
    using stdJson for string;

    AgentMemoryStateRegistry internal registry;
    string internal json;

    address internal controller;
    address internal authorizer;
    bytes32 internal spaceSalt;
    bytes32 internal spaceId;

    function setUp() public {
        registry = new AgentMemoryStateRegistry();
        json = vm.readFile("../test-vectors/v2.json");

        controller = json.readAddress(".space.controller");
        authorizer = json.readAddress(".space.authorizer");
        spaceSalt = json.readBytes32(".space.salt");
        spaceId = json.readBytes32(".space.spaceId");
    }

    function _register() internal {
        vm.prank(controller);
        registry.registerSpace(spaceId, controller, authorizer, spaceSalt, "");
    }

    function _delta(uint256 i) internal view returns (IAgentMemoryState.ExperienceDelta memory d) {
        string memory p = string.concat(".chain[", vm.toString(i), "].delta");
        d = IAgentMemoryState.ExperienceDelta({
            spaceId: json.readBytes32(string.concat(p, ".spaceId")),
            sequence: uint64(vm.parseUint(json.readString(string.concat(p, ".sequence")))),
            prevStateRoot: json.readBytes32(string.concat(p, ".prevStateRoot")),
            deltaCommitment: json.readBytes32(string.concat(p, ".deltaCommitment")),
            provenanceCommitment: json.readBytes32(string.concat(p, ".provenanceCommitment")),
            profileId: json.readBytes32(string.concat(p, ".profileId")),
            locatorCommitment: json.readBytes32(string.concat(p, ".locatorCommitment"))
        });
    }

    function _chainLength() internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(".chain[", vm.toString(n), "]"))) {
            n++;
        }
    }

    /// @notice The whole chain replays, in order, with every published value matching.
    function test_ChainReplays() public {
        _register();
        uint256 n = _chainLength();
        assertGt(n, 1, "a single-entry chain would not exercise linkage");

        for (uint256 i = 0; i < n; i++) {
            IAgentMemoryState.ExperienceDelta memory d = _delta(i);
            string memory e = string.concat(".chain[", vm.toString(i), "].expected");

            vm.prank(authorizer);
            (bytes32 transitionId, bytes32 nextStateRoot) = registry.commitTransition(d, "");

            assertEq(
                transitionId, json.readBytes32(string.concat(e, ".transitionId")), "transitionId"
            );
            assertEq(
                nextStateRoot, json.readBytes32(string.concat(e, ".nextStateRoot")), "nextStateRoot"
            );

            (, bytes32 headRoot, uint64 headSeq) = registry.head(spaceId);
            assertEq(headRoot, nextStateRoot, "head root advanced");
            assertEq(headSeq, d.sequence, "head sequence advanced");
        }
    }

    /// @dev The next valid delta after the published chain — the base every rejection
    ///      mutates exactly one field of, so each test isolates one rule.
    function _nextValid() internal view returns (IAgentMemoryState.ExperienceDelta memory d) {
        uint256 n = _chainLength();
        (, bytes32 headRoot, uint64 headSeq) = registry.head(spaceId);
        d = _delta(n - 1);
        d.sequence = headSeq + 1;
        d.prevStateRoot = headRoot;
        d.deltaCommitment = keccak256("vectors-v2-rejection-base");
    }

    function _replayChain() internal {
        _register();
        uint256 n = _chainLength();
        for (uint256 i = 0; i < n; i++) {
            vm.prank(authorizer);
            registry.commitTransition(_delta(i), "");
        }
    }

    function test_Rejects_UnknownSpace() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        d.spaceId = keccak256("never-registered");
        vm.prank(authorizer);
        vm.expectRevert(AgentMemoryStateRegistry.UnknownSpace.selector);
        registry.commitTransition(d, "");
    }

    function test_Rejects_ZeroDeltaCommitment() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        d.deltaCommitment = bytes32(0);
        vm.prank(authorizer);
        vm.expectRevert(AgentMemoryStateRegistry.ZeroDeltaCommitment.selector);
        registry.commitTransition(d, "");
    }

    function test_Rejects_ZeroProfileId() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        d.profileId = bytes32(0);
        vm.prank(authorizer);
        vm.expectRevert(AgentMemoryStateRegistry.ZeroProfileId.selector);
        registry.commitTransition(d, "");
    }

    function test_Rejects_SequenceSkipsAhead() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        uint64 expected = d.sequence;
        d.sequence = expected + 1;
        vm.prank(authorizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentMemoryStateRegistry.BadSequence.selector, expected, expected + 1
            )
        );
        registry.commitTransition(d, "");
    }

    function test_Rejects_SequenceReplay() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        uint64 expected = d.sequence;
        d.sequence = expected - 1;
        vm.prank(authorizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentMemoryStateRegistry.BadSequence.selector, expected, expected - 1
            )
        );
        registry.commitTransition(d, "");
    }

    /// @dev Correct sequence, stale prior root: this is the check that forbids forking
    ///      a Space's history, and it is the one a naive implementation omits because
    ///      the sequence already "looks right".
    function test_Rejects_ForkedPriorState() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        bytes32 headRoot = d.prevStateRoot;
        bytes32 staleRoot = json.readBytes32(".chain[0].expected.nextStateRoot");
        d.prevStateRoot = staleRoot;
        vm.prank(authorizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentMemoryStateRegistry.BadPreviousState.selector, headRoot, staleRoot
            )
        );
        registry.commitTransition(d, "");
    }

    function test_Rejects_UnauthorizedCaller() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.commitTransition(d, "");
    }

    function test_Rejects_MalformedSignatureLength() public {
        _replayChain();
        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.commitTransition(d, hex"deadbeef");
    }

    function test_Rejects_ZeroSpaceId() public {
        vm.prank(controller);
        vm.expectRevert(AgentMemoryStateRegistry.ZeroSpaceId.selector);
        registry.registerSpace(bytes32(0), controller, authorizer, spaceSalt, "");
    }

    function test_Rejects_ZeroAddress() public {
        vm.prank(controller);
        vm.expectRevert(AgentMemoryStateRegistry.ZeroAddress.selector);
        registry.registerSpace(spaceId, address(0), authorizer, spaceSalt, "");
    }

    function test_Rejects_UnderivedSpaceId() public {
        bytes32 claimed = keccak256("not-derived");
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentMemoryStateRegistry.InvalidSpaceId.selector, spaceId, claimed
            )
        );
        registry.registerSpace(claimed, controller, authorizer, spaceSalt, "");
    }

    function test_Rejects_ReRegistration() public {
        _register();
        vm.prank(controller);
        vm.expectRevert(AgentMemoryStateRegistry.SpaceAlreadyRegistered.selector);
        registry.registerSpace(spaceId, controller, authorizer, spaceSalt, "");
    }

    /// @notice A rejected transition must leave the head exactly where it was.
    /// @dev The rejection tests above prove the error; this proves the absence of a
    ///      side effect, which is the property that actually matters to a reader
    ///      reconstructing a history.
    function test_RejectedTransitionDoesNotMoveHead() public {
        _replayChain();
        (bytes32 idBefore, bytes32 rootBefore, uint64 seqBefore) = registry.head(spaceId);

        IAgentMemoryState.ExperienceDelta memory d = _nextValid();
        d.sequence = seqBefore + 5;
        vm.prank(authorizer);
        vm.expectRevert();
        registry.commitTransition(d, "");

        (bytes32 idAfter, bytes32 rootAfter, uint64 seqAfter) = registry.head(spaceId);
        assertEq(idAfter, idBefore, "head transitionId moved");
        assertEq(rootAfter, rootBefore, "head root moved");
        assertEq(seqAfter, seqBefore, "head sequence moved");
    }
}
