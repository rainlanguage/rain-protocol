// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "./RainVM.sol";
import "@0xsequence/sstore2/contracts/SSTORE2.sol";

struct ImmutableSourceConfig {
    bytes source;
    uint256[] constants;
    uint8 argumentsLength;
    uint8 stackLength;
}

abstract contract ImmutableSource {
    address private immutable sourcePointer;
    address private immutable constantsPointer;
    uint8 private immutable argumentsLength;
    uint8 private immutable stackLength;

    constructor(ImmutableSourceConfig memory config_) {
        sourcePointer = SSTORE2.write(config_.source);
        constantsPointer = SSTORE2.write(abi.encode(config_.constants));
        argumentsLength = config_.argumentsLength;
        stackLength = config_.stackLength;
    }

    function source() public view returns(bytes memory) {
        return SSTORE2.read(sourcePointer);
    }

    function constants() public view returns(uint256[] memory) {
        return abi.decode(
            SSTORE2.read(constantsPointer),
            (uint256[])
        );
    }

    function newState() public view returns(State memory) {
        return State(
            constants(),
            new uint256[](argumentsLength),
            new uint256[](stackLength),
            0
        );
    }
}
