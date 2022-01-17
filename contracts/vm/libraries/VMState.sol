// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";
import "@0xsequence/sstore2/contracts/SSTORE2.sol";

struct StateConfig {
    bytes[] sources;
    uint256[] constants;
    uint256 stackLength;
    uint256 argumentsLength;
}

/// @title StateSnapshot
/// @notice Deploys everything required to build a fresh `State` for rainVM
/// execution as an evm contract onchain. Uses SSTORE2 to abi encode rain
/// script into evm bytecode, then stores an immutable pointer to the resulting
/// contract. Allows arbitrary length rain script source, constants and stack.
/// Gas scales for reads much better for longer data than attempting to put
/// all the source into storage.
/// See https://github.com/0xsequence/sstore2
library VMState {
    event Snapshot(address sender, address pointer, State state_);

    function newState(StateConfig memory config_)
        internal
        pure
        returns (State memory)
    {
        return
            State(
                0,
                new uint256[](config_.stackLength),
                config_.sources,
                config_.constants,
                new uint256[](config_.argumentsLength)
            );
    }

    /// Snapshot a rainVM state as an immutable onchain contract.
    function snapshot(State memory state_) internal returns (address) {
        address pointer_ = SSTORE2.write(abi.encode(state_));
        emit Snapshot(msg.sender, pointer_, state_);
        return pointer_;
    }

    /// Builds a fresh state for rainVM execution from all construction data.
    /// This can be passed directly to `eval` for a `RainVM` contract.
    function restore(address pointer_) internal view returns (State memory) {
        return abi.decode(SSTORE2.read(pointer_), (State));
    }
}
