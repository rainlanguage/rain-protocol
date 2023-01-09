// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../store/IInterpreterStoreV1.sol";
import "../run/LibInterpreterState.sol";

contract RainterpreterStore is IInterpreterStoreV1 {
    using LibInterpreterState for StateNamespace;

    /// Store is several tiers of sandbox.
    ///
    /// 0. address is msg.sender so that callers cannot attack each other
    /// 1. StateNamespace is caller-provided namespace so that expressions cannot
    ///    attack each other
    /// 2. uint256 is expression-provided key
    /// 3. uint256 is expression-provided value
    ///
    /// tiers 0 and 1 are both embodied in the `FullyQualifiedNamespace`.
    mapping(FullyQualifiedNamespace => mapping(uint256 => uint256))
        internal store;

    /// @inheritdoc IInterpreterStoreV1
    function set(StateNamespace namespace_, uint256[] calldata kvs_) external {
        FullyQualifiedNamespace fullyQualifiedNamespace_ = namespace_
            .qualifyNamespace();
        unchecked {
            for (uint256 i_ = 0; i_ < kvs_.length; i_ += 2) {
                store[fullyQualifiedNamespace_][kvs_[i_]] = kvs_[i_ + 1];
            }
        }
    }

    /// @inheritdoc IInterpreterStoreV1
    function get(
        FullyQualifiedNamespace namespace_,
        uint256 key_
    ) external view returns (uint256) {
        return store[namespace_][key_];
    }
}
