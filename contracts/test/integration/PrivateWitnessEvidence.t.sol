// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AuditGrant} from "../../src/extensions/AuditGrant.sol";
import {IAgentMemoryState} from "../../src/interfaces/IAgentMemoryState.sol";
import {AgentMemoryStateRegistry} from "../../src/reference/AgentMemoryStateRegistry.sol";
import {PrivateCommitment} from "../../src/reference/PrivateCommitment.sol";

contract PrivateWitnessEvidenceTest is Test {
    uint256 internal constant CONTROLLER_PK = 0xA11CE;
    uint256 internal constant ATTACKER_PK = 0xB0B;
    address internal constant RELAYER = address(0xBEEF);

    AgentMemoryStateRegistry internal registry;
    AuditGrant internal auditGrant;
    string internal publicEvidence;
    string internal auditorDisclosure;
    address internal controller;
    address internal auditor;
    bytes32 internal spaceId;

    function setUp() public {
        registry = new AgentMemoryStateRegistry();
        auditGrant = new AuditGrant(IAgentMemoryState(address(registry)));
        publicEvidence = vm.readFile(
            string.concat(
                vm.projectRoot(), "/../test-vectors/private-witness/tool-trace-v1.public.json"
            )
        );
        auditorDisclosure = vm.readFile(
            string.concat(
                vm.projectRoot(), "/../test-vectors/private-witness/tool-trace-v1.auditor.json"
            )
        );
        controller = vm.parseJsonAddress(publicEvidence, ".onChain.space.controller");
        auditor = vm.parseJsonAddress(publicEvidence, ".onChain.auditGrant.auditor");
        spaceId = _publicBytes32(".onChain.space.spaceId");
        assertEq(controller, vm.addr(CONTROLLER_PK), "fixture controller/key mismatch");
    }

    function test_PrivateInputToAuthorizedTransitionToSelectiveAudit() public {
        _registerSpaceThroughRelayer();
        _assertWrongAuthorizerRejected();
        _commitPublicTransition(0);
        _commitPublicTransition(1);
        _assertPublicHead();

        bytes32 witnessSetRoot = _verifySequenceTwoDisclosure();
        _grantAndAcknowledge(witnessSetRoot);
    }

    function _registerSpaceThroughRelayer() private {
        bytes32 spaceSalt = _publicBytes32(".onChain.space.spaceSalt");
        address authorizer = vm.parseJsonAddress(publicEvidence, ".onChain.space.authorizer");
        assertEq(registry.deriveSpaceId(controller, spaceSalt), spaceId);

        bytes32 registrationId = registry.hashSpaceRegistration(spaceId, controller, authorizer);
        bytes memory signature = _sign(CONTROLLER_PK, registrationId);
        vm.prank(RELAYER);
        registry.registerSpace(spaceId, controller, authorizer, spaceSalt, signature);

        (address storedController, address storedAuthorizer, uint64 nonce) =
            registry.spaceAuthorization(spaceId);
        assertEq(storedController, controller);
        assertEq(storedAuthorizer, authorizer);
        assertEq(nonce, 0);
    }

    function _assertWrongAuthorizerRejected() private {
        IAgentMemoryState.ExperienceDelta memory delta = _publicDelta(0);
        bytes32 transitionId = registry.hashExperienceDelta(delta);
        bytes memory signature = _sign(ATTACKER_PK, transitionId);

        vm.prank(RELAYER);
        vm.expectRevert(AgentMemoryStateRegistry.InvalidAuthorization.selector);
        registry.commitTransition(delta, signature);
    }

    function _commitPublicTransition(uint256 index) private {
        IAgentMemoryState.ExperienceDelta memory delta = _publicDelta(index);
        string memory base = _transitionBase(index);
        bytes32 expectedId = _publicBytes32(string.concat(base, ".transitionId"));
        bytes32 expectedRoot = _publicBytes32(string.concat(base, ".nextStateRoot"));
        assertEq(registry.hashExperienceDelta(delta), expectedId);

        vm.prank(RELAYER);
        (bytes32 transitionId, bytes32 nextStateRoot) =
            registry.commitTransition(delta, _sign(CONTROLLER_PK, expectedId));
        assertEq(transitionId, expectedId);
        assertEq(nextStateRoot, expectedRoot);
    }

    function _assertPublicHead() private view {
        (bytes32 transitionId, bytes32 stateRoot, uint64 sequence) = registry.head(spaceId);
        assertEq(transitionId, _publicBytes32(".onChain.head.transitionId"));
        assertEq(stateRoot, _publicBytes32(".onChain.head.stateRoot"));
        assertEq(sequence, uint64(vm.parseUint(_publicString(".onChain.head.sequence"))));
    }

    function _verifySequenceTwoDisclosure() private view returns (bytes32 witnessSetRoot) {
        IAgentMemoryState.ExperienceDelta memory delta = _publicDelta(1);
        assertEq(_disclosureString(".items[0].witness.sequence"), "2");
        assertEq(
            _disclosureBytes32(".items[0].witness.transitionId"),
            _publicBytes32(".onChain.transitions[1].transitionId")
        );

        _assertDisclosedCommitments(delta);

        string memory witnessUtf8 = _disclosureString(".items[0].encoded.witnessUtf8");
        bytes32 witnessHash = keccak256(bytes(witnessUtf8));
        witnessSetRoot = auditGrant.foldWitnessRoot(
            bytes32(0), _publicBytes32(".onChain.transitions[1].transitionId"), witnessHash
        );
        assertEq(witnessSetRoot, _publicBytes32(".onChain.auditGrant.witnessSetRoot"));

        bytes32 tamperedHash = keccak256(bytes(string.concat(witnessUtf8, " ")));
        bytes32 tamperedRoot = auditGrant.foldWitnessRoot(
            bytes32(0), _publicBytes32(".onChain.transitions[1].transitionId"), tamperedHash
        );
        assertTrue(tamperedRoot != witnessSetRoot);
    }

    function _assertDisclosedCommitments(IAgentMemoryState.ExperienceDelta memory delta)
        private
        view
    {
        string memory payloadUtf8 = _disclosureString(".items[0].encoded.payloadUtf8");
        bytes32 deltaSalt = _disclosureBytes32(".items[0].witness.deltaSalt");
        assertEq(
            PrivateCommitment.computeDelta(bytes(payloadUtf8), deltaSalt, delta.profileId),
            delta.deltaCommitment
        );
        assertTrue(
            PrivateCommitment.computeDelta(
                bytes(string.concat(payloadUtf8, " ")), deltaSalt, delta.profileId
            ) != delta.deltaCommitment
        );

        assertEq(
            PrivateCommitment.computeProvenance(
                bytes(_disclosureString(".items[0].encoded.provenanceUtf8")),
                _disclosureBytes32(".items[0].witness.provenanceSalt")
            ),
            delta.provenanceCommitment
        );
        assertEq(
            PrivateCommitment.computeLocator(
                bytes(_disclosureString(".items[0].witness.locator")),
                _disclosureBytes32(".items[0].witness.locatorSalt")
            ),
            delta.locatorCommitment
        );
    }

    function _grantAndAcknowledge(bytes32 witnessSetRoot) private {
        uint64 fromSequence =
            uint64(vm.parseUint(_publicString(".onChain.auditGrant.fromSequence")));
        uint64 toSequence = uint64(vm.parseUint(_publicString(".onChain.auditGrant.toSequence")));
        bytes32 expectedGrantId = _publicBytes32(".onChain.auditGrant.grantId");
        assertEq(
            auditGrant.deriveGrantId(spaceId, auditor, fromSequence, toSequence), expectedGrantId
        );

        vm.warp(1_800_000_000);
        vm.prank(controller);
        bytes32 grantId =
            auditGrant.grant(spaceId, auditor, fromSequence, toSequence, witnessSetRoot);
        assertEq(grantId, expectedGrantId);

        string memory witnessUtf8 = _disclosureString(".items[0].encoded.witnessUtf8");
        bytes32 tamperedRoot = auditGrant.foldWitnessRoot(
            bytes32(0),
            _publicBytes32(".onChain.transitions[1].transitionId"),
            keccak256(bytes(string.concat(witnessUtf8, " ")))
        );
        vm.prank(auditor);
        vm.expectRevert(AuditGrant.RootMismatch.selector);
        auditGrant.acknowledge(spaceId, grantId, tamperedRoot);

        vm.prank(auditor);
        auditGrant.acknowledge(spaceId, grantId, witnessSetRoot);
        assertGt(auditGrant.grantOf(grantId).acknowledgedAt, 0);
    }

    function _publicDelta(uint256 index)
        private
        view
        returns (IAgentMemoryState.ExperienceDelta memory)
    {
        string memory base = _transitionBase(index);
        return IAgentMemoryState.ExperienceDelta({
            spaceId: _publicBytes32(string.concat(base, ".spaceId")),
            sequence: uint64(vm.parseUint(_publicString(string.concat(base, ".sequence")))),
            prevStateRoot: _publicBytes32(string.concat(base, ".prevStateRoot")),
            deltaCommitment: _publicBytes32(string.concat(base, ".deltaCommitment")),
            provenanceCommitment: _publicBytes32(string.concat(base, ".provenanceCommitment")),
            profileId: _publicBytes32(string.concat(base, ".profileId")),
            locatorCommitment: _publicBytes32(string.concat(base, ".locatorCommitment"))
        });
    }

    function _sign(uint256 privateKey, bytes32 structHash) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, registry.signingDigest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _transitionBase(uint256 index) private pure returns (string memory) {
        return string.concat(".onChain.transitions[", vm.toString(index), "]");
    }

    function _publicBytes32(string memory path) private view returns (bytes32) {
        return vm.parseJsonBytes32(publicEvidence, path);
    }

    function _publicString(string memory path) private view returns (string memory) {
        return vm.parseJsonString(publicEvidence, path);
    }

    function _disclosureBytes32(string memory path) private view returns (bytes32) {
        return vm.parseJsonBytes32(auditorDisclosure, path);
    }

    function _disclosureString(string memory path) private view returns (string memory) {
        return vm.parseJsonString(auditorDisclosure, path);
    }
}
