// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IAgentMemoryState} from "../interfaces/IAgentMemoryState.sol";

/// @title AuditGrant
/// @notice Optional registry binding a selective disclosure to a verifiable, complete
///         witness set over a stated sequence range.
///
/// @dev Why this exists. A verifier can already check one disclosed witness against the
///      `deltaCommitment` recorded by the core registry. What per-item checking cannot
///      establish is *completeness*: the controller chooses which witnesses to hand over,
///      so a cherry-picked subset verifies just as well as an honest one. This contract
///      makes the controller commit to the ordered witness set for a range **before**
///      disclosure, so withholding, reordering, or substituting any single witness
///      changes the committed root and is detected.
///
///      The root is folded in the same shape the protocol already uses for state roots:
///
///          root_0 = 0
///          root_i = keccak256(abi.encode(
///              AUDIT_WITNESS_TYPEHASH, root_{i-1}, transitionId_i, witnessHash_i
///          ))
///
///      taken in ascending `sequence` order across `[fromSequence, toSequence]` with no
///      gaps, where `witnessHash_i = keccak256(witnessBytes_i)` over the payload, salts,
///      and locator disclosed for that transition. `foldWitnessRoot` is exposed so that
///      off-chain implementations fold identically.
///
///      What a grant does NOT prove: that the committed witnesses are truthful, that the
///      underlying data is still available, that disclosure actually took place off
///      chain, or that the auditor is honest or competent. An acknowledgement records
///      that an auditor asserted a matching root; since the committed root is public, an
///      acknowledgement alone is not evidence of receipt. It establishes a non-repudiable
///      record of *which* disclosure was accepted, not that it was read.
contract AuditGrant {
    error UnknownSpace();
    error NotSpaceController();
    error InvalidRange();
    error RangeExceedsHead();
    error EmptyWitnessRoot();
    error ZeroAuditor();
    error GrantExists();
    error UnknownGrant();
    error WrongSpace(bytes32 expected, bytes32 received);
    error NotAuditor();
    error AlreadyAcknowledged();
    error GrantIsRevoked();
    error RootMismatch();

    struct Grant {
        address auditor;
        uint64 fromSequence;
        uint64 toSequence;
        bytes32 witnessSetRoot;
        uint64 grantedAt;
        uint64 acknowledgedAt;
        bool revoked;
    }

    string public constant AUDIT_WITNESS_TYPE =
        "AuditWitness(bytes32 prevRoot,bytes32 transitionId,bytes32 witnessHash)";

    bytes32 public constant AUDIT_WITNESS_TYPEHASH = keccak256(bytes(AUDIT_WITNESS_TYPE));

    IAgentMemoryState public immutable registry;

    mapping(bytes32 grantId => Grant grant) private _grants;
    mapping(bytes32 grantId => bytes32 spaceId) private _grantSpaces;

    event AuditGranted(
        bytes32 indexed spaceId,
        address indexed auditor,
        bytes32 indexed grantId,
        uint64 fromSequence,
        uint64 toSequence,
        bytes32 witnessSetRoot
    );

    event AuditAcknowledged(
        bytes32 indexed spaceId, address indexed auditor, bytes32 indexed grantId
    );

    event AuditRevoked(bytes32 indexed spaceId, address indexed auditor, bytes32 indexed grantId);

    constructor(IAgentMemoryState registry_) {
        registry = registry_;
    }

    /// @notice Deterministic identifier for a grant. A given (space, auditor, range) can
    ///         be granted once. Revocation preserves history and does not make the ID reusable.
    function deriveGrantId(bytes32 spaceId, address auditor, uint64 fromSequence, uint64 toSequence)
        public
        pure
        returns (bytes32 grantId)
    {
        return keccak256(abi.encode(spaceId, auditor, fromSequence, toSequence));
    }

    /// @notice Fold one witness into the running root. Exposed for off-chain parity.
    function foldWitnessRoot(bytes32 prevRoot, bytes32 transitionId, bytes32 witnessHash)
        public
        pure
        returns (bytes32 nextRoot)
    {
        return keccak256(abi.encode(AUDIT_WITNESS_TYPEHASH, prevRoot, transitionId, witnessHash));
    }

    /// @notice Commit to the complete witness set for `[fromSequence, toSequence]` and
    ///         name the auditor entitled to receive it.
    /// @dev The range must be non-empty, start at or after the first transition, and not
    ///      run past the Space head at grant time. The contract does not transport the
    ///      witnesses; disclosure happens out of band.
    function grant(
        bytes32 spaceId,
        address auditor,
        uint64 fromSequence,
        uint64 toSequence,
        bytes32 witnessSetRoot
    ) external returns (bytes32 grantId) {
        if (auditor == address(0)) revert ZeroAuditor();
        if (witnessSetRoot == bytes32(0)) revert EmptyWitnessRoot();
        if (fromSequence == 0 || toSequence < fromSequence) revert InvalidRange();

        address controller = _controllerOf(spaceId);
        if (msg.sender != controller) revert NotSpaceController();

        (,, uint64 headSequence) = registry.head(spaceId);
        if (toSequence > headSequence) revert RangeExceedsHead();

        grantId = deriveGrantId(spaceId, auditor, fromSequence, toSequence);
        if (_grants[grantId].witnessSetRoot != bytes32(0)) revert GrantExists();

        _grants[grantId] = Grant({
            auditor: auditor,
            fromSequence: fromSequence,
            toSequence: toSequence,
            witnessSetRoot: witnessSetRoot,
            grantedAt: uint64(block.timestamp),
            acknowledgedAt: 0,
            revoked: false
        });
        _grantSpaces[grantId] = spaceId;

        emit AuditGranted(spaceId, auditor, grantId, fromSequence, toSequence, witnessSetRoot);
    }

    /// @notice Auditor records that the disclosure it received folds to the committed root.
    /// @dev `computedRoot` must equal the committed root, so an acknowledgement always
    ///      points at one specific disclosure. See the contract-level note on what this
    ///      does and does not prove.
    function acknowledge(bytes32 spaceId, bytes32 grantId, bytes32 computedRoot) external {
        Grant storage g = _grantForSpace(spaceId, grantId);
        if (g.revoked) revert GrantIsRevoked();
        if (msg.sender != g.auditor) revert NotAuditor();
        if (g.acknowledgedAt != 0) revert AlreadyAcknowledged();
        if (computedRoot != g.witnessSetRoot) revert RootMismatch();

        g.acknowledgedAt = uint64(block.timestamp);

        emit AuditAcknowledged(spaceId, g.auditor, grantId);
    }

    /// @notice Withdraw a grant. History is preserved: prior events remain on chain.
    function revoke(bytes32 spaceId, bytes32 grantId) external {
        Grant storage g = _grantForSpace(spaceId, grantId);
        if (g.revoked) revert GrantIsRevoked();

        address controller = _controllerOf(spaceId);
        if (msg.sender != controller) revert NotSpaceController();

        g.revoked = true;

        emit AuditRevoked(spaceId, g.auditor, grantId);
    }

    function grantOf(bytes32 grantId) external view returns (Grant memory) {
        Grant memory g = _grants[grantId];
        if (g.witnessSetRoot == bytes32(0)) revert UnknownGrant();
        return g;
    }

    function spaceOf(bytes32 grantId) external view returns (bytes32 spaceId) {
        spaceId = _grantSpaces[grantId];
        if (spaceId == bytes32(0)) revert UnknownGrant();
    }

    function _grantForSpace(bytes32 spaceId, bytes32 grantId)
        private
        view
        returns (Grant storage g)
    {
        g = _grants[grantId];
        if (g.witnessSetRoot == bytes32(0)) revert UnknownGrant();
        bytes32 expectedSpaceId = _grantSpaces[grantId];
        if (spaceId != expectedSpaceId) revert WrongSpace(expectedSpaceId, spaceId);
    }

    function _controllerOf(bytes32 spaceId) internal view returns (address controller) {
        (controller,,) = registry.spaceAuthorization(spaceId);
        if (controller == address(0)) revert UnknownSpace();
    }
}
