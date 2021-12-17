// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Source } from "./RainVM.sol";

abstract contract ImmutableSource {
    uint256 public immutable constant0;
    uint256 public immutable constant1;
    uint256 public immutable constant2;
    uint256 public immutable constant3;
    uint256 public immutable constant4;
    uint256 public immutable constant5;
    uint256 public immutable constant6;
    uint256 public immutable constant7;
    uint256 public immutable constant8;
    uint256 public immutable constant9;
    uint256 public immutable constant10;
    uint256 public immutable constant11;
    uint256 public immutable constant12;
    uint256 public immutable constant13;
    uint256 public immutable constant14;
    uint256 public immutable constant15;

    uint256 public immutable source0;
    uint256 public immutable source1;
    uint256 public immutable source2;
    uint256 public immutable source3;

    uint8 public immutable constantsLength;
    uint8 public immutable sourceLength;

    constructor(
        Source memory source_
    ) {
        require(source_.constants.length <= 16, "IMMUTABLE_CONSTANTS_LIMIT");
        require(source_.source.length <= 4, "IMMUTABLE_SOURCE_LIMIT");

        constant0 = 0 < source_.constants.length ? source_.constants[0] : 0;
        constant1 = 1 < source_.constants.length ? source_.constants[1] : 0;
        constant2 = 2 < source_.constants.length ? source_.constants[2] : 0;
        constant3 = 3 < source_.constants.length ? source_.constants[3] : 0;
        constant4 = 4 < source_.constants.length ? source_.constants[4] : 0;
        constant5 = 5 < source_.constants.length ? source_.constants[5] : 0;
        constant6 = 6 < source_.constants.length ? source_.constants[6] : 0;
        constant7 = 7 < source_.constants.length ? source_.constants[7] : 0;
        constant8 = 8 < source_.constants.length ? source_.constants[8] : 0;
        constant9 = 9 < source_.constants.length ? source_.constants[9] : 0;
        constant10 = 10 < source_.constants.length ? source_.constants[10] : 0;
        constant11 = 11 < source_.constants.length ? source_.constants[11] : 0;
        constant12 = 12 < source_.constants.length ? source_.constants[12] : 0;
        constant13 = 13 < source_.constants.length ? source_.constants[13] : 0;
        constant14 = 14 < source_.constants.length ? source_.constants[14] : 0;
        constant15 = 15 < source_.constants.length ? source_.constants[15] : 0;

        source0 = 0 < source_.source.length ? source_.source[0] : 0;
        source1 = 1 < source_.source.length ? source_.source[1] : 0;
        source2 = 2 < source_.source.length ? source_.source[2] : 0;
        source3 = 3 < source_.source.length ? source_.source[3] : 0;

        constantsLength = uint8(source_.constants.length);
        sourceLength = uint8(source_.source.length);
    }

    function source() internal view returns(Source memory) {
        uint256[] memory source_ = new uint256[](sourceLength);

        if (0 < sourceLength) {
            source_[0] = source0;
            if (1 < sourceLength) {
                source_[1] = source1;
                if (2 < sourceLength) {
                    source_[2] = source2;
                    if (3 < sourceLength) {
                        source_[3] = source3;
                    }
                }
            }
        }

        uint256[] memory constants_ = new uint256[](constantsLength);

        if (0 < constantsLength) {
            constants_[0] = constant0;
            if (1 < constantsLength) {
                constants_[1] = constant1;
                if (2 < constantsLength) {
                    constants_[2] = constant2;
                    if (3 < constantsLength) {
                        constants_[3] = constant3;
                        if (4 < constantsLength) {
                            constants_[4] = constant4;
                            if (5 < constantsLength) {
                                constants_[5] = constant5;
                                if (6 < constantsLength) {
                                    constants_[6] = constant6;
                                    if (7 < constantsLength) {
                                        constants_[7] = constant7;
                                        if (8 < constantsLength) {
                                            constants_[8] = constant8;
                                            if (9 < constantsLength) {
                                                constants_[9] = constant9;
                                                if (10 < constantsLength) { // solhint-disable max-line-length
                                                    constants_[10] = constant10;
                                                    if (11 < constantsLength) {
                                                        constants_[11] = constant11;
                                                        if (12 < constantsLength) {
                                                            constants_[12] = constant12;
                                                            if (13 < constantsLength) {
                                                                constants_[13] = constant13;
                                                                if (14 < constantsLength) {
                                                                    constants_[14] = constant14;
                                                                    if (15 < constantsLength) {
                                                                        constants_[15] = constant15;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        uint256[] memory arguments_ = new uint256[](0);
        return Source(source_, constants_, arguments_);
    }
}
