// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./RainVM.sol";

abstract contract ImmutableSource {
    uint256 public immutable val0;
    uint256 public immutable val1;
    uint256 public immutable val2;
    uint256 public immutable val3;
    uint256 public immutable val4;
    uint256 public immutable val5;
    uint256 public immutable val6;
    uint256 public immutable val7;
    uint256 public immutable val8;
    uint256 public immutable val9;
    uint256 public immutable val10;
    uint256 public immutable val11;
    uint256 public immutable val12;
    uint256 public immutable val13;
    uint256 public immutable val14;
    uint256 public immutable val15;

    uint256 public immutable source0;
    uint256 public immutable source1;
    uint256 public immutable source2;
    uint256 public immutable source3;

    constructor(
        Source memory source_
    ) {
        val0 = source_.vals[0];
        val1 = source_.vals[1];
        val2 = source_.vals[2];
        val3 = source_.vals[3];
        val4 = source_.vals[4];
        val5 = source_.vals[5];
        val6 = source_.vals[6];
        val7 = source_.vals[7];
        val8 = source_.vals[8];
        val9 = source_.vals[9];
        val10 = source_.vals[10];
        val11 = source_.vals[11];
        val12 = source_.vals[12];
        val13 = source_.vals[13];
        val14 = source_.vals[14];
        val15 = source_.vals[15];

        source0 = source_.source[0];
        source1 = source_.source[1];
        source2 = source_.source[2];
        source3 = source_.source[3];
    }

    function source() internal view returns(Source memory) {
        return Source([
            source0,
            source1,
            source2,
            source3
        ],
        [
            val0,
            val1,
            val2,
            val3,
            val4,
            val5,
            val6,
            val7,
            val8,
            val9,
            val10,
            val11,
            val12,
            val13,
            val14,
            val15
        ]);
    }
}
