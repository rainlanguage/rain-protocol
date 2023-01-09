// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import "../run/IInterpreterV1.sol";

/// A fully qualified namespace includes the interpreter's own namespacing logic
/// IN ADDITION to the calling contract's requested `StateNamespace`. Typically
/// this involves hashing the `msg.sender` into the `StateNamespace` so that each
/// caller operates within its own disjoint state universe. Intepreters MUST NOT
/// allow either the caller nor any expression/word to modify this directly on
/// pain of potential key collisions on writes to the interpreter's own storage.
type FullyQualifiedNamespace is uint256;

interface IInterpreterStoreV1 {
    /// Applies state changes from a prior eval to the storage of the
    /// interpreter. The interpreter is responsible for ensuring that applying
    /// these state changes is safe from key collisions, both with any internal
    /// state the interpreter needs for itself and with calls to `set`
    /// from different `msg.sender` callers. I.e. it MUST NOT be possible for
    /// a caller to modify the state changes associated with some other caller.
    ///
    /// The interpreter defines the shape of its own state changes, which is
    /// opaque to the calling contract. For example, some interpreter may treat
    /// the list of state changes as a pairwise key/value set, and some other
    /// interpreter may treat it as a literal list to be stored as-is.
    ///
    /// The interpreter MUST assume the state changes have been corrupted by the
    /// calling contract due to bugs or malicious intent, and enforce state
    /// isolation between callers despite arbitrarily invalid state changes. The
    /// interpreter MUST revert if it can detect invalid state changes, such
    /// as a key/value list having an odd number of items, but this MAY NOT be
    /// possible if the corruption is undetectable.
    ///
    /// @param kvs The list of changes to apply to the store's internal state.
    function set(StateNamespace namespace, uint256[] calldata kvs) external;

    function get(
        FullyQualifiedNamespace namespace,
        uint256 key
    ) external view returns (uint256);
}
