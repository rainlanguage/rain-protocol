// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Source } from "./RainVM.sol";

import "@0xsequence/sstore2/contracts/SSTORE2.sol";

abstract contract ImmutableSource {
    address private immutable constantsPointer;
    address private immutable sourcePointer;

    constructor(
        Source memory source_
    ) {
        constantsPointer = SSTORE2.write(abi.encode(source_.constants));
        sourcePointer = SSTORE2.write(source_.source);
    }

    function source() public view returns(Source memory) {
        bytes memory source_ = SSTORE2.read(sourcePointer);

        uint256[] memory constants_ = abi.decode(
            SSTORE2.read(constantsPointer),
            (uint256[])
        );

        uint256[] memory arguments_ = new uint256[](0);
        return Source(source_, constants_, arguments_);
    }
}
