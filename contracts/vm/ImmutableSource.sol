// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "./RainVM.sol";
import "@0xsequence/sstore2/contracts/SSTORE2.sol";

/// Constructor config for `ImmutableSource`.
struct ImmutableSourceConfig {
    /// Sources to be deployed as evm bytecode to build new `State` from.
    bytes[] sources;
    /// Constants to be deployed as evm bytecode to build new `State` from.
    uint[] constants;
    /// The length of the arguments array to build new `State` from.
    uint argumentsLength;
    /// The length of the stack array to build new `State` from.
    uint stackLength;
}

/// @title ImmutableSource
/// @notice Deploys everything required to build a fresh `State` for rainVM
/// execution as an evm contract onchain. Uses SSTORE2 to abi encode rain
/// script into evm bytecode, then stores an immutable pointer to the resulting
/// contract. Allows arbitrary length rain script source, constants and stack.
/// Gas scales for reads much better for longer data than attempting to put
/// all the source into storage.
/// See https://github.com/0xsequence/sstore2
abstract contract ImmutableSource {
    /// Points to the deployed evm bytecode containing rain script sources.
    address private immutable sourcesPointer;
    /// Points to the deployed evm bytecode containing rain script constants.
    address private immutable constantsPointer;
    /// Length of the arguments array to build new `State` from.
    uint private immutable argumentsLength;
    /// Length of the stack array to build new `State` from.
    uint private immutable stackLength;

    /// ABI encodes rain script source; saves pointers to the SSTORE2 contract.
    /// Arguments and stack length config is stored as standard immutable uint.
    constructor(ImmutableSourceConfig memory config_) {
        sourcesPointer = SSTORE2.write(abi.encode(config_.sources));
        constantsPointer = SSTORE2.write(abi.encode(config_.constants));
        argumentsLength = config_.argumentsLength;
        stackLength = config_.stackLength;
    }

    /// Returns only the sources from the deployed sources contract.
    function sources() public view returns(bytes[] memory) {
        return abi.decode(
            SSTORE2.read(sourcesPointer),
            (bytes[])
        );
    }

    /// Returns only the constants from the deployed contracts contract.
    function constants() public view returns(uint[] memory) {
        return abi.decode(
            SSTORE2.read(constantsPointer),
            (uint[])
        );
    }

    /// Builds a fresh state for rainVM execution from all construction data.
    /// This can be passed directly to `eval` for a `RainVM` contract.
    function newState() public view returns(State memory) {
        return State(
            sources(),
            constants(),
            new uint[](argumentsLength),
            new uint[](stackLength),
            0
        );
    }
}
