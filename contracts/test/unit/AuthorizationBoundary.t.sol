// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "../../src/ECDSA.sol";
import {IAgentMemoryState} from "../../src/interfaces/IAgentMemoryState.sol";
import {IERC1271} from "../../src/interfaces/IERC1271.sol";
import {AgentMemoryStateRegistry} from "../../src/reference/AgentMemoryStateRegistry.sol";

/// @dev Attempts a state-changing callback while the Registry is validating this
///      wallet through STATICCALL. It approves only when the callback is rejected.
contract Reentrant1271Wallet {
    AgentMemoryStateRegistry private immutable _registry;
    bytes private _callback;

    constructor(AgentMemoryStateRegistry registry_) {
        _registry = registry_;
    }

    function setCallback(bytes calldata callback_) external {
        _callback = callback_;
    }

    function isValidSignature(bytes32, bytes calldata) external returns (bytes4) {
        (bool success,) = address(_registry).call{gas: 100_000}(_callback);
        return success ? bytes4(0xffffffff) : IERC1271.isValidSignature.selector;
    }
}

contract AuthorizationBoundaryTest is Test {
    AgentMemoryStateRegistry internal registry;

    function setUp() public {
        registry = new AgentMemoryStateRegistry();
    }

    function test_ERC1271StaticcallBlocksReentrantRegistration() public {
        Reentrant1271Wallet wallet = new Reentrant1271Wallet(registry);
        bytes32 outerSalt = keccak256("outer-space");
        bytes32 nestedSalt = keccak256("nested-space");
        bytes32 outerSpace = registry.deriveSpaceId(address(wallet), outerSalt);
        bytes32 nestedSpace = registry.deriveSpaceId(address(wallet), nestedSalt);

        wallet.setCallback(
            abi.encodeCall(
                registry.registerSpace,
                (nestedSpace, address(wallet), address(wallet), nestedSalt, bytes(""))
            )
        );

        registry.registerSpace(outerSpace, address(wallet), address(wallet), outerSalt, hex"01");

        (address controller, address authorizer, uint64 nonce) =
            registry.spaceAuthorization(outerSpace);
        assertEq(controller, address(wallet));
        assertEq(authorizer, address(wallet));
        assertEq(nonce, 0);

        vm.expectRevert(AgentMemoryStateRegistry.UnknownSpace.selector);
        registry.spaceAuthorization(nestedSpace);
    }

    function test_ERC1271StaticcallBlocksReentrantAuthorizationUpdate() public {
        Reentrant1271Wallet wallet = new Reentrant1271Wallet(registry);
        bytes32 salt = keccak256("authorization-space");
        bytes32 spaceId = registry.deriveSpaceId(address(wallet), salt);
        address expectedAuthorizer = address(0xA11CE);
        address callbackTakeover = address(0xBAD);

        vm.prank(address(wallet));
        registry.registerSpace(spaceId, address(wallet), address(wallet), salt, "");

        wallet.setCallback(
            abi.encodeCall(
                registry.updateSpaceAuthorization,
                (spaceId, callbackTakeover, callbackTakeover, bytes(""))
            )
        );

        registry.updateSpaceAuthorization(spaceId, address(wallet), expectedAuthorizer, hex"01");

        (address controller, address authorizer, uint64 nonce) =
            registry.spaceAuthorization(spaceId);
        assertEq(controller, address(wallet));
        assertEq(authorizer, expectedAuthorizer);
        assertEq(nonce, 1);
    }

    function test_RevertWhen_ECDSASignatureVIsInvalid() public {
        uint256 controllerPk = 0xA11CE;
        address controller = vm.addr(controllerPk);
        bytes32 salt = keccak256("invalid-v-space");
        bytes32 spaceId = registry.deriveSpaceId(controller, salt);

        vm.prank(controller);
        registry.registerSpace(spaceId, controller, controller, salt, "");

        IAgentMemoryState.ExperienceDelta memory delta = IAgentMemoryState.ExperienceDelta({
            spaceId: spaceId,
            sequence: 1,
            prevStateRoot: bytes32(0),
            deltaCommitment: bytes32(uint256(0xAA)),
            provenanceCommitment: bytes32(0),
            profileId: keccak256("example/profile/v1"),
            locatorCommitment: bytes32(uint256(0xBB))
        });
        bytes32 digest = registry.signingDigest(registry.hashExperienceDelta(delta));
        (, bytes32 r, bytes32 s) = vm.sign(controllerPk, digest);

        vm.expectRevert(ECDSA.InvalidSignature.selector);
        registry.commitTransition(delta, abi.encodePacked(r, s, uint8(29)));
    }
}
