// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";
import "../../sstore2/SSTORE2.sol";

/// Config required to build a new `State`.
struct StateConfig {
    /// Sources verbatim.
    bytes[] sources;
    /// Constants verbatim.
    uint256[] constants;
    /// Sets the length of the uint256[] of the stack.
    uint256 stackLength;
    /// Sets the length of the uint256[] of the arguments.
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
    /// A new shapshot has been deployed onchain.
    event Snapshot(
        /// `msg.sender` of the deployer.
        address sender,
        /// Pointer to the onchain snapshot contract.
        address pointer,
        /// `State` of the snapshot that was deployed.
        State state_
    );

    /// Builds a new `State` from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
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

    /// Snapshot a RainVM state as an immutable onchain contract.
    /// Usually `State` will be new as per `newState` but can be a snapshot of
    /// an "in flight" execution state also.
    /// @param state_ The state to snapshot.
    function snapshot(State memory state_) internal returns (address) {
        address pointer_ = SSTORE2.write(abi.encode(state_));
        emit Snapshot(msg.sender, pointer_, state_);
        return pointer_;
    }

    /// Builds a fresh state for rainVM execution from all construction data.
    /// This can be passed directly to `eval` for a `RainVM` contract.
    /// @param pointer_ The pointer (address) of the snapshot to restore.
    function restore(address pointer_) internal view returns (State memory) {
        return abi.decode(SSTORE2.read(pointer_), (State));
    }
}
