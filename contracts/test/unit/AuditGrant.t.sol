// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMemoryStateRegistry} from "../../src/reference/AgentMemoryStateRegistry.sol";
import {AuditGrant} from "../../src/extensions/AuditGrant.sol";
import {IAgentMemoryState} from "../../src/interfaces/IAgentMemoryState.sol";

contract AuditGrantTest is Test {
    AgentMemoryStateRegistry internal registry;
    AuditGrant internal extension;

    address internal controller = address(0xA11CE);
    address internal auditor = address(0xAD170);
    address internal stranger = address(0xBEEF);

    bytes32 internal constant SPACE_SALT = keccak256("space");
    bytes32 internal constant PROFILE = keccak256("profile/text/v1");

    bytes32 internal SPACE;
    bytes32[] internal transitionIds;

    function setUp() public {
        registry = new AgentMemoryStateRegistry();
        SPACE = registry.deriveSpaceId(controller, SPACE_SALT);
        extension = new AuditGrant(IAgentMemoryState(address(registry)));

        vm.startPrank(controller);
        registry.registerSpace(SPACE, controller, controller, SPACE_SALT, "");

        bytes32 prevRoot = bytes32(0);
        for (uint64 i = 1; i <= 3; i++) {
            IAgentMemoryState.ExperienceDelta memory delta = IAgentMemoryState.ExperienceDelta({
                spaceId: SPACE,
                sequence: i,
                prevStateRoot: prevRoot,
                deltaCommitment: keccak256(abi.encode("delta", i)),
                provenanceCommitment: bytes32(0),
                profileId: PROFILE,
                locatorCommitment: bytes32(0)
            });
            (bytes32 tid, bytes32 nextRoot) = registry.commitTransition(delta, "");
            transitionIds.push(tid);
            prevRoot = nextRoot;
        }
        vm.stopPrank();
    }

    /// Fold the witness set the way an off-chain verifier would.
    function _foldAll(uint256 count) internal view returns (bytes32 root) {
        root = bytes32(0);
        for (uint256 i = 0; i < count; i++) {
            bytes32 witnessHash = keccak256(abi.encode("witness", i));
            root = extension.foldWitnessRoot(root, transitionIds[i], witnessHash);
        }
    }

    function test_FoldMatchesManualComputation() public view {
        bytes32 witnessHash = keccak256(abi.encode("witness", uint256(0)));
        bytes32 expected = keccak256(
            abi.encode(
                extension.AUDIT_WITNESS_TYPEHASH(), bytes32(0), transitionIds[0], witnessHash
            )
        );
        assertEq(extension.foldWitnessRoot(bytes32(0), transitionIds[0], witnessHash), expected);
    }

    function test_ControllerGrantsAndAuditorAcknowledges() public {
        bytes32 root = _foldAll(3);

        vm.prank(controller);
        bytes32 grantId = extension.grant(SPACE, auditor, 1, 3, root);
        assertEq(grantId, extension.deriveGrantId(SPACE, auditor, 1, 3));

        AuditGrant.Grant memory g = extension.grantOf(grantId);
        assertEq(g.auditor, auditor);
        assertEq(g.witnessSetRoot, root);
        assertEq(g.acknowledgedAt, 0);
        assertFalse(g.revoked);

        vm.prank(auditor);
        extension.acknowledge(SPACE, grantId, root);

        assertGt(extension.grantOf(grantId).acknowledgedAt, 0);
    }

    /// The point of the design: an incomplete disclosure folds to a different root.
    function test_IncompleteDisclosureFailsAcknowledgement() public {
        bytes32 fullRoot = _foldAll(3);

        vm.prank(controller);
        bytes32 grantId = extension.grant(SPACE, auditor, 1, 3, fullRoot);

        bytes32 partialRoot = _foldAll(2);
        assertTrue(partialRoot != fullRoot);

        vm.prank(auditor);
        vm.expectRevert(AuditGrant.RootMismatch.selector);
        extension.acknowledge(SPACE, grantId, partialRoot);
    }

    function test_RevertWhen_NotController() public {
        // Fold before the cheatcode: `_foldAll` makes an external call, and vm.prank /
        // vm.expectRevert only apply to the very next call.
        bytes32 root = _foldAll(3);

        vm.prank(stranger);
        vm.expectRevert(AuditGrant.NotSpaceController.selector);
        extension.grant(SPACE, auditor, 1, 3, root);
    }

    function test_RevertWhen_RangeInvalid() public {
        bytes32 root = _foldAll(3);

        vm.prank(controller);
        vm.expectRevert(AuditGrant.InvalidRange.selector);
        extension.grant(SPACE, auditor, 0, 3, root);

        vm.prank(controller);
        vm.expectRevert(AuditGrant.InvalidRange.selector);
        extension.grant(SPACE, auditor, 3, 2, root);

        vm.prank(controller);
        vm.expectRevert(AuditGrant.RangeExceedsHead.selector);
        extension.grant(SPACE, auditor, 1, 4, root);
    }

    function test_RevertWhen_DuplicateGrant() public {
        bytes32 root = _foldAll(3);

        vm.startPrank(controller);
        extension.grant(SPACE, auditor, 1, 3, root);
        vm.expectRevert(AuditGrant.GrantExists.selector);
        extension.grant(SPACE, auditor, 1, 3, root);
        vm.stopPrank();
    }

    function test_RevertWhen_AcknowledgedByNonAuditorOrTwice() public {
        bytes32 root = _foldAll(3);

        vm.prank(controller);
        bytes32 grantId = extension.grant(SPACE, auditor, 1, 3, root);

        vm.prank(stranger);
        vm.expectRevert(AuditGrant.NotAuditor.selector);
        extension.acknowledge(SPACE, grantId, root);

        vm.startPrank(auditor);
        extension.acknowledge(SPACE, grantId, root);
        vm.expectRevert(AuditGrant.AlreadyAcknowledged.selector);
        extension.acknowledge(SPACE, grantId, root);
        vm.stopPrank();
    }

    function test_RevokeBlocksAcknowledgement() public {
        bytes32 root = _foldAll(3);

        vm.prank(controller);
        bytes32 grantId = extension.grant(SPACE, auditor, 1, 3, root);

        vm.prank(controller);
        extension.revoke(SPACE, grantId);
        assertTrue(extension.grantOf(grantId).revoked);

        vm.prank(auditor);
        vm.expectRevert(AuditGrant.GrantIsRevoked.selector);
        extension.acknowledge(SPACE, grantId, root);
    }

    function test_RevertWhen_EmptyRootOrZeroAuditor() public {
        // Fold before the cheatcodes, for the same reason as above.
        bytes32 root = _foldAll(3);

        vm.startPrank(controller);
        vm.expectRevert(AuditGrant.EmptyWitnessRoot.selector);
        extension.grant(SPACE, auditor, 1, 3, bytes32(0));

        vm.expectRevert(AuditGrant.ZeroAuditor.selector);
        extension.grant(SPACE, address(0), 1, 3, root);
        vm.stopPrank();
    }
}
